"""RAG Knowledge Base ingestion, browsing, and pgvector semantic search endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.db.models import KnowledgeChunk, KnowledgeDocument
from app.db.session import get_db
from app.schemas.api import (
    KnowledgeDocumentOut,
    KnowledgeIngestRequest,
    RetrievedChunkOut,
    SemanticSearchRequest,
)
from app.services.cache import get_cache_service
from app.services.vector_store import get_vector_store

router = APIRouter(prefix="/knowledge", tags=["RAG Knowledge Base"])


@router.get("", response_model=list[KnowledgeDocumentOut])
def list_knowledge_documents(
    source_type: str | None = Query(default=None),
    service: str | None = Query(default=None),
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[KnowledgeDocumentOut]:
    """List ingested operational telemetry artifacts with optional filters."""
    stmt = select(KnowledgeDocument).order_by(desc(KnowledgeDocument.created_at))
    if source_type and source_type != "all":
        stmt = stmt.where(KnowledgeDocument.source_type == source_type)
    if service and service != "all":
        stmt = stmt.where(KnowledgeDocument.service == service.lower().strip())

    docs = list(db.scalars(stmt).all())
    if q:
        q_lower = q.lower().strip()
        docs = [
            d
            for d in docs
            if q_lower in d.title.lower()
            or q_lower in d.raw_content.lower()
            or q_lower in d.service.lower()
            or q_lower in d.id.lower()
        ]

    chunk_counts = dict(
        db.execute(
            select(KnowledgeChunk.document_id, func.count(KnowledgeChunk.id)).group_by(
                KnowledgeChunk.document_id
            )
        ).all()
    )

    return [
        KnowledgeDocumentOut(
            id=d.id,
            title=d.title,
            source_type=d.source_type,
            service=d.service,
            environment=d.environment,
            severity=d.severity,
            version=d.version,
            raw_content=d.raw_content,
            doc_metadata=d.doc_metadata or {},
            chunk_count=int(chunk_counts.get(d.id, 0)),
            created_at=d.created_at,
        )
        for d in docs
    ]


@router.post("", response_model=KnowledgeDocumentOut, status_code=status.HTTP_201_CREATED)
def ingest_knowledge_document(
    payload: KnowledgeIngestRequest,
    db: Session = Depends(get_db),
) -> KnowledgeDocumentOut:
    """Chunk, 384-d embed, and index a new log stream, deployment, incident, runbook, or doc."""
    vs = get_vector_store()
    doc, n_chunks = vs.ingest_document(db, payload, invalidate_cache=True)
    return KnowledgeDocumentOut(
        id=doc.id,
        title=doc.title,
        source_type=doc.source_type,
        service=doc.service,
        environment=doc.environment,
        severity=doc.severity,
        version=doc.version,
        raw_content=doc.raw_content,
        doc_metadata=doc.doc_metadata or {},
        chunk_count=n_chunks,
        created_at=doc.created_at,
    )


@router.delete("/{doc_id}")
def delete_knowledge_document(doc_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Delete a knowledge document and cascade-remove its pgvector chunks."""
    doc = db.get(KnowledgeDocument, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")
    db.delete(doc)
    db.commit()
    evicted = get_cache_service().invalidate_query_cache()
    return {"deleted": doc_id, "evicted_cached_queries": evicted}


@router.post("/search", response_model=list[RetrievedChunkOut])
def semantic_search_knowledge(
    payload: SemanticSearchRequest,
    db: Session = Depends(get_db),
) -> list[RetrievedChunkOut]:
    """Execute direct hybrid pgvector + lexical search for RAG pipeline inspection."""
    vs = get_vector_store()
    return vs.hybrid_search(
        db,
        payload.query,
        service=payload.service,
        source_types=list(payload.source_types) if payload.source_types else None,
        top_k=payload.top_k,
    )
