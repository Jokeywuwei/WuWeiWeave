# Architecture

WuWeiWeave keeps UI and CLI thin. Durable behavior lives in `packages/core`.

```text
UI / CLI
  -> DaemonManager
    -> ConfigManager / ChallengeManager / RuntimeManager
      -> FileStore / Docker / Tools / Skills / MCP adapters
```

## Core Managers

`ConfigManager`

- Seeds and updates providers, models, prompts, skills, tools, MCP servers, and host settings.
- Stores canonical config at `config/system.json`.
- Mirrors prompt and skill metadata into directory-oriented files for later editing.

`ChallengeManager`

- Owns challenge lifecycle and file-backed state.
- Tracks memory, ideas, attempts, submissions, solver assignments, planner state, and timeline events.
- Provides a small planner refresh loop that can later be replaced with strategy plugins.

`RuntimeManager`

- Creates solver and subagent sessions.
- Writes session directories, workspaces, startup snapshots, main thread messages, observer state, and runtime events.
- Runs solver sessions through `SolverRunner`, `ModelProviderRegistry`, and `ToolDispatcher`.
- Supports local provider execution and Docker-backed solver runtime startup.
- Owns scheduler queue state, worker daemon state, provider route resolution, and supervision actions.

`DaemonManager`

- Composes managers for Web, CLI, and TUI callers.
- Provides dashboard state and assignment glue between runtime sessions and challenges.

## Agent Roles

Manager coordinates challenge rhythm and solver assignment.

Solver executes bounded tasks with prompts, skills, tools, model config, and runtime isolation.

Observer tracks drift, context pressure, and unproductive loops through persisted observer state.

Subagent handles delegated branches of solver work.

## Extension Points

- Prompt: `config.prompts[]`, `config/prompts/*.json`
- Skill: `config.skills[]`, `config/skills/*`
- Tool: TypeBox schemas in `packages/core/src/tools/tool-registry.ts`
- MCP: `packages/libs/pi-mcp-adapter`
- Model provider: `config.providers[]` and `config.models[]`
- Planner strategy: `ChallengeManager.refreshPlanner`
- Runtime image: `Dockerfile` and `config.host.defaultRuntimeImage`

## Phase 2 Execution Loop

`SolverRunner` now provides the runtime loop:

1. Load prompt metadata and assemble the agent session.
2. Bind the configured provider and model.
3. Run a workspace preflight tool.
4. Call the provider.
5. Execute any model-requested tool calls through `ToolDispatcher`.
6. Persist assistant/tool messages and observer state.

The default local provider makes the flow runnable without credentials. OpenAI-compatible providers use `baseUrl`, `apiKeyEnv`, and `modelName` from config.

## Tool Dispatcher

`ToolDispatcher` is the single execution center for built-in tools. It handles lookup, enablement checks, TypeBox argument validation, execution, result wrapping, and event emission.

Current built-ins cover filesystem, shell, challenge state, and subagent delegation. Enabled MCP servers are dynamically exposed as `mcp.<server-id>.call` tools and execute through the same dispatcher contract.

## Phase 2.5 Hardening

Phase 2.5 closes the main verification gaps:

- `smoke:provider` performs an opt-in live OpenAI-compatible provider call through `ModelProviderRegistry`.
- MCP server configs now enter `ToolDispatcher` as dynamic tools with JSON-RPC stdio execution, timeout handling, and unified result wrapping.
- `smoke:docker` prepares a Docker end-to-end verification path: image build, solver launch, runtime JSONL handshake, stop, and archive.
- The Web Config page can edit providers, models, prompts, and MCP server arrays, save them through API upserts, and refresh persisted state.

## Phase 3 Productization

Phase 3 keeps the existing manager boundaries and adds operational depth:

`MCP discovery`

- `ConfigManager.discoverMcpServer` runs `tools/list`, `resources/list`, and `prompts/list`.
- Results are cached under `config/mcp-cache/<server-id>.json` and mirrored in `SystemConfig.mcpCapabilities`.
- Discovered tools are exposed to `ToolDispatcher` as concrete tool ids in addition to the generic `mcp.<server-id>.call`.

`Runtime supervision`

- `classifySolverHealth` categorizes solvers as healthy, idle, drift, timeout, failed, or stopped.
- `RuntimeManager.superviseSolvers` writes health snapshots, emits supervision events, and can optionally apply retry/resume/stop/archive actions.
- Scheduler policy is stored in `config.host.scheduler`.

`Observability`

- `RuntimeManager.getObservabilitySnapshot` aggregates runtime timeline, solver status/health, challenge assignments, scheduler capacity, and provider token/cost usage.
- Provider usage is emitted as `provider-usage` events from `SolverRunner`.

`Provider registry UI`

