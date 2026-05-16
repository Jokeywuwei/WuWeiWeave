import * as path from "node:path";
import { createDefaultDaemon } from "@wuweiweave/core";

const daemon = await createDefaultDaemon(Bun.env.WUWEIWEAVE_HOME);

await daemon.config.upsertMcpServer({
  id: "mock",
  name: "Mock MCP",
  command: process.execPath,
  args: [path.resolve("scripts/mock-mcp-server.ts")],
  enabled: true,
  env: {},
  timeoutMs: 10000
});

const mcpSnapshot = await daemon.config.discoverMcpServer("mock");
const mcpSessions = daemon.config.getMcpSessions();
await daemon.runtime.registerWorker("operations-smoke-worker", process.pid);
const queued = await daemon.runtime.enqueueSolverTask({
  task: "Operations queued solver",
  promptName: "solver-default",
  runtimeMode: "local"
});
const scheduled = await daemon.runtime.runScheduler();
const workerSnapshot = await daemon.runtime.superviseWorkers();
const metrics = await daemon.runtime.getProviderMetricsSnapshot();
const observability = await daemon.runtime.getObservabilitySnapshot();

const ok =
  mcpSnapshot.ok &&
  mcpSessions.some((session) => session.serverId === "mock" && session.calls >= 3 && session.status === "ready") &&
  scheduled.tasks.some((task) => task.id === queued.id && task.status === "completed") &&
  workerSnapshot.workers.some((worker) => worker.status === "idle") &&
  metrics.totalCalls >= 1 &&
  observability.metrics.totalTokens >= metrics.totalTokens;

console.log(
  JSON.stringify(
    {
      ok,
      mcp: {
        ok: mcpSnapshot.ok,
        sessions: mcpSessions
      },
      scheduler: scheduled.tasks.map((task) => ({
        id: task.id,
        status: task.status,
        retryCount: task.retryCount,
        nextRunAt: task.nextRunAt
      })),
      workers: workerSnapshot,
      metrics: {
        totalCalls: metrics.totalCalls,
        totalTokens: metrics.totalTokens,
        byProvider: Object.keys(metrics.byProvider),
        byModel: Object.keys(metrics.byModel)
      }
    },
    null,
    2
  )
);

daemon.config.closeMcpSessions();

if (!ok) {
  process.exit(1);
}
