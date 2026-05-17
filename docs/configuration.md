# Configuration

WuWeiWeave stores configuration at:

```text
~/.wuweiweave/config/system.json
```

Main sections:

- `providers`: model provider connection metadata
- `models`: model capabilities and default thinking level
- `prompts`: role-specific prompt session metadata
- `skills`: directory-backed skill descriptors
- `tools`: built-in and custom tool enablement
- `mcpServers`: local MCP launch commands
- `host`: web host, port, workspace root, Docker image, and shell policy

Prompt session assembly uses:

- model
- thinking level
- builtin tools
- custom tools
- skills filter
- enabled MCP servers
- extension factories
- system prompt override

The first run seeds local dry-run defaults so the control plane can start without external model credentials.

## Provider Setup

The seeded OpenAI-compatible provider is disabled by default:

```json
{
  "id": "openai",
  "type": "openai",
  "enabled": false,
  "baseUrl": "https://api.openai.com/v1",
  "apiKeyEnv": "OPENAI_API_KEY"
}
```

Enable it, choose a model such as `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.5`, or any custom `modelName`, and configure credentials before starting a solver.

Provider credentials are resolved in this order:

1. `provider.apiKey`, saved from the Web Providers page
2. `provider.apiKeyEnv`, read from the process environment

Config API responses are masked and do not return the full API key. They expose `hasApiKey` and `maskedApiKey` for display.

Provider smoke is intentionally opt-in:

```bash
WUWEIWEAVE_RUN_PROVIDER_SMOKE=1 OPENAI_API_KEY=... bun run smoke:provider
```

Use `WUWEIWEAVE_PROVIDER_BASE_URL`, `WUWEIWEAVE_PROVIDER_MODEL`, and `WUWEIWEAVE_PROVIDER_API_KEY_ENV` to test another OpenAI-compatible service.

## Web Editing

The Web Config page supports editing these config arrays:

- providers
- models
- prompts
- MCP servers

Each save calls the matching `/api/config/*` upsert endpoint and refreshes the config from disk.

## Scheduler Policy

`config.host.scheduler` controls the Phase 4 queue and worker dispatcher:

```json
{
  "maxConcurrentSolvers": 4,
  "maxSolversPerChallenge": 2,
  "defaultSolverQuota": 8,
  "retryLimit": 1,
  "idleTimeoutMs": 300000,
  "hardTimeoutMs": 1800000
}
```

The queue honors these limits when `RuntimeManager.runScheduler()` starts pending work. Failed work can become `retryable` until `retryLimit` is exhausted. `idleTimeoutMs` and `hardTimeoutMs` are shared with supervision classification.

## Recovery Policy

`config.host.recovery` controls Phase 5 automatic recovery:

```json
{
  "retryBackoffMs": 30000,
  "maxRetryBackoffMs": 300000,
  "terminalFailureAfter": 3,
  "workerHeartbeatTimeoutMs": 60000,
  "stuckWorkerTimeoutMs": 600000,
  "deadLetterPath": "runtime/dead-letter-tasks.json"
}
```

Failed scheduler tasks are retried with exponential backoff until the lower of scheduler retry limit and terminal failure limit is reached. Terminal failures are written to the dead-letter path.

`workerHeartbeatTimeoutMs` is also used as the default worker lease duration. Registering or heartbeating a worker renews `leaseExpiresAt`; expired leases are reclaimed by worker supervision.

## Provider Routing

`config.host.providerRouting` controls solver model selection before each runtime starts:

```json
{
  "defaultProviderId": "local-dry-run",
  "defaultModelId": "local-dry-run-model",
  "fallbackProviderIds": ["openai"],
  "mode": "default"
}
```

Supported modes:

- `default`: use explicit task input, then configured defaults, then prompt model.
- `capability`: prefer models whose capabilities match the prompt/task.
- `cost`: prefer the lowest configured input/output token cost.

Solver startup snapshots include the resolved provider id, model id, routing mode, and route reason.

## MCP Capability Cache

Discovery results are stored in:

```text
~/.wuweiweave/config/mcp-cache/<server-id>.json
```

They are also mirrored in `config.mcpCapabilities` so Web and runtime code can display and bind discovered capabilities without re-querying every request.

Host-level refresh settings:

```json
{
  "mcpCapabilityRefreshMs": 300000,
  "mcpCapabilityMaxAgeMs": 900000
}
```

`mcpCapabilityRefreshMs` is the scheduler cadence. `mcpCapabilityMaxAgeMs` is the stale-cache threshold used by `refreshStaleMcpCapabilities`.
