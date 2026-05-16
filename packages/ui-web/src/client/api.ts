import type {
  AgentMessage,
  ChallengeState,
  DashboardState,
  McpServerConfig,
  ModelConfig,
  ObservabilitySnapshot,
  ProviderMetricsSummary,
  PromptConfig,
  ProviderConfig,
  ProviderRoutingPolicy,
  SchedulerTask,
  SolverSession,
  SystemConfig,
  WorkerPoolSnapshot
} from "./types";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

export const api = {
  dashboard: () => getJson<DashboardState>("/api/dashboard"),
  observability: () => getJson<ObservabilitySnapshot>("/api/observability"),
  providerMetrics: (windowMs?: number) =>
    getJson<ProviderMetricsSummary>(windowMs ? `/api/observability/metrics?windowMs=${windowMs}` : "/api/observability/metrics"),
  config: () => getJson<SystemConfig>("/api/config"),
  upsertProvider: (body: ProviderConfig) => postJson<SystemConfig>("/api/config/providers", body),
  upsertModel: (body: ModelConfig) => postJson<SystemConfig>("/api/config/models", body),
  upsertPrompt: (body: PromptConfig) => postJson<SystemConfig>("/api/config/prompts", body),
  upsertMcpServer: (body: McpServerConfig) => postJson<SystemConfig>("/api/config/mcp", body),
  discoverMcp: (serverId?: string) =>
    postJson<unknown>(serverId ? `/api/config/mcp-discover/${serverId}` : "/api/config/mcp-discover", {}),
  refreshStaleMcp: () => postJson<unknown>("/api/config/mcp-refresh-stale", {}),
  testProvider: (body: { providerId: string; modelId?: string; message?: string }) =>
    postJson<{ ok: boolean; content?: string; usage?: unknown; error?: string }>("/api/config/provider-test", body),
  updateProviderRouting: (body: ProviderRoutingPolicy) => postJson<SystemConfig>("/api/config/provider-routing", body),
  challenges: () => getJson<ChallengeState[]>("/api/challenges"),
  challenge: (id: string) => getJson<ChallengeState>(`/api/challenges/${id}`),
  createChallenge: (body: { title: string; description: string; category?: string; tags?: string[] }) =>
    postJson<ChallengeState>("/api/challenges", body),
  refreshPlanner: (id: string) => postJson<ChallengeState>(`/api/challenges/${id}/planner`, {}),
  solvers: () => getJson<SolverSession[]>("/api/runtime/solvers"),
  solver: (id: string) => getJson<SolverSession>(`/api/runtime/solvers/${id}`),
  solverMessages: (id: string) => getJson<AgentMessage[]>(`/api/runtime/solvers/${id}/messages`),
  stopSolver: (id: string) => postJson<SolverSession>(`/api/runtime/solvers/${id}/stop`, {}),
  resumeSolver: (id: string) => postJson<SolverSession>(`/api/runtime/solvers/${id}/resume`, {}),
  archiveSolver: (id: string) => postJson<{ ok: boolean; solverId: string }>(`/api/runtime/solvers/${id}/archive`, {}),
  supervise: (applyActions = false) => postJson<SolverSession[]>("/api/runtime/supervise", { applyActions }),
  schedulerTasks: () => getJson<SchedulerTask[]>("/api/runtime/scheduler"),
  enqueueSchedulerTask: (body: { task: string; promptName?: string; challengeId?: string; runtimeMode?: "local" | "docker" }) =>
    postJson<SchedulerTask>("/api/runtime/scheduler/enqueue", body),
  runScheduler: () => postJson<{ decisions: unknown[]; tasks: SchedulerTask[]; workers: unknown[] }>("/api/runtime/scheduler/run", {}),
  workers: () => getJson<WorkerPoolSnapshot>("/api/runtime/workers"),
  superviseWorkers: () => postJson<WorkerPoolSnapshot>("/api/runtime/workers/supervise", {}),
  registerWorker: (workerId: string) => postJson<unknown>("/api/runtime/workers/register", { workerId }),
  heartbeatWorker: (workerId: string) => postJson<unknown>(`/api/runtime/workers/${workerId}/heartbeat`, {}),
  stopWorker: (workerId: string) => postJson<unknown>(`/api/runtime/workers/${workerId}/stop`, {}),
  deadLetterTasks: () => getJson<SchedulerTask[]>("/api/runtime/dead-letter"),
  startSolver: (body: { task: string; promptName?: string; challengeId?: string; runtimeMode?: "local" | "docker" }) =>
    postJson<SolverSession>("/api/runtime/solvers", body)
};
