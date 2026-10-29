-- =============================================================================
-- Query 03: Quarterly Cohort Logo & Dollar Net Revenue Retention (NRR) Matrix
-- Business Question: How well does each signup quarter retain logos and expand
-- recurring revenue from Month 0 through Month 11?
-- =============================================================================

WITH cohort_base AS (
    SELECT
        a.signup_quarter AS cohort_quarter,
        COUNT(DISTINCT a.account_id) AS cohort_size,
        SUM(m0.ending_mrr) AS initial_cohort_mrr
    FROM dim_accounts a
    INNER JOIN fact_mrr_monthly m0
        ON a.account_id = m0.account_id
       AND m0.months_since_signup = 0
    GROUP BY a.signup_quarter
),
cohort_activity AS (
    SELECT
        a.signup_quarter AS cohort_quarter,
        m.months_since_signup AS month_offset,
        COUNT(DISTINCT CASE WHEN m.is_active = 1 THEN m.account_id END) AS retained_accounts,
        ROUND(SUM(m.ending_mrr), 2) AS cohort_mrr
    FROM dim_accounts a
    INNER JOIN fact_mrr_monthly m
        ON a.account_id = m.account_id
    WHERE m.months_since_signup BETWEEN 0 AND 11
    GROUP BY a.signup_quarter, m.months_since_signup
)
SELECT
    ca.cohort_quarter,
    cb.cohort_size,
    ROUND(cb.initial_cohort_mrr, 2) AS initial_cohort_mrr,
    ca.month_offset,
    ca.retained_accounts,
    ca.cohort_mrr,
    ROUND((ca.retained_accounts * 100.0) / NULLIF(cb.cohort_size, 0), 1) AS logo_retention_pct,
    ROUND((ca.cohort_mrr * 100.0) / NULLIF(cb.initial_cohort_mrr, 0), 1) AS dollar_nrr_pct
FROM cohort_activity ca
INNER JOIN cohort_base cb
    ON ca.cohort_quarter = cb.cohort_quarter
ORDER BY ca.cohort_quarter, ca.month_offset;
