import { createDefaultToolConfigs } from "../tools/tool-registry";
import { McpSessionPool } from "../mcp/mcp-session-pool";
import type {
  HostSettings,
  McpCapabilitySnapshot,
  McpServerConfig,
  ModelConfig,
  PromptConfig,
  ProviderRoutingPolicy,
  ProviderConfig,
  SkillConfig,
  SystemConfig,
  ToolConfig
} from "../types/config";
import type { FileStore } from "../storage/file-store";

const CONFIG_PATH = "config/system.json";

export class ConfigManager {
  private readonly mcpPool = new McpSessionPool();

  constructor(private readonly store: FileStore) {}

  async init(): Promise<SystemConfig> {
    await this.store.ensureWorkspace();
    const exists = await this.store.exists(CONFIG_PATH);
    if (!exists) {
      const defaults = this.createDefaultConfig();
      await this.store.writeJson(CONFIG_PATH, defaults);
      await this.seedPromptAndSkillFiles(defaults);
      return defaults;
    }

    return this.getConfig();
  }

  async getConfig(): Promise<SystemConfig> {
    const defaults = this.createDefaultConfig();
    const loaded = await this.store.readJson<Partial<SystemConfig>>(CONFIG_PATH, defaults);
    return normalizeConfig(loaded, defaults);
  }

  async updateConfig(mutator: (config: SystemConfig) => SystemConfig): Promise<SystemConfig> {
    const next = {
      ...mutator(await this.getConfig()),
      updatedAt: new Date().toISOString()
    };
    await this.store.writeJson(CONFIG_PATH, next);
    return next;
  }

  async upsertProvider(provider: ProviderConfig): Promise<SystemConfig> {
    return this.updateConfig((config) => ({
      ...config,
      providers: upsertProvider(config.providers, provider)
    }));
  }

  async replaceProvider(previousId: string, provider: ProviderConfig): Promise<SystemConfig> {
    return this.updateConfig((config) => ({
      ...config,
      providers: replaceById(config.providers, previousId, sanitizeProviderForStorage(provider, config.providers.find((candidate) => candidate.id === previousId)))
    }));
  }

  async upsertModel(model: ModelConfig): Promise<SystemConfig> {
    return this.updateConfig((config) => ({
      ...config,
      models: upsert(config.models, model)
    }));
  }

  async replaceModel(previousId: string, model: ModelConfig): Promise<SystemConfig> {
    return this.updateConfig((config) => ({
      ...config,
      models: replaceById(config.models, previousId, model)
    }));
  }

  async upsertPrompt(prompt: PromptConfig): Promise<SystemConfig> {
    await this.store.writeJson(`config/prompts/${prompt.id}.json`, prompt);
    return this.updateConfig((config) => ({
      ...config,
      prompts: upsert(config.prompts, prompt)
    }));
  }

  async replacePrompt(previousId: string, prompt: PromptConfig): Promise<SystemConfig> {
    await this.store.writeJson(`config/prompts/${prompt.id}.json`, prompt);
    return this.updateConfig((config) => ({
      ...config,
      prompts: replaceById(config.prompts, previousId, prompt)
    }));
  }

  async upsertSkill(skill: SkillConfig): Promise<SystemConfig> {
    await this.store.writeJson(`config/skills/${skill.id}.json`, skill);
    return this.updateConfig((config) => ({
      ...config,
      skills: upsert(config.skills, skill)
    }));
  }

  async upsertTool(tool: ToolConfig): Promise<SystemConfig> {
    return this.updateConfig((config) => ({
      ...config,
      tools: upsert(config.tools, tool)
    }));
  }

  async upsertMcpServer(server: McpServerConfig): Promise<SystemConfig> {
    return this.updateConfig((config) => ({
      ...config,
      mcpServers: upsert(config.mcpServers, server)
    }));
  }

  async replaceMcpServer(previousId: string, server: McpServerConfig): Promise<SystemConfig> {
    return this.updateConfig((config) => ({
      ...config,
      mcpServers: replaceById(config.mcpServers, previousId, server)
    }));
  }

  async discoverMcpServer(serverId: string): Promise<McpCapabilitySnapshot> {
    const config = await this.getConfig();
    const server = config.mcpServers.find((candidate) => candidate.id === serverId);
    if (!server) {
      throw new Error(`MCP server not found: ${serverId}`);
    }

    const snapshot = await this.mcpPool.discoverCapabilities(server);
    await this.store.writeJson(`config/mcp-cache/${serverId}.json`, snapshot);
    await this.updateConfig((current) => ({
      ...current,
      mcpCapabilities: {
        ...current.mcpCapabilities,
        [serverId]: snapshot
      }
    }));
    return snapshot;
  }

  async discoverAllMcpServers(): Promise<McpCapabilitySnapshot[]> {
    const config = await this.getConfig();
    const snapshots: McpCapabilitySnapshot[] = [];
    for (const server of config.mcpServers.filter((candidate) => candidate.enabled)) {
      snapshots.push(await this.discoverMcpServer(server.id));
    }

    return snapshots;
  }

