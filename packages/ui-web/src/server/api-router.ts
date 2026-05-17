import type {
  CreateChallengeInput,
  DaemonManager,
  HostSettings,
  ModelConfig,
  ModelRunRequest,
  PromptConfig,
  ProviderConfig,
  ProviderRoutingPolicy,
  StartSolverInput,
  SubagentInput
} from "@wuweiweave/core";
import { ModelProviderRegistry } from "@wuweiweave/core";

export async function handleApiRequest(request: Request, daemon: DaemonManager): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);

  try {
    if (url.pathname === "/api/health") {
      return jsonResponse({ ok: true, dashboard: await daemon.getDashboardState() });
    }

    if (url.pathname === "/api/dashboard") {
      return jsonResponse(await daemon.getDashboardState());
    }

    if (url.pathname === "/api/observability") {
      return jsonResponse(await daemon.runtime.getObservabilitySnapshot());
    }

    if (url.pathname === "/api/observability/metrics") {
      const windowMs = url.searchParams.get("windowMs");
      return jsonResponse(
        await daemon.runtime.getProviderMetricsSnapshot(windowMs ? Number.parseInt(windowMs, 10) : undefined)
      );
    }

    if (segments[1] === "config") {
      return handleConfigRequest(request, daemon, segments);
    }

    if (segments[1] === "challenges") {
      return handleChallengeRequest(request, daemon, segments);
    }

    if (segments[1] === "runtime") {
      return handleRuntimeRequest(request, daemon, segments);
    }

    return jsonResponse({ message: "API route not found" }, 404);
  } catch (error) {
    return jsonResponse(
      {
        message: error instanceof Error ? error.message : "Request failed"
      },
      500
    );
  }
}

async function handleConfigRequest(
  request: Request,
  daemon: DaemonManager,
  segments: string[]
): Promise<Response> {
  const config = await daemon.config.getConfig();

  if (request.method === "GET" && segments.length === 2) {
    return jsonResponse(sanitizeConfigForResponse(config));
  }

  const section = segments[2];
  if (request.method === "GET" && section === "mcp-capabilities") {
    return jsonResponse(config.mcpCapabilities);
  }

  if (request.method === "GET" && section === "provider-routing") {
    return jsonResponse(config.host.providerRouting);
  }

  if (request.method === "GET" && section) {
    switch (section) {
      case "providers":
        return jsonResponse(config.providers.map(sanitizeProviderForResponse));
      case "models":
        return jsonResponse(config.models);
      case "prompts":
        return jsonResponse(config.prompts);
      case "skills":
        return jsonResponse(config.skills);
      case "tools":
        return jsonResponse(config.tools);
      case "mcp":
        return jsonResponse(config.mcpServers);
      case "host":
        return jsonResponse(config.host);
      default:
        return jsonResponse({ message: `Unknown config section: ${section}` }, 404);
    }
  }

  if (request.method === "POST" && section === "prompts") {
    const body = await readJsonBody<PromptConfig>(request);
    return jsonResponse(sanitizeConfigForResponse(await daemon.config.upsertPrompt(body)));
  }

  if (request.method === "PUT" && section === "prompts" && segments[3]) {
    const body = await readJsonBody<PromptConfig>(request);
    return jsonResponse(sanitizeConfigForResponse(await daemon.config.replacePrompt(segments[3], body)));
  }

  if (request.method === "POST" && section === "providers") {
    const body = await readJsonBody<Parameters<typeof daemon.config.upsertProvider>[0]>(request);
    return jsonResponse(sanitizeConfigForResponse(await daemon.config.upsertProvider(body)));
  }

  if (request.method === "PUT" && section === "providers" && segments[3]) {
    const body = await readJsonBody<ProviderConfig>(request);
    return jsonResponse(sanitizeConfigForResponse(await daemon.config.replaceProvider(segments[3], body)));
  }

  if (request.method === "POST" && section === "provider-test") {
    const body = await readJsonBody<{ providerId: string; modelId?: string; message?: string }>(request);
    return jsonResponse(await testProvider(daemon, body));
  }

  if (request.method === "POST" && section === "provider-routing") {
    const body = await readJsonBody<ProviderRoutingPolicy>(request);
    return jsonResponse(sanitizeConfigForResponse(await daemon.config.updateProviderRouting(body)));
  }

  if (request.method === "POST" && section === "models") {
    const body = await readJsonBody<Parameters<typeof daemon.config.upsertModel>[0]>(request);
    return jsonResponse(sanitizeConfigForResponse(await daemon.config.upsertModel(body)));
  }

  if (request.method === "PUT" && section === "models" && segments[3]) {
    const body = await readJsonBody<ModelConfig>(request);
    return jsonResponse(sanitizeConfigForResponse(await daemon.config.replaceModel(segments[3], body)));
  }

  if (request.method === "POST" && section === "tools") {
    const body = await readJsonBody<Parameters<typeof daemon.config.upsertTool>[0]>(request);
    return jsonResponse(sanitizeConfigForResponse(await daemon.config.upsertTool(body)));
  }

  if (request.method === "POST" && section === "mcp") {
    const body = await readJsonBody<Parameters<typeof daemon.config.upsertMcpServer>[0]>(request);
    return jsonResponse(sanitizeConfigForResponse(await daemon.config.upsertMcpServer(body)));
  }

  if (request.method === "PUT" && section === "mcp" && segments[3]) {
    const body = await readJsonBody<Parameters<typeof daemon.config.upsertMcpServer>[0]>(request);
    return jsonResponse(sanitizeConfigForResponse(await daemon.config.replaceMcpServer(segments[3], body)));
  }

  if (request.method === "POST" && section === "mcp-discover") {
    const serverId = segments[3];
    if (serverId) {
      return jsonResponse(await daemon.config.discoverMcpServer(serverId));
    }

    return jsonResponse(await daemon.config.discoverAllMcpServers());
  }

  if (request.method === "POST" && section === "mcp-refresh-stale") {
    return jsonResponse(await daemon.config.refreshStaleMcpCapabilities());
  }

  if (request.method === "PUT" && section === "host") {
    const body = await readJsonBody<HostSettings>(request);
    return jsonResponse(sanitizeConfigForResponse(await daemon.config.updateHost(body)));
  }

  return jsonResponse({ message: "Unsupported config operation" }, 405);
}

