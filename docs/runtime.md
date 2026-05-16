# Runtime

Each solver session writes:

```text
~/.wuweiweave/solvers/<solver-id>/
  workspace/
  threads/
    main.jsonl
    subagents/
  observer/
    state.json
  logs/
  startup-snapshot.json
```

The session index is stored at:

```text
~/.wuweiweave/solvers/<solver-id>.json
```

Runtime events are appended to:

```text
~/.wuweiweave/runtime/events.jsonl
```

Local mode creates the full session shape and runs the Phase 2 execution loop:

- workspace preflight through `shell.run`
- provider call through `ModelProviderRegistry`
- optional model tool calls through `ToolDispatcher`
- assistant/tool messages in `threads/main.jsonl`
- observer drift/context-pressure state in `observer/state.json`

Docker mode starts the configured runtime image with the solver workspace mounted at `/workspace` and writes a JSONL runtime handshake under:

```text
workspace/.wuweiweave-runtime/events.jsonl
```

On machines without Docker, WuWeiWeave marks the session failed and records a clear runtime error instead of crashing the daemon.

## Docker Smoke

Run:

```bash
bun run smoke:docker
```

The smoke checks Docker availability first. If Docker is missing, it exits successfully with a skipped status and setup guidance. If Docker is available, it verifies:

- image build
- Docker-backed solver launch
- scheduler/worker dispatch path
- session index and startup snapshot
- `workspace/runtime-rpc.jsonl`
- `workspace/.wuweiweave-runtime/events.jsonl`
- container tool execution artifact
- stop and archive flow

## Reliability Smoke

Run:

```bash
bun run smoke:reliability
```

The smoke verifies the Phase 4 control path:

- stale MCP capability refresh
- scheduler task enqueue
- worker assignment
- solver launch through the queue
- worker release
- supervision pass
- observability event aggregation

## Operations Smoke

Run:

```bash
bun run smoke:operations
```

The smoke verifies the Phase 5 operations path:

- long-lived MCP session reuse across capability discovery calls
- scheduler dispatch through worker state
- worker supervision
- persisted provider usage metrics
- observability metrics aggregation

## Acceptance Smoke

Run:

```bash
bun run smoke:acceptance
```

This is the Phase 5.5 real-environment acceptance smoke for non-Docker operations. It verifies:

- process worker registration with a structured lease
- scheduler dispatch through a leased worker
- stale worker lease reclaim
- retry limit exhaustion into dead-letter
- provider metrics consistency across provider, model, solver, challenge, and time-window aggregates

## MCP Runtime Tools

Enabled MCP servers are exposed to the dispatcher as:

```text
mcp.<server-id>.call
```

The tool accepts:

```json
{
  "toolName": "name-on-server",
  "arguments": {}
}
```

The adapter uses stdio JSON-RPC `tools/call` semantics and normalizes text content into the standard tool result shape.

`McpSessionPool` keeps per-server session metadata and cached capability snapshots for callers that need repeated MCP access. It uses `LongLivedMcpTransport` when available, reuses the stdio process across calls, marks stale sessions, and reconnects on failure. Capability refresh uses the same discovery path as config and does not require Web-specific code.

## Scheduler Queue

Scheduler task state is stored in:

```text
~/.wuweiweave/runtime/scheduler-queue.json
```

Worker state is stored in:

```text
~/.wuweiweave/runtime/workers.json
```

Task states:

- `pending`
- `running`
- `completed`
- `failed`
- `retryable`

The queue is advanced by:

```text
POST /api/runtime/scheduler/run
```

The dispatcher enforces the configured global concurrency, per-challenge concurrency, retry limit, idle timeout, and hard timeout policy.

Dead-letter tasks are stored in:

```text
~/.wuweiweave/runtime/dead-letter-tasks.json
```

## Worker Daemon

Phase 5 adds a process-backed worker supervisor without replacing `RuntimeManager`.

Each worker records:

- worker id
- status
- lease id
- lease owner
- lease acquired time
- lease expiry time
- assigned task id
- assigned solver id
- last heartbeat
- processed count
- last error

The initial local worker is created during runtime initialization. A real supervisor loop can be started with:

```bash
bun run worker
```

A single tick can be used for scripts:

```bash
bun run worker -- --once
```

The worker loop registers the process id, heartbeats, renews the lease, runs worker recovery, and advances the scheduler.

Scheduler dispatch only chooses idle workers whose lease has not expired. Expired leases classify the worker as crashed; any running task is recovered by retry/backoff or moved to dead-letter.

## Provider Metrics

Provider usage metrics are stored in:

```text
~/.wuweiweave/runtime/provider-usage.jsonl
```

Query all metrics:

```text
GET /api/observability/metrics
```

Query a recent window:

```text
GET /api/observability/metrics?windowMs=3600000
```

Metrics aggregate by provider, model, solver, challenge, and total cost estimate. Phase 5.5 acceptance checks that every aggregate dimension reconciles to the same persisted total for the verification run.

## Supervision

Run a supervision pass from the API:

```text
POST /api/runtime/supervise
```

With `{ "applyActions": true }`, WuWeiWeave can apply the next action selected by the health classifier:

- `observe`
- `retry`
- `resume`
- `stop`
- `archive`

Health classes are:

- `healthy`
- `idle`
- `drift`
- `timeout`
- `failed`
- `stopped`

The policy lives at `config.host.scheduler`.
