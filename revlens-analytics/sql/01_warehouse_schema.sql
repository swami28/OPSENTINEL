-- =============================================================================
-- RevLens Analytical Data Warehouse — Star-Schema DDL
-- Dialect: ANSI SQL / SQLite 3.35+ (Window Functions & CTEs supported)
-- =============================================================================

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS fact_pricing_experiment;
DROP TABLE IF EXISTS fact_support_tickets;
DROP TABLE IF EXISTS fact_product_usage;
DROP TABLE IF EXISTS fact_mrr_monthly;
DROP TABLE IF EXISTS dim_accounts;

CREATE TABLE dim_accounts (
    account_id           TEXT PRIMARY KEY,
    company_name         TEXT NOT NULL,
    segment              TEXT NOT NULL CHECK (segment IN ('Enterprise', 'Mid-Market', 'SMB')),
    industry             TEXT NOT NULL,
    region               TEXT NOT NULL CHECK (region IN ('North America', 'EMEA', 'APAC', 'LATAM')),
    acquisition_channel  TEXT NOT NULL,
    signup_date          TEXT NOT NULL,
    signup_month         TEXT NOT NULL,
    signup_quarter       TEXT NOT NULL,
    billing_cadence      TEXT NOT NULL CHECK (billing_cadence IN ('Annual', 'Monthly')),
    plan_tier            TEXT NOT NULL,
    employee_count       INTEGER NOT NULL CHECK (employee_count > 0),
    licensed_seats       INTEGER NOT NULL CHECK (licensed_seats > 0),
    cac_usd              REAL NOT NULL CHECK (cac_usd >= 0),
    onboarding_completed INTEGER NOT NULL CHECK (onboarding_completed IN (0, 1)),
    onboarding_days      REAL NOT NULL CHECK (onboarding_days >= 0)
);

CREATE TABLE fact_mrr_monthly (
    snapshot_id          TEXT PRIMARY KEY,
    account_id           TEXT NOT NULL REFERENCES dim_accounts(account_id),
    month                TEXT NOT NULL,
    months_since_signup  INTEGER NOT NULL CHECK (months_since_signup >= 0),
    beginning_mrr        REAL NOT NULL DEFAULT 0,
    new_mrr              REAL NOT NULL DEFAULT 0,
    expansion_mrr        REAL NOT NULL DEFAULT 0,
    contraction_mrr      REAL NOT NULL DEFAULT 0,
    churned_mrr          REAL NOT NULL DEFAULT 0,
    ending_mrr           REAL NOT NULL DEFAULT 0,
    is_active            INTEGER NOT NULL CHECK (is_active IN (0, 1)),
    churn_flag           INTEGER NOT NULL CHECK (churn_flag IN (0, 1)),
    churn_reason         TEXT,
    UNIQUE (account_id, month)
);

CREATE TABLE fact_product_usage (
    usage_id                  TEXT PRIMARY KEY,
    account_id                TEXT NOT NULL REFERENCES dim_accounts(account_id),
    month                     TEXT NOT NULL,
    active_users              INTEGER NOT NULL CHECK (active_users >= 0),
    seat_utilization_pct      REAL NOT NULL CHECK (seat_utilization_pct >= 0 AND seat_utilization_pct <= 100),
    core_workflow_events      INTEGER NOT NULL CHECK (core_workflow_events >= 0),
    api_calls                 INTEGER NOT NULL CHECK (api_calls >= 0),
    automation_rules_enabled  INTEGER NOT NULL CHECK (automation_rules_enabled >= 0),
    feature_adoption_score    REAL NOT NULL CHECK (feature_adoption_score >= 0 AND feature_adoption_score <= 100),
    UNIQUE (account_id, month)
);

CREATE TABLE fact_support_tickets (
    ticket_id             TEXT PRIMARY KEY,
    account_id            TEXT NOT NULL REFERENCES dim_accounts(account_id),
    created_date          TEXT NOT NULL,
    month                 TEXT NOT NULL,
    severity              TEXT NOT NULL CHECK (severity IN ('P1-Critical', 'P2-High', 'P3-Normal')),
    first_response_hours  REAL NOT NULL CHECK (first_response_hours >= 0),
    resolution_hours      REAL NOT NULL CHECK (resolution_hours >= 0),
    sla_breached          INTEGER NOT NULL CHECK (sla_breached IN (0, 1)),
    csat_score            INTEGER NOT NULL CHECK (csat_score BETWEEN 1 AND 5)
);

CREATE TABLE fact_pricing_experiment (
    trial_id         TEXT PRIMARY KEY,
    cohort_week      TEXT NOT NULL,
    variant          TEXT NOT NULL CHECK (variant IN ('Control_Flat_Seat', 'Treatment_Usage_Hybrid')),
    segment          TEXT NOT NULL,
    converted        INTEGER NOT NULL CHECK (converted IN (0, 1)),
    initial_mrr      REAL NOT NULL CHECK (initial_mrr >= 0),
    day_60_retained  INTEGER NOT NULL CHECK (day_60_retained IN (0, 1))
);

CREATE INDEX idx_mrr_month ON fact_mrr_monthly(month);
CREATE INDEX idx_mrr_account ON fact_mrr_monthly(account_id);
CREATE INDEX idx_usage_account_month ON fact_product_usage(account_id, month);
CREATE INDEX idx_tickets_account_month ON fact_support_tickets(account_id, month);
CREATE INDEX idx_accounts_segment_region ON dim_accounts(segment, region);
