export type SourceType =
  | 'application_log'
  | 'error_log'
  | 'deployment'
  | 'incident'
  | 'runbook'
  | 'architecture'
  | 'troubleshooting';

export type SeverityLevel = 'SEV-1' | 'SEV-2' | 'SEV-3';
export type IncidentStatus = 'investigating' | 'identified' | 'mitigated' | 'resolved';

export interface PossibleCauseItem {
  rank: number;
  cause: string;
  probability: number;
  mechanism: string;
  supporting_sources: string[];
}

export interface LogPatternMatch {
  pattern_id: string;
  signature: string;
  severity: string;
  occurrences: number;
  service: string;
  first_seen: string;
  sample_line: string;
  correlation_note: string;
}

export interface EvidenceItem {
  source_id: string;
  source_type: string;
  title: string;
  service: string;
  snippet: string;
  relevance_score: number;
  timestamp?: string | null;
  badge_label: string;
}

export interface InvestigationStep {
  step_number: number;
  action: string;
  command: string;
  rationale: string;
  expected_signal: string;
}

export interface SuggestedFix {
  immediate_mitigation: string;
  rollback_command: string;
  permanent_remediation: string;
  config_or_code_diff: string;
  risk_level: string;
  estimated_recovery_time: string;
}

export interface RunbookReference {
  id: string;
  title: string;
  service: string;
  sla_minutes: number;
  summary: string;
  key_commands: string[];
  steps: string[];
  access_count: number;
  raw_content?: string;
  cached_in_redis?: boolean;
}

export interface RetrievalChecklist {
  deployment_logs: boolean;
  api_and_error_logs: boolean;
  previous_incidents: boolean;
  runbooks: boolean;
  architecture_docs: boolean;
  troubleshooting_guides: boolean;
}

export interface RetrievedChunkOut {
  chunk_id: string;
  document_id: string;
  title: string;
  source_type: string;
  service: string;
  environment: string;
  severity: string;
  content: string;
  vector_score: number;
  lexical_score: number;
  hybrid_score: number;
  metadata: Record<string, unknown>;
}

export interface AgentTraceStep {
  stage: string;
  component: string;
  detail: string;
  duration_ms: number;
  status: string;
}

export interface InvestigationResponse {
  investigation_id: string;
  session_id: string;
  mode: 'investigate' | 'auto_rca';
  query: string;
  headline_conclusion: string;
  confidence_score: number;
  severity: SeverityLevel;
  affected_services: string[];
  retrieval_checklist: RetrievalChecklist;
  possible_causes: PossibleCauseItem[];
  matching_log_patterns: LogPatternMatch[];
  evidence: EvidenceItem[];
  recommended_investigation: InvestigationStep[];
  suggested_fix: SuggestedFix;
  relevant_runbook: RunbookReference | null;
  retrieved_chunks: RetrievedChunkOut[];
  agent_trace: AgentTraceStep[];
  cached: boolean;
  latency_ms: number;
  llm_mode: string;
  generated_at: string;
}

export interface ActiveIncident {
  id: string;
  title: string;
  service: string;
  severity: SeverityLevel;
  status: IncidentStatus;
  symptom_summary: string;
  metric_spike: string;
  environment: string;
  triggered_at: string;
  latest_rca: InvestigationResponse | null;
  updated_at: string;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  source_type: SourceType;
  service: string;
  environment: string;
  severity: string;
  version?: string | null;
  raw_content: string;
  doc_metadata: Record<string, unknown>;
  chunk_count: number;
  created_at: string;
}

export interface HotRunbookMetric {
  runbook_id: string;
  access_count: number;
  title: string;
  service: string;
  cached_in_redis: boolean;
}

export interface CachedQueryPreview {
  cache_key: string;
  query: string;
  mode: string;
  headline_conclusion: string;
  confidence_score: number;
  ttl_seconds: number;
}

export interface SessionPreview {
  session_id: string;
  last_service: string | null;
  turn_count: number;
  updated_at: number;
  ttl_seconds: number;
  latest_query: string;
}

export interface SystemTelemetry {
  database: {
    status: string;
    backend: string;
    dialect: string;
    pgvector_native: boolean;
    embedding_dim: number;
  };
  redis: {
    status: string;
    backend: string;
    cache_hits: number;
    cache_misses: number;
    hit_rate_pct: number;
    cached_queries: number;
    active_sessions: number;
    hot_runbooks: HotRunbookMetric[];
  };
  cached_queries_preview: CachedQueryPreview[];
  active_sessions_preview: SessionPreview[];
  corpus: {
    total_documents: number;
    total_chunks: number;
    documents_by_source: Record<string, number>;
    chunks_by_source: Record<string, number>;
    indexed_services: string[];
  };
  incidents_summary: {
    open_incidents: number;
    active_sev1: number;
    total_investigations: number;
  };
  llm: {
    provider: string;
    model: string;
    base_url: string;
    api_key_configured: boolean;
  };
}
