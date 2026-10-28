"""Multi-stage OPSENTINEL Incident Intelligence Agent orchestrator."""

from __future__ import annotations

import time
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ActiveIncident, InvestigationAudit, KnowledgeDocument
from app.schemas.api import (
    AgentTraceStep,
    InvestigationRequest,
    InvestigationResponse,
    RCARequest,
    RetrievalChecklist,
    RetrievedChunkOut,
    RunbookReference,
)
from app.services.cache import get_cache_service
from app.services.llm_engine import build_evidence_items, get_llm_engine
from app.services.log_correlator import extract_matching_log_patterns
from app.services.vector_store import get_vector_store

SERVICE_ALIASES: dict[str, tuple[str, ...]] = {
    "payment-api": ("payment-api", "payment api", "payments api", "/payments/charge", "payment service"),
    "auth-gateway": ("auth-gateway", "auth gateway", "auth service", "login", "401", "session drop"),
    "checkout-service": ("checkout-service", "checkout service", "checkout", "oomkilled", "exit code 137", "promo"),
    "order-worker": ("order-worker", "order worker", "orders.fulfilled", "consumer lag", "kafka lag"),
}


def _infer_target_service(
    db: Session,
    query: str,
    explicit_service: str | None,
    session_last_service: str | None,
) -> str | None:
    """Resolve target microservice from explicit filter, query entities, or multi-turn session state."""
    if explicit_service and explicit_service.lower() not in ("", "all"):
        return explicit_service.lower().strip()

    q_lower = query.lower()
    # Check all dynamically ingested service names first
    known_services = [
        row[0]
        for row in db.execute(select(KnowledgeDocument.service).distinct()).all()
        if row[0] and row[0] != "platform-core"
    ]
    for svc in known_services:
        if svc in q_lower or svc.replace("-", " ") in q_lower:
            return svc

    for canonical, aliases in SERVICE_ALIASES.items():
        if any(alias in q_lower for alias in aliases):
            return canonical

    # Follow-up pronoun cue inherits active session's service context
    if session_last_service and any(
        cue in q_lower for cue in ("that", "it", "this service", "roll back", "rollback", "fix it")
    ):
        return session_last_service
    return None


def _resolve_runbook_reference(
    db: Session,
    retrieved_chunks: list[RetrievedChunkOut],
) -> RunbookReference | None:
    """Resolve full RunbookReference via Redis Hot-Runbook Cache + DB fallback and increment hot score."""
    cache = get_cache_service()
    rb_chunks = [c for c in retrieved_chunks if c.source_type == "runbook"]
    if not rb_chunks:
        return None

    rb_doc_id = rb_chunks[0].document_id
    cached_rb = cache.get_cached_runbook(rb_doc_id)
    if cached_rb:
        count = cache.record_runbook_access(rb_doc_id, cached_rb, increment=1.0)
        cached_rb["access_count"] = count
        return RunbookReference(**cached_rb)

    doc = db.get(KnowledgeDocument, rb_doc_id)
    if doc is None:
        return None

    meta = doc.doc_metadata or {}
    steps = list(meta.get("steps", []))
    if not steps:
        steps = [
            ln.lstrip("-0123456789. ").strip()
            for ln in doc.raw_content.splitlines()
            if ln.strip().startswith(("-", "1.", "2.", "3.", "4."))
        ][:6]

    payload = {
        "id": doc.id,
        "title": doc.title,
        "service": doc.service,
        "sla_minutes": int(meta.get("sla_minutes", 15)),
        "summary": str(meta.get("summary") or doc.title),
        "key_commands": list(meta.get("key_commands", [])),
        "steps": steps,
        "access_count": 1,
    }
    count = cache.record_runbook_access(doc.id, payload, increment=1.0)
    payload["access_count"] = count
    return RunbookReference(**payload)


