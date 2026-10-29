export interface HeadlineKpis {
  ending_mrr: number;
  ending_arr: number;
  active_accounts: number;
  mom_mrr_growth_pct: number;
  mrr_total_growth_pct: number;
  avg_monthly_nrr_pct: number;
  annualized_nrr_pct: number;
  latest_quick_ratio: number;
  monthly_logo_churn_pct: number;
  blended_ltv_cac: number;
  blended_cac_payback_months: number;
  arr_at_risk_usd: number;
}

export interface MrrWaterfallRow {
  month: string;
  active_accounts: number;
  new_logos: number;
  churned_logos: number;
  beginning_mrr: number;
  new_mrr: number;
  expansion_mrr: number;
  contraction_mrr: number;
  churned_mrr: number;
  net_new_mrr: number;
  ending_mrr: number;
  ending_arr: number;
  monthly_nrr_pct: number;
  monthly_grr_pct: number;
  saas_quick_ratio: number;
  rolling_3m_net_new_mrr: number;
  mom_mrr_growth_pct: number;
}

export interface CohortRetentionRow {
  cohort_quarter: string;
  cohort_size: number;
  initial_cohort_mrr: number;
  month_offset: number;
  retained_accounts: number;
  cohort_mrr: number;
  logo_retention_pct: number;
  dollar_nrr_pct: number;
}

export interface RfmSegmentRow {
  rfm_segment: string;
  account_count: number;
  total_arr: number;
  avg_mrr: number;
  avg_seat_utilization_pct: number;
  avg_adoption_score: number;
  avg_sla_breaches_90d: number;
}

export interface ChannelEconomicsRow {
  acquisition_channel: string;
  total_accounts: number;
  onboarding_completion_pct: number;
  avg_cac_usd: number;
  arpu_monthly_usd: number;
  monthly_churn_pct: number;
  estimated_ltv_usd: number;
  ltv_to_cac_ratio: number;
  cac_payback_months: number;
}

export interface FunnelStage {
  stage: string;
  accounts: number;
  conversion_from_top_pct: number;
}

export interface HypothesisTest {
  id: string;
  title: string;
  method: string;
  null_hypothesis: string;
  statistic_label: string;
  p_value: number;
  p_value_display: string;
  significant: boolean;
  effect_size: string;
  business_verdict: string;
}

export interface FeatureImportanceItem {
  feature: string;
  label: string;
  importance_pct: number;
  direction: string;
  standardized_log_odds: number;
}

export interface WatchlistAccount {
  account_id: string;
  company_name: string;
  segment: string;
  region: string;
  billing_cadence: string;
  current_arr: number;
  seat_utilization_pct: number;
  sla_breaches: number;
  onboarding_completed: boolean;
  churn_risk_pct: number;
  expected_arr_at_risk: number;
  recommended_playbook: string;
}

export interface ChurnModelData {
  algorithm: string;
  cv_roc_auc: number;
  precision_at_top_20_pct: number;
  high_risk_threshold_pct: number;
  high_risk_account_count: number;
  total_arr_at_risk_usd: number;
  feature_importance: FeatureImportanceItem[];
  watchlist: WatchlistAccount[];
}

export interface ForecastPoint {
  month: string;
  projected_mrr: number;
  projected_arr: number;
  lower_95_mrr: number;
  upper_95_mrr: number;
}

export interface FilterCubeRow {
  month: string;
  segment: string;
  region: string;
  billing_cadence: string;
  active_accounts: number;
  churned_logos: number;
  beginning_mrr: number;
  new_mrr: number;
  expansion_mrr: number;
  contraction_mrr: number;
  churned_mrr: number;
  ending_mrr: number;
}

export interface DataQualityCheck {
  rule_id: string;
  dimension: string;
  table: string;
  issue_detected: string;
  records_affected: number;
  remediation: string;
  status: string;
}

export interface DataQualityAudit {
  pipeline_status: string;
  raw_total_rows: number;
  clean_total_rows: number;
  post_etl_health_score_pct: number;
  raw_cleanliness_rate_pct: number;
  total_anomalies_remediated: number;
  checks: DataQualityCheck[];
  table_counts: Record<string, number>;
}

export interface SqlPreset {
  id: string;
  title: string;
  filename: string;
  description: string;
  sql: string;
  columns: string[];
  rows: Record<string, string | number | null>[];
  row_count: number;
  execution_ms: number;
}

export interface AnalyticsBundle {
  generated_at: string;
  reporting_window: { start_month: string; end_month: string };
  headline_kpis: HeadlineKpis;
  mrr_waterfall: MrrWaterfallRow[];
  cohort_retention: CohortRetentionRow[];
  rfm_segments: RfmSegmentRow[];
  channel_economics: ChannelEconomicsRow[];
  onboarding_funnel: FunnelStage[];
  hypothesis_tests: HypothesisTest[];
  churn_model: ChurnModelData;
  forecast: {
    horizon_months: number;
    monthly_slope_usd: number;
    points: ForecastPoint[];
  };
  filter_cube: FilterCubeRow[];
  data_quality_audit: DataQualityAudit;
  sql_presets: SqlPreset[];
  warehouse_tables: string[];
}

export interface GlobalFilters {
  segment: string;
  region: string;
  billingCadence: string;
}
