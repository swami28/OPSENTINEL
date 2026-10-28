"""Rich multi-service production telemetry, runbooks, architecture, and incident seed dataset."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import ActiveIncident, KnowledgeDocument
from app.schemas.api import KnowledgeIngestRequest
from app.services.cache import get_cache_service
from app.services.vector_store import get_vector_store

SEED_DOCUMENTS: list[dict[str, object]] = [
    # =========================================================================
    # SCENARIO 1: PAYMENT-API HTTP 500 SPIKE (+312%) AFTER DEPLOYMENT v2.15.0
    # =========================================================================
    {
        "id": "DEP-2026-1028-04",
        "title": "Deployment payment-api v2.14.2 -> v2.15.0 (Helm Rev 42)",
        "source_type": "deployment",
        "service": "payment-api",
        "environment": "production",
        "severity": "INFO",
        "version": "v2.15.0",
        "metadata": {
            "commit_sha": "8f4c2a19b",
            "author": "priya.nair@opsentinel.io",
            "helm_revision": 42,
            "previous_version": "v2.14.2",
            "deployed_at": "2026-10-28T14:05:12Z",
            "downstream_services": ["postgres-primary", "fraud-scoring-svc", "checkout-service"],
        },
        "raw_content": """## Release Summary: payment-api v2.15.0 (Helm Revision 42)
Deployed at `2026-10-28T14:05:12Z` to namespace `prod-payments` (8 replicas).
Git Commit: `8f4c2a19b` ("feat(payments): inline synchronous fraud-score enrichment on /v2/payments/charge").

## Key Code & Configuration Changes
1. Added synchronous HTTP call `await fraud_enrichment.score_charge(payload)` inside `PaymentChargeService.execute_charge()` **within** the active `async with db.session.begin():` PostgreSQL transaction block.
2. Updated `helm/values-prod.yaml`: accidentally synced staging pool parameter `DB_POOL_MAX_SIZE: 15` (previously `50` in v2.14.2), `DB_MAX_OVERFLOW: 0`, `DB_POOL_ACQUIRE_TIMEOUT_MS: 3000`.
3. Enabled feature flag `ENABLE_SYNC_FRAUD_ENRICHMENT=true` across 100% of production traffic.""",
    },
    {
        "id": "LOG-APP-PAY-1028",
        "title": "Application Logs — payment-api Rollout & Pool Saturation (prod-payments)",
        "source_type": "application_log",
        "service": "payment-api",
        "environment": "production",
        "severity": "WARN",
        "version": "v2.15.0",
        "metadata": {
            "event_timestamp": "2026-10-28T14:07:55Z",
            "namespace": "prod-payments",
            "pod_count": 8,
        },
        "raw_content": """2026-10-28T14:05:18Z INFO payment-api-7d9f8b6c4-k2m9p server.startup: Booted payment-api v2.15.0 (SQLAlchemy QueuePool size=15, max_overflow=0, timeout=3.0s)
2026-10-28T14:06:04Z INFO payment-api-7d9f8b6c4-k2m9p http.access: POST /api/v2/payments/charge status=200 duration=462ms fraud_rpc_ms=438ms
2026-10-28T14:07:19Z WARN payment-api-7d9f8b6c4-k2m9p fraud_enrichment.client: Holding transactional DB session open during external fraud RPC duration=468ms trace_id=tr-99812a (occurrences=64)
2026-10-28T14:07:55Z WARN payment-api-7d9f8b6c4-x8q1z db.pool.monitor: QueuePool utilization at 15/15 (100% saturated), 29 coroutines awaiting connection checkout (occurrences=41)
2026-10-28T14:08:30Z WARN payment-api-7d9f8b6c4-m4v7n metrics.slo: /api/v2/payments/charge p95 latency degraded 42ms -> 2980ms; 5xx error ratio jumped 0.18% -> 18.4% (+312% surge)""",
    },
    {
        "id": "LOG-ERR-PAY-1028",
        "title": "Error Logs — payment-api HTTP 500 & PostgreSQL QueuePool Timeouts",
        "source_type": "error_log",
        "service": "payment-api",
        "environment": "production",
        "severity": "CRITICAL",
        "version": "v2.15.0",
        "metadata": {
            "event_timestamp": "2026-10-28T14:08:44Z",
            "http_endpoint": "POST /api/v2/payments/charge",
            "error_rate_delta": "+312%",
        },
        "raw_content": """2026-10-28T14:08:44Z ERROR payment-api-7d9f8b6c4-k2m9p api.charge: HTTP 500 Internal Server Error on POST /api/v2/payments/charge — sqlalchemy.exc.TimeoutError: QueuePool limit of size 15 overflow 0 reached, connection timed out, timeout 3.00 trace_id=tr-99841f (occurrences=142)
