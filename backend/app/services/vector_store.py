"""Hybrid Vector Store & RAG Retrieval Pipeline backed by PostgreSQL pgvector."""

from __future__ import annotations

import json
import uuid
from typing import Any

import numpy as np
from sqlalchemy import bindparam, func, select, text
from sqlalchemy.orm import Session

from app.db.models import KnowledgeChunk, KnowledgeDocument
from app.schemas.api import KnowledgeIngestRequest, RetrievedChunkOut
from app.services.cache import get_cache_service
from app.services.chunker import chunk_telemetry_document
from app.services.embeddings import get_embedding_service, tokenize_devops_text


def _compute_lexical_overlap(query_tokens: set[str], doc_text: str, title: str, service: str) -> float:
    """Compute normalized BM25-inspired token overlap score for hybrid retrieval."""
    if not query_tokens:
        return 0.0
    doc_tokens = set(tokenize_devops_text(f"{title} {service} {doc_text}"))
    if not doc_tokens:
        return 0.0
    matched = query_tokens.intersection(doc_tokens)
    if not matched:
        return 0.0
    recall = len(matched) / len(query_tokens)
    precision = len(matched) / (len(doc_tokens) ** 0.35)
    return float(min(1.0, 0.72 * recall + 0.28 * min(1.0, precision)))


