"""Redis caching & state layer for incident sessions, query caching, and hot runbooks."""

from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Any

import fakeredis
import redis

from app.config import get_settings

logger = logging.getLogger(__name__)


class RedisCacheService:
    """Manages Redis incident sessions, RAG/RCA query cache, and hot runbook leaderboard."""

    SESSION_PREFIX = "opsentinel:session:"
    SESSION_INDEX_KEY = "opsentinel:sessions:index"
    QUERY_CACHE_PREFIX = "opsentinel:query_cache:"
    RUNBOOK_CACHE_PREFIX = "opsentinel:runbook:"
    HOT_RUNBOOKS_ZSET = "opsentinel:runbooks:hot"
    HITS_COUNTER_KEY = "opsentinel:stats:cache_hits"
    MISSES_COUNTER_KEY = "opsentinel:stats:cache_misses"

    def __init__(self, force_url: str | None = None) -> None:
        settings = get_settings()
        target_url = force_url or settings.REDIS_URL
        self.backend_mode = "redis"
        self._client: Any = None

        if target_url.startswith("memory://"):
            self._client = fakeredis.FakeStrictRedis(decode_responses=True)
            self.backend_mode = "fakeredis-memory"
            return

        try:
            client = redis.Redis.from_url(
                target_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            client.ping()
            self._client = client
            self.backend_mode = "redis"
            logger.info("Connected to Redis server (%s).", target_url)
        except Exception as exc:
            if not settings.AUTO_FALLBACK_FAKEREDIS and force_url is None:
                raise
            logger.warning(
                "Redis server unavailable (%s); activating in-process FakeRedis engine.",
                exc,
            )
            self._client = fakeredis.FakeStrictRedis(decode_responses=True)
            self.backend_mode = "fakeredis-fallback"

    # ------------------------------------------------------------------
    # 1. Query Cache (RAG & RCA Responses)
    # ------------------------------------------------------------------
    @staticmethod
    def build_query_key(
        mode: str,
        query: str,
        service_filter: str | None = None,
        source_types: list[str] | None = None,
    ) -> str:
        normalized = json.dumps(
            {
                "mode": mode,
                "q": " ".join(query.lower().strip().split()),
                "service": (service_filter or "").lower().strip(),
                "sources": sorted(source_types or []),
            },
            sort_keys=True,
        )
        digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:24]
        return f"{RedisCacheService.QUERY_CACHE_PREFIX}{digest}"

    def get_cached_query(self, cache_key: str) -> dict[str, Any] | None:
        raw = self._client.get(cache_key)
        if raw is not None:
            self._client.incr(self.HITS_COUNTER_KEY)
            return json.loads(raw)
        self._client.incr(self.MISSES_COUNTER_KEY)
        return None

    def set_cached_query(
        self,
        cache_key: str,
        payload: dict[str, Any],
        ttl_seconds: int | None = None,
    ) -> None:
        ttl = ttl_seconds or get_settings().QUERY_CACHE_TTL_SECONDS
        self._client.setex(cache_key, ttl, json.dumps(payload, default=str))

    def invalidate_query_cache(self) -> int:
        """Evict all cached RAG/RCA queries when new logs, deployments, or runbooks arrive."""
        deleted = 0
        keys = list(self._client.scan_iter(match=f"{self.QUERY_CACHE_PREFIX}*"))
        if keys:
            deleted = int(self._client.delete(*keys))
        return deleted

    def list_cached_queries(self, limit: int = 15) -> list[dict[str, Any]]:
        entries: list[dict[str, Any]] = []
        for key in self._client.scan_iter(match=f"{self.QUERY_CACHE_PREFIX}*"):
            raw = self._client.get(key)
            if not raw:
                continue
            ttl = int(self._client.ttl(key))
            data = json.loads(raw)
            entries.append(
                {
                    "cache_key": key,
                    "query": data.get("query", ""),
                    "mode": data.get("mode", "investigate"),
                    "headline_conclusion": data.get("headline_conclusion", ""),
                    "confidence_score": data.get("confidence_score", 0.0),
                    "ttl_seconds": max(ttl, 0),
                }
            )
            if len(entries) >= limit:
                break
        return entries

    # ------------------------------------------------------------------
    # 2. Incident Investigation Sessions
    # ------------------------------------------------------------------
    def get_session(self, session_id: str) -> dict[str, Any]:
        key = f"{self.SESSION_PREFIX}{session_id}"
        raw = self._client.get(key)
        if raw:
            return json.loads(raw)
        return {
            "session_id": session_id,
            "created_at": time.time(),
            "updated_at": time.time(),
            "last_service": None,
            "turns": [],
        }

    def append_session_turn(
        self,
        session_id: str,
        *,
        query: str,
        headline_conclusion: str,
        service: str | None,
        confidence_score: float,
        runbook_id: str | None,
    ) -> dict[str, Any]:
        session_data = self.get_session(session_id)
        now = time.time()
        session_data["updated_at"] = now
        if service:
            session_data["last_service"] = service
        turns = list(session_data.get("turns", []))
        turns.append(
            {
                "timestamp": now,
                "query": query,
                "headline_conclusion": headline_conclusion,
                "service": service,
                "confidence_score": confidence_score,
                "runbook_id": runbook_id,
            }
        )
        session_data["turns"] = turns[-20:]
        ttl = get_settings().SESSION_TTL_SECONDS
        key = f"{self.SESSION_PREFIX}{session_id}"
        self._client.setex(key, ttl, json.dumps(session_data))
        self._client.zadd(self.SESSION_INDEX_KEY, {session_id: now})
        return session_data

    def list_sessions(self, limit: int = 12) -> list[dict[str, Any]]:
        session_ids = self._client.zrevrange(self.SESSION_INDEX_KEY, 0, limit - 1)
        results: list[dict[str, Any]] = []
        for sid in session_ids:
            key = f"{self.SESSION_PREFIX}{sid}"
            raw = self._client.get(key)
            if not raw:
                continue
            data = json.loads(raw)
            ttl = int(self._client.ttl(key))
            results.append(
                {
                    "session_id": sid,
                    "last_service": data.get("last_service"),
                    "turn_count": len(data.get("turns", [])),
                    "updated_at": data.get("updated_at"),
                    "ttl_seconds": max(ttl, 0),
                    "latest_query": data["turns"][-1]["query"] if data.get("turns") else "",
                }
            )
        return results

    # ------------------------------------------------------------------
    # 3. Frequently Accessed Runbooks ("Hot Runbooks" ZSET + Payload Cache)
    # ------------------------------------------------------------------
    def record_runbook_access(
        self,
        runbook_id: str,
        runbook_payload: dict[str, Any] | None = None,
        increment: float = 1.0,
    ) -> int:
        new_score = float(self._client.zincrby(self.HOT_RUNBOOKS_ZSET, increment, runbook_id))
        if runbook_payload is not None:
            ttl = get_settings().RUNBOOK_CACHE_TTL_SECONDS
            payload_copy = {**runbook_payload, "access_count": int(new_score)}
            self._client.setex(
                f"{self.RUNBOOK_CACHE_PREFIX}{runbook_id}",
                ttl,
                json.dumps(payload_copy, default=str),
            )
        return int(new_score)

    def get_cached_runbook(self, runbook_id: str) -> dict[str, Any] | None:
        raw = self._client.get(f"{self.RUNBOOK_CACHE_PREFIX}{runbook_id}")
        if raw:
            return json.loads(raw)
        return None

    def get_runbook_access_count(self, runbook_id: str) -> int:
        score = self._client.zscore(self.HOT_RUNBOOKS_ZSET, runbook_id)
        return int(score) if score is not None else 0

    def get_hot_runbooks(self, limit: int = 8) -> list[dict[str, Any]]:
        ranked = self._client.zrevrange(self.HOT_RUNBOOKS_ZSET, 0, limit - 1, withscores=True)
        hot: list[dict[str, Any]] = []
        for rb_id, score in ranked:
            cached = self.get_cached_runbook(rb_id) or {}
            hot.append(
                {
                    "runbook_id": rb_id,
                    "access_count": int(score),
                    "title": cached.get("title", rb_id),
                    "service": cached.get("service", "platform"),
                    "cached_in_redis": bool(cached),
                }
            )
        return hot

    # ------------------------------------------------------------------
    # Health & Telemetry
    # ------------------------------------------------------------------
    def get_status(self) -> dict[str, Any]:
        try:
            self._client.ping()
            hits = int(self._client.get(self.HITS_COUNTER_KEY) or 0)
            misses = int(self._client.get(self.MISSES_COUNTER_KEY) or 0)
            total = hits + misses
            hit_rate = round((hits / total) * 100.0, 1) if total > 0 else 0.0
            cached_queries_count = sum(
                1 for _ in self._client.scan_iter(match=f"{self.QUERY_CACHE_PREFIX}*")
            )
            active_sessions_count = sum(
                1 for _ in self._client.scan_iter(match=f"{self.SESSION_PREFIX}*")
            )
            return {
                "status": "healthy",
                "backend": self.backend_mode,
                "cache_hits": hits,
                "cache_misses": misses,
                "hit_rate_pct": hit_rate,
                "cached_queries": cached_queries_count,
                "active_sessions": active_sessions_count,
                "hot_runbooks": self.get_hot_runbooks(limit=5),
            }
        except Exception as exc:
            return {
                "status": "degraded",
                "backend": self.backend_mode,
                "error": str(exc),
            }


_cache_service: RedisCacheService | None = None


def get_cache_service() -> RedisCacheService:
    """Singleton accessor for RedisCacheService."""
    global _cache_service
    if _cache_service is None:
        _cache_service = RedisCacheService()
    return _cache_service


def reset_cache_service(force_url: str | None = None) -> RedisCacheService:
    """Reinitialize cache service (primarily used in test suites)."""
    global _cache_service
    _cache_service = RedisCacheService(force_url=force_url)
    return _cache_service
