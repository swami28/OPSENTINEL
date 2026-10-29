"""FastAPI entrypoint for OPSENTINEL — AI DevOps Incident Intelligence Agent."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_agent import router as agent_router
from app.api.routes_incidents import router as incidents_router
from app.api.routes_knowledge import router as knowledge_router
from app.api.routes_system import router as system_router
from app.config import get_settings
from app.db.session import get_session_factory, init_engine
from app.seed.corpus import seed_initial_corpus
from app.services.cache import get_cache_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
logger = logging.getLogger("opsentinel")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    """Initialize PostgreSQL/pgvector engine, Redis cache, and production seed corpus."""
    settings = get_settings()
    init_engine()
    get_cache_service()

    if settings.AUTO_SEED_ON_STARTUP:
        session_factory = get_session_factory()
        with session_factory() as db:
            summary = seed_initial_corpus(db, force=False)
            if summary["ingested_documents"] > 0:
                logger.info(
                    "Seeded OPSENTINEL RAG corpus: %d docs, %d chunks, %d active incidents.",
                    summary["ingested_documents"],
                    summary["ingested_chunks"],
                    summary["seeded_incidents"],
                )
    yield


def create_app() -> FastAPI:
    """Construct and configure the FastAPI application."""
    settings = get_settings()
    application = FastAPI(
        title="OPSENTINEL — DevOps Incident Intelligence Agent",
        description=(
            "AI-powered SRE & DevOps Root Cause Analysis system combining multi-source RAG "
            "(Logs, Deployments, Incidents, Runbooks, Architecture, Troubleshooting Guides), "
            "PostgreSQL + pgvector, Redis session/query/runbook caching, and LLM synthesis."
        ),
        version=settings.APP_VERSION,
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    prefix = settings.API_V1_PREFIX
    application.include_router(agent_router, prefix=prefix)
    application.include_router(knowledge_router, prefix=prefix)
    application.include_router(incidents_router, prefix=prefix)
    application.include_router(system_router, prefix=prefix)

    @application.get("/", tags=["Root"])
    def root() -> dict[str, str]:
        return {
            "service": "OPSENTINEL API",
            "version": settings.APP_VERSION,
            "docs": "/docs",
            "health": f"{prefix}/system/health",
        }

    return application


app = create_app()
