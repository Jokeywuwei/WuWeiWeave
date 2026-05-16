import type { ChallengeState } from "../types/challenge";
import type { ProviderUsage, RuntimeEvent, SolverSession } from "../types/runtime";
import type { SystemConfig } from "../types/config";
import type { ProviderMetricsSummary, ProviderUsageMetric } from "./usage-metrics";
import { summarizeProviderMetrics } from "./usage-metrics";

export interface ObservabilitySnapshot {
  generatedAt: string;
  timeline: RuntimeEvent[];
  solvers: {
    total: number;
    byStatus: Record<string, number>;
    byHealth: Record<string, number>;
  };
  challenges: {
    total: number;
    byStatus: Record<string, number>;
    assignments: number;
  };
  providers: {
    totalCalls: number;
    totalTokens: number;
    estimatedCostUsd: number;
    byProvider: Record<string, ProviderUsage>;
  };
  metrics: ProviderMetricsSummary;
  scheduler: {
    maxConcurrentSolvers: number;
    runningSolvers: number;
    availableSlots: number;
  };
}

export function createObservabilitySnapshot(input: {
  config: SystemConfig;
  challenges: ChallengeState[];
  solvers: SolverSession[];
  events: RuntimeEvent[];
  usages: ProviderUsage[];
  metrics?: ProviderUsageMetric[];
}): ObservabilitySnapshot {
  const runningSolvers = input.solvers.filter((solver) => solver.status === "running").length;
  return {
    generatedAt: new Date().toISOString(),
    timeline: input.events.slice(-200),
    solvers: {
      total: input.solvers.length,
      byStatus: countBy(input.solvers.map((solver) => solver.status)),
      byHealth: countBy(input.solvers.map((solver) => solver.health?.class ?? "unknown"))
    },
    challenges: {
      total: input.challenges.length,
      byStatus: countBy(input.challenges.map((challenge) => challenge.status)),
      assignments: input.challenges.reduce((sum, challenge) => sum + challenge.solverAssignments.length, 0)
    },
    providers: summarizeProviderUsage(input.usages),
    metrics: summarizeProviderMetrics(input.metrics ?? []),
    scheduler: {
      maxConcurrentSolvers: input.config.host.scheduler.maxConcurrentSolvers,
      runningSolvers,
      availableSlots: Math.max(0, input.config.host.scheduler.maxConcurrentSolvers - runningSolvers)
    }
  };
}

function summarizeProviderUsage(usages: ProviderUsage[]): ObservabilitySnapshot["providers"] {
  const byProvider: Record<string, ProviderUsage> = {};
  for (const usage of usages) {
    const existing = byProvider[usage.providerId] ?? {
      providerId: usage.providerId,
      modelId: usage.modelId,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0
    };
    byProvider[usage.providerId] = {
      ...existing,
      inputTokens: existing.inputTokens + usage.inputTokens,
      outputTokens: existing.outputTokens + usage.outputTokens,
      totalTokens: existing.totalTokens + usage.totalTokens,
      estimatedCostUsd: existing.estimatedCostUsd + usage.estimatedCostUsd
    };
  }

  return {
    totalCalls: usages.length,
    totalTokens: usages.reduce((sum, usage) => sum + usage.totalTokens, 0),
    estimatedCostUsd: usages.reduce((sum, usage) => sum + usage.estimatedCostUsd, 0),
    byProvider
  };
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return counts;
}
