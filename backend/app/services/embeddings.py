"""384-dimensional semantic vector embedding service for DevOps telemetry & RAG."""

from __future__ import annotations

import hashlib
import logging
import math
import re
from collections import Counter

import numpy as np

from app.config import get_settings

logger = logging.getLogger(__name__)

TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9_./:-]{1,48}|[a-z0-9]+")

STOPWORDS = frozenset(
    {
        "the", "and", "for", "with", "that", "this", "from", "have", "has", "had",
        "was", "were", "are", "been", "being", "into", "onto", "what", "when", "where",
        "why", "how", "did", "does", "after", "before", "about", "there", "their",
        "they", "them", "then", "than", "our", "your", "can", "will", "just", "more",
    }
)

# 48 high-signal DevOps & SRE semantic concept channels mapped into dims [0..47]
DEVOPS_CONCEPT_CLUSTERS: list[tuple[float, tuple[str, ...]]] = [
    (2.4, ("500", "5xx", "502", "503", "504", "internal server error", "server error", "http 500")),
    (2.2, ("401", "403", "unauthorized", "forbidden", "unauthenticated", "session drop", "jwt")),
    (2.5, ("payment", "payment-api", "payments", "charge", "billing", "stripe", "fraud")),
    (2.4, ("auth", "auth-gateway", "login", "token", "oauth", "session", "sso")),
    (2.4, ("checkout", "checkout-service", "cart", "promo", "basket", "flash-sale")),
    (2.4, ("order", "order-worker", "fulfillment", "orders.fulfilled", "merchant")),
    (2.6, ("pool", "queuepool", "connection pool", "toomanyconnectionserror", "max_connections", "pgbouncer", "db_pool_max_size", "exhaustion", "starvation")),
    (2.3, ("postgres", "postgresql", "asyncpg", "sqlalchemy", "database", "pg_stat_activity", "sql")),
    (2.3, ("redis", "cache", "redis-session-cluster", "ttl", "eviction", "keyspace")),
    (2.4, ("kafka", "consumer lag", "lag", "partition", "offset", "broker", "event-bus")),
    (2.5, ("oom", "oomkilled", "137", "exit code 137", "memory leak", "heap", "rss", "out of memory")),
    (2.4, ("tls", "ssl", "mtls", "certificate", "cert", "certificate_verify_failed", "x509", "ca bundle")),
    (2.2, ("deploy", "deployment", "latest deployment", "release", "rollout", "upgrade", "v2.15.0", "helm", "commit", "canary")),
    (2.2, ("rollback", "revert", "mitigate", "mitigation", "helm rollback", "hotfix")),
    (2.1, ("timeout", "timed out", "timeouterror", "latency", "slow", "p95", "p99", "duration")),
    (2.2, ("seq scan", "index", "slow query", "explain analyze", "table scan", "composite index")),
    (2.0, ("transaction", "transactional", "begin", "lock", "deadlock", "idle in transaction")),
    (1.9, ("runbook", "playbook", "sre", "triage", "checklist", "procedure", "remediation")),
    (1.8, ("incident", "postmortem", "outage", "rca", "root cause", "sev-1", "sev-2")),
    (1.8, ("architecture", "topology", "sla", "slo", "upstream", "downstream", "replica")),
    (1.9, ("crash", "crashloopbackoff", "restart", "pod", "kubectl", "kubernetes", "container")),
    (2.0, ("spike", "surge", "increased", "300%", "error rate", "anomaly", "degradation")),
    (1.9, ("fraud-scoring", "fraud_enrichment", "rpc", "synchronous", "external call", "webhook")),
    (1.9, ("unbounded", "lru", "in-memory cache", "gc", "garbage collection", "allocation")),
]


def _stable_hash(token: str) -> tuple[int, float]:
    """Deterministic SHA1-based feature hash returning bucket index and +/-1 sign."""
    digest = hashlib.sha1(token.encode("utf-8")).digest()
    bucket = int.from_bytes(digest[:4], "little")
    sign = 1.0 if (digest[4] & 1) == 0 else -1.0
    return bucket, sign


