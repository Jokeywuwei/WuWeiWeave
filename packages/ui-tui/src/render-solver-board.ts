import type { DaemonManager, SolverSession } from "@wuweiweave/core";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function renderSolverBoard(daemon: DaemonManager, iterations = 120): Promise<void> {
  for (let index = 0; index < iterations; index += 1) {
    const [dashboard, solvers] = await Promise.all([
      daemon.getDashboardState(),
      daemon.runtime.listSolvers()
    ]);
    process.stdout.write("\x1b[2J\x1b[0f");
    process.stdout.write("WuWeiWeave Solver TUI\n");
    process.stdout.write(`${dashboard.workspaceRoot}\n\n`);
    process.stdout.write(formatTable(solvers));
    process.stdout.write("\nPress Ctrl+C to exit.\n");
    await sleep(1000);
  }
}

function formatTable(solvers: SolverSession[]): string {
  if (solvers.length === 0) {
    return "No solver sessions yet.\n";
  }

  const rows = solvers.map((solver) => [
    solver.id,
    solver.status,
    solver.runtimeMode,
    solver.role,
    solver.task.slice(0, 52)
  ]);
  const widths = [28, 10, 8, 8, 52];
  const header = ["id", "status", "mode", "role", "task"];
  const lines = [
    row(header, widths),
    row(widths.map((width) => "-".repeat(width)), widths),
    ...rows.map((cells) => row(cells, widths))
  ];

  return `${lines.join("\n")}\n`;
}

function row(cells: string[], widths: number[]): string {
  return cells
    .map((cell, index) => {
      const width = widths[index] ?? 12;
      return cell.length > width ? cell.slice(0, width - 1).padEnd(width) : cell.padEnd(width);
    })
    .join("  ");
}
