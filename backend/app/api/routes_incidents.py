"""Active Incidents, Deployment History, and Redis-tracked SRE Runbooks endpoints."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.models import ActiveIncident, KnowledgeDocument
from app.db.session import get_db
from app.schemas.api import (
    ActiveIncidentOut,
    IncidentCreateRequest,
    IncidentStatusUpdateRequest,
)
from app.services.cache import get_cache_service

router = APIRouter(tags=["Incidents & Runbooks"])


@router.get("/incidents", response_model=list[ActiveIncidentOut])
def list_active_incidents(db: Session = Depends(get_db)) -> list[ActiveIncidentOut]:
    """List tracked production incidents ordered by trigger timestamp."""
    rows = list(
        db.scalars(select(ActiveIncident).order_by(desc(ActiveIncident.triggered_at))).all()
    )
    return [ActiveIncidentOut.model_validate(r) for r in rows]


@router.post("/incidents", response_model=ActiveIncidentOut, status_code=status.HTTP_201_CREATED)
def create_active_incident(
    payload: IncidentCreateRequest,
    db: Session = Depends(get_db),
) -> ActiveIncidentOut:
    """Declare or simulate a new active production incident."""
    now = datetime.now(UTC)
    inc = ActiveIncident(
        id=f"INC-LIVE-{uuid.uuid4().hex[:6].upper()}",
        title=payload.title,
        service=payload.service.lower().strip(),
        severity=payload.severity,
        status="investigating",
        symptom_summary=payload.symptom_summary,
        metric_spike=payload.metric_spike,
        environment=payload.environment.lower().strip(),
        triggered_at=now,
        updated_at=now,
    )
    db.add(inc)
    db.commit()
    db.refresh(inc)
    return ActiveIncidentOut.model_validate(inc)


@router.patch("/incidents/{incident_id}/status", response_model=ActiveIncidentOut)
def update_incident_status(
    incident_id: str,
    payload: IncidentStatusUpdateRequest,
    db: Session = Depends(get_db),
) -> ActiveIncidentOut:
    """Transition incident lifecycle status (investigating -> identified -> mitigated -> resolved)."""
    inc = db.get(ActiveIncident, incident_id)
    if inc is None:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found")
    inc.status = payload.status
    inc.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(inc)
    return ActiveIncidentOut.model_validate(inc)


@router.get("/deployments")
def list_deployments(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Return structured deployment timeline extracted from deployment knowledge records."""
    docs = list(
        db.scalars(
            select(KnowledgeDocument)
            .where(KnowledgeDocument.source_type == "deployment")
            .order_by(desc(KnowledgeDocument.created_at))
        ).all()
    )
    return {
        "deployments": [
            {
                "id": d.id,
                "title": d.title,
                "service": d.service,
                "version": d.version,
                "environment": d.environment,
                "deployed_at": (d.doc_metadata or {}).get("deployed_at") or d.created_at.isoformat(),
                "commit_sha": (d.doc_metadata or {}).get("commit_sha", ""),
                "author": (d.doc_metadata or {}).get("author", "ci-bot"),
                "raw_content": d.raw_content,
            }
            for d in docs
        ]
    }


@router.get("/runbooks")
def list_runbooks(db: Session = Depends(get_db)) -> dict[str, Any]:
    """List all SRE runbooks enriched with Redis ZSET hot-access scores."""
    cache = get_cache_service()
    docs = list(
        db.scalars(
            select(KnowledgeDocument).where(KnowledgeDocument.source_type == "runbook")
        ).all()
    )
    items = []
    for d in docs:
        meta = d.doc_metadata or {}
        access_count = cache.get_runbook_access_count(d.id)
        items.append(
            {
                "id": d.id,
                "title": d.title,
                "service": d.service,
                "severity": d.severity,
                "sla_minutes": int(meta.get("sla_minutes", 15)),
                "summary": meta.get("summary", d.title),
                "key_commands": meta.get("key_commands", []),
                "steps": meta.get("steps", []),
                "raw_content": d.raw_content,
                "access_count": access_count,
                "cached_in_redis": cache.get_cached_runbook(d.id) is not None,
            }
        )
    items.sort(key=lambda x: x["access_count"], reverse=True)
    return {"runbooks": items}


@router.get("/runbooks/{runbook_id}")
def get_runbook_detail(runbook_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Fetch a runbook, serving from / warming Redis cache and incrementing its hot score."""
    cache = get_cache_service()
    doc = db.get(KnowledgeDocument, runbook_id)
    if doc is None or doc.source_type != "runbook":
        raise HTTPException(status_code=404, detail=f"Runbook '{runbook_id}' not found")

    meta = doc.doc_metadata or {}
    payload = {
        "id": doc.id,
        "title": doc.title,
        "service": doc.service,
        "sla_minutes": int(meta.get("sla_minutes", 15)),
        "summary": meta.get("summary", doc.title),
        "key_commands": meta.get("key_commands", []),
        "steps": meta.get("steps", []),
        "raw_content": doc.raw_content,
    }
    new_count = cache.record_runbook_access(doc.id, payload, increment=1.0)
    return {**payload, "access_count": new_count, "cached_in_redis": True}
