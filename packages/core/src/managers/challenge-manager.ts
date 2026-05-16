import { createId, slugifyId } from "../utils/id";
import { planChallengeNextActions } from "../agent/roles";
import type {
  AttemptLog,
  ChallengeIdea,
  ChallengeMemory,
  ChallengeState,
  ChallengeTimelineEvent,
  CreateChallengeInput,
  SolverAssignment,
  SubmissionLog
} from "../types/challenge";
import type { FileStore } from "../storage/file-store";

export class ChallengeManager {
  constructor(private readonly store: FileStore) {}

  async init(): Promise<void> {
    await this.store.ensureWorkspace();
    const challenges = await this.listChallenges();
    if (challenges.length === 0) {
      await this.createChallenge({
        title: "Welcome CTF Challenge",
        description: "A seed challenge used to verify WuWeiWeave storage, planning, and runtime wiring.",
        category: "warmup",
        tags: ["seed", "ctf"]
      });
    }
  }

  async listChallenges(): Promise<ChallengeState[]> {
    return this.store.listJson<ChallengeState>("challenge");
  }

  async getChallenge(id: string): Promise<ChallengeState> {
    const challenge = await this.store.readJson<ChallengeState | undefined>(`challenge/${id}.json`, undefined);
    if (!challenge) {
      throw new Error(`Challenge not found: ${id}`);
    }

    return challenge;
  }

  async createChallenge(input: CreateChallengeInput): Promise<ChallengeState> {
    const now = new Date().toISOString();
    const id = `${slugifyId(input.title)}-${createId("chal").split("-").slice(-1)[0]}`;
    const event = this.createTimelineEvent("created", "Challenge created", input.description);
    const challenge: ChallengeState = {
      id,
      title: input.title,
      description: input.description,
      category: input.category ?? "general",
      tags: input.tags ?? [],
      status: "active",
      createdAt: now,
      updatedAt: now,
      memory: [],
      ideas: [],
      attempts: [],
      submissions: [],
      solverAssignments: [],
      planner: {
        strategy: "hypothesis-driven",
        status: "idle",
        nextActions: ["Create initial solver task", "Capture target facts"],
        updatedAt: now
      },
      timeline: [event]
    };

    await this.save(challenge);
    return challenge;
  }

  async appendMemory(id: string, content: string, author: ChallengeMemory["author"] = "user"): Promise<ChallengeState> {
    const challenge = await this.getChallenge(id);
    const memory: ChallengeMemory = {
      id: createId("mem"),
      createdAt: new Date().toISOString(),
      author,
      content
    };

    return this.saveWithTimeline(
      {
        ...challenge,
        memory: [...challenge.memory, memory]
      },
      this.createTimelineEvent("memory", `Memory from ${author}`, content)
    );
  }

  async addIdea(
    id: string,
    input: Pick<ChallengeIdea, "title" | "rationale"> & Partial<Pick<ChallengeIdea, "confidence">>
  ): Promise<ChallengeState> {
    const challenge = await this.getChallenge(id);
    const idea: ChallengeIdea = {
      id: createId("idea"),
      createdAt: new Date().toISOString(),
      title: input.title,
      rationale: input.rationale,
      confidence: input.confidence ?? 0.5,
      status: "open"
    };

    return this.saveWithTimeline(
      {
        ...challenge,
        ideas: [...challenge.ideas, idea]
      },
      this.createTimelineEvent("idea", idea.title, idea.rationale)
    );
  }

  async recordAttempt(
    id: string,
    input: Pick<AttemptLog, "action" | "result"> & Partial<Pick<AttemptLog, "solverId" | "evidence">>
  ): Promise<ChallengeState> {
    const challenge = await this.getChallenge(id);
    const attempt: AttemptLog = {
      id: createId("attempt"),
      createdAt: new Date().toISOString(),
      action: input.action,
      result: input.result,
      evidence: input.evidence ?? [],
      ...(input.solverId ? { solverId: input.solverId } : {})
    };

    return this.saveWithTimeline(
      {
        ...challenge,
        attempts: [...challenge.attempts, attempt]
      },
      this.createTimelineEvent("attempt", attempt.action, attempt.result)
    );
  }

