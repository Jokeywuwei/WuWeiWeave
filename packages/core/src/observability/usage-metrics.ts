import type { FileStore } from "../storage/file-store";
import type { ProviderUsage } from "../types/runtime";
import { createId } from "../utils/id";

const METRICS_PATH = "runtime/provider-usage.jsonl";

export interface ProviderUsageMetric extends ProviderUsage {
  id: string;
  createdAt: string;
  solverId?: string;
  challengeId?: string;
}

export interface ProviderMetricsSummary {
  generatedAt: string;
  windowMs?: number;
  totalCalls: number;
  totalTokens: number;
  estimatedCostUsd: number;
  byProvider: Record<string, ProviderUsage>;
  byModel: Record<string, ProviderUsage>;
  bySolver: Record<string, ProviderUsage>;
  byChallenge: Record<string, ProviderUsage>;
}

export async function appendProviderUsageMetric(
  store: FileStore,
  usage: ProviderUsage,
  metadata: { solverId?: string; challengeId?: string } = {}
): Promise<ProviderUsageMetric> {
  const metric: ProviderUsageMetric = {
    id: createId("usage"),
    createdAt: new Date().toISOString(),
    ...usage,
    ...(metadata.solverId ? { solverId: metadata.solverId } : {}),
    ...(metadata.challengeId ? { challengeId: metadata.challengeId } : {})
  };
  await store.appendText(METRICS_PATH, `${JSON.stringify(metric)}\n`);
  return metric;
}

export async function readProviderUsageMetrics(store: FileStore): Promise<ProviderUsageMetric[]> {
  const content = await store.readText(METRICS_PATH);
  return content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ProviderUsageMetric);
}

export function summarizeProviderMetrics(metrics: ProviderUsageMetric[], windowMs?: number): ProviderMetricsSummary {
  const now = Date.now();
  const scoped = windowMs
    ? metrics.filter((metric) => {
        const createdAt = Date.parse(metric.createdAt);
        return !Number.isNaN(createdAt) && now - createdAt <= windowMs;
      })
    : metrics;

  return {
    generatedAt: new Date().toISOString(),
    ...(windowMs ? { windowMs } : {}),
    totalCalls: scoped.length,
    totalTokens: scoped.reduce((sum, metric) => sum + metric.totalTokens, 0),
    estimatedCostUsd: scoped.reduce((sum, metric) => sum + metric.estimatedCostUsd, 0),
    byProvider: aggregateBy(scoped, (metric) => metric.providerId),
    byModel: aggregateBy(scoped, (metric) => metric.modelId),
    bySolver: aggregateBy(scoped, (metric) => metric.solverId ?? "unassigned"),
    byChallenge: aggregateBy(scoped, (metric) => metric.challengeId ?? "unassigned")
  };
}

function aggregateBy(metrics: ProviderUsageMetric[], keyFor: (metric: ProviderUsageMetric) => string): Record<string, ProviderUsage> {
  const result: Record<string, ProviderUsage> = {};
  for (const metric of metrics) {
    const key = keyFor(metric);
    const existing = result[key] ?? {
      providerId: metric.providerId,
      modelId: metric.modelId,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0
    };
    result[key] = {
      ...existing,
      inputTokens: existing.inputTokens + metric.inputTokens,
      outputTokens: existing.outputTokens + metric.outputTokens,
      totalTokens: existing.totalTokens + metric.totalTokens,
      estimatedCostUsd: existing.estimatedCostUsd + metric.estimatedCostUsd
    };
  }

  return result;
}
