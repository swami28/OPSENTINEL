import React, { useState } from 'react';
import { BookOpen, Check, Clock, Copy, Flame, Terminal, X } from 'lucide-react';
import type { RunbookReference } from '../types/opsentinel';

interface RunbookModalProps {
  runbook: RunbookReference | null;
  onClose: () => void;
}

export const RunbookModal: React.FC<RunbookModalProps> = ({ runbook, onClose }) => {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  if (!runbook) return null;

  const handleCopy = (cmd: string) => {
    navigator.clipboard?.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 1600);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-700/80 bg-[#0D1322] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-slate-800 bg-[#0D1322]/95 px-6 py-4 backdrop-blur">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-sky-300">
                <BookOpen className="h-3.5 w-3.5" />
                {runbook.id}
              </span>
              <span className="rounded border border-slate-700 bg-slate-800/80 px-2 py-0.5 font-mono text-xs text-slate-300">
                service: {runbook.service}
              </span>
              <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-xs text-amber-300">
                <Clock className="h-3 w-3" />
                SLA {runbook.sla_minutes}m
              </span>
              <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-xs text-emerald-300">
                <Flame className="h-3 w-3" />
                Redis Accesses: {runbook.access_count}
              </span>
            </div>
            <h2 className="mt-2 text-lg font-semibold text-white">{runbook.title}</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-800 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div className="rounded-lg border border-slate-800 bg-[#080D19] p-4 text-sm text-slate-300">
            {runbook.summary}
          </div>

          {runbook.steps.length > 0 && (
            <div>
              <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Standard Operating Triage Checklist
              </h3>
              <ol className="space-y-2">
                {runbook.steps.map((step, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-3 rounded-lg border border-slate-800/80 bg-[#10182B] p-3 text-sm text-slate-200"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/20 font-mono text-xs font-bold text-sky-300">
                      {idx + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {runbook.key_commands.length > 0 && (
            <div>
              <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Verified Diagnostic & Mitigation Commands
              </h3>
              <div className="space-y-2.5">
                {runbook.key_commands.map((cmd, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#060912] px-3.5 py-2.5"
                  >
                    <div className="flex items-center gap-2.5 overflow-x-auto font-mono text-xs text-emerald-300">
                      <Terminal className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      <code className="whitespace-pre">{cmd}</code>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(cmd)}
                      className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-700 bg-slate-800/80 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 hover:text-white"
                    >
                      {copiedCmd === cmd ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {runbook.raw_content && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Full Markdown Specification
              </h3>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-[#080D19] p-4 font-mono text-xs leading-relaxed text-slate-300">
                {runbook.raw_content}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
