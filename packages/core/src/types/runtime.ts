import type { ThinkingLevel } from "./config";

export type AgentRole = "manager" | "solver" | "observer" | "subagent";
export type SolverStatus = "queued" | "running" | "completed" | "failed" | "stopped";
export type RuntimeMode = "local" | "docker";
export type SolverHealthClass = "healthy" | "idle" | "drift" | "timeout" | "failed" | "stopped";
export type RuntimeAction = "observe" | "retry" | "resume" | "stop" | "archive";
export type SchedulerTaskStatus = "pending" | "running" | "completed" | "failed" | "retryable";
export type RecoveryScope = "solver" | "challenge" | "worker";

export interface RuntimeEvent {
  id: string;
  createdAt: string;
  type:
    | "solver-created"
    | "solver-started"
    | "solver-log"
    | "solver-completed"
    | "solver-failed"
    | "observer-note"
    | "supervision"
    | "provider-usage";
  solverId?: string;
  message: string;
  payload?: Record<string, unknown>;
}

export interface ProviderUsage {
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface AgentMessage {
  id: string;
  createdAt: string;
  role: AgentRole | "assistant" | "user" | "tool";
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ObserverState {
  solverId: string;
  driftScore: number;
  contextPressure: number;
  lastSignal: string;
  recommendations: string[];
  updatedAt: string;
}

export interface SolverHealth {
  class: SolverHealthClass;
  reason: string;
  lastCheckedAt: string;
  nextAction: RuntimeAction;
  retryCount: number;
}

export interface SolverSession {
  id: string;
  role: AgentRole;
  task: string;
  promptId: string;
  modelId: string;
  thinking: ThinkingLevel;
  status: SolverStatus;
  runtimeMode: RuntimeMode;
  challengeId?: string;
  parentSolverId?: string;
  sessionPath: string;
  workspacePath: string;
  dockerImage: string;
  containerId?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  messagesCount: number;
  observer: ObserverState;
  health?: SolverHealth;
  retryCount?: number;
  maxRetries?: number;
}

export interface StartSolverInput {
  task: string;
  promptName?: string;
  promptId?: string;
  providerId?: string;
  modelId?: string;
  routingMode?: "default" | "capability" | "cost";
  challengeId?: string;
  runtimeMode?: RuntimeMode;
  startContainer?: boolean;
}

export interface SubagentInput extends StartSolverInput {
  parentSolverId?: string;
}

export interface SolverStartupSnapshot {
  solver: SolverSession;
  configDigest: {
    promptId: string;
    routeReason?: string;
    modelId: string;
    builtinTools: string[];
    customTools: string[];
    skillsFilter: string[];
    enabledMcpServers: string[];
  };
}

export interface SchedulerTask {
  id: string;
  task: string;
  promptName?: string;
  promptId?: string;
  challengeId?: string;
  runtimeMode: RuntimeMode;
  status: SchedulerTaskStatus;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  nextRunAt?: string;
  solverId?: string;
  lastSolverId?: string;
  error?: string;
  recoveryReason?: string;
  failureScope?: RecoveryScope;
  terminal?: boolean;
  deadLetteredAt?: string;
}

export interface SchedulerDecision {
  taskId: string;
  action: "start" | "defer" | "retry" | "fail" | "dead-letter";
  reason: string;
}