  async recordSubmission(
    id: string,
    input: Pick<SubmissionLog, "payload" | "accepted" | "response"> & Partial<Pick<SubmissionLog, "solverId">>
  ): Promise<ChallengeState> {
    const challenge = await this.getChallenge(id);
    const submission: SubmissionLog = {
      id: createId("submit"),
      createdAt: new Date().toISOString(),
      payload: input.payload,
      accepted: input.accepted,
      response: input.response,
      ...(input.solverId ? { solverId: input.solverId } : {})
    };

    return this.saveWithTimeline(
      {
        ...challenge,
        status: submission.accepted ? "solved" : challenge.status,
        submissions: [...challenge.submissions, submission]
      },
      this.createTimelineEvent(
        "submission",
        submission.accepted ? "Accepted submission" : "Rejected submission",
        submission.response
      )
    );
  }

  async assignSolver(
    id: string,
    assignment: Pick<SolverAssignment, "solverId" | "promptId" | "task">
  ): Promise<ChallengeState> {
    const challenge = await this.getChallenge(id);
    const solverAssignment: SolverAssignment = {
      id: createId("assign"),
      createdAt: new Date().toISOString(),
      solverId: assignment.solverId,
      promptId: assignment.promptId,
      task: assignment.task,
      status: "assigned"
    };

    return this.saveWithTimeline(
      {
        ...challenge,
        status: "solving",
        solverAssignments: [...challenge.solverAssignments, solverAssignment]
      },
      this.createTimelineEvent("assignment", `Assigned ${assignment.solverId}`, assignment.task)
    );
  }

  async refreshPlanner(id: string): Promise<ChallengeState> {
    const challenge = await this.getChallenge(id);
    return this.saveWithTimeline(
      {
        ...challenge,
        planner: {
          ...challenge.planner,
          status: "planning",
          nextActions: planChallengeNextActions(challenge),
          updatedAt: new Date().toISOString()
        }
      },
      this.createTimelineEvent("planner", "Planner refreshed", "Next actions updated from current challenge state.")
    );
  }

  async summarizeChallenge(id: string): Promise<string> {
    const challenge = await this.getChallenge(id);
    const accepted = challenge.submissions.find((submission) => submission.accepted);
    return [
      `Challenge: ${challenge.title}`,
      `Status: ${challenge.status}`,
      `Category: ${challenge.category}`,
      `Memory items: ${challenge.memory.length}`,
      `Ideas: ${challenge.ideas.length}`,
      `Attempts: ${challenge.attempts.length}`,
      `Submissions: ${challenge.submissions.length}`,
      accepted ? `Accepted submission: ${accepted.payload}` : "Accepted submission: none",
      `Next actions: ${challenge.planner.nextActions.join("; ")}`
    ].join("\n");
  }

  private async saveWithTimeline(
    challenge: ChallengeState,
    event: ChallengeTimelineEvent
  ): Promise<ChallengeState> {
    return this.save({
      ...challenge,
      updatedAt: new Date().toISOString(),
      timeline: [...challenge.timeline, event]
    });
  }

  private async save(challenge: ChallengeState): Promise<ChallengeState> {
    const next = {
      ...challenge,
      updatedAt: new Date().toISOString()
    };
    await this.store.writeJson(`challenge/${next.id}.json`, next);
    return next;
  }

  private createTimelineEvent(
    type: ChallengeTimelineEvent["type"],
    title: string,
    body: string
  ): ChallengeTimelineEvent {
    return {
      id: createId("time"),
      createdAt: new Date().toISOString(),
      type,
      title,
      body
    };
  }
}
