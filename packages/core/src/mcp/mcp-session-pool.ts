import { discoverMcpCapabilities } from "./mcp-discovery";
import { LongLivedMcpTransport } from "./mcp-transport";
import type { McpServerConfig } from "../types/config";
import type { JsonRpcResponse } from "./mcp-discovery";

export interface McpSession {
  serverId: string;
  createdAt: string;
  lastUsedAt: string;
  calls: number;
  status: "ready" | "stale" | "closed";
  reconnects: number;
  failures: number;
  lastError?: string;
}

export class McpSessionPool {
  private readonly sessions = new Map<string, McpSession>();
  private readonly transports = new Map<string, LongLivedMcpTransport>();

  getSnapshot(): McpSession[] {
    return [...this.sessions.values()];
  }

  async request(server: McpServerConfig, method: string, params: Record<string, unknown>): Promise<unknown> {
    const response = await this.requestRpc(server, method, params);
    if (response.error) {
      throw new Error(JSON.stringify(response.error));
    }

    return response.result ?? {};
  }

  async requestRpc(server: McpServerConfig, method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    const session = this.touch(server.id);
    try {
      const response = await this.getTransport(server).request(method, params);
      this.recordSuccess(server.id, session);
      return response;
    } catch (error) {
      this.recordFailure(server.id, session, error instanceof Error ? error.message : "MCP request failed");
      this.invalidate(server.id);
      const reconnected = this.touch(server.id);
      const response = await this.getTransport(server).request(method, params);
      this.recordSuccess(server.id, {
        ...reconnected,
        reconnects: reconnected.reconnects + 1
      });
      return response;
    }
  }

  async discoverCapabilities(server: McpServerConfig) {
    return discoverMcpCapabilities(server, (candidate, method, params) => this.requestRpc(candidate, method, params));
  }

  async healthCheck(server: McpServerConfig): Promise<boolean> {
    const session = this.touch(server.id);
    try {
      const ok = await this.getTransport(server).healthCheck();
      if (ok) {
        this.recordSuccess(server.id, session);
      }
      return ok;
    } catch (error) {
      this.recordFailure(server.id, session, error instanceof Error ? error.message : "MCP health check failed");
      return false;
    }
  }

  invalidate(serverId: string): void {
    this.transports.get(serverId)?.close("session invalidated");
    this.transports.delete(serverId);
    const session = this.touch(serverId);
    this.sessions.set(serverId, {
      ...session,
      status: "closed",
      lastUsedAt: new Date().toISOString()
    });
  }

  invalidateIdle(maxIdleMs: number): number {
    const now = Date.now();
    let removed = 0;
    for (const [serverId, session] of this.sessions.entries()) {
      const lastUsed = Date.parse(session.lastUsedAt);
      if (!Number.isNaN(lastUsed) && now - lastUsed > maxIdleMs) {
        this.invalidate(serverId);
        removed += 1;
      }
    }

    return removed;
  }

  closeAll(): void {
    for (const serverId of this.transports.keys()) {
      this.invalidate(serverId);
    }
  }

  private touch(serverId: string): McpSession {
    const existing = this.sessions.get(serverId);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const created: McpSession = {
      serverId,
      createdAt: now,
      lastUsedAt: now,
      calls: 0,
      status: "ready",
      reconnects: 0,
      failures: 0
    };
    this.sessions.set(serverId, created);
    return created;
  }

  private getTransport(server: McpServerConfig): LongLivedMcpTransport {
    const existing = this.transports.get(server.id);
    if (existing && existing.getStatus() === "ready") {
      return existing;
    }

    const next = new LongLivedMcpTransport(server);
    this.transports.set(server.id, next);
    return next;
  }

  private recordSuccess(serverId: string, session: McpSession): void {
    this.sessions.set(serverId, {
      ...session,
      calls: session.calls + 1,
      status: "ready",
      lastUsedAt: new Date().toISOString()
    });
  }

  private recordFailure(serverId: string, session: McpSession, message: string): void {
    this.sessions.set(serverId, {
      ...session,
      failures: session.failures + 1,
      status: "stale",
      lastUsedAt: new Date().toISOString(),
      lastError: message
    });
  }
}

export class McpCapabilityRefreshScheduler {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly refresh: () => Promise<void>) {}

  start(intervalMs: number): void {
    this.stop();
    this.timer = setInterval(() => {
      void this.refresh();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
