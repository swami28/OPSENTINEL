import React, { useState } from 'react';
import { Calculator, RotateCcw, TrendingUp } from 'lucide-react';
import { HeadlineKpis } from '../types';
import { formatCompactUsd, formatFullUsd } from '../utils/format';

interface Props {
  kpis: HeadlineKpis;
}

export const WhatIfSimulatorTab: React.FC<Props> = ({ kpis }) => {
  const [onboardingLift, setOnboardingLift] = useState<number>(15);
  const [slaReduction, setSlaReduction] = useState<number>(40);
  const [annualMigration, setAnnualMigration] = useState<number>(20);
  const [rolloutHybridPricing, setRolloutHybridPricing] = useState<boolean>(true);

  const baseArr = kpis.ending_arr;
  const arrAtRisk = kpis.arr_at_risk_usd;

  const savedOnboarding = arrAtRisk * (onboardingLift / 30.0) * 0.28;
  const savedSla = arrAtRisk * (slaReduction / 80.0) * 0.24;
  const savedAnnual = arrAtRisk * (annualMigration / 50.0) * 0.19;
  const pricingExpansion = rolloutHybridPricing ? baseArr * 0.068 : 0.0;

  const totalIncrementalArr =
    savedOnboarding + savedSla + savedAnnual + pricingExpansion;
  const projectedArr = baseArr + totalIncrementalArr;
  const projectedNrr = (
    kpis.annualized_nrr_pct +
    (totalIncrementalArr / Math.max(baseArr, 1)) * 100 * 0.65
  ).toFixed(1);

  const levers = [
    {
      label: '14-Day Guided Onboarding Playbook',
      value: savedOnboarding,
      color: 'bg-indigo-500',
    },
    {
      label: 'P1/P2 Support SLA Triage Pod',
      value: savedSla,
      color: 'bg-cyan-500',
    },
    {
      label: 'Monthly → Annual Prepay Incentive',
      value: savedAnnual,
      color: 'bg-amber-500',
    },
    {
      label: 'Usage-Hybrid Pricing Rollout (HT-04 Winner)',
      value: pricingExpansion,
      color: 'bg-emerald-500',
    },
  ];

  const resetDefaults = () => {
    setOnboardingLift(15);
    setSlaReduction(40);
    setAnnualMigration(20);
    setRolloutHybridPricing(true);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Controls Panel */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-xl lg:col-span-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-indigo-400" />
            <h3 className="text-base font-semibold text-white">
              Decision Levers (Scenario Parameters)
            </h3>
          </div>
          <button
            type="button"
            onClick={resetDefaults}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>

        <p className="mt-1 text-xs text-slate-400">
          Elasticities calibrated directly from warehouse hypothesis tests (HT-01 – HT-04)
        </p>

        <div className="mt-5 space-y-5">
          <div>
            <div className="flex justify-between text-xs">
              <label htmlFor="sim-onb" className="font-medium text-slate-200">
                14-Day Onboarding Completion Lift
              </label>
              <span className="font-mono font-semibold text-indigo-300">
                +{onboardingLift}%
              </span>
            </div>
            <input
              id="sim-onb"
              type="range"
              min={0}
              max={30}
              step={1}
              value={onboardingLift}
              onChange={(e) => setOnboardingLift(Number(e.target.value))}
              className="mt-2 w-full accent-indigo-500"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs">
              <label htmlFor="sim-sla" className="font-medium text-slate-200">
                Support First-Response SLA Breach Reduction
              </label>
              <span className="font-mono font-semibold text-cyan-300">
                -{slaReduction}%
              </span>
            </div>
            <input
              id="sim-sla"
              type="range"
              min={0}
              max={80}
              step={5}
              value={slaReduction}
              onChange={(e) => setSlaReduction(Number(e.target.value))}
              className="mt-2 w-full accent-cyan-500"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs">
              <label htmlFor="sim-ann" className="font-medium text-slate-200">
                Monthly-to-Annual Contract Migration
              </label>
              <span className="font-mono font-semibold text-amber-300">
                +{annualMigration}%
              </span>
            </div>
            <input
              id="sim-ann"
              type="range"
              min={0}
              max={50}
              step={5}
              value={annualMigration}
              onChange={(e) => setAnnualMigration(Number(e.target.value))}
              className="mt-2 w-full accent-amber-500"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
            <div>
              <div className="text-xs font-semibold text-white">
                Roll Out Usage-Hybrid Pricing Tier
              </div>
              <div className="text-[11px] text-slate-400">
                Validated +7.4 pp conversion &amp; ARPU uplift in N=840 A/B test
              </div>
            </div>
            <input
              type="checkbox"
              checked={rolloutHybridPricing}
              onChange={(e) => setRolloutHybridPricing(e.target.checked)}
              className="h-4 w-4 rounded accent-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Output Impact Panel */}
      <div className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-xl lg:col-span-7">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-400" />
          <h3 className="text-base font-semibold text-white">
            Projected 12-Month Executive ARR &amp; NRR Impact
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="text-xs text-slate-400">Baseline Ending ARR</div>
            <div className="mt-1 text-xl font-bold text-slate-200">
              {formatCompactUsd(baseArr)}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/25 p-4">
            <div className="text-xs text-emerald-300">Incremental / Saved ARR</div>
            <div className="mt-1 text-xl font-bold text-emerald-300">
              +{formatFullUsd(totalIncrementalArr)}
            </div>
          </div>

          <div className="rounded-xl border border-indigo-500/40 bg-indigo-950/25 p-4">
            <div className="text-xs text-indigo-300">Projected ARR &amp; NRR</div>
            <div className="mt-1 text-xl font-bold text-white">
              {formatCompactUsd(projectedArr)}
            </div>
            <div className="text-[11px] text-indigo-300">
              NRR: {kpis.annualized_nrr_pct}% &rarr; <strong>{projectedNrr}%</strong>
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Incremental ARR Attribution by Strategic Initiative
          </div>
          {levers.map((lv) => {
            const pct =
              totalIncrementalArr > 0
                ? (lv.value / totalIncrementalArr) * 100
                : 0;
            return (
              <div key={lv.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-200">{lv.label}</span>
                  <span className="font-mono font-semibold text-white">
                    +{formatFullUsd(lv.value)} ({pct.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    style={{ width: `${Math.max(pct, lv.value > 0 ? 3 : 0)}%` }}
                    className={`h-full rounded-full ${lv.color}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
