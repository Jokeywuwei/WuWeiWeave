import type { SolverHealth, SolverHealthClass, SolverSession } from "../types/runtime";
import type { SchedulerPolicy } from "../types/config";

export interface SupervisionDecision {
  solverId: string;
  health: SolverHealth;
}

export function classifySolverHealth(solver: SolverSession, policy: SchedulerPolicy, now = Date.now()): SolverHealth {
  const retryCount = solver.retryCount ?? 0;
  if (solver.status === "failed") {
    return {
      class: "failed",
      reason: solver.error ?? "Solver failed",
      lastCheckedAt: new Date(now).toISOString(),
      nextAction: retryCount < policy.retryLimit ? "retry" : "archive",
      retryCount
    };
  }

  if (solver.status === "completed" || solver.status === "stopped") {
    return {
      class: solver.status === "completed" ? "healthy" : "stopped",
      reason: `Solver is ${solver.status}`,
      lastCheckedAt: new Date(now).toISOString(),
      nextAction: solver.status === "completed" ? "archive" : "observe",
      retryCount
    };
  }

  const startedAt = Date.parse(solver.startedAt ?? solver.createdAt);
  const updatedAt = Date.parse(solver.updatedAt);
  const runtimeAge = Number.isNaN(startedAt) ? 0 : now - startedAt;
  const idleAge = Number.isNaN(updatedAt) ? 0 : now - updatedAt;

  if (runtimeAge >= policy.hardTimeoutMs) {
    return build("timeout", `Exceeded hard timeout ${policy.hardTimeoutMs}ms`, "stop", retryCount, now);
  }

  if (idleAge >= policy.idleTimeoutMs) {
    return build("idle", `No progress for ${idleAge}ms`, retryCount < policy.retryLimit ? "retry" : "archive", retryCount, now);
  }

  if (solver.observer.driftScore >= 0.7) {
    return build("drift", `Observer drift score ${solver.observer.driftScore}`, "resume", retryCount, now);
  }

  return build("healthy", "Solver is within runtime policy", "observe", retryCount, now);
}

function build(
  healthClass: SolverHealthClass,
  reason: string,
  nextAction: SolverHealth["nextAction"],
  retryCount: number,
  now: number
): SolverHealth {
  return {
    class: healthClass,
    reason,
    nextAction,
    retryCount,
    lastCheckedAt: new Date(now).toISOString()
  };
}
