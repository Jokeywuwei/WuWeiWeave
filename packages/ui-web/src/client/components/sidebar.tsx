import { Activity, BarChart3, BrainCircuit, CalendarClock, Database, LayoutDashboard, Settings, Target } from "lucide-react";
import type { ViewKey } from "../types";

interface SidebarProps {
  active: ViewKey;
  onChange: (view: ViewKey) => void;
}

const items: Array<{ key: ViewKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "challenges", label: "Challenges", icon: Target },
  { key: "runtime", label: "Runtime", icon: Activity },
  { key: "observability", label: "Observability", icon: BarChart3 },
  { key: "providers", label: "Providers", icon: BrainCircuit },
  { key: "scheduler", label: "Scheduler", icon: CalendarClock },
  { key: "config", label: "Config", icon: Settings }
];

export function Sidebar({ active, onChange }: SidebarProps) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-stone-200 bg-neutral-950 text-stone-100">
      <div className="border-b border-neutral-800 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-emerald-500 text-neutral-950">
            <Database size={18} aria-hidden="true" />
          </div>
          <div>
            <div className="text-sm font-semibold">WuWeiWeave</div>
            <div className="text-xs text-stone-400">Agent control plane</div>
          </div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {items.map((item) => {
          const Icon = item.icon;
          const selected = active === item.key;
          return (
            <button
              key={item.key}
              title={item.label}
              type="button"
              onClick={() => onChange(item.key)}
              className={`flex h-10 items-center gap-3 rounded px-3 text-left text-sm transition ${
                selected ? "bg-stone-100 text-neutral-950" : "text-stone-300 hover:bg-neutral-800 hover:text-white"
              }`}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