- The Config page can test providers, edit provider/model/prompt/MCP JSON, and display discovered MCP capabilities.

## Phase 4 Runtime Reliability

Phase 4 keeps the same manager boundaries and makes reliability behavior executable.

`MCP session and refresh`

- `McpSessionPool` tracks reusable logical sessions per MCP server and keeps capability snapshots close to the dispatcher.
- `McpCapabilityRefreshScheduler` decides when cache entries are stale and refreshes through the existing discovery path.
- `ConfigManager.refreshStaleMcpCapabilities` applies the host-level max-age policy without forcing every tool call to rediscover capabilities.

`Worker daemon and queue`

- `RuntimeManager` persists scheduler tasks under `runtime/scheduler-queue.json`.
- Tasks move through `pending`, `running`, `completed`, `failed`, and `retryable`.
- `RuntimeManager` persists worker state under `runtime/workers.json`; workers are assigned before solver launch and released after completion/failure.
- `decideSchedulerActions` enforces `maxConcurrentSolvers`, `maxSolversPerChallenge`, `retryLimit`, `idleTimeoutMs`, and `hardTimeoutMs`.

`Provider routing`

- `resolveProviderRoute` runs before solver startup and chooses the provider/model from explicit input, challenge/task policy, host defaults, capability priority, cost priority, or fallback providers.
- The chosen route is written into the solver startup snapshot so later observability can explain why a model was used.

`Control plane`

- Observability, Providers, and Scheduler are separate Web pages backed by runtime/config APIs.
- Scheduler operations enqueue work, run a dispatch pass, inspect workers, and surface structured task status.

## Phase 5 Operations

Phase 5 turns reliability primitives into long-running operations surfaces.

`Long-lived MCP transport`

- `LongLivedMcpTransport` owns one stdio process per MCP server session.
- Requests are newline-delimited JSON-RPC messages keyed by id, with per-call timeout handling.
- Transport health moves through `starting`, `ready`, `stale`, and `closed`.
- `McpSessionPool` records calls, failures, reconnects, and stale recovery while preserving the discovery and dispatcher contracts.

`Worker supervisor`

- `RuntimeManager.registerWorker`, `heartbeatWorker`, `stopWorker`, and `superviseWorkers` expose a process-supervision boundary without replacing the scheduler.
- `scripts/worker-daemon.ts` is the first process-backed supervisor: it registers itself, heartbeats, runs worker supervision, and advances the scheduler loop.
- Crashed or stuck workers return running work to `retryable` or move it to dead-letter according to recovery policy.

`Recovery and dead-letter`

- `recoverSchedulerTask` applies retry backoff, retry limits, terminal failure, and failure scope.
- Terminal work is persisted at `host.recovery.deadLetterPath` and exposed through `/api/runtime/dead-letter`.

`Metrics`

- Provider usage events are persisted to `runtime/provider-usage.jsonl`.
- `getProviderMetricsSnapshot` aggregates by provider, model, solver, challenge, and optional time window.
- Observability includes both event-derived usage and durable metrics.

`CI integration`

- `.github/workflows/integration.yml` runs typecheck, tests, build, smoke, product smoke, reliability smoke, operations smoke, and Docker runtime smoke.

## Phase 5.5 Acceptance

Phase 5.5 does not add a new product surface. It tightens the runtime contracts created in Phase 5.

`Worker leases`

- Worker state now includes `leaseId`, `leaseOwner`, `leaseAcquiredAt`, and `leaseExpiresAt`.
- Registration acquires a lease, heartbeat renews it, and scheduler dispatch only uses idle workers with a valid lease.
- Expired leases classify workers as crashed; running tasks are reclaimed through the existing recovery policy.

`Dead-letter verification`

- `smoke:acceptance` seeds a stale running task and expired worker lease, then verifies terminal recovery into `runtime/dead-letter-tasks.json`.
- The Scheduler page shows task recovery notes, next retry time, and worker lease expiry to make failures traceable.

`Metrics consistency`

- `smoke:acceptance` verifies that provider/model/solver/challenge/time-window aggregates all reconcile to the persisted total token count.

`Docker acceptance`

- `smoke:docker` remains the authoritative real-container path: image build, scheduler launch, runtime handshake, container tool execution, stop, and archive.
- Absence of Docker is treated as a graceful skip for local developer machines.

## Web Runtime

`packages/ui-web` uses `Bun.serve()` directly. REST endpoints are under:

- `/api/config/*`
- `/api/challenges/*`
- `/api/runtime/*`

SSE endpoints:

- `/api/runtime/events/stream`
- `/api/runtime/solvers/:id/stream`
- `/api/challenges/:id/timeline/stream`

React and Tailwind assets are built without Vite through `Bun.build()` plus Tailwind CLI.
