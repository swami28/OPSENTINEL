# 📊 RevLens — B2B SaaS Revenue, Customer Retention & Decision Science Analytics

![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)
![SQL Star Schema](https://img.shields.io/badge/SQL-Star_Schema_%26_Window_Functions-4169E1?logo=sqlite&logoColor=white)
![Decision Science](https://img.shields.io/badge/SciPy_%2B_Scikit--Learn-Hypothesis_Testing_%26_ML-F7931E?logo=scikitlearn&logoColor=white)
![React + TypeScript BI](https://img.shields.io/badge/React_18-Interactive_BI_%26_SQL_Workbench-61DAFB?logo=react&logoColor=black)

**RevLens** is an end-to-end **Data Analyst & Decision Science portfolio project** modeling **18 months (`2025-04` – `2026-09`)** of multi-table B2B SaaS operational telemetry across **620 customer accounts ($11.91M Ending ARR)**.

It demonstrates the complete modern analytics lifecycle from **messy raw CSV ingestion & automated data-hygiene auditing** to **star-schema SQL warehousing, statistical hypothesis testing, cross-validated churn risk modeling, executive scenario simulation, and an interactive BI web application**.

---

## 🏗️ End-to-End Analytics Architecture

```text
  ┌─────────────────────────────────────────────────────────────────────┐
  │ 1. Raw Operational Sources (data/raw/*.csv — 16,600+ noisy rows)    │
  │    • Duplicate snapshots • Mixed MM/DD/YYYY & ISO dates             │
  │    • Missing attributes  • Sensor spikes (>100%) • Orphan QA rows   │
  └──────────────────────────────────┬──────────────────────────────────┘
                                     │ src/etl_pipeline.py (DQ-01..DQ-06)
                                     ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ 2. Star-Schema SQL Warehouse (warehouse/revlens.db + processed/)    │
  │    • dim_accounts          • fact_mrr_monthly (Waterfall identity)  │
  │    • fact_product_usage    • fact_support_tickets                   │
  │    • fact_pricing_experiment (N = 840 Stratified A/B Trials)        │
  └─────────────────┬──────────────────────────────────┬────────────────┘
                    │ sql/02..06_*.sql                 │ src/statistical_analysis.py
                    ▼                                  ▼
  ┌──────────────────────────────────┐  ┌───────────────────────────────┐
  │ 3. Advanced SQL Analytics        │  │ 4. Decision Science & ML      │
  │ • MRR Waterfall (LAG, Rolling)   │  │ • Chi-Square, Mann-Whitney U  │
  │ • Quarterly Logo & Dollar NRR    │  │ • Welch's t-Test & A/B Test   │
  │ • RFM + Adoption NTILE(5)        │  │ • 5-Fold CV Churn Ensemble    │
  │ • Channel LTV:CAC & Payback      │  │ • 6-Month MRR Fan Forecast    │
  └─────────────────┬────────────────┘  └──────────────┬────────────────┘
                    └────────────────┬─────────────────┘
                                     ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ 5. Interactive Executive BI Dashboard & Live SQL Workbench          │
  │    • React 18 + TypeScript + Tailwind + FastAPI (/api/sql/execute)  │
  │    • Dual-mode: Live SQLite Warehouse OR Static GitHub Pages Build  │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Headline Executive Insights (`2026-09` Close)

| Metric | Value | Analytical Takeaway |
| :--- | :--- | :--- |
| **Ending ARR / MRR** | **$11.91M** (`$992.1K` MRR) | Scaled **+288.4%** across 18 months (`483` active B2B logos). |
| **Annualized NRR** | **100.8%** | Seat expansion in Enterprise & Mid-Market offsets SMB logo churn. |
| **Blended LTV : CAC** | **5.24x** (`10.6 mo` payback) | `Product-Led Organic` & `Partner Referral` lead capital efficiency. |
| **Onboarding Impact (`HT-01`)** | **41.5% vs. 15.4% churn** | Missing 14-day onboarding multiplies churn **2.7x** ($\chi^2 = 45.31, p < 0.0001$). |
| **Support SLA Impact (`HT-02`)** | **+7.7 pp churn lift** | Monthly SLA breach rate $\ge 0.25$ significantly degrades retention ($p = 0.0278$). |
| **Contract Cadence (`HT-03`)** | **$24.4K vs. $9.2K rev** | Annual contracts cut logo churn from **36.3% to 10.3%** ($t = 6.00, p < 0.0001$). |
| **Pricing A/B Test (`HT-04`)** | **+7.4 pp conversion** | `Usage-Hybrid` pricing lifts trial conversion `14.8% → 22.1%` ($p = 0.0076$). |
| **Active ARR Exposed** | **$242,891** | Identified via 5-fold CV ensemble (`ROC-AUC = 0.760`) with tailored CS playbooks. |

📄 Full C-Suite strategic recommendations: [`reports/executive_decision_memo.md`](./reports/executive_decision_memo.md)  
📓 Pre-executed EDA & Decision Science Notebook: [`notebooks/01_saas_revenue_decision_science_eda.ipynb`](./notebooks/01_saas_revenue_decision_science_eda.ipynb)

---

## 🗄️ Production SQL Showcase (`sql/`)

1. **[`01_warehouse_schema.sql`](./sql/01_warehouse_schema.sql)** — Normalized star-schema DDL with strict `CHECK` constraints, `UNIQUE (account_id, month)` grains, and composite analytical indexes.
2. **[`02_mrr_waterfall_movements.sql`](./sql/02_mrr_waterfall_movements.sql)** — Multi-CTE SaaS MRR Waterfall computing `New`, `Expansion`, `Contraction`, `Churned`, `Net New MRR`, `Monthly NRR %`, `GRR %`, `SaaS Quick Ratio`, `LAG()` MoM growth, and 3-month rolling window averages.
3. **[`03_cohort_retention_matrix.sql`](./sql/03_cohort_retention_matrix.sql)** — Signup-quarter retention matrix (`M0`–`M11`) comparing Logo Survival % against Dollar Net Revenue Retention %.
4. **[`04_rfm_customer_segmentation.sql`](./sql/04_rfm_customer_segmentation.sql)** — B2B SaaS adaptation of RFM using `NTILE(5)` window functions across Feature Adoption, Core Workflow Frequency, and ARR Monetary value.
5. **[`05_channel_unit_economics.sql`](./sql/05_channel_unit_economics.sql)** — 82% gross-margin-adjusted SaaS `LTV`, `CAC`, `LTV:CAC`, and `CAC Payback Months` by GTM channel.
6. **[`06_churn_risk_drivers.sql`](./sql/06_churn_risk_drivers.sql)** — Multi-dimensional cohort cross-tabulation quantifying `$ARR` lost across Billing Cadence $\times$ Onboarding $\times$ Support SLA experience.

---

## 🧹 Automated ETL & Data Hygiene Audit (`src/etl_pipeline.py`)

Real-world analytics starts with untrusted raw data. `src/etl_pipeline.py` audits and remediates **6 classes of raw data anomalies** before warehouse load:
- **DQ-01 (Uniqueness):** Deduplicates repeated `(account_id, month)` billing and usage snapshots.
- **DQ-02 (Consistency):** Trims whitespace and normalizes mixed-case `region` and `segment` taxonomies.
- **DQ-03 (Standardization):** Converts legacy `MM/DD/YYYY` signup dates to strict ISO-8601 `YYYY-MM-DD`.
- **DQ-04 (Completeness):** Imputes missing `industry` (mode) and `employee_count` (segment-stratified median).
- **DQ-05 (Validity):** Winsorizes/bounds out-of-range telemetry spikes (`<0%` or `>100%` seat utilization).
- **DQ-06 (Referential Integrity):** Quarantines orphan staging/QA support tickets prior to FK-enforced warehouse load.

---

## 🚀 Quickstart (Local Full-Stack & Static Build)

### 1. Run the Python Data Pipeline & Test Suite
```bash
cd revlens-analytics
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Build raw data -> clean star-schema warehouse -> SQL views -> ML/Stats -> EDA Notebook
python -m src.build_analytics

# Run automated data quality, SQL accounting identity & API tests
ruff check src tests
pytest -v
```

### 2. Launch Live Analytical API + Interactive React BI Dashboard
```bash
# Terminal 1: Start FastAPI SQLite Warehouse Server (port 8085)
uvicorn src.api:app --host 0.0.0.0 --port 8085

# Terminal 2: Start Interactive BI Dashboard (port 5174)
cd dashboard
npm install
npm run dev
```

### 3. Deploy Static Dashboard to GitHub Pages
Because `dashboard/vite.config.ts` uses `base: './'` and bundles `public/data/analytics_bundle.json`, running `npm run build` produces a zero-backend static BI app in `dashboard/dist/` ready for **GitHub Pages**, **Vercel**, or **Netlify**!
