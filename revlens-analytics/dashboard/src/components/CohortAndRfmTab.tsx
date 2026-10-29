import React, { useState } from 'react';
import { CohortRetentionRow, FunnelStage, RfmSegmentRow } from '../types';
import { formatCompactUsd, formatFullUsd } from '../utils/format';

interface Props {
  cohortRows: CohortRetentionRow[];
  rfmSegments: RfmSegmentRow[];
  funnelStages: FunnelStage[];
}

export const CohortAndRfmTab: React.FC<Props> = ({
  cohortRows,
  rfmSegments,
  funnelStages,
}) => {
  const [metricMode, setMetricMode] = useState<'dollar_nrr_pct' | 'logo_retention_pct'>(
    'dollar_nrr_pct',
  );

  const quarters = Array.from(new Set(cohortRows.map((r) => r.cohort_quarter)));
  const offsets = Array.from({ length: 12 }, (_, i) => i);

  const cellMap = new Map<string, CohortRetentionRow>();
  cohortRows.forEach((r) => {
    cellMap.set(`${r.cohort_quarter}__${r.month_offset}`, r);
  });

  const getCellStyle = (val: number) => {
    if (metricMode === 'dollar_nrr_pct' && val >= 102) {
      return 'bg-emerald-500/30 text-emerald-200 border-emerald-500/40 font-semibold';
    }
    if (val >= 92) return 'bg-indigo-500/30 text-indigo-100 border-indigo-500/30';
    if (val >= 82) return 'bg-indigo-500/20 text-slate-200 border-slate-700/60';
    if (val >= 72) return 'bg-amber-500/20 text-amber-200 border-amber-500/30';
    return 'bg-rose-500/20 text-rose-200 border-rose-500/30';
  };

  const totalRfmArr = rfmSegments.reduce((s, r) => s + r.total_arr, 0);

  return (
    <div className="space-y-6">
      {/* Cohort Retention Heatmap */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">
              Quarterly Cohort Retention Matrix (M0 – M11)
            </h3>
            <p className="text-xs text-slate-400">
              Values &gt;100% in Dollar NRR indicate seat expansion outpacing cohort logo churn
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-1 text-xs">
            <button
              type="button"
              onClick={() => setMetricMode('dollar_nrr_pct')}
              className={`rounded-md px-3 py-1.5 font-medium transition ${
                metricMode === 'dollar_nrr_pct'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Dollar NRR %
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('logo_retention_pct')}
              className={`rounded-md px-3 py-1.5 font-medium transition ${
                metricMode === 'logo_retention_pct'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Logo Survival %
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-slate-400">
                <th className="py-2 pr-3 text-left font-medium">Signup Cohort</th>
                <th className="py-2 px-2 text-right font-medium">Logos</th>
                {offsets.map((m) => (
                  <th key={m} className="py-2 px-1.5 text-center font-medium">
                    M{m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {quarters.map((q) => {
                const m0 = cellMap.get(`${q}__0`);
                return (
                  <tr key={q}>
                    <td className="py-2 pr-3 font-mono font-semibold text-white">{q}</td>
                    <td className="py-2 px-2 text-right text-slate-400">
                      {m0?.cohort_size ?? 0}
                    </td>
                    {offsets.map((m) => {
                      const cell = cellMap.get(`${q}__${m}`);
                      if (!cell) {
                        return (
                          <td
                            key={m}
                            className="px-1 py-1.5 text-center text-slate-700"
                          >
                            —
                          </td>
                        );
                      }
                      const val = cell[metricMode];
                      return (
                        <td key={m} className="p-1">
                          <div
                            title={`${q} @ M${m}: ${cell.retained_accounts}/${cell.cohort_size} logos | ${formatFullUsd(cell.cohort_mrr)} MRR`}
                            className={`rounded border px-1.5 py-1.5 text-center font-mono ${getCellStyle(val)}`}
                          >
                            {val.toFixed(0)}%
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* RFM Segments + Onboarding Funnel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-xl lg:col-span-7">
          <h3 className="text-base font-semibold text-white">
            B2B RFM &amp; Product Adoption Customer Segmentation
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            SQL NTILE(5) scoring across Feature Adoption, Workflow Frequency &amp; Contract ARR
          </p>

          <div className="mt-4 space-y-3.5">
            {rfmSegments.map((seg) => {
              const sharePct = ((seg.total_arr / Math.max(totalRfmArr, 1)) * 100).toFixed(1);
              const isRisk = seg.rfm_segment.includes('At-Risk');
              const isChamp = seg.rfm_segment.includes('Champions');
              return (
                <div
                  key={seg.rfm_segment}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          isChamp
                            ? 'bg-emerald-400'
                            : isRisk
                              ? 'bg-rose-400'
                              : 'bg-indigo-400'
                        }`}
                      />
                      <span className="font-semibold text-white">{seg.rfm_segment}</span>
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                        {seg.account_count} accounts
                      </span>
                    </div>
                    <div className="text-sm font-bold text-white">
                      {formatCompactUsd(seg.total_arr)}{' '}
                      <span className="text-xs font-normal text-slate-400">
                        ({sharePct}% of ARR)
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      style={{ width: `${sharePct}%` }}
                      className={`h-full rounded-full ${
                        isChamp
                          ? 'bg-emerald-500'
                          : isRisk
                            ? 'bg-rose-500'
                            : 'bg-indigo-500'
                      }`}
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
                    <span>Avg MRR: {formatFullUsd(seg.avg_mrr)}</span>
                    <span>Seat Utilization: {seg.avg_seat_utilization_pct}%</span>
                    <span>Adoption Score: {seg.avg_adoption_score}/100</span>
                    <span>90d SLA Breaches: {seg.avg_sla_breaches_90d}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Onboarding Activation Funnel */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-xl lg:col-span-5">
          <h3 className="text-base font-semibold text-white">
            Customer Activation &amp; 90-Day Retention Funnel
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Biggest drop-off occurs between multi-seat invite and 14-day guided onboarding completion
          </p>

          <div className="mt-5 space-y-4">
            {funnelStages.map((st, idx) => {
              const prevCount = idx > 0 ? funnelStages[idx - 1].accounts : st.accounts;
              const stepConv = ((st.accounts / Math.max(prevCount, 1)) * 100).toFixed(1);
              return (
                <div key={st.stage} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-200">{st.stage}</span>
                    <span className="font-mono text-slate-300">
                      {st.accounts} ({st.conversion_from_top_pct}%)
                    </span>
                  </div>
                  <div className="h-6 w-full overflow-hidden rounded-lg bg-slate-800/80 p-0.5">
                    <div
                      style={{ width: `${st.conversion_from_top_pct}%` }}
                      className="flex h-full items-center justify-end rounded-md bg-gradient-to-r from-indigo-600 to-cyan-500 pr-2 text-[10px] font-semibold text-white"
                    >
                      {idx > 0 ? `${stepConv}% step` : '100%'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 rounded-xl border border-indigo-500/30 bg-indigo-950/25 p-3.5 text-xs text-indigo-200">
            <strong>Analyst Takeaway:</strong> Closing half of the drop-off at Stage 4
            (14-Day Guided Onboarding) directly protects high-velocity SMB &amp; Mid-Market
            cohorts where churn otherwise spikes 2.7x.
          </div>
        </div>
      </div>
    </div>
  );
};
