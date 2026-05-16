import { mkdir } from "node:fs/promises";
import * as path from "node:path";
import { Value } from "@sinclair/typebox/value";
import { toStoragePath } from "../utils/paths";
import { callMcp } from "../mcp/mcp-discovery";
import type { McpSessionPool } from "../mcp/mcp-session-pool";
import type { McpServerConfig } from "../types/config";
import type { ChallengeManager } from "../managers/challenge-manager";
import type { FileStore } from "../storage/file-store";
import type { SystemConfig } from "../types/config";
import type { SolverSession, SubagentInput } from "../types/runtime";
import { BUILTIN_TOOL_DEFINITIONS, McpCallInput } from "./tool-registry";
import type { ToolDefinition } from "./tool-registry";
import type { TSchema } from "@sinclair/typebox";

export interface ToolExecutionContext {
  solver: SolverSession;
  config: SystemConfig;
}

export interface ToolExecutionResult {
  toolId: string;
  ok: boolean;
  content: string;
  data?: unknown;
  error?: string;
}

export interface ToolDispatcherOptions {
  store: FileStore;
  challenges?: ChallengeManager;
  mcpPool?: McpSessionPool;
  launchSubagent?: (input: SubagentInput) => Promise<SolverSession>;
  emit?: (message: string, payload?: Record<string, unknown>) => Promise<void>;
}

export class ToolDispatcher {
  private readonly store: FileStore;
  private readonly challenges: ChallengeManager | undefined;
  private readonly mcpPool: McpSessionPool | undefined;
  private readonly launchSubagent: ((input: SubagentInput) => Promise<SolverSession>) | undefined;
  private readonly emit: ((message: string, payload?: Record<string, unknown>) => Promise<void>) | undefined;

  constructor(options: ToolDispatcherOptions) {
    this.store = options.store;
    this.challenges = options.challenges;
    this.mcpPool = options.mcpPool;
    this.launchSubagent = options.launchSubagent;
    this.emit = options.emit;
  }

  listAvailableDefinitions(config: SystemConfig): ToolDefinition[] {
    const enabledIds = new Set(config.tools.filter((tool) => tool.enabled).map((tool) => tool.id));
    const builtin = BUILTIN_TOOL_DEFINITIONS.filter((definition) => enabledIds.has(definition.id));
    const genericMcp = config.mcpServers
      .filter((server) => server.enabled)
      .map((server): ToolDefinition<typeof McpCallInput> => ({
        id: createMcpToolId(server.id),
        name: `${server.name} MCP call`,
        description: `Call a tool on MCP server ${server.name}.`,
        category: "mcp",
        inputSchema: McpCallInput
      }));
    const discoveredMcp = config.mcpServers
      .filter((server) => server.enabled)
      .flatMap((server) =>
        (config.mcpCapabilities[server.id]?.tools ?? []).map(
          (tool): ToolDefinition => ({
            id: createDiscoveredMcpToolId(server.id, tool.name),
            name: `${server.name}: ${tool.name}`,
            description: tool.description ?? `Call ${tool.name} on MCP server ${server.name}.`,
            category: "mcp",
            inputSchema: (tool.inputSchema ?? { type: "object", additionalProperties: true }) as TSchema
          })
        )
      );
    return [...builtin, ...genericMcp, ...discoveredMcp];
  }

  async execute(toolId: string, args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const dynamicDefinitions = this.listAvailableDefinitions(context.config);
    const definition = dynamicDefinitions.find((candidate) => candidate.id === toolId);
    if (!definition) {
      return failure(toolId, `Tool not found: ${toolId}`);
    }

    const enabled =
      toolId.startsWith("mcp.") || context.config.tools.some((tool) => tool.id === toolId && tool.enabled);
    if (!enabled) {
      return failure(toolId, `Tool is disabled: ${toolId}`);
    }

    if (!Value.Check(definition.inputSchema, args)) {
      return failure(toolId, `Invalid args for ${toolId}`);
    }

    try {
      await this.emit?.(`Running tool ${toolId}`, { toolId, solverId: context.solver.id });
      const result = toolId.startsWith("mcp.")
        ? await this.executeMcpTool(toolId, args, context)
        : await this.executeKnownTool(toolId, args, context);
      await this.emit?.(`Tool ${toolId} completed`, { toolId, solverId: context.solver.id, ok: result.ok });
      return result;
    } catch (error) {
      return failure(toolId, error instanceof Error ? error.message : "Tool execution failed");
    }
  }

