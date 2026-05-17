import { Eye, EyeOff, KeyRound, RefreshCw, Save, TestTube2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useI18n } from "../i18n";
import type { ModelConfig, ProviderConfig, ProviderRoutingPolicy, SystemConfig } from "../types";

interface ProvidersPageProps {
  config: SystemConfig | undefined;
  onRefresh: () => Promise<void>;
}

export function ProvidersPage({ config, onRefresh }: ProvidersPageProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<string>();
  const [routing, setRouting] = useState<RoutingDraft>();

  useEffect(() => {
    if (!config) {
      return;
    }

    setRouting({
      mode: config.host.providerRouting.mode,
      defaultProviderId: config.host.providerRouting.defaultProviderId,
      defaultModelId: config.host.providerRouting.defaultModelId,
      fallbackProviderIds: config.host.providerRouting.fallbackProviderIds.join(", "),
      preferToolModels: config.host.providerRouting.preferToolModels
    });
  }, [config]);

  if (!config) {
    return <section className="rounded border border-stone-200 bg-white p-5 text-sm text-stone-600">{t("common.loadingProviders")}</section>;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-950">{t("providers.title")}</h1>
          <p className="mt-1 text-sm text-stone-600">{t("providers.routing")}: {config.host.providerRouting.mode}</p>
        </div>
        <button type="button" onClick={() => void onRefresh()} className="inline-flex h-9 items-center gap-2 rounded border border-stone-300 bg-white px-3 text-sm">
          <RefreshCw size={16} aria-hidden="true" />
          {t("common.refresh")}
        </button>
      </div>
      {status ? <div className="rounded border border-stone-200 bg-white px-4 py-3 text-sm">{status}</div> : null}
      {routing ? (
        <RoutingPanel
          routing={routing}
          providers={config.providers}
          models={config.models}
          onChange={setRouting}
          onSave={async () => {
            const next: ProviderRoutingPolicy = {
              ...config.host.providerRouting,
              mode: routing.mode,
              defaultProviderId: routing.defaultProviderId,
              defaultModelId: routing.defaultModelId,
              fallbackProviderIds: routing.fallbackProviderIds
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
              preferToolModels: routing.preferToolModels
            };
            await api.updateProviderRouting(next);
            setStatus(t("providers.routingSaved"));
            await onRefresh();
          }}
        />
      ) : null}
      <div className="grid gap-4 xl:grid-cols-2">
        {config.providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            models={config.models.filter((model) => model.providerId === provider.id)}
            onSaveApiKey={async (apiKey) => {
              await api.upsertProvider({ ...provider, apiKey });
              setStatus(apiKey.trim().length > 0 ? t("providers.apiKeySaved") : t("providers.apiKeyCleared"));
              await onRefresh();
            }}
            onTest={async (modelId) => {
              const result = await api.testProvider({ providerId: provider.id, ...(modelId ? { modelId } : {}) });
              setStatus(result.ok ? `${provider.id}: ${result.content ?? t("common.ok")}` : result.error ?? t("providers.testFailed"));
            }}
          />
        ))}
      </div>
    </section>
  );
}

type RoutingDraft = {
  mode: ProviderRoutingPolicy["mode"];
  defaultProviderId: string;
  defaultModelId: string;
  fallbackProviderIds: string;
  preferToolModels: boolean;
};

