import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { classifySolverHealth, createDefaultDaemon } from "../src/index";

let cleanupPath: string | undefined;

describe("Phase 3 productization", () => {
  afterEach(async () => {
    if (cleanupPath) {
      await rm(cleanupPath, { recursive: true, force: true });
      cleanupPath = undefined;
    }
  });

  it("discovers and caches MCP tools, resources, and prompts", async () => {
    cleanupPath = await mkdtemp(path.join(os.tmpdir(), "wuweiweave-product-"));
    const daemon = await createDefaultDaemon(cleanupPath);
    await daemon.config.upsertMcpServer({
      id: "mock",
      name: "Mock MCP",
      command: process.execPath,
      args: [path.resolve("scripts/mock-mcp-server.ts")],
      enabled: true,
      env: {},
      timeoutMs: 10000
    });

    const snapshot = await daemon.config.discoverMcpServer("mock");
    const config = await daemon.config.getConfig();

    expect(snapshot.ok).toBe(true);
    expect(snapshot.tools[0]?.name).toBe("echo");
    expect(snapshot.resources.length).toBe(1);
    expect(snapshot.prompts.length).toBe(1);
    expect(config.mcpCapabilities.mock?.tools.length).toBe(1);
    expect(daemon.config.getMcpSessions()[0]?.calls).toBe(3);
    daemon.config.closeMcpSessions();
  });

  it("classifies idle solvers and exposes observability aggregates", async () => {
    cleanupPath = await mkdtemp(path.join(os.tmpdir(), "wuweiweave-product-"));
    const daemon = await createDefaultDaemon(cleanupPath);
    const solver = await daemon.startSolver({ task: "observe aggregate" });
    const config = await daemon.config.getConfig();
    const health = classifySolverHealth(
      {
        ...solver,
        status: "running",
        updatedAt: new Date(Date.now() - config.host.scheduler.idleTimeoutMs - 10).toISOString()
      },
      config.host.scheduler
    );

    expect(health.class).toBe("idle");
    const snapshot = await daemon.runtime.getObservabilitySnapshot();
    expect(snapshot.solvers.total).toBeGreaterThanOrEqual(1);
    expect(snapshot.providers.totalCalls).toBeGreaterThanOrEqual(1);
    expect(snapshot.metrics.totalCalls).toBeGreaterThanOrEqual(1);
  });

  it("queues solver work and dispatches it through worker scheduler", async () => {
    cleanupPath = await mkdtemp(path.join(os.tmpdir(), "wuweiweave-product-"));
    const daemon = await createDefaultDaemon(cleanupPath);
    const task = await daemon.runtime.enqueueSolverTask({
      task: "queued test task",
      promptName: "solver-default",
      runtimeMode: "local"
    });
    const result = await daemon.runtime.runScheduler();
    const updated = result.tasks.find((candidate) => candidate.id === task.id);
    const workers = await daemon.runtime.getWorkerPoolSnapshot();

    expect(updated?.status).toBe("completed");
    expect(updated?.solverId).toBeString();
    expect(workers.workers.length).toBeGreaterThan(0);
  });

  it("recovers stale worker tasks back into the scheduler queue", async () => {
    cleanupPath = await mkdtemp(path.join(os.tmpdir(), "wuweiweave-product-"));
    const daemon = await createDefaultDaemon(cleanupPath);
    const task = await daemon.runtime.enqueueSolverTask({
      task: "stale worker task",
      promptName: "solver-default",
      runtimeMode: "local"
    });
    const workers = await daemon.runtime.listWorkers();
    const staleAt = new Date(Date.now() - 120000).toISOString();
    await daemon.store.writeJson("runtime/scheduler-queue.json", [
      {
        ...task,
        status: "running",
        startedAt: staleAt,
        updatedAt: staleAt
      }
    ]);
    await daemon.store.writeJson("runtime/workers.json", [
      {
        ...workers[0],
        status: "running",
        currentTaskId: task.id,
        currentTaskStartedAt: staleAt,
        heartbeatAt: staleAt,
        updatedAt: staleAt
      }
    ]);

    await daemon.runtime.superviseWorkers();
    const recovered = (await daemon.runtime.listSchedulerTasks())[0];
    const worker = (await daemon.runtime.listWorkers())[0];

    expect(recovered?.status).toBe("retryable");
    expect(recovered?.failureScope).toBe("worker");
    expect(worker?.status).toBe("idle");
    expect(worker?.recoveredTasks).toBe(1);
  });
});