  private async executeKnownTool(
    toolId: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    switch (toolId) {
      case "file.read":
        return this.readFile(args, context);
      case "file.write":
      case "file.edit":
        return this.writeFile(toolId, args, context);
      case "shell.run":
      case "grep.search":
      case "find.list":
        return this.runShell(toolId, args, context);
      case "challenge.memory":
        return this.addChallengeMemory(args, context);
      case "challenge.idea":
        return this.addChallengeIdea(args, context);
      case "challenge.submit":
        return this.recordSubmission(args, context);
      case "agent.subagent":
        return this.spawnSubagent(args, context);
      default:
        return failure(toolId, `Tool has no executor: ${toolId}`);
    }
  }

  private async readFile(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const target = workspacePath(context.solver.workspacePath, String(args.path));
    const file = Bun.file(target);
    if (!(await file.exists())) {
      return failure("file.read", `File not found: ${args.path}`);
    }

    const content = await file.text();
    return success("file.read", content, { path: target });
  }

  private async writeFile(
    toolId: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const target = workspacePath(context.solver.workspacePath, String(args.path));
    await mkdir(path.dirname(target), { recursive: true });
    await Bun.write(target, String(args.content));
    return success(toolId, `Wrote ${args.path}`, { path: target });
  }

  private async runShell(
    toolId: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    if (!context.config.host.allowShellTools) {
      return failure(toolId, "Shell tools are disabled by host settings");
    }

    const command = String(args.command);
    const cwd = args.cwd ? workspacePath(context.solver.workspacePath, String(args.cwd)) : context.solver.workspacePath;
    const proc = Bun.spawn({
      cmd: process.platform === "win32" ? ["powershell", "-NoProfile", "-Command", command] : ["bash", "-lc", command],
      cwd,
      stdout: "pipe",
      stderr: "pipe"
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ]);
    const content = stdout.trim().length > 0 ? stdout : stderr;
    return {
      toolId,
      ok: exitCode === 0,
      content,
      data: { exitCode, cwd },
      ...(exitCode === 0 ? {} : { error: stderr.trim() || `Command exited with ${exitCode}` })
    };
  }

  private async addChallengeMemory(
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const challengeId = String(args.challengeId || context.solver.challengeId || "");
    if (!challengeId || !this.challenges) {
      return failure("challenge.memory", "Challenge manager or challengeId is missing");
    }

    const challenge = await this.challenges.appendMemory(challengeId, String(args.content), "solver");
    return success("challenge.memory", "Memory recorded", { challengeId: challenge.id, memoryCount: challenge.memory.length });
  }

  private async addChallengeIdea(
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const challengeId = String(args.challengeId || context.solver.challengeId || "");
    if (!challengeId || !this.challenges) {
      return failure("challenge.idea", "Challenge manager or challengeId is missing");
    }

    const content = String(args.content);
    const [firstLine, ...rest] = content.split("\n");
    const challenge = await this.challenges.addIdea(challengeId, {
      title: firstLine?.trim() || "Solver idea",
      rationale: rest.join("\n").trim() || content
    });
    return success("challenge.idea", "Idea recorded", { challengeId: challenge.id, ideaCount: challenge.ideas.length });
  }

  private async recordSubmission(
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const challengeId = String(args.challengeId || context.solver.challengeId || "");
    if (!challengeId || !this.challenges) {
      return failure("challenge.submit", "Challenge manager or challengeId is missing");
    }

    const challenge = await this.challenges.recordSubmission(challengeId, {
      payload: String(args.content),
      accepted: false,
      response: "Recorded by tool dispatcher; external judge integration is not configured.",
      solverId: context.solver.id
    });
    return success("challenge.submit", "Submission recorded", {
      challengeId: challenge.id,
      submissionCount: challenge.submissions.length
    });
  }

  private async spawnSubagent(
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    if (!this.launchSubagent) {
      return failure("agent.subagent", "Subagent launcher is not configured");
    }

    const subagent = await this.launchSubagent({
      task: String(args.task),
      promptName: args.promptName ? String(args.promptName) : context.solver.promptId,
      parentSolverId: context.solver.id,
      ...(context.solver.challengeId ? { challengeId: context.solver.challengeId } : {})
    });
    return success("agent.subagent", `Subagent ${subagent.id} started`, subagent);
  }

