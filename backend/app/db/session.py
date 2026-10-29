"""Database engine initialization, pgvector extension provisioning, and session lifecycle."""

from __future__ import annotations

import logging
from collections.abc import Generator
from typing import Any

from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.db.models import Base

logger = logging.getLogger(__name__)

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None
_active_backend: str = "uninitialized"


def _attach_sqlite_pragmas(engine: Engine) -> None:
    """Enable foreign keys and WAL mode for SQLite engines."""

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection: Any, _connection_record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def init_engine(force_url: str | None = None) -> Engine:
    """Initialize SQLAlchemy engine, provision pgvector extension on PostgreSQL, or fall back cleanly."""
    global _engine, _SessionLocal, _active_backend

    settings = get_settings()
    target_url = force_url or settings.DATABASE_URL

    if target_url.startswith("postgresql"):
        try:
            pg_engine = create_engine(
                target_url,
                pool_pre_ping=True,
                pool_size=10,
                max_overflow=20,
                connect_args={"connect_timeout": 3},
            )
            with pg_engine.begin() as conn:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            Base.metadata.create_all(bind=pg_engine)
            with pg_engine.begin() as conn:
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_knowledge_chunks_embedding_hnsw "
                        "ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)"
                    )
                )
            _engine = pg_engine
            _SessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False)
            _active_backend = "postgresql+pgvector"
            logger.info("Connected to PostgreSQL + pgvector with HNSW index active.")
            return _engine
        except Exception as exc:
            if not settings.AUTO_FALLBACK_SQLITE and force_url is None:
                raise
            logger.warning(
                "PostgreSQL unavailable (%s); activating standalone SQLite + NumPy vector store fallback.",
                exc,
            )
            target_url = settings.SQLITE_FALLBACK_URL

    sqlite_engine = create_engine(
        target_url,
        connect_args={"check_same_thread": False} if target_url.startswith("sqlite") else {},
    )
    if target_url.startswith("sqlite"):
        _attach_sqlite_pragmas(sqlite_engine)
    Base.metadata.create_all(bind=sqlite_engine)
    _engine = sqlite_engine
    _SessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False)
    _active_backend = "sqlite+numpy-vector"
    logger.info("Initialized local vector store (%s).", target_url)
    return _engine


def get_engine() -> Engine:
    """Return active SQLAlchemy engine, initializing on first access."""
    if _engine is None:
        return init_engine()
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    """Return active SQLAlchemy sessionmaker."""
    if _SessionLocal is None:
        init_engine()
    assert _SessionLocal is not None
    return _SessionLocal


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a transactional database session."""
    session_factory = get_session_factory()
    db = session_factory()
    try:
        yield db
    finally:
        db.close()


def get_db_status() -> dict[str, Any]:
    """Return current database & vector store health telemetry."""
    engine = get_engine()
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "backend": _active_backend,
            "dialect": engine.dialect.name,
            "pgvector_native": engine.dialect.name == "postgresql",
            "embedding_dim": get_settings().EMBEDDING_DIM,
        }
    except Exception as exc:
        return {
            "status": "degraded",
            "backend": _active_backend,
            "dialect": engine.dialect.name,
            "pgvector_native": False,
            "error": str(exc),
        }