async function handleChallengeRequest(
  request: Request,
  daemon: DaemonManager,
  segments: string[]
): Promise<Response> {
  if (request.method === "GET" && segments.length === 2) {
    return jsonResponse(await daemon.challenges.listChallenges());
  }

  if (request.method === "POST" && segments.length === 2) {
    const body = await readJsonBody<CreateChallengeInput>(request);
    return jsonResponse(await daemon.createChallenge(body), 201);
  }

  const challengeId = segments[2];
  if (!challengeId) {
    return jsonResponse({ message: "Challenge id is required" }, 400);
  }

  if (request.method === "GET" && segments.length === 3) {
    return jsonResponse(await daemon.challenges.getChallenge(challengeId));
  }

  if (request.method === "POST" && segments[3] === "memory") {
    const body = await readJsonBody<{ content: string }>(request);
    return jsonResponse(await daemon.challenges.appendMemory(challengeId, body.content));
  }

  if (request.method === "POST" && segments[3] === "ideas") {
    const body = await readJsonBody<{ title: string; rationale: string; confidence?: number }>(request);
    return jsonResponse(await daemon.challenges.addIdea(challengeId, body));
  }

  if (request.method === "POST" && segments[3] === "attempts") {
    const body = await readJsonBody<{ action: string; result: string; solverId?: string; evidence?: string[] }>(
      request
    );
    return jsonResponse(await daemon.challenges.recordAttempt(challengeId, body));
  }

  if (request.method === "POST" && segments[3] === "submissions") {
    const body = await readJsonBody<{ payload: string; accepted: boolean; response: string; solverId?: string }>(
      request
    );
    return jsonResponse(await daemon.challenges.recordSubmission(challengeId, body));
  }

  if (request.method === "POST" && segments[3] === "planner") {
    return jsonResponse(await daemon.challenges.refreshPlanner(challengeId));
  }

  if (request.method === "GET" && segments[3] === "summary") {
    return jsonResponse({ summary: await daemon.challenges.summarizeChallenge(challengeId) });
  }

  return jsonResponse({ message: "Unsupported challenge operation" }, 405);
}

