import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { createDefaultDaemon } from "@wuweiweave/core";
import { handleApiRequest } from "../src/server/api-router";

let cleanupPath: string | undefined;

describe("Web API config responses", () => {
  afterEach(async () => {
    if (cleanupPath) {
      await rm(cleanupPath, { recursive: true, force: true });
      cleanupPath = undefined;
    }
  });

  it("masks provider api keys in config responses", async () => {
    cleanupPath = await mkdtemp(path.join(os.tmpdir(), "wuweiweave-ui-api-"));
    const daemon = await createDefaultDaemon(cleanupPath);
    const config = await daemon.config.getConfig();
    const provider = config.providers.find((candidate) => candidate.id === "openai");
    if (!provider) {
      throw new Error("openai provider missing");
    }

    await daemon.config.upsertProvider({
      ...provider,
      apiKey: "sk-test-secret-123456"
    });

    const configResponse = await handleApiRequest(new Request("http://localhost/api/config"), daemon);
    const configBody = (await configResponse.json()) as { providers: Array<Record<string, unknown>> };
    const configProvider = configBody.providers.find((candidate) => candidate.id === "openai");

    expect(configProvider?.apiKey).toBeUndefined();
    expect(configProvider?.hasApiKey).toBe(true);
    expect(configProvider?.maskedApiKey).toBe("********3456");

    const providersResponse = await handleApiRequest(new Request("http://localhost/api/config/providers"), daemon);
    const providersBody = (await providersResponse.json()) as Array<Record<string, unknown>>;
    const providersProvider = providersBody.find((candidate) => candidate.id === "openai");

    expect(providersProvider?.apiKey).toBeUndefined();
    expect(providersProvider?.hasApiKey).toBe(true);
    expect(providersProvider?.maskedApiKey).toBe("********3456");
  });

  it("replaces config items by previous id and preserves stored provider keys", async () => {
    cleanupPath = await mkdtemp(path.join(os.tmpdir(), "wuweiweave-ui-api-"));
    const daemon = await createDefaultDaemon(cleanupPath);
    const config = await daemon.config.getConfig();
    const provider = config.providers.find((candidate) => candidate.id === "openai");
    if (!provider) {
      throw new Error("openai provider missing");
    }

    await daemon.config.upsertProvider({
      ...provider,
      apiKey: "sk-preserved-secret"
    });

    const response = await handleApiRequest(
      new Request("http://localhost/api/config/providers/openai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...provider,
          id: "relay-openai",
          name: "Relay OpenAI",
          hasApiKey: true,
          maskedApiKey: "********cret"
        })
      }),
      daemon
    );
    const body = (await response.json()) as { providers: Array<Record<string, unknown>> };

    expect(body.providers.some((candidate) => candidate.id === "openai")).toBe(false);
    expect(body.providers.some((candidate) => candidate.id === "relay-openai")).toBe(true);
    expect(body.providers.find((candidate) => candidate.id === "relay-openai")?.apiKey).toBeUndefined();

    const stored = await daemon.config.getConfig();
    const storedProvider = stored.providers.find((candidate) => candidate.id === "relay-openai");
    expect(storedProvider?.apiKey).toBe("sk-preserved-secret");
  });
});
