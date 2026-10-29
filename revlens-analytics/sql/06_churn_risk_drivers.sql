-- =============================================================================
-- Query 06: Multi-Factor Churn Risk Cohort Drivers (Onboarding x SLA x Cadence)
-- Business Question: Which operational combinations multiply customer churn risk?
-- =============================================================================

WITH account_summary AS (
    SELECT
        a.account_id,
        a.segment,
        a.billing_cadence,
        a.onboarding_completed,
        MAX(m.churn_flag) AS churned,
        ROUND(AVG(u.seat_utilization_pct), 1) AS avg_seat_utilization,
        COALESCE(SUM(t.sla_breached), 0) AS total_sla_breaches,
        ROUND(MAX(m.ending_mrr) * 12.0, 2) AS peak_arr
    FROM dim_accounts a
    INNER JOIN fact_mrr_monthly m
        ON a.account_id = m.account_id
    LEFT JOIN fact_product_usage u
        ON a.account_id = u.account_id
       AND m.month = u.month
    LEFT JOIN fact_support_tickets t
        ON a.account_id = t.account_id
       AND m.month = t.month
    GROUP BY a.account_id, a.segment, a.billing_cadence, a.onboarding_completed
),
bucketed AS (
    SELECT
        billing_cadence,
        CASE WHEN onboarding_completed = 1 THEN 'Completed (<14d)' ELSE 'Incomplete' END AS onboarding_status,
        CASE WHEN total_sla_breaches >= 2 THEN '2+ SLA Breaches' ELSE '0-1 SLA Breaches' END AS support_experience,
        churned,
        avg_seat_utilization,
        peak_arr
    FROM account_summary
)
SELECT
    billing_cadence,
    onboarding_status,
    support_experience,
    COUNT(*) AS cohort_accounts,
    SUM(churned) AS churned_accounts,
    ROUND((SUM(churned) * 100.0) / COUNT(*), 1) AS logo_churn_rate_pct,
    ROUND(AVG(avg_seat_utilization), 1) AS avg_seat_utilization_pct,
    ROUND(SUM(CASE WHEN churned = 1 THEN peak_arr ELSE 0 END), 2) AS lost_arr_usd
FROM bucketed
GROUP BY billing_cadence, onboarding_status, support_experience
ORDER BY logo_churn_rate_pct DESC;
