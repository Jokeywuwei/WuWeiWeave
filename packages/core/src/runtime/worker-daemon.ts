import type { SchedulerTask, SolverSession } from "../types/runtime";
import type { RecoveryPolicy } from "../types/config";

export type WorkerStatus = "idle" | "running" | "stopped" | "crashed" | "stuck";

export interface SolverWorker {
  id: string;
  status: WorkerStatus;
  currentTaskId?: string;
  currentSolverId?: string;
  startedAt: string;
  updatedAt: string;
  heartbeatAt: string;
  leaseId?: string;
  leaseOwner?: string;
  leaseAcquiredAt?: string;
  leaseExpiresAt?: string;
  currentTaskStartedAt?: string;
  processId?: number;
  recoveredTasks?: number;
  lastError?: string;
}

export interface WorkerPoolSnapshot {
  workers: SolverWorker[];
  queuedTasks: number;
  runningTasks: number;
}

export function createWorker(id: string): SolverWorker {
  const now = new Date().toISOString();
  return {
    id,
    status: "idle",
    startedAt: now,
    updatedAt: now,
    heartbeatAt: now,
    recoveredTasks: 0
  };
}

export function acquireWorkerLease(worker: SolverWorker, owner: string, ttlMs: number): SolverWorker {
  const now = new Date();
  return {
    ...worker,
    leaseId: crypto.randomUUID(),
    leaseOwner: owner,
    leaseAcquiredAt: now.toISOString(),
    leaseExpiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    heartbeatAt: now.toISOString(),
    updatedAt: now.toISOString(),
    status: worker.status === "running" ? "running" : "idle"
  };
}

export function assignWorker(worker: SolverWorker, task: SchedulerTask, solver: SolverSession): SolverWorker {
  return {
    ...worker,
    status: "running",
    currentTaskId: task.id,
    currentSolverId: solver.id,
    currentTaskStartedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString()
  };
}

export function releaseWorker(worker: SolverWorker): SolverWorker {
  return {
    id: worker.id,
    status: "idle",
    startedAt: worker.startedAt,
    updatedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
    ...(worker.leaseId ? { leaseId: worker.leaseId } : {}),
    ...(worker.leaseOwner ? { leaseOwner: worker.leaseOwner } : {}),
    ...(worker.leaseAcquiredAt ? { leaseAcquiredAt: worker.leaseAcquiredAt } : {}),
    ...(worker.leaseExpiresAt ? { leaseExpiresAt: worker.leaseExpiresAt } : {}),
    ...(worker.processId ? { processId: worker.processId } : {}),
    recoveredTasks: worker.recoveredTasks ?? 0
  };
}

export function heartbeatWorker(worker: SolverWorker, ttlMs?: number): SolverWorker {
  const now = new Date();
  return {
    ...worker,
    heartbeatAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...(ttlMs ? { leaseExpiresAt: new Date(now.getTime() + ttlMs).toISOString() } : {})
  };
}

export function classifyWorker(worker: SolverWorker, recovery: RecoveryPolicy, nowMs = Date.now()): SolverWorker {
  if (worker.status === "stopped") {
    return worker;
  }

  const leaseExpiresAt = worker.leaseExpiresAt ? Date.parse(worker.leaseExpiresAt) : undefined;
  if (leaseExpiresAt !== undefined && !Number.isNaN(leaseExpiresAt) && nowMs > leaseExpiresAt) {
    return markWorker(worker, "crashed", "Worker lease expired");
  }

  const heartbeatAt = Date.parse(worker.heartbeatAt);
  if (Number.isNaN(heartbeatAt) || nowMs - heartbeatAt > recovery.workerHeartbeatTimeoutMs) {
    return markWorker(worker, "crashed", "Worker heartbeat timed out");
  }

  const taskStartedAt = worker.currentTaskStartedAt ? Date.parse(worker.currentTaskStartedAt) : undefined;
  if (
    worker.status === "running" &&
    taskStartedAt !== undefined &&
    !Number.isNaN(taskStartedAt) &&
    nowMs - taskStartedAt > recovery.stuckWorkerTimeoutMs
  ) {
    return markWorker(worker, "stuck", "Worker task exceeded stuck timeout");
  }

  return worker;
}

export function hasValidWorkerLease(worker: SolverWorker, nowMs = Date.now()): boolean {
  if (!worker.leaseExpiresAt) {
    return true;
  }

  const expiresAt = Date.parse(worker.leaseExpiresAt);
  return !Number.isNaN(expiresAt) && expiresAt > nowMs;
}

export function markWorkerRecovered(worker: SolverWorker): SolverWorker {
  return {
    ...releaseWorker(worker),
    recoveredTasks: (worker.recoveredTasks ?? 0) + 1
  };
}

function markWorker(worker: SolverWorker, status: "crashed" | "stuck", message: string): SolverWorker {
  return {
    ...worker,
    status,
    lastError: message,
    updatedAt: new Date().toISOString()
  };
}
