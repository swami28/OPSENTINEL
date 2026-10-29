-- =============================================================================
-- Query 04: B2B SaaS RFM & Product Adoption Customer Segmentation
-- Business Question: Which active customer accounts are Champions ready for
-- seat expansion vs. High-Value At-Risk accounts requiring immediate CS outreach?
-- =============================================================================

WITH latest_month AS (
    SELECT MAX(month) AS max_month FROM fact_mrr_monthly
),
active_snapshot AS (
    SELECT
        a.account_id,
        a.company_name,
        a.segment,
        a.region,
        a.billing_cadence,
        a.plan_tier,
        m.months_since_signup AS tenure_months,
        m.ending_mrr AS current_mrr,
        ROUND(m.ending_mrr * 12.0, 2) AS current_arr,
        u.seat_utilization_pct,
        u.core_workflow_events,
        u.feature_adoption_score,
        COALESCE(t.sla_breaches_90d, 0) AS sla_breaches_90d
    FROM dim_accounts a
    INNER JOIN fact_mrr_monthly m
        ON a.account_id = m.account_id
    INNER JOIN latest_month lm
        ON m.month = lm.max_month
    LEFT JOIN fact_product_usage u
        ON a.account_id = u.account_id
       AND u.month = lm.max_month
    LEFT JOIN (
        SELECT
            account_id,
            SUM(sla_breached) AS sla_breaches_90d
        FROM fact_support_tickets
        WHERE month >= '2026-07'
        GROUP BY account_id
    ) t ON a.account_id = t.account_id
    WHERE m.is_active = 1
),
rfm_quintiles AS (
    SELECT
        *,
        NTILE(5) OVER (ORDER BY feature_adoption_score ASC) AS engagement_score,
        NTILE(5) OVER (ORDER BY core_workflow_events ASC) AS frequency_score,
        NTILE(5) OVER (ORDER BY current_mrr ASC) AS monetary_score
    FROM active_snapshot
),
segmented AS (
    SELECT
        *,
        CASE
            WHEN monetary_score >= 4 AND engagement_score >= 4 AND seat_utilization_pct >= 80
                THEN 'Expansion Ready Champions'
            WHEN engagement_score >= 4 AND frequency_score >= 3
                THEN 'Core Loyalists'
            WHEN monetary_score >= 3 AND (engagement_score <= 2 OR sla_breaches_90d >= 2)
                THEN 'At-Risk High Value'
            WHEN engagement_score <= 2 AND monetary_score <= 2
                THEN 'Hibernating / Low Adoption'
            ELSE 'Steady Adopters'
        END AS rfm_segment
    FROM rfm_quintiles
)
SELECT
    rfm_segment,
    COUNT(*) AS account_count,
    ROUND(SUM(current_arr), 2) AS total_arr,
    ROUND(AVG(current_mrr), 2) AS avg_mrr,
    ROUND(AVG(seat_utilization_pct), 1) AS avg_seat_utilization_pct,
    ROUND(AVG(feature_adoption_score), 1) AS avg_adoption_score,
    ROUND(AVG(sla_breaches_90d), 2) AS avg_sla_breaches_90d
FROM segmented
GROUP BY rfm_segment
ORDER BY total_arr DESC;
