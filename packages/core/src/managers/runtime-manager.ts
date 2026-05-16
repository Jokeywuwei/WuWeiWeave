import * as path from "node:path";
import { mkdir } from "node:fs/promises";
import { assembleAgentSession } from "../agent/session-assembly";
import { createDockerRunPlan, runDockerContainer, stopDockerContainer } from "../docker/docker-runtime";
import { RuntimeEventBus } from "../events/event-bus";
import { McpSessionPool } from "../mcp/mcp-session-pool";
import { createObservabilitySnapshot } from "../observability/observability";
import {
  appendProviderUsageMetric,
  readProviderUsageMetrics,
  summarizeProviderMetrics
} from "../observability/usage-metrics";
import { resolveProviderRoute } from "../model/provider-routing";
import {
  acquireWorkerLease,
  assignWorker,
  classifyWorker,
  createWorker,
  hasValidWorkerLease,
  heartbeatWorker,
  markWorkerRecovered,
  releaseWorker
} from "../runtime/worker-daemon";
import { recoverSchedulerTask } from "../runtime/recovery-policy";
import { classifySolverHealth } from "../runtime/supervision";
import { createSchedulerTask, decideSchedulerActions } from "../runtime/scheduler-queue";
import { SolverRunner } from "../runtime/solver-runner";
import { createId } from "../utils/id";
import type { ChallengeManager } from "./challenge-manager";
import type { ConfigManager } from "./config-manager";
import type { FileStore } from "../storage/file-store";
import type {
  AgentMessage,
  ObserverState,
  RuntimeEvent,
  SolverSession,
  SolverStartupSnapshot,
  StartSolverInput,
  SubagentInput,
  SchedulerTask
} from "../types/runtime";
import type { SolverWorker, WorkerPoolSnapshot } from "../runtime/worker-daemon";

export class RuntimeManager {
  readonly events = new RuntimeEventBus();
  private readonly mcpPool = new McpSessionPool();

  constructor(
    private readonly store: FileStore,
    private readonly configManager: ConfigManager,
    private readonly challengeManager?: ChallengeManager
  ) {}

  async init(): Promise<void> {
    await this.store.ensureWorkspace();
    const workers = await this.listWorkers();
    if (workers.length === 0) {
      const config = await this.configManager.getConfig();
      await this.saveWorkers([acquireWorkerLease(createWorker("worker-1"), "runtime-manager", config.host.recovery.workerHeartbeatTimeoutMs)]);
    }
  }

  async listSolvers(): Promise<SolverSession[]> {
    return this.store.listJson<SolverSession>("solvers");
  }

  async listRuntimeEvents(limit = 100): Promise<RuntimeEvent[]> {
    const content = await this.store.readText("runtime/events.jsonl");
    return content
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .slice(-limit)
      .map((line) => JSON.parse(line) as RuntimeEvent);
  }

  async observeRunningSolvers(maxIdleMs = 5 * 60 * 1000): Promise<SolverSession[]> {
    const solvers = await this.listSolvers();
    const now = Date.now();
    const updated: SolverSession[] = [];

    for (const solver of solvers.filter((candidate) => candidate.status === "running")) {
      const updatedAt = Date.parse(solver.updatedAt);
      if (Number.isNaN(updatedAt) || now - updatedAt < maxIdleMs) {
        continue;
      }

      updated.push(
        await this.updateObserverState(solver.id, {
          lastSignal: "idle-timeout-warning",
          driftScore: Math.max(solver.observer.driftScore, 0.7),
          contextPressure: solver.observer.contextPressure,
          recommendations: [
            "Check runtime process health",
            "Inspect latest tool output",
            "Stop or split the solver if no new evidence appears"
          ]
        })
      );
    }

    return updated;
  }

  async superviseSolvers(applyActions = false): Promise<SolverSession[]> {
    const config = await this.configManager.getConfig();
    const solvers = await this.listSolvers();
    const updated: SolverSession[] = [];

    for (const solver of solvers) {
      const health = classifySolverHealth(solver, config.host.scheduler);
      const next = await this.saveSolver({ ...solver, health });
      await this.publishEvent({
        type: "supervision",
        solverId: solver.id,
        message: `${health.class}: ${health.reason}`,
        payload: { health }
      });
      await this.store.appendText(
        "runtime/supervision.jsonl",
        `${JSON.stringify({ solverId: solver.id, health, createdAt: new Date().toISOString() })}\n`
      );
      updated.push(next);

      if (applyActions) {
        await this.applySupervisionAction(next);
      }
    }

    return updated;
  }

