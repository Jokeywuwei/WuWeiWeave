import { RefreshCw } from "lucide-react";
import { MetricTile } from "../components/metric-tile";
import type { ObservabilitySnapshot } from "../types";

interface ObservabilityPageProps {
  observability: ObservabilitySnapshot | undefined;
  onRefresh: () => void;
}

export function ObservabilityPage({ observability, onRefresh }: ObservabilityPageProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-950">Observability</h1>
          <p className="mt-1 text-sm text-stone-600">{observability?.generatedAt ?? "No snapshot yet"}</p>
        </div>
        <button type="button" onClick={onRefresh} className="inline-flex h-9 items-center gap-2 rounded border border-stone-300 bg-white px-3 text-sm">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <MetricTile label="Events" value={observability?.timeline.length ?? 0} detail="Timeline window" />
        <MetricTile label="Tokens" value={observability?.metrics.totalTokens ?? 0} detail="Persisted usage" />
        <MetricTile label="Cost" value={`$${(observability?.metrics.estimatedCostUsd ?? 0).toFixed(4)}`} detail="Persisted estimate" />
        <MetricTile label="Slots" value={observability?.scheduler.availableSlots ?? 0} detail="Scheduler capacity" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Solver Health" data={observability?.solvers.byHealth ?? {}} />
        <Panel title="Solver Status" data={observability?.solvers.byStatus ?? {}} />
        <Panel title="Challenge Status" data={observability?.challenges.byStatus ?? {}} />
        <Panel title="Provider Usage" data={Object.fromEntries(Object.entries(observability?.metrics.byProvider ?? {}).map(([key, usage]) => [key, usage.totalTokens]))} />
        <Panel title="Model Usage" data={Object.fromEntries(Object.entries(observability?.metrics.byModel ?? {}).map(([key, usage]) => [key, usage.totalTokens]))} />
        <Panel title="Solver Usage" data={Object.fromEntries(Object.entries(observability?.metrics.bySolver ?? {}).map(([key, usage]) => [key, usage.totalTokens]))} />
      </div>
      <div className="rounded border border-stone-200 bg-white">
        <div className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">Timeline</div>
        <div className="max-h-96 overflow-auto divide-y divide-stone-100">
          {(observability?.timeline.slice().reverse() ?? []).map((event) => (
            <div key={event.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[170px_150px_minmax(0,1fr)]">
              <div className="text-xs text-stone-500">{new Date(event.createdAt).toLocaleString()}</div>
              <div className="font-mono text-xs text-stone-600">{event.type}</div>
              <div className="truncate">{event.message}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Panel({ title, data }: { title: string; data: Record<string, number> }) {
  return (
    <div className="rounded border border-stone-200 bg-white">
      <div className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">{title}</div>
      <div className="divide-y divide-stone-100">
        {Object.entries(data).length === 0 ? (
          <div className="px-4 py-6 text-sm text-stone-500">No data</div>
        ) : (
          Object.entries(data).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>{key}</span>
              <span className="font-mono text-xs">{value}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
