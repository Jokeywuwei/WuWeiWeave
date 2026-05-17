import { Activity, BarChart3, BrainCircuit, CalendarClock, Database, LayoutDashboard, Settings, Target } from "lucide-react";
import { useI18n, type TranslationKey } from "../i18n";
import type { ViewKey } from "../types";

interface SidebarProps {
  active: ViewKey;
  onChange: (view: ViewKey) => void;
}

const items: Array<{ key: ViewKey; labelKey: TranslationKey; icon: typeof LayoutDashboard }> = [
  { key: "dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { key: "challenges", labelKey: "nav.challenges", icon: Target },
  { key: "runtime", labelKey: "nav.runtime", icon: Activity },
  { key: "observability", labelKey: "nav.observability", icon: BarChart3 },
  { key: "providers", labelKey: "nav.providers", icon: BrainCircuit },
  { key: "scheduler", labelKey: "nav.scheduler", icon: CalendarClock },
  { key: "config", labelKey: "nav.config", icon: Settings }
];

export function Sidebar({ active, onChange }: SidebarProps) {
  const { language, setLanguage, t } = useI18n();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-stone-200 bg-neutral-950 text-stone-100">
      <div className="border-b border-neutral-800 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-emerald-500 text-neutral-950">
            <Database size={18} aria-hidden="true" />
          </div>
          <div>
            <div className="text-sm font-semibold">WuWeiWeave</div>
            <div className="text-xs text-stone-400">{t("app.subtitle")}</div>
          </div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {items.map((item) => {
          const Icon = item.icon;
          const selected = active === item.key;
          const label = t(item.labelKey);
          return (
            <button
              key={item.key}
              title={label}
              type="button"
              onClick={() => onChange(item.key)}
              className={`flex h-10 items-center gap-3 rounded px-3 text-left text-sm transition ${
                selected ? "bg-stone-100 text-neutral-950" : "text-stone-300 hover:bg-neutral-800 hover:text-white"
              }`}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
      <div className="border-t border-neutral-800 p-3">
        <div className="grid grid-cols-2 rounded border border-neutral-700 p-1">
          {(["zh", "en"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setLanguage(item)}
              className={`h-8 rounded text-xs ${
                language === item ? "bg-stone-100 text-neutral-950" : "text-stone-300 hover:bg-neutral-800"
              }`}
            >
              {t(item === "zh" ? "language.zh" : "language.en")}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
