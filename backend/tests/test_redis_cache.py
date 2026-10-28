"""Tests for Redis incident sessions, query caching, and hot runbooks ZSET tracking."""

from __future__ import annotations

from app.services.cache import get_cache_service


def test_redis_incident_sessions_and_multi_turn_history() -> None:
    cache = get_cache_service()
    session_id = "sess-pytest-01"
    cache.append_session_turn(
        session_id,
        query="Why did payment-api return 500s?",
        headline_conclusion="Connection pool exhaustion",
        service="payment-api",
        confidence_score=0.93,
        runbook_id="RB-DB-POOL-001",
    )
    session = cache.get_session(session_id)
    assert session["last_service"] == "payment-api"
    assert len(session["turns"]) == 1
    assert session["turns"][0]["runbook_id"] == "RB-DB-POOL-001"

    sessions = cache.list_sessions()
    assert any(s["session_id"] == session_id for s in sessions)


def test_redis_query_cache_hits_and_invalidation() -> None:
    cache = get_cache_service()
    key = cache.build_query_key("investigate", "Why is payment-api throwing 500?", "payment-api")
    assert cache.get_cached_query(key) is None

    cache.set_cached_query(
        key,
        {"query": "Why is payment-api throwing 500?", "headline_conclusion": "Pool exhausted"},
    )
    hit = cache.get_cached_query(key)
    assert hit is not None
    assert hit["headline_conclusion"] == "Pool exhausted"

    evicted = cache.invalidate_query_cache()
    assert evicted >= 1
    assert cache.get_cached_query(key) is None


def test_redis_hot_runbooks_zset_leaderboard() -> None:
    cache = get_cache_service()
    score_1 = cache.record_runbook_access(
        "RB-TEST-HOT",
        {"id": "RB-TEST-HOT", "title": "Hot Runbook", "service": "payment-api"},
        increment=25.0,
    )
    assert score_1 >= 25
    hot = cache.get_hot_runbooks(limit=5)
    assert any(item["runbook_id"] == "RB-TEST-HOT" for item in hot)
