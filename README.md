# WuWeiWeave

WuWeiWeave is a Bun-first TypeScript monorepo for multi-agent CTF and security research workflows. It ships a runnable first version with:

- Web control plane powered by `Bun.serve()`
- CLI entrypoint for web, solver, and subagent flows
- Solver TUI for terminal runtime visibility
- File-system persistence under `~/.wuweiweave`
- Configurable providers, models, prompts, skills, tools, MCP servers, and host settings
- Challenge mode with memory, ideas, attempts, submissions, planner state, and solver assignments
- Docker solver runtime image scaffold
- Phase 2 execution loop with provider binding, tool dispatch, solver messages, and observer state updates
- Phase 2.5 hardening for live provider smoke, MCP dispatch, Docker runtime smoke, and Web config editing
- Phase 3 productization primitives for MCP capability discovery, solver supervision, observability, provider testing, and scheduler policy
- Phase 4 runtime reliability primitives for provider routing, queued scheduling, worker state, MCP capability refresh, and Docker integration verification
- Phase 5 operations primitives for long-lived MCP transport, worker supervisor heartbeat/recovery, dead-letter handling, persisted provider metrics, and CI-ready Docker integration
- Phase 5.5 real-environment acceptance for Docker, worker leases, dead-letter recovery, and metrics consistency

## Requirements

- Bun 1.x
- Docker, only for isolated solver runtime mode

## Install

```bash
bun install
```

## Run

```bash
bun run web
```

The default web control plane listens at:

```text
http://127.0.0.1:3217
```

中文使用指南见 [`docs/usage.zh-CN.md`](docs/usage.zh-CN.md)。

Initialize and inspect persisted state:

```bash
bun run bootstrap
```

Start a local solver:

```bash
bun run cli -- solver "Inspect the seed challenge" --prompt solver-default
```

Run the smoke flow:

```bash
bun run smoke
```

Run the productization smoke:

```bash
bun run smoke:product
```

This verifies MCP capability discovery/cache, solver execution, supervision classification, and observability aggregation.

Run the reliability smoke:

```bash
bun run smoke:reliability
```

This verifies MCP capability refresh, scheduler enqueue/dispatch, worker assignment/release, provider routing, supervision, and observability events.

Run the operations smoke:

```bash
bun run smoke:operations
```

This verifies long-lived MCP stdio reuse, worker supervision, queue dispatch, persisted provider metrics, and observability aggregation.

Run the real-environment acceptance smoke:

```bash
bun run smoke:acceptance
```

This verifies worker lease/reclaim behavior, retry-to-dead-letter recovery, and metrics aggregation consistency across provider, model, solver, challenge, and time-window dimensions.

Run a live OpenAI-compatible provider smoke:

```bash
WUWEIWEAVE_RUN_PROVIDER_SMOKE=1 OPENAI_API_KEY=... bun run smoke:provider
```

Without `WUWEIWEAVE_RUN_PROVIDER_SMOKE=1`, this command exits successfully with a skipped status to avoid accidental spend.

List solvers:

```bash
bun run cli -- solver list
```

Start the TUI:

```bash
bun run tui
```

Start a worker supervisor loop:

```bash
bun run worker
```

For a single supervisor tick suitable for scripts and CI:

```bash
bun run worker -- --once
```

Build the runtime image:

```bash
bun run docker:build
```

Start a Docker-backed solver after the image is built:

```bash
bun run cli -- solver "Run isolated recon" --prompt solver-default --docker
```

If Docker is unavailable, the solver is marked `failed` with a clear Docker installation/runtime error. Local solver mode continues to work.

Run the Docker end-to-end verification path:

```bash
bun run smoke:docker
```

On machines without Docker, this smoke reports a skipped status and prints the exact setup steps. On Docker-capable machines it builds the image, starts a Docker-backed solver, verifies startup snapshot and JSONL runtime handshake artifacts, stops the container, and archives the solver.

## Verify

```bash
bun run typecheck
bun test
bun run build
```

## Configure a Real Provider

The first boot seeds two providers:

- `local-dry-run`: enabled by default and does not need credentials
- `openai`: OpenAI-compatible provider, disabled by default

To use a real OpenAI-compatible model:

1. Edit `~/.wuweiweave/config/system.json`.
2. Set provider `openai.enabled` to `true`.
3. Set `solver-default.modelId` to `gpt-4.1-mini`, or add another model entry and point the prompt to it.
4. Export the API key:

```bash
OPENAI_API_KEY=... bun run cli -- solver "Run real model solver" --prompt solver-default
```

Custom OpenAI-compatible providers can set `baseUrl` and `apiKeyEnv` in the provider config.

## Tool Dispatcher

Solver execution now runs through `packages/core/src/tools/tool-dispatcher.ts`.

Supported built-in tools include file read/write/edit, shell execution, grep/find helpers, challenge memory/idea/submission recording, and subagent launch. Tool arguments are validated with TypeBox before execution, and results are appended to the solver message thread.

Enabled MCP servers are exposed as dynamic dispatcher tools with ids like:

```text
mcp.<server-id>.call
```

The dispatcher sends a JSON-RPC `tools/call` request to the configured stdio command, applies timeout/error handling, and wraps the result with the same `ToolExecutionResult` shape as built-in tools.

