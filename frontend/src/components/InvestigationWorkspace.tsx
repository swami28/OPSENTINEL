import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  FileSearch,
  GitCommit,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Terminal,
  Wrench,
  Zap,
} from 'lucide-react';
import { opsentinelApi } from '../lib/api';
import type { InvestigationResponse, RunbookReference } from '../types/opsentinel';

interface InvestigationWorkspaceProps {
  availableServices: string[];
  onOpenRunbook: (runbookId: string) => void;
  onInvestigationCompleted: () => void;
  externalResult?: InvestigationResponse | null;
}

const PRESET_SCENARIOS = [
  {
    label: 'Payment API 500 Spike Post-Deploy',
    service: 'payment-api',
    query: 'Why did the payment API start returning 500 errors after the latest deployment?',
  },
  {
    label: 'Auth Gateway Intermittent 401 Drops',
    service: 'auth-gateway',
    query: 'Why are users getting intermittent 401 Unauthorized errors and session drops on auth-gateway?',
  },
  {
    label: 'Checkout Pods OOMKilled (Exit 137)',
    service: 'checkout-service',
    query: 'Why are checkout-service pods crash-looping with OOMKilled (Exit Code 137)?',
  },
  {
    label: 'Order Worker 88k Kafka Lag',
    service: 'order-worker',
    query: 'Why is order-worker Kafka consumer lag exceeding 85,000 messages on orders.fulfilled?',
  },
];

function createSessionId(): string {
  return `sess-${Math.random().toString(36).slice(2, 10)}`;
}