  async getObservabilitySnapshot() {
    const [config, challenges, solvers, events, metrics] = await Promise.all([
      this.configManager.getConfig(),
      this.challengeManager?.listChallenges() ?? Promise.resolve([]),
      this.listSolvers(),
      this.listRuntimeEvents(500),
      readProviderUsageMetrics(this.store)
    ]);

    return createObservabilitySnapshot({
      config,
      challenges,
      solvers,
      events,
      usages: metrics.length > 0 ? metrics : events.flatMap(extractProviderUsage),
      metrics
    });
  }

  async getProviderMetricsSnapshot(windowMs?: number) {
    return summarizeProviderMetrics(await readProviderUsageMetrics(this.store), windowMs);
  }

  async listSchedulerTasks(): Promise<SchedulerTask[]> {
    return this.store.readJson<SchedulerTask[]>("runtime/scheduler-queue.json", []);
  }

  async enqueueSolverTask(input: StartSolverInput): Promise<SchedulerTask> {
    const config = await this.configManager.getConfig();
    const task = createSchedulerTask(input, config.host.scheduler);
    const tasks = await this.listSchedulerTasks();
    await this.saveSchedulerTasks([...tasks, task]);
    await this.publishEvent({
      type: "supervision",
      message: `Queued scheduler task ${task.id}`,
      payload: { task }
    });
    return task;
  }

