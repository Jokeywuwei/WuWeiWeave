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
const mcp = await daemon.config.discoverMcpServer("mock");
const solver = await daemon.startSolver({
  task: "Productization smoke solver",
  promptName: "solver-default"
});
const supervised = await daemon.runtime.superviseSolvers(false);
const observability = await daemon.runtime.getObservabilitySnapshot();

console.log(
  JSON.stringify(
    {
      ok: mcp.ok && solver.status !== "failed" && observability.solvers.total > 0,
      mcp: {
        ok: mcp.ok,
        error: mcp.error,
        tools: mcp.tools.length,
        resources: mcp.resources.length,
        prompts: mcp.prompts.length
      },
      solver: {
        id: solver.id,
        status: solver.status,
        messages: solver.messagesCount
      },
      supervision: supervised.map((item) => ({
        id: item.id,
        status: item.status,
        health: item.health?.class
      })),
      observability: {
        events: observability.timeline.length,
        tokens: observability.providers.totalTokens,
        scheduler: observability.scheduler
      }
    },
    null,
    2
  )
);

daemon.config.closeMcpSessions();

if (!mcp.ok || solver.status === "failed" || observability.solvers.total === 0) {
  process.exit(1);
}
