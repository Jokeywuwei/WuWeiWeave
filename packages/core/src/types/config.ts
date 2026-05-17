export type ProviderType = "openai" | "anthropic" | "local" | "custom";
export type ThinkingLevel = "none" | "low" | "medium" | "high" | "xhigh";

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  enabled: boolean;
  baseUrl?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  hasApiKey?: boolean;
  maskedApiKey?: string;
  defaultModelId?: string;
  costPerInput1k?: number;
  costPerOutput1k?: number;
}

export interface ModelConfig {
  id: string;
  providerId: string;
  displayName: string;
  modelName?: string;
  contextWindow: number;
  supportsTools: boolean;
  defaultThinking: ThinkingLevel;
}

export interface PromptConfig {
  id: string;
  name: string;
  role: "manager" | "solver" | "observer" | "subagent";
  modelId: string;
  thinking: ThinkingLevel;
  builtinTools: string[];
  customTools: string[];
  skillsFilter: string[];
  enabledMcpServers: string[];
  extensionFactories: string[];
  systemPrompt: string;
}

export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  path: string;
  tags: string[];
}

export interface ToolConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: "filesystem" | "shell" | "challenge" | "agent" | "mcp";
}

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
  env: Record<string, string>;
  timeoutMs?: number;
}

export interface McpCapabilityTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpCapabilityResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface McpCapabilityPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface McpCapabilitySnapshot {
  serverId: string;
  discoveredAt: string;
  ok: boolean;
  error?: string;
  tools: McpCapabilityTool[];
  resources: McpCapabilityResource[];
  prompts: McpCapabilityPrompt[];
}

export interface SchedulerPolicy {
  id: string;
  name: string;
  maxConcurrentSolvers: number;
  maxSolversPerChallenge: number;
  defaultSolverQuota: number;
  retryLimit: number;
  idleTimeoutMs: number;
  hardTimeoutMs: number;
}

export interface RecoveryPolicy {
  retryBackoffMs: number;
  maxRetryBackoffMs: number;
  terminalFailureAfter: number;
  workerHeartbeatTimeoutMs: number;
  stuckWorkerTimeoutMs: number;
  deadLetterPath: string;
}

export type ProviderRoutingMode = "default" | "capability" | "cost";

export interface ProviderRoutingPolicy {
  mode: ProviderRoutingMode;
  defaultProviderId: string;
  defaultModelId: string;
  fallbackProviderIds: string[];
  preferToolModels: boolean;
  maxEstimatedCostUsd?: number;
}

export interface HostSettings {
  webHost: string;
  webPort: number;
  workspaceRoot: string;
  defaultRuntimeImage: string;
  dockerNetwork: string;
  allowShellTools: boolean;
  defaultProviderId?: string;
  defaultModelId?: string;
  scheduler: SchedulerPolicy;
  recovery: RecoveryPolicy;
  providerRouting: ProviderRoutingPolicy;
  mcpCapabilityRefreshMs: number;
  mcpCapabilityMaxAgeMs: number;
}

export interface SystemConfig {
  providers: ProviderConfig[];
  models: ModelConfig[];
  prompts: PromptConfig[];
  skills: SkillConfig[];
  tools: ToolConfig[];
  mcpServers: McpServerConfig[];
  mcpCapabilities: Record<string, McpCapabilitySnapshot>;
  host: HostSettings;
  updatedAt: string;
}
