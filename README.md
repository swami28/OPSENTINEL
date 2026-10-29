# 🛡️ OPSENTINEL — AI DevOps Incident Intelligence & Root Cause Analysis Agent

[![OPSENTINEL CI/CD Pipeline](https://github.com/swami28/OPSENTINEL/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/swami28/OPSENTINEL/actions/workflows/ci-cd.yml)
![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688?logo=fastapi&logoColor=white)
![React 18](https://img.shields.io/badge/React-18%20%2B%20TypeScript-61DAFB?logo=react&logoColor=black)
![PostgreSQL + pgvector](https://img.shields.io/badge/PostgreSQL_16-pgvector_HNSW-4169E1?logo=postgresql&logoColor=white)
![Redis 7](https://img.shields.io/badge/Redis_7-Cache_%26_Sessions-DC382D?logo=redis&logoColor=white)

**OPSENTINEL** is an AI-powered Site Reliability Engineering (SRE) & DevOps Incident Intelligence platform that accelerates initial production triage and Root Cause Analysis (RCA).

Feed OPSENTINEL operational telemetry across **7 distinct knowledge silos**:
1. **Application Logs** (`application_log`)
2. **Error Logs** (`error_log`)
3. **Deployment History & Config Diffs** (`deployment`)
4. **Historical Incident Postmortems** (`incident`)
5. **SRE Runbooks** (`runbook`)
6. **System Architecture Documentation** (`architecture`)
7. **Troubleshooting Guides** (`troubleshooting`)

Then ask natural-language incident questions such as:
> *"Why did the payment API start returning 500 errors after the latest deployment?"*

OPSENTINEL executes stratified hybrid vector + lexical retrieval over **PostgreSQL + `pgvector`**, clusters matching log anomaly signatures, correlates deployment timestamps, tracks session & hot-runbook state in **Redis**, and generates a structured **5-Pillar Incident Response Report**:

> **1. Possible Cause → 2. Evidence (Matching Log Patterns) → 3. Recommended Investigation → 4. Suggested Fix → 5. Relevant Runbook**

---

## 🏗️ System Architecture

```text
                       ┌──────────────────────────────────────┐
                       │     React 18 + TypeScript Dashboard  │
                       │  (Investigator • Auto-RCA • Vault)   │
                       └──────────────────┬───────────────────┘
                                          │ /api/v1/*
                                          ▼
                       ┌──────────────────────────────────────┐
                       │            FastAPI Gateway           │
                       └─────────┬──────────────────┬─────────┘
                                 │                  │
                                 ▼                  ▼
                  ┌──────────────────────┐  ┌─────────────────────────────┐
                  │   Incident Agent     │  │          Redis 7            │
                  │  • Query Planner     │◄─┤  • Incident Sessions (TTL)  │
                  │  • Log Correlator    │  │  • Cached RAG/RCA Queries   │
                  │  • Runbook Matcher   │  │  • Hot Runbooks (ZINCRBY)   │
                  └──────────┬───────────┘  └─────────────────────────────┘
                             │
                             ▼
                  ┌──────────────────────────────────────┐
                  │       Stratified RAG Pipeline        │
                  ├──────────────────────────────────────┤
                  │  • Application & Error Logs          │
                  │  • Deployment History                │
                  │  • Incident Postmortems              │
                  │  • SRE Runbooks & Troubleshooting    │
                  │  • System Architecture Docs          │
                  └──────────────────┬───────────────────┘
                                     │ 384-d Embeddings + Hybrid RRF
                                     ▼
                  ┌──────────────────────────────────────┐
                  │      PostgreSQL 16 + pgvector        │
                  │   HNSW Index (vector_cosine_ops)     │
                  └──────────────────┬───────────────────┘
                                     │
                                     ▼
                  ┌──────────────────────────────────────┐
                  │   LLM / Causal Evidence Synthesizer  │
                  │  (OpenAI-Compatible + Built-in SRE)  │
                  └──────────────────────────────────────┘
```

---

## ⚡ Flagship Capabilities

### 1. Natural-Language Incident Investigation (`POST /api/v1/investigate`)
- **Stratified Multi-Silo RAG Retrieval**: Ensures noisy error log streams never drown out critical deployment diffs, architecture invariants, or SRE runbooks.
- **Hybrid `pgvector` + Lexical Scoring**: Combines 384-dimensional cosine similarity (`1 - (embedding <=> query_vec)`) over PostgreSQL `pgvector` HNSW indexes with BM25-inspired keyword overlap and microservice entity boosting.
- **Execution Pipeline Trace**: Exposes per-stage latency telemetry (`Redis Lookup → Query Planner → pgvector Hybrid Search → Log Correlator → RCA Synthesis`).

### 2. One-Click Automated Root Cause Analysis (`POST /api/v1/rca`)
Example active incident workflow:
- **Incident**: `Payment API HTTP 500 Errors Increased +312% After v2.15.0 Deployment`
- **AI Retrieves**: `✓ deployment logs` • `✓ API & error logs` • `✓ previous incidents` • `✓ SRE runbook` • `✓ architecture docs`
- **AI Conclusion**: PostgreSQL `QueuePool` connection pool exhaustion (`DB_POOL_MAX_SIZE` reduced `50 → 15` while holding DB transactions open across synchronous ~450ms `fraud-scoring-svc` RPCs)
- **Correlated Evidence**: `3 matching log patterns` (`QueuePool limit of size 15`, `TooManyConnectionsError`, `idle-in-transaction > 2850ms`)
- **Recommended Action**: Immediate rollback (`helm rollback payment-api 41 -n prod-payments --wait`) + move external RPC outside `db.session.begin()` (`RB-DB-POOL-001`).

### 3. Redis Operational State Layer
- **Incident Investigation Sessions (`opsentinel:session:{id}`)**: Multi-turn memory preserving service context and investigation history with sliding TTLs.
- **RAG & RCA Query Cache (`opsentinel:query_cache:{sha256}`)**: Sub-millisecond repeat investigation responses with automatic cache invalidation whenever new logs, deployments, or runbooks are ingested.
- **Hot Runbooks Leaderboard (`opsentinel:runbooks:hot`)**: Redis Sorted Set (`ZINCRBY` / `ZREVRANGE`) tracking and pre-warming the team's most frequently consulted SRE runbooks.

### 4. Pluggable LLM & Embedding Engine
- Works **100% out-of-the-box with zero external API keys** via the deterministic 384-d DevOps Semantic Vectorizer and Evidence-Grounded SRE Synthesizer.
- Seamlessly upgrades to any **OpenAI-compatible LLM** (`gpt-4o`, `gpt-4o-mini`, Ollama, Groq, OpenRouter, vLLM) via `.env` or live at runtime in the **System Architecture** tab.

---

## 🚀 Quickstart

### Option A: Full Containerized Stack via Docker Compose (Recommended)
Starts **Frontend (Nginx + React)**, **Backend (FastAPI)**, **PostgreSQL 16 (`pgvector`)**, and **Redis 7**:

```bash
cp .env.example .env
docker compose up -d --build
```

- **React SRE Dashboard**: [http://localhost:3000](http://localhost:3000)
- **FastAPI Interactive OpenAPI Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Probe**: [http://localhost:3000/api/v1/system/health](http://localhost:3000/api/v1/system/health)

### Option B: Local Standalone Development (Zero Docker Required)
When local PostgreSQL/Redis daemons are not running, OPSENTINEL automatically provisions a local SQLite + NumPy 384-d vector index and in-process FakeRedis state engine:

```bash
# 1. Start FastAPI Backend (seeds 7-source telemetry corpus on startup)
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 2. Start React + Vite Dashboard (in a second terminal)
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## 🔌 REST API Overview

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/investigate` | Run natural-language DevOps incident investigation (5-pillar RCA + trace) |
| `POST` | `/api/v1/rca` | Execute automated AI Root Cause Analysis for an active or ad-hoc incident |
| `GET` | `/api/v1/incidents` | List active & historical production incidents |
| `POST` | `/api/v1/incidents` | Declare or simulate a new production incident |
| `PATCH` | `/api/v1/incidents/{id}/status` | Update incident lifecycle (`investigating` → `identified` → `mitigated` → `resolved`) |
| `GET` | `/api/v1/knowledge` | List & filter ingested RAG artifacts across all 7 telemetry sources |
| `POST` | `/api/v1/knowledge` | Chunk, 384-d embed, and index new logs, deployments, runbooks, or docs |
| `POST` | `/api/v1/knowledge/search` | Direct hybrid `pgvector` + lexical similarity inspector |
| `GET` | `/api/v1/runbooks` | List SRE runbooks ranked by Redis `ZSET` hot-access score |
| `GET` | `/api/v1/runbooks/{id}` | Retrieve full runbook and increment Redis `ZINCRBY` access counter |
| `GET` | `/api/v1/sessions` | Inspect active Redis multi-turn incident sessions |
| `GET` | `/api/v1/system/telemetry` | Live metrics across PostgreSQL/`pgvector`, Redis cache, RAG corpus & LLM |
| `POST` | `/api/v1/system/cache/flush` | Evict cached RAG/RCA queries from Redis |

---

## 🧪 Testing & CI/CD Pipeline

Run the full test and lint suite locally:

```bash
# Backend lint + unit/integration tests
cd backend
ruff check app tests
pytest -v --cov=app

# Frontend TypeScript check + Vitest suite + production bundle verification
cd ../frontend
npm run typecheck
npm test
npm run build
```

### GitHub Actions Workflow (`.github/workflows/ci-cd.yml`)
Every push & pull request executes a 4-stage production pipeline:
1. **Tests**: Provisions real `pgvector/pgvector:pg16` and `redis:7-alpine` service containers, runs `ruff` + `pytest --cov=app`, and executes `tsc --noEmit` + `vitest`.
2. **Build**: Compiles and archives the production React SPA bundle.
3. **Docker Image & Compose Smoke Test**: Builds `opsentinel-backend` and `opsentinel-frontend` images, boots the 4-container `docker compose` stack, verifies native `pgvector` health and E2E `/api/v1/investigate` accuracy, and publishes tagged images to `ghcr.io` on `main`.
4. **Deployment**: Validates production manifests, triggers optional rollout webhook, and publishes a step summary report.
