# Directory Layout

```text
apps/cli
```

Commander-based unified CLI.

```text
packages/core
```

Business logic, managers, type models, persistence, tool schemas, agent session assembly, provider routing, scheduler queue, worker state, MCP discovery/session helpers, and Docker startup planning.

```text
packages/ui-web
```

Bun server, REST API, SSE streams, React control plane, and Tailwind styles.

```text
packages/ui-tui
```

Terminal solver board for quick runtime visibility.

```text
packages/libs/pi-mcp-adapter
```

Local MCP launch descriptor helpers.

```text
scripts
```

Operational scripts for bootstrapping state, smoke validation, reliability/operations validation, worker supervision, and building/verifying the Docker runtime image.
