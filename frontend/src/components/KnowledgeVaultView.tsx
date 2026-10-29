import React, { useEffect, useState } from 'react';
import {
  Database,
  FilePlus2,
  Loader2,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { opsentinelApi } from '../lib/api';
import type {
  KnowledgeDocument,
  RetrievedChunkOut,
  SourceType,
} from '../types/opsentinel';

interface KnowledgeVaultViewProps {
  onCorpusChanged: () => void;
}

const SOURCE_OPTIONS: { value: 'all' | SourceType; label: string }[] = [
  { value: 'all', label: 'All 7 Sources' },
  { value: 'application_log', label: 'Application Logs' },
  { value: 'error_log', label: 'Error Logs' },
  { value: 'deployment', label: 'Deployment History' },
  { value: 'incident', label: 'Incident Reports' },
  { value: 'runbook', label: 'Runbooks' },
  { value: 'architecture', label: 'Architecture Docs' },
  { value: 'troubleshooting', label: 'Troubleshooting Guides' },
];

export const KnowledgeVaultView: React.FC<KnowledgeVaultViewProps> = ({
  onCorpusChanged,
}) => {
  const [docs, setDocs] = useState<KnowledgeDocument[]>([]);
  const [sourceFilter, setSourceFilter] = useState<'all' | SourceType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showIngest, setShowIngest] = useState(false);

  // Ingestion form
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('error_log');
  const [service, setService] = useState('payment-api');
  const [severity, setSeverity] = useState('ERROR');
  const [version, setVersion] = useState('v2.15.1');
  const [rawContent, setRawContent] = useState('');
  const [ingesting, setIngesting] = useState(false);

  // Direct pgvector semantic search tester
  const [vectorQuery, setVectorQuery] = useState('');
  const [vectorHits, setVectorHits] = useState<RetrievedChunkOut[] | null>(null);
  const [searchingVector, setSearchingVector] = useState(false);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const items = await opsentinelApi.listKnowledge({
        source_type: sourceFilter,
        q: searchQuery || undefined,
      });
      setDocs(items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceFilter]);

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !rawContent.trim()) return;
    setIngesting(true);
    try {
      await opsentinelApi.ingestKnowledge({
        title: title.trim(),
        source_type: sourceType,
        service: service.trim().toLowerCase(),
        environment: 'production',
        severity,
        version: version.trim() || undefined,
        raw_content: rawContent.trim(),
      });
      setTitle('');
      setRawContent('');
      setShowIngest(false);
      await loadDocuments();
      onCorpusChanged();
    } finally {
      setIngesting(false);
    }
  };

  const fillSampleLog = () => {
    setTitle('Error Logs — billing-webhook Stripe Signature Timeout');
    setSourceType('error_log');
    setService('billing-webhook');
    setSeverity('ERROR');
    setVersion('v1.8.2');
    setRawContent(
      '2026-10-28T15:12:04Z ERROR billing-webhook-6f8b2-q9m1x webhook.handler: Upstream timeout verifying KMS HMAC key after KMS endpoint rotation duration=5002ms (occurrences=52)\n2026-10-28T15:12:09Z CRITICAL billing-webhook-6f8b2-q9m1x http.server: Returning HTTP 500 to webhook delivery retry queue'
    );
  };

  const handleDelete = async (docId: string) => {
    await opsentinelApi.deleteKnowledge(docId);
    await loadDocuments();
    onCorpusChanged();
  };

  const handleVectorSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vectorQuery.trim()) return;
    setSearchingVector(true);
    try {
      const hits = await opsentinelApi.semanticSearch({
        query: vectorQuery.trim(),
        top_k: 6,
      });
      setVectorHits(hits);
    } finally {
      setSearchingVector(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Feed Telemetry Action */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0D1322] p-5">
        <div>
          <h2 className="text-base font-semibold text-white">
            7-Source RAG Knowledge Base & Live Telemetry Ingestion
          </h2>
          <p className="text-xs text-slate-400">
            Feed application logs, error logs, deployments, incident reports, runbooks, architecture docs, and troubleshooting guides into PostgreSQL + pgvector (384d).
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowIngest((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-400"
        >
          <FilePlus2 className="h-4 w-4" />
          Feed Telemetry / Document
        </button>
      </div>

      {/* Live Ingestion Form */}
      {showIngest && (
        <form
          onSubmit={handleIngest}
          className="space-y-3.5 rounded-xl border border-sky-500/30 bg-[#0D1322] p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
              Ingest New Operational Artifact (Auto-Chunks + 384d Embeds + Invalidates Stale Cache)
            </h3>
            <button
              type="button"
              onClick={fillSampleLog}
              className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-sky-300 hover:bg-slate-700"
            >
              Load Sample Error Log
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Artifact title"
              className="rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 text-xs text-white md:col-span-2"
            />
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as SourceType)}
              className="rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
            >
              {SOURCE_OPTIONS.filter((o) => o.value !== 'all').map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              required
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="Service (e.g. payment-api)"
              className="rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
            >
              <option value="CRITICAL">CRITICAL</option>
              <option value="ERROR">ERROR</option>
              <option value="WARN">WARN</option>
              <option value="INFO">INFO</option>
            </select>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="Release version (optional, e.g. v2.15.1)"
              className="rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2 font-mono text-xs text-white"
            />
          </div>

          <textarea
            rows={5}
            required
            value={rawContent}
            onChange={(e) => setRawContent(e.target.value)}
            placeholder="Paste raw log lines, deployment notes, postmortem summary, or Markdown runbook..."
            className="w-full rounded-lg border border-slate-700 bg-[#070B14] p-3 font-mono text-xs text-slate-200"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowIngest(false)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={ingesting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-1.5 text-xs font-semibold text-slate-950"
            >
              {ingesting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Chunk, Embed & Index
            </button>
          </div>
        </form>
      )}

      {/* Direct pgvector Hybrid Similarity Sandbox */}
      <section className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
        <form onSubmit={handleVectorSearch} className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-700 bg-[#070B14] px-3 py-2">
            <Sparkles className="h-4 w-4 text-indigo-400" />
            <input
              type="text"
              value={vectorQuery}
              onChange={(e) => setVectorQuery(e.target.value)}
              placeholder="Test direct pgvector hybrid similarity search (e.g. 'QueuePool limit DB_POOL_MAX_SIZE' or 'SSL certificate verify failed')..."
              className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={searchingVector}
            className="rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-3.5 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/25"
          >
            {searchingVector ? 'Searching...' : 'Run Vector Search'}
          </button>
          {vectorHits && (
            <button
              type="button"
              onClick={() => setVectorHits(null)}
              className="rounded-lg border border-slate-700 px-2.5 py-2 text-xs text-slate-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </form>

        {vectorHits && (
          <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {vectorHits.map((hit) => (
              <div
                key={hit.chunk_id}
                className="rounded-lg border border-indigo-500/25 bg-[#070B14] p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-indigo-300">
                    {hit.source_type} • {hit.service}
                  </span>
                  <span className="font-mono text-[11px] text-emerald-300 tabular-nums">
                    hybrid {(hit.hybrid_score * 100).toFixed(1)}% (vec {hit.vector_score.toFixed(2)})
                  </span>
                </div>
                <div className="mt-1 font-semibold text-white">{hit.title}</div>
                <pre className="mt-1.5 line-clamp-3 overflow-hidden whitespace-pre-wrap font-mono text-[11px] text-slate-300">
                  {hit.content}
                </pre>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Filter Pills + Keyword Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {SOURCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSourceFilter(opt.value)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                sourceFilter === opt.value
                  ? 'border-sky-500/50 bg-sky-500/15 text-sky-200'
                  : 'border-slate-800 bg-[#0D1322] text-slate-400 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            loadDocuments();
          }}
          className="flex items-center gap-2"
        >
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0D1322] px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter corpus..."
              className="bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>
        </form>
      </div>

      {/* Document Cards */}
      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-800 bg-[#0D1322] py-14 text-sm text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-sky-400" />
          Loading indexed RAG telemetry...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {docs.map((doc) => (
            <article
              key={doc.id}
              className="flex flex-col justify-between rounded-xl border border-slate-800 bg-[#0D1322] p-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-sky-300">
                      {doc.source_type}
                    </span>
                    <span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                      {doc.service}
                    </span>
                    {doc.version && (
                      <span className="rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300">
                        {doc.version}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-400">
                      <Database className="h-3 w-3" />
                      {doc.chunk_count} chunk(s)
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDelete(doc.id)}
                    title="Delete artifact from vector index"
                    className="rounded p-1 text-slate-500 hover:bg-rose-500/15 hover:text-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <h3 className="mt-2 text-sm font-semibold text-white">{doc.title}</h3>
                <div className="mt-0.5 font-mono text-[10px] text-slate-500">{doc.id}</div>

                <pre className="mt-2.5 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-800/90 bg-[#070B14] p-3 font-mono text-[11px] leading-relaxed text-slate-300">
                  {doc.raw_content}
                </pre>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
