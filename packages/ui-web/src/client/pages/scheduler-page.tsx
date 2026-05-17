import { Activity, Play, Plus, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { translateStatus, useI18n } from "../i18n";
import type { SchedulerTask, WorkerPoolSnapshot } from "../types";

interface SchedulerPageProps {
  onRefresh: () => Promise<void>;
}

export function SchedulerPage({ onRefresh }: SchedulerPageProps) {
  const { t } = useI18n();
  const [tasks, setTasks] = useState<SchedulerTask[]>([]);
  const [deadLetters, setDeadLetters] = useState<SchedulerTask[]>([]);
  const [workers, setWorkers] = useState<WorkerPoolSnapshot>();
  const [task, setTask] = useState(() => t("scheduler.defaultTask"));
  const [status, setStatus] = useState<string>();

  const refreshScheduler = async () => {
    const [nextTasks, nextDeadLetters, nextWorkers] = await Promise.all([
      api.schedulerTasks(),
      api.deadLetterTasks(),
      api.workers()
    ]);
    setTasks(nextTasks);
    setDeadLetters(nextDeadLetters);
    setWorkers(nextWorkers);
    await onRefresh();
  };

  useEffect(() => {
    void refreshScheduler();
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-950">{t("scheduler.title")}</h1>
          <p className="mt-1 text-sm text-stone-600">{t("scheduler.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void refreshScheduler()} className="inline-flex h-9 items-center gap-2 rounded border border-stone-300 bg-white px-3 text-sm">
            <RefreshCw size={16} aria-hidden="true" />
            {t("common.refresh")}
          </button>
          <button
            type="button"
            onClick={async () => {
              await api.superviseWorkers();
              setStatus(t("scheduler.supervisionCompleted"));
              await refreshScheduler();
            }}
            className="inline-flex h-9 items-center gap-2 rounded border border-stone-300 bg-white px-3 text-sm"
          >
            <Activity size={16} aria-hidden="true" />
            {t("scheduler.supervise")}
          </button>
          <button
            type="button"
            onClick={async () => {
              const result = await api.runScheduler();
              setStatus(`${t("scheduler.decisions")}: ${result.decisions.length}`);
              await refreshScheduler();
            }}
            className="inline-flex h-9 items-center gap-2 rounded bg-neutral-950 px-3 text-sm text-white"
          >
            <Play size={16} aria-hidden="true" />
            {t("scheduler.run")}
          </button>
        </div>
      </div>
      {status ? <div className="rounded border border-stone-200 bg-white px-4 py-3 text-sm">{status}</div> : null}
      <div className="rounded border border-stone-200 bg-white p-4">
        <div className="flex gap-2">
          <input value={task} onChange={(event) => setTask(event.target.value)} className="h-9 min-w-0 flex-1 rounded border border-stone-300 px-3 text-sm" />
          <button
            type="button"
            onClick={async () => {
              await api.enqueueSchedulerTask({ task, promptName: "solver-default", runtimeMode: "local" });
              await refreshScheduler();
            }}
            className="inline-flex h-9 items-center gap-2 rounded border border-stone-300 px-3 text-sm"
          >
            <Plus size={16} aria-hidden="true" />
            {t("scheduler.enqueue")}
          </button>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded border border-stone-200 bg-white">
          <div className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">{t("scheduler.queue")}</div>
          <div className="divide-y divide-stone-100">
            {tasks.map((item) => (
              <div key={item.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate font-medium">{item.task}</div>
                  <span className="rounded bg-stone-100 px-2 py-1 text-xs">{translateStatus(item.status, t)}</span>
                </div>
                <div className="mt-1 truncate font-mono text-xs text-stone-500">{item.id}</div>
                <div className="mt-1 truncate text-xs text-stone-500">
                  {item.recoveryReason ?? item.error ?? (item.nextRunAt ? `${t("scheduler.next")} ${new Date(item.nextRunAt).toLocaleString()}` : t("scheduler.noRecoveryNote"))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded border border-stone-200 bg-white">
          <div className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">{t("scheduler.workers")}</div>
          <div className="divide-y divide-stone-100">
            {(workers?.workers ?? []).map((worker) => (
              <div key={worker.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{worker.id}</div>
                  <span className="rounded bg-stone-100 px-2 py-1 text-xs">{translateStatus(worker.status, t)}</span>
                </div>
                <div className="mt-1 truncate text-xs text-stone-500">{worker.currentTaskId ?? t("scheduler.idle")}</div>
                <div className="mt-1 truncate text-xs text-stone-500">
                  {worker.leaseExpiresAt ? `${t("scheduler.lease")} ${new Date(worker.leaseExpiresAt).toLocaleString()}` : t("scheduler.noLease")}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="rounded border border-stone-200 bg-white">
        <div className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">{t("scheduler.deadLetter")}</div>
        <div className="divide-y divide-stone-100">
          {deadLetters.length === 0 ? (
            <div className="px-4 py-6 text-sm text-stone-500">{t("scheduler.noTerminalFailures")}</div>
          ) : (
            deadLetters.map((item) => (
              <div key={item.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate font-medium">{item.task}</div>
                  <span className="rounded bg-stone-100 px-2 py-1 text-xs">{item.failureScope ?? "solver"}</span>
                </div>
                <div className="mt-1 truncate text-xs text-stone-500">{item.error ?? item.recoveryReason ?? item.id}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
