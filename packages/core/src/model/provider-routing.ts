import type { ModelConfig, PromptConfig, ProviderConfig, ProviderRoutingPolicy, SystemConfig } from "../types/config";
import type { StartSolverInput } from "../types/runtime";

export interface ProviderRoute {
  provider: ProviderConfig;
  model: ModelConfig;
  reason: string;
}

export function resolveProviderRoute(config: SystemConfig, prompt: PromptConfig, input: StartSolverInput): ProviderRoute {
  const policy: ProviderRoutingPolicy = {
    ...config.host.providerRouting,
    ...(input.routingMode ? { mode: input.routingMode } : {})
  };

  const explicitModel = input.modelId ? findModel(config, input.modelId) : undefined;
  if (explicitModel) {
    return {
      provider: requireProvider(config, explicitModel.providerId),
      model: explicitModel,
      reason: "explicit-model"
    };
  }

  const explicitProvider = input.providerId ? findProvider(config, input.providerId) : undefined;
  if (explicitProvider) {
    const model = selectModelForProvider(config.models, explicitProvider, policy, prompt);
    if (model) {
      return { provider: explicitProvider, model, reason: "explicit-provider" };
    }
  }

  const promptModel = findModel(config, prompt.modelId);
  const promptProvider = promptModel ? findProvider(config, promptModel.providerId) : undefined;
  if (policy.mode === "default" && promptModel && promptProvider?.enabled) {
    return { provider: promptProvider, model: promptModel, reason: "prompt-default" };
  }

  const candidates = config.models
    .map((model) => ({ model, provider: findProvider(config, model.providerId) }))
    .filter((item): item is { model: ModelConfig; provider: ProviderConfig } => Boolean(item.provider?.enabled));

  const preferredProviderIds = [
    policy.defaultProviderId,
    ...policy.fallbackProviderIds,
    promptProvider?.id
  ].filter((item): item is string => Boolean(item));

  const ordered = [...candidates].sort((left, right) => {
    const leftProviderRank = rank(preferredProviderIds, left.provider.id);
    const rightProviderRank = rank(preferredProviderIds, right.provider.id);
    if (leftProviderRank !== rightProviderRank) {
      return leftProviderRank - rightProviderRank;
    }

    if (policy.mode === "capability") {
      return Number(right.model.supportsTools) - Number(left.model.supportsTools);
    }

    if (policy.mode === "cost") {
      return estimateModelCost(left.provider) - estimateModelCost(right.provider);
    }

    return 0;
  });

  const selected = ordered.find((item) => {
    if (!policy.preferToolModels) {
      return true;
    }

    return item.model.supportsTools;
  }) ?? ordered[0];

  if (!selected) {
    throw new Error("No enabled provider/model route is available");
  }

  return {
    provider: selected.provider,
    model: selected.model,
    reason: `policy-${policy.mode}`
  };
}

function selectModelForProvider(
  models: ModelConfig[],
  provider: ProviderConfig,
  policy: ProviderRoutingPolicy,
  prompt: PromptConfig
): ModelConfig | undefined {
  const providerModels = models.filter((model) => model.providerId === provider.id);
  return (
    providerModels.find((model) => model.id === provider.defaultModelId) ??
    providerModels.find((model) => model.id === policy.defaultModelId) ??
    providerModels.find((model) => model.id === prompt.modelId) ??
    providerModels[0]
  );
}

function findModel(config: SystemConfig, modelId: string): ModelConfig | undefined {
  return config.models.find((model) => model.id === modelId);
}

function findProvider(config: SystemConfig, providerId: string): ProviderConfig | undefined {
  return config.providers.find((provider) => provider.id === providerId);
}

function requireProvider(config: SystemConfig, providerId: string): ProviderConfig {
  const provider = findProvider(config, providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`);
  }

  return provider;
}

function rank(ids: string[], value: string): number {
  const index = ids.indexOf(value);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function estimateModelCost(provider: ProviderConfig): number {
  return (provider.costPerInput1k ?? 0) + (provider.costPerOutput1k ?? 0);
}
