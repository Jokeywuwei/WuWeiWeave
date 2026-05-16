#!/usr/bin/env bun
import { Command } from "commander";
import { createDefaultDaemon } from "@wuweiweave/core";
import { startWebServer } from "@wuweiweave/ui-web/server";

const program = new Command();

program
  .name("wuweiweave")
  .description("WuWeiWeave multi-agent CTF control plane")
  .version("0.1.0");

program
  .command("web")
  .description("Start the Web control plane")
  .option("--host <host>", "Host to bind")
  .option("--port <port>", "Port to bind")
  .action(async (options: { host?: string; port?: string }) => {
    await startWebServer({
      ...(options.host ? { host: options.host } : {}),
      ...(options.port ? { port: Number(options.port) } : {})
    });
  });

const solver = program.command("solver").description("Start or inspect solver sessions");

solver
  .argument("[task]", "Task to run")
  .option("--prompt <name>", "Prompt name or id", "solver-default")
  .option("--challenge <id>", "Challenge id to attach")
  .option("--docker", "Start through Docker runtime")
  .action(async (task: string | undefined, options: { prompt: string; challenge?: string; docker?: boolean }) => {
    if (!task) {
      console.log("Provide a task, or use `solver list` / `solver rpc`.");
      return;
    }

    const daemon = await createDefaultDaemon();
    const session = await daemon.startSolver({
      task,
      promptName: options.prompt,
      runtimeMode: options.docker ? "docker" : "local",
      startContainer: options.docker ?? false,
      ...(options.challenge ? { challengeId: options.challenge } : {})
    });
    console.log(JSON.stringify(session, null, 2));
  });

solver
  .command("rpc")
  .description("Print the local solver RPC surface")
  .action(() => {
    console.log(
      JSON.stringify(
        {
          protocol: "wuweiweave.solver.v1",
          methods: [
            "runtime.startSolver",
            "runtime.getSolver",
            "runtime.getMessages",
            "runtime.startSubagent",
            "challenge.appendMemory",
            "challenge.recordAttempt",
            "challenge.recordSubmission"
          ]
        },
        null,
        2
      )
    );
  });

solver
  .command("list")
  .description("List solver sessions")
  .action(async () => {
    const daemon = await createDefaultDaemon();
    console.log(JSON.stringify(await daemon.runtime.listSolvers(), null, 2));
  });

const subagent = program.command("subagent").description("Start or inspect subagent sessions");

subagent
  .argument("[task]", "Task to delegate")
  .option("--prompt <name>", "Prompt name or id", "solver-default")
  .option("--parent <solverId>", "Parent solver id")
  .action(async (task: string | undefined, options: { prompt: string; parent?: string }) => {
    if (!task) {
      console.log("Provide a task, or use `subagent list`.");
      return;
    }

    const daemon = await createDefaultDaemon();
    const session = await daemon.startSubagent({
      task,
      promptName: options.prompt,
      ...(options.parent ? { parentSolverId: options.parent } : {})
    });
    console.log(JSON.stringify(session, null, 2));
  });

subagent
  .command("list")
  .description("List subagent sessions")
  .action(async () => {
    const daemon = await createDefaultDaemon();
    const sessions = (await daemon.runtime.listSolvers()).filter((solverSession) => solverSession.role === "subagent");
    console.log(JSON.stringify(sessions, null, 2));
  });

await program.parseAsync(Bun.argv);
