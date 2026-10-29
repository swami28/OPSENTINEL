-- =============================================================================
-- Query 02: Monthly SaaS MRR Waterfall, Net Revenue Retention & Quick Ratio
-- Business Question: How is top-line ARR growing each month, and is growth
-- driven by healthy net expansion (NRR > 100%) or leaky new-logo acquisition?
-- =============================================================================

WITH monthly_movements AS (
    SELECT
        m.month,
        COUNT(DISTINCT CASE WHEN m.is_active = 1 THEN m.account_id END) AS active_accounts,
        COUNT(DISTINCT CASE WHEN m.new_mrr > 0 THEN m.account_id END) AS new_logos,
        COUNT(DISTINCT CASE WHEN m.churn_flag = 1 THEN m.account_id END) AS churned_logos,
        ROUND(SUM(m.beginning_mrr), 2) AS beginning_mrr,
        ROUND(SUM(m.new_mrr), 2) AS new_mrr,
        ROUND(SUM(m.expansion_mrr), 2) AS expansion_mrr,
        ROUND(SUM(m.contraction_mrr), 2) AS contraction_mrr,
        ROUND(SUM(m.churned_mrr), 2) AS churned_mrr,
        ROUND(SUM(m.ending_mrr), 2) AS ending_mrr
    FROM fact_mrr_monthly m
    GROUP BY m.month
),
enriched_kpis AS (
    SELECT
        month,
        active_accounts,
        new_logos,
        churned_logos,
        beginning_mrr,
        new_mrr,
        expansion_mrr,
        contraction_mrr,
        churned_mrr,
        ROUND(new_mrr + expansion_mrr - contraction_mrr - churned_mrr, 2) AS net_new_mrr,
        ending_mrr,
        ROUND(ending_mrr * 12.0, 2) AS ending_arr,
        -- Monthly Net Revenue Retention (NRR %) on existing cohort base
        ROUND(
            CASE
                WHEN beginning_mrr > 0
                THEN ((beginning_mrr + expansion_mrr - contraction_mrr - churned_mrr) / beginning_mrr) * 100.0
                ELSE 100.0
            END,
            2
        ) AS monthly_nrr_pct,
        -- Gross Revenue Retention (GRR %) capped at 100% excluding expansion
        ROUND(
            CASE
                WHEN beginning_mrr > 0
                THEN ((beginning_mrr - contraction_mrr - churned_mrr) / beginning_mrr) * 100.0
                ELSE 100.0
            END,
            2
        ) AS monthly_grr_pct,
        -- SaaS Quick Ratio = (New MRR + Expansion MRR) / (Contraction MRR + Churned MRR)
        ROUND(
            (new_mrr + expansion_mrr) / NULLIF(contraction_mrr + churned_mrr, 0),
            2
        ) AS saas_quick_ratio,
        -- Rolling 3-month average Net New MRR using window function
        ROUND(
            AVG(new_mrr + expansion_mrr - contraction_mrr - churned_mrr) OVER (
                ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
            ),
            2
        ) AS rolling_3m_net_new_mrr,
        LAG(ending_mrr) OVER (ORDER BY month) AS prev_month_mrr
    FROM monthly_movements
)
SELECT
    month,
    active_accounts,
    new_logos,
    churned_logos,
    beginning_mrr,
    new_mrr,
    expansion_mrr,
    contraction_mrr,
    churned_mrr,
    net_new_mrr,
    ending_mrr,
    ending_arr,
    monthly_nrr_pct,
    monthly_grr_pct,
    COALESCE(saas_quick_ratio, 9.99) AS saas_quick_ratio,
    rolling_3m_net_new_mrr,
    ROUND(
        CASE
            WHEN prev_month_mrr > 0 THEN ((ending_mrr - prev_month_mrr) / prev_month_mrr) * 100.0
            ELSE 0.0
        END,
        2
    ) AS mom_mrr_growth_pct
FROM enriched_kpis
ORDER BY month;
