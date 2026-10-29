"""FastAPI Analytical Backend for RevLens BI & Interactive SQL Workbench."""

from __future__ import annotations

import json

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from src.build_analytics import PROCESSED_DIR, ensure_warehouse_ready
from src.sql_runner import execute_readonly_query

app = FastAPI(
    title="RevLens Decision Science & BI API",
    version="1.0.0",
    description="Live SQLite Star-Schema Analytical Warehouse, SQL Workbench & Scenario Simulator",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SqlQueryRequest(BaseModel):
    query: str = Field(..., min_length=5, max_length=8000)
    max_rows: int = Field(default=200, ge=1, le=500)


class WhatIfSimulationRequest(BaseModel):
    onboarding_lift_pct: float = Field(default=15.0, ge=0.0, le=30.0)
    sla_breach_reduction_pct: float = Field(default=40.0, ge=0.0, le=80.0)
    annual_migration_pct: float = Field(default=20.0, ge=0.0, le=50.0)
    rollout_hybrid_pricing: bool = Field(default=True)


def _load_bundle() -> dict:
    ensure_warehouse_ready()
    bundle_file = PROCESSED_DIR / "analytics_bundle.json"
    return json.loads(bundle_file.read_text(encoding="utf-8"))


@app.get("/api/health")
def get_health() -> dict:
    db_path = ensure_warehouse_ready()
    bundle = _load_bundle()
    return {
        "status": "healthy",
        "mode": "live_warehouse",
        "warehouse_db": db_path.name,
        "tables": bundle["warehouse_tables"],
        "clean_rows": bundle["data_quality_audit"]["clean_total_rows"],
    }


@app.get("/api/bundle")
def get_analytics_bundle() -> dict:
    return _load_bundle()


@app.post("/api/sql/execute")
def run_sql_query(payload: SqlQueryRequest) -> dict:
    db_path = ensure_warehouse_ready()
    try:
        return execute_readonly_query(db_path, payload.query, max_rows=payload.max_rows)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"SQL Execution Error: {exc}") from exc


@app.post("/api/simulate")
def simulate_what_if(payload: WhatIfSimulationRequest) -> dict:
    bundle = _load_bundle()
    kpis = bundle["headline_kpis"]
    base_arr = float(kpis["ending_arr"])
    arr_at_risk = float(kpis["arr_at_risk_usd"])

    # Empirically calibrated elasticities from warehouse statistical findings
    saved_from_onboarding = arr_at_risk * (payload.onboarding_lift_pct / 30.0) * 0.28
    saved_from_sla = arr_at_risk * (payload.sla_breach_reduction_pct / 80.0) * 0.24
    saved_from_annual = arr_at_risk * (payload.annual_migration_pct / 50.0) * 0.19
    pricing_expansion_arr = base_arr * 0.068 if payload.rollout_hybrid_pricing else 0.0

    total_arr_uplift = round(
        saved_from_onboarding + saved_from_sla + saved_from_annual + pricing_expansion_arr, 2
    )
    projected_arr = round(base_arr + total_arr_uplift, 2)
    projected_nrr = round(
        float(kpis["annualized_nrr_pct"]) + (total_arr_uplift / max(base_arr, 1.0)) * 100.0 * 0.65,
        1,
    )

    return {
        "baseline_arr": base_arr,
        "projected_arr": projected_arr,
        "total_incremental_arr": total_arr_uplift,
        "baseline_annualized_nrr_pct": kpis["annualized_nrr_pct"],
        "projected_annualized_nrr_pct": projected_nrr,
        "drivers": {
            "onboarding_saved_arr": round(saved_from_onboarding, 2),
            "sla_saved_arr": round(saved_from_sla, 2),
            "annual_prepay_saved_arr": round(saved_from_annual, 2),
            "hybrid_pricing_expansion_arr": round(pricing_expansion_arr, 2),
        },
    }