  async refreshStaleMcpCapabilities(maxAgeMs?: number): Promise<McpCapabilitySnapshot[]> {
    const config = await this.getConfig();
    const threshold = maxAgeMs ?? config.host.mcpCapabilityMaxAgeMs;
    const now = Date.now();
    const snapshots: McpCapabilitySnapshot[] = [];
    for (const server of config.mcpServers.filter((candidate) => candidate.enabled)) {
      const cached = config.mcpCapabilities[server.id];
      const discoveredAt = cached ? Date.parse(cached.discoveredAt) : 0;
      if (!cached || Number.isNaN(discoveredAt) || now - discoveredAt > threshold) {
        snapshots.push(await this.discoverMcpServer(server.id));
      }
    }

    return snapshots;
  }

  getMcpSessions() {
    return this.mcpPool.getSnapshot();
  }

  closeMcpSessions(): void {
    this.mcpPool.closeAll();
  }

  async updateHost(host: HostSettings): Promise<SystemConfig> {
    return this.updateConfig((config) => ({
      ...config,
      host
    }));
  }

  async updateProviderRouting(providerRouting: ProviderRoutingPolicy): Promise<SystemConfig> {
    return this.updateConfig((config) => ({
      ...config,
      host: {
        ...config.host,
        providerRouting
      }
    }));
  }

  findPrompt(config: SystemConfig, promptNameOrId?: string): PromptConfig {
    const wanted = promptNameOrId ?? "solver-default";
    const prompt = config.prompts.find(
      (candidate) => candidate.id === wanted || candidate.name.toLowerCase() === wanted.toLowerCase()
    );

    if (!prompt) {
      throw new Error(`Prompt not found: ${wanted}`);
    }

    return prompt;
  }

  createDefaultConfig(): SystemConfig {
    const provider: ProviderConfig = {
      id: "local-dry-run",
      name: "Local dry run",
      type: "local",
      enabled: true,
      baseUrl: "local://wuweiweave"
    };
    const openAiProvider: ProviderConfig = {
      id: "openai",
      name: "OpenAI compatible",
      type: "openai",
      enabled: false,
      baseUrl: "https://api.openai.com/v1",
      apiKeyEnv: "OPENAI_API_KEY",
      defaultModelId: "gpt-5.4",
      supportsTools: true,
      supportsResponsesApi: false,
      supportsWebsockets: false
    };
    const model: ModelConfig = {
      id: "local-planner",
      providerId: provider.id,
      displayName: "Local Planner Stub",
      modelName: "local-planner",
      contextWindow: 32000,
      supportsTools: true,
      defaultThinking: "medium"
    };
    const openAiModels: ModelConfig[] = [
      {
        id: "gpt-5.4",
        providerId: openAiProvider.id,
        displayName: "GPT-5.4",
        modelName: "gpt-5.4",
        contextWindow: 1047576,
        supportsTools: true,
        defaultThinking: "medium"
      },
      {
        id: "gpt-5.4-mini",
        providerId: openAiProvider.id,
        displayName: "GPT-5.4 mini",
        modelName: "gpt-5.4-mini",
        contextWindow: 1047576,
        supportsTools: true,
        defaultThinking: "medium"
      },
      {
        id: "gpt-5.5",
        providerId: openAiProvider.id,
        displayName: "GPT-5.5",
        modelName: "gpt-5.5",
        contextWindow: 1047576,
        supportsTools: true,
        defaultThinking: "high"
      }
    ];
    const tools = createDefaultToolConfigs();
    const prompts: PromptConfig[] = [
      {
        id: "manager-default",
        name: "manager-default",
        role: "manager",
        modelId: model.id,
        thinking: "high",
        builtinTools: ["challenge.memory", "challenge.idea", "agent.subagent"],
        customTools: [],
        skillsFilter: [],
        enabledMcpServers: [],
        extensionFactories: ["challenge-planner"],
        systemPrompt: "You are WuWeiWeave Manager. Coordinate solvers, preserve evidence, and keep challenge progress explicit."
      },
      {
        id: "solver-default",
        name: "solver-default",
        role: "solver",
        modelId: model.id,
        thinking: "medium",
        builtinTools: tools.map((tool) => tool.id),
        customTools: [],
        skillsFilter: ["ctf-basics"],
        enabledMcpServers: [],
        extensionFactories: ["solver-session-factory"],
        systemPrompt: "You are WuWeiWeave Solver. Work in the runtime workspace, test hypotheses, and record reproducible evidence."
      },
      {
        id: "observer-default",
        name: "observer-default",
        role: "observer",
        modelId: model.id,
        thinking: "low",
        builtinTools: ["challenge.memory"],
        customTools: [],
        skillsFilter: [],
        enabledMcpServers: [],
        extensionFactories: ["observer-health-check"],
        systemPrompt: "You are WuWeiWeave Observer. Detect drift, context pressure, and unproductive loops."
      }
    ];

    return {
      providers: [provider, openAiProvider],
      models: [model, ...openAiModels],
      prompts,
      skills: [
        {
          id: "ctf-basics",
          name: "CTF basics",
          description: "Baseline recon, web, crypto, pwn, forensics, and reversing playbooks.",
          enabled: true,
          path: "config/skills/ctf-basics.md",
          tags: ["ctf", "security", "recon"]
        }
      ],
      tools,
      mcpServers: [],
      host: {
        webHost: "127.0.0.1",
        webPort: 3217,
        workspaceRoot: this.store.root,
        defaultRuntimeImage: "wuweiweave/solver-runtime:local",
        dockerNetwork: "bridge",
        allowShellTools: true,
        defaultProviderId: provider.id,
        defaultModelId: model.id,
        scheduler: {
          id: "default",
          name: "Default local scheduler",
          maxConcurrentSolvers: 4,
          maxSolversPerChallenge: 2,
          defaultSolverQuota: 8,
          retryLimit: 1,
          idleTimeoutMs: 5 * 60 * 1000,
          hardTimeoutMs: 30 * 60 * 1000
        },
        recovery: {
          retryBackoffMs: 30 * 1000,
          maxRetryBackoffMs: 5 * 60 * 1000,
          terminalFailureAfter: 3,
          workerHeartbeatTimeoutMs: 60 * 1000,
          stuckWorkerTimeoutMs: 10 * 60 * 1000,
          deadLetterPath: "runtime/dead-letter-tasks.json"
        },
        providerRouting: {
          mode: "default",
          defaultProviderId: provider.id,
          defaultModelId: model.id,
          fallbackProviderIds: [openAiProvider.id],
          preferToolModels: true
        },
        mcpCapabilityRefreshMs: 5 * 60 * 1000,
        mcpCapabilityMaxAgeMs: 10 * 60 * 1000
      },
      mcpCapabilities: {},
      updatedAt: new Date().toISOString()
    };
  }

