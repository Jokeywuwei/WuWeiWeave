import { afterEach, describe, expect, it } from "bun:test";
import { ConfigManager, FileStore, ModelProviderRegistry } from "../src/index";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete Bun.env.WUWEIWEAVE_TEST_API_KEY;
  delete Bun.env.WUWEIWEAVE_ENV_ONLY_API_KEY;
});

describe("ModelProviderRegistry", () => {
  it("runs the local provider without external credentials", async () => {
    const store = new FileStore(".tmp/model-provider-test");
    const configManager = new ConfigManager(store);
    const config = configManager.createDefaultConfig();
    const prompt = config.prompts.find((candidate) => candidate.id === "solver-default");
    if (!prompt) {
      throw new Error("solver prompt missing");
    }

    const registry = new ModelProviderRegistry();
    const result = await registry.run({
      config,
      prompt,
      messages: [{ role: "user", content: "solve warmup" }],
      tools: []
    });

    expect(result.providerId).toBe("local-dry-run");
    expect(result.content).toContain("solve warmup");
  });

  it("calls an OpenAI-compatible provider with configured auth and model", async () => {
    Bun.env.WUWEIWEAVE_TEST_API_KEY = "test-key";
    const store = new FileStore(".tmp/model-provider-test");
    const configManager = new ConfigManager(store);
    const config = configManager.createDefaultConfig();
    const prompt = config.prompts.find((candidate) => candidate.id === "solver-default");
    if (!prompt) {
      throw new Error("solver prompt missing");
    }

    const nextConfig = {
      ...config,
      providers: [
        {
          id: "mock-openai",
          name: "Mock OpenAI",
          type: "openai" as const,
          enabled: true,
          baseUrl: "https://mock.local/v1",
          apiKeyEnv: "WUWEIWEAVE_TEST_API_KEY"
        }
      ],
      models: [
        {
          id: "mock-model",
          providerId: "mock-openai",
          displayName: "Mock model",
          modelName: "mock-chat",
          contextWindow: 1000,
          supportsTools: true,
          defaultThinking: "low" as const
        }
      ]
    };

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      expect(String(input)).toBe("https://mock.local/v1/chat/completions");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
      const body = JSON.parse(String(init?.body)) as { model: string };
      expect(body.model).toBe("mock-chat");
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "mock provider ok"
              }
            }
          ]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    };
    globalThis.fetch = mockFetch as typeof fetch;

    const registry = new ModelProviderRegistry();
    const result = await registry.run({
      config: nextConfig,
      prompt: { ...prompt, modelId: "mock-model" },
      messages: [{ role: "user", content: "call real path" }],
      tools: []
    });

    expect(result.content).toBe("mock provider ok");
    expect(result.providerId).toBe("mock-openai");
  });

  it("prefers provider.apiKey over apiKeyEnv", async () => {
    Bun.env.WUWEIWEAVE_TEST_API_KEY = "env-key";
    const { config, prompt } = createMockOpenAiConfig({ apiKey: "direct-key", apiKeyEnv: "WUWEIWEAVE_TEST_API_KEY" });
    globalThis.fetch = createAuthAssertingFetch("direct-key") as typeof fetch;

    const result = await new ModelProviderRegistry().run({
      config,
      prompt,
      messages: [{ role: "user", content: "prefer configured key" }],
      tools: []
    });

    expect(result.content).toBe("mock provider ok");
  });

  it("falls back to apiKeyEnv when provider.apiKey is missing", async () => {
    Bun.env.WUWEIWEAVE_ENV_ONLY_API_KEY = "env-only-key";
    const { config, prompt } = createMockOpenAiConfig({ apiKeyEnv: "WUWEIWEAVE_ENV_ONLY_API_KEY" });
    globalThis.fetch = createAuthAssertingFetch("env-only-key") as typeof fetch;

    const result = await new ModelProviderRegistry().run({
      config,
      prompt,
      messages: [{ role: "user", content: "use env key" }],
      tools: []
    });

    expect(result.content).toBe("mock provider ok");
  });

  it("returns a clear error when no API key is configured", async () => {
    const { config, prompt } = createMockOpenAiConfig({ apiKeyEnv: "WUWEIWEAVE_ENV_ONLY_API_KEY" });
    try {
      await new ModelProviderRegistry().run({
        config,
        prompt,
        messages: [{ role: "user", content: "missing key" }],
        tools: []
      });
      throw new Error("Expected missing API key error");
    } catch (error) {
      expect(error instanceof Error ? error.message : String(error)).toContain("missing API key");
    }
  });
});

function createMockOpenAiConfig(input: { apiKey?: string; apiKeyEnv?: string }) {
  const store = new FileStore(".tmp/model-provider-test");
  const configManager = new ConfigManager(store);
  const config = configManager.createDefaultConfig();
  const prompt = config.prompts.find((candidate) => candidate.id === "solver-default");
  if (!prompt) {
    throw new Error("solver prompt missing");
  }

  const nextConfig = {
    ...config,
    providers: [
      {
        id: "mock-openai",
        name: "Mock OpenAI",
        type: "openai" as const,
        enabled: true,
        baseUrl: "https://mock.local/v1",
        ...(input.apiKey !== undefined ? { apiKey: input.apiKey } : {}),
        ...(input.apiKeyEnv !== undefined ? { apiKeyEnv: input.apiKeyEnv } : {})
      }
    ],
    models: [
      {
        id: "mock-model",
        providerId: "mock-openai",
        displayName: "Mock model",
        modelName: "mock-chat",
        contextWindow: 1000,
        supportsTools: true,
        defaultThinking: "low" as const
      }
    ]
  };

  return {
    config: nextConfig,
    prompt: { ...prompt, modelId: "mock-model" }
  };
}

function createAuthAssertingFetch(expectedKey: string) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    expect(String(input)).toBe("https://mock.local/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${expectedKey}`);
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "mock provider ok"
            }
          }
        ]
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  };
}
