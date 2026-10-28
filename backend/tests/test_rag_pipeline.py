"""Unit & integration tests for embeddings, source-aware chunking, and pgvector RAG retrieval."""

from __future__ import annotations

import math

import numpy as np
from fastapi.testclient import TestClient

from app.services.chunker import chunk_telemetry_document
from app.services.embeddings import get_embedding_service


def test_embedding_dimension_and_unit_norm() -> None:
    embedder = get_embedding_service()
    vec = embedder.embed_text(
        "Why did the payment API start returning 500 errors after the latest deployment?"
    )
    assert len(vec) == 384
    norm = math.sqrt(sum(x * x for x in vec))
    assert abs(norm - 1.0) < 1e-4


def test_semantic_devops_alignment() -> None:
    embedder = get_embedding_service()
    q = np.asarray(
        embedder.embed_text("payment API returning HTTP 500 after latest deployment"),
        dtype=np.float32,
    )
    relevant = np.asarray(
        embedder.embed_text(
            "ERROR payment-api HTTP 500 sqlalchemy.exc.TimeoutError QueuePool limit after v2.15.0 deployment"
        ),
        dtype=np.float32,
    )
    unrelated = np.asarray(
        embedder.embed_text("CSS stylesheet dark mode typography spacing adjustments"),
        dtype=np.float32,
    )
    assert float(q @ relevant) > float(q @ unrelated) + 0.25


def test_source_aware_chunking_for_logs_and_runbooks() -> None:
    log_lines = "\n".join(
        f"2026-10-28T14:08:{i:02d}Z ERROR payment-api line={i} HTTP 500 QueuePool timeout"
        for i in range(22)
    )
    log_chunks = chunk_telemetry_document(
        title="Payment Logs",
        source_type="error_log",
        service="payment-api",
        environment="production",
        severity="ERROR",
        raw_content=log_lines,
    )
    assert len(log_chunks) >= 2
    assert "Service: payment-api" in log_chunks[0].embed_input

    runbook_md = "## Step 1: Triage\nCheck pg_stat_activity.\n\n## Step 2: Rollback\nRun helm rollback."
    rb_chunks = chunk_telemetry_document(
        title="Pool Runbook",
        source_type="runbook",
        service="payment-api",
        environment="production",
        severity="CRITICAL",
        raw_content=runbook_md,
    )
    assert len(rb_chunks) == 2


def test_all_seven_telemetry_sources_seeded_and_searchable(client: TestClient) -> None:
    telemetry = client.get("/api/v1/system/telemetry").json()
    docs_by_source = telemetry["corpus"]["documents_by_source"]
    expected_sources = {
        "application_log",
        "error_log",
        "deployment",
        "incident",
        "runbook",
        "architecture",
        "troubleshooting",
    }
    assert expected_sources.issubset(set(docs_by_source.keys()))
    assert telemetry["corpus"]["total_chunks"] >= 18

    search_resp = client.post(
        "/api/v1/knowledge/search",
        json={
            "query": "QueuePool limit of size 15 payment-api 500",
            "service": "payment-api",
            "top_k": 5,
        },
    )
    assert search_resp.status_code == 200
    hits = search_resp.json()
    assert len(hits) >= 3
    assert hits[0]["service"] == "payment-api"
    assert hits[0]["hybrid_score"] > 0.35
