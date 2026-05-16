import type {
  ChallengeState,
  DashboardState,
  AgentMessage,
  McpServerConfig,
  ModelConfig,
  ObservabilitySnapshot,
  ProviderMetricsSummary,
  PromptConfig,
  ProviderConfig,
  ProviderRoutingPolicy,
  SchedulerTask,
  SolverSession,
  SystemConfig
} from "@wuweiweave/core";
import type { WorkerPoolSnapshot } from "@wuweiweave/core";

export type {
  ChallengeState,
  DashboardState,
  AgentMessage,
  McpServerConfig,
  ModelConfig,
  ObservabilitySnapshot,
  ProviderMetricsSummary,
  PromptConfig,
  ProviderConfig,
  ProviderRoutingPolicy,
  SchedulerTask,
  SolverSession,
  SystemConfig,
  WorkerPoolSnapshot
};

export type ViewKey = "dashboard" | "challenges" | "runtime" | "observability" | "providers" | "scheduler" | "config";