  private async seedPromptAndSkillFiles(config: SystemConfig): Promise<void> {
    await Promise.all([
      ...config.prompts.map((prompt) => this.store.writeJson(`config/prompts/${prompt.id}.json`, prompt)),
      this.store.writeText(
        "config/skills/ctf-basics.md",
        [
          "# CTF Basics",
          "",
          "- Start with service and file reconnaissance.",
          "- Keep commands reproducible in the solver workspace.",
          "- Record failed paths as evidence, not noise.",
          "- Prefer narrow hypotheses and observable proof."
        ].join("\n")
      )
    ]);
  }
}

function upsert<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index === -1) {
    return [...items, item];
  }

  return items.map((candidate) => (candidate.id === item.id ? item : candidate));
}

function replaceById<T extends { id: string }>(items: T[], previousId: string, item: T): T[] {
  const index = items.findIndex((candidate) => candidate.id === previousId);
  if (index === -1) {
    return upsert(items, item);
  }

  const withoutPreviousOrNext = items.filter((candidate) => candidate.id !== previousId && candidate.id !== item.id);
  return [...withoutPreviousOrNext.slice(0, index), item, ...withoutPreviousOrNext.slice(index)];
}

function upsertProvider(providers: ProviderConfig[], provider: ProviderConfig): ProviderConfig[] {
  const existing = providers.find((candidate) => candidate.id === provider.id);
  const sanitized = sanitizeProviderForStorage(provider, existing);
  return upsert(providers, sanitized);
}

function sanitizeProviderForStorage(provider: ProviderConfig, existing?: ProviderConfig): ProviderConfig {
  const { hasApiKey: _hasApiKey, maskedApiKey: _maskedApiKey, ...rest } = provider;
  const next: ProviderConfig = { ...rest };
  if (provider.apiKey === undefined && existing?.apiKey) {
    next.apiKey = existing.apiKey;
  }

  if (provider.apiKey !== undefined && provider.apiKey.trim().length === 0) {
    delete next.apiKey;
  }

  return next;
}

function normalizeConfig(config: Partial<SystemConfig>, defaults: SystemConfig): SystemConfig {
  return {
    providers: config.providers ?? defaults.providers,
    models: config.models ?? defaults.models,
    prompts: config.prompts ?? defaults.prompts,
    skills: config.skills ?? defaults.skills,
    tools: config.tools ?? defaults.tools,
    mcpServers: config.mcpServers ?? defaults.mcpServers,
    mcpCapabilities: config.mcpCapabilities ?? {},
    host: {
      ...defaults.host,
      ...(config.host ?? {}),
      scheduler: {
        ...defaults.host.scheduler,
        ...(config.host?.scheduler ?? {})
      },
      recovery: {
        ...defaults.host.recovery,
        ...(config.host?.recovery ?? {})
      },
      providerRouting: {
        ...defaults.host.providerRouting,
        ...(config.host?.providerRouting ?? {})
      },
      mcpCapabilityRefreshMs: config.host?.mcpCapabilityRefreshMs ?? defaults.host.mcpCapabilityRefreshMs,
      mcpCapabilityMaxAgeMs: config.host?.mcpCapabilityMaxAgeMs ?? defaults.host.mcpCapabilityMaxAgeMs
    },
    updatedAt: config.updatedAt ?? defaults.updatedAt
  };
}
