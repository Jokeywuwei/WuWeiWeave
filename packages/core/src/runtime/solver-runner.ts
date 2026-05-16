import { assembleAgentSession } from "../agent/session-assembly";
import { ModelProviderRegistry } from "../model/model-provider";
import { ToolDispatcher } from "../tools/tool-dispatcher";
import type { ProviderMessage } from "../model/model-provider";
import type { ChallengeManager } from "../managers/challenge-manager";
import type { ConfigManager } from "../managers/config-manager";
import type { McpSessionPool } from "../mcp/mcp-session-pool";
import type { FileStore } from "../storage/file-store";
import type { RuntimeEvent } from "../types/runtime";
import type { AgentMessage, SolverSession, SubagentInput } from "../types/runtime";

export interface SolverRunnerOptions {
  store: FileStore;
  configManager: ConfigManager;
  challenges?: ChallengeManager;
  mcpPool?: McpSessionPool;
  launchSubagent?: (input: SubagentInput) => Promise<SolverSession>;
  appendMessage: (solverId: string, role: AgentMessage["role"], content: string, metadata?: Record<string, unknown>) => Promise<AgentMessage>;
  updateObserver: (solverId: string, state: { lastSignal: string; recommendations: string[]; driftScore?: number; contextPressure?: number }) => Promise<SolverSession>;
  publishEvent: (event: Omit<RuntimeEvent, "id" | "createdAt">) => Promise<RuntimeEvent>;
}

export interface SolverRunResult {
  status: "completed" | "failed";
  summary: string;
  toolCount: number;
}

export class SolverRunner {
  private readonly providerRegistry = new ModelProviderRegistry();
  private readonly options: SolverRunnerOptions;

  constructor(options: SolverRunnerOptions) {
    this.options = options;
  }

  async run(solver: SolverSession): Promise<SolverRunResult> {
    const config = await this.options.configManager.getConfig();
    const prompt = this.options.configManager.findPrompt(config, solver.promptId);
    const assembly = assembleAgentSession(config, prompt);
    const dispatcher = new ToolDispatcher({
      store: this.options.store,
      ...(this.options.challenges ? { challenges: this.options.challenges } : {}),
      ...(this.options.mcpPool ? { mcpPool: this.options.mcpPool } : {}),
      ...(this.options.launchSubagent ? { launchSubagent: this.options.launchSubagent } : {}),
      emit: async (message, payload) => {
        await this.options.publishEvent({
          type: "solver-log",
          solverId: solver.id,
          message,
          ...(payload ? { payload } : {})
        });
      }
    });
    const allowedToolIds = new Set([...prompt.builtinTools, ...prompt.customTools]);
    const enabledMcpToolIds = new Set(prompt.enabledMcpServers.map((serverId) => `mcp.${serverId}.call`));
    const tools = dispatcher
      .listAvailableDefinitions(config)
      .filter((tool) => allowedToolIds.has(tool.id) || enabledMcpToolIds.has(tool.id));

    const preflight = await dispatcher.execute(
      "shell.run",
      {
        command: process.platform === "win32" ? "Get-ChildItem -Force" : "ls -la"
      },
      { solver, config }
    );
    await this.options.appendMessage(solver.id, "tool", preflight.content, {
      toolId: preflight.toolId,
      ok: preflight.ok
    });

    const providerMessages: ProviderMessage[] = [
      { role: "system", content: assembly.systemPrompt },
      { role: "user", content: solver.task },
      {
        role: "tool",
        name: preflight.toolId.replaceAll(".", "_"),
        content: preflight.content.slice(0, 8000)
      }
    ];

    const firstModelResult = await this.providerRegistry.run({
      config,
      prompt,
      messages: providerMessages,
      tools
    });
    await this.options.publishEvent({
      type: "provider-usage",
      solverId: solver.id,
      message: `${firstModelResult.providerId}/${firstModelResult.modelId}: ${firstModelResult.usage.totalTokens} tokens`,
      payload: { usage: firstModelResult.usage }
    });
    await this.options.appendMessage(solver.id, "assistant", firstModelResult.content, {
      providerId: firstModelResult.providerId,
      modelId: firstModelResult.modelId,
      usage: firstModelResult.usage,
      toolCalls: firstModelResult.toolCalls.map((call) => call.name)
    });

    let toolCount = preflight.ok ? 1 : 0;
    const toolMessages: ProviderMessage[] = [];
    for (const call of firstModelResult.toolCalls) {
      const result = await dispatcher.execute(call.name, call.args, { solver, config });
      toolCount += 1;
      await this.options.appendMessage(solver.id, "tool", result.content, {
        toolId: result.toolId,
        ok: result.ok,
        error: result.error
      });
      toolMessages.push({
        role: "tool",
        name: result.toolId.replaceAll(".", "_"),
        content: result.content.slice(0, 8000)
      });
    }

    if (toolMessages.length > 0) {
      const followUp = await this.providerRegistry.run({
        config,
        prompt,
        messages: [...providerMessages, { role: "assistant", content: firstModelResult.content }, ...toolMessages],
        tools
      });
      await this.options.publishEvent({
        type: "provider-usage",
        solverId: solver.id,
        message: `${followUp.providerId}/${followUp.modelId}: ${followUp.usage.totalTokens} tokens`,
        payload: { usage: followUp.usage }
      });
      await this.options.appendMessage(solver.id, "assistant", followUp.content, {
        providerId: followUp.providerId,
        modelId: followUp.modelId,
        usage: followUp.usage,
        followUp: true
      });
    }

    await this.options.updateObserver(solver.id, buildObserverState(firstModelResult.content, toolCount));
    return {
      status: "completed",
      summary: firstModelResult.content,
      toolCount
    };
  }
}

function buildObserverState(content: string, toolCount: number): {
  lastSignal: string;
  recommendations: string[];
  driftScore: number;
  contextPressure: number;
} {
  const noProgress = toolCount === 0 || content.trim().length < 24;
  return {
    lastSignal: noProgress ? "low-progress" : "solver-completed",
    driftScore: noProgress ? 0.45 : 0.1,
    contextPressure: Math.min(1, content.length / 12000),
    recommendations: noProgress
      ? ["Narrow the task", "Run a concrete recon command", "Record one memory item before spawning more solvers"]
      : ["Review tool evidence", "Promote useful findings into challenge memory", "Refresh planner next actions"]
  };
}
