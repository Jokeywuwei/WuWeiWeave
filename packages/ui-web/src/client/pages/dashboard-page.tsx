import { RefreshCw } from "lucide-react";
import { MetricTile } from "../components/metric-tile";
import type { ChallengeState, DashboardState, ObservabilitySnapshot, SolverSession } from "../types";

interface DashboardPageProps {
  dashboard: DashboardState | undefined;
  observability: ObservabilitySnapshot | undefined;
  challenges: ChallengeState[];
  solvers: SolverSession[];
  onRefresh: () => void;
}

export function DashboardPage({ dashboard, observability, challenges, solvers, onRefresh }: DashboardPageProps) {
  const latestSolvers = solvers.slice(0, 5);
  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-950">Operations Dashboard</h1>
          <p className="mt-1 text-sm text-stone-600">{dashboard?.workspaceRoot ?? "Workspace initializing"}</p>
        </div>
        <button
          title="Refresh"
          type="button"
          onClick={onRefresh}
          className="inline-flex h-9 items-center gap-2 rounded border border-stone-300 bg-white px-3 text-sm hover:bg-stone-50"
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <MetricTile label="Challenges" value={dashboard?.challengeCount ?? challenges.length} detail="Tracked tasks" />
        <MetricTile label="Active" value={dashboard?.activeChallengeCount ?? 0} detail="Open challenge states" />
        <MetricTile label="Solvers" value={dashboard?.solverCount ?? solvers.length} detail="Runtime sessions" />
        <MetricTile label="Running" value={dashboard?.runningSolverCount ?? 0} detail="Live solver loops" />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <MetricTile label="Tokens" value={observability?.providers.totalTokens ?? 0} detail="Provider usage" />
        <MetricTile
          label="Cost"
          value={`$${(observability?.providers.estimatedCostUsd ?? 0).toFixed(4)}`}
          detail="Estimated spend"
        />
        <MetricTile
          label="Slots"
          value={observability?.scheduler.availableSlots ?? 0}
          detail={`${observability?.scheduler.runningSolvers ?? 0} running`}
        />
        <MetricTile
          label="Events"
          value={observability?.timeline.length ?? 0}
          detail="Timeline window"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded border border-stone-200 bg-white">
          <div className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">Recent Challenges</div>
          <div className="divide-y divide-stone-100">
            {challenges.slice(0, 6).map((challenge) => (
              <div key={challenge.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-neutral-950">{challenge.title}</div>
                    <div className="truncate text-xs text-stone-500">{challenge.category}</div>
                  </div>
                  <span className="text-xs text-stone-500">{challenge.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded border border-stone-200 bg-white">
          <div className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">Recent Solvers</div>
          <div className="divide-y divide-stone-100">
            {latestSolvers.length === 0 ? (
              <div className="px-4 py-8 text-sm text-stone-500">No solver sessions yet.</div>
            ) : (
              latestSolvers.map((solver) => (
                <div key={solver.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-neutral-950">{solver.task}</div>
                      <div className="truncate text-xs text-stone-500">{solver.id}</div>
                    </div>
                    <span className="text-xs text-stone-500">{solver.status}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <div className="rounded border border-stone-200 bg-white">
        <div className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">Event Timeline</div>
        <div className="max-h-72 overflow-auto divide-y divide-stone-100">
          {(observability?.timeline.slice().reverse() ?? []).slice(0, 30).map((event) => (
            <div key={event.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[160px_140px_minmax(0,1fr)]">
              <div className="text-xs text-stone-500">{new Date(event.createdAt).toLocaleString()}</div>
              <div className="truncate font-mono text-xs text-stone-600">{event.type}</div>
              <div className="truncate text-stone-800">{event.message}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