2026-10-28T14:09:02Z CRITICAL payment-api-7d9f8b6c4-x8q1z db.engine: asyncpg.exceptions.TooManyConnectionsError: remaining connection slots are reserved for non-replication superuser connections trace_id=tr-99877c (occurrences=37)
2026-10-28T14:09:19Z ERROR payment-api-7d9f8b6c4-m4v7n fraud_enrichment.tx: Transaction idle-in-transaction exceeded 2850ms while awaiting fraud-scoring-svc/v1/score; aborting charge request with HTTP 500 trace_id=tr-99904b (occurrences=89)""",
    },
    {
        "id": "INC-2026-0819",
        "title": "Past Incident Postmortem — Order Worker DB Connection Starvation Due to External Webhook in Transaction",
        "source_type": "incident",
        "service": "payment-api",
        "environment": "production",
        "severity": "ERROR",
        "version": "v2.11.0",
        "metadata": {
            "occurred_at": "2026-08-19T09:20:00Z",
            "mttr_minutes": 14,
            "root_cause": "External HTTP RPC inside open SQLAlchemy transaction exhausted DB connection pool",
        },
        "raw_content": """## Incident Summary (INC-2026-0819)
On 2026-08-19, payment & order services experienced a 280% spike in HTTP 500 errors after introducing a synchronous partner webhook inside `db.session.begin()`.

## Root Cause & Lessons Learned
Holding PostgreSQL connections open during ~400ms external network I/O multiplies required pool size by 10x according to Little's Law (`L = lambda * W`).
Action item: Never invoke external HTTP/gRPC endpoints inside an open database transaction, and verify `DB_POOL_MAX_SIZE` in `helm/values-prod.yaml` before promotion.""",
    },
    {
        "id": "RB-DB-POOL-001",
        "title": "Runbook: PostgreSQL Connection Pool Exhaustion & Post-Deploy HTTP 500 Spike",
        "source_type": "runbook",
        "service": "payment-api",
        "environment": "production",
        "severity": "CRITICAL",
        "metadata": {
            "sla_minutes": 10,
            "summary": "Immediate triage, pg_stat_activity verification, and Helm rollback for QueuePool exhaustion on payment-api.",
            "key_commands": [
                "psql $PROD_DB_URL -c \"SELECT application_name, state, count(*) FROM pg_stat_activity GROUP BY 1, 2;\"",
                "kubectl logs -n prod-payments deploy/payment-api --since=15m | grep -E 'QueuePool|TooManyConnections'",
                "helm rollback payment-api 41 -n prod-payments --wait",
            ],
            "steps": [
                "Confirm QueuePool TimeoutError or TooManyConnectionsError in payment-api error logs.",
                "Inspect pg_stat_activity on postgres-primary for connections stuck in 'idle in transaction'.",
                "If triggered within 30 minutes of a Helm deployment, execute immediate `helm rollback payment-api <prev_rev> -n prod-payments --wait`.",
                "Verify DB_POOL_MAX_SIZE >= 40 in values-prod.yaml and ensure zero external HTTP/RPC calls occur inside DB transaction blocks.",
                "Confirm /api/v2/payments/charge HTTP 500 rate drops below 0.2% SLO threshold.",
            ],
        },
        "raw_content": """## When to Use This Runbook (RB-DB-POOL-001)
Trigger when `payment-api` alerts on elevated HTTP 500 responses (`>2%`), `sqlalchemy.exc.TimeoutError: QueuePool limit`, or `TooManyConnectionsError`.

## Immediate Triage Steps
1. Check PostgreSQL connection states via `pg_stat_activity` — if `idle in transaction` exceeds 30 backends, an application code path is awaiting network I/O inside a DB transaction.
2. Diff latest Helm deployment values (`helm diff revision payment-api`) to verify `DB_POOL_MAX_SIZE` was not reduced.