class VectorStoreService:
    """Manages ingestion, chunking, 384-d embedding, and hybrid pgvector retrieval."""

    def ingest_document(
        self,
        db: Session,
        req: KnowledgeIngestRequest,
        *,
        invalidate_cache: bool = True,
    ) -> tuple[KnowledgeDocument, int]:
        """Chunk, embed, and persist a telemetry document into PostgreSQL + pgvector."""
        doc_id = req.id or f"DOC-{req.source_type[:4].upper()}-{uuid.uuid4().hex[:8].upper()}"

        existing = db.get(KnowledgeDocument, doc_id)
        if existing is not None:
            db.delete(existing)
            db.flush()

        doc = KnowledgeDocument(
            id=doc_id,
            title=req.title,
            source_type=req.source_type,
            service=req.service.lower().strip(),
            environment=req.environment.lower().strip(),
            severity=req.severity.upper().strip(),
            version=req.version,
            raw_content=req.raw_content,
            doc_metadata=req.metadata,
        )
        db.add(doc)
        db.flush()

        drafts = chunk_telemetry_document(
            title=doc.title,
            source_type=doc.source_type,
            service=doc.service,
            environment=doc.environment,
            severity=doc.severity,
            raw_content=doc.raw_content,
            base_metadata={
                **req.metadata,
                "version": req.version,
                "document_id": doc_id,
            },
        )

        embedder = get_embedding_service()
        embeddings = embedder.embed_batch([d.embed_input for d in drafts])

        for draft, vec in zip(drafts, embeddings, strict=True):
            chunk = KnowledgeChunk(
                id=f"{doc_id}#c{draft.chunk_index}",
                document_id=doc_id,
                chunk_index=draft.chunk_index,
                source_type=doc.source_type,
                service=doc.service,
                environment=doc.environment,
                severity=doc.severity,
                title=doc.title,
                content=draft.content,
                chunk_metadata=draft.metadata,
                embedding=vec,
            )
            db.add(chunk)

        db.commit()
        db.refresh(doc)

        if invalidate_cache:
            cache = get_cache_service()
            cache.invalidate_query_cache()
            if doc.source_type == "runbook":
                cache.record_runbook_access(
                    doc.id,
                    {
                        "id": doc.id,
                        "title": doc.title,
                        "service": doc.service,
                        "sla_minutes": int(doc.doc_metadata.get("sla_minutes", 15)),
                        "summary": doc.doc_metadata.get("summary", doc.title),
                        "key_commands": doc.doc_metadata.get("key_commands", []),
                        "steps": doc.doc_metadata.get("steps", []),
                    },
                    increment=0.0,
                )

        return doc, len(drafts)

    def hybrid_search(
        self,
        db: Session,
        query: str,
        *,
        service: str | None = None,
        source_types: list[str] | None = None,
        top_k: int = 10,
    ) -> list[RetrievedChunkOut]:
        """Execute hybrid dense pgvector similarity + lexical overlap retrieval."""
        embedder = get_embedding_service()
        q_vec = embedder.embed_text(query)
        q_tokens = set(tokenize_devops_text(query))
        normalized_service = service.lower().strip() if service and service.lower() != "all" else None

        dialect = db.get_bind().dialect.name
        candidates: list[dict[str, Any]] = []

        if dialect == "postgresql":
            vec_literal = "[" + ",".join(f"{v:.6f}" for v in q_vec) + "]"
            where_clauses = ["1=1"]
            params: dict[str, Any] = {
                "q_vec": vec_literal,
                "limit_k": max(top_k * 4, 28),
            }
            if normalized_service:
                where_clauses.append("(service = :service OR service = 'platform-core')")
                params["service"] = normalized_service
            if source_types:
                where_clauses.append("source_type IN :source_types")
                params["source_types"] = list(source_types)

            sql_str = (
                "SELECT id, document_id, title, source_type, service, environment, severity, "
                "content, chunk_metadata, "
                "1 - (embedding <=> CAST(:q_vec AS vector)) AS vector_score "
                f"FROM knowledge_chunks WHERE {' AND '.join(where_clauses)} "
                "ORDER BY embedding <=> CAST(:q_vec AS vector) "
                "LIMIT :limit_k"
            )
            stmt = text(sql_str)
            if source_types:
                stmt = stmt.bindparams(bindparam("source_types", expanding=True))

            rows = db.execute(stmt, params).mappings().all()
            for r in rows:
                meta = r["chunk_metadata"]
                if isinstance(meta, str):
                    meta = json.loads(meta)
                candidates.append(
                    {
                        "chunk_id": r["id"],
                        "document_id": r["document_id"],
                        "title": r["title"],
                        "source_type": r["source_type"],
                        "service": r["service"],
                        "environment": r["environment"],
                        "severity": r["severity"],
                        "content": r["content"],
                        "metadata": meta or {},
                        "vector_score": float(max(0.0, min(1.0, r["vector_score"]))),
                    }
                )
        else:
            orm_stmt = select(KnowledgeChunk)
            if normalized_service:
                orm_stmt = orm_stmt.where(
                    KnowledgeChunk.service.in_([normalized_service, "platform-core"])
                )
            if source_types:
                orm_stmt = orm_stmt.where(KnowledgeChunk.source_type.in_(source_types))

            chunk_rows = list(db.scalars(orm_stmt).all())
            if not chunk_rows:
                return []

            q_arr = np.asarray(q_vec, dtype=np.float32)
            mat = np.asarray([c.embedding for c in chunk_rows], dtype=np.float32)
            sim_scores = mat @ q_arr

            for chunk, vscore in zip(chunk_rows, sim_scores.tolist(), strict=True):
                candidates.append(
                    {
                        "chunk_id": chunk.id,
                        "document_id": chunk.document_id,
                        "title": chunk.title,
                        "source_type": chunk.source_type,
                        "service": chunk.service,
                        "environment": chunk.environment,
                        "severity": chunk.severity,
                        "content": chunk.content,
                        "metadata": chunk.chunk_metadata or {},
                        "vector_score": float(max(0.0, min(1.0, vscore))),
                    }
                )

        # Hybrid scoring: dense semantic + lexical overlap + explicit service mention boost
        query_lower = query.lower()
        scored_results: list[RetrievedChunkOut] = []
        for item in candidates:
            lex = _compute_lexical_overlap(
                q_tokens,
                item["content"],
                item["title"],
                item["service"],
            )
            svc_boost = 0.08 if item["service"] in query_lower else 0.0
            # Also match "payment api" -> "payment-api"
            if svc_boost == 0.0 and item["service"].replace("-", " ") in query_lower:
                svc_boost = 0.08

            hybrid = min(1.0, 0.64 * item["vector_score"] + 0.36 * lex + svc_boost)
            scored_results.append(
                RetrievedChunkOut(
                    chunk_id=item["chunk_id"],
                    document_id=item["document_id"],
                    title=item["title"],
                    source_type=item["source_type"],
                    service=item["service"],
                    environment=item["environment"],
                    severity=item["severity"],
                    content=item["content"],
                    vector_score=round(item["vector_score"], 4),
                    lexical_score=round(lex, 4),
                    hybrid_score=round(hybrid, 4),
                    metadata=item["metadata"],
                )
            )

        scored_results.sort(key=lambda c: c.hybrid_score, reverse=True)
        return scored_results[:top_k]

    def stratified_incident_retrieve(
        self,
        db: Session,
        query: str,
        *,
        service: str | None = None,
        source_types: list[str] | None = None,
        top_k: int = 12,
    ) -> list[RetrievedChunkOut]:
        """Retrieve balanced evidence across Logs, Deployments, Incidents, Runbooks, and Architecture."""
        if source_types:
            return self.hybrid_search(
                db,
                query,
                service=service,
                source_types=source_types,
                top_k=top_k,
            )

        buckets: list[tuple[list[str], int]] = [
            (["error_log", "application_log"], 4),
            (["deployment"], 2),
            (["incident"], 2),
            (["runbook", "troubleshooting"], 3),
            (["architecture"], 2),
        ]

        merged: dict[str, RetrievedChunkOut] = {}
        for bucket_sources, k_bucket in buckets:
            hits = self.hybrid_search(
                db,
                query,
                service=service,
                source_types=bucket_sources,
                top_k=k_bucket,
            )
            for h in hits:
                if h.hybrid_score >= 0.12:
                    merged[h.chunk_id] = h

        # Supplement with global top-k search to ensure highest relevance items aren't missed
        global_hits = self.hybrid_search(db, query, service=service, top_k=top_k)
        for h in global_hits:
            if h.chunk_id not in merged:
                merged[h.chunk_id] = h

        ordered = sorted(merged.values(), key=lambda c: c.hybrid_score, reverse=True)
        return ordered[:top_k]

    def get_corpus_stats(self, db: Session) -> dict[str, Any]:
        """Aggregate document and vector chunk counts grouped by telemetry source_type."""
        doc_counts = dict(
            db.execute(
                select(KnowledgeDocument.source_type, func.count(KnowledgeDocument.id)).group_by(
                    KnowledgeDocument.source_type
                )
            ).all()
        )
        chunk_counts = dict(
            db.execute(
                select(KnowledgeChunk.source_type, func.count(KnowledgeChunk.id)).group_by(
                    KnowledgeChunk.source_type
                )
            ).all()
        )
        services = sorted(
            {
                row[0]
                for row in db.execute(select(KnowledgeDocument.service).distinct()).all()
                if row[0]
            }
        )
        return {
            "total_documents": int(sum(doc_counts.values())),
            "total_chunks": int(sum(chunk_counts.values())),
            "documents_by_source": doc_counts,
            "chunks_by_source": chunk_counts,
            "indexed_services": services,
        }


_vector_store: VectorStoreService | None = None


def get_vector_store() -> VectorStoreService:
    """Singleton accessor for VectorStoreService."""
    global _vector_store
    if _vector_store is None:
        _vector_store = VectorStoreService()
    return _vector_store
