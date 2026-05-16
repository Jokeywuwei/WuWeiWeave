import { afterEach, describe, expect, it } from "bun:test";
import { ConfigManager, FileStore, ModelProviderRegistry } from "../src/index";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete Bun.env.WUWEIWEAVE_TEST_API_KEY;
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
});
