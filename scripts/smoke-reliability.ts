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
const refreshed = await daemon.config.refreshStaleMcpCapabilities(0);
const queued = await daemon.runtime.enqueueSolverTask({
  task: "Reliability queued solver",
  promptName: "solver-default",
  runtimeMode: "local"
});
const scheduler = await daemon.runtime.runScheduler();
const supervised = await daemon.runtime.superviseSolvers(false);
const workers = await daemon.runtime.getWorkerPoolSnapshot();
const observability = await daemon.runtime.getObservabilitySnapshot();

const ok =
  refreshed.some((item) => item.serverId === "mock" && item.ok) &&
  scheduler.tasks.some((item) => item.id === queued.id && (item.status === "completed" || item.status === "failed")) &&
  workers.workers.length > 0 &&
  observability.timeline.length > 0 &&
  supervised.length > 0;

console.log(
  JSON.stringify(
    {
      ok,
      mcpRefreshed: refreshed.map((item) => ({ serverId: item.serverId, ok: item.ok, tools: item.tools.length })),
      queued,
      scheduler: {
        decisions: scheduler.decisions,
        taskStatuses: scheduler.tasks.map((item) => ({ id: item.id, status: item.status, solverId: item.solverId }))
      },
      workers,
      supervision: supervised.map((item) => ({ id: item.id, health: item.health?.class })),
      observability: {
        events: observability.timeline.length,
        solvers: observability.solvers.total,
        availableSlots: observability.scheduler.availableSlots
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