## Mitigation & Permanent Fix
- **Immediate Rollback**: `helm rollback payment-api 41 -n prod-payments --wait`
- **Permanent Fix**: Decouple external `fraud-scoring-svc` RPCs from the database transaction and route connections via PgBouncer (`DB_POOL_MAX_SIZE=40`).""",
    },
    {
        "id": "ARCH-PAYMENTS-001",
        "title": "Architecture Doc: Payment Processing Pipeline & Connection Budget",
        "source_type": "architecture",
        "service": "payment-api",
        "environment": "production",
        "severity": "INFO",
        "metadata": {
            "owner_team": "payments-platform",
            "downstream_services": ["postgres-primary", "fraud-scoring-svc", "checkout-service"],
        },
        "raw_content": """## Payment Pipeline Topology
`checkout-service` -> `payment-api` (8 pods, FastAPI + SQLAlchemy Async + asyncpg) -> `PgBouncer` -> `postgres-primary` (`max_connections=200`).
`payment-api` also calls `fraud-scoring-svc` (`p95=450ms`, timeout `1200ms`).

## Strict Architectural Invariants
- Connection budget: 8 replicas * `DB_POOL_MAX_SIZE=40` multiplexed over PgBouncer transaction pool (`default_pool_size=120`).
- **Invariant #1**: Database transactions on `payment-api` MUST remain `< 15ms` and MUST NOT span external synchronous RPCs (`fraud-scoring-svc`, Stripe/Adyen gateways), otherwise `QueuePool` saturates under normal 320 RPS load.""",
    },
    {
        "id": "TSG-HTTP-5XX-002",
        "title": "Troubleshooting Guide: Post-Deployment Microservice HTTP 500 Surges",
        "source_type": "troubleshooting",
        "service": "platform-core",
        "environment": "production",
        "severity": "INFO",
        "metadata": {"category": "api-reliability"},
        "raw_content": """## Decision Tree for Post-Deployment HTTP 500 Spikes
1. **Check Error Signature**:
   - `QueuePool limit` / `TooManyConnectionsError` -> Database connection pool exhaustion (`RB-DB-POOL-001`). Check pool size config & transaction hold duration.
   - `OOMKilled` / `502 Bad Gateway` -> Container memory leak (`RB-K8S-OOM-003`).
   - `UndefinedColumnError` / `LockNotAvailable` -> Uncoordinated Alembic/Flyway schema migration.
2. **Correlate Timing**: Compare first 500 timestamp with `DEP-*` deployment history (`deployed_at`). A lag of 1–5 minutes strongly indicates resource pool exhaustion or cache saturation under live RPS.""",
    },

    # =========================================================================
    # SCENARIO 2: AUTH-GATEWAY INTERMITTENT 401 & REDIS mTLS CERT MISMATCH
    # =========================================================================
    {
        "id": "DEP-2026-1027-19",
        "title": "Deployment redis-session-cluster mTLS Root CA Rotation (OpsRootCA-G3)",
        "source_type": "deployment",
        "service": "auth-gateway",
        "environment": "production",
        "severity": "INFO",
        "version": "tls-g3-2026.10",
        "metadata": {
            "commit_sha": "3c91e04d",
            "deployed_at": "2026-10-27T21:15:00Z",
            "downstream_services": ["redis-session-cluster"],
        },
        "raw_content": """## Infrastructure Change: Redis Session Cluster mTLS Certificate Rotation
Rotated server TLS certificates on `redis-session-cluster` to new internal CA `OpsRootCA-G3` at `2026-10-27T21:15:00Z`.
Updated `ops-ca-bundle` secret in `prod-edge` for `auth-gateway` primary deployment, but `auth-gateway-canary` (2 of 10 pods receiving 20% traffic) still references pinned secret `ops-ca-bundle-legacy-g2`.""",
    },
    {
        "id": "LOG-ERR-AUTH-1027",
        "title": "Error Logs — auth-gateway Redis SSL CERTIFICATE_VERIFY_FAILED & HTTP 401 Drops",
        "source_type": "error_log",
        "service": "auth-gateway",
        "environment": "production",
        "severity": "ERROR",
        "version": "v3.4.1-canary",
        "metadata": {"event_timestamp": "2026-10-27T21:18:10Z"},
        "raw_content": """2026-10-27T21:18:10Z ERROR auth-gateway-canary-6b8d9-p2w4k redis.tls: ssl.SSLCertVerificationError: [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: unable to get local issuer certificate (redis-session-cluster:6380) (occurrences=94)
2026-10-27T21:18:11Z WARN auth-gateway-canary-6b8d9-p2w4k middleware.session: Session lookup failed due to Redis ConnectionError; failing closed with HTTP 401 Unauthorized trace_id=tr-44109c (occurrences=94)
2026-10-27T21:19:05Z ERROR auth-gateway-canary-6b8d9-r7n2m metrics.auth: Intermittent HTTP 401 rate at 19.8% across ingress (100% failing on canary pods, 0.02% on stable pods)""",
    },
    {
        "id": "INC-2026-0604",
        "title": "Past Incident — Internal mTLS Rotation Broke Pinned Canary Workloads",
        "source_type": "incident",
        "service": "auth-gateway",
        "environment": "production",
        "severity": "WARN",
        "metadata": {"occurred_at": "2026-06-04T16:00:00Z"},
        "raw_content": """## Summary (INC-2026-0604)
During quarterly mTLS CA rotation, canary deployments with hardcoded secret names failed TLS verification against Redis, surfacing as intermittent user session logouts (HTTP 401) affecting ~20% of requests.""",
    },
    {
        "id": "RB-REDIS-TLS-002",
        "title": "Runbook: Auth Gateway HTTP 401 Surge & Redis mTLS Handshake Failures",
        "source_type": "runbook",
        "service": "auth-gateway",
        "environment": "production",
        "severity": "ERROR",
        "metadata": {
            "sla_minutes": 15,
            "summary": "Resolve CERTIFICATE_VERIFY_FAILED between auth-gateway pods and redis-session-cluster.",
            "key_commands": [
                "kubectl logs -n prod-edge -l app=auth-gateway --since=20m | grep CERTIFICATE_VERIFY_FAILED",
                "kubectl exec -n prod-edge deploy/auth-gateway-canary -- openssl x509 -in /etc/certs/ca.crt -noout -subject",
                "kubectl rollout restart deployment/auth-gateway-canary -n prod-edge",
            ],
            "steps": [
                "Verify whether 401 responses correlate with SSLCertVerificationError on specific pods.",
                "Inspect mounted `/etc/certs/ca.crt` issuer subject across stable and canary deployments.",
                "Update canary secret reference to dual-root bundle `ops-ca-bundle-dual-g2-g3` and restart deployment.",
                "Confirm Redis TLS error count drops to zero and 401 baseline returns below 0.5%.",
            ],
        },
        "raw_content": """## Triage & Mitigation (RB-REDIS-TLS-002)
When `auth-gateway` emits `CERTIFICATE_VERIFY_FAILED` against `redis-session-cluster:6380`, verify all deployments (including canary/shadow) mount the dual-CA bundle (`G2 + G3`) and trigger `kubectl rollout restart`.""",
    },
    {
        "id": "ARCH-AUTH-002",
        "title": "Architecture Doc: Edge Authentication Gateway & Redis mTLS Session Store",
        "source_type": "architecture",
        "service": "auth-gateway",
        "environment": "production",
        "severity": "INFO",
        "metadata": {"owner_team": "identity-security"},
        "raw_content": """## Auth Gateway Session Validation Flow
`Ingress Envoy` -> `auth-gateway` (8 stable pods + 2 canary pods = 20% canary split) -> `redis-session-cluster:6380` (strict mTLS).
All clients must mount the `ops-ca-bundle` secret rotated via `cert-manager` + `Reloader`.""",
    },

    # =========================================================================
    # SCENARIO 3: CHECKOUT-SERVICE OOMKILLED (EXIT CODE 137) MEMORY LEAK
    # =========================================================================
    {
        "id": "DEP-2026-1028-01",
        "title": "Deployment checkout-service v4.7.3 -> v4.8.0 (Flash-Sale Promo Engine)",
        "source_type": "deployment",
        "service": "checkout-service",
        "environment": "production",
        "severity": "INFO",
        "version": "v4.8.0",
        "metadata": {
            "commit_sha": "e71b902a",
            "deployed_at": "2026-10-28T11:30:00Z",
            "downstream_services": ["payment-api"],
        },
        "raw_content": """## Release Summary: checkout-service v4.8.0
Deployed at `2026-10-28T11:30:00Z` in `prod-commerce`.
Added in-process `_PROMO_EVAL_CACHE: dict[str, PromoMatrix] = {}` caching personalized cart discount matrices keyed by `(user_id, cart_hash, minute_bucket)` without eviction or `maxsize` limit.""",
    },
    {
        "id": "LOG-ERR-CHK-1028",
        "title": "Error Logs — checkout-service Pod OOMKilled (Exit Code 137) & 502 Bad Gateway",
        "source_type": "error_log",
        "service": "checkout-service",
        "environment": "production",
        "severity": "CRITICAL",
        "version": "v4.8.0",
        "metadata": {"event_timestamp": "2026-10-28T11:49:12Z"},
        "raw_content": """2026-10-28T11:46:05Z WARN checkout-service-59c4f-b8k2l runtime.memory: Process RSS reached 1912MB / 2048MB cgroup limit (_PROMO_EVAL_CACHE entries=418,920) (occurrences=18)
2026-10-28T11:49:12Z CRITICAL kubelet.prod-commerce: Container checkout-service in pod checkout-service-59c4f-b8k2l terminated: reason=OOMKilled exit_code=137 (limit=2Gi) (occurrences=11)
2026-10-28T11:49:14Z ERROR ingress-nginx upstream.commerce: HTTP 502 Bad Gateway while connecting to upstream checkout-service:8080 (connection reset by peer during OOMKill) (occurrences=63)""",
    },
    {
        "id": "RB-K8S-OOM-003",
        "title": "Runbook: Kubernetes Pod OOMKilled (Exit Code 137) & Memory Leak Mitigation",
        "source_type": "runbook",
        "service": "checkout-service",
        "environment": "production",
        "severity": "CRITICAL",
        "metadata": {
            "sla_minutes": 10,
            "summary": "Mitigate CrashLoopBackOff / Exit Code 137 OOMKills on checkout-service via rollout undo and bounded TTLCache.",
            "key_commands": [
                "kubectl get pods -n prod-commerce -l app=checkout-service",
                "kubectl top pods -n prod-commerce -l app=checkout-service",
                "kubectl rollout undo deployment/checkout-service -n prod-commerce",
            ],
            "steps": [
                "Confirm `lastState.terminated.reason == OOMKilled` (exit code 137) on restarting pods.",
                "Correlate RSS slope against recent deployment `v4.8.0` in-memory cache changes.",
                "Execute `kubectl rollout undo deployment/checkout-service -n prod-commerce` to restore v4.7.3.",
                "Patch in-process caches to use bounded `TTLCache(maxsize=4096, ttl=120)` before re-deploying.",
            ],
        },
        "raw_content": """## Runbook RB-K8S-OOM-003 — Container OOMKilled (137)
Immediately verify pod termination state, roll back unbounded memory changes (`kubectl rollout undo`), and enforce bounded LRU/TTL caches with heap profiling tests in CI.""",
    },

    # =========================================================================
    # SCENARIO 4: ORDER-WORKER KAFKA CONSUMER LAG > 85,000 & MISSING DB INDEX
    # =========================================================================
    {
        "id": "DEP-2026-1026-11",
        "title": "Deployment order-worker v1.19.0 (Merchant Fulfillment SLA Query)",
        "source_type": "deployment",
        "service": "order-worker",
        "environment": "production",
        "severity": "INFO",
        "version": "v1.19.0",
        "metadata": {
            "commit_sha": "77a20d1f",
            "deployed_at": "2026-10-26T17:40:00Z",
            "downstream_services": ["postgres-primary", "kafka-event-bus"],
        },
        "raw_content": """## Release Summary: order-worker v1.19.0
Added synchronous SQL query inside Kafka consumer handler on topic `orders.fulfilled`:
`SELECT count(*), avg(fulfillment_ms) FROM orders WHERE merchant_id = $1 AND created_at > now() - interval '24 hours'` on the 42M-row `orders` table without adding a composite index on `(merchant_id, created_at)`.""",
    },
    {
        "id": "LOG-ERR-ORD-1028",
        "title": "Error & Slow Query Logs — order-worker Kafka Consumer Lag 88,420 Messages",
        "source_type": "error_log",
        "service": "order-worker",
        "environment": "production",
        "severity": "ERROR",
        "version": "v1.19.0",
        "metadata": {"event_timestamp": "2026-10-28T13:15:00Z"},
        "raw_content": """2026-10-28T13:12:09Z WARN postgres-primary slow_query: duration: 3842.19 ms plan: Parallel Seq Scan on orders (cost=0.00..482910.22 rows=41980200) Filter: (merchant_id = 'm_8821') (occurrences=76)
2026-10-28T13:14:22Z ERROR order-worker-84c1d-z9m2x kafka.consumer: Consumer group 'order-worker-prod' lag on topic 'orders.fulfilled' reached 88,420 messages (threshold=5,000); throughput degraded 420 msg/s -> 4.1 msg/s (occurrences=29)
2026-10-28T13:15:00Z WARN order-worker-84c1d-z9m2x kafka.coordinator: Poll interval approached max.poll.interval.ms (295000ms), risking partition rebalance churn (occurrences=14)""",
    },
    {
        "id": "RB-KAFKA-LAG-004",
        "title": "Runbook: Kafka Consumer Lag Surge & Slow SQL Handler Remediation",
        "source_type": "runbook",
        "service": "order-worker",
        "environment": "production",
        "severity": "ERROR",
        "metadata": {
            "sla_minutes": 20,
            "summary": "Diagnose orders.fulfilled consumer lag, verify EXPLAIN ANALYZE Seq Scan, and build composite index CONCURRENTLY.",
            "key_commands": [
                "kafka-consumer-groups.sh --bootstrap-server $KAFKA_BROKERS --describe --group order-worker-prod",
                "psql $PROD_DB_URL -c \"CREATE INDEX CONCURRENTLY idx_orders_merchant_created ON orders (merchant_id, created_at DESC);\"",
                "kubectl scale deployment/order-worker -n prod-orders --replicas=12",
            ],
            "steps": [
                "Inspect partition lag via kafka-consumer-groups.sh on `order-worker-prod`.",
                "Run EXPLAIN (ANALYZE, BUFFERS) on slow SQL queries logged by postgres-primary.",
                "Create missing composite index `CONCURRENTLY` on `orders(merchant_id, created_at DESC)` without locking writes.",
                "Temporarily scale `order-worker` replicas to 12 until backlog drains below 1,000 messages.",
            ],
        },
        "raw_content": """## Runbook RB-KAFKA-LAG-004
Resolve `order-worker` Kafka consumer lag caused by per-event PostgreSQL sequential scans by building `idx_orders_merchant_created` concurrently and scaling worker partitions.""",
    },
    {
        "id": "ARCH-EVENTS-004",
        "title": "Architecture Doc: Event-Driven Order Fulfillment & Kafka Partitioning",
        "source_type": "architecture",
        "service": "order-worker",
        "environment": "production",
        "severity": "INFO",
        "metadata": {"owner_team": "fulfillment-core"},
        "raw_content": """## Order Event Bus Topology
Topic `orders.fulfilled` (12 partitions, retention 7d) -> `order-worker` consumer group (`order-worker-prod`, 6–12 pods) -> `postgres-primary` (`orders` table, 42M rows).
Per-message processing budget MUST stay `< 25ms` to sustain 450+ events/sec peak load.""",
    },
]


