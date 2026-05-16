import { createDefaultDaemon } from "@wuweiweave/core";
import { startWebServer } from "@wuweiweave/ui-web/server";

const daemon = await createDefaultDaemon(Bun.env.WUWEIWEAVE_HOME);
const solver = await daemon.startSolver({
  task: "Smoke test solver execution",
  promptName: "solver-default"
});
const messages = await daemon.runtime.getMessages(solver.id);
const server = await startWebServer({ daemon });
const response = await fetch(`http://${server.hostname}:${server.port}/api/health`);
const health = await response.json();
server.stop(true);

console.log(
  JSON.stringify(
    {
      ok: response.ok,
      solverStatus: solver.status,
      messageCount: messages.length,
      health
    },
    null,
    2
  )
);

if (!response.ok || solver.status === "failed" || messages.length === 0) {
  process.exit(1);
}
