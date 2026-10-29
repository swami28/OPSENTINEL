import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, Search, Sparkles } from 'lucide-react';
import { ChurnModelData, GlobalFilters, HypothesisTest } from '../types';
import { downloadCsv, formatCompactUsd, formatFullUsd } from '../utils/format';

interface Props {
  hypothesisTests: HypothesisTest[];
  churnModel: ChurnModelData;
  filters: GlobalFilters;
}

export const ChurnAndStatsTab: React.FC<Props> = ({
  hypothesisTests,
  churnModel,
  filters,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredWatchlist = useMemo(() => {
    return churnModel.watchlist.filter((acc) => {
      if (filters.segment !== 'All' && acc.segment !== filters.segment) return false;
      if (filters.region !== 'All' && acc.region !== filters.region) return false;
      if (
        filters.billingCadence !== 'All' &&
        acc.billing_cadence !== filters.billingCadence
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          acc.company_name.toLowerCase().includes(q) ||
          acc.account_id.toLowerCase().includes(q) ||
          acc.recommended_playbook.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [churnModel.watchlist, filters, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Hypothesis Testing Cards */}
      <div>
        <div className="mb-3">
          <h3 className="text-base font-semibold text-white">
            Statistical Hypothesis Testing Suite (&alpha; = 0.05)
          </h3>
          <p className="text-xs text-slate-400">
            Non-parametric &amp; parametric tests validating causal retention &amp; monetization levers
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {hypothesisTests.map((ht) => (
            <div
              key={ht.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-lg"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-300">
                  {ht.id} • {ht.method}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" /> p = {ht.p_value_display}
                </span>
              </div>

              <h4 className="mt-2.5 text-sm font-semibold text-white">{ht.title}</h4>
              <p className="mt-1 text-xs italic text-slate-400">{ht.null_hypothesis}</p>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded bg-slate-800 px-2 py-1 font-mono text-slate-200">
                  {ht.statistic_label}
                </span>
                <span className="rounded bg-slate-800 px-2 py-1 text-cyan-300">
                  Effect: {ht.effect_size}
                </span>
              </div>

              <p className="mt-3 border-t border-slate-800/80 pt-2.5 text-xs leading-relaxed text-slate-300">
                {ht.business_verdict}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Churn ML Model + Feature Drivers */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              <h3 className="text-base font-semibold text-white">
                Predictive Churn Risk Ensemble ({churnModel.algorithm})
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Evaluated with 5-Fold Stratified Cross-Validation to prevent in-sample leakage
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-center">
              <div className="text-[11px] text-slate-400">5-Fold CV ROC-AUC</div>
              <div className="font-mono text-lg font-bold text-emerald-400">
                {churnModel.cv_roc_auc.toFixed(3)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-center">
              <div className="text-[11px] text-slate-400">Precision @ Top 20%</div>
              <div className="font-mono text-lg font-bold text-indigo-300">
                {churnModel.precision_at_top_20_pct}%
              </div>
            </div>
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-3.5 py-2 text-center">
              <div className="text-[11px] text-rose-300">Active ARR Exposed</div>
              <div className="font-mono text-lg font-bold text-rose-200">
                {formatCompactUsd(churnModel.total_arr_at_risk_usd)}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {churnModel.feature_importance.map((fi) => {
            const increasesChurn = fi.direction.includes('Increases');
            return (
              <div
                key={fi.feature}
                className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200">{fi.label}</span>
                  <span
                    className={`font-mono font-semibold ${
                      increasesChurn ? 'text-rose-300' : 'text-emerald-300'
                    }`}
                  >
                    {fi.importance_pct}% • {increasesChurn ? '↑ Risk' : '↓ Protective'}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    style={{ width: `${Math.min(fi.importance_pct * 2.6, 100)}%` }}
                    className={`h-full rounded-full ${
                      increasesChurn ? 'bg-rose-500' : 'bg-emerald-500'
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* High-Risk Active Accounts Watchlist */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">
              Customer Success Actionable Watchlist ({filteredWatchlist.length} High-Risk Accounts)
            </h3>
            <p className="text-xs text-slate-400">
              Ranked by Expected ARR at Risk (Current ARR &times; Calibrated Churn Probability)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search company or playbook..."
                className="rounded-lg border border-slate-700 bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  'revlens_high_risk_watchlist.csv',
                  filteredWatchlist as unknown as Record<string, unknown>[],
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-600/20 px-3 py-1.5 text-xs font-medium text-indigo-200 transition hover:bg-indigo-600/30"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 uppercase tracking-wider text-slate-400">
                <th className="pb-2.5 pr-3">Account</th>
                <th className="pb-2.5 px-2">Segment</th>
                <th className="pb-2.5 px-2">Cadence</th>
                <th className="pb-2.5 px-2 text-right">Current ARR</th>
                <th className="pb-2.5 px-2 text-right">Seat Util</th>
                <th className="pb-2.5 px-2 text-right">SLA Breaches</th>
                <th className="pb-2.5 px-2 text-right">Churn Prob</th>
                <th className="pb-2.5 pl-3">Recommended CS Playbook</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredWatchlist.slice(0, 18).map((acc) => (
                <tr key={acc.account_id} className="hover:bg-slate-800/40">
                  <td className="py-2.5 pr-3">
                    <div className="font-semibold text-white">{acc.company_name}</div>
                    <div className="font-mono text-[10px] text-slate-400">
                      {acc.account_id} • {acc.region}
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-slate-300">{acc.segment}</td>
                  <td className="py-2.5 px-2 text-slate-300">{acc.billing_cadence}</td>
                  <td className="py-2.5 px-2 text-right font-mono font-medium text-white">
                    {formatFullUsd(acc.current_arr)}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-slate-300">
                    {acc.seat_utilization_pct}%
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-slate-300">
                    {acc.sla_breaches}
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    <span className="rounded-full bg-rose-500/20 px-2 py-0.5 font-mono font-semibold text-rose-300">
                      {acc.churn_risk_pct}%
                    </span>
                  </td>
                  <td className="py-2.5 pl-3 text-indigo-200">{acc.recommended_playbook}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
