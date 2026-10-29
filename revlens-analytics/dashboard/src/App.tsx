import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Calculator,
  Database,
  Filter,
  GitBranch,
  Layers,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { AnalyticsBundle, GlobalFilters } from './types';
import {
  ExecutiveOverviewTab,
  FilteredMonthlySeriesPoint,
} from './components/ExecutiveOverviewTab';
import { CohortAndRfmTab } from './components/CohortAndRfmTab';
import { ChurnAndStatsTab } from './components/ChurnAndStatsTab';
import { WhatIfSimulatorTab } from './components/WhatIfSimulatorTab';
import { SqlWorkbenchTab } from './components/SqlWorkbenchTab';

type ActiveTab =
  | 'overview'
  | 'cohorts'
  | 'decision_science'
  | 'simulator'
  | 'sql_workbench';

export const App: React.FC = () => {
  const [bundle, setBundle] = useState<AnalyticsBundle | null>(null);
  const [liveApiConnected, setLiveApiConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  const [filters, setFilters] = useState<GlobalFilters>({
    segment: 'All',
    region: 'All',
    billingCadence: 'All',
  });

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        // Attempt live FastAPI SQLite Warehouse first
        const apiRes = await fetch('./api/bundle');
        if (apiRes.ok) {
          const contentType = apiRes.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const json = (await apiRes.json()) as AnalyticsBundle;
            if (!cancelled) {
              setBundle(json);
              setLiveApiConnected(true);
              setLoading(false);
            }
            return;
          }
        }
      } catch {
        // Fall through to static GitHub Pages bundle
      }

      try {
        const staticRes = await fetch('./data/analytics_bundle.json');
        if (!staticRes.ok) {
          throw new Error(`Failed to load analytics bundle (${staticRes.status})`);
        }
        const json = (await staticRes.json()) as AnalyticsBundle;
        if (!cancelled) {
          setBundle(json);
          setLiveApiConnected(false);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load analytics data.');
          setLoading(false);
        }
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  const isFiltered =
    filters.segment !== 'All' ||
    filters.region !== 'All' ||
    filters.billingCadence !== 'All';

  const filteredSeries = useMemo<FilteredMonthlySeriesPoint[]>(() => {
    if (!bundle) return [];
    const byMonth = new Map<string, FilteredMonthlySeriesPoint>();

    for (const row of bundle.filter_cube) {
      if (filters.segment !== 'All' && row.segment !== filters.segment) continue;
      if (filters.region !== 'All' && row.region !== filters.region) continue;
      if (
        filters.billingCadence !== 'All' &&
        row.billing_cadence !== filters.billingCadence
      ) {
        continue;
      }

      const existing = byMonth.get(row.month) ?? {
        month: row.month,
        active_accounts: 0,
        beginning_mrr: 0,
        new_mrr: 0,
        expansion_mrr: 0,
        contraction_mrr: 0,
        churned_mrr: 0,
        ending_mrr: 0,
      };
      existing.active_accounts += row.active_accounts;
      existing.beginning_mrr += row.beginning_mrr;
      existing.new_mrr += row.new_mrr;
      existing.expansion_mrr += row.expansion_mrr;
      existing.contraction_mrr += row.contraction_mrr;
      existing.churned_mrr += row.churned_mrr;
      existing.ending_mrr += row.ending_mrr;
      byMonth.set(row.month, existing);
    }

    return Array.from(byMonth.values()).sort((a, b) =>
      a.month.localeCompare(b.month),
    );
  }, [bundle, filters]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        <div className="flex items-center gap-3 text-sm font-medium">
          <span className="h-3 w-3 animate-ping rounded-full bg-indigo-500" />
          Loading RevLens Star-Schema Analytical Warehouse...
        </div>
      </div>
    );
  }

  if (error || !bundle) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-rose-300">
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-6 text-sm">
          Failed to initialize analytics bundle: {error}
        </div>
      </div>
    );
  }

  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'overview',
      label: 'Executive Revenue & Forecast',
      icon: <BarChart3 className="h-4 w-4" />,
    },
    {
      id: 'cohorts',
      label: 'Cohorts, RFM & Funnel',
      icon: <Layers className="h-4 w-4" />,
    },
    {
      id: 'decision_science',
      label: 'Churn ML & Hypothesis Lab',
      icon: <Sparkles className="h-4 w-4" />,
    },
    {
      id: 'simulator',
      label: 'What-If ROI Simulator',
      icon: <Calculator className="h-4 w-4" />,
    },
    {
      id: 'sql_workbench',
      label: 'SQL Workbench & ETL Audit',
      icon: <Database className="h-4 w-4" />,
    },
  ];

  return (
    <div className="min-h-screen pb-14">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 shadow-lg shadow-indigo-500/20">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">
                  RevLens Analytics
                </h1>
                <span className="rounded-md border border-indigo-500/30 bg-indigo-500/15 px-2 py-0.5 text-[11px] font-semibold text-indigo-300">
                  Decision Science &amp; BI
                </span>
              </div>
              <p className="text-xs text-slate-400">
                B2B SaaS Star-Schema Warehouse • Cohort NRR • Statistical Inference • Churn ML
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium ${
                liveApiConnected
                  ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300'
                  : 'border-indigo-500/30 bg-indigo-950/40 text-indigo-300'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  liveApiConnected ? 'bg-emerald-400' : 'bg-indigo-400'
                }`}
              />
              {liveApiConnected
                ? 'Live SQLite Warehouse Connected'
                : 'Static Warehouse Snapshot'}
            </span>
            <span className="hidden items-center gap-1 rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-slate-400 sm:inline-flex">
              <GitBranch className="h-3.5 w-3.5 text-slate-400" />
              Window: {bundle.reporting_window.start_month} &rarr;{' '}
              {bundle.reporting_window.end_month}
            </span>
          </div>
        </div>

        {/* Navigation Tabs & Global Cross-Filter Bar */}
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-slate-900 px-4 py-2.5 sm:px-6">
          <nav className="flex flex-wrap gap-1.5" aria-label="Analytics Views">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === item.id
                    ? 'bg-indigo-600 text-white shadow shadow-indigo-600/30'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          {/* Cross-Filters */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 text-slate-400">
              <Filter className="h-3.5 w-3.5 text-indigo-400" /> Slice:
            </span>

            <select
              aria-label="Filter Segment"
              value={filters.segment}
              onChange={(e) => setFilters((f) => ({ ...f, segment: e.target.value }))}
              className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
            >
              <option value="All">All Segments</option>
              <option value="Enterprise">Enterprise</option>
              <option value="Mid-Market">Mid-Market</option>
              <option value="SMB">SMB</option>
            </select>

            <select
              aria-label="Filter Region"
              value={filters.region}
              onChange={(e) => setFilters((f) => ({ ...f, region: e.target.value }))}
              className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
            >
              <option value="All">All Regions</option>
              <option value="North America">North America</option>
              <option value="EMEA">EMEA</option>
              <option value="APAC">APAC</option>
              <option value="LATAM">LATAM</option>
            </select>

            <select
              aria-label="Filter Contract Cadence"
              value={filters.billingCadence}
              onChange={(e) =>
                setFilters((f) => ({ ...f, billingCadence: e.target.value }))
              }
              className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
            >
              <option value="All">All Contracts</option>
              <option value="Annual">Annual</option>
              <option value="Monthly">Monthly</option>
            </select>

            {isFiltered && (
              <button
                type="button"
                onClick={() =>
                  setFilters({ segment: 'All', region: 'All', billingCadence: 'All' })
                }
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-950/40 px-2.5 py-1 text-xs text-indigo-300 hover:bg-indigo-900/40"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Active View Body */}
      <main className="mx-auto mt-6 max-w-7xl px-4 sm:px-6">
        {activeTab === 'overview' && filteredSeries.length > 0 && (
          <ExecutiveOverviewTab
            kpis={bundle.headline_kpis}
            filteredSeries={filteredSeries}
            forecastPoints={bundle.forecast.points}
            channelEconomics={bundle.channel_economics}
            isFiltered={isFiltered}
          />
        )}

        {activeTab === 'cohorts' && (
          <CohortAndRfmTab
            cohortRows={bundle.cohort_retention}
            rfmSegments={bundle.rfm_segments}
            funnelStages={bundle.onboarding_funnel}
          />
        )}

        {activeTab === 'decision_science' && (
          <ChurnAndStatsTab
            hypothesisTests={bundle.hypothesis_tests}
            churnModel={bundle.churn_model}
            filters={filters}
          />
        )}

        {activeTab === 'simulator' && (
          <WhatIfSimulatorTab kpis={bundle.headline_kpis} />
        )}

        {activeTab === 'sql_workbench' && (
          <SqlWorkbenchTab
            presets={bundle.sql_presets}
            audit={bundle.data_quality_audit}
            warehouseTables={bundle.warehouse_tables}
            liveApiConnected={liveApiConnected}
          />
        )}
      </main>
    </div>
  );
};

export default App;
