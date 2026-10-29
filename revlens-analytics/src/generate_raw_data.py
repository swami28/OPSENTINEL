"""Deterministic generator for realistic, messy B2B SaaS raw operational CSVs.

Simulates 620 B2B SaaS customer accounts over an 18-month window (2025-04 to 2026-09)
across 5 raw source tables, embedding realistic business dynamics AND real-world data
quality anomalies (duplicates, date format drift, casing noise, missing attributes,
telemetry outliers, and orphan test records) for the ETL pipeline to audit and clean.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

MONTHS = [
    "2025-04",
    "2025-05",
    "2025-06",
    "2025-07",
    "2025-08",
    "2025-09",
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
]

COMPANY_PREFIXES = [
    "Apex", "Vertex", "Nova", "Stratos", "Pulse", "Vanguard", "Kinetix", "CloudBridge",
    "DataForge", "Aether", "Helios", "Cipher", "Nexus", "Vector", "Metric", "Quantum",
    "Cobalt", "Synapse", "Atlas", "Prism", "Beacon", "Hyperion", "Nimbus", "Zenith",
]
COMPANY_SUFFIXES = [
    "Systems", "Labs", "Cloud", "Technologies", "AI", "Analytics", "Networks", "Dynamics",
    "Health", "FinTech", "Logistics", "Security", "Commerce", "Software", "Ops", "Group",
]
INDUSTRIES = [
    "FinTech", "HealthTech", "E-Commerce", "DevTools", "Cybersecurity", "Supply Chain", "B2B SaaS"
]
REGIONS = ["North America", "EMEA", "APAC", "LATAM"]
REGION_WEIGHTS = [0.48, 0.27, 0.16, 0.09]

CHANNELS = [
    "Product-Led Organic",
    "Outbound SDR",
    "Paid Search",
    "Partner Referral",
    "Events & Webinars",
]
CHANNEL_WEIGHTS = [0.34, 0.24, 0.20, 0.12, 0.10]

CHANNEL_CAC_BASE = {
    "Product-Led Organic": 6200.0,
    "Partner Referral": 9800.0,
    "Paid Search": 15400.0,
    "Events & Webinars": 16800.0,
    "Outbound SDR": 22500.0,
}


def _month_to_quarter(ym: str) -> str:
    year, month_str = ym.split("-")
    q = (int(month_str) - 1) // 3 + 1
    return f"{year}-Q{q}"


def generate_raw_datasets(raw_dir: Path, seed: int = 42) -> dict[str, int]:
    """Generate messy raw CSVs into `raw_dir` and return row counts per table."""
    raw_dir.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed)

    n_accounts = 620
    # Seed an established base in 2025-04 (~32% of accounts) + steady monthly cohorts
    signup_weights = np.array([6.5] + list(np.linspace(0.85, 1.35, len(MONTHS) - 1)))
    signup_weights /= signup_weights.sum()

    accounts_rows: list[dict] = []
    mrr_rows: list[dict] = []
    usage_rows: list[dict] = []
    ticket_rows: list[dict] = []

    ticket_counter = 1000

    for idx in range(1, n_accounts + 1):
        account_id = f"ACC-{idx:04d}"
        company_name = (
            f"{COMPANY_PREFIXES[idx % len(COMPANY_PREFIXES)]} "
            f"{COMPANY_SUFFIXES[(idx * 7) % len(COMPANY_SUFFIXES)]} {idx}"
        )

        segment = str(rng.choice(["SMB", "Mid-Market", "Enterprise"], p=[0.52, 0.33, 0.15]))
        region = str(rng.choice(REGIONS, p=REGION_WEIGHTS))
        industry = str(rng.choice(INDUSTRIES))
        channel = str(rng.choice(CHANNELS, p=CHANNEL_WEIGHTS))

        signup_m_idx = int(rng.choice(len(MONTHS), p=signup_weights))
        signup_month = MONTHS[signup_m_idx]
        signup_day = int(rng.integers(1, 28))
        signup_date = f"{signup_month}-{signup_day:02d}"

        if segment == "Enterprise":
            billing_cadence = str(rng.choice(["Annual", "Monthly"], p=[0.84, 0.16]))
            plan_tier = str(rng.choice(["Enterprise", "Scale"], p=[0.78, 0.22]))
            employee_count = int(rng.integers(450, 4200))
            licensed_seats = int(rng.integers(45, 220))
            base_mrr = float(np.round(licensed_seats * rng.uniform(42.0, 62.0), 2))
            seg_cac_mult = 2.55
        elif segment == "Mid-Market":
            billing_cadence = str(rng.choice(["Annual", "Monthly"], p=[0.64, 0.36]))
            plan_tier = str(rng.choice(["Scale", "Growth"], p=[0.60, 0.40]))
            employee_count = int(rng.integers(80, 449))
            licensed_seats = int(rng.integers(15, 55))
            base_mrr = float(np.round(licensed_seats * rng.uniform(30.0, 44.0), 2))
            seg_cac_mult = 1.25
        else:
            billing_cadence = str(rng.choice(["Annual", "Monthly"], p=[0.36, 0.64]))
            plan_tier = str(rng.choice(["Growth", "Starter"], p=[0.45, 0.55]))
            employee_count = int(rng.integers(8, 79))
            licensed_seats = int(rng.integers(4, 18))
            base_mrr = float(np.round(licensed_seats * rng.uniform(22.0, 34.0), 2))
            seg_cac_mult = 0.55

        cac_usd = float(
            np.round(CHANNEL_CAC_BASE[channel] * seg_cac_mult * rng.uniform(0.82, 1.20), 2)
        )

        # Onboarding completion depends on channel & segment
        onb_prob = 0.78 if billing_cadence == "Annual" else 0.61
        if channel in ("Product-Led Organic", "Partner Referral"):
            onb_prob += 0.08
        onboarding_completed = int(rng.random() < min(0.93, onb_prob))
        onboarding_days = (
            float(np.round(rng.uniform(3.0, 13.8), 1))
            if onboarding_completed == 1
            else float(np.round(rng.uniform(15.0, 38.0), 1))
        )

        # Latent account health factor driving usage, support & expansion
        health_latent = float(rng.normal(0.64 if onboarding_completed else 0.38, 0.16))
        health_latent = float(np.clip(health_latent, 0.08, 0.98))

        accounts_rows.append(
            {
                "account_id": account_id,
                "company_name": company_name,
                "segment": segment,
                "industry": industry,
                "region": region,
                "acquisition_channel": channel,
                "signup_date": signup_date,
                "signup_month": signup_month,
                "signup_quarter": _month_to_quarter(signup_month),
                "billing_cadence": billing_cadence,
                "plan_tier": plan_tier,
                "employee_count": employee_count,
                "licensed_seats": licensed_seats,
                "cac_usd": cac_usd,
                "onboarding_completed": onboarding_completed,
                "onboarding_days": onboarding_days,
            }
        )

        prev_mrr = 0.0
        churned = False

        for m_idx in range(signup_m_idx, len(MONTHS)):
            if churned:
                break

            month = MONTHS[m_idx]
            months_since = m_idx - signup_m_idx

            # Simulate monthly support tickets first because SLA breaches influence churn
            expected_tickets = 0.38 if segment == "SMB" else (0.72 if segment == "Mid-Market" else 1.15)
            n_tickets = int(rng.poisson(expected_tickets))
            monthly_sla_breaches = 0

            for _ in range(n_tickets):
                ticket_counter += 1
                sev = str(rng.choice(["P3-Normal", "P2-High", "P1-Critical"], p=[0.62, 0.28, 0.10]))
                # Worse health accounts experience slightly more complex/escalated tickets
                breach_prob = 0.14 if health_latent > 0.55 else 0.36
                sla_breached = int(rng.random() < breach_prob)
                monthly_sla_breaches += sla_breached

                first_resp = (
                    float(np.round(rng.uniform(8.5, 26.0), 2))
                    if sla_breached
                    else float(np.round(rng.uniform(0.4, 7.5), 2))
                )
                resolution_hrs = float(np.round(first_resp + rng.uniform(2.0, 32.0), 2))
                csat = (
                    int(rng.choice([1, 2, 3], p=[0.40, 0.40, 0.20]))
                    if sla_breached
                    else int(rng.choice([3, 4, 5], p=[0.12, 0.42, 0.46]))
                )
                t_day = int(rng.integers(1, 28))
                ticket_rows.append(
                    {
                        "ticket_id": f"TKT-{ticket_counter:05d}",
                        "account_id": account_id,
                        "created_date": f"{month}-{t_day:02d}",
                        "month": month,
                        "severity": sev,
                        "first_response_hours": first_resp,
                        "resolution_hours": resolution_hrs,
                        "sla_breached": sla_breached,
                        "csat_score": csat,
                    }
                )

            # Usage telemetry
            seat_util = float(
                np.clip(rng.normal(health_latent * 102.0, 12.0), 8.0, 100.0)
            )
            active_users = max(1, int(round((seat_util / 100.0) * licensed_seats)))
            workflow_events = int(
                max(5, round(active_users * rng.uniform(18.0, 52.0) * (0.5 + health_latent)))
            )
            api_calls = int(workflow_events * rng.uniform(6.0, 22.0))
            auto_rules = int(max(0, round(health_latent * (12 if segment == "Enterprise" else 6) + rng.normal(0, 1.2))))
            adoption_score = float(
                np.round(
                    np.clip(0.55 * seat_util + 2.8 * min(auto_rules, 12) + rng.normal(6.0, 5.0), 5.0, 99.5),
                    1,
                )
            )

            # MRR movements
            if months_since == 0:
                beg_mrr = 0.0
                new_mrr = base_mrr
                exp_mrr = 0.0
                con_mrr = 0.0
                chu_mrr = 0.0
                end_mrr = base_mrr
                is_active = 1
                churn_flag = 0
                churn_reason = ""
            else:
                beg_mrr = prev_mrr
                new_mrr = 0.0

                # Compute monthly churn hazard from causal operational drivers
                hazard = 0.004
                if onboarding_completed == 0:
                    hazard += 0.032
                if billing_cadence == "Monthly":
                    hazard += 0.025
                elif months_since < 12:
                    # Annual contracts rarely break mid-term prior to Month-12 renewal
                    hazard *= 0.18
                if seat_util < 45.0:
                    hazard += 0.036
                if monthly_sla_breaches >= 1:
                    hazard += 0.042 * monthly_sla_breaches
                if segment == "Enterprise":
                    hazard *= 0.30
                elif segment == "Mid-Market":
                    hazard *= 0.62

                if rng.random() < min(hazard, 0.38):
                    exp_mrr = 0.0
                    con_mrr = 0.0
                    chu_mrr = beg_mrr
                    end_mrr = 0.0
                    is_active = 0
                    churn_flag = 1
                    churned = True
                    if monthly_sla_breaches >= 1:
                        churn_reason = "Support SLA Dissatisfaction"
                    elif onboarding_completed == 0 or seat_util < 45.0:
                        churn_reason = "Low Seat Adoption"
                    elif billing_cadence == "Monthly":
                        churn_reason = "Budget Consolidation"
                    else:
                        churn_reason = "Competitor Switch"
                else:
                    churn_flag = 0
                    is_active = 1
                    churn_reason = ""
                    chu_mrr = 0.0

                    # Expansion vs Contraction (healthy B2B seat expansion ~108% NRR)
                    exp_prob = 0.28 if (seat_util >= 70.0 and adoption_score >= 58.0) else 0.06
                    con_prob = 0.05 if seat_util < 45.0 else 0.013
                    roll = rng.random()
                    if roll < exp_prob:
                        exp_mrr = float(np.round(beg_mrr * rng.uniform(0.10, 0.21), 2))
                        con_mrr = 0.0
                    elif roll < exp_prob + con_prob:
                        exp_mrr = 0.0
                        con_mrr = float(np.round(beg_mrr * rng.uniform(0.05, 0.13), 2))
                    else:
                        exp_mrr = 0.0
                        con_mrr = 0.0

                    end_mrr = float(np.round(beg_mrr + exp_mrr - con_mrr, 2))

            prev_mrr = end_mrr

            mrr_rows.append(
                {
                    "snapshot_id": f"MRR-{account_id}-{month}",
                    "account_id": account_id,
                    "month": month,
                    "months_since_signup": months_since,
                    "beginning_mrr": beg_mrr,
                    "new_mrr": new_mrr,
                    "expansion_mrr": exp_mrr,
                    "contraction_mrr": con_mrr,
                    "churned_mrr": chu_mrr,
                    "ending_mrr": end_mrr,
                    "is_active": is_active,
                    "churn_flag": churn_flag,
                    "churn_reason": churn_reason,
                }
            )

            if is_active == 1:
                usage_rows.append(
                    {
                        "usage_id": f"USG-{account_id}-{month}",
                        "account_id": account_id,
                        "month": month,
                        "active_users": active_users,
                        "seat_utilization_pct": float(np.round(seat_util, 1)),
                        "core_workflow_events": workflow_events,
                        "api_calls": api_calls,
                        "automation_rules_enabled": auto_rules,
                        "feature_adoption_score": adoption_score,
                    }
                )

    # Generate Stratified A/B Pricing Experiment trials (N = 840, 420 per arm)
    rng_ab = np.random.default_rng(seed + 101)
    ab_rows: list[dict] = []
    paired_segments = [
        str(rng_ab.choice(["SMB", "Mid-Market", "Enterprise"], p=[0.58, 0.30, 0.12]))
        for _ in range(420)
    ]
    for t_idx in range(1, 841):
        variant = "Control_Flat_Seat" if t_idx % 2 == 1 else "Treatment_Usage_Hybrid"
        seg = paired_segments[(t_idx - 1) // 2]
        week = f"2026-W{(t_idx % 12) + 24:02d}"
        conv_prob = 0.158 if variant == "Control_Flat_Seat" else 0.242
        converted = int(rng_ab.random() < conv_prob)
        if converted:
            base_val = 420.0 if seg == "SMB" else (1380.0 if seg == "Mid-Market" else 4400.0)
            uplift = 1.16 if variant == "Treatment_Usage_Hybrid" else 1.0
            init_mrr = float(np.round(base_val * uplift * rng_ab.uniform(0.82, 1.24), 2))
            ret_prob = 0.80 if variant == "Control_Flat_Seat" else 0.89
            retained = int(rng_ab.random() < ret_prob)
        else:
            init_mrr = 0.0
            retained = 0

        ab_rows.append(
            {
                "trial_id": f"EXP-{t_idx:04d}",
                "cohort_week": week,
                "variant": variant,
                "segment": seg,
                "converted": converted,
                "initial_mrr": init_mrr,
                "day_60_retained": retained,
            }
        )

    df_acc = pd.DataFrame(accounts_rows)
    df_mrr = pd.DataFrame(mrr_rows)
    df_usg = pd.DataFrame(usage_rows)
    df_tkt = pd.DataFrame(ticket_rows)
    df_ab = pd.DataFrame(ab_rows)

    # =========================================================================
    # Inject Realistic Raw Data Quality Anomalies for ETL Cleaning Audit
    # =========================================================================
    # 1. Mixed casing & whitespace in region / segment
    dirty_reg_idx = rng.choice(df_acc.index, size=24, replace=False)
    df_acc.loc[dirty_reg_idx[:12], "region"] = "  " + df_acc.loc[dirty_reg_idx[:12], "region"].str.lower() + " "
    df_acc.loc[dirty_reg_idx[12:], "segment"] = df_acc.loc[dirty_reg_idx[12:], "segment"].str.lower()

    # 2. Non-ISO signup_date formats (MM/DD/YYYY)
    slash_idx = rng.choice(df_acc.index, size=19, replace=False)
    for i in slash_idx:
        y, m, d = str(df_acc.loc[i, "signup_date"]).split("-")
        df_acc.loc[i, "signup_date"] = f"{m}/{d}/{y}"

    # 3. Missing industry & employee_count nulls
    df_acc["employee_count"] = df_acc["employee_count"].astype("object")
    null_ind_idx = rng.choice(df_acc.index, size=14, replace=False)
    null_emp_idx = rng.choice(df_acc.index, size=11, replace=False)
    df_acc.loc[null_ind_idx, "industry"] = np.nan
    df_acc.loc[null_emp_idx, "employee_count"] = np.nan

    # 4. Exact duplicate rows in raw_mrr_ledger & raw_product_usage
    dup_mrr = df_mrr.sample(n=15, random_state=seed)
    df_mrr = pd.concat([df_mrr, dup_mrr], ignore_index=True)

    dup_usg = df_usg.sample(n=12, random_state=seed + 1)
    df_usg = pd.concat([df_usg, dup_usg], ignore_index=True)

    # 5. Telemetry sensor spikes (seat_utilization_pct > 100 or < 0)
    spike_idx = rng.choice(df_usg.index, size=16, replace=False)
    df_usg.loc[spike_idx[:10], "seat_utilization_pct"] = 138.4
    df_usg.loc[spike_idx[10:], "seat_utilization_pct"] = -4.5

    # 6. Orphan QA/staging support tickets referencing non-existent account IDs
    orphan_tickets = pd.DataFrame(
        [
            {
                "ticket_id": f"TKT-QA-{k:02d}",
                "account_id": "ACC-STAGE-9999",
                "created_date": "2026-06-15",
                "month": "2026-06",
                "severity": "P3-Normal",
                "first_response_hours": 1.2,
                "resolution_hours": 4.0,
                "sla_breached": 0,
                "csat_score": 5,
            }
            for k in range(1, 8)
        ]
    )
    df_tkt = pd.concat([df_tkt, orphan_tickets], ignore_index=True)

    df_acc.to_csv(raw_dir / "raw_accounts.csv", index=False)
    df_mrr.to_csv(raw_dir / "raw_mrr_ledger.csv", index=False)
    df_usg.to_csv(raw_dir / "raw_product_usage.csv", index=False)
    df_tkt.to_csv(raw_dir / "raw_support_tickets.csv", index=False)
    df_ab.to_csv(raw_dir / "raw_pricing_experiment.csv", index=False)

    return {
        "raw_accounts": len(df_acc),
        "raw_mrr_ledger": len(df_mrr),
        "raw_product_usage": len(df_usg),
        "raw_support_tickets": len(df_tkt),
        "raw_pricing_experiment": len(df_ab),
    }