## Web Config Editing

The Config page can now edit and save:

- Providers
- Models
- Prompts
- MCP servers

Each section is edited as a JSON array. Saving calls the same `/api/config/*` upsert endpoints used by scripts and tests, then refreshes the page state from persisted config.

## Phase 3 Operations

Phase 3 adds longer-running operational surfaces without changing the storage model:

- MCP discovery: `POST /api/config/mcp-discover` or `POST /api/config/mcp-discover/<server-id>`
- Observability snapshot: `GET /api/observability`
- Supervision pass: `POST /api/runtime/supervise`
- Provider test: `POST /api/config/provider-test`
- Solver actions: `POST /api/runtime/solvers/<id>/stop`, `/resume`, `/archive`

Scheduler policy lives in `config.host.scheduler` and controls solver concurrency, per-challenge limits, retry limits, idle timeout, and hard timeout.

## Phase 4 Reliability Operations

Phase 4 turns the reserved reliability structures into executable control paths:

- MCP capability refresh: `ConfigManager.refreshStaleMcpCapabilities()` respects `host.mcpCapabilityMaxAgeMs`.
- MCP session pool: `McpSessionPool` and `McpCapabilityRefreshScheduler` provide reusable server snapshots and refresh cadence hooks compatible with existing discovery and dispatcher code.
- Provider routing: `host.providerRouting` selects default, fallback, capability-priority, or cost-priority routes before each solver execution.
- Scheduler queue: `RuntimeManager.enqueueSolverTask()` persists pending work and `RuntimeManager.runScheduler()` dispatches it through concurrency, per-challenge, retry, idle, and hard-timeout policy.
- Worker daemon state: workers are persisted under `runtime/workers.json` and report assignment, status, last heartbeat, and release state.
- Web control plane: Observability, Providers, and Scheduler are separate product pages with API-backed state and operations.

Useful runtime endpoints:

```text
GET  /api/observability
GET  /api/runtime/scheduler
POST /api/runtime/scheduler/enqueue
POST /api/runtime/scheduler/run
GET  /api/runtime/workers
GET  /api/config/provider-routing
POST /api/config/provider-routing
```

The Docker integration path remains graceful on machines without Docker. On Docker-capable machines, `bun run smoke:docker` verifies image build, solver launch, runtime handshake, artifacts, stop, and archive.

## Phase 5 Operations

Phase 5 adds long-running operational behavior while keeping file-system persistence:

- Long-lived MCP stdio transport: `LongLivedMcpTransport` keeps stdio processes open across requests, maps JSON-RPC ids to pending calls, marks stale sessions, and lets `McpSessionPool` reconnect on failure.
- Worker supervisor: `bun run worker` registers a process-backed worker, sends heartbeat, supervises stuck/crashed workers, and advances the scheduler loop.
- Recovery policy: `host.recovery` controls retry backoff, terminal failure, worker heartbeat timeout, stuck worker timeout, and dead-letter storage.
- Dead-letter queue: terminal scheduler failures are stored under `runtime/dead-letter-tasks.json` and exposed in the Scheduler page.
- Persisted provider metrics: provider token/cost usage is appended to `runtime/provider-usage.jsonl` and aggregated by provider, model, solver, challenge, and time window.
- CI-ready scripts: Bun validation and Docker runtime smoke can run on Docker-capable CI runners. Adding a GitHub Actions workflow requires a token with `workflow` scope.

Useful operations endpoints:

```text
GET  /api/observability/metrics
GET  /api/observability/metrics?windowMs=3600000
POST /api/runtime/workers/register
POST /api/runtime/workers/<worker-id>/heartbeat
POST /api/runtime/workers/<worker-id>/stop
POST /api/runtime/workers/supervise
GET  /api/runtime/dead-letter
```

## Phase 5.5 Real-Environment Acceptance

Use these commands before entering the next product phase:

```bash
bun run typecheck
bun test
bun run build
bun run smoke
bun run smoke:product
bun run smoke:reliability
bun run smoke:operations
bun run smoke:acceptance
bun run smoke:docker
```

On a Docker-capable machine, `bun run smoke:docker` must build the image, enqueue a Docker solver through the scheduler/worker path, verify runtime RPC and handshake files, execute a command inside the container, stop it, and archive the solver. On machines without Docker, the same command must exit successfully with a skipped status.

Acceptance boundaries:

- Worker coordination uses file-backed leases and heartbeat timestamps. It is ready for cross-process operation, but not yet a distributed lock service.
- Dead-letter is a recoverability record and UI/API surface. Manual requeue tooling is intentionally left for Phase 6.
- Metrics are append-only JSONL aggregates. Retention, rollups, and billing-grade reconciliation are future work.
- No multi-tenant permissions or distributed scheduler cluster are implemented in Phase 5.5.

## Workspace Data

By default WuWeiWeave writes to:

```text
~/.wuweiweave/
  config/
  challenge/
  solvers/
  archive-solvers/
  runtime/
```

Override it with:

```bash
WUWEIWEAVE_HOME=/path/to/workspace bun run web
```

## Repository Layout

```text
apps/
  cli/
packages/
  core/
  ui-web/
  ui-tui/
  libs/
    pi-mcp-adapter/
scripts/
docs/
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for module boundaries and extension points.
