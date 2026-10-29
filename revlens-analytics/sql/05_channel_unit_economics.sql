-- =============================================================================
-- Query 05: Acquisition Channel Unit Economics (LTV, CAC, LTV:CAC & Payback)
-- Business Question: Which GTM acquisition channels generate the highest capital
-- efficiency (LTV:CAC >= 3.0x and CAC Payback < 14 months)?
-- =============================================================================

WITH account_revenue AS (
    SELECT
        a.account_id,
        a.acquisition_channel,
        a.segment,
        a.cac_usd,
        a.onboarding_completed,
        COUNT(m.month) AS observed_months,
        AVG(CASE WHEN m.is_active = 1 THEN m.ending_mrr END) AS avg_active_mrr,
        MAX(m.churn_flag) AS ever_churned
    FROM dim_accounts a
    INNER JOIN fact_mrr_monthly m
        ON a.account_id = m.account_id
    GROUP BY a.account_id, a.acquisition_channel, a.segment, a.cac_usd, a.onboarding_completed
),
channel_metrics AS (
    SELECT
        acquisition_channel,
        COUNT(*) AS total_accounts,
        ROUND(AVG(onboarding_completed) * 100.0, 1) AS onboarding_completion_pct,
        ROUND(AVG(cac_usd), 2) AS avg_cac_usd,
        ROUND(AVG(avg_active_mrr), 2) AS arpu_monthly_usd,
        -- Observed monthly logo churn rate per channel (bounded away from zero at 1.2% floor)
        MAX(0.012, SUM(ever_churned) * 1.0 / NULLIF(SUM(observed_months), 0)) AS monthly_churn_rate
    FROM account_revenue
    GROUP BY acquisition_channel
)
SELECT
    acquisition_channel,
    total_accounts,
    onboarding_completion_pct,
    avg_cac_usd,
    arpu_monthly_usd,
    ROUND(monthly_churn_rate * 100.0, 2) AS monthly_churn_pct,
    -- Gross Margin Adjusted SaaS LTV (assuming 82% SaaS Gross Margin)
    ROUND((arpu_monthly_usd * 0.82) / monthly_churn_rate, 2) AS estimated_ltv_usd,
    ROUND(((arpu_monthly_usd * 0.82) / monthly_churn_rate) / NULLIF(avg_cac_usd, 0), 2) AS ltv_to_cac_ratio,
    ROUND(avg_cac_usd / NULLIF(arpu_monthly_usd * 0.82, 0), 1) AS cac_payback_months
FROM channel_metrics
ORDER BY ltv_to_cac_ratio DESC;
