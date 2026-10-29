import React, { useState } from 'react';
import { Database, Play, ShieldCheck, Terminal } from 'lucide-react';
import { DataQualityAudit, SqlPreset } from '../types';

interface Props {
  presets: SqlPreset[];
  audit: DataQualityAudit;
  warehouseTables: string[];
  liveApiConnected: boolean;
}

export const SqlWorkbenchTab: React.FC<Props> = ({
  presets,
  audit,
  warehouseTables,
  liveApiConnected,
}) => {
  const [selectedId, setSelectedId] = useState<string>(presets[0]?.id ?? '');
  const [sqlText, setSqlText] = useState<string>(presets[0]?.sql ?? '');
  const [columns, setColumns] = useState<string[]>(presets[0]?.columns ?? []);
  const [rows, setRows] = useState<Record<string, string | number | null>[]>(
    presets[0]?.rows ?? [],
  );
  const [execMs, setExecMs] = useState<number>(presets[0]?.execution_ms ?? 1.2);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [running, setRunning] = useState<boolean>(false);

  const handleSelectPreset = (preset: SqlPreset) => {
    setSelectedId(preset.id);
    setSqlText(preset.sql);
    setColumns(preset.columns);
    setRows(preset.rows);
    setExecMs(preset.execution_ms);
    setErrorMsg(null);
  };

  const handleRunSql = async () => {
    setErrorMsg(null);
    if (!liveApiConnected) {
      const matched = presets.find((p) => p.sql.trim() === sqlText.trim());
      if (matched) {
        setColumns(matched.columns);
        setRows(matched.rows);
        setExecMs(matched.execution_ms);
      } else {
        setErrorMsg(
          'Static GitHub Pages mode displays pre-computed SQL warehouse outputs. Start the local FastAPI server to run custom ad-hoc SQL.',
        );
      }
      return;
    }

    setRunning(true);
    try {
      const res = await fetch('/api/sql/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sqlText, max_rows: 200 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.detail || 'SQL query failed');
      } else {
        setColumns(data.columns);
        setRows(data.rows);
        setExecMs(data.execution_ms);
      }
    } catch {
      setErrorMsg('Unable to reach live SQLite API endpoint.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Interactive SQL Workbench */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-indigo-400" />
              <h3 className="text-base font-semibold text-white">
                Star-Schema Analytical SQL Workbench
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Inspect production CTE &amp; Window-Function queries or run custom read-only SELECT statements
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {warehouseTables.map((tbl) => (
              <span
                key={tbl}
                className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-[11px] text-slate-300"
              >
                <Database className="h-3 w-3 text-indigo-400" /> {tbl}
              </span>
            ))}
          </div>
        </div>

        {/* Preset Query Pills */}
        <div className="mt-4 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelectPreset(p)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                selectedId === p.id
                  ? 'border-indigo-500 bg-indigo-600/25 text-white'
                  : 'border-slate-800 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              {p.title}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <textarea
            value={sqlText}
            onChange={(e) => setSqlText(e.target.value)}
            rows={10}
            spellCheck={false}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-emerald-300 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-400">
            Returned <strong>{rows.length}</strong> rows in{' '}
            <strong className="font-mono text-indigo-300">{execMs} ms</strong>
          </div>
          <button
            type="button"
            disabled={running}
            onClick={handleRunSql}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-indigo-500 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            {running ? 'Executing...' : 'Run SQL Query'}
          </button>
        </div>

        {errorMsg && (
          <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3.5 py-2 text-xs text-rose-200">
            {errorMsg}
          </div>
        )}

        {/* SQL Result Table */}
        <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-slate-800 bg-slate-950/80">
          <table className="w-full text-left font-mono text-xs">
            <thead className="sticky top-0 bg-slate-900 text-slate-300">
              <tr>
                {columns.map((col) => (
                  <th key={col} className="whitespace-nowrap border-b border-slate-800 px-3 py-2">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {rows.slice(0, 60).map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40">
                  {columns.map((col) => (
                    <td key={col} className="whitespace-nowrap px-3 py-2 text-slate-300">
                      {String(row[col] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ETL Data Cleaning & Hygiene Audit */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <h3 className="text-base font-semibold text-white">
                Automated ETL Data Cleaning &amp; Quality Audit Log
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Ingested {audit.raw_total_rows.toLocaleString()} raw records &rarr; remediated{' '}
              {audit.total_anomalies_remediated} anomalies &rarr;{' '}
              {audit.clean_total_rows.toLocaleString()} validated star-schema rows
            </p>
          </div>
          <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
            Post-ETL Warehouse Health: {audit.post_etl_health_score_pct}%
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 uppercase tracking-wider text-slate-400">
                <th className="pb-2.5 pr-3">Rule</th>
                <th className="pb-2.5 px-2">Dimension</th>
                <th className="pb-2.5 px-2">Target Table</th>
                <th className="pb-2.5 px-2">Raw Anomaly Detected</th>
                <th className="pb-2.5 px-2 text-right">Rows Fixed</th>
                <th className="pb-2.5 pl-3">ETL Remediation Applied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {audit.checks.map((chk) => (
                <tr key={chk.rule_id} className="hover:bg-slate-800/40">
                  <td className="py-2.5 pr-3 font-mono font-semibold text-indigo-300">
                    {chk.rule_id}
                  </td>
                  <td className="py-2.5 px-2 font-medium text-white">{chk.dimension}</td>
                  <td className="py-2.5 px-2 font-mono text-slate-300">{chk.table}</td>
                  <td className="py-2.5 px-2 text-slate-300">{chk.issue_detected}</td>
                  <td className="py-2.5 px-2 text-right font-mono font-semibold text-amber-300">
                    {chk.records_affected}
                  </td>
                  <td className="py-2.5 pl-3 text-emerald-300">{chk.remediation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
