import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Clock,
  Flame,
  History,
  Trash2,
  Zap,
} from 'lucide-react';
import { opsentinelApi } from '../lib/api';
import type { RunbookReference, SystemTelemetry } from '../types/opsentinel';

interface RunbooksAndCacheViewProps {
  telemetry: SystemTelemetry | null;
  onOpenRunbook: (runbookId: string) => void;
  onRefreshTelemetry: () => void;
}

export const RunbooksAndCacheView: React.FC<RunbooksAndCacheViewProps> = ({
  telemetry,
  onOpenRunbook,
  onRefreshTelemetry,
}) => {
  const [runbooks, setRunbooks] = useState<RunbookReference[]>([]);
  const [flushing, setFlushing] = useState(false);

  const loadRunbooks = async () => {
    const res = await opsentinelApi.listRunbooks();
    setRunbooks(res.runbooks);
  };

  useEffect(() => {
    loadRunbooks();
  }, [telemetry]);

  const handleFlush = async () => {
    setFlushing(true);
    try {
      await opsentinelApi.flushCache();
      onRefreshTelemetry();
    } finally {
      setFlushing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Redis Real-Time State Overview */}
      <section className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">
              Redis State Engine — Incident Sessions, Query Cache & Hot Runbooks
            </h2>
            <p className="text-xs text-slate-400">
              Sub-millisecond caching for repeated incident investigations, multi-turn SRE session state, and ZSET-ranked hot runbooks.
            </p>
          </div>

          <button
            type="button"
            disabled={flushing}
            onClick={handleFlush}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/25"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {flushing ? 'Flushing...' : 'Flush Query Cache'}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3.5">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Cache Hit Rate</div>
            <div className="mt-1 font-mono text-2xl font-bold text-emerald-400 tabular-nums">
              {(telemetry?.redis.hit_rate_pct ?? 0).toFixed(1)}%
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-slate-500">
              {telemetry?.redis.cache_hits ?? 0} hits / {telemetry?.redis.cache_misses ?? 0} misses
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3.5">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Cached Queries</div>
            <div className="mt-1 font-mono text-2xl font-bold text-amber-300 tabular-nums">
              {telemetry?.redis.cached_queries ?? 0}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-slate-500">TTL 900s (SETEX)</div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3.5">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Incident Sessions</div>
            <div className="mt-1 font-mono text-2xl font-bold text-sky-300 tabular-nums">
              {telemetry?.redis.active_sessions ?? 0}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-slate-500">TTL 7200s sliding</div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3.5">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Hot Runbooks ZSET</div>
            <div className="mt-1 font-mono text-2xl font-bold text-indigo-300 tabular-nums">
              {runbooks.length}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-slate-500">Ranked via ZINCRBY</div>
          </div>
        </div>
      </section>

      {/* Frequently Accessed SRE Runbooks Library */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Frequently Accessed SRE Runbooks (Ranked by Redis ZSET Score)
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {runbooks.map((rb, idx) => (
            <div
              key={rb.id}
              className="flex flex-col justify-between rounded-xl border border-slate-800 bg-[#0D1322] p-5"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-sky-300">
                      {rb.id}
                    </span>
                    <span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-300">
                      {rb.service}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400">
                      <Clock className="h-3 w-3" />
                      SLA {rb.sla_minutes}m
                    </span>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-xs font-semibold tabular-nums ${
                      idx === 0
                        ? 'border border-amber-500/40 bg-amber-500/15 text-amber-300'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    <Flame className="h-3 w-3 text-amber-400" />
                    {rb.access_count} accesses
                  </span>
                </div>

                <h4 className="mt-2.5 text-sm font-semibold text-white">{rb.title}</h4>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">{rb.summary}</p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3">
                <span className="font-mono text-[11px] text-emerald-400">
                  {rb.cached_in_redis ? '● Warm in Redis Cache' : '○ On-Demand'}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenRunbook(rb.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/25"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Inspect Runbook (+1 ZINCRBY)
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Cached Queries & Active Sessions Side-by-Side */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
          <div className="mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Cached RAG Queries (`opsentinel:query_cache:*`)
            </h3>
          </div>

          <div className="space-y-2.5">
            {(telemetry?.cached_queries_preview ?? []).length === 0 ? (
              <p className="text-xs text-slate-500">
                No cached queries currently stored. Run an investigation to populate Redis query cache.
              </p>
            ) : (
              telemetry?.cached_queries_preview.map((cq) => (
                <div
                  key={cq.cache_key}
                  className="rounded-lg border border-slate-800 bg-[#070B14] p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-slate-400">
                    <span className="truncate text-amber-300">{cq.cache_key}</span>
                    <span className="shrink-0 tabular-nums">TTL {cq.ttl_seconds}s</span>
                  </div>
                  <div className="mt-1 font-medium text-white">{cq.query}</div>
                  <div className="mt-1 line-clamp-1 text-[11px] text-slate-400">
                    {cq.headline_conclusion}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-[#0D1322] p-5">
          <div className="mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-sky-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Active Incident Sessions (`opsentinel:session:*`)
            </h3>
          </div>

          <div className="space-y-2.5">
            {(telemetry?.active_sessions_preview ?? []).length === 0 ? (
              <p className="text-xs text-slate-500">No active Redis incident sessions yet.</p>
            ) : (
              telemetry?.active_sessions_preview.map((sess) => (
                <div
                  key={sess.session_id}
                  className="rounded-lg border border-slate-800 bg-[#070B14] p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                    <span className="font-semibold text-sky-300">{sess.session_id}</span>
                    <span className="text-slate-400 tabular-nums">
                      {sess.turn_count} turn(s) • TTL {sess.ttl_seconds}s
                    </span>
                  </div>
                  <div className="mt-1 text-slate-300">{sess.latest_query}</div>
                  {sess.last_service && (
                    <div className="mt-1 font-mono text-[10px] text-emerald-400">
                      context service: {sess.last_service}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
