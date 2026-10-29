import React from 'react';
import {
  Activity,
  AlertTriangle,
  Cpu,
  Database,
  Layers,
  RefreshCw,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import type { SystemTelemetry } from '../types/opsentinel';

interface TopTelemetryBarProps {
  telemetry: SystemTelemetry | null;
  onRefresh: () => void;
  onNavigateIncidents: () => void;
}

export const TopTelemetryBar: React.FC<TopTelemetryBarProps> = ({
  telemetry,
  onRefresh,
  onNavigateIncidents,
}) => {
  const sev1Count = telemetry?.incidents_summary.active_sev1 ?? 0;
  const openCount = telemetry?.incidents_summary.open_incidents ?? 0;
  const totalChunks = telemetry?.corpus.total_chunks ?? 0;
  const totalDocs = telemetry?.corpus.total_documents ?? 0;
  const hitRate = telemetry?.redis.hit_rate_pct ?? 0;
  const dbHealthy = telemetry?.database.status === 'healthy';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#080D19]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        {/* Brand Identity */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-400 shadow-sm shadow-sky-500/10">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-white">OPSENTINEL</span>
              <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                Incident Intelligence v1.0
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Multi-Source DevOps RAG • Automated Root Cause Analysis • Runbook Orchestration
            </p>
          </div>
        </div>

        {/* Live Stack Telemetry Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {sev1Count > 0 && (
            <button
              type="button"
              onClick={onNavigateIncidents}
              className="flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/15 px-2.5 py-1.5 font-medium text-rose-200 transition hover:bg-rose-500/25"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-rose-400 animate-pulse" />
              <span className="tabular-nums font-semibold">{sev1Count} Active SEV-1</span>
              <span className="text-rose-300/70">({openCount} open)</span>
            </button>
          )}

          <div className="hidden items-center gap-1.5 rounded-md border border-slate-800 bg-[#0D1322] px-2.5 py-1.5 text-slate-300 md:flex">
            <Database className={`h-3.5 w-3.5 ${dbHealthy ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span className="text-slate-400">Vector DB:</span>
            <span className="font-mono text-[11px] font-medium text-slate-200">
              {telemetry?.database.pgvector_native ? 'pgvector (384d)' : 'Vector Index (384d)'}
            </span>
          </div>

          <div className="hidden items-center gap-1.5 rounded-md border border-slate-800 bg-[#0D1322] px-2.5 py-1.5 text-slate-300 lg:flex">
            <Layers className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-slate-400">RAG Corpus:</span>
            <span className="font-mono text-[11px] font-medium tabular-nums text-slate-200">
              {totalDocs} docs / {totalChunks} chunks
            </span>
          </div>

          <div className="hidden items-center gap-1.5 rounded-md border border-slate-800 bg-[#0D1322] px-2.5 py-1.5 text-slate-300 sm:flex">
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-slate-400">Redis Hit:</span>
            <span className="font-mono text-[11px] font-medium tabular-nums text-slate-200">
              {hitRate.toFixed(0)}%
            </span>
          </div>

          <div className="hidden items-center gap-1.5 rounded-md border border-slate-800 bg-[#0D1322] px-2.5 py-1.5 text-slate-300 xl:flex">
            <Cpu className="h-3.5 w-3.5 text-cyan-400" />
            <span className="font-mono text-[11px] text-slate-300">
              {telemetry?.llm.api_key_configured ? telemetry.llm.model : 'Evidence-RCA Engine'}
            </span>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            title="Refresh live system telemetry"
            className="flex items-center gap-1 rounded-md border border-slate-800 bg-[#0D1322] px-2.5 py-1.5 text-slate-300 transition hover:border-slate-700 hover:text-white"
          >
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            <RefreshCw className="h-3 w-3 text-slate-400" />
          </button>
        </div>
      </div>
    </header>
  );
};