export const InvestigationWorkspace: React.FC<InvestigationWorkspaceProps> = ({
  availableServices,
  onOpenRunbook,
  onInvestigationCompleted,
  externalResult,
}) => {
  const [query, setQuery] = useState(PRESET_SCENARIOS[0].query);
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [sessionId, setSessionId] = useState<string>(() => createSessionId());
  const [bypassCache, setBypassCache] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InvestigationResponse | null>(null);
  const [showRawChunks, setShowRawChunks] = useState<boolean>(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  useEffect(() => {
    if (externalResult) {
      setResult(externalResult);
      setQuery(externalResult.query);
    }
  }, [externalResult]);

  // Run initial flagship investigation automatically on first mount so the command center is live immediately
  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      setLoading(true);
      try {
        const res = await opsentinelApi.investigate({
          query: PRESET_SCENARIOS[0].query,
          session_id: sessionId,
          top_k: 12,
        });
        if (active) {
          setResult(res);
          onInvestigationCompleted();
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Investigation request failed');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const executeInvestigation = async (overrideQuery?: string, overrideService?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const svc = overrideService ?? serviceFilter;
      const res = await opsentinelApi.investigate({
        query: q,
        session_id: sessionId,
        service_filter: svc !== 'all' ? svc : undefined,
        top_k: 12,
        bypass_cache: bypassCache,
      });
      setResult(res);
      onInvestigationCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Investigation request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (val: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedText(val);
    setTimeout(() => setCopiedText(null), 1500);
  };

  const severityStyles: Record<string, string> = {
    'SEV-1': 'border-rose-500/40 bg-rose-500/15 text-rose-200',
    'SEV-2': 'border-amber-500/40 bg-amber-500/15 text-amber-200',
    'SEV-3': 'border-sky-500/40 bg-sky-500/15 text-sky-200',
  };

  const runbook: RunbookReference | null = result?.relevant_runbook ?? null;

  return (
    <div className="space-y-6">
      {/* Prompt & Scenario Command Deck */}
      <section className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 shadow-lg">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-sky-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
              AI Incident Investigator
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded border border-slate-800 bg-[#070B14] px-2 py-1 font-mono text-slate-400">
              Redis Session: <strong className="text-sky-300">{sessionId}</strong>
            </span>
            <button
              type="button"
              onClick={() => setSessionId(createSessionId())}
              className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800/70 px-2 py-1 text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              <RotateCcw className="h-3 w-3" />
              New Session
            </button>
          </div>
        </div>

        {/* One-Click Production Scenario Pills */}
        <div className="mb-3 flex flex-wrap gap-2">
          {PRESET_SCENARIOS.map((sc) => (
            <button
              key={sc.label}
              type="button"
              onClick={() => {
                setQuery(sc.query);
                setServiceFilter('all');
                executeInvestigation(sc.query, 'all');
              }}
              className={`rounded-lg border px-3 py-1.5 text-left text-xs font-medium transition ${
                query === sc.query
                  ? 'border-sky-500/50 bg-sky-500/15 text-sky-200'
                  : 'border-slate-800 bg-[#080D19] text-slate-300 hover:border-slate-700 hover:text-white'
              }`}
            >
              {sc.label}
            </button>
          ))}
        </div>

        {/* Natural Language Investigation Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            executeInvestigation();
          }}
          className="space-y-3"
        >
          <textarea
            rows={2}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask OPSENTINEL e.g. Why did the payment API start returning 500 errors after the latest deployment?"
            className="w-full rounded-lg border border-slate-700/90 bg-[#070B14] px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-2 text-slate-400">
                <span>Service Scope:</span>
                <select
                  value={serviceFilter}
                  onChange={(e) => setServiceFilter(e.target.value)}
                  className="rounded-md border border-slate-700 bg-[#070B14] px-2.5 py-1.5 font-mono text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
                >
                  <option value="all">All Microservices (Auto-Infer)</option>
                  {availableServices.map((svc) => (
                    <option key={svc} value={svc}>
                      {svc}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-slate-400 select-none">
                <input
                  type="checkbox"
                  checked={bypassCache}
                  onChange={(e) => setBypassCache(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-700 bg-[#070B14] text-sky-500 focus:ring-0"
                />
                <span>Bypass Redis Query Cache</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-md shadow-sky-500/20 transition hover:bg-sky-400 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Correlating Telemetry...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  Investigate Incident
                </>
              )}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">
            {error}
          </div>
        )}
      </section>

      {/* Structured 5-Pillar RCA Output */}
      {result && (
        <div className="space-y-5">
          {/* Executive Banner + RAG Silo Checklist */}
          <section className="rounded-xl border border-slate-800 bg-gradient-to-br from-[#0F172A] via-[#0D1322] to-[#090E1A] p-5 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md border px-2.5 py-1 font-mono text-xs font-bold ${
                    severityStyles[result.severity] || severityStyles['SEV-2']
                  }`}
                >
                  {result.severity}
                </span>
                <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-xs font-semibold text-emerald-300 tabular-nums">
                  Confidence {(result.confidence_score * 100).toFixed(0)}%
                </span>
                {result.cached ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 font-mono text-xs font-semibold text-amber-200">
                    <Zap className="h-3.5 w-3.5 text-amber-400" />
                    REDIS CACHE HIT • {result.latency_ms.toFixed(1)}ms
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 font-mono text-xs text-sky-300">
                    <Activity className="h-3.5 w-3.5" />
                    FRESH RAG PIPELINE • {result.latency_ms.toFixed(1)}ms
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-slate-400">Blast Radius:</span>
                {result.affected_services.map((svc) => (
                  <span
                    key={svc}
                    className="rounded border border-slate-700 bg-slate-800/90 px-2 py-0.5 font-mono text-[11px] text-slate-200"
                  >
                    {svc}
                  </span>
                ))}
              </div>
            </div>

            {/* AI Root Cause Conclusion */}
            <div className="mt-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">
                AI Root Cause Conclusion
              </div>
              <p className="mt-1 text-base font-medium leading-relaxed text-white sm:text-lg">
                {result.headline_conclusion}
              </p>
            </div>

            {/* RAG Telemetry Retrieval Checklist */}
            <div className="mt-4 flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
                AI Retrieved:
              </span>
              {[
                { ok: result.retrieval_checklist.deployment_logs, label: 'Deployment Logs' },
                { ok: result.retrieval_checklist.api_and_error_logs, label: 'API & Error Logs' },
                { ok: result.retrieval_checklist.previous_incidents, label: 'Previous Incidents' },
                { ok: result.retrieval_checklist.runbooks, label: 'SRE Runbook' },
                { ok: result.retrieval_checklist.architecture_docs, label: 'Architecture Docs' },
                { ok: result.retrieval_checklist.troubleshooting_guides, label: 'Troubleshooting Guide' },
              ].map((item) => (
                <span
                  key={item.label}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium ${
                    item.ok
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-slate-800 bg-slate-900/60 text-slate-500'
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {item.label}
                </span>
              ))}
            </div>

            {/* Chain Indicator: Possible cause -> Evidence -> Recommended investigation -> Suggested fix -> Relevant runbook */}
            <div className="mt-4 hidden items-center gap-1.5 overflow-x-auto rounded-lg border border-slate-800/90 bg-[#070B14]/80 px-3 py-2 font-mono text-[11px] text-slate-300 lg:flex">
              <span className="text-sky-300 font-semibold">1. Possible Cause</span>
              <ArrowRight className="h-3 w-3 text-slate-600" />
              <span className="text-indigo-300 font-semibold">
                2. Evidence ({result.matching_log_patterns.length} log patterns)
              </span>
              <ArrowRight className="h-3 w-3 text-slate-600" />
              <span className="text-amber-300 font-semibold">3. Recommended Investigation</span>
              <ArrowRight className="h-3 w-3 text-slate-600" />
              <span className="text-emerald-300 font-semibold">4. Suggested Fix</span>
              <ArrowRight className="h-3 w-3 text-slate-600" />
              <span className="text-cyan-300 font-semibold">
                5. Relevant Runbook ({runbook?.id ?? 'Matched'})
              </span>
            </div>
          </section>

          {/* Grid Row 1: Pillar 1 (Possible Causes) + Pillar 2A (Matching Log Patterns) */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* 1. POSSIBLE CAUSE */}
            <section className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 lg:col-span-6">
              <div className="mb-3.5 flex items-center gap-2">
                <AlertOctagon className="h-4 w-4 text-rose-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  1. Possible Cause (Ranked Hypotheses)
                </h3>
              </div>

              <div className="space-y-3.5">
                {result.possible_causes.map((pc) => (
                  <div
                    key={pc.rank}
                    className="rounded-lg border border-slate-800/90 bg-[#080D19] p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-sky-500/20 font-mono text-xs font-bold text-sky-300">
                          #{pc.rank}
                        </span>
                        <h4 className="text-sm font-semibold text-white">{pc.cause}</h4>
                      </div>
                      <span className="shrink-0 rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-sky-300 tabular-nums">
                        {(pc.probability * 100).toFixed(0)}% prob
                      </span>
                    </div>

                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-400"
                        style={{ width: `${Math.round(pc.probability * 100)}%` }}
                      />
                    </div>

                    <p className="mt-2.5 text-xs leading-relaxed text-slate-300">{pc.mechanism}</p>

                    {pc.supporting_sources.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {pc.supporting_sources.map((src) => (
                          <span
                            key={src}
                            className="rounded border border-slate-700/80 bg-slate-800/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-300"
                          >
                            {src}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* 2. EVIDENCE: MATCHING LOG PATTERNS & TELEMETRY */}
            <section className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 lg:col-span-6">
              <div className="mb-3.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileSearch className="h-4 w-4 text-indigo-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    2. Evidence — {result.matching_log_patterns.length} Matching Log Patterns
                  </h3>
                </div>
                <span className="font-mono text-[11px] text-slate-400">
                  {result.evidence.length} cited artifacts
                </span>
              </div>

              {result.matching_log_patterns.length > 0 && (
                <div className="space-y-2.5">
                  {result.matching_log_patterns.map((pat) => (
                    <div
                      key={pat.pattern_id}
                      className="rounded-lg border border-slate-800 bg-[#070B14] p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-indigo-300">
                            {pat.pattern_id}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                              pat.severity === 'CRITICAL'
                                ? 'bg-rose-500/20 text-rose-300'
                                : pat.severity === 'ERROR'
                                ? 'bg-orange-500/20 text-orange-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {pat.severity}
                          </span>
                          <span className="font-mono text-[11px] text-slate-400">
                            {pat.service}
                          </span>
                        </div>
                        <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] font-semibold text-white tabular-nums">
                          {pat.occurrences}x occurrences
                        </span>
                      </div>
                      <p className="mt-1.5 break-all font-mono text-xs text-slate-200">
                        {pat.signature}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                        <span>{pat.correlation_note}</span>
                        <span className="font-mono">{pat.first_seen}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Cited Multi-Source Evidence Snippets */}
              <div className="mt-4 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Corroborating RAG Artifacts
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {result.evidence.slice(0, 4).map((ev) => (
                    <div
                      key={`${ev.source_id}-${ev.badge_label}`}
                      className="rounded-lg border border-slate-800/80 bg-[#080D19] p-2.5"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-300">
                          {ev.badge_label}
                        </span>
                        <span className="font-mono text-[10px] text-emerald-400 tabular-nums">
                          rel {(ev.relevance_score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-1 truncate text-xs font-medium text-slate-200" title={ev.title}>
                        {ev.title}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-slate-500">
                        {ev.source_id} • {ev.service}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          {/* Grid Row 2: Pillar 3 (Recommended Investigation) + Pillar 4 (Suggested Fix) */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* 3. RECOMMENDED INVESTIGATION */}
            <section className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 lg:col-span-6">
              <div className="mb-3.5 flex items-center gap-2">
                <Terminal className="h-4 w-4 text-amber-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  3. Recommended Investigation Steps
                </h3>
              </div>

              <div className="space-y-3">
                {result.recommended_investigation.map((step) => (
                  <div
                    key={step.step_number}
                    className="rounded-lg border border-slate-800 bg-[#080D19] p-3.5"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 font-mono text-xs font-bold text-amber-300">
                        {step.step_number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-white">{step.action}</div>
                        <p className="mt-0.5 text-xs text-slate-400">{step.rationale}</p>

                        <div className="mt-2 flex items-center justify-between gap-2 rounded border border-slate-800 bg-[#050811] px-3 py-2">
                          <code className="overflow-x-auto whitespace-pre font-mono text-xs text-emerald-300">
                            {step.command}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopy(step.command)}
                            className="shrink-0 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700 hover:text-white"
                          >
                            {copiedText === step.command ? (
                              <Check className="h-3 w-3 text-emerald-400" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>

                        <div className="mt-1.5 text-[11px] text-slate-400">
                          <span className="font-semibold text-slate-300">Expected Signal: </span>
                          {step.expected_signal}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 4. SUGGESTED FIX + 5. RELEVANT RUNBOOK */}
            <div className="space-y-5 lg:col-span-6">
              <section className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
                <div className="mb-3.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      4. Suggested Fix & Rollback Plan
                    </h3>
                  </div>
                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-300">
                    ETR: {result.suggested_fix.estimated_recovery_time}
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
                      Immediate Mitigation
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-200">
                      {result.suggested_fix.immediate_mitigation}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2 rounded border border-slate-800 bg-[#050811] px-3 py-2">
                      <code className="overflow-x-auto whitespace-pre font-mono text-xs text-amber-300">
                        {result.suggested_fix.rollback_command}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopy(result.suggested_fix.rollback_command)}
                        className="shrink-0 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700 hover:text-white"
                      >
                        {copiedText === result.suggested_fix.rollback_command ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-[#080D19] p-3.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sky-300">
                      <GitCommit className="h-3.5 w-3.5" />
                      Permanent Engineering Remediation
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">
                      {result.suggested_fix.permanent_remediation}
                    </p>
                    <pre className="mt-2 overflow-x-auto rounded border border-slate-800 bg-[#050811] p-2.5 font-mono text-[11px] leading-relaxed text-slate-300">
                      {result.suggested_fix.config_or_code_diff}
                    </pre>
                  </div>
                </div>
              </section>

              {/* 5. RELEVANT RUNBOOK */}
              {runbook && (
                <section className="rounded-xl border border-sky-500/30 bg-gradient-to-r from-[#0D1629] to-[#0D1322] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-sky-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-sky-300">
                          5. Relevant SRE Runbook • {runbook.id}
                        </span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                          SLA {runbook.sla_minutes}m
                        </span>
                      </div>
                      <h4 className="mt-1.5 text-sm font-semibold text-white">{runbook.title}</h4>
                      <p className="mt-1 text-xs text-slate-300">{runbook.summary}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenRunbook(runbook.id)}
                      className="shrink-0 rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/25"
                    >
                      Open Full Runbook
                    </button>
                  </div>
                </section>
              )}
            </div>
          </div>

          {/* Agent Pipeline Execution Trace & Expandable pgvector Chunk Inspector */}
          <section className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Incident Agent Execution Trace
                </h3>
                <p className="text-xs text-slate-400">
                  React Dashboard → FastAPI → Incident Agent → RAG Pipeline → PostgreSQL + pgvector → Redis → Synthesizer
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRawChunks((s) => !s)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#080D19] px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-white"
              >
                {showRawChunks ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" />
                    Hide Raw pgvector Chunks ({result.retrieved_chunks.length})
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" />
                    Inspect Retrieved pgvector Chunks ({result.retrieved_chunks.length})
                  </>
                )}
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-5">
              {result.agent_trace.map((st, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-slate-800 bg-[#080D19] p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-[10px] font-semibold text-sky-400">
                      {st.component}
                    </span>
                    <span className="font-mono text-[10px] text-emerald-400 tabular-nums">
                      {st.duration_ms.toFixed(1)}ms
                    </span>
                  </div>
                  <div className="mt-1 font-semibold text-slate-200">{st.stage}</div>
                  <p className="mt-1 text-[11px] leading-snug text-slate-400">{st.detail}</p>
                </div>
              ))}
            </div>

            {showRawChunks && (
              <div className="mt-4 space-y-2.5 border-t border-slate-800 pt-4">
                {result.retrieved_chunks.map((ch) => (
                  <div
                    key={ch.chunk_id}
                    className="rounded-lg border border-slate-800 bg-[#070B14] p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-indigo-500/15 px-2 py-0.5 font-mono text-[11px] text-indigo-300">
                          {ch.source_type}
                        </span>
                        <span className="font-semibold text-slate-200">{ch.title}</span>
                        <span className="font-mono text-[11px] text-slate-500">({ch.chunk_id})</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
                        <span className="text-slate-400">vec: {ch.vector_score.toFixed(3)}</span>
                        <span className="text-slate-400">lex: {ch.lexical_score.toFixed(3)}</span>
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">
                          hybrid: {ch.hybrid_score.toFixed(3)}
                        </span>
                      </div>
                    </div>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-slate-300">
                      {ch.content}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