  async runScheduler(): Promise<{ decisions: ReturnType<typeof decideSchedulerActions>; tasks: SchedulerTask[]; workers: SolverWorker[] }> {
    await this.superviseWorkers();
    const [config, tasks, solvers] = await Promise.all([
      this.configManager.getConfig(),
      this.listSchedulerTasks(),
      this.listSolvers()
    ]);
    const decisions = decideSchedulerActions({ tasks, solvers, policy: config.host.scheduler });
    let nextTasks = [...tasks];
    let workers = await this.listWorkers();

    for (const decision of decisions.filter((item) => item.action === "start" || item.action === "retry")) {
      const task = nextTasks.find((candidate) => candidate.id === decision.taskId);
      const worker =
        workers.find((candidate) => candidate.status === "idle" && candidate.processId !== undefined && hasValidWorkerLease(candidate)) ??
        workers.find((candidate) => candidate.status === "idle" && hasValidWorkerLease(candidate));
      if (!task || !worker) {
        continue;
      }

      const started = {
        ...task,
        status: "running" as const,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      nextTasks = nextTasks.map((candidate) => (candidate.id === task.id ? started : candidate));
      workers = workers.map((candidate) =>
        candidate.id === worker.id
          ? {
              ...heartbeatWorker(worker, config.host.recovery.workerHeartbeatTimeoutMs),
              status: "running",
              currentTaskId: task.id,
              currentTaskStartedAt: started.startedAt
            }
          : candidate
      );
      await this.saveSchedulerTasks(nextTasks);
      await this.saveWorkers(workers);
      const solver = await this.startSolver({
        task: task.task,
        runtimeMode: task.runtimeMode,
        ...(task.promptName ? { promptName: task.promptName } : {}),
        ...(task.promptId ? { promptId: task.promptId } : {}),
        ...(task.challengeId ? { challengeId: task.challengeId } : {})
      });
      const assignedWorker = workers.find((candidate) => candidate.id === worker.id) ?? worker;
      if (solver.status === "failed") {
        const recovered = recoverSchedulerTask({
          task: {
            ...started,
            solverId: solver.id,
            lastSolverId: solver.id,
            ...(solver.error ? { error: solver.error } : {})
          },
          error: solver.error ?? "Solver failed",
          scope: task.challengeId ? "challenge" : "solver",
          scheduler: config.host.scheduler,
          recovery: config.host.recovery
        });
        if (recovered.action === "dead-letter") {
          await this.appendDeadLetterTask(recovered.task);
        }
        nextTasks = nextTasks.map((candidate) => (candidate.id === task.id ? recovered.task : candidate));
        workers = workers.map((candidate) => (candidate.id === worker.id ? releaseWorker(assignedWorker) : candidate));
        continue;
      }

      const completedTask: SchedulerTask = {
        ...started,
        solverId: solver.id,
        lastSolverId: solver.id,
        status: solver.status === "running" ? "running" : "completed",
        ...(solver.status === "running" ? {} : { completedAt: new Date().toISOString() }),
        updatedAt: new Date().toISOString(),
        ...(solver.error ? { error: solver.error } : {})
      };
      nextTasks = nextTasks.map((candidate) => (candidate.id === task.id ? completedTask : candidate));
      workers = workers.map((candidate) => {
        if (candidate.id !== worker.id) {
          return candidate;
        }

        const assigned = assignWorker(assignedWorker, task, solver);
        return solver.status === "running" ? assigned : releaseWorker(assigned);
      });
    }

    await this.saveSchedulerTasks(nextTasks);
    await this.saveWorkers(workers);
    return { decisions, tasks: nextTasks, workers };
  }

  async listWorkers(): Promise<SolverWorker[]> {
    return this.store.readJson<SolverWorker[]>("runtime/workers.json", []);
  }

  async registerWorker(workerId: string, processId?: number): Promise<SolverWorker> {
    const config = await this.configManager.getConfig();
    const workers = await this.listWorkers();
    const existing = workers.find((candidate) => candidate.id === workerId);
    const base = existing ?? createWorker(workerId);
    const next: SolverWorker = {
      ...acquireWorkerLease(base, workerId, config.host.recovery.workerHeartbeatTimeoutMs),
      ...(processId ? { processId } : {})
    };
    await this.saveWorkers(upsertWorker(workers, next));
    await this.publishEvent({
      type: "supervision",
      message: `Worker ${workerId} registered`,
      payload: { workerId, processId }
    });
    return next;
  }

  async stopWorker(workerId: string): Promise<SolverWorker> {
    const workers = await this.listWorkers();
    const worker = workers.find((candidate) => candidate.id === workerId);
    if (!worker) {
      throw new Error(`Worker not found: ${workerId}`);
    }

    const next: SolverWorker = {
      ...worker,
      status: "stopped",
      updatedAt: new Date().toISOString(),
      leaseExpiresAt: new Date().toISOString()
    };
    await this.saveWorkers(workers.map((candidate) => (candidate.id === workerId ? next : candidate)));
    await this.publishEvent({
      type: "supervision",
      message: `Worker ${workerId} stopped`,
      payload: { workerId }
    });
    return next;
  }

  async heartbeatWorker(workerId: string): Promise<SolverWorker> {
    const config = await this.configManager.getConfig();
    const workers = await this.listWorkers();
    const worker = workers.find((candidate) => candidate.id === workerId);
    if (!worker) {
      throw new Error(`Worker not found: ${workerId}`);
    }

    const next = heartbeatWorker(worker, config.host.recovery.workerHeartbeatTimeoutMs);
    await this.saveWorkers(workers.map((candidate) => (candidate.id === workerId ? next : candidate)));
    return next;
  }

  async superviseWorkers(): Promise<WorkerPoolSnapshot> {
    const config = await this.configManager.getConfig();
    let workers = await this.listWorkers();
    let tasks = await this.listSchedulerTasks();
    const deadLetters: SchedulerTask[] = [];

    workers = workers.map((worker) => classifyWorker(worker, config.host.recovery));
    for (const worker of workers.filter((candidate) => candidate.status === "crashed" || candidate.status === "stuck")) {
      if (!worker.currentTaskId) {
        continue;
      }

      const task = tasks.find((candidate) => candidate.id === worker.currentTaskId && candidate.status === "running");
      if (!task) {
        continue;
      }

      const recovered = recoverSchedulerTask({
        task,
        error: worker.lastError ?? `Worker ${worker.status}`,
        scope: "worker",
        scheduler: config.host.scheduler,
        recovery: config.host.recovery
      });
      if (recovered.action === "dead-letter") {
        deadLetters.push(recovered.task);
      }
      tasks = tasks.map((candidate) => (candidate.id === task.id ? recovered.task : candidate));
      workers = workers.map((candidate) => (candidate.id === worker.id ? markWorkerRecovered(worker) : candidate));
      await this.publishEvent({
        type: "supervision",
        message: `Recovered ${task.id} from ${worker.status} worker ${worker.id}`,
        payload: { workerId: worker.id, taskId: task.id, recovery: recovered.reason }
      });
    }

    await this.saveSchedulerTasks(tasks);
    await this.saveWorkers(workers);
    for (const task of deadLetters) {
      await this.appendDeadLetterTask(task);
    }
    return this.getWorkerPoolSnapshot();
  }

  async getWorkerPoolSnapshot(): Promise<WorkerPoolSnapshot> {
    const [workers, tasks] = await Promise.all([this.listWorkers(), this.listSchedulerTasks()]);
    return {
      workers,
      queuedTasks: tasks.filter((task) => task.status === "pending" || task.status === "retryable").length,
      runningTasks: tasks.filter((task) => task.status === "running").length
    };
  }

  async listDeadLetterTasks(): Promise<SchedulerTask[]> {
    const config = await this.configManager.getConfig();
    return this.store.readJson<SchedulerTask[]>(config.host.recovery.deadLetterPath, []);
  }

  async getSolver(id: string): Promise<SolverSession> {
    const solver = await this.store.readJson<SolverSession | undefined>(`solvers/${id}.json`, undefined);
    if (!solver) {
      throw new Error(`Solver not found: ${id}`);
    }

    return solver;
  }

  async getMessages(id: string): Promise<AgentMessage[]> {
    const content = await this.store.readText(`solvers/${id}/threads/main.jsonl`);
    return content
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as AgentMessage);
  }