  private async executeMcpTool(
    toolId: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const parsedId = parseMcpToolId(toolId);
    const serverId = parsedId.serverId;
    const server = context.config.mcpServers.find((candidate) => candidate.id === serverId && candidate.enabled);
    if (!server) {
      return failure(toolId, `MCP server is not enabled or missing: ${serverId}`);
    }

    const toolName = parsedId.toolName ?? String(args.toolName);
    const toolArgs = parsedId.toolName ? args : isRecord(args.arguments) ? args.arguments : {};
    const result = await callMcpServer(server, toolName, toolArgs, this.mcpPool);
    return result.ok
      ? success(toolId, result.content, result.data)
      : failure(toolId, result.content);
  }
}

function workspacePath(workspaceRoot: string, relativePath: string): string {
  return toStoragePath(workspaceRoot, relativePath);
}

function success(toolId: string, content: string, data?: unknown): ToolExecutionResult {
  return {
    toolId,
    ok: true,
    content,
    ...(data === undefined ? {} : { data })
  };
}

function failure(toolId: string, error: string): ToolExecutionResult {
  return {
    toolId,
    ok: false,
    content: error,
    error
  };
}

function createMcpToolId(serverId: string): string {
  return `mcp.${serverId}.call`;
}

function createDiscoveredMcpToolId(serverId: string, toolName: string): string {
  return `mcp.${serverId}.${sanitizeToolId(toolName)}`;
}

function parseMcpToolId(toolId: string): { serverId: string; toolName?: string } {
  const generic = /^mcp\.([^.]+)\.call$/.exec(toolId);
  if (generic?.[1]) {
    return { serverId: generic[1] };
  }

  const discovered = /^mcp\.([^.]+)\.(.+)$/.exec(toolId);
  if (discovered?.[1] && discovered[2]) {
    return { serverId: discovered[1], toolName: unsanitizeToolId(discovered[2]) };
  }

  throw new Error(`Invalid MCP tool id: ${toolId}`);
}

function sanitizeToolId(toolName: string): string {
  return encodeURIComponent(toolName).replaceAll(".", "%2E");
}

function unsanitizeToolId(value: string): string {
  return decodeURIComponent(value);
}

async function callMcpServer(
  server: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
  pool?: McpSessionPool
): Promise<{ ok: boolean; content: string; data?: unknown }> {
  if (pool) {
    try {
      const response = await pool.requestRpc(server, "tools/call", {
        name: toolName,
        arguments: args
      });
      return response.error
        ? { ok: false, content: JSON.stringify(response.error), data: response }
        : { ok: true, content: extractMcpText(response), data: response };
    } catch (error) {
      return {
        ok: false,
        content: error instanceof Error ? error.message : "MCP pooled request failed"
      };
    }
  }

  const proc = Bun.spawn({
    cmd: [server.command, ...server.args],
    env: { ...Bun.env, ...server.env },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe"
  });
  const request = {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "tools/call",
    params: {
      name: toolName,
      arguments: args
    }
  };

  proc.stdin.write(`${JSON.stringify(request)}\n`);
  proc.stdin.end();

  const timeoutMs = server.timeoutMs ?? 5000;
  const timeout = new Promise<"timeout">((resolve) => {
    setTimeout(() => resolve("timeout"), timeoutMs);
  });
  const output = Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  const result = await Promise.race([output, timeout]);

  if (result === "timeout") {
    proc.kill();
    return {
      ok: false,
      content: `MCP server ${server.id} timed out after ${timeoutMs}ms`
    };
  }

  const [stdout, stderr, exitCode] = result;
  if (exitCode !== 0) {
    return {
      ok: false,
      content: stderr.trim() || `MCP server ${server.id} exited with ${exitCode}`
    };
  }

  const line = stdout
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.length > 0);
  if (!line) {
    return {
      ok: true,
      content: "",
      data: { stdout }
    };
  }

  const parsed = JSON.parse(line) as unknown;
  const content = extractMcpText(parsed);
  return {
    ok: true,
    content,
    data: parsed
  };
}

function extractMcpText(value: unknown): string {
  if (!isRecord(value)) {
    return String(value);
  }

  if ("error" in value) {
    return JSON.stringify(value.error);
  }

  const result = value.result;
  if (!isRecord(result)) {
    return JSON.stringify(value);
  }

  const content = result.content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (isRecord(item) && typeof item.text === "string") {
          return item.text;
        }

        return JSON.stringify(item);
      })
      .join("\n");
  }

  return JSON.stringify(result);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
