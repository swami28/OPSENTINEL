"""System health, pgvector & Redis telemetry, cache management, and runtime LLM settings."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import ActiveIncident, InvestigationAudit
from app.db.session import get_db, get_db_status
from app.schemas.api import RuntimeLLMConfigRequest
from app.seed.corpus import seed_initial_corpus
from app.services.cache import get_cache_service
from app.services.llm_engine import get_effective_llm_info, set_runtime_llm_config
from app.services.vector_store import get_vector_store

router = APIRouter(prefix="/system", tags=["System & Telemetry"])


@router.get("/health")
def system_health() -> dict[str, Any]:
    """Liveness and dependency readiness probe."""
    settings = get_settings()
    db_info = get_db_status()
    redis_info = get_cache_service().get_status()
    overall = (
        "healthy"
        if db_info.get("status") == "healthy" and redis_info.get("status") == "healthy"
        else "degraded"
    )
    return {
        "status": overall,
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "database": db_info,
        "redis": {
            "status": redis_info.get("status"),
            "backend": redis_info.get("backend"),
        },
        "llm": get_effective_llm_info(),
    }


@router.get("/telemetry")
def system_telemetry(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Full architectural telemetry across PostgreSQL/pgvector, Redis, RAG corpus, and Incident Agent."""
    cache = get_cache_service()
    vs = get_vector_store()

    open_incidents = int(
        db.scalar(
            select(func.count(ActiveIncident.id)).where(
                ActiveIncident.status != "resolved"
            )
        )
        or 0
    )
    sev1_count = int(
        db.scalar(
            select(func.count(ActiveIncident.id)).where(
                ActiveIncident.severity == "SEV-1",
                ActiveIncident.status != "resolved",
            )
        )
        or 0
    )
    total_investigations = int(
        db.scalar(select(func.count(InvestigationAudit.id))) or 0
    )

    return {
        "database": get_db_status(),
        "redis": cache.get_status(),
        "cached_queries_preview": cache.list_cached_queries(limit=10),
        "active_sessions_preview": cache.list_sessions(limit=10),
        "corpus": vs.get_corpus_stats(db),
        "incidents_summary": {
            "open_incidents": open_incidents,
            "active_sev1": sev1_count,
            "total_investigations": total_investigations,
        },
        "llm": get_effective_llm_info(),
    }


@router.post("/cache/flush")
def flush_query_cache() -> dict[str, Any]:
    """Evict all cached RAG/RCA query results from Redis."""
    evicted = get_cache_service().invalidate_query_cache()
    return {"status": "flushed", "evicted_keys": evicted}


@router.post("/llm-config")
def update_runtime_llm_config(payload: RuntimeLLMConfigRequest) -> dict[str, Any]:
    """Update runtime OpenAI-compatible API key & model and flush cached responses."""
    set_runtime_llm_config(
        api_key=payload.openai_api_key,
        base_url=payload.openai_base_url,
        model=payload.openai_model,
    )
    get_cache_service().invalidate_query_cache()
    return {"status": "updated", "llm": get_effective_llm_info()}


@router.post("/reseed")
def reseed_demo_telemetry(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Re-seed default multi-service DevOps telemetry corpus."""
    summary = seed_initial_corpus(db, force=True)
    get_cache_service().invalidate_query_cache()
    return {"status": "reseeded", **summary}
