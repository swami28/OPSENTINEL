"""SQL Warehouse Query Runner & Safe Read-Only Workbench Executor."""

from __future__ import annotations

import re
import sqlite3
import time
from pathlib import Path

FORBIDDEN_SQL_PATTERN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|ATTACH|DETACH|PRAGMA|VACUUM)\b",
    re.IGNORECASE,
)

PRESET_QUERIES = [
    {
        "id": "mrr_waterfall",
        "title": "02 — Monthly MRR Waterfall, NRR % & Quick Ratio",
        "filename": "02_mrr_waterfall_movements.sql",
        "description": "CTEs + LAG() & rolling window functions tracking New, Expansion, Contraction, and Churned MRR.",
    },
    {
        "id": "cohort_retention",
        "title": "03 — Quarterly Cohort Logo & Dollar NRR Matrix",
        "filename": "03_cohort_retention_matrix.sql",
        "description": "Cohort retention matrix tracking logo survival % and dollar expansion from M0 to M11.",
    },
    {
        "id": "rfm_segmentation",
        "title": "04 — B2B RFM & Seat Utilization Customer Segments",
        "filename": "04_rfm_customer_segmentation.sql",
        "description": "NTILE(5) window scoring across Engagement, Workflow Frequency, and ARR Monetary tiers.",
    },
    {
        "id": "channel_economics",
        "title": "05 — Acquisition Channel LTV, CAC & Payback Period",
        "filename": "05_channel_unit_economics.sql",
        "description": "Gross-margin-adjusted SaaS LTV:CAC and CAC payback months across GTM channels.",
    },
    {
        "id": "churn_drivers",
        "title": "06 — Multi-Factor Churn Risk Cohort Drivers",
        "filename": "06_churn_risk_drivers.sql",
        "description": "Cross-tabulates Billing Cadence x 14-Day Onboarding x Support SLA Breaches against lost ARR.",
    },
]


def validate_readonly_sql(query: str) -> str:
    """Validate that `query` is a single read-only SELECT or WITH statement."""
    cleaned = query.strip()
    if not cleaned:
        raise ValueError("SQL query cannot be empty.")

    # Strip SQL comments before checking leading keyword & semicolons
    no_comments = re.sub(r"--[^\n]*", "", cleaned)
    no_comments = re.sub(r"/\*.*?\*/", "", no_comments, flags=re.DOTALL).strip()
    if no_comments.endswith(";"):
        no_comments = no_comments[:-1].strip()

    if ";" in no_comments:
        raise ValueError("Only a single read-only SELECT or WITH query is permitted.")

    first_token = no_comments.split(None, 1)[0].upper() if no_comments else ""
    if first_token not in {"SELECT", "WITH"}:
        raise ValueError("Only read-only SELECT or WITH (CTE) queries are allowed.")

    if FORBIDDEN_SQL_PATTERN.search(no_comments):
        raise ValueError("Write/DDL keywords are blocked in the read-only SQL Workbench.")

    return cleaned


def execute_readonly_query(db_path: Path, query: str, max_rows: int = 250) -> dict:
    """Execute a read-only SQL query against the SQLite analytical warehouse."""
    validated = validate_readonly_sql(query)
    t0 = time.perf_counter()

    uri = f"file:{db_path.resolve()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.execute(validated)
        columns = [desc[0] for desc in (cur.description or [])]
        fetched = cur.fetchmany(max_rows)
        rows = [dict(r) for r in fetched]
    finally:
        conn.close()

    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    return {
        "columns": columns,
        "rows": rows,
        "row_count": len(rows),
        "execution_ms": elapsed_ms,
    }


def load_all_preset_sql_results(sql_dir: Path, db_path: Path) -> list[dict]:
    """Load SQL text and pre-computed query output for all 5 analytical presets."""
    presets_out: list[dict] = []
    for item in PRESET_QUERIES:
        sql_text = (sql_dir / item["filename"]).read_text(encoding="utf-8")
        res = execute_readonly_query(db_path, sql_text, max_rows=300)
        presets_out.append(
            {
                "id": item["id"],
                "title": item["title"],
                "filename": item["filename"],
                "description": item["description"],
                "sql": sql_text,
                "columns": res["columns"],
                "rows": res["rows"],
                "row_count": res["row_count"],
                "execution_ms": res["execution_ms"],
            }
        )
    return presets_out
