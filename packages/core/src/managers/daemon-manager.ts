import { ChallengeManager } from "./challenge-manager";
import { ConfigManager } from "./config-manager";
import { RuntimeManager } from "./runtime-manager";
import { FileStore } from "../storage/file-store";
import type { CreateChallengeInput } from "../types/challenge";
import type { StartSolverInput, SubagentInput } from "../types/runtime";

export interface DashboardState {
  configUpdatedAt: string;
  workspaceRoot: string;
  challengeCount: number;
  activeChallengeCount: number;
  solverCount: number;
  runningSolverCount: number;
}

export class DaemonManager {
  readonly store: FileStore;
  readonly config: ConfigManager;
  readonly challenges: ChallengeManager;
  readonly runtime: RuntimeManager;

  constructor(root?: string) {
    this.store = new FileStore(root);
    this.config = new ConfigManager(this.store);
    this.challenges = new ChallengeManager(this.store);
    this.runtime = new RuntimeManager(this.store, this.config, this.challenges);
  }

  async init(): Promise<void> {
    await this.config.init();
    await this.challenges.init();
    await this.runtime.init();
  }

  async getDashboardState(): Promise<DashboardState> {
    const [config, challenges, solvers] = await Promise.all([
      this.config.getConfig(),
      this.challenges.listChallenges(),
      this.runtime.listSolvers()
    ]);

    return {
      configUpdatedAt: config.updatedAt,
      workspaceRoot: this.store.root,
      challengeCount: challenges.length,
      activeChallengeCount: challenges.filter((challenge) => challenge.status !== "archived").length,
      solverCount: solvers.length,
      runningSolverCount: solvers.filter((solver) => solver.status === "running").length
    };
  }

  async createChallenge(input: CreateChallengeInput) {
    return this.challenges.createChallenge(input);
  }

  async startSolver(input: StartSolverInput) {
    const solver = await this.runtime.startSolver(input);
    if (input.challengeId) {
      await this.challenges.assignSolver(input.challengeId, {
        solverId: solver.id,
        promptId: solver.promptId,
        task: solver.task
      });
      await this.challenges.refreshPlanner(input.challengeId);
    }

    return solver;
  }

  async startSubagent(input: SubagentInput) {
    return this.runtime.startSubagent(input);
  }
}

export async function createDefaultDaemon(root?: string): Promise<DaemonManager> {
  const daemon = new DaemonManager(root);
  await daemon.init();
  return daemon;
}
