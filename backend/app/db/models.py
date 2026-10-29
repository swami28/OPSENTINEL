"""SQLAlchemy 2.0 ORM models with PostgreSQL pgvector primary vector storage."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator


def utc_now() -> datetime:
    """Return timezone-aware UTC timestamp."""
    return datetime.now(UTC)


class EmbeddingVector(TypeDecorator):
    """Cross-dialect vector column: native pgvector VECTOR(dim) on PostgreSQL, JSON array on SQLite."""

    impl = JSON
    cache_ok = True

    def __init__(self, dim: int = 384, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.dim = dim

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(Vector(self.dim))
        return dialect.type_descriptor(JSON())

    def process_bind_param(self, value: Any, dialect: Any) -> Any:
        if value is None:
            return None
        if hasattr(value, "tolist"):
            return [float(x) for x in value.tolist()]
        return [float(x) for x in value]

    def process_result_value(self, value: Any, dialect: Any) -> list[float] | None:
        if value is None:
            return None
        if hasattr(value, "tolist"):
            return [float(x) for x in value.tolist()]
        return [float(x) for x in value]


class Base(DeclarativeBase):
    """Declarative base for OPSENTINEL database models."""


class KnowledgeDocument(Base):
    """Ingested operational telemetry artifact (logs, deployments, incidents, runbooks, architecture, guides)."""

    __tablename__ = "knowledge_documents"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    title: Mapped[str] = mapped_column(String(280), nullable=False)
    source_type: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    service: Mapped[str] = mapped_column(String(96), nullable=False, index=True)
    environment: Mapped[str] = mapped_column(String(48), nullable=False, default="production")
    severity: Mapped[str] = mapped_column(String(32), nullable=False, default="INFO")
    version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    raw_content: Mapped[str] = mapped_column(Text, nullable=False)
    doc_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    chunks: Mapped[list[KnowledgeChunk]] = relationship(
        "KnowledgeChunk",
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class KnowledgeChunk(Base):
    """Chunked and 384-d embedded unit indexed in PostgreSQL pgvector for RAG retrieval."""

    __tablename__ = "knowledge_chunks"
    __table_args__ = (
        Index("ix_knowledge_chunks_source_service", "source_type", "service"),
    )

    id: Mapped[str] = mapped_column(String(96), primary_key=True)
    document_id: Mapped[str] = mapped_column(
        String(80),
        ForeignKey("knowledge_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source_type: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    service: Mapped[str] = mapped_column(String(96), nullable=False, index=True)
    environment: Mapped[str] = mapped_column(String(48), nullable=False, default="production")
    severity: Mapped[str] = mapped_column(String(32), nullable=False, default="INFO")
    title: Mapped[str] = mapped_column(String(280), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    embedding: Mapped[list[float]] = mapped_column(EmbeddingVector(384), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    document: Mapped[KnowledgeDocument] = relationship("KnowledgeDocument", back_populates="chunks")


class ActiveIncident(Base):
    """Tracked production incident supporting automated AI Root Cause Analysis."""

    __tablename__ = "active_incidents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(280), nullable=False)
    service: Mapped[str] = mapped_column(String(96), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(24), nullable=False, default="SEV-1")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="investigating")
    symptom_summary: Mapped[str] = mapped_column(Text, nullable=False)
    metric_spike: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    environment: Mapped[str] = mapped_column(String(48), nullable=False, default="production")
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    latest_rca: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )


class InvestigationAudit(Base):
    """Historical audit trail of AI incident investigations and RCA runs."""

    __tablename__ = "investigation_audits"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    mode: Mapped[str] = mapped_column(String(32), nullable=False, default="investigate")
    query: Mapped[str] = mapped_column(Text, nullable=False)
    service_filter: Mapped[str | None] = mapped_column(String(96), nullable=True)
    headline_conclusion: Mapped[str] = mapped_column(Text, nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    cached: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    latency_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    response_payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
