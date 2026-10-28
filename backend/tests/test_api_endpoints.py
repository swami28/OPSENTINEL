"""API integration tests for ingestion, runbook hot-caching, incidents, and system health."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_deployments_and_runbook_hot_counter(client: TestClient) -> None:
    health = client.get("/api/v1/system/health")
    assert health.status_code == 200
    assert health.json()["status"] == "healthy"

    deps = client.get("/api/v1/deployments")
    assert deps.status_code == 200
    assert len(deps.json()["deployments"]) >= 4

    rb_before = client.get("/api/v1/runbooks/RB-DB-POOL-001").json()
    rb_after = client.get("/api/v1/runbooks/RB-DB-POOL-001").json()
    assert rb_after["access_count"] == rb_before["access_count"] + 1


def test_live_custom_telemetry_ingestion_and_investigation(client: TestClient) -> None:
    # Ingest custom error log + custom runbook for a brand-new microservice `inventory-api`
    log_ingest = client.post(
        "/api/v1/knowledge",
        json={
            "id": "LOG-INV-CUSTOM-01",
            "title": "Error Logs — inventory-api DeadlockDetectedError on stock reservation",
            "source_type": "error_log",
            "service": "inventory-api",
            "environment": "production",
            "severity": "ERROR",
            "version": "v1.4.0",
            "raw_content": (
                "2026-10-28T15:01:02Z ERROR inventory-api stock.reserve: "
                "DeadlockDetectedError updating sku_locks in unsorted SKU order (occurrences=31)\n"
                "2026-10-28T15:01:05Z WARN inventory-api tx.retry: "
                "Retrying reservation batch after lock contention duration=920ms"
            ),
        },
    )
    assert log_ingest.status_code == 201
    assert log_ingest.json()["chunk_count"] >= 1

    rb_ingest = client.post(
        "/api/v1/knowledge",
        json={
            "id": "RB-INV-LOCK-099",
            "title": "Runbook: inventory-api SKU Lock Ordering Deadlock Mitigation",
            "source_type": "runbook",
            "service": "inventory-api",
            "environment": "production",
            "severity": "ERROR",
            "raw_content": "## Triage\nSort SKU IDs ascending prior to SELECT FOR UPDATE.",
            "metadata": {
                "sla_minutes": 15,
                "summary": "Sort SKU locks deterministically to prevent DeadlockDetectedError.",
                "key_commands": ["kubectl rollout undo deployment/inventory-api -n prod-inventory"],
                "steps": ["Roll back inventory-api v1.4.0", "Sort SKU list ascending before row lock"],
            },
        },
    )
    assert rb_ingest.status_code == 201

    inv_resp = client.post(
        "/api/v1/investigate",
        json={
            "query": "Why is inventory-api failing with DeadlockDetectedError on stock reservation?",
            "bypass_cache": True,
        },
    )
    assert inv_resp.status_code == 200
    body = inv_resp.json()
    assert "inventory-api" in body["affected_services"]
    assert body["relevant_runbook"]["id"] == "RB-INV-LOCK-099"

    # Clean up custom docs
    del_resp = client.delete("/api/v1/knowledge/LOG-INV-CUSTOM-01")
    assert del_resp.status_code == 200
    client.delete("/api/v1/knowledge/RB-INV-LOCK-099")


def test_declare_incident_and_transition_status(client: TestClient) -> None:
    created = client.post(
        "/api/v1/incidents",
        json={
            "title": "Payment API Elevated 500s in EU-Central",
            "service": "payment-api",
            "severity": "SEV-1",
            "symptom_summary": "500 errors spiked 250% after config rollout",
            "metric_spike": "+250% 500s",
        },
    )
    assert created.status_code == 201
    inc_id = created.json()["id"]

    patched = client.patch(
        f"/api/v1/incidents/{inc_id}/status",
        json={"status": "mitigated"},
    )
    assert patched.status_code == 200
    assert patched.json()["status"] == "mitigated"


def test_knowledge_listing_runbooks_sessions_history_and_auth_scenario(client: TestClient) -> None:
    auth_inv = client.post(
        "/api/v1/investigate",
        json={
            "query": "Why are users getting intermittent 401 Unauthorized errors on auth-gateway?",
            "session_id": "sess-auth-check",
            "bypass_cache": True,
        },
    )
    assert auth_inv.status_code == 200
    assert "401" in auth_inv.json()["headline_conclusion"]
    assert auth_inv.json()["relevant_runbook"]["id"] == "RB-REDIS-TLS-002"

    docs = client.get("/api/v1/knowledge?source_type=runbook&q=pool").json()
    assert len(docs) >= 1
    assert docs[0]["id"] == "RB-DB-POOL-001"

    runbooks = client.get("/api/v1/runbooks").json()
    assert len(runbooks["runbooks"]) >= 4

    sessions = client.get("/api/v1/sessions").json()
    assert len(sessions["sessions"]) >= 1

    session_detail = client.get("/api/v1/sessions/sess-auth-check").json()
    assert session_detail["session_id"] == "sess-auth-check"

    history = client.get("/api/v1/history").json()
    assert len(history["items"]) >= 1

