import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';

const mockTelemetry = {
  database: {
    status: 'healthy',
    backend: 'postgresql+pgvector',
    dialect: 'postgresql',
    pgvector_native: true,
    embedding_dim: 384,
  },
  redis: {
    status: 'healthy',
    backend: 'redis',
    cache_hits: 4,
    cache_misses: 2,
    hit_rate_pct: 66.7,
    cached_queries: 2,
    active_sessions: 1,
    hot_runbooks: [],
  },
  cached_queries_preview: [],
  active_sessions_preview: [],
  corpus: {
    total_documents: 18,
    total_chunks: 32,
    documents_by_source: {
      application_log: 2,
      error_log: 4,
      deployment: 4,
      incident: 2,
      runbook: 4,
      architecture: 3,
      troubleshooting: 1,
    },
    chunks_by_source: {},
    indexed_services: ['payment-api', 'auth-gateway', 'checkout-service', 'order-worker'],
  },
  incidents_summary: {
    open_incidents: 4,
    active_sev1: 2,
    total_investigations: 5,
  },
  llm: {
    provider: 'opsentinel-evidence-synthesizer',
    model: 'sre-causal-synthesizer-v1',
    base_url: 'in-process',
    api_key_configured: false,
  },
};

const mockInvestigation = {
  investigation_id: 'INV-TEST1028',
  session_id: 'sess-test01',
  mode: 'investigate',
  query: 'Why did the payment API start returning 500 errors after the latest deployment?',
  headline_conclusion:
    'Database connection pool exhaustion on `payment-api` after deployment `v2.15.0`.',
  confidence_score: 0.94,
  severity: 'SEV-1',
  affected_services: ['payment-api', 'postgres-primary'],
  retrieval_checklist: {
    deployment_logs: true,
    api_and_error_logs: true,
    previous_incidents: true,
    runbooks: true,
    architecture_docs: true,
    troubleshooting_guides: true,
  },
  possible_causes: [
    {
      rank: 1,
      cause: 'PostgreSQL Connection Pool Exhaustion post-v2.15.0 Deployment',
      probability: 0.92,
      mechanism: 'QueuePool size reduced from 50 to 15 while holding external RPC inside transaction.',
      supporting_sources: ['DEP-2026-1028-04', 'LOG-ERR-PAY-1028', 'RB-DB-POOL-001'],
    },
  ],
  matching_log_patterns: [
    {
      pattern_id: 'PAT-01',
      signature: 'ERROR payment-api QueuePool limit of size 15 overflow 0 reached',
      severity: 'ERROR',
      occurrences: 142,
      service: 'payment-api',
      first_seen: '2026-10-28T14:08:44Z',
      sample_line: 'ERROR payment-api QueuePool limit of size 15',
      correlation_note: 'Surged after v2.15.0',
    },
  ],
  evidence: [
    {
      source_id: 'LOG-ERR-PAY-1028',
      source_type: 'error_log',
      title: 'Error Logs — payment-api HTTP 500',
      service: 'payment-api',
      snippet: 'QueuePool limit of size 15 reached',
      relevance_score: 0.91,
      timestamp: '2026-10-28T14:08:44Z',
      badge_label: 'Error Log',
    },
  ],
  recommended_investigation: [
    {
      step_number: 1,
      action: 'Check pg_stat_activity',
      command: 'psql $PROD_DB_URL -c "SELECT state, count(*) FROM pg_stat_activity GROUP BY 1;"',
      rationale: 'Verify idle in transaction count',
      expected_signal: '15/15 connections busy',
    },
  ],
  suggested_fix: {
    immediate_mitigation: 'Rollback payment-api to Helm revision 41',
    rollback_command: 'helm rollback payment-api 41 -n prod-payments --wait',
    permanent_remediation: 'Move external fraud RPC outside transaction block',
    config_or_code_diff: '+ DB_POOL_MAX_SIZE: 40',
    risk_level: 'LOW',
    estimated_recovery_time: '90 seconds',
  },
  relevant_runbook: {
    id: 'RB-DB-POOL-001',
    title: 'Runbook: PostgreSQL Connection Pool Exhaustion',
    service: 'payment-api',
    sla_minutes: 10,
    summary: 'Immediate rollback and pool tuning procedure.',
    key_commands: ['helm rollback payment-api 41 -n prod-payments --wait'],
    steps: ['Check logs', 'Rollback release'],
    access_count: 15,
  },
  retrieved_chunks: [],
  agent_trace: [
    {
      stage: '1. Session & Cache Lookup',
      component: 'Redis',
      detail: 'Fresh RAG run',
      duration_ms: 1.2,
      status: 'ok',
    },
  ],
  cached: false,
  latency_ms: 12.4,
  llm_mode: 'opsentinel-evidence-synthesizer',
  generated_at: '2026-10-28T15:00:00Z',
};

describe('OPSENTINEL Dashboard', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/system/telemetry')) {
          return {
            ok: true,
            json: async () => mockTelemetry,
          };
        }
        if (url.includes('/investigate')) {
          return {
            ok: true,
            json: async () => mockInvestigation,
          };
        }
        return {
          ok: true,
          json: async () => ({}),
        };
      })
    );
  });

  it('renders header telemetry and 5-pillar RCA investigation report', async () => {
    render(<App />);

    expect(screen.getByText('OPSENTINEL')).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByText(/PostgreSQL Connection Pool Exhaustion post-v2.15.0 Deployment/i)
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/1\. Possible Cause \(Ranked Hypotheses\)/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Recommended Investigation Steps/i)).toBeInTheDocument();
    expect(screen.getByText(/4\. Suggested Fix & Rollback Plan/i)).toBeInTheDocument();
    expect(screen.getAllByText(/RB-DB-POOL-001/i).length).toBeGreaterThanOrEqual(1);
  });
});
