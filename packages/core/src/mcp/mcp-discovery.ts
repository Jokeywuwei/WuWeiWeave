import type {
  McpCapabilityPrompt,
  McpCapabilityResource,
  McpCapabilitySnapshot,
  McpCapabilityTool,
  McpServerConfig
} from "../types/config";

export interface JsonRpcResponse {
  id?: string;
  result?: unknown;
  error?: unknown;
}

export type McpRequester = (
  server: McpServerConfig,
  method: string,
  params: Record<string, unknown>
) => Promise<JsonRpcResponse>;

export async function discoverMcpCapabilities(
  server: McpServerConfig,
  requester: McpRequester = callMcp
): Promise<McpCapabilitySnapshot> {
  const discoveredAt = new Date().toISOString();
  try {
    const tools = await callMcpList<McpCapabilityTool>(server, "tools/list", "tools", requester);
    const resources = await callMcpList<McpCapabilityResource>(server, "resources/list", "resources", requester);
    const prompts = await callMcpList<McpCapabilityPrompt>(server, "prompts/list", "prompts", requester);

    return {
      serverId: server.id,
      discoveredAt,
      ok: true,
      tools,
      resources,
      prompts
    };
  } catch (error) {
    return {
      serverId: server.id,
      discoveredAt,
      ok: false,
      error: error instanceof Error ? error.message : "MCP discovery failed",
      tools: [],
      resources: [],
      prompts: []
    };
  }
}

async function callMcpList<T>(
  server: McpServerConfig,
  method: string,
  key: string,
  requester: McpRequester
): Promise<T[]> {
  const response = await requester(server, method, {});
  if (response.error) {
    throw new Error(JSON.stringify(response.error));
  }

  if (!isRecord(response.result)) {
    return [];
  }

  const value = response.result[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function callMcp(server: McpServerConfig, method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
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
    method,
    params
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
    throw new Error(`MCP server ${server.id} timed out after ${timeoutMs}ms`);
  }

  const [stdout, stderr, exitCode] = result;
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `MCP server ${server.id} exited with ${exitCode}`);
  }

  const line = stdout
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.length > 0);
  if (!line) {
    return { id: request.id, result: {} };
  }

  return JSON.parse(line) as JsonRpcResponse;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
