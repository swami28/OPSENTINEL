"""Automated Data Quality, SQL Accounting Identity, Statistical & API Test Suite."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from src.api import app
from src.build_analytics import WAREHOUSE_DB, build_all_artifacts
from src.sql_runner import execute_readonly_query, validate_readonly_sql


@pytest.fixture(scope="module")
def analytics_bundle() -> dict:
    return build_all_artifacts(write_notebook=False)


def test_etl_data_quality_and_remediation(analytics_bundle: dict) -> None:
    dq = analytics_bundle["data_quality_audit"]
    assert dq["pipeline_status"] == "PASSED"
    assert dq["post_etl_health_score_pct"] == 100.0
    assert dq["total_anomalies_remediated"] >= 70
    assert len(dq["checks"]) == 6

    # Verify zero out-of-bounds utilization rows remain in SQLite warehouse
    bad_util = execute_readonly_query(
        WAREHOUSE_DB,
        "SELECT COUNT(*) AS cnt FROM fact_product_usage WHERE seat_utilization_pct < 0 OR seat_utilization_pct > 100",
    )
    assert bad_util["rows"][0]["cnt"] == 0

    # Verify zero orphan support tickets remain
    orphans = execute_readonly_query(
        WAREHOUSE_DB,
        """
        SELECT COUNT(*) AS cnt
        FROM fact_support_tickets t
        LEFT JOIN dim_accounts a ON t.account_id = a.account_id
        WHERE a.account_id IS NULL
        """,
    )
    assert orphans["rows"][0]["cnt"] == 0


def test_mrr_waterfall_accounting_identity(analytics_bundle: dict) -> None:
    waterfall = analytics_bundle["mrr_waterfall"]
    assert len(waterfall) == 18

    for row in waterfall:
        reconstructed = round(
            row["beginning_mrr"]
            + row["new_mrr"]
            + row["expansion_mrr"]
            - row["contraction_mrr"]
            - row["churned_mrr"],
            2,
        )
        assert abs(reconstructed - row["ending_mrr"]) <= 0.05, f"Mismatch in {row['month']}"
        assert round(row["ending_mrr"] * 12.0, 2) == row["ending_arr"]


def test_sql_workbench_readonly_guardrails() -> None:
    valid_cte = "WITH c AS (SELECT segment, COUNT(*) AS n FROM dim_accounts GROUP BY 1) SELECT * FROM c;"
    assert validate_readonly_sql(valid_cte).startswith("WITH")

    for malicious in [
        "DROP TABLE dim_accounts",
        "DELETE FROM fact_mrr_monthly WHERE 1=1",
        "SELECT * FROM dim_accounts; DROP TABLE dim_accounts;",
        "PRAGMA table_info(dim_accounts)",
        "INSERT INTO dim_accounts VALUES ('x')",
    ]:
        with pytest.raises(ValueError):
            validate_readonly_sql(malicious)


def test_statistical_rigor_and_forecast_bounds(analytics_bundle: dict) -> None:
    tests = analytics_bundle["hypothesis_tests"]
    assert len(tests) == 4
    for ht in tests:
        assert ht["significant"] is True
        assert 0.0 <= ht["p_value"] < 0.05

    cm = analytics_bundle["churn_model"]
    assert 0.70 <= cm["cv_roc_auc"] <= 0.95
    assert cm["high_risk_account_count"] > 0
    assert len(cm["feature_importance"]) == 7

    for pt in analytics_bundle["forecast"]["points"]:
        assert pt["lower_95_mrr"] <= pt["projected_mrr"] <= pt["upper_95_mrr"]


def test_fastapi_endpoints() -> None:
    client = TestClient(app)

    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "healthy"

    sql_ok = client.post(
        "/api/sql/execute",
        json={"query": "SELECT segment, COUNT(*) AS accounts FROM dim_accounts GROUP BY segment ORDER BY accounts DESC"},
    )
    assert sql_ok.status_code == 200
    assert sql_ok.json()["row_count"] == 3

    sql_blocked = client.post("/api/sql/execute", json={"query": "DROP TABLE dim_accounts"})
    assert sql_blocked.status_code == 400

    sim = client.post(
        "/api/simulate",
        json={
            "onboarding_lift_pct": 20.0,
            "sla_breach_reduction_pct": 50.0,
            "annual_migration_pct": 25.0,
            "rollout_hybrid_pricing": True,
        },
    )
    assert sim.status_code == 200
    body = sim.json()
    assert body["projected_arr"] > body["baseline_arr"]
    assert body["total_incremental_arr"] > 0
