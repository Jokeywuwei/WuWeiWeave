import { Play, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { StatusPill } from "../components/status-pill";
import type { AgentMessage, ChallengeState, SolverSession } from "../types";

interface RuntimePageProps {
  solvers: SolverSession[];
  challenges: ChallengeState[];
  onStart: (input: { task: string; promptName: string; challengeId?: string; runtimeMode: "local" | "docker" }) => Promise<void>;
  onSupervise: (applyActions: boolean) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onResume: (id: string) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onRefresh: () => void;
}

export function RuntimePage({
  solvers,
  challenges,
  onStart,
  onSupervise,
  onStop,
  onResume,
  onArchive,
  onRefresh
}: RuntimePageProps) {
  const [task, setTask] = useState("Recon seed challenge and propose first attack path");
  const [promptName, setPromptName] = useState("solver-default");
  const [challengeId, setChallengeId] = useState("");
  const [runtimeMode, setRuntimeMode] = useState<"local" | "docker">("local");
  const [liveCount, setLiveCount] = useState(solvers.length);
  const [selectedSolverId, setSelectedSolverId] = useState<string>();
  const [messages, setMessages] = useState<AgentMessage[]>([]);

  useEffect(() => {
    const stream = new EventSource("/api/runtime/events/stream");
    stream.addEventListener("state", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { solvers: SolverSession[] };
      setLiveCount(data.solvers.length);
    });
    return () => stream.close();
  }, []);

  useEffect(() => {
    const nextSolverId = selectedSolverId ?? solvers[0]?.id;
    setSelectedSolverId(nextSolverId);
    if (!nextSolverId) {
      setMessages([]);
      return;
    }

    void api.solverMessages(nextSolverId).then(setMessages).catch(() => setMessages([]));
  }, [selectedSolverId, solvers]);

  return (
    <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
      <aside className="rounded border border-stone-200 bg-white p-4">
        <h1 className="text-base font-semibold">Start Solver</h1>
        <div className="mt-4 space-y-3">
          <textarea
            value={task}
            onChange={(event) => setTask(event.target.value)}
            className="min-h-28 w-full rounded border border-stone-300 px-3 py-2 text-sm"
          />
          <input
            value={promptName}
            onChange={(event) => setPromptName(event.target.value)}
            className="h-9 w-full rounded border border-stone-300 px-3 text-sm"
          />
          <select
            value={challengeId}
            onChange={(event) => setChallengeId(event.target.value)}
            className="h-9 w-full rounded border border-stone-300 px-3 text-sm"
          >
            <option value="">No challenge</option>
            {challenges.map((challenge) => (
              <option key={challenge.id} value={challenge.id}>
                {challenge.title}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 rounded border border-stone-300 p-1">
            {(["local", "docker"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                title={`${mode} runtime`}
                onClick={() => setRuntimeMode(mode)}
                className={`h-8 rounded text-sm ${runtimeMode === mode ? "bg-neutral-950 text-white" : "text-stone-700 hover:bg-stone-50"}`}
              >
                {mode}
              </button>
            ))}
          </div>
          <button
            type="button"
            title="Start solver"
            onClick={() =>
              onStart({
                task,
                promptName,
                runtimeMode,
                ...(challengeId ? { challengeId } : {})
              })
            }
            className="inline-flex h-9 items-center gap-2 rounded bg-neutral-950 px-3 text-sm font-medium text-white"
          >
            <Play size={16} aria-hidden="true" />
            Start
          </button>
        </div>
      </aside>

      <div className="space-y-4">
      <div className="rounded border border-stone-200 bg-white">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">Solver Runtime</h2>
            <p className="mt-1 text-xs text-stone-500">SSE live count: {liveCount}</p>
          </div>
          <button
            title="Refresh"
            type="button"
            onClick={onRefresh}
            className="inline-flex h-8 items-center gap-2 rounded border border-stone-300 px-2 text-sm hover:bg-stone-50"
          >
            <RefreshCw size={15} aria-hidden="true" />
            Refresh
          </button>
          <button
            title="Supervise"
            type="button"
            onClick={() => void onSupervise(false)}
            className="inline-flex h-8 items-center gap-2 rounded border border-stone-300 px-2 text-sm hover:bg-stone-50"
          >
            Observe
          </button>
          <button
            title="Apply supervision actions"
            type="button"
            onClick={() => void onSupervise(true)}
            className="inline-flex h-8 items-center gap-2 rounded bg-neutral-950 px-2 text-sm text-white"
          >
            Apply
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-normal text-stone-500">
              <tr>
                <th className="w-[24%] px-4 py-3">ID</th>
                <th className="w-[34%] px-4 py-3">Task</th>
                <th className="w-[12%] px-4 py-3">Status</th>
                <th className="w-[12%] px-4 py-3">Mode</th>
                <th className="w-[18%] px-4 py-3">Observer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {solvers.map((solver) => (
                <tr
                  key={solver.id}
                  onClick={() => setSelectedSolverId(solver.id)}
                  className={`cursor-pointer hover:bg-stone-50 ${selectedSolverId === solver.id ? "bg-emerald-50/60" : ""}`}
                >
                  <td className="truncate px-4 py-3 font-mono text-xs text-stone-600">{solver.id}</td>
                  <td className="truncate px-4 py-3 font-medium">{solver.task}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={solver.status} />
                  </td>
                  <td className="px-4 py-3 text-stone-600">{solver.runtimeMode}</td>
                  <td className="truncate px-4 py-3 text-xs text-stone-500">{solver.observer.lastSignal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="rounded border border-stone-200 bg-white">
        <div className="border-b border-stone-200 px-4 py-3">
          <h2 className="text-base font-semibold">Solver Detail</h2>
          <p className="mt-1 truncate font-mono text-xs text-stone-500">{selectedSolverId ?? "No solver selected"}</p>
          {selectedSolverId ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void onStop(selectedSolverId)}
                className="h-8 rounded border border-stone-300 px-2 text-xs hover:bg-stone-50"
              >
                Stop
              </button>
              <button
                type="button"
                onClick={() => void onResume(selectedSolverId)}
                className="h-8 rounded border border-stone-300 px-2 text-xs hover:bg-stone-50"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={() => void onArchive(selectedSolverId)}
                className="h-8 rounded border border-stone-300 px-2 text-xs hover:bg-stone-50"
              >
                Archive
              </button>
            </div>
          ) : null}
        </div>
        <div className="max-h-96 overflow-auto divide-y divide-stone-100">
          {messages.length === 0 ? (
            <div className="px-4 py-8 text-sm text-stone-500">No messages yet.</div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded bg-stone-100 px-2 py-1 text-xs font-medium text-stone-700">{message.role}</span>
                  <span className="text-xs text-stone-500">{new Date(message.createdAt).toLocaleString()}</span>
                </div>
                <pre className="mt-3 whitespace-pre-wrap break-words rounded bg-neutral-950 p-3 text-xs leading-5 text-stone-100">
                  {message.content}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>
      </div>
    </section>
  );
}
