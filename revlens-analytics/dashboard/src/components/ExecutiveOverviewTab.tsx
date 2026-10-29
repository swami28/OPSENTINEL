import React, { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  Users,
  Activity,
  ShieldAlert,
  Award,
} from 'lucide-react';
import {
  ChannelEconomicsRow,
  ForecastPoint,
  HeadlineKpis,
} from '../types';
import { formatCompactUsd, formatFullUsd } from '../utils/format';

export interface FilteredMonthlySeriesPoint {
  month: string;
  active_accounts: number;
  beginning_mrr: number;
  new_mrr: number;
  expansion_mrr: number;
  contraction_mrr: number;
  churned_mrr: number;
  ending_mrr: number;
}

interface Props {
  kpis: HeadlineKpis;
  filteredSeries: FilteredMonthlySeriesPoint[];
  forecastPoints: ForecastPoint[];
  channelEconomics: ChannelEconomicsRow[];
  isFiltered: boolean;
}

export const ExecutiveOverviewTab: React.FC<Props> = ({
  kpis,
  filteredSeries,
  forecastPoints,
  channelEconomics,
  isFiltered,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const latest = filteredSeries[filteredSeries.length - 1];
  const prev = filteredSeries.length > 1 ? filteredSeries[filteredSeries.length - 2] : latest;
  const momPct =
    prev && prev.ending_mrr > 0
      ? (((latest.ending_mrr - prev.ending_mrr) / prev.ending_mrr) * 100).toFixed(2)
      : '0.00';

  const trailing6 = filteredSeries.slice(-6);
  const avgMonthlyNrr =
    trailing6.reduce((acc, r) => {
      if (r.beginning_mrr <= 0) return acc + 100;
      return (
        acc +
        ((r.beginning_mrr + r.expansion_mrr - r.contraction_mrr - r.churned_mrr) /
          r.beginning_mrr) *
          100
      );
    }, 0) / Math.max(trailing6.length, 1);
  const annualizedNrr = (Math.pow(avgMonthlyNrr / 100, 12) * 100).toFixed(1);

  // Scale forecast proportionally when cross-filtered
  const scaleRatio =
    kpis.ending_mrr > 0 ? latest.ending_mrr / kpis.ending_mrr : 1;

  const combinedPoints = [
    ...filteredSeries.map((r) => ({
      month: r.month,
      mrr: r.ending_mrr,
      lower: r.ending_mrr,
      upper: r.ending_mrr,
      isForecast: false,
    })),
    ...forecastPoints.map((f) => ({
      month: f.month,
      mrr: f.projected_mrr * scaleRatio,
      lower: f.lower_95_mrr * scaleRatio,
      upper: f.upper_95_mrr * scaleRatio,
      isForecast: true,
    })),
  ];

  const svgWidth = 860;
  const svgHeight = 270;
  const pad = { top: 24, right: 24, bottom: 36, left: 66 };
  const plotW = svgWidth - pad.left - pad.right;
  const plotH = svgHeight - pad.top - pad.bottom;

  const maxY = Math.max(...combinedPoints.map((p) => p.upper), 1) * 1.08;
  const xAt = (i: number) =>
    pad.left + (i / Math.max(combinedPoints.length - 1, 1)) * plotW;
  const yAt = (val: number) => pad.top + plotH - (val / maxY) * plotH;

  const histLen = filteredSeries.length;
  const histPath = combinedPoints
    .slice(0, histLen)
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p.mrr).toFixed(1)}`)
    .join(' ');

  const forecastSlice = combinedPoints.slice(histLen - 1);
  const forecastPath = forecastSlice
    .map(
      (p, idx) =>
        `${idx === 0 ? 'M' : 'L'} ${xAt(histLen - 1 + idx).toFixed(1)} ${yAt(p.mrr).toFixed(1)}`,
    )
    .join(' ');

  const bandPolygon = [
    ...forecastSlice.map((p, idx) => `${xAt(histLen - 1 + idx).toFixed(1)},${yAt(p.upper).toFixed(1)}`),
    ...[...forecastSlice]
      .reverse()
      .map((p, revIdx) => {
        const origIdx = forecastSlice.length - 1 - revIdx;
        return `${xAt(histLen - 1 + origIdx).toFixed(1)},${yAt(p.lower).toFixed(1)}`;
      }),
  ].join(' ');

  // Max movement magnitude for stacked bar chart
  const maxPosMove = Math.max(
    ...filteredSeries.map((r) => r.new_mrr + r.expansion_mrr),
    1,
  );
  const maxNegMove = Math.max(
    ...filteredSeries.map((r) => r.contraction_mrr + r.churned_mrr),
    1,
  );
  const totalMoveSpan = maxPosMove + maxNegMove;

  return (
    <div className="space-y-6">
      {/* KPI Headline Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 shadow-lg">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Ending ARR</span>
            <DollarSign className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-white">
            {formatCompactUsd(latest.ending_mrr * 12)}
          </div>
          <div className="mt-1 text-xs text-emerald-400">
            +{momPct}% MoM growth
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 shadow-lg">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Ending MRR</span>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-white">
            {formatCompactUsd(latest.ending_mrr)}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Sep 2026 Run-Rate
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 shadow-lg">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Active B2B Logos</span>
            <Users className="h-4 w-4 text-sky-400" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-white">
            {latest.active_accounts}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            ARPU {formatFullUsd(latest.ending_mrr / Math.max(latest.active_accounts, 1))}/mo
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 shadow-lg">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Annualized NRR</span>
            <Activity className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-white">
            {annualizedNrr}%
          </div>
          <div className="mt-1 text-xs text-cyan-400">
            Trailing 6M Expansion
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 shadow-lg">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Portfolio LTV:CAC</span>
            <Award className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-white">
            {kpis.blended_ltv_cac}x
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {kpis.blended_cac_payback_months} mo CAC Payback
          </div>
        </div>

        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 shadow-lg">
          <div className="flex items-center justify-between text-xs font-medium text-rose-300">
            <span>ARR Exposed to Risk</span>
            <ShieldAlert className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-rose-200">
            {formatCompactUsd(kpis.arr_at_risk_usd * scaleRatio)}
          </div>
          <div className="mt-1 text-xs text-rose-300/80">
            ML Watchlist (&ge;42% prob)
          </div>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* MRR Trajectory + 6-Month Forecast Fan Chart */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-xl xl:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-white">
                MRR Growth Trajectory &amp; 6-Month Time-Series Forecast
              </h3>
              <p className="text-xs text-slate-400">
                18-month actuals (Apr 2025 – Sep 2026) + 6-month projection with 95% confidence band
                {isFiltered ? ' (scaled to active slice)' : ''}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-400" /> Actual MRR
              </span>
              <span className="flex items-center gap-1.5 text-emerald-300">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Forecast + 95% CI
              </span>
            </div>
          </div>

          <div className="relative mt-4">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full overflow-visible"
              onMouseLeave={() => setHoverIdx(null)}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                const val = maxY * tick;
                const y = yAt(val);
                return (
                  <g key={tick}>
                    <line
                      x1={pad.left}
                      x2={svgWidth - pad.right}
                      y1={y}
                      y2={y}
                      stroke="#1e293b"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={pad.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-500 text-[11px]"
                    >
                      {formatCompactUsd(val)}
                    </text>
                  </g>
                );
              })}

              {/* Forecast separator line */}
              <line
                x1={xAt(histLen - 1)}
                x2={xAt(histLen - 1)}
                y1={pad.top}
                y2={pad.top + plotH}
                stroke="#6366f1"
                strokeOpacity={0.45}
                strokeDasharray="3 3"
              />

              {/* 95% CI Polygon */}
              <polygon points={bandPolygon} fill="rgba(16, 185, 129, 0.16)" />

              {/* Historical line */}
              <path
                d={histPath}
                fill="none"
                stroke="#818cf8"
                strokeWidth={2.8}
                strokeLinecap="round"
              />

              {/* Forecast dashed line */}
              <path
                d={forecastPath}
                fill="none"
                stroke="#34d399"
                strokeWidth={2.8}
                strokeDasharray="6 4"
                strokeLinecap="round"
              />

              {/* Interactive points */}
              {combinedPoints.map((pt, idx) => (
                <g key={pt.month}>
                  {idx % 3 === 0 && (
                    <text
                      x={xAt(idx)}
                      y={svgHeight - 10}
                      textAnchor="middle"
                      className="fill-slate-400 text-[10px]"
                    >
                      {pt.month}
                    </text>
                  )}
                  <circle
                    cx={xAt(idx)}
                    cy={yAt(pt.mrr)}
                    r={hoverIdx === idx ? 5.5 : 3}
                    fill={pt.isForecast ? '#34d399' : '#818cf8'}
                    className="transition-all"
                  />
                  <rect
                    x={xAt(idx) - plotW / combinedPoints.length / 2}
                    y={pad.top}
                    width={plotW / combinedPoints.length}
                    height={plotH}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoverIdx(idx)}
                  />
                </g>
              ))}
            </svg>

            {hoverIdx !== null && combinedPoints[hoverIdx] && (
              <div className="mt-2 flex flex-wrap items-center justify-between rounded-lg border border-slate-700 bg-slate-950/90 px-3.5 py-2 text-xs">
                <span className="font-semibold text-white">
                  {combinedPoints[hoverIdx].month}{' '}
                  {combinedPoints[hoverIdx].isForecast ? '(Forecast)' : '(Actual)'}
                </span>
                <span className="text-indigo-300">
                  MRR: <strong>{formatFullUsd(combinedPoints[hoverIdx].mrr)}</strong> (ARR:{' '}
                  {formatCompactUsd(combinedPoints[hoverIdx].mrr * 12)})
                </span>
                {combinedPoints[hoverIdx].isForecast && (
                  <span className="text-emerald-300">
                    95% CI: {formatCompactUsd(combinedPoints[hoverIdx].lower)} –{' '}
                    {formatCompactUsd(combinedPoints[hoverIdx].upper)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Monthly MRR Waterfall Movements */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-xl xl:col-span-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">
                Monthly MRR Waterfall Components
              </h3>
              <p className="text-xs text-slate-400">
                New + Expansion inflows vs. Contraction + Churned outflows
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-300">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" /> New MRR
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Expansion
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> Contraction
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> Churned
            </span>
          </div>

          <div className="mt-4 flex h-56 items-stretch gap-1.5 border-b border-slate-800 pb-2">
            {filteredSeries.slice(1).map((row) => {
              const newPct = (row.new_mrr / totalMoveSpan) * 100;
              const expPct = (row.expansion_mrr / totalMoveSpan) * 100;
              const conPct = (row.contraction_mrr / totalMoveSpan) * 100;
              const chuPct = (row.churned_mrr / totalMoveSpan) * 100;
              return (
                <div
                  key={row.month}
                  title={`${row.month}\nNew: ${formatFullUsd(row.new_mrr)}\nExpansion: ${formatFullUsd(row.expansion_mrr)}\nContraction: -${formatFullUsd(row.contraction_mrr)}\nChurned: -${formatFullUsd(row.churned_mrr)}`}
                  className="group flex flex-1 flex-col justify-between"
                >
                  {/* Positive stack */}
                  <div className="flex h-3/5 flex-col justify-end gap-[1px]">
                    <div
                      style={{ height: `${Math.max(expPct * 1.4, 2)}%` }}
                      className="w-full rounded-t-sm bg-emerald-500/90 transition group-hover:brightness-125"
                    />
                    <div
                      style={{ height: `${Math.max(newPct * 1.4, 2)}%` }}
                      className="w-full bg-indigo-500/90 transition group-hover:brightness-125"
                    />
                  </div>
                  <div className="my-0.5 h-[1px] w-full bg-slate-700" />
                  {/* Negative stack */}
                  <div className="flex h-2/5 flex-col justify-start gap-[1px]">
                    <div
                      style={{ height: `${Math.max(conPct * 1.6, 1)}%` }}
                      className="w-full bg-amber-500/90"
                    />
                    <div
                      style={{ height: `${Math.max(chuPct * 1.6, 2)}%` }}
                      className="w-full rounded-b-sm bg-rose-500/90"
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-slate-500">
            <span>2025-05</span>
            <span>2025-11</span>
            <span>2026-04</span>
            <span>2026-09</span>
          </div>
        </div>
      </div>

      {/* Acquisition Channel Unit Economics Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-white">
              GTM Acquisition Channel Unit Economics (82% SaaS Gross Margin Adjusted)
            </h3>
            <p className="text-xs text-slate-400">
              Capital efficiency benchmark: Institutional SaaS target LTV:CAC &ge; 3.0x and CAC Payback &lt; 14 months
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-400">
                <th className="pb-3 pr-4">Acquisition Channel</th>
                <th className="pb-3 px-3 text-right">Accounts</th>
                <th className="pb-3 px-3 text-right">14d Onboarding</th>
                <th className="pb-3 px-3 text-right">Avg CAC</th>
                <th className="pb-3 px-3 text-right">Monthly ARPU</th>
                <th className="pb-3 px-3 text-right">Est. Net LTV</th>
                <th className="pb-3 px-3 text-right">LTV : CAC</th>
                <th className="pb-3 pl-3 text-right">CAC Payback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {channelEconomics.map((ch) => (
                <tr key={ch.acquisition_channel} className="hover:bg-slate-800/40">
                  <td className="py-3 pr-4 font-medium text-white">
                    {ch.acquisition_channel}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-300">
                    {ch.total_accounts}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-300">
                    {ch.onboarding_completion_pct}%
                  </td>
                  <td className="py-3 px-3 text-right text-slate-300">
                    {formatFullUsd(ch.avg_cac_usd)}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-300">
                    {formatFullUsd(ch.arpu_monthly_usd)}
                  </td>
                  <td className="py-3 px-3 text-right font-medium text-emerald-300">
                    {formatFullUsd(ch.estimated_ltv_usd)}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        ch.ltv_to_cac_ratio >= 5
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : ch.ltv_to_cac_ratio >= 3
                            ? 'bg-indigo-500/20 text-indigo-300'
                            : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {ch.ltv_to_cac_ratio.toFixed(2)}x
                    </span>
                  </td>
                  <td className="py-3 pl-3 text-right text-slate-300">
                    {ch.cac_payback_months} mos
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
