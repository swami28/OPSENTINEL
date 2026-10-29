import type {
  ActiveIncident,
  IncidentStatus,
  InvestigationResponse,
  KnowledgeDocument,
  RetrievedChunkOut,
  RunbookReference,
  SeverityLevel,
  SourceType,
  SystemTelemetry,
} from '../types/opsentinel';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let errDetail = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody?.detail) {
        errDetail = typeof errBody.detail === 'string' ? errBody.detail : JSON.stringify(errBody.detail);
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errDetail);
  }
  return res.json() as Promise<T>;
}

export const opsentinelApi = {
  getTelemetry: () => requestJson<SystemTelemetry>('/api/v1/system/telemetry'),

  investigate: (payload: {
    query: string;
    session_id?: string;
    service_filter?: string;
    source_types?: SourceType[];
    top_k?: number;
    bypass_cache?: boolean;
  }) =>
    requestJson<InvestigationResponse>('/api/v1/investigate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  runAutoRca: (payload: {
    incident_id?: string;
    title?: string;
    service?: string;
    symptom_summary?: string;
    metric_spike?: string;
    severity?: SeverityLevel;
    bypass_cache?: boolean;
  }) =>
    requestJson<InvestigationResponse>('/api/v1/rca', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listIncidents: () => requestJson<ActiveIncident[]>('/api/v1/incidents'),

  createIncident: (payload: {
    title: string;
    service: string;
    severity: SeverityLevel;
    symptom_summary: string;
    metric_spike: string;
    environment?: string;
  }) =>
    requestJson<ActiveIncident>('/api/v1/incidents', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateIncidentStatus: (incidentId: string, status: IncidentStatus) =>
    requestJson<ActiveIncident>(`/api/v1/incidents/${encodeURIComponent(incidentId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  listKnowledge: (params?: { source_type?: string; service?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.source_type && params.source_type !== 'all') qs.set('source_type', params.source_type);
    if (params?.service && params.service !== 'all') qs.set('service', params.service);
    if (params?.q) qs.set('q', params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return requestJson<KnowledgeDocument[]>(`/api/v1/knowledge${suffix}`);
  },

  ingestKnowledge: (payload: {
    title: string;
    source_type: SourceType;
    service: string;
    environment: string;
    severity: string;
    version?: string;
    raw_content: string;
    metadata?: Record<string, unknown>;
  }) =>
    requestJson<KnowledgeDocument>('/api/v1/knowledge', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteKnowledge: (docId: string) =>
    requestJson<{ deleted: string; evicted_cached_queries: number }>(
      `/api/v1/knowledge/${encodeURIComponent(docId)}`,
      { method: 'DELETE' }
    ),

  semanticSearch: (payload: {
    query: string;
    service?: string;
    source_types?: SourceType[];
    top_k?: number;
  }) =>
    requestJson<RetrievedChunkOut[]>('/api/v1/knowledge/search', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listRunbooks: () => requestJson<{ runbooks: RunbookReference[] }>('/api/v1/runbooks'),

  getRunbookDetail: (runbookId: string) =>
    requestJson<RunbookReference>(`/api/v1/runbooks/${encodeURIComponent(runbookId)}`),

  flushCache: () =>
    requestJson<{ status: string; evicted_keys: number }>('/api/v1/system/cache/flush', {
      method: 'POST',
    }),

  updateLlmConfig: (payload: {
    openai_api_key: string;
    openai_base_url: string;
    openai_model: string;
  }) =>
    requestJson<{ status: string }>('/api/v1/system/llm-config', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
