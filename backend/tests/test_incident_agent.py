"""End-to-end tests for the OPSENTINEL Incident Intelligence Agent and Automated RCA."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_canonical_payment_api_500_investigation_and_redis_cache(client: TestClient) -> None:
    # Flush cache first for deterministic fresh run
    client.post("/api/v1/system/cache/flush")

    query = "Why did the payment API start returning 500 errors after the latest deployment?"
    resp = client.post(
        "/api/v1/investigate",
        json={"query": query, "session_id": "sess-e2e-pay"},
    )
    assert resp.status_code == 200
    data = resp.json()

    # Verify structured 5-pillar output:
    # Possible cause -> Evidence -> Recommended investigation -> Suggested fix -> Relevant runbook
    assert data["cached"] is False
    assert "connection pool" in data["headline_conclusion"].lower()
    assert data["confidence_score"] >= 0.80
    assert data["severity"] == "SEV-1"
    assert "payment-api" in data["affected_services"]

    checklist = data["retrieval_checklist"]
    assert checklist["deployment_logs"] is True
    assert checklist["api_and_error_logs"] is True
    assert checklist["previous_incidents"] is True
    assert checklist["runbooks"] is True

    assert len(data["possible_causes"]) >= 1
    assert len(data["matching_log_patterns"]) >= 3
    assert len(data["evidence"]) >= 4
    assert len(data["recommended_investigation"]) >= 2
    assert "helm rollback" in data["suggested_fix"]["rollback_command"]
    assert data["relevant_runbook"] is not None
    assert data["relevant_runbook"]["id"] == "RB-DB-POOL-001"

    # Repeat identical investigation -> must return Redis cached response
    cached_resp = client.post(
        "/api/v1/investigate",
        json={"query": query, "session_id": "sess-e2e-pay"},
    )
    assert cached_resp.status_code == 200
    assert cached_resp.json()["cached"] is True


def test_automated_root_cause_analysis_updates_active_incident(client: TestClient) -> None:
    rca_resp = client.post(
        "/api/v1/rca",
        json={"incident_id": "INC-LIVE-1028", "bypass_cache": True},
    )
    assert rca_resp.status_code == 200
    rca = rca_resp.json()
    assert rca["mode"] == "auto_rca"
    assert "connection pool" in rca["headline_conclusion"].lower()
    assert len(rca["matching_log_patterns"]) >= 3

    incidents = client.get("/api/v1/incidents").json()
    inc_1028 = next(i for i in incidents if i["id"] == "INC-LIVE-1028")
    assert inc_1028["status"] == "identified"
    assert inc_1028["latest_rca"] is not None


def test_additional_devops_scenarios_oom_and_kafka_lag(client: TestClient) -> None:
    oom_resp = client.post(
        "/api/v1/investigate",
        json={
            "query": "Why are checkout-service pods crash-looping with OOMKilled exit code 137?",
            "bypass_cache": True,
        },
    ).json()
    assert "oomkilled" in oom_resp["headline_conclusion"].lower()
    assert oom_resp["relevant_runbook"]["id"] == "RB-K8S-OOM-003"

    kafka_resp = client.post(
        "/api/v1/investigate",
        json={
            "query": "Why is order-worker Kafka consumer lag exceeding 85,000 messages?",
            "bypass_cache": True,
        },
    ).json()
    assert "lag" in kafka_resp["headline_conclusion"].lower()
    assert kafka_resp["relevant_runbook"]["id"] == "RB-KAFKA-LAG-004"
