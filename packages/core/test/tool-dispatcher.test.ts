import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { createDefaultDaemon, ToolDispatcher } from "../src/index";

let cleanupPath: string | undefined;

describe("ToolDispatcher", () => {
  afterEach(async () => {
    if (cleanupPath) {
      await rm(cleanupPath, { recursive: true, force: true });
      cleanupPath = undefined;
    }
  });

  it("executes filesystem tools inside the solver workspace", async () => {
    cleanupPath = await mkdtemp(path.join(os.tmpdir(), "wuweiweave-tools-"));
    const daemon = await createDefaultDaemon(cleanupPath);
    const solver = await daemon.startSolver({ task: "Prepare workspace" });
    const dispatcher = new ToolDispatcher({ store: daemon.store, challenges: daemon.challenges });
    const config = await daemon.config.getConfig();

    const write = await dispatcher.execute("file.write", { path: "notes/result.txt", content: "ok" }, { solver, config });
    const read = await dispatcher.execute("file.read", { path: "notes/result.txt" }, { solver, config });

    expect(write.ok).toBe(true);
    expect(read.content).toBe("ok");
  });

  it("records challenge memory through a bound solver", async () => {
    cleanupPath = await mkdtemp(path.join(os.tmpdir(), "wuweiweave-tools-"));
    const daemon = await createDefaultDaemon(cleanupPath);
    const challenge = (await daemon.challenges.listChallenges())[0];
    if (!challenge) {
      throw new Error("seed challenge missing");
    }

    const solver = await daemon.startSolver({ task: "Bind challenge", challengeId: challenge.id });
    const dispatcher = new ToolDispatcher({ store: daemon.store, challenges: daemon.challenges });
    const config = await daemon.config.getConfig();

    const result = await dispatcher.execute("challenge.memory", { content: "Port 80 looks interesting" }, { solver, config });
    const updated = await daemon.challenges.getChallenge(challenge.id);

    expect(result.ok).toBe(true);
    expect(updated.memory.some((memory) => memory.content.includes("Port 80"))).toBe(true);
  });

  it("dispatches enabled MCP tools through the same execution path", async () => {
    cleanupPath = await mkdtemp(path.join(os.tmpdir(), "wuweiweave-tools-"));
    const daemon = await createDefaultDaemon(cleanupPath);
    const solver = await daemon.startSolver({ task: "MCP dispatch" });
    const config = await daemon.config.upsertMcpServer({
      id: "mock",
      name: "Mock MCP",
      command: process.execPath,
      args: [path.resolve("scripts/mock-mcp-server.ts")],
      enabled: true,
      env: {},
      timeoutMs: 3000
    });
    const dispatcher = new ToolDispatcher({ store: daemon.store, challenges: daemon.challenges });

    const result = await dispatcher.execute(
      "mcp.mock.call",
      { toolName: "echo", arguments: { value: "hello" } },
      { solver, config }
    );

    expect(result.ok).toBe(true);
    expect(result.content).toContain("mock:echo");
    expect(result.content).toContain("hello");
  });
});
