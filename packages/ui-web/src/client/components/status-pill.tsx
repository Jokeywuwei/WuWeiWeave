import { translateStatus, useI18n } from "../i18n";

interface StatusPillProps {
  status: string;
}

const statusClasses: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  solving: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  solved: "bg-lime-50 text-lime-700 ring-lime-200",
  archived: "bg-stone-100 text-stone-600 ring-stone-200",
  queued: "bg-amber-50 text-amber-700 ring-amber-200",
  running: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  failed: "bg-rose-50 text-rose-700 ring-rose-200",
  stopped: "bg-stone-100 text-stone-600 ring-stone-200"
};

export function StatusPill({ status }: StatusPillProps) {
  const { t } = useI18n();

  return (
    <span className={`inline-flex h-6 items-center rounded px-2 text-xs font-medium ring-1 ${statusClasses[status] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}>
      {translateStatus(status, t)}
    </span>
  );
}