class IncidentAgentService:
    """End-to-end agent orchestrating Redis state, pgvector RAG, log correlation, and RCA synthesis."""

    def investigate(
        self,
        db: Session,
        req: InvestigationRequest,
        *,
        mode: str = "investigate",
    ) -> InvestigationResponse:
        overall_start = time.perf_counter()
        trace: list[AgentTraceStep] = []
        cache = get_cache_service()
        vector_store = get_vector_store()
        llm_engine = get_llm_engine()

        session_id = req.session_id or f"sess-{uuid.uuid4().hex[:10]}"

        # Stage 1: Redis Session Context & Query Cache Check
        t0 = time.perf_counter()
        session_ctx = cache.get_session(session_id)
        inferred_service = _infer_target_service(
            db,
            req.query,
            req.service_filter,
            session_ctx.get("last_service"),
        )
        cache_key = cache.build_query_key(
            mode=mode,
            query=req.query,
            service_filter=inferred_service,
            source_types=list(req.source_types) if req.source_types else None,
        )

        if not req.bypass_cache:
            cached_payload = cache.get_cached_query(cache_key)
            if cached_payload is not None:
                elapsed_ms = round((time.perf_counter() - overall_start) * 1000.0, 2)
                cached_payload["cached"] = True
                cached_payload["session_id"] = session_id
                cached_payload["latency_ms"] = elapsed_ms
                cached_payload["agent_trace"] = [
                    {
                        "stage": "1. Redis Query Cache",
                        "component": "Redis",
                        "detail": f"Cache HIT ({cache_key[-10:]}) — served pre-computed RCA in {elapsed_ms}ms",
                        "duration_ms": elapsed_ms,
                        "status": "cache_hit",
                    }
                ]
                return InvestigationResponse(**cached_payload)

        t_redis_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        trace.append(
            AgentTraceStep(
                stage="1. Session & Cache Lookup",
                component="Redis",
                detail=(
                    f"Session `{session_id}` ({len(session_ctx.get('turns', []))} prior turns); "
                    f"cache miss -> executing fresh RAG pipeline"
                ),
                duration_ms=t_redis_ms,
            )
        )

        # Stage 2: Query Planning & Entity Resolution
        t1 = time.perf_counter()
        effective_query = req.query
        if inferred_service and inferred_service not in req.query.lower():
            effective_query = f"{req.query} (service: {inferred_service})"
        t_plan_ms = round((time.perf_counter() - t1) * 1000.0, 2)
        trace.append(
            AgentTraceStep(
                stage="2. Incident Query Planner",
                component="Incident Agent",
                detail=f"Target service={inferred_service or 'multi-service'} | Stratified 7-source retrieval plan",
                duration_ms=t_plan_ms,
            )
        )

        # Stage 3: Stratified Hybrid pgvector Retrieval
        t2 = time.perf_counter()
        retrieved_chunks = vector_store.stratified_incident_retrieve(
            db,
            effective_query,
            service=inferred_service,
            source_types=list(req.source_types) if req.source_types else None,
            top_k=req.top_k,
        )
        t_rag_ms = round((time.perf_counter() - t2) * 1000.0, 2)
        present_sources = {c.source_type for c in retrieved_chunks}
        checklist = RetrievalChecklist(
            deployment_logs="deployment" in present_sources,
            api_and_error_logs=bool(present_sources.intersection({"application_log", "error_log"})),
            previous_incidents="incident" in present_sources,
            runbooks="runbook" in present_sources,
            architecture_docs="architecture" in present_sources,
            troubleshooting_guides="troubleshooting" in present_sources,
        )
        trace.append(
            AgentTraceStep(
                stage="3. Hybrid RAG Vector Search",
                component="PostgreSQL + pgvector",
                detail=f"Retrieved {len(retrieved_chunks)} chunks across {len(present_sources)} telemetry silos",
                duration_ms=t_rag_ms,
            )
        )

        # Stage 4: Log Pattern Correlation & Runbook Hot-Lookup
        t3 = time.perf_counter()
        log_patterns = extract_matching_log_patterns(retrieved_chunks)
        matched_runbook = _resolve_runbook_reference(db, retrieved_chunks)
        t_corr_ms = round((time.perf_counter() - t3) * 1000.0, 2)
        trace.append(
            AgentTraceStep(
                stage="4. Log Correlator & Runbook Matcher",
                component="RAG Pipeline + Redis ZSET",
                detail=(
                    f"Extracted {len(log_patterns)} matching log pattern(s); "
                    f"matched runbook `{matched_runbook.id if matched_runbook else 'none'}`"
                ),
                duration_ms=t_corr_ms,
            )
        )

        # Stage 5: Causal Root Cause Synthesis (LLM / Evidence Engine)
        t4 = time.perf_counter()
        synthesis, llm_mode = llm_engine.synthesize(
            query=req.query,
            chunks=retrieved_chunks,
            log_patterns=log_patterns,
            matched_runbook=matched_runbook,
            session_context=session_ctx,
        )
        evidence_items = build_evidence_items(retrieved_chunks)
        t_llm_ms = round((time.perf_counter() - t4) * 1000.0, 2)
        trace.append(
            AgentTraceStep(
                stage="5. Root Cause Synthesis",
                component=llm_mode,
                detail=f"Generated structured RCA (confidence={synthesis['confidence_score']:.0%})",
                duration_ms=t_llm_ms,
            )
        )

        total_latency_ms = round((time.perf_counter() - overall_start) * 1000.0, 2)
        investigation_id = f"INV-{uuid.uuid4().hex[:10].upper()}"
        now_dt = datetime.now(UTC)

        response = InvestigationResponse(
            investigation_id=investigation_id,
            session_id=session_id,
            mode="auto_rca" if mode == "auto_rca" else "investigate",
            query=req.query,
            headline_conclusion=synthesis["headline_conclusion"],
            confidence_score=synthesis["confidence_score"],
            severity=synthesis["severity"],
            affected_services=synthesis["affected_services"],
            retrieval_checklist=checklist,
            possible_causes=synthesis["possible_causes"],
            matching_log_patterns=log_patterns,
            evidence=evidence_items,
            recommended_investigation=synthesis["recommended_investigation"],
            suggested_fix=synthesis["suggested_fix"],
            relevant_runbook=matched_runbook,
            retrieved_chunks=retrieved_chunks,
            agent_trace=trace,
            cached=False,
            latency_ms=total_latency_ms,
            llm_mode=llm_mode,
            generated_at=now_dt,
        )

        # Persist audit log + update Redis session + cache query response
        serialized = response.model_dump(mode="json")
        cache.set_cached_query(cache_key, serialized)
        cache.append_session_turn(
            session_id,
            query=req.query,
            headline_conclusion=response.headline_conclusion,
            service=inferred_service or (response.affected_services[0] if response.affected_services else None),
            confidence_score=response.confidence_score,
            runbook_id=matched_runbook.id if matched_runbook else None,
        )

        audit = InvestigationAudit(
            id=investigation_id,
            session_id=session_id,
            mode=response.mode,
            query=req.query,
            service_filter=inferred_service,
            headline_conclusion=response.headline_conclusion,
            confidence_score=response.confidence_score,
            cached=False,
            latency_ms=total_latency_ms,
            response_payload=serialized,
        )
        db.add(audit)
        db.commit()

        return response

    def run_auto_rca(self, db: Session, req: RCARequest) -> InvestigationResponse:
        """Execute automated AI Root Cause Analysis for a tracked or inline production incident."""
        incident: ActiveIncident | None = None
        if req.incident_id:
            incident = db.get(ActiveIncident, req.incident_id)
            if incident is None:
                raise HTTPException(status_code=404, detail=f"Incident '{req.incident_id}' not found")
            synthesized_query = (
                f"Perform Root Cause Analysis for incident {incident.id} ({incident.title}) "
                f"on service {incident.service}: {incident.symptom_summary}. "
                f"Observed metric anomaly: {incident.metric_spike}."
            )
            target_service = incident.service
        else:
            if not req.symptom_summary and not req.title:
                raise HTTPException(
                    status_code=422,
                    detail="Provide either `incident_id` or `title`/`symptom_summary` for Auto-RCA.",
                )
            synthesized_query = (
                f"Perform Root Cause Analysis for {req.title or 'Production Incident'} "
                f"on {req.service or 'service'}: {req.symptom_summary or ''} {req.metric_spike or ''}"
            ).strip()
            target_service = req.service

        inv_req = InvestigationRequest(
            query=synthesized_query,
            session_id=f"rca-{req.incident_id.lower()}" if req.incident_id else None,
            service_filter=target_service,
            top_k=12,
            bypass_cache=req.bypass_cache,
        )
        result = self.investigate(db, inv_req, mode="auto_rca")

        if incident is not None:
            incident.latest_rca = result.model_dump(mode="json")
            if incident.status == "investigating":
                incident.status = "identified"
            incident.updated_at = datetime.now(UTC)
            db.commit()

        return result


_agent_service: IncidentAgentService | None = None


def get_incident_agent() -> IncidentAgentService:
    """Singleton accessor for IncidentAgentService."""
    global _agent_service
    if _agent_service is None:
        _agent_service = IncidentAgentService()
    return _agent_service
