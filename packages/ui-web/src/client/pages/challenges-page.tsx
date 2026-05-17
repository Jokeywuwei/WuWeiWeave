import { Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { StatusPill } from "../components/status-pill";
import { useI18n } from "../i18n";
import type { ChallengeState } from "../types";

interface ChallengesPageProps {
  challenges: ChallengeState[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onCreate: (input: { title: string; description: string; category: string }) => Promise<void>;
  onRefreshPlanner: (id: string) => Promise<void>;
  onRefresh: () => void;
}

export function ChallengesPage({
  challenges,
  selectedId,
  onSelect,
  onCreate,
  onRefreshPlanner,
  onRefresh
}: ChallengesPageProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("web");
  const selected = challenges.find((challenge) => challenge.id === selectedId) ?? challenges[0];

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="rounded border border-stone-200 bg-white">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <h1 className="text-base font-semibold">{t("challenges.title")}</h1>
          <button
            type="button"
            title={t("common.refresh")}
            onClick={onRefresh}
            className="inline-flex h-8 items-center gap-2 rounded border border-stone-300 px-2 text-sm hover:bg-stone-50"
          >
            <RefreshCw size={15} aria-hidden="true" />
            {t("common.refresh")}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-normal text-stone-500">
              <tr>
                <th className="w-[34%] px-4 py-3">{t("challenges.tableTitle")}</th>
                <th className="w-[16%] px-4 py-3">{t("challenges.category")}</th>
                <th className="w-[16%] px-4 py-3">{t("challenges.status")}</th>
                <th className="w-[18%] px-4 py-3">{t("challenges.solvers")}</th>
                <th className="w-[16%] px-4 py-3">{t("challenges.updated")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {challenges.map((challenge) => (
                <tr
                  key={challenge.id}
                  onClick={() => onSelect(challenge.id)}
                  className={`cursor-pointer hover:bg-stone-50 ${selected?.id === challenge.id ? "bg-emerald-50/60" : ""}`}
                >
                  <td className="truncate px-4 py-3 font-medium text-neutral-950">{challenge.title}</td>
                  <td className="truncate px-4 py-3 text-stone-600">{challenge.category}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={challenge.status} />
                  </td>
                  <td className="px-4 py-3 text-stone-600">{challenge.solverAssignments.length}</td>
                  <td className="truncate px-4 py-3 text-xs text-stone-500">{new Date(challenge.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-semibold">{t("challenges.new")}</h2>
          <div className="mt-3 space-y-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("challenges.titlePlaceholder")}
              className="h-9 w-full rounded border border-stone-300 px-3 text-sm"
            />
            <input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder={t("challenges.categoryPlaceholder")}
              className="h-9 w-full rounded border border-stone-300 px-3 text-sm"
            />
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("challenges.descriptionPlaceholder")}
              className="min-h-24 w-full rounded border border-stone-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              title={t("challenges.createTitle")}
              onClick={async () => {
                await onCreate({ title, description, category });
                setTitle("");
                setDescription("");
              }}
              disabled={title.trim().length === 0}
              className="inline-flex h-9 items-center gap-2 rounded bg-neutral-950 px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              <Plus size={16} aria-hidden="true" />
              {t("challenges.create")}
            </button>
          </div>
        </div>

        {selected ? (
          <div className="rounded border border-stone-200 bg-white">
            <div className="border-b border-stone-200 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{selected.title}</h2>
                  <p className="mt-1 text-xs text-stone-500">{selected.id}</p>
                </div>
                <StatusPill status={selected.status} />
              </div>
            </div>
            <div className="space-y-4 p-4">
              <p className="text-sm leading-6 text-stone-700">{selected.description}</p>
              <div>
                <div className="text-xs font-semibold uppercase tracking-normal text-stone-500">{t("challenges.planner")}</div>
                <ul className="mt-2 space-y-2">
                  {selected.planner.nextActions.map((action) => (
                    <li key={action} className="rounded border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                title={t("challenges.refreshPlanner")}
                onClick={() => onRefreshPlanner(selected.id)}
                className="inline-flex h-9 items-center gap-2 rounded border border-stone-300 px-3 text-sm hover:bg-stone-50"
              >
                <RefreshCw size={16} aria-hidden="true" />
                {t("challenges.planner")}
              </button>
              <div>
                <div className="text-xs font-semibold uppercase tracking-normal text-stone-500">{t("challenges.timeline")}</div>
                <div className="mt-2 max-h-80 overflow-auto divide-y divide-stone-100 rounded border border-stone-200">
                  {selected.timeline.slice().reverse().map((event) => (
                    <div key={event.id} className="p-3">
                      <div className="text-sm font-medium">{event.title}</div>
                      <div className="mt-1 text-xs text-stone-500">{new Date(event.createdAt).toLocaleString()}</div>
                      <div className="mt-2 text-sm text-stone-700">{event.body}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </aside>
    </section>
  );
}
