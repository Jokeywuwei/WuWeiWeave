import type { ChallengeState } from "../types/challenge";
import type { AgentRole } from "../types/runtime";

export interface AgentRoleDefinition {
  role: AgentRole;
  mission: string;
  responsibilities: string[];
}

export const AGENT_ROLES: AgentRoleDefinition[] = [
  {
    role: "manager",
    mission: "Coordinate challenge progress, assign solver work, and decide when to expand or stop.",
    responsibilities: [
      "Maintain the global challenge rhythm",
      "Split hypotheses into solver tasks",
      "Aggregate evidence and submissions",
      "Escalate stalled work to observer review"
    ]
  },
  {
    role: "solver",
    mission: "Execute concrete technical tasks with tools, skills, prompts, and runtime isolation.",
    responsibilities: [
      "Explore one attack path at a time",
      "Record attempts and evidence",
      "Use configured tools and MCP servers",
      "Keep workspace artifacts reproducible"
    ]
  },
  {
    role: "observer",
    mission: "Watch solver health and correct drift, runaway context growth, and unproductive loops.",
    responsibilities: [
      "Score drift and context pressure",
      "Suggest smaller next steps",
      "Capture runtime warnings",
      "Preserve useful state for replay"
    ]
  },
  {
    role: "subagent",
    mission: "Handle a bounded branch of solver work delegated by a solver or manager.",
    responsibilities: [
      "Stay within the assigned task scope",
      "Return concise findings",
      "Avoid overwriting parent artifacts",
      "Record subthread messages"
    ]
  }
];

export function planChallengeNextActions(challenge: ChallengeState): string[] {
  if (challenge.submissions.some((submission) => submission.accepted)) {
    return ["Archive solved evidence", "Prepare final write-up"];
  }

  if (challenge.ideas.length === 0) {
    return ["Generate initial hypotheses", "Assign one solver to reconnaissance"];
  }

  const openIdeas = challenge.ideas.filter((idea) => idea.status === "open");
  if (openIdeas.length > 0) {
    return openIdeas.slice(0, 3).map((idea) => `Test idea: ${idea.title}`);
  }

  return ["Review failed attempts", "Ask observer to identify drift", "Create a narrower solver task"];
}
