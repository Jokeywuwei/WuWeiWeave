import type { McpServerConfig } from "@wuweiweave/core";

export interface McpLaunchDescriptor {
  id: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export function createMcpLaunchDescriptors(servers: McpServerConfig[]): McpLaunchDescriptor[] {
  return servers
    .filter((server) => server.enabled)
    .map((server) => ({
      id: server.id,
      command: server.command,
      args: server.args,
      env: server.env
    }));
}

export function describeMcpServer(server: McpServerConfig): string {
  const args = server.args.length > 0 ? ` ${server.args.join(" ")}` : "";
  return `${server.name}: ${server.command}${args}`;
}
