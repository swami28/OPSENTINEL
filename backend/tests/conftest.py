"""Pytest fixtures supporting both standalone local runs and CI PostgreSQL+pgvector+Redis runs."""

from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.db.models import Base
from app.db.session import get_engine, init_engine
from app.main import create_app
from app.services.cache import reset_cache_service


@pytest.fixture(scope="session", autouse=True)
def configure_test_environment(tmp_path_factory: pytest.TempPathFactory) -> Generator[None, None, None]:
    """Configure DB & Redis test backends (real Postgres+Redis in CI, isolated temp DB locally)."""
    use_external = os.getenv("CI_USE_EXTERNAL_SERVICES", "false").lower() == "true"

    if not use_external:
        db_file: Path = tmp_path_factory.mktemp("opsentinel_db") / "test_opsentinel.db"
        os.environ["DATABASE_URL"] = f"sqlite:///{db_file}"
        os.environ["REDIS_URL"] = "memory://"

    get_settings.cache_clear()
    engine = init_engine(force_url=os.environ.get("DATABASE_URL"))
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    reset_cache_service(force_url=os.environ.get("REDIS_URL"))
    yield
    Base.metadata.drop_all(bind=get_engine())


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    """Yield FastAPI TestClient with startup lifespan (seeds telemetry corpus automatically)."""
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client
