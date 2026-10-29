import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  Plus,
  Sparkles,
} from 'lucide-react';
import { opsentinelApi } from '../lib/api';
import type {
  ActiveIncident,
  IncidentStatus,
  InvestigationResponse,
  SeverityLevel,
} from '../types/opsentinel';

interface ActiveIncidentsBoardProps {
  availableServices: string[];
  onOpenInInvestigator: (rca: InvestigationResponse) => void;
  onOpenRunbook: (runbookId: string) => void;
  onDataMutated: () => void;
}

export const ActiveIncidentsBoard: React.FC<ActiveIncidentsBoardProps> = ({
  availableServices,
  onOpenInInvestigator,
  onOpenRunbook,
  onDataMutated,
}) => {
  const [incidents, setIncidents] = useState<ActiveIncident[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [runningRcaId, setRunningRcaId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);

  // Declare incident form state
  const [title, setTitle] = useState('');
  const [service, setService] = useState('payment-api');
  const [severity, setSeverity] = useState<SeverityLevel>('SEV-1');
  const [metricSpike, setMetricSpike] = useState('500 errors +300%');
  const [symptomSummary, setSymptomSummary] = useState('');

  const loadIncidents = async () => {
    setLoading(true);
    try {
      const list = await opsentinelApi.listIncidents();
      setIncidents(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncidents();
  }, []);

  const handleRunRca = async (incidentId: string) => {
    setRunningRcaId(incidentId);
    try {
      await opsentinelApi.runAutoRca({ incident_id: incidentId, bypass_cache: true });
      await loadIncidents();
      onDataMutated();
    } finally {
      setRunningRcaId(null);
    }
  };

  const handleStatusChange = async (incidentId: string, nextStatus: IncidentStatus) => {
    await opsentinelApi.updateIncidentStatus(incidentId, nextStatus);
    await loadIncidents();
    onDataMutated();
  };

  const handleDeclareIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !symptomSummary.trim()) return;
    await opsentinelApi.createIncident({
      title: title.trim(),
      service,
      severity,
      symptom_summary: symptomSummary.trim(),
      metric_spike: metricSpike.trim() || 'Elevated error rate',
    });
    setTitle('');
    setSymptomSummary('');
    setShowCreateForm(false);
    await loadIncidents();
    onDataMutated();
  };

  const statusColors: Record<IncidentStatus, string> = {
    investigating: 'border-rose-500/40 bg-rose-500/15 text-rose-200',
    identified: 'border-amber-500/40 bg-amber-500/15 text-amber-200',
    mitigated: 'border-sky-500/40 bg-sky-500/15 text-sky-200',
    resolved: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0D1322] p-5">
        <div>
          <h2 className="text-base font-semibold text-white">
            Active Production Incidents & Automated AI Root Cause Analysis
          </h2>
          <p className="text-xs text-slate-400">
            Trigger one-click multi-source RAG Root Cause Analysis across deployments, API logs, past postmortems, and SRE runbooks.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateForm((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-400"
        >
          <Plus className="h-4 w-4" />
          Declare Incident
        </button>
      </div>

      {showCreateForm && (
        <form
          onSubmit={handleDeclareIncident}
          className="space-y-4 rounded-xl border border-sky-500/30 bg-[#0D1322] p-5"
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
            Simulate / Declare Production Incident
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Incident title (e.g. Payment API 500s increased 300%)"
              className="rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 text-xs text-white md:col-span-2"
            />
            <div className="flex gap-2">
              <select
                value={service}
                onChange={(e) => setService(e.target.value)}
                className="flex-1 rounded-lg border border-slate-700 bg-[#070B14] px-2.5 py-2 font-mono text-xs text-white"
              >
                {(availableServices.length ? availableServices : ['payment-api', 'auth-gateway', 'checkout-service', 'order-worker']).map(
                  (svc) => (
                    <option key={svc} value={svc}>
                      {svc}
                    </option>
                  )
                )}
              </select>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
                className="rounded-lg border border-slate-700 bg-[#070B14] px-2.5 py-2 font-mono text-xs text-white"
              >
                <option value="SEV-1">SEV-1</option>
                <option value="SEV-2">SEV-2</option>
                <option value="SEV-3">SEV-3</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              type="text"
              value={metricSpike}
              onChange={(e) => setMetricSpike(e.target.value)}
              placeholder="Metric anomaly (e.g. 500 errors +300%)"
              className="rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
            />
            <input
              type="text"
              required
              value={symptomSummary}
              onChange={(e) => setSymptomSummary(e.target.value)}
              placeholder="Symptom summary (e.g. POST /api/v2/payments/charge timing out after deploy)"
              className="rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 text-xs text-white md:col-span-2"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-sky-500 px-4 py-1.5 text-xs font-semibold text-slate-950"
            >
              Create Incident
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-800 bg-[#0D1322] py-16 text-sm text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-sky-400" />
          Loading active incidents...
        </div>
      ) : (
        <div className="space-y-4">
          {incidents.map((inc) => {
            const rca = inc.latest_rca;
            const isRunning = runningRcaId === inc.id;
            return (
              <article
                key={inc.id}
                className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-400">{inc.id}</span>
                      <span
                        className={`rounded border px-2 py-0.5 font-mono text-[11px] font-bold ${
                          inc.severity === 'SEV-1'
                            ? 'border-rose-500/40 bg-rose-500/15 text-rose-200'
                            : 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                        }`}
                      >
                        {inc.severity}
                      </span>
                      <span
                        className={`rounded border px-2 py-0.5 font-mono text-[11px] uppercase ${
                          statusColors[inc.status]
                        }`}
                      >
                        {inc.status}
                      </span>
                      <span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-xs text-sky-300">
                        {inc.service}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-xs text-rose-300">
                        <AlertTriangle className="h-3 w-3" />
                        {inc.metric_spike}
                      </span>
                    </div>

                    <h3 className="text-base font-semibold text-white">{inc.title}</h3>
                    <p className="text-xs leading-relaxed text-slate-300">{inc.symptom_summary}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`Status for ${inc.id}`}
                      value={inc.status}
                      onChange={(e) => handleStatusChange(inc.id, e.target.value as IncidentStatus)}
                      className="rounded-lg border border-slate-700 bg-[#070B14] px-2.5 py-2 font-mono text-xs text-slate-200"
                    >
                      <option value="investigating">investigating</option>
                      <option value="identified">identified</option>
                      <option value="mitigated">mitigated</option>
                      <option value="resolved">resolved</option>
                    </select>

                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => handleRunRca(inc.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
                    >
                      {isRunning ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Running Auto-RCA...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          {rca ? 'Re-Run AI RCA' : 'Run AI Root Cause Analysis'}
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* AI Root Cause Analysis Scorecard */}
                {rca && (
                  <div className="mt-4 rounded-xl border border-sky-500/30 bg-[#080D19] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold uppercase tracking-wider text-sky-400">
                          AI Root Cause Analysis
                        </span>
                        <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] text-emerald-300 tabular-nums">
                          Confidence {(rca.confidence_score * 100).toFixed(0)}%
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {rca.relevant_runbook && (
                          <button
                            type="button"
                            onClick={() => onOpenRunbook(rca.relevant_runbook!.id)}
                            className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 font-mono text-xs text-sky-300 hover:bg-slate-700"
                          >
                            Runbook: {rca.relevant_runbook.id}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenInInvestigator(rca)}
                          className="inline-flex items-center gap-1 rounded border border-sky-500/40 bg-sky-500/15 px-2.5 py-1 text-xs font-medium text-sky-200 hover:bg-sky-500/25"
                        >
                          Open Full 5-Pillar Report
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-4">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          AI Retrieves
                        </div>
                        <ul className="mt-1.5 space-y-1 text-xs text-emerald-300">
                          <li className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            deployment logs
                          </li>
                          <li className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            API & error logs
                          </li>
                          <li className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            previous incidents
                          </li>
                          <li className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            SRE runbook
                          </li>
                        </ul>
                      </div>

                      <div className="md:col-span-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          AI Conclusion & Correlated Evidence
                        </div>
                        <p className="mt-1 text-sm font-semibold text-white">
                          {rca.possible_causes[0]?.cause || rca.headline_conclusion}
                        </p>
                        <p className="mt-1 text-xs text-slate-300">{rca.headline_conclusion}</p>
                        <div className="mt-2 inline-flex items-center gap-2 rounded border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 font-mono text-xs text-indigo-200">
                          Evidence: {rca.matching_log_patterns.length} matching log patterns •{' '}
                          {rca.evidence.length} RAG citations
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Recommended Action
                        </div>
                        <p className="mt-1 text-xs text-slate-200">
                          {rca.suggested_fix.immediate_mitigation}
                        </p>
                        <code className="mt-2 block overflow-x-auto rounded border border-slate-800 bg-[#050811] p-2 font-mono text-[11px] text-amber-300">
                          {rca.suggested_fix.rollback_command}
                        </code>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