def tokenize_devops_text(text: str) -> list[str]:
    """Tokenize operational logs, stack traces, configs, and natural language queries."""
    lowered = text.lower()
    raw_tokens = TOKEN_RE.findall(lowered)
    tokens: list[str] = []
    for tok in raw_tokens:
        if tok in STOPWORDS:
            continue
        tokens.append(tok)
        # Split compound identifiers like payment-api, db_pool_max_size, asyncpg.exceptions
        if any(sep in tok for sep in ("-", "_", ".", "/", ":")):
            for part in re.split(r"[-_./:]+", tok):
                if len(part) >= 2 and part not in STOPWORDS:
                    tokens.append(part)
    return tokens


class EmbeddingService:
    """Generates normalized 384-dim embeddings via local semantic engine or OpenAI API."""

    def __init__(self, dim: int | None = None) -> None:
        settings = get_settings()
        self.dim = dim or settings.EMBEDDING_DIM
        self.concept_dims = min(48, self.dim // 4)
        self.hash_dims = self.dim - self.concept_dims

    def embed_text(self, text: str) -> list[float]:
        """Embed a single text string into a unit-normalized vector of length `self.dim`."""
        settings = get_settings()
        if settings.EMBEDDING_PROVIDER == "openai" and settings.OPENAI_API_KEY:
            try:
                from openai import OpenAI

                client = OpenAI(
                    api_key=settings.OPENAI_API_KEY,
                    base_url=settings.OPENAI_BASE_URL,
                )
                resp = client.embeddings.create(
                    input=[text[:8000]],
                    model=settings.OPENAI_EMBEDDING_MODEL,
                    dimensions=self.dim,
                )
                vec = np.asarray(resp.data[0].embedding, dtype=np.float32)
                norm = float(np.linalg.norm(vec))
                if norm > 0:
                    vec = vec / norm
                return [float(x) for x in vec.tolist()]
            except Exception as exc:
                logger.warning("OpenAI embedding fallback to local semantic vectorizer: %s", exc)

        return self._embed_local(text)

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Embed multiple chunks efficiently."""
        return [self.embed_text(t) for t in texts]

    def _embed_local(self, text: str) -> list[float]:
        """Compute hybrid DevOps concept + n-gram signed hash 384-dim L2-normalized embedding."""
        vec = np.zeros(self.dim, dtype=np.float32)
        lowered = text.lower()

        # 1. Domain concept channels [0 .. concept_dims - 1]
        for idx, (weight, phrases) in enumerate(DEVOPS_CONCEPT_CLUSTERS[: self.concept_dims]):
            hits = sum(1 for phrase in phrases if phrase in lowered)
            if hits > 0:
                vec[idx] = weight * (1.0 + 0.45 * math.log1p(hits))

        # 2. Signed feature hashing over word unigrams, bigrams, and 4-char subwords
        tokens = tokenize_devops_text(lowered)
        counts = Counter(tokens)

        for tok, tf in counts.items():
            tf_weight = 1.0 + math.log(tf)
            bucket, sign = _stable_hash(f"u:{tok}")
            vec[self.concept_dims + (bucket % self.hash_dims)] += sign * tf_weight

            # Subword 4-grams capture partial matches (e.g. "connection" <-> "connections")
            if len(tok) >= 5:
                padded = f"<{tok}>"
                for i in range(len(padded) - 3):
                    sub = padded[i : i + 4]
                    sbucket, ssign = _stable_hash(f"g:{sub}")
                    vec[self.concept_dims + (sbucket % self.hash_dims)] += 0.28 * ssign

        for i in range(len(tokens) - 1):
            bigram = f"b:{tokens[i]}_{tokens[i + 1]}"
            bbucket, bsign = _stable_hash(bigram)
            vec[self.concept_dims + (bbucket % self.hash_dims)] += 0.85 * bsign

        norm = float(np.linalg.norm(vec))
        if norm > 1e-8:
            vec = vec / norm
        else:
            vec[0] = 1.0
        return [round(float(x), 6) for x in vec.tolist()]


_embedding_service: EmbeddingService | None = None


def get_embedding_service() -> EmbeddingService:
    """Singleton accessor for EmbeddingService."""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service
