import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "./components/sidebar";
import { api } from "./api";
import { ChallengesPage } from "./pages/challenges-page";
import { ConfigPage } from "./pages/config-page";
import { DashboardPage } from "./pages/dashboard-page";
import { ObservabilityPage } from "./pages/observability-page";
import { ProvidersPage } from "./pages/providers-page";
import { RuntimePage } from "./pages/runtime-page";
import { SchedulerPage } from "./pages/scheduler-page";
import type { ChallengeState, DashboardState, ObservabilitySnapshot, SolverSession, SystemConfig, ViewKey } from "./types";

export function App() {
  const [view, setView] = useState<ViewKey>("dashboard");
  const [dashboard, setDashboard] = useState<DashboardState>();
  const [observability, setObservability] = useState<ObservabilitySnapshot>();
  const [config, setConfig] = useState<SystemConfig>();
  const [challenges, setChallenges] = useState<ChallengeState[]>([]);
  const [solvers, setSolvers] = useState<SolverSession[]>([]);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      const [nextDashboard, nextObservability, nextConfig, nextChallenges, nextSolvers] = await Promise.all([
        api.dashboard(),
        api.observability(),
        api.config(),
        api.challenges(),
        api.solvers()
      ]);
      setDashboard(nextDashboard);
      setObservability(nextObservability);
      setConfig(nextConfig);
      setChallenges(nextChallenges);
      setSolvers(nextSolvers);
      setSelectedChallengeId((current) => current ?? nextChallenges[0]?.id);
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Refresh failed");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <div className="flex min-h-screen bg-stone-100">
      <Sidebar active={view} onChange={setView} />
      <main className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[1500px] p-5">
          {error ? (
            <div className="mb-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : null}
          {view === "dashboard" ? (
            <DashboardPage
              dashboard={dashboard}
              observability={observability}
              challenges={challenges}
              solvers={solvers}
              onRefresh={refresh}
            />
          ) : null}
          {view === "challenges" ? (
            <ChallengesPage
              challenges={challenges}
              selectedId={selectedChallengeId}
              onSelect={setSelectedChallengeId}
              onRefresh={refresh}
              onCreate={async (input) => {
                const created = await api.createChallenge(input);
                setSelectedChallengeId(created.id);
                await refresh();
              }}
              onRefreshPlanner={async (id) => {
                await api.refreshPlanner(id);
                await refresh();
              }}
            />
          ) : null}
          {view === "runtime" ? (
            <RuntimePage
              solvers={solvers}
              challenges={challenges}
              onRefresh={refresh}
              onSupervise={async (applyActions) => {
                await api.supervise(applyActions);
                await refresh();
              }}
              onStop={async (id) => {
                await api.stopSolver(id);
                await refresh();
              }}
              onResume={async (id) => {
                await api.resumeSolver(id);
                await refresh();
              }}
              onArchive={async (id) => {
                await api.archiveSolver(id);
                await refresh();
              }}
              onStart={async (input) => {
                await api.startSolver(input);
                await refresh();
              }}
            />
          ) : null}
          {view === "observability" ? (
            <ObservabilityPage observability={observability} onRefresh={refresh} />
          ) : null}
          {view === "providers" ? (
            <ProvidersPage config={config} onRefresh={refresh} />
          ) : null}
          {view === "scheduler" ? (
            <SchedulerPage onRefresh={refresh} />
          ) : null}
          {view === "config" ? <ConfigPage config={config} onRefresh={refresh} /> : null}
        </div>
      </main>
    </div>
  );
}
