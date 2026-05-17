import { RefreshCw } from "lucide-react";
import { MetricTile } from "../components/metric-tile";
import { useI18n } from "../i18n";
import type { ObservabilitySnapshot } from "../types";

interface ObservabilityPageProps {
  observability: ObservabilitySnapshot | undefined;
  onRefresh: () => void;
}

export function ObservabilityPage({ observability, onRefresh }: ObservabilityPageProps) {
  const { t } = useI18n();

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-950">{t("observability.title")}</h1>
          <p className="mt-1 text-sm text-stone-600">{observability?.generatedAt ?? t("observability.noSnapshot")}</p>
        </div>
        <button type="button" onClick={onRefresh} className="inline-flex h-9 items-center gap-2 rounded border border-stone-300 bg-white px-3 text-sm">
          <RefreshCw size={16} aria-hidden="true" />
          {t("common.refresh")}
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <MetricTile label={t("observability.events")} value={observability?.timeline.length ?? 0} detail={t("dashboard.timelineWindow")} />
        <MetricTile label={t("observability.tokens")} value={observability?.metrics.totalTokens ?? 0} detail={t("observability.persistedUsage")} />
        <MetricTile label={t("observability.cost")} value={`$${(observability?.metrics.estimatedCostUsd ?? 0).toFixed(4)}`} detail={t("observability.persistedEstimate")} />
        <MetricTile label={t("observability.slots")} value={observability?.scheduler.availableSlots ?? 0} detail={t("observability.schedulerCapacity")} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={t("observability.solverHealth")} data={observability?.solvers.byHealth ?? {}} />
        <Panel title={t("observability.solverStatus")} data={observability?.solvers.byStatus ?? {}} />
        <Panel title={t("observability.challengeStatus")} data={observability?.challenges.byStatus ?? {}} />
        <Panel title={t("observability.providerUsage")} data={Object.fromEntries(Object.entries(observability?.metrics.byProvider ?? {}).map(([key, usage]) => [key, usage.totalTokens]))} />
        <Panel title={t("observability.modelUsage")} data={Object.fromEntries(Object.entries(observability?.metrics.byModel ?? {}).map(([key, usage]) => [key, usage.totalTokens]))} />
        <Panel title={t("observability.solverUsage")} data={Object.fromEntries(Object.entries(observability?.metrics.bySolver ?? {}).map(([key, usage]) => [key, usage.totalTokens]))} />
      </div>
      <div className="rounded border border-stone-200 bg-white">
        <div className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">{t("observability.timeline")}</div>
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
  const { t } = useI18n();

  return (
    <div className="rounded border border-stone-200 bg-white">
      <div className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">{title}</div>
      <div className="divide-y divide-stone-100">
        {Object.entries(data).length === 0 ? (
          <div className="px-4 py-6 text-sm text-stone-500">{t("common.noData")}</div>
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
