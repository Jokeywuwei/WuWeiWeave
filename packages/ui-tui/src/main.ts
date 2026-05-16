#!/usr/bin/env bun
import { createDefaultDaemon } from "@wuweiweave/core";
import { renderSolverBoard } from "./render-solver-board";

const daemon = await createDefaultDaemon();
await renderSolverBoard(daemon);
