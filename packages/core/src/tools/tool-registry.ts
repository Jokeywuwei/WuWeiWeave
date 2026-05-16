import { Type } from "@sinclair/typebox";
import type { Static, TSchema } from "@sinclair/typebox";
import type { ToolConfig } from "../types/config";

export interface ToolDefinition<TInput extends TSchema = TSchema> {
  id: string;
  name: string;
  description: string;
  category: ToolConfig["category"];
  inputSchema: TInput;
}

export const FileReadInput = Type.Object({
  path: Type.String()
});

export const FileWriteInput = Type.Object({
  path: Type.String(),
  content: Type.String()
});

export const ShellInput = Type.Object({
  command: Type.String(),
  cwd: Type.Optional(Type.String())
});

export const ChallengeNoteInput = Type.Object({
  challengeId: Type.Optional(Type.String()),
  content: Type.String()
});

export const SubagentInputSchema = Type.Object({
  task: Type.String(),
  promptName: Type.Optional(Type.String())
});

export const McpCallInput = Type.Object({
  toolName: Type.String(),
  arguments: Type.Optional(Type.Record(Type.String(), Type.Unknown()))
});

export type FileReadInput = Static<typeof FileReadInput>;
export type FileWriteInput = Static<typeof FileWriteInput>;
export type ShellInput = Static<typeof ShellInput>;
export type ChallengeNoteInput = Static<typeof ChallengeNoteInput>;
export type SubagentInputSchema = Static<typeof SubagentInputSchema>;
export type McpCallInput = Static<typeof McpCallInput>;

export const BUILTIN_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    id: "file.read",
    name: "Read file",
    description: "Read a file from the solver workspace.",
    category: "filesystem",
    inputSchema: FileReadInput
  },
  {
    id: "file.write",
    name: "Write file",
    description: "Write a file into the solver workspace.",
    category: "filesystem",
    inputSchema: FileWriteInput
  },
  {
    id: "file.edit",
    name: "Edit file",
    description: "Apply a bounded textual edit to a workspace file.",
    category: "filesystem",
    inputSchema: FileWriteInput
  },
  {
    id: "shell.run",
    name: "Run shell",
    description: "Run a shell command in the isolated solver runtime.",
    category: "shell",
    inputSchema: ShellInput
  },
  {
    id: "grep.search",
    name: "Search text",
    description: "Search files using grep-compatible patterns.",
    category: "filesystem",
    inputSchema: ShellInput
  },
  {
    id: "find.list",
    name: "Find files",
    description: "List files and directories in the solver workspace.",
    category: "filesystem",
    inputSchema: ShellInput
  },
  {
    id: "challenge.memory",
    name: "Add memory",
    description: "Persist a challenge memory note.",
    category: "challenge",
    inputSchema: ChallengeNoteInput
  },
  {
    id: "challenge.idea",
    name: "Add idea",
    description: "Persist a challenge hypothesis or idea.",
    category: "challenge",
    inputSchema: ChallengeNoteInput
  },
  {
    id: "challenge.submit",
    name: "Submit flag",
    description: "Record a challenge submission attempt.",
    category: "challenge",
    inputSchema: ChallengeNoteInput
  },
  {
    id: "agent.subagent",
    name: "Spawn subagent",
    description: "Delegate a bounded task to a subagent session.",
    category: "agent",
    inputSchema: SubagentInputSchema
  }
];

export function createDefaultToolConfigs(): ToolConfig[] {
  return BUILTIN_TOOL_DEFINITIONS.map((tool) => ({
    id: tool.id,
    name: tool.name,
    description: tool.description,
    enabled: true,
    category: tool.category
  }));
}
