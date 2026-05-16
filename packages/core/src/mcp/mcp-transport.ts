import type { JsonRpcResponse } from "./mcp-discovery";
import type { McpServerConfig } from "../types/config";

type McpProcess = ReturnType<typeof Bun.spawn<"pipe", "pipe", "pipe">>;

interface PendingRequest {
  resolve: (response: JsonRpcResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export type McpTransportStatus = "starting" | "ready" | "stale" | "closed";

export class LongLivedMcpTransport {
  private proc: McpProcess | undefined;
  private readonly pending = new Map<string, PendingRequest>();
  private outputBuffer = "";
  private status: McpTransportStatus = "closed";
  private lastError: string | undefined;

  constructor(private readonly server: McpServerConfig) {}

  getStatus(): McpTransportStatus {
    return this.status;
  }

  getLastError(): string | undefined {
    return this.lastError;
  }

  async request(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    await this.ensureStarted();
    if (!this.proc) {
      throw new Error(`MCP transport ${this.server.id} is not running`);
    }

    const request = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params
    };

    const timeoutMs = this.server.timeoutMs ?? 5000;
    const response = new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        this.markStale(`MCP server ${this.server.id} timed out after ${timeoutMs}ms`);
        reject(new Error(`MCP server ${this.server.id} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(request.id, { resolve, reject, timer });
    });

    try {
      this.proc.stdin.write(`${JSON.stringify(request)}\n`);
    } catch (error) {
      this.pending.delete(request.id);
      this.markStale(error instanceof Error ? error.message : "MCP stdin write failed");
      throw error;
    }

    return response;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.request("tools/list", {});
      return true;
    } catch {
      return false;
    }
  }

  close(reason = "closed"): void {
    this.status = "closed";
    this.lastError = reason;
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      this.pending.delete(id);
    }

    this.proc?.kill();
    this.proc = undefined;
  }

  private async ensureStarted(): Promise<void> {
    if (this.proc && this.status === "ready") {
      return;
    }

    this.status = "starting";
    this.lastError = undefined;
    this.proc = Bun.spawn({
      cmd: [this.server.command, ...this.server.args],
      env: { ...Bun.env, ...this.server.env },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe"
    }) as McpProcess;
    this.status = "ready";
    void this.readStdout(this.proc.stdout);
    void this.readStderr(this.proc.stderr);
    void this.watchExit(this.proc.exited);
  }

  private async readStdout(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }

        this.outputBuffer += decoder.decode(chunk.value, { stream: true });
        this.flushLines();
      }
    } catch (error) {
      this.markStale(error instanceof Error ? error.message : "MCP stdout read failed");
    }
  }

  private async readStderr(stream: ReadableStream<Uint8Array>): Promise<void> {
    const stderr = await new Response(stream).text().catch(() => "");
    if (stderr.trim().length > 0 && this.status !== "closed") {
      this.lastError = stderr.trim();
    }
  }

  private async watchExit(exited: Promise<number>): Promise<void> {
    const code = await exited.catch(() => -1);
    if (this.status !== "closed") {
      this.markStale(`MCP server ${this.server.id} exited with ${code}`);
    }
  }

  private flushLines(): void {
    while (this.outputBuffer.includes("\n")) {
      const index = this.outputBuffer.indexOf("\n");
      const line = this.outputBuffer.slice(0, index).trim();
      this.outputBuffer = this.outputBuffer.slice(index + 1);
      if (line.length > 0) {
        this.handleLine(line);
      }
    }
  }

  private handleLine(line: string): void {
    let response: JsonRpcResponse;
    try {
      response = JSON.parse(line) as JsonRpcResponse;
    } catch {
      this.lastError = `Invalid MCP response from ${this.server.id}`;
      return;
    }

    const id = typeof response.id === "string" ? response.id : undefined;
    if (!id) {
      return;
    }

    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(id);
    pending.resolve(response);
  }

  private markStale(reason: string): void {
    this.status = "stale";
    this.lastError = reason;
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      this.pending.delete(id);
    }
  }
}
