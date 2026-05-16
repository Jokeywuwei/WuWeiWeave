import { createId } from "../utils/id";
import type { SchedulerPolicy } from "../types/config";
import type { SchedulerDecision, SchedulerTask, SolverSession, StartSolverInput } from "../types/runtime";

export function createSchedulerTask(input: StartSolverInput, policy: SchedulerPolicy): SchedulerTask {
  const now = new Date().toISOString();
  return {
    id: createId("task"),
    task: input.task,
    runtimeMode: input.runtimeMode ?? "local",
    status: "pending",
    retryCount: 0,
    maxRetries: policy.retryLimit,
    createdAt: now,
    updatedAt: now,
    ...(input.promptName ? { promptName: input.promptName } : {}),
    ...(input.promptId ? { promptId: input.promptId } : {}),
    ...(input.challengeId ? { challengeId: input.challengeId } : {})
  };
}

export function decideSchedulerActions(input: {
  tasks: SchedulerTask[];
  solvers: SolverSession[];
  policy: SchedulerPolicy;
}): SchedulerDecision[] {
  const now = Date.now();
  const runningSolvers = input.solvers.filter((solver) => solver.status === "running");
  const openSlots = Math.max(0, input.policy.maxConcurrentSolvers - runningSolvers.length);
  const runnable = input.tasks.filter((task) => task.status === "pending" || task.status === "retryable");
  const decisions: SchedulerDecision[] = [];
  let remainingSlots = openSlots;

  for (const task of runnable) {
    const nextRunAt = task.nextRunAt ? Date.parse(task.nextRunAt) : undefined;
    if (nextRunAt !== undefined && !Number.isNaN(nextRunAt) && nextRunAt > now) {
      decisions.push({ taskId: task.id, action: "defer", reason: "Retry backoff window is still active" });
      continue;
    }

    if (remainingSlots <= 0) {
      decisions.push({ taskId: task.id, action: "defer", reason: "No global solver slots available" });
      continue;
    }

    if (task.challengeId) {
      const runningForChallenge = runningSolvers.filter((solver) => solver.challengeId === task.challengeId).length;
      if (runningForChallenge >= input.policy.maxSolversPerChallenge) {
        decisions.push({ taskId: task.id, action: "defer", reason: "Challenge solver quota reached" });
        continue;
      }
    }

    decisions.push({
      taskId: task.id,
      action: task.status === "retryable" ? "retry" : "start",
      reason: "Scheduler slot available"
    });
    remainingSlots -= 1;
  }

  return decisions;
}
