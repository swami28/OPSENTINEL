"""Application configuration managed via Pydantic Settings."""

from __future__ import annotations

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralized settings for OPSENTINEL backend services."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "OPSENTINEL"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    API_V1_PREFIX: str = "/api/v1"

    # PostgreSQL + pgvector primary database (auto-falls back to SQLite in standalone local mode)
    DATABASE_URL: str = "postgresql+psycopg://opsentinel:opsentinel@localhost:5432/opsentinel"
    AUTO_FALLBACK_SQLITE: bool = True
    SQLITE_FALLBACK_URL: str = "sqlite:///./opsentinel_local.db"

    # Redis for incident sessions, query cache, and hot runbooks
    REDIS_URL: str = "redis://localhost:6379/0"
    AUTO_FALLBACK_FAKEREDIS: bool = True
    QUERY_CACHE_TTL_SECONDS: int = 900
    SESSION_TTL_SECONDS: int = 7200
    RUNBOOK_CACHE_TTL_SECONDS: int = 3600

    # RAG & Vector Embeddings
    EMBEDDING_DIM: int = 384
    EMBEDDING_PROVIDER: str = "local"  # "local" (384-dim semantic DevOps vectorizer) or "openai"

    # LLM Synthesis Engine (OpenAI-compatible or built-in deterministic evidence synthesizer)
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"

    # Startup seed data
    AUTO_SEED_ON_STARTUP: bool = True
    CORS_ORIGINS: list[str] = ["*"]

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        if isinstance(value, str):
            if value.startswith("postgres://"):
                return value.replace("postgres://", "postgresql+psycopg://", 1)
            if value.startswith("postgresql://") and "+psycopg" not in value:
                return value.replace("postgresql://", "postgresql+psycopg://", 1)
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached Settings instance."""
    return Settings()