  async startSolver(input: StartSolverInput): Promise<SolverSession> {
    return this.createSession(input, "solver");
  }

  async startSubagent(input: SubagentInput): Promise<SolverSession> {
    return this.createSession(input, "subagent");
  }

  async appendMessage(
    solverId: string,
    role: AgentMessage["role"],
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<AgentMessage> {
    const message: AgentMessage = {
      id: createId("msg"),
      createdAt: new Date().toISOString(),
      role,
      content,
      ...(metadata ? { metadata } : {})
    };

    await this.store.appendText(`solvers/${solverId}/threads/main.jsonl`, `${JSON.stringify(message)}\n`);
    const solver = await this.getSolver(solverId);
    await this.saveSolver({
      ...solver,
      messagesCount: solver.messagesCount + 1
    });
    return message;
  }

  async updateObserverState(solverId: string, state: Partial<Omit<ObserverState, "solverId">>): Promise<SolverSession> {
    const solver = await this.getSolver(solverId);
    const observer: ObserverState = {
      ...solver.observer,
      ...state,
      updatedAt: new Date().toISOString()
    };
    await this.store.writeJson(`solvers/${solverId}/observer/state.json`, observer);
    await this.publishEvent({
      type: "observer-note",
      solverId,
      message: observer.lastSignal,
      payload: {
        driftScore: observer.driftScore,
        contextPressure: observer.contextPressure,
        recommendations: observer.recommendations
      }
    });
    return this.saveSolver({ ...solver, observer });
  }

  async archiveSolver(id: string): Promise<void> {
    const solver = await this.getSolver(id);
    if (solver.containerId) {
      await stopDockerContainer(solver.containerId);
    }
    await this.saveSolver({ ...solver, status: "stopped", updatedAt: new Date().toISOString() });
    await this.store.move(`solvers/${id}.json`, `archive-solvers/${id}.json`);
    await this.publishEvent({
      type: "solver-completed",
      solverId: id,
      message: `Solver ${id} archived`
    });
  }

  async stopSolver(id: string): Promise<SolverSession> {
    const solver = await this.getSolver(id);
    const stopResult = solver.containerId ? await stopDockerContainer(solver.containerId) : undefined;
    await this.publishEvent({
      type: "solver-completed",
      solverId: id,
      message: stopResult?.message ?? `Solver ${id} stopped`
    });
    return this.saveSolver({
      ...solver,
      status: "stopped",
      completedAt: solver.completedAt ?? new Date().toISOString(),
      ...(stopResult && !stopResult.ok ? { error: stopResult.message } : {})
    });
  }

  async resumeSolver(id: string): Promise<SolverSession> {
    const solver = await this.getSolver(id);
    return this.createSession(
      {
        task: solver.task,
        promptId: solver.promptId,
        runtimeMode: solver.runtimeMode,
        ...(solver.challengeId ? { challengeId: solver.challengeId } : {})
      },
      solver.role
    );
  }

  private async createSession(
    input: StartSolverInput | SubagentInput,
    role: SolverSession["role"]
  ): Promise<SolverSession> {
    const config = await this.configManager.getConfig();
    const prompt = this.configManager.findPrompt(config, input.promptId ?? input.promptName);
    const route = resolveProviderRoute(config, prompt, input);
    const routedPrompt = { ...prompt, modelId: route.model.id };
    const assembly = assembleAgentSession(config, routedPrompt);
    const now = new Date().toISOString();
    const id = createId(role === "subagent" ? "subagent" : "solver");
    const sessionPath = path.join(this.store.paths.solvers, id);
    const workspacePath = path.join(sessionPath, "workspace");
    const observer: ObserverState = {
      solverId: id,
      driftScore: 0,
      contextPressure: 0,
      lastSignal: "session-created",
      recommendations: ["Record first observation after startup"],
      updatedAt: now
    };
    const solver: SolverSession = {
      id,
      role,
      task: input.task,
      promptId: routedPrompt.id,
      modelId: assembly.model.id,
      thinking: routedPrompt.thinking,
      status: "queued",
      runtimeMode: input.runtimeMode ?? "local",
      sessionPath,
      workspacePath,
      dockerImage: config.host.defaultRuntimeImage,
      createdAt: now,
      updatedAt: now,
      messagesCount: 0,
      observer,
      ...(input.challengeId ? { challengeId: input.challengeId } : {}),
      ...("parentSolverId" in input && input.parentSolverId ? { parentSolverId: input.parentSolverId } : {})
    };

    await this.prepareSessionDirectories(id);
    await this.saveSolver(solver);
    await this.writeStartupSnapshot(id, {
      solver,
      configDigest: {
        promptId: prompt.id,
        routeReason: route.reason,
        modelId: assembly.model.id,
        builtinTools: assembly.builtinTools.map((tool) => tool.id),
        customTools: assembly.customTools.map((tool) => tool.id),
        skillsFilter: prompt.skillsFilter,
        enabledMcpServers: prompt.enabledMcpServers
      }
    });
    await this.appendMessage(id, "user", input.task, { source: "startup" });
    await this.publishEvent({
      type: "solver-created",
      solverId: id,
      message: `${role} session created for ${input.task}`
    });
    const createdSolver = await this.getSolver(id);

    if (input.runtimeMode === "docker" || input.startContainer) {
      return this.startDockerBackedSession(createdSolver);
    }

    const running = await this.saveSolver({
      ...createdSolver,
      status: "running",
      startedAt: new Date().toISOString()
    });
    await this.publishEvent({
      type: "solver-started",
      solverId: id,
      message: `${role} ${id} started in local runtime mode`
    });
    return this.runSolver(running);
  }

  private async startDockerBackedSession(solver: SolverSession): Promise<SolverSession> {
    const running = await this.saveSolver({
      ...solver,
      status: "running",
      startedAt: new Date().toISOString()
    });
    await this.publishEvent({
      type: "solver-started",
      solverId: solver.id,
      message: `Starting Docker runtime for ${solver.id}`
    });

    const plan = createDockerRunPlan({
      image: solver.dockerImage,
      solverId: solver.id,
      workspacePath: solver.workspacePath
    });
    const result = await runDockerContainer(plan);
    if (!result.ok) {
      await this.publishEvent({
        type: "solver-failed",
        solverId: solver.id,
        message: result.message
      });
      return this.saveSolver({
        ...running,
        status: "failed",
        error: result.message,
        updatedAt: new Date().toISOString()
      });
    }

    await this.appendMessage(
      solver.id,
      "observer",
      result.message,
      result.containerId ? { containerId: result.containerId } : undefined
    );
    await this.store.writeText(
      `solvers/${solver.id}/workspace/runtime-rpc.jsonl`,
      `${JSON.stringify({ type: "start", solverId: solver.id, task: solver.task, createdAt: new Date().toISOString() })}\n`
    );
    const afterDockerMessage = await this.getSolver(solver.id);
    return this.saveSolver({
      ...afterDockerMessage,
      status: "running",
      updatedAt: new Date().toISOString(),
      ...(result.containerId ? { containerId: result.containerId } : {})
    });
  }

  private async runSolver(solver: SolverSession): Promise<SolverSession> {
    const runner = new SolverRunner({
      store: this.store,
      configManager: this.configManager,
      ...(this.challengeManager ? { challenges: this.challengeManager } : {}),
      mcpPool: this.mcpPool,
      launchSubagent: (input) => this.startSubagent(input),
      appendMessage: (solverId, role, content, metadata) => this.appendMessage(solverId, role, content, metadata),
      updateObserver: (solverId, state) => this.updateObserverState(solverId, state),
      publishEvent: (event) => this.publishEvent(event)
    });

    try {
      const result = await runner.run(solver);
      await this.publishEvent({
        type: "solver-completed",
        solverId: solver.id,
        message: result.summary.slice(0, 240),
        payload: { toolCount: result.toolCount }
      });
      const latest = await this.getSolver(solver.id);
      return this.saveSolver({
        ...latest,
        status: result.status,
        completedAt: new Date().toISOString()
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Solver failed";
      await this.publishEvent({
        type: "solver-failed",
        solverId: solver.id,
        message
      });
      const latest = await this.getSolver(solver.id);
      return this.saveSolver({
        ...latest,
        status: "failed",
        error: message,
        completedAt: new Date().toISOString()
      });
    }
  }

  private async prepareSessionDirectories(id: string): Promise<void> {
    await Promise.all([
      mkdir(this.store.resolve(`solvers/${id}/workspace`), { recursive: true }),
      mkdir(this.store.resolve(`solvers/${id}/threads/subagents`), { recursive: true }),
      mkdir(this.store.resolve(`solvers/${id}/observer`), { recursive: true }),
      mkdir(this.store.resolve(`solvers/${id}/logs`), { recursive: true })
    ]);
  }

  private async writeStartupSnapshot(id: string, snapshot: SolverStartupSnapshot): Promise<void> {
    await this.store.writeJson(`solvers/${id}/startup-snapshot.json`, snapshot);
    await this.store.writeJson(`solvers/${id}/observer/state.json`, snapshot.solver.observer);
  }

  private async saveSolver(solver: SolverSession): Promise<SolverSession> {
    const next = {
      ...solver,
      updatedAt: new Date().toISOString()
    };
    await this.store.writeJson(`solvers/${solver.id}.json`, next);
    return next;
  }

  async publishEvent(event: Omit<RuntimeEvent, "id" | "createdAt">): Promise<RuntimeEvent> {
    const published = this.events.publish(event);
    await this.store.appendText("runtime/events.jsonl", `${JSON.stringify(published)}\n`);
    if (published.type === "provider-usage") {
      const usage = extractProviderUsage(published)[0];
      if (usage) {
        const solver = published.solverId
          ? await this.store.readJson<SolverSession | undefined>(`solvers/${published.solverId}.json`, undefined)
          : undefined;
        await appendProviderUsageMetric(this.store, usage, {
          ...(published.solverId ? { solverId: published.solverId } : {}),
          ...(solver?.challengeId ? { challengeId: solver.challengeId } : {})
        });
      }
    }
    return published;
  }

  private async saveSchedulerTasks(tasks: SchedulerTask[]): Promise<void> {
    await this.store.writeJson("runtime/scheduler-queue.json", tasks);
  }

  private async saveWorkers(workers: SolverWorker[]): Promise<void> {
    await this.store.writeJson("runtime/workers.json", workers);
  }

  private async appendDeadLetterTask(task: SchedulerTask): Promise<void> {
    const config = await this.configManager.getConfig();
    const tasks = await this.store.readJson<SchedulerTask[]>(config.host.recovery.deadLetterPath, []);
    await this.store.writeJson(config.host.recovery.deadLetterPath, [...tasks, task]);
    await this.publishEvent({
      type: "supervision",
      message: `Task ${task.id} moved to dead letter`,
      payload: { taskId: task.id, error: task.error, scope: task.failureScope }
    });
  }

  private async applySupervisionAction(solver: SolverSession): Promise<void> {
    const action = solver.health?.nextAction;
    if (!action || action === "observe") {
      return;
    }

    if (action === "stop") {
      await this.stopSolver(solver.id);
      return;
    }

    if (action === "archive") {
      await this.archiveSolver(solver.id);
      return;
    }

    if (action === "retry" || action === "resume") {
      const retryCount = (solver.retryCount ?? 0) + 1;
      await this.saveSolver({ ...solver, retryCount });
      await this.resumeSolver(solver.id);
    }
  }
}

function extractProviderUsage(event: RuntimeEvent) {
  const usage = event.payload?.usage;
  if (!isRecord(usage)) {
    return [];
  }

  const providerId = usage.providerId;
  const modelId = usage.modelId;
  if (typeof providerId !== "string" || typeof modelId !== "string") {
    return [];
  }

  return [
    {
      providerId,
      modelId,
      inputTokens: typeof usage.inputTokens === "number" ? usage.inputTokens : 0,
      outputTokens: typeof usage.outputTokens === "number" ? usage.outputTokens : 0,
      totalTokens: typeof usage.totalTokens === "number" ? usage.totalTokens : 0,
      estimatedCostUsd: typeof usage.estimatedCostUsd === "number" ? usage.estimatedCostUsd : 0
    }
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function upsertWorker(workers: SolverWorker[], worker: SolverWorker): SolverWorker[] {
  const found = workers.some((candidate) => candidate.id === worker.id);
  if (!found) {
    return [...workers, worker];
  }

  return workers.map((candidate) => (candidate.id === worker.id ? worker : candidate));
}