function RoutingPanel({
  routing,
  providers,
  models,
  onChange,
  onSave
}: {
  routing: RoutingDraft;
  providers: ProviderConfig[];
  models: ModelConfig[];
  onChange: (routing: RoutingDraft) => void;
  onSave: () => Promise<void>;
}) {
  const { t } = useI18n();
  const providerModels = models.filter((model) => model.providerId === routing.defaultProviderId);

  return (
    <div className="rounded border border-stone-200 bg-white p-4">
      <div className="grid gap-3 lg:grid-cols-5">
        <label className="text-xs font-medium text-stone-600">
          {t("providers.mode")}
          <select
            value={routing.mode}
            onChange={(event) => onChange({ ...routing, mode: event.target.value as ProviderRoutingPolicy["mode"] })}
            className="mt-1 h-9 w-full rounded border border-stone-300 bg-white px-2 text-sm text-neutral-900"
          >
            <option value="default">default</option>
            <option value="capability">capability</option>
            <option value="cost">cost</option>
          </select>
        </label>
        <label className="text-xs font-medium text-stone-600">
          {t("providers.defaultProvider")}
          <select
            value={routing.defaultProviderId}
            onChange={(event) => {
              const nextProviderId = event.target.value;
              const nextModelId = models.find((model) => model.providerId === nextProviderId)?.id ?? routing.defaultModelId;
              onChange({ ...routing, defaultProviderId: nextProviderId, defaultModelId: nextModelId });
            }}
            className="mt-1 h-9 w-full rounded border border-stone-300 bg-white px-2 text-sm text-neutral-900"
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-stone-600">
          {t("providers.defaultModel")}
          <select
            value={routing.defaultModelId}
            onChange={(event) => onChange({ ...routing, defaultModelId: event.target.value })}
            className="mt-1 h-9 w-full rounded border border-stone-300 bg-white px-2 text-sm text-neutral-900"
          >
            {providerModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-stone-600">
          {t("providers.fallbackProviders")}
          <input
            value={routing.fallbackProviderIds}
            onChange={(event) => onChange({ ...routing, fallbackProviderIds: event.target.value })}
            className="mt-1 h-9 w-full rounded border border-stone-300 px-2 text-sm text-neutral-900"
          />
        </label>
        <div className="flex items-end gap-3">
          <label className="inline-flex h-9 items-center gap-2 text-xs font-medium text-stone-600">
            <input
              type="checkbox"
              checked={routing.preferToolModels}
              onChange={(event) => onChange({ ...routing, preferToolModels: event.target.checked })}
            />
            {t("providers.tools")}
          </label>
          <button type="button" onClick={() => void onSave()} className="inline-flex h-9 items-center gap-2 rounded border border-stone-300 bg-white px-3 text-sm hover:bg-stone-50">
            <Save size={16} aria-hidden="true" />
            {t("providers.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProviderCard({
  provider,
  models,
  onSaveApiKey,
  onTest
}: {
  provider: ProviderConfig;
  models: ModelConfig[];
  onSaveApiKey: (apiKey: string) => Promise<void>;
  onTest: (modelId?: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingApiKey, setSavingApiKey] = useState(false);
  const canEditApiKey = provider.type !== "local";

  return (
    <div className="rounded border border-stone-200 bg-white">
      <div className="border-b border-stone-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{provider.name}</h2>
            <p className="mt-1 text-xs text-stone-500">{provider.baseUrl ?? provider.type}</p>
          </div>
          <span className="rounded bg-stone-100 px-2 py-1 text-xs">{provider.enabled ? t("common.enabled") : t("common.disabled")}</span>
        </div>
      </div>
      {canEditApiKey ? (
        <div className="border-b border-stone-100 px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-stone-600">
              <KeyRound size={14} aria-hidden="true" />
              {t("providers.apiKey")}
            </div>
            <div className="text-xs text-stone-500">
              {provider.hasApiKey
                ? `${t("providers.apiKeyConfigured")} ${provider.maskedApiKey ?? ""}`.trim()
                : t("providers.apiKeyMissing")}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
            <input
              type={showApiKey ? "text" : "password"}
              value={apiKeyDraft}
              onChange={(event) => setApiKeyDraft(event.target.value)}
              placeholder={provider.hasApiKey ? t("providers.apiKeyKeepPlaceholder") : t("providers.apiKeyPlaceholder")}
              className="h-9 min-w-0 rounded border border-stone-300 px-3 text-sm"
            />
            <button
              type="button"
              title={showApiKey ? t("providers.hideApiKey") : t("providers.showApiKey")}
              onClick={() => setShowApiKey((value) => !value)}
              className="inline-flex h-9 items-center justify-center rounded border border-stone-300 px-3 text-sm hover:bg-stone-50"
            >
              {showApiKey ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
            <button
              type="button"
              disabled={savingApiKey || apiKeyDraft.trim().length === 0}
              onClick={async () => {
                setSavingApiKey(true);
                try {
                  await onSaveApiKey(apiKeyDraft);
                  setApiKeyDraft("");
                } finally {
                  setSavingApiKey(false);
                }
              }}
              className="inline-flex h-9 items-center gap-2 rounded border border-stone-300 px-3 text-sm hover:bg-stone-50 disabled:bg-stone-100"
            >
              <Save size={16} aria-hidden="true" />
              {savingApiKey ? t("config.saving") : t("providers.saveApiKey")}
            </button>
            <button
              type="button"
              disabled={savingApiKey || !provider.hasApiKey}
              onClick={async () => {
                setSavingApiKey(true);
                try {
                  await onSaveApiKey("");
                  setApiKeyDraft("");
                } finally {
                  setSavingApiKey(false);
                }
              }}
              className="inline-flex h-9 items-center gap-2 rounded border border-stone-300 px-3 text-sm hover:bg-stone-50 disabled:bg-stone-100"
            >
              <Trash2 size={16} aria-hidden="true" />
              {t("providers.clearApiKey")}
            </button>
          </div>
        </div>
      ) : null}
      <div className="divide-y divide-stone-100">
        {models.map((model) => (
          <div key={model.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{model.displayName}</div>
              <div className="truncate text-xs text-stone-500">
                {model.modelName ?? model.id} / {t("providers.ctx")} {model.contextWindow} / {t("providers.tools")} {model.supportsTools ? t("common.yes") : t("common.no")}
              </div>
            </div>
            <button type="button" onClick={() => void onTest(model.id)} className="inline-flex h-8 items-center gap-2 rounded border border-stone-300 px-2 text-xs hover:bg-stone-50">
              <TestTube2 size={14} aria-hidden="true" />
              {t("providers.test")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
