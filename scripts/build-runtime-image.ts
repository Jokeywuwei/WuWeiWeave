const tag = Bun.argv[2] ?? "wuweiweave/solver-runtime:local";

const proc = Bun.spawn({
  cmd: ["docker", "build", "-t", tag, "-f", "Dockerfile", "."],
  stdout: "inherit",
  stderr: "inherit"
});

const exitCode = await proc.exited;
if (exitCode !== 0) {
  process.exit(exitCode);
}

console.log(`Built ${tag}`);

export {};