async function handleRuntimeRequest(
  request: Request,
  daemon: DaemonManager,
  segments: string[]
): Promise<Response> {
  if (request.method === "GET" && segments[2] === "events") {
    return jsonResponse(await daemon.runtime.listRuntimeEvents());
  }

  if (request.method === "POST" && segments[2] === "observe") {
    return jsonResponse(await daemon.runtime.observeRunningSolvers());
  }

  if (request.method === "POST" && segments[2] === "supervise") {
    const body = await readJsonBody<{ applyActions?: boolean }>(request).catch(() => ({ applyActions: false }));
    return jsonResponse(await daemon.runtime.superviseSolvers(body.applyActions ?? false));
  }

  if (segments[2] === "scheduler") {
    if (request.method === "GET") {
      return jsonResponse(await daemon.runtime.listSchedulerTasks());
    }

    if (request.method === "POST" && segments[3] === "enqueue") {
      const body = await readJsonBody<StartSolverInput>(request);
      return jsonResponse(await daemon.runtime.enqueueSolverTask(body), 201);
    }

    if (request.method === "POST" && segments[3] === "run") {
      return jsonResponse(await daemon.runtime.runScheduler());
    }
  }

  if (segments[2] === "workers") {
    if (request.method === "GET") {
      return jsonResponse(await daemon.runtime.getWorkerPoolSnapshot());
    }

    if (request.method === "POST" && segments[3] === "register") {
      const body = await readJsonBody<{ workerId?: string; processId?: number }>(request).catch(
        (): { workerId?: string; processId?: number } => ({})
      );
      return jsonResponse(await daemon.runtime.registerWorker(body.workerId ?? `worker-${crypto.randomUUID()}`, body.processId));
    }

    if (request.method === "POST" && segments[3] === "supervise") {
      return jsonResponse(await daemon.runtime.superviseWorkers());
    }

    if (request.method === "POST" && segments[4] === "stop") {
      return jsonResponse(await daemon.runtime.stopWorker(segments[3] ?? ""));
    }

    if (request.method === "POST" && segments[4] === "heartbeat") {
      return jsonResponse(await daemon.runtime.heartbeatWorker(segments[3] ?? ""));
    }
  }

  if (segments[2] === "dead-letter" && request.method === "GET") {
    return jsonResponse(await daemon.runtime.listDeadLetterTasks());
  }

  if (segments[2] !== "solvers") {
    return jsonResponse({ message: "Unknown runtime route" }, 404);
  }

  if (request.method === "GET" && segments.length === 3) {
    return jsonResponse(await daemon.runtime.listSolvers());
  }

  if (request.method === "POST" && segments.length === 3) {
    const body = await readJsonBody<StartSolverInput>(request);
    return jsonResponse(await daemon.startSolver(body), 201);
  }

  const solverId = segments[3];
  if (!solverId) {
    return jsonResponse({ message: "Solver id is required" }, 400);
  }

  if (request.method === "GET" && segments.length === 4) {
    return jsonResponse(await daemon.runtime.getSolver(solverId));
  }

  if (request.method === "POST" && segments[4] === "stop") {
    return jsonResponse(await daemon.runtime.stopSolver(solverId));
  }

  if (request.method === "POST" && segments[4] === "resume") {
    return jsonResponse(await daemon.runtime.resumeSolver(solverId));
  }

  if (request.method === "POST" && segments[4] === "archive") {
    await daemon.runtime.archiveSolver(solverId);
    return jsonResponse({ ok: true, solverId });
  }

  if (request.method === "GET" && segments[4] === "messages") {
    return jsonResponse(await daemon.runtime.getMessages(solverId));
  }

  if (request.method === "POST" && segments[4] === "subagents") {
    const body = await readJsonBody<SubagentInput>(request);
    return jsonResponse(await daemon.startSubagent({ ...body, parentSolverId: solverId }));
  }

  return jsonResponse({ message: "Unsupported runtime operation" }, 405);
}

async function readJsonBody<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

function sanitizeConfigForResponse<T extends { providers: ProviderConfig[] }>(config: T): T {
  return {
    ...config,
    providers: config.providers.map(sanitizeProviderForResponse)
  };
}

function sanitizeProviderForResponse(provider: ProviderConfig): ProviderConfig {
  const { apiKey: _apiKey, hasApiKey: _hasApiKey, maskedApiKey: _maskedApiKey, ...rest } = provider;
  const apiKey = provider.apiKey?.trim();
  return {
    ...rest,
    hasApiKey: Boolean(apiKey),
    ...(apiKey ? { maskedApiKey: maskApiKey(apiKey) } : {})
  };
}

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return "****";
  }

  return `${"*".repeat(8)}${apiKey.slice(-4)}`;
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

async function testProvider(
  daemon: DaemonManager,
  input: { providerId: string; modelId?: string; message?: string }
): Promise<{ ok: boolean; content?: string; usage?: unknown; error?: string }> {
  const config = await daemon.config.getConfig();
  const provider = config.providers.find((candidate) => candidate.id === input.providerId);
  if (!provider) {
    return { ok: false, error: `Provider not found: ${input.providerId}` };
  }

  const model = selectProviderModel(config.models, provider, input.modelId);
  if (!model) {
    return { ok: false, error: `No model found for provider ${provider.id}` };
  }

  const prompt = daemon.config.findPrompt(config, "solver-default");
  const registry = new ModelProviderRegistry();
  try {
    const result = await registry.run({
      config,
      prompt: { ...prompt, modelId: model.id },
      messages: [{ role: "user", content: input.message ?? "Reply with WuWeiWeave provider test ok." }],
      tools: []
    } satisfies ModelRunRequest);
    return {
      ok: true,
      content: result.content,
      usage: result.usage
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Provider test failed"
    };
  }
}

function selectProviderModel(models: ModelConfig[], provider: ProviderConfig, wantedModelId?: string): ModelConfig | undefined {
  if (wantedModelId) {
    return models.find((model) => model.id === wantedModelId && model.providerId === provider.id);
  }

  if (provider.defaultModelId) {
    return models.find((model) => model.id === provider.defaultModelId && model.providerId === provider.id);
  }

  return models.find((model) => model.providerId === provider.id);
}
