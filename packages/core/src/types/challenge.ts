export type ChallengeStatus = "draft" | "active" | "solving" | "solved" | "archived";
export type PlannerStatus = "idle" | "planning" | "dispatching" | "observing" | "blocked";

export interface ChallengeMemory {
  id: string;
  createdAt: string;
  author: "manager" | "solver" | "observer" | "user";
  content: string;
}

export interface ChallengeIdea {
  id: string;
  createdAt: string;
  title: string;
  rationale: string;
  confidence: number;
  status: "open" | "testing" | "accepted" | "rejected";
}

export interface AttemptLog {
  id: string;
  createdAt: string;
  solverId?: string;
  action: string;
  result: string;
  evidence: string[];
}

export interface SubmissionLog {
  id: string;
  createdAt: string;
  solverId?: string;
  payload: string;
  accepted: boolean;
  response: string;
}

export interface SolverAssignment {
  id: string;
  createdAt: string;
  solverId: string;
  promptId: string;
  task: string;
  status: "assigned" | "running" | "completed" | "failed";
}

export interface ChallengeTimelineEvent {
  id: string;
  createdAt: string;
  type: "created" | "memory" | "idea" | "attempt" | "submission" | "assignment" | "planner";
  title: string;
  body: string;
}

export interface PlannerState {
  strategy: "breadth-first" | "hypothesis-driven" | "manual";
  status: PlannerStatus;
  nextActions: string[];
  updatedAt: string;
}

export interface ChallengeState {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  status: ChallengeStatus;
  createdAt: string;
  updatedAt: string;
  memory: ChallengeMemory[];
  ideas: ChallengeIdea[];
  attempts: AttemptLog[];
  submissions: SubmissionLog[];
  solverAssignments: SolverAssignment[];
  planner: PlannerState;
  timeline: ChallengeTimelineEvent[];
}

export interface CreateChallengeInput {
  title: string;
  description: string;
  category?: string;
  tags?: string[];
}
