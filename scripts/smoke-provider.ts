import { createDefaultDaemon } from "@wuweiweave/core";
import type { ModelConfig, PromptConfig, ProviderConfig } from "@wuweiweave/core";

const apiKeyEnv = Bun.env.WUWEIWEAVE_PROVIDER_API_KEY_ENV ?? "OPENAI_API_KEY";
const baseUrl = Bun.env.WUWEIWEAVE_PROVIDER_BASE_URL ?? "https://api.openai.com/v1";
const modelName = Bun.env.WUWEIWEAVE_PROVIDER_MODEL ?? "gpt-4.1-mini";

if (Bun.env.WUWEIWEAVE_RUN_PROVIDER_SMOKE !== "1") {
  console.log(
    JSON.stringify(
      {
        ok: false,
        skipped: true,
        reason: "Live provider smoke is opt-in. Set WUWEIWEAVE_RUN_PROVIDER_SMOKE=1 to call the configured provider."
      },
      null,
      2
    )
  );
  process.exit(0);
}

if (!Bun.env[apiKeyEnv]) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        skipped: true,
        reason: `Missing ${apiKeyEnv}. Set it to run a real OpenAI-compatible provider smoke.`
      },
      null,
      2
    )
  );
  process.exit(0);
}

const daemon = await createDefaultDaemon(Bun.env.WUWEIWEAVE_HOME);
const provider: ProviderConfig = {
  id: "openai-smoke",
  name: "OpenAI compatible smoke",
  type: "openai",
  enabled: true,
  baseUrl,
  apiKeyEnv
};
const model: ModelConfig = {
  id: "openai-smoke-model",
  providerId: provider.id,
  displayName: modelName,
  modelName,
  contextWindow: 128000,
  supportsTools: true,
  defaultThinking: "low"
};
const config = await daemon.config.getConfig();
const basePrompt = daemon.config.findPrompt(config, "solver-default");
const prompt: PromptConfig = {
  ...basePrompt,
  id: "provider-smoke",
  name: "provider-smoke",
  modelId: model.id,
  thinking: "low",
  builtinTools: ["shell.run", "file.write", "file.read"],
  systemPrompt:
    "You are a smoke-test solver. Reply in one concise sentence. If you call a tool, use only file.write or file.read."
};

await daemon.config.upsertProvider(provider);
await daemon.config.upsertModel(model);
await daemon.config.upsertPrompt(prompt);

const solver = await daemon.startSolver({
  task: "Say WuWeiWeave provider smoke is alive.",
  promptName: prompt.id
});
const messages = await daemon.runtime.getMessages(solver.id);

console.log(
  JSON.stringify(
    {
      ok: solver.status !== "failed",
      solverId: solver.id,
      status: solver.status,
      messageCount: messages.length,
      observer: solver.observer,
      latestAssistant: messages.filter((message) => message.role === "assistant").at(-1)?.content
    },
    null,
    2
  )
);

if (solver.status === "failed") {
  process.exit(1);
}
