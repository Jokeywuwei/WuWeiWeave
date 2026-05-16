import * as path from "node:path";

export interface WorkspacePaths {
  root: string;
  config: string;
  challenges: string;
  solvers: string;
  archiveSolvers: string;
  runtime: string;
  prompts: string;
  skills: string;
  logs: string;
}

export function getDefaultWorkspaceRoot(): string {
  const configured = Bun.env.WUWEIWEAVE_HOME;
  if (configured && configured.trim().length > 0) {
    return path.resolve(configured);
  }

  const home = Bun.env.HOME ?? Bun.env.USERPROFILE;
  if (!home) {
    return path.resolve(".wuweiweave");
  }

  return path.join(home, ".wuweiweave");
}

export function createWorkspacePaths(root = getDefaultWorkspaceRoot()): WorkspacePaths {
  return {
    root,
    config: path.join(root, "config"),
    challenges: path.join(root, "challenge"),
    solvers: path.join(root, "solvers"),
    archiveSolvers: path.join(root, "archive-solvers"),
    runtime: path.join(root, "runtime"),
    prompts: path.join(root, "config", "prompts"),
    skills: path.join(root, "config", "skills"),
    logs: path.join(root, "runtime", "logs")
  };
}

export function toStoragePath(root: string, relativePath: string): string {
  const fullPath = path.resolve(root, relativePath);
  const normalizedRoot = path.resolve(root);
  if (fullPath !== normalizedRoot && !fullPath.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Path escapes WuWeiWeave workspace: ${relativePath}`);
  }

  return fullPath;
}
