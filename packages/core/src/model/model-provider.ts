import type { ModelConfig, PromptConfig, ProviderConfig, SystemConfig } from "../types/config";
import type { ProviderUsage } from "../types/runtime";
import type { ToolDefinition } from "../tools/tool-registry";

export type ProviderMessageRole = "system" | "user" | "assistant" | "tool";

export interface ProviderMessage {
  role: ProviderMessageRole;
  content: string;
  name?: string;
}

export interface ProviderToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ModelRunRequest {
  config: SystemConfig;
  prompt: PromptConfig;
  messages: ProviderMessage[];
  tools: ToolDefinition[];
}

export interface ModelRunResult {
  providerId: string;
  modelId: string;
  content: string;
  toolCalls: ProviderToolCall[];
  raw?: unknown;
  usage: ProviderUsage;
}

interface OpenAiChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
}

interface OpenAiToolCall {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface OpenAiChatResponse {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: OpenAiToolCall[];
    };
  }>;
}

export class ModelProviderRegistry {
  async run(request: ModelRunRequest): Promise<ModelRunResult> {
    const model = findModel(request.config, request.prompt.modelId);
    const provider = findProvider(request.config, model.providerId);

    if (!provider.enabled) {
      throw new Error(`Provider is disabled: ${provider.id}`);
    }

    if (provider.type === "local") {
      return runLocalProvider(provider, model, request.prompt, request.messages);
    }

    if (provider.type === "openai" || provider.type === "custom") {
      return runOpenAiCompatibleProvider(provider, model, request);
    }

    throw new Error(`Provider type is not implemented yet: ${provider.type}`);
  }
}

function findModel(config: SystemConfig, modelId: string): ModelConfig {
  const model = config.models.find((candidate) => candidate.id === modelId);
  if (!model) {
    throw new Error(`Model not found: ${modelId}`);
  }

  return model;
}

function findProvider(config: SystemConfig, providerId: string): ProviderConfig {
  const provider = config.providers.find((candidate) => candidate.id === providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`);
  }

  return provider;
}

function runLocalProvider(
  provider: ProviderConfig,
  model: ModelConfig,
  prompt: PromptConfig,
  messages: ProviderMessage[]
): ModelRunResult {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const task = latestUserMessage?.content ?? "No task provided.";
  return {
    providerId: provider.id,
    modelId: model.id,
    content: [
      `Local provider executed prompt ${prompt.id}.`,
      `Task: ${task}`,
      "No external model credentials were configured, so WuWeiWeave used the local execution path."
    ].join("\n"),
    toolCalls: [],
    usage: estimateUsage(provider, model, task, "")
  };
}

async function runOpenAiCompatibleProvider(
  provider: ProviderConfig,
  model: ModelConfig,
  request: ModelRunRequest
): Promise<ModelRunResult> {
  const baseUrl = provider.baseUrl ?? "https://api.openai.com/v1";
  const apiKeyEnv = provider.apiKeyEnv ?? "OPENAI_API_KEY";
  const apiKey = Bun.env[apiKeyEnv];
  if (!apiKey) {
    throw new Error(`Missing API key environment variable: ${apiKeyEnv}`);
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model.modelName ?? model.id,
      messages: request.messages.map(toOpenAiMessage),
      tools: request.tools.map(toOpenAiTool),
      tool_choice: "auto"
    })
  });

  if (!response.ok) {
    throw new Error(`Provider ${provider.id} failed: ${response.status} ${await response.text()}`);
  }

  const raw = (await response.json()) as OpenAiChatResponse;
  const message = raw.choices?.[0]?.message;
  return {
    providerId: provider.id,
    modelId: model.id,
    content: message?.content ?? "",
    toolCalls: (message?.tool_calls ?? []).flatMap(parseOpenAiToolCall),
    raw,
    usage: {
      providerId: provider.id,
      modelId: model.id,
      inputTokens: raw.usage?.prompt_tokens ?? 0,
      outputTokens: raw.usage?.completion_tokens ?? 0,
      totalTokens: raw.usage?.total_tokens ?? 0,
      estimatedCostUsd: estimateCost(
        raw.usage?.prompt_tokens ?? 0,
        raw.usage?.completion_tokens ?? 0,
        provider
      )
    }
  };
}

function estimateUsage(provider: ProviderConfig, model: ModelConfig, input: string, output: string): ProviderUsage {
  const inputTokens = Math.ceil(input.length / 4);
  const outputTokens = Math.ceil(output.length / 4);
  return {
    providerId: provider.id,
    modelId: model.id,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCostUsd: estimateCost(inputTokens, outputTokens, provider)
  };
}

function estimateCost(inputTokens: number, outputTokens: number, provider: ProviderConfig): number {
  const inputCost = (inputTokens / 1000) * (provider.costPerInput1k ?? 0);
  const outputCost = (outputTokens / 1000) * (provider.costPerOutput1k ?? 0);
  return Number((inputCost + outputCost).toFixed(6));
}

function toOpenAiMessage(message: ProviderMessage): OpenAiChatMessage {
  return {
    role: message.role,
    content: message.content,
    ...(message.name ? { name: message.name } : {})
  };
}

function toOpenAiTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.id.replaceAll(".", "_"),
      description: tool.description,
      parameters: tool.inputSchema
    }
  };
}

function parseOpenAiToolCall(call: OpenAiToolCall): ProviderToolCall[] {
  const name = call.function?.name?.replaceAll("_", ".");
  if (!name) {
    return [];
  }

  const rawArgs = call.function?.arguments ?? "{}";
  const parsed = JSON.parse(rawArgs) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Tool call ${name} arguments must be an object`);
  }

  return [
    {
      id: call.id ?? crypto.randomUUID(),
      name,
      args: parsed
    }
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
