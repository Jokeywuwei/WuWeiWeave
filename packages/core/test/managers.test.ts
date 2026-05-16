import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { createDefaultDaemon } from "../src/index";

let cleanupPath: string | undefined;

describe("WuWeiWeave managers", () => {
  afterEach(async () => {
    if (cleanupPath) {
      await rm(cleanupPath, { recursive: true, force: true });
      cleanupPath = undefined;
    }
  });

  it("initializes config, seed challenge, and dashboard state", async () => {
    cleanupPath = await mkdtemp(path.join(os.tmpdir(), "wuweiweave-"));
    const daemon = await createDefaultDaemon(cleanupPath);
    const dashboard = await daemon.getDashboardState();

    expect(dashboard.challengeCount).toBe(1);
    expect(dashboard.solverCount).toBe(0);
    expect(dashboard.workspaceRoot).toBe(cleanupPath);
  });

  it("creates a local solver session with startup artifacts", async () => {
    cleanupPath = await mkdtemp(path.join(os.tmpdir(), "wuweiweave-"));
    const daemon = await createDefaultDaemon(cleanupPath);
    const solver = await daemon.startSolver({
      task: "Inspect seed challenge",
      promptName: "solver-default"
    });

    const messages = await daemon.runtime.getMessages(solver.id);
    expect(solver.status).toBe("completed");
    expect(messages.length).toBeGreaterThan(0);
    expect(await daemon.store.exists(`solvers/${solver.id}/startup-snapshot.json`)).toBe(true);
  });

  it("assigns solvers to challenges and refreshes planner actions", async () => {
    cleanupPath = await mkdtemp(path.join(os.tmpdir(), "wuweiweave-"));
    const daemon = await createDefaultDaemon(cleanupPath);
    const challenge = (await daemon.challenges.listChallenges())[0];

    if (!challenge) {
      throw new Error("Seed challenge missing");
    }

    await daemon.startSolver({
      task: "Generate initial hypotheses",
      promptName: "solver-default",
      challengeId: challenge.id
    });

    const updated = await daemon.challenges.getChallenge(challenge.id);
    expect(updated.solverAssignments.length).toBe(1);
    expect(updated.timeline.length).toBeGreaterThan(1);
  });
});
