import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Database,
  Network,
  Sparkles,
} from 'lucide-react';
import { opsentinelApi } from './lib/api';
import { TopTelemetryBar } from './components/TopTelemetryBar';
import { InvestigationWorkspace } from './components/InvestigationWorkspace';
import { ActiveIncidentsBoard } from './components/ActiveIncidentsBoard';
import { KnowledgeVaultView } from './components/KnowledgeVaultView';
import { RunbooksAndCacheView } from './components/RunbooksAndCacheView';
import { ArchitectureView } from './components/ArchitectureView';
import { RunbookModal } from './components/RunbookModal';
import type {
  InvestigationResponse,
  RunbookReference,
  SystemTelemetry,
} from './types/opsentinel';

type TabKey = 'investigator' | 'incidents' | 'knowledge' | 'runbooks' | 'architecture';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('investigator');
  const [telemetry, setTelemetry] = useState<SystemTelemetry | null>(null);
  const [activeRunbook, setActiveRunbook] = useState<RunbookReference | null>(null);
  const [forwardedRca, setForwardedRca] = useState<InvestigationResponse | null>(null);

  const refreshTelemetry = useCallback(async () => {
    try {
      const data = await opsentinelApi.getTelemetry();
      setTelemetry(data);
    } catch {
      // gracefully tolerate startup window
    }
  }, []);

  useEffect(() => {
    refreshTelemetry();
  }, [refreshTelemetry]);

  const handleOpenRunbook = async (runbookId: string) => {
    try {
      const detail = await opsentinelApi.getRunbookDetail(runbookId);
      setActiveRunbook(detail);
      refreshTelemetry();
    } catch {
      // ignore if missing
    }
  };

  const handleOpenInInvestigator = (rca: InvestigationResponse) => {
    setForwardedRca(rca);
    setActiveTab('investigator');
  };

  const navItems: { id: TabKey; label: string; icon: React.ReactNode; badge?: string | number }[] = [
    {
      id: 'investigator',
      label: 'AI Investigator',
      icon: <Sparkles className="h-4 w-4" />,
    },
    {
      id: 'incidents',
      label: 'Active Incidents & Auto-RCA',
      icon: <AlertTriangle className="h-4 w-4" />,
      badge: telemetry?.incidents_summary.open_incidents,
    },
    {
      id: 'knowledge',
      label: 'RAG Telemetry & Ingestion',
      icon: <Database className="h-4 w-4" />,
      badge: telemetry?.corpus.total_documents,
    },
    {
      id: 'runbooks',
      label: 'Runbooks & Redis Cache',
      icon: <BookOpen className="h-4 w-4" />,
    },
    {
      id: 'architecture',
      label: 'System Architecture',
      icon: <Network className="h-4 w-4" />,
    },
  ];

  const availableServices = telemetry?.corpus.indexed_services ?? [
    'payment-api',
    'auth-gateway',
    'checkout-service',
    'order-worker',
  ];

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100">
      <TopTelemetryBar
        telemetry={telemetry}
        onRefresh={refreshTelemetry}
        onNavigateIncidents={() => setActiveTab('incidents')}
      />

      {/* Workspace Navigation Tabs */}
      <div className="border-b border-slate-800/80 bg-[#0A101E]">
        <nav
          aria-label="Primary Workspace Navigation"
          className="mx-auto flex max-w-[1440px] items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6"
        >
          {navItems.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                  active
                    ? 'border border-sky-500/40 bg-sky-500/15 text-sky-200 shadow-sm'
                    : 'border border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${
                      active ? 'bg-sky-500/25 text-sky-200' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Content Container */}
      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
        {activeTab === 'investigator' && (
          <InvestigationWorkspace
            availableServices={availableServices}
            onOpenRunbook={handleOpenRunbook}
            onInvestigationCompleted={refreshTelemetry}
            externalResult={forwardedRca}
          />
        )}

        {activeTab === 'incidents' && (
          <ActiveIncidentsBoard
            availableServices={availableServices}
            onOpenInInvestigator={handleOpenInInvestigator}
            onOpenRunbook={handleOpenRunbook}
            onDataMutated={refreshTelemetry}
          />
        )}

        {activeTab === 'knowledge' && (
          <KnowledgeVaultView onCorpusChanged={refreshTelemetry} />
        )}

        {activeTab === 'runbooks' && (
          <RunbooksAndCacheView
            telemetry={telemetry}
            onOpenRunbook={handleOpenRunbook}
            onRefreshTelemetry={refreshTelemetry}
          />
        )}

        {activeTab === 'architecture' && (
          <ArchitectureView
            telemetry={telemetry}
            onRefreshTelemetry={refreshTelemetry}
          />
        )}
      </main>

      <RunbookModal
        runbook={activeRunbook}
        onClose={() => setActiveRunbook(null)}
      />
    </div>
  );
};

export default App;
