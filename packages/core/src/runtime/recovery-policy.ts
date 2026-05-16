import type { RecoveryPolicy, SchedulerPolicy } from "../types/config";
import type { RecoveryScope, SchedulerTask } from "../types/runtime";

export interface RecoveryDecision {
  task: SchedulerTask;
  action: "retry" | "dead-letter";
  delayMs: number;
  reason: string;
}

export function recoverSchedulerTask(input: {
  task: SchedulerTask;
  error: string;
  scope: RecoveryScope;
  scheduler: SchedulerPolicy;
  recovery: RecoveryPolicy;
  now?: Date;
}): RecoveryDecision {
  const now = input.now ?? new Date();
  const retryCount = input.task.retryCount + 1;
  const maxRetries = Math.min(input.task.maxRetries, input.recovery.terminalFailureAfter, input.scheduler.retryLimit);
  const shouldDeadLetter = retryCount > maxRetries;
  if (shouldDeadLetter) {
    return {
      action: "dead-letter",
      delayMs: 0,
      reason: `Retry limit exhausted after ${retryCount - 1} attempts`,
      task: {
        ...input.task,
        status: "failed",
        retryCount,
        terminal: true,
        failureScope: input.scope,
        error: input.error,
        recoveryReason: `Retry limit exhausted after ${retryCount - 1} attempts`,
        deadLetteredAt: now.toISOString(),
        updatedAt: now.toISOString()
      }
    };
  }

  const delayMs = calculateBackoffMs(retryCount, input.recovery);
  const { solverId: _solverId, ...taskWithoutSolver } = input.task;
  return {
    action: "retry",
    delayMs,
    reason: `Retry scheduled in ${delayMs}ms`,
    task: {
      ...taskWithoutSolver,
      status: "retryable",
      retryCount,
      failureScope: input.scope,
      error: input.error,
      recoveryReason: `Retry scheduled in ${delayMs}ms`,
      nextRunAt: new Date(now.getTime() + delayMs).toISOString(),
      updatedAt: now.toISOString()
    }
  };
}

export function calculateBackoffMs(retryCount: number, recovery: RecoveryPolicy): number {
  const base = Math.max(0, recovery.retryBackoffMs);
  const next = base * 2 ** Math.max(0, retryCount - 1);
  return Math.min(next, recovery.maxRetryBackoffMs);
}
