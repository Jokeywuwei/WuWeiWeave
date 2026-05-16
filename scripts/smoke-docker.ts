import { createDefaultDaemon } from "@wuweiweave/core";

const tag = Bun.argv[2] ?? "wuweiweave/solver-runtime:local";

let dockerOut = "";
let dockerErr = "";
let dockerCode = 1;
try {
  const dockerCheck = Bun.spawn({
    cmd: ["docker", "--version"],
    stdout: "pipe",
    stderr: "pipe"
  });
  [dockerOut, dockerErr, dockerCode] = await Promise.all([
    new Response(dockerCheck.stdout).text(),
    new Response(dockerCheck.stderr).text(),
    dockerCheck.exited
  ]);
} catch (error) {
  dockerErr = error instanceof Error ? error.message : "docker check failed";
}

if (dockerCode !== 0) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        skipped: true,
        reason: dockerErr.trim() || "Docker is not available on PATH.",
        expected: [
          "Install and start Docker",
          `Run: bun run docker:build ${tag}`,
          "Run: bun run smoke:docker"
        ]
      },
      null,
      2
    )
  );
  process.exit(0);
}

console.log(dockerOut.trim());

const build = Bun.spawn({
  cmd: ["docker", "build", "-t", tag, "-f", "Dockerfile", "."],
  stdout: "inherit",
  stderr: "inherit"
});
const buildCode = await build.exited;
if (buildCode !== 0) {
  process.exit(buildCode);
}

const daemon = await createDefaultDaemon(Bun.env.WUWEIWEAVE_HOME);
const config = await daemon.config.getConfig();
await daemon.config.updateHost({
  ...config.host,
  defaultRuntimeImage: tag
});

const queued = await daemon.runtime.enqueueSolverTask({
  task: "Docker runtime handshake smoke",
  promptName: "solver-default",
  runtimeMode: "docker",
  startContainer: true
});
const scheduled = await daemon.runtime.runScheduler();
const task = scheduled.tasks.find((candidate) => candidate.id === queued.id);
const solverId = task?.solverId;
if (!solverId) {
  console.error("Docker scheduler did not produce a solver id");
  process.exit(1);
}

const solver = await daemon.runtime.getSolver(solverId);

if (solver.containerId) {
  const exec = Bun.spawn({
    cmd: ["docker", "exec", solver.containerId, "bash", "-lc", "echo docker-tool-ok > /workspace/docker-tool.txt"],
    stdout: "pipe",
    stderr: "pipe"
  });
  const [, execErr, execCode] = await Promise.all([
    new Response(exec.stdout).text(),
    new Response(exec.stderr).text(),
    exec.exited
  ]);
  if (execCode !== 0) {
    console.error(execErr.trim() || `docker exec exited with ${execCode}`);
    process.exit(execCode);
  }
}

const hasSnapshot = await daemon.store.exists(`solvers/${solver.id}/startup-snapshot.json`);
const hasRpc = await daemon.store.exists(`solvers/${solver.id}/workspace/runtime-rpc.jsonl`);
const hasHandshake = await Bun.file(`${solver.workspacePath}/.wuweiweave-runtime/events.jsonl`).exists();
const hasToolArtifact = await Bun.file(`${solver.workspacePath}/docker-tool.txt`).exists();
const stopped = await daemon.runtime.stopSolver(solver.id);
await daemon.runtime.archiveSolver(solver.id);

console.log(
  JSON.stringify(
    {
      ok: solver.status === "running" && hasSnapshot && hasRpc && hasHandshake && hasToolArtifact && stopped.status === "stopped",
      solverId: solver.id,
      status: solver.status,
      containerId: solver.containerId,
      scheduler: scheduled.decisions,
      workers: scheduled.workers,
      artifacts: {
        startupSnapshot: hasSnapshot,
        runtimeRpc: hasRpc,
        runtimeHandshake: hasHandshake,
        toolArtifact: hasToolArtifact
      },
      archived: true
    },
    null,
    2
  )
);

if (solver.status !== "running" || !hasSnapshot || !hasRpc || !hasHandshake || !hasToolArtifact) {
  process.exit(1);
}
