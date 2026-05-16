import { createDefaultDaemon } from "@wuweiweave/core";
import type { ProviderUsage, SchedulerTask } from "@wuweiweave/core";

const daemon = await createDefaultDaemon(Bun.env.WUWEIWEAVE_HOME);
const config = await daemon.config.getConfig();
await daemon.config.updateHost({
  ...config.host,
  scheduler: {
    ...config.host.scheduler,
    retryLimit: 1
  },
  recovery: {
    ...config.host.recovery,
    retryBackoffMs: 0,
    maxRetryBackoffMs: 0,
    terminalFailureAfter: 1,
    workerHeartbeatTimeoutMs: 1000,
    stuckWorkerTimeoutMs: 1000
  }
});

const challenge = await daemon.createChallenge({
  title: "Phase 5.5 acceptance",
  description: "Acceptance smoke for metrics, leases, and dead-letter recovery",
  category: "ops",
  tags: ["acceptance"]
});

const worker = await daemon.runtime.registerWorker("acceptance-worker", process.pid);
const queued = await daemon.runtime.enqueueSolverTask({
  task: "Acceptance metrics solver",
  promptName: "solver-default",
  challengeId: challenge.id,
  runtimeMode: "local"
});
const scheduled = await daemon.runtime.runScheduler();
const completedTask = scheduled.tasks.find((task) => task.id === queued.id);
const completedSolverId = completedTask?.solverId;

const deadTask = await daemon.runtime.enqueueSolverTask({
  task: "Acceptance terminal failure",
  promptName: "solver-default",
  challengeId: challenge.id,
  runtimeMode: "local"
});
const staleAt = new Date(Date.now() - 5000).toISOString();
const runningDeadTask: SchedulerTask = {
  ...deadTask,
  status: "running",
  retryCount: 1,
  maxRetries: 1,
  startedAt: staleAt,
  updatedAt: staleAt,
  recoveryReason: "seeded acceptance failure"
};
const tasks = await daemon.runtime.listSchedulerTasks();
await daemon.store.writeJson(
  "runtime/scheduler-queue.json",
  tasks.map((task) => (task.id === deadTask.id ? runningDeadTask : task))
);
const workers = await daemon.runtime.listWorkers();
await daemon.store.writeJson("runtime/workers.json", [
  ...workers,
  {
    id: "acceptance-stale-worker",
    status: "running",
    currentTaskId: deadTask.id,
    startedAt: staleAt,
    updatedAt: staleAt,
    heartbeatAt: staleAt,
    leaseId: "acceptance-expired-lease",
    leaseOwner: "acceptance-stale-worker",
    leaseAcquiredAt: staleAt,
    leaseExpiresAt: staleAt,
    currentTaskStartedAt: staleAt,
    processId: 999999,
    recoveredTasks: 0
  }
]);

await daemon.runtime.superviseWorkers();
const deadLetters = await daemon.runtime.listDeadLetterTasks();
const metrics = await daemon.runtime.getProviderMetricsSnapshot();
const windowMetrics = await daemon.runtime.getProviderMetricsSnapshot(24 * 60 * 60 * 1000);
const observability = await daemon.runtime.getObservabilitySnapshot();
const workerSnapshot = await daemon.runtime.getWorkerPoolSnapshot();
const acceptanceWorker = workerSnapshot.workers.find((candidate) => candidate.id === worker.id);
const reclaimedWorker = workerSnapshot.workers.find((candidate) => candidate.id === "acceptance-stale-worker");

const providerTokenSum = sumUsage(metrics.byProvider);
const modelTokenSum = sumUsage(metrics.byModel);
const solverTokenSum = sumUsage(metrics.bySolver);
const challengeTokenSum = sumUsage(metrics.byChallenge);
const hasCompletedSolverMetrics = completedSolverId ? metrics.bySolver[completedSolverId]?.totalTokens === metrics.totalTokens : false;
const hasChallengeMetrics = metrics.byChallenge[challenge.id]?.totalTokens === metrics.totalTokens;
const deadLetter = deadLetters.find((task) => task.id === deadTask.id);

const ok =
  completedTask?.status === "completed" &&
  Boolean(completedSolverId) &&
  Boolean(acceptanceWorker?.leaseId && acceptanceWorker.leaseExpiresAt) &&
  deadLetter?.terminal === true &&
  deadLetter.failureScope === "worker" &&
  reclaimedWorker?.recoveredTasks === 1 &&
  metrics.totalCalls >= 1 &&
  providerTokenSum === metrics.totalTokens &&
  modelTokenSum === metrics.totalTokens &&
  solverTokenSum === metrics.totalTokens &&
  challengeTokenSum === metrics.totalTokens &&
  hasCompletedSolverMetrics &&
  hasChallengeMetrics &&
  windowMetrics.totalTokens === metrics.totalTokens &&
  observability.metrics.totalTokens === metrics.totalTokens;

console.log(
  JSON.stringify(
    {
      ok,
      workerLease: {
        workerId: acceptanceWorker?.id,
        leaseId: acceptanceWorker?.leaseId,
        leaseExpiresAt: acceptanceWorker?.leaseExpiresAt,
        reclaimedWorker: reclaimedWorker
          ? {
              id: reclaimedWorker.id,
              status: reclaimedWorker.status,
              recoveredTasks: reclaimedWorker.recoveredTasks,
              leaseExpiresAt: reclaimedWorker.leaseExpiresAt
            }
          : undefined
      },
      scheduler: {
        completedTask: completedTask
          ? {
              id: completedTask.id,
              status: completedTask.status,
              solverId: completedTask.solverId
            }
          : undefined,
        deadLetter: deadLetter
          ? {
              id: deadLetter.id,
              terminal: deadLetter.terminal,
              failureScope: deadLetter.failureScope,
              retryCount: deadLetter.retryCount,
              recoveryReason: deadLetter.recoveryReason
            }
          : undefined
      },
      metrics: {
        totalCalls: metrics.totalCalls,
        totalTokens: metrics.totalTokens,
        providerTokenSum,
        modelTokenSum,
        solverTokenSum,
        challengeTokenSum,
        byChallenge: Object.keys(metrics.byChallenge),
        bySolver: Object.keys(metrics.bySolver),
        windowTokens: windowMetrics.totalTokens
      }
    },
    null,
    2
  )
);

if (!ok) {
  process.exit(1);
}

function sumUsage(usages: Record<string, ProviderUsage>): number {
  return Object.values(usages).reduce((sum, usage) => sum + usage.totalTokens, 0);
}