SEED_ACTIVE_INCIDENTS: list[dict[str, str]] = [
    {
        "id": "INC-LIVE-1028",
        "title": "Payment API HTTP 500 Errors Increased +312% After v2.15.0 Deployment",
        "service": "payment-api",
        "severity": "SEV-1",
        "status": "investigating",
        "symptom_summary": (
            "HTTP 500 error rate on POST /api/v2/payments/charge jumped 312% (0.18% -> 18.4%) "
            "and p95 latency climbed from 42ms to 2,980ms starting 3 minutes after Helm release v2.15.0."
        ),
        "metric_spike": "500 errors +312% | p95 2,980ms | Pool 15/15",
        "environment": "production",
    },
    {
        "id": "INC-LIVE-1027",
        "title": "Intermittent HTTP 401 Unauthorized Surge on Auth Gateway (20% Traffic)",
        "service": "auth-gateway",
        "severity": "SEV-2",
        "status": "investigating",
        "symptom_summary": (
            " ~19.8% of authenticated API requests are failing with HTTP 401 Unauthorized "
            "and user session drops following Redis mTLS certificate rotation."
        ),
        "metric_spike": "401 rate 19.8% | Canary TLS errors",
        "environment": "production",
    },
    {
        "id": "INC-LIVE-1029",
        "title": "Checkout Service Pods Crash-Looping with OOMKilled (Exit Code 137)",
        "service": "checkout-service",
        "severity": "SEV-1",
        "status": "investigating",
        "symptom_summary": (
            "Multiple checkout-service pods in prod-commerce are restarting every 18 minutes "
            "with OOMKilled (Exit Code 137) and emitting upstream 502 Bad Gateway errors."
        ),
        "metric_spike": "11 OOMKills | RSS 2,048Mi | 502s",
        "environment": "production",
    },
    {
        "id": "INC-LIVE-1030",
        "title": "Order Worker Kafka Consumer Lag > 88,000 on orders.fulfilled",
        "service": "order-worker",
        "severity": "SEV-2",
        "status": "investigating",
        "symptom_summary": (
            "Kafka consumer group order-worker-prod lag surged past 88,420 messages while "
            "throughput dropped from 420 msg/s to 4.1 msg/s."
        ),
        "metric_spike": "Lag 88,420 msgs | DB query 3,842ms",
        "environment": "production",
    },
]


