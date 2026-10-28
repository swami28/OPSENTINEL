import React, { useState } from 'react';
import {
  ArrowDown,
  CheckCircle2,
  Cpu,
  Database,
  KeyRound,
  Layers,
  Server,
  Shield,
  Zap,
} from 'lucide-react';
import { opsentinelApi } from '../lib/api';
import type { SystemTelemetry } from '../types/opsentinel';

interface ArchitectureViewProps {
  telemetry: SystemTelemetry | null;
  onRefreshTelemetry: () => void;
}

export const ArchitectureView: React.FC<ArchitectureViewProps> = ({
  telemetry,
  onRefreshTelemetry,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('gpt-4o-mini');
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSaveLlm = async (e: React.FormEvent) => {
    e.preventDefault();
    await opsentinelApi.updateLlmConfig({
      openai_api_key: apiKey,
      openai_base_url: baseUrl,
      openai_model: model,
    });
    setApiKey('');
    setSavedNotice(true);
    onRefreshTelemetry();
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const bySource = telemetry?.corpus.documents_by_source ?? {};

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Live Architectural Dataflow Diagram */}
      <section className="rounded-xl border border-slate-800 bg-[#0D1322] p-6 lg:col-span-7">
        <h2 className="text-base font-semibold text-white">
          OPSENTINEL System Architecture & Live Pipeline Telemetry
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          End-to-end containerized topology orchestrated via Docker Compose & validated by GitHub Actions CI/CD.
        </p>

        <div className="mt-6 flex flex-col items-center space-y-2">
          {/* Layer 1: React Dashboard */}
          <div className="w-full max-w-lg rounded-xl border border-sky-500/35 bg-[#080D19] p-3.5 text-center">
            <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-300">
              <Shield className="h-4 w-4" />
              React 18 + TypeScript + Tailwind SRE Dashboard
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">
              5-Pillar RCA Explorer • Auto-RCA Board • Live Telemetry Ingestion
            </p>
          </div>

          <ArrowDown className="h-4 w-4 text-slate-600" />

          {/* Layer 2: FastAPI + Redis Sidecar */}
          <div className="grid w-full max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-500/35 bg-[#080D19] p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                <Server className="h-4 w-4" />
                FastAPI v1 Gateway
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                REST endpoints, Pydantic v2 validation, health & telemetry probes
              </p>
            </div>

            <div className="rounded-xl border border-amber-500/35 bg-[#080D19] p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                <Zap className="h-4 w-4" />
                Redis 7 Cache & Sessions
              </div>
              <p className="mt-1 font-mono text-[11px] text-slate-300 tabular-nums">
                {telemetry?.redis.active_sessions ?? 0} sessions •{' '}
                {telemetry?.redis.cached_queries ?? 0} cached queries •{' '}
                {(telemetry?.redis.hit_rate_pct ?? 0).toFixed(0)}% hit
              </p>
            </div>
          </div>

          <ArrowDown className="h-4 w-4 text-slate-600" />

          {/* Layer 3: Incident Agent */}
          <div className="w-full max-w-lg rounded-xl border border-indigo-500/40 bg-[#080D19] p-3.5 text-center">
            <div className="text-xs font-bold uppercase tracking-wider text-indigo-300">
              OPSENTINEL Incident Agent
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Query Planner → Stratified 7-Silo Retriever → Log Pattern Correlator → Runbook Matcher
            </p>
          </div>

          <ArrowDown className="h-4 w-4 text-slate-600" />

          {/* Layer 4: RAG Pipeline Box */}
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-[#080D19] p-4">
            <div className="mb-2.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-200">
              <span className="flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-sky-400" />
                Multi-Source RAG Pipeline
              </span>
              <span className="font-mono text-[11px] text-sky-300 tabular-nums">
                {telemetry?.corpus.total_chunks ?? 0} embedded chunks
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {[
                {
                  name: 'Logs',
                  count: (bySource.application_log ?? 0) + (bySource.error_log ?? 0),
                },
                { name: 'Runbooks', count: (bySource.runbook ?? 0) + (bySource.troubleshooting ?? 0) },
                { name: 'Incidents', count: (bySource.incident ?? 0) + (bySource.deployment ?? 0) },
                { name: 'Architecture', count: bySource.architecture ?? 0 },
              ].map((silo) => (
                <div
                  key={silo.name}
                  className="rounded-lg border border-slate-800 bg-[#0D1322] p-2.5 text-center"
                >
                  <div className="font-semibold text-white">{silo.name}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-slate-400 tabular-nums">
                    {silo.count} docs
                  </div>
                </div>
              ))}
            </div>
          </div>

          <ArrowDown className="h-4 w-4 text-slate-600" />

          {/* Layer 5: PostgreSQL + pgvector */}
          <div className="w-full max-w-lg rounded-xl border border-emerald-500/35 bg-[#080D19] p-3.5 text-center">
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-300">
              <Database className="h-4 w-4" />
              PostgreSQL 16 + pgvector (HNSW Cosine Index • 384d)
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-slate-400">
              Active Engine: {telemetry?.database.backend ?? 'initializing'}
            </p>
          </div>

          <ArrowDown className="h-4 w-4 text-slate-600" />

          {/* Layer 6: LLM Synthesis */}
          <div className="w-full max-w-lg rounded-xl border border-cyan-500/35 bg-[#080D19] p-3.5 text-center">
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-cyan-300">
              <Cpu className="h-4 w-4" />
              LLM / Causal Evidence RCA Synthesizer
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-slate-400">
              Mode: {telemetry?.llm.provider} ({telemetry?.llm.model})
            </p>
          </div>
        </div>
      </section>

      {/* Runtime LLM Configuration + CI/CD Summary */}
      <div className="space-y-6 lg:col-span-5">
        <section className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-white">Runtime LLM Provider Configuration</h3>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            OPSENTINEL works out-of-the-box using its deterministic Evidence-Grounded SRE Synthesizer. Optionally connect any OpenAI-compatible LLM endpoint (OpenAI, Ollama, Groq, OpenRouter) live:
          </p>

          <form onSubmit={handleSaveLlm} className="mt-4 space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400">
                API Key (leave empty to revert to built-in synthesizer)
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400">Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400">Model</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              {savedNotice ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Runtime LLM settings updated
                </span>
              ) : (
                <span />
              )}
              <button
                type="submit"
                className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400"
              >
                Apply Configuration
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
          <h3 className="text-sm font-semibold text-white">
            Docker & GitHub Actions DevOps Pipeline
          </h3>
          <ul className="mt-3 space-y-2 text-xs text-slate-300">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span>
                <strong>Docker Stack:</strong> <code>frontend</code> (Nginx + React SPA),{' '}
                <code>backend</code> (FastAPI), <code>postgres</code> (<code>pgvector/pgvector:pg16</code>),{' '}
                <code>redis</code> (<code>redis:7-alpine</code>).
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span>
                <strong>CI/CD Stages:</strong> Push → Ruff & Pytest (against live pgvector + Redis service containers) → TypeScript & Vite Build → Multi-Stage Docker Compose E2E Smoke Test → GHCR Image Publish & Deployment.
              </span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
};
