"""Incident Intelligence Agent & Automated Root Cause Analysis endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.models import InvestigationAudit
from app.db.session import get_db
from app.schemas.api import InvestigationRequest, InvestigationResponse, RCARequest
from app.services.cache import get_cache_service
from app.services.incident_agent import get_incident_agent

router = APIRouter(tags=["Incident Agent"])


@router.post("/investigate", response_model=InvestigationResponse)
def investigate_incident(
    payload: InvestigationRequest,
    db: Session = Depends(get_db),
) -> InvestigationResponse:
    """Execute natural-language DevOps incident investigation over multi-source RAG."""
    agent = get_incident_agent()
    return agent.investigate(db, payload, mode="investigate")


@router.post("/rca", response_model=InvestigationResponse)
def run_automated_rca(
    payload: RCARequest,
    db: Session = Depends(get_db),
) -> InvestigationResponse:
    """Execute automated AI Root Cause Analysis for an active or ad-hoc production incident."""
    agent = get_incident_agent()
    return agent.run_auto_rca(db, payload)


@router.get("/sessions")
def list_incident_sessions(limit: int = Query(default=12, ge=1, le=50)) -> dict[str, Any]:
    """List active Redis-backed incident investigation sessions."""
    cache = get_cache_service()
    return {"sessions": cache.list_sessions(limit=limit)}


@router.get("/sessions/{session_id}")
def get_incident_session(session_id: str) -> dict[str, Any]:
    """Retrieve multi-turn conversation history for a Redis incident session."""
    cache = get_cache_service()
    return cache.get_session(session_id)


@router.get("/history")
def list_investigation_history(
    limit: int = Query(default=15, ge=1, le=50),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return recent persisted AI investigation audit records."""
    rows = list(
        db.scalars(
            select(InvestigationAudit)
            .order_by(desc(InvestigationAudit.created_at))
            .limit(limit)
        ).all()
    )
    return {
        "items": [
            {
                "id": r.id,
                "session_id": r.session_id,
                "mode": r.mode,
                "query": r.query,
                "service_filter": r.service_filter,
                "headline_conclusion": r.headline_conclusion,
                "confidence_score": r.confidence_score,
                "cached": r.cached,
                "latency_ms": r.latency_ms,
                "created_at": r.created_at,
            }
            for r in rows
        ]
    }
