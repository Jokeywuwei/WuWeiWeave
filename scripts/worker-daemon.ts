import { createDefaultDaemon } from "@wuweiweave/core";

const args = new Set(Bun.argv.slice(2));
const once = args.has("--once");
const intervalArg = Bun.argv.find((arg) => arg.startsWith("--interval-ms="));
const intervalMs = intervalArg ? Number.parseInt(intervalArg.split("=")[1] ?? "", 10) : 5000;
const workerId =
  Bun.env.WUWEIWEAVE_WORKER_ID ??
  Bun.argv.find((arg) => arg.startsWith("--worker-id="))?.split("=")[1] ??
  `worker-${process.pid}`;

const daemon = await createDefaultDaemon(Bun.env.WUWEIWEAVE_HOME);

async function tick(): Promise<void> {
  await daemon.runtime.registerWorker(workerId, process.pid);
  await daemon.runtime.heartbeatWorker(workerId);
  await daemon.runtime.superviseWorkers();
  await daemon.runtime.runScheduler();
}

async function shutdown(): Promise<void> {
  await daemon.runtime.stopWorker(workerId).catch(() => undefined);
  daemon.config.closeMcpSessions();
}

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

await tick();

if (once) {
  await shutdown();
  process.exit(0);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      workerId,
      intervalMs,
      workspace: daemon.store.root
    },
    null,
    2
  )
);

setInterval(() => {
  void tick().catch((error) => {
    console.error(error instanceof Error ? error.message : "Worker tick failed");
  });
}, Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 5000);
