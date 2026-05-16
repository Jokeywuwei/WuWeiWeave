export interface DockerRunPlan {
  image: string;
  name: string;
  workspacePath: string;
  command: string[];
  env: Record<string, string>;
}

export interface DockerRunResult {
  ok: boolean;
  containerId?: string;
  message: string;
}

export interface DockerStopResult {
  ok: boolean;
  message: string;
}

export function createDockerRunPlan(input: {
  image: string;
  solverId: string;
  workspacePath: string;
  command?: string[];
}): DockerRunPlan {
  return {
    image: input.image,
    name: `wuweiweave-${input.solverId}`,
    workspacePath: input.workspacePath,
    command:
      input.command ?? [
        "bash",
        "-lc",
        [
          "mkdir -p /workspace/.wuweiweave-runtime",
          `printf '%s\\n' '{\"type\":\"runtime-ready\",\"solverId\":\"${input.solverId}\",\"transport\":\"jsonl\"}' >> /workspace/.wuweiweave-runtime/events.jsonl`,
          "while true; do sleep 2; done"
        ].join(" && ")
      ],
    env: {
      WUWEIWEAVE_SOLVER_ID: input.solverId
    }
  };
}

export async function runDockerContainer(plan: DockerRunPlan): Promise<DockerRunResult> {
  try {
    const envArgs = Object.entries(plan.env).flatMap(([key, value]) => ["-e", `${key}=${value}`]);
    const proc = Bun.spawn({
      cmd: [
        "docker",
        "run",
        "-d",
        "--rm",
        "--name",
        plan.name,
        "-v",
        `${plan.workspacePath}:/workspace`,
        ...envArgs,
        plan.image,
        ...plan.command
      ],
      stdout: "pipe",
      stderr: "pipe"
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ]);

    if (exitCode !== 0) {
      return {
        ok: false,
        message: stderr.trim() || `docker run exited with ${exitCode}`
      };
    }

    return {
      ok: true,
      containerId: stdout.trim(),
      message: "Docker solver runtime started"
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? `Docker runtime failed to start. Is Docker installed and running? ${error.message}`
          : "Docker runtime failed to start. Is Docker installed and running?"
    };
  }
}

export async function stopDockerContainer(containerIdOrName: string): Promise<DockerStopResult> {
  try {
    const proc = Bun.spawn({
      cmd: ["docker", "stop", containerIdOrName],
      stdout: "pipe",
      stderr: "pipe"
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ]);

    if (exitCode !== 0) {
      return {
        ok: false,
        message: stderr.trim() || `docker stop exited with ${exitCode}`
      };
    }

    return {
      ok: true,
      message: stdout.trim() || `Stopped ${containerIdOrName}`
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? `Docker runtime failed to stop. Is Docker installed and running? ${error.message}`
          : "Docker runtime failed to stop. Is Docker installed and running?"
    };
  }
}