def seed_initial_corpus(db: Session, *, force: bool = False) -> dict[str, int]:
    """Idempotently populate the 7-source RAG knowledge base and active incident board."""
    existing_docs = int(db.scalar(select(func.count(KnowledgeDocument.id))) or 0)
    vector_store = get_vector_store()
    cache = get_cache_service()

    ingested_docs = 0
    ingested_chunks = 0

    if existing_docs == 0 or force:
        for item in SEED_DOCUMENTS:
            req = KnowledgeIngestRequest(
                id=str(item["id"]),
                title=str(item["title"]),
                source_type=item["source_type"],  # type: ignore[arg-type]
                service=str(item["service"]),
                environment=str(item["environment"]),
                severity=str(item["severity"]),
                version=str(item["version"]) if item.get("version") else None,
                raw_content=str(item["raw_content"]),
                metadata=dict(item.get("metadata", {})),  # type: ignore[arg-type]
            )
            _, n_chunks = vector_store.ingest_document(db, req, invalidate_cache=False)
            ingested_docs += 1
            ingested_chunks += n_chunks

        # Pre-warm Redis Hot-Runbook leaderboard with realistic baseline access counts
        baseline_scores = {
            "RB-DB-POOL-001": 14.0,
            "RB-K8S-OOM-003": 9.0,
            "RB-REDIS-TLS-002": 7.0,
            "RB-KAFKA-LAG-004": 5.0,
        }
        for rb_id, base_score in baseline_scores.items():
            doc = db.get(KnowledgeDocument, rb_id)
            if doc and cache.get_runbook_access_count(rb_id) == 0:
                meta = doc.doc_metadata or {}
                cache.record_runbook_access(
                    rb_id,
                    {
                        "id": doc.id,
                        "title": doc.title,
                        "service": doc.service,
                        "sla_minutes": int(meta.get("sla_minutes", 15)),
                        "summary": str(meta.get("summary") or doc.title),
                        "key_commands": list(meta.get("key_commands", [])),
                        "steps": list(meta.get("steps", [])),
                    },
                    increment=base_score,
                )

    existing_incidents = int(db.scalar(select(func.count(ActiveIncident.id))) or 0)
    seeded_incidents = 0
    if existing_incidents == 0 or force:
        for inc_data in SEED_ACTIVE_INCIDENTS:
            existing_inc = db.get(ActiveIncident, inc_data["id"])
            if existing_inc is None:
                db.add(
                    ActiveIncident(
                        id=inc_data["id"],
                        title=inc_data["title"],
                        service=inc_data["service"],
                        severity=inc_data["severity"],
                        status=inc_data["status"],
                        symptom_summary=inc_data["symptom_summary"],
                        metric_spike=inc_data["metric_spike"],
                        environment=inc_data["environment"],
                        triggered_at=datetime.now(UTC),
                    )
                )
                seeded_incidents += 1
        db.commit()

    return {
        "ingested_documents": ingested_docs,
        "ingested_chunks": ingested_chunks,
        "seeded_incidents": seeded_incidents,
    }
