import { Eye, EyeOff, Plus, RefreshCw, Save, TestTube2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../api";
import { useI18n } from "../i18n";
import type { McpServerConfig, ModelConfig, PromptConfig, ProviderConfig, SystemConfig } from "../types";

interface ConfigPageProps {
  config: SystemConfig | undefined;
  onRefresh: () => Promise<void>;
}

type EditableSection = "providers" | "models" | "prompts" | "mcp";
type CardStatus = "clean" | "dirty" | "saving" | "saved" | "error";

const providerTypes: ProviderConfig["type"][] = ["local", "openai", "anthropic", "custom"];
const thinkingLevels: ModelConfig["defaultThinking"][] = ["none", "low", "medium", "high", "xhigh"];
const promptRoles: PromptConfig["role"][] = ["manager", "solver", "observer", "subagent"];

export function ConfigPage({ config, onRefresh }: ConfigPageProps) {
  const { t } = useI18n();
  const [section, setSection] = useState<EditableSection>("providers");
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonStatus, setJsonStatus] = useState<string>();
  const [jsonSaving, setJsonSaving] = useState(false);

  useEffect(() => {
    if (!config) {
      setJsonDraft("");
      return;
    }

    setJsonDraft(JSON.stringify(readSection(config, section), null, 2));
  }, [config, section]);

  if (!config) {
    return <section className="rounded border border-stone-200 bg-white p-5 text-sm text-stone-600">{t("common.loadingConfig")}</section>;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-950">{t("config.title")}</h1>
          <p className="mt-1 text-sm text-stone-600">{config.host.workspaceRoot}</p>
        </div>
        <button type="button" onClick={() => void onRefresh()} className="inline-flex h-9 items-center gap-2 rounded border border-stone-300 bg-white px-3 text-sm hover:bg-stone-50">
          <RefreshCw size={16} aria-hidden="true" />
          {t("common.refresh")}
        </button>
      </div>

      <div className="grid grid-cols-4 rounded border border-stone-300 bg-white p-1">
        {(["providers", "models", "prompts", "mcp"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setSection(item)}
            className={`h-9 rounded text-sm ${section === item ? "bg-neutral-950 text-white" : "text-stone-700 hover:bg-stone-50"}`}
          >
            {sectionLabel(item, t)}
          </button>
        ))}
      </div>

      {section === "providers" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {config.providers.map((provider) => (
            <ProviderConfigCard key={provider.id} provider={provider} onRefresh={onRefresh} />
          ))}
        </div>
      ) : null}

      {section === "models" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {config.models.map((model) => (
            <ModelConfigCard key={model.id} model={model} providers={config.providers} onRefresh={onRefresh} />
          ))}
        </div>
      ) : null}

      {section === "prompts" ? (
        <div className="grid gap-4">
          {config.prompts.map((prompt) => (
            <PromptConfigCard key={prompt.id} prompt={prompt} models={config.models} onRefresh={onRefresh} />
          ))}
        </div>
      ) : null}

      {section === "mcp" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {config.mcpServers.map((server) => (
            <McpServerConfigCard key={server.id} server={server} onRefresh={onRefresh} />
          ))}
          <McpCapabilitiesPanel config={config} onRefresh={onRefresh} />
        </div>
      ) : null}

      <details className="rounded border border-stone-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">{t("config.advancedJson")}</summary>
        <div className="space-y-3 border-t border-stone-200 p-4">
          {jsonStatus ? <div className="rounded border border-stone-200 px-3 py-2 text-sm text-stone-700">{jsonStatus}</div> : null}
          <textarea
            value={jsonDraft}
            onChange={(event) => setJsonDraft(event.target.value)}
            spellCheck={false}
            className="min-h-[360px] w-full rounded border border-stone-300 bg-neutral-950 p-3 font-mono text-xs leading-5 text-stone-100"
          />
          <button
            type="button"
            title={t("config.saveSectionTitle")}
            disabled={jsonSaving}
            onClick={async () => {
              setJsonSaving(true);
              setJsonStatus(undefined);
              try {
                await saveSection(section, jsonDraft, t("config.jsonArrayRequired"));
                await onRefresh();
                setJsonStatus(`${t("config.saved")} ${sectionLabel(section, t)}`);
              } catch (error) {
                setJsonStatus(error instanceof Error ? error.message : t("config.saveFailed"));
              } finally {
                setJsonSaving(false);
              }
            }}
            className="inline-flex h-9 items-center gap-2 rounded bg-neutral-950 px-3 text-sm font-medium text-white disabled:bg-stone-300"
          >
            <Save size={16} aria-hidden="true" />
            {jsonSaving ? t("config.saving") : t("config.save")}
          </button>
        </div>
      </details>

      <div className="rounded border border-stone-200 bg-white p-4">
        <h2 className="text-sm font-semibold">{t("config.hostSettings")}</h2>
        <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
          <Field label={t("config.web")} value={`${config.host.webHost}:${config.host.webPort}`} />
          <Field label={t("config.runtimeImage")} value={config.host.defaultRuntimeImage} />
          <Field label={t("config.dockerNetwork")} value={config.host.dockerNetwork} />
          <Field label={t("config.shellTools")} value={config.host.allowShellTools ? t("common.enabled") : t("common.disabled")} />
        </dl>
      </div>
    </section>
  );
}

function ProviderConfigCard({ provider, onRefresh }: { provider: ProviderConfig; onRefresh: () => Promise<void> }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => provider);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [status, setStatus] = useState<CardStatus>("clean");
  const [message, setMessage] = useState<string>();
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (status === "dirty" || status === "saving") {
      return;
    }

    setDraft(provider);
    setApiKeyDraft("");
  }, [provider, status]);

  const update = (patch: Partial<ProviderConfig>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setStatus("dirty");
    setMessage(undefined);
  };

  const save = async (withApiKey?: string) => {
    setStatus("saving");
    setMessage(undefined);
    try {
      const body = cleanProvider({
        ...draft,
        ...(withApiKey !== undefined ? { apiKey: withApiKey } : {})
      });
      if (draft.id === provider.id) {
        await api.upsertProvider(body);
      } else {
        await api.replaceProvider(provider.id, body);
      }
      setStatus("saved");
      setApiKeyDraft("");
      setMessage(t("config.saveSucceeded"));
      await onRefresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : t("config.saveFailed"));
    }
  };

  return (
    <section className="rounded border border-stone-200 bg-white">
      <CardHeader title={draft.name || draft.id} status={status} message={message} />
      <div className="grid gap-3 p-4 md:grid-cols-2">
        <TextField label="id" value={draft.id} onChange={(value) => update({ id: value })} />
        <TextField label={t("config.name")} value={draft.name} onChange={(value) => update({ name: value })} />
        <SelectField label="type" value={draft.type} options={providerTypes} onChange={(value) => update({ type: value as ProviderConfig["type"] })} />
        <label className="flex h-9 items-center gap-2 self-end text-sm text-stone-700">
          <input type="checkbox" checked={draft.enabled} onChange={(event) => update({ enabled: event.target.checked })} />
          {t("common.enabled")}
        </label>
        <TextField label="baseUrl" value={draft.baseUrl ?? ""} onChange={(value) => update({ baseUrl: value })} />
        <TextField label="apiKeyEnv" value={draft.apiKeyEnv ?? ""} onChange={(value) => update({ apiKeyEnv: value })} />
        <label className="flex h-9 items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={draft.supportsTools ?? true} onChange={(event) => update({ supportsTools: event.target.checked })} />
          {t("config.supportsTools")}
        </label>
        <label className="flex h-9 items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={draft.supportsResponsesApi ?? false} onChange={(event) => update({ supportsResponsesApi: event.target.checked })} />
          {t("config.supportsResponsesApi")}
        </label>
        <label className="flex h-9 items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={draft.supportsWebsockets ?? false} onChange={(event) => update({ supportsWebsockets: event.target.checked })} />
          {t("config.supportsWebsockets")}
        </label>
      </div>
      {draft.type !== "local" ? (
        <div className="border-t border-stone-100 p-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs text-stone-600">
            <span className="font-medium">{t("providers.apiKey")}</span>
            <span>{provider.hasApiKey ? `${t("providers.apiKeyConfigured")} ${provider.maskedApiKey ?? ""}`.trim() : t("providers.apiKeyMissing")}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
            <input
              type={showApiKey ? "text" : "password"}
              value={apiKeyDraft}
              onChange={(event) => setApiKeyDraft(event.target.value)}
              placeholder={provider.hasApiKey ? t("providers.apiKeyKeepPlaceholder") : t("providers.apiKeyPlaceholder")}
              className="h-9 rounded border border-stone-300 px-3 text-sm"
            />
            <IconButton title={showApiKey ? t("providers.hideApiKey") : t("providers.showApiKey")} onClick={() => setShowApiKey((value) => !value)}>
              {showApiKey ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </IconButton>
            <ActionButton disabled={status === "saving" || apiKeyDraft.trim().length === 0} onClick={() => void save(apiKeyDraft)}>
              <Save size={16} aria-hidden="true" />
              {t("providers.saveApiKey")}
            </ActionButton>
            <ActionButton disabled={status === "saving" || !provider.hasApiKey} onClick={() => void save("")}>
              <Trash2 size={16} aria-hidden="true" />
              {t("providers.clearApiKey")}
            </ActionButton>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 border-t border-stone-100 p-4">
        <ActionButton disabled={status === "saving"} onClick={() => void save()}>
          <Save size={16} aria-hidden="true" />
          {status === "saving" ? t("config.saving") : t("config.saveCard")}
        </ActionButton>
        <ActionButton
          disabled={testing}
          onClick={async () => {
            setTesting(true);
            setMessage(undefined);
            try {
              const result = await api.testProvider({ providerId: provider.id });
              setMessage(result.ok ? result.content ?? t("common.ok") : result.error ?? t("config.providerTestFailed"));
            } catch (error) {
              setMessage(error instanceof Error ? error.message : t("config.providerTestFailed"));
            } finally {
              setTesting(false);
            }
          }}
        >
          <TestTube2 size={16} aria-hidden="true" />
          {testing ? t("config.testing") : t("config.test")}
        </ActionButton>
      </div>
    </section>
  );
}

function ModelConfigCard({
  model,
  providers,
  onRefresh
}: {
  model: ModelConfig;
  providers: ProviderConfig[];
  onRefresh: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => model);
  const [status, setStatus] = useState<CardStatus>("clean");
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (status === "dirty" || status === "saving") {
      return;
    }

    setDraft(model);
  }, [model, status]);

  const update = (patch: Partial<ModelConfig>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setStatus("dirty");
    setMessage(undefined);
  };

  const save = async () => {
    setStatus("saving");
    setMessage(undefined);
    try {
      const body = {
        ...cleanModel(draft),
        contextWindow: Number(draft.contextWindow)
      };
      if (draft.id === model.id) {
        await api.upsertModel(body);
      } else {
        await api.replaceModel(model.id, body);
      }
      setStatus("saved");
      setMessage(t("config.saveSucceeded"));
      await onRefresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : t("config.saveFailed"));
    }
  };

  return (
    <section className="rounded border border-stone-200 bg-white">
      <CardHeader title={draft.displayName || draft.id} status={status} message={message} />
      <div className="grid gap-3 p-4 md:grid-cols-2">
        <TextField label="id" value={draft.id} onChange={(value) => update({ id: value })} />
        <SelectField label="providerId" value={draft.providerId} options={providers.map((provider) => provider.id)} onChange={(value) => update({ providerId: value })} />
        <TextField label="displayName" value={draft.displayName} onChange={(value) => update({ displayName: value })} />
        <TextField label="modelName" value={draft.modelName ?? ""} onChange={(value) => update({ modelName: value })} />
        <NumberField label="contextWindow" value={draft.contextWindow} onChange={(value) => update({ contextWindow: value })} />
        <SelectField label="defaultThinking" value={draft.defaultThinking} options={thinkingLevels} onChange={(value) => update({ defaultThinking: value as ModelConfig["defaultThinking"] })} />
        <label className="flex h-9 items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={draft.supportsTools} onChange={(event) => update({ supportsTools: event.target.checked })} />
          supportsTools
        </label>
      </div>
      <div className="border-t border-stone-100 p-4">
        <ActionButton disabled={status === "saving"} onClick={() => void save()}>
          <Save size={16} aria-hidden="true" />
          {status === "saving" ? t("config.saving") : t("config.saveCard")}
        </ActionButton>
      </div>
    </section>
  );
}

function PromptConfigCard({
  prompt,
  models,
  onRefresh
}: {
  prompt: PromptConfig;
  models: ModelConfig[];
  onRefresh: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => prompt);
  const [status, setStatus] = useState<CardStatus>("clean");
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (status === "dirty" || status === "saving") {
      return;
    }

    setDraft(prompt);
  }, [prompt, status]);

  const update = (patch: Partial<PromptConfig>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setStatus("dirty");
    setMessage(undefined);
  };

  const save = async () => {
    setStatus("saving");
    setMessage(undefined);
    try {
      if (draft.id === prompt.id) {
        await api.upsertPrompt(draft);
      } else {
        await api.replacePrompt(prompt.id, draft);
      }
      setStatus("saved");
      setMessage(t("config.saveSucceeded"));
      await onRefresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : t("config.saveFailed"));
    }
  };

  return (
    <section className="rounded border border-stone-200 bg-white">
      <CardHeader title={draft.name || draft.id} status={status} message={message} />
      <div className="grid gap-3 p-4 md:grid-cols-2">
        <TextField label="id" value={draft.id} onChange={(value) => update({ id: value })} />
        <TextField label="name" value={draft.name} onChange={(value) => update({ name: value })} />
        <SelectField label="role" value={draft.role} options={promptRoles} onChange={(value) => update({ role: value as PromptConfig["role"] })} />
        <SelectField label="modelId" value={draft.modelId} options={models.map((model) => model.id)} onChange={(value) => update({ modelId: value })} />
        <SelectField label="thinking" value={draft.thinking} options={thinkingLevels} onChange={(value) => update({ thinking: value as PromptConfig["thinking"] })} />
      </div>
      <div className="px-4 pb-4">
        <label className="text-xs font-medium text-stone-600">
          {t("config.promptContent")}
          <textarea
            value={draft.systemPrompt}
            onChange={(event) => update({ systemPrompt: event.target.value })}
            className="mt-1 min-h-[220px] w-full rounded border border-stone-300 px-3 py-2 text-sm leading-6"
          />
        </label>
      </div>
      <div className="border-t border-stone-100 p-4">
        <ActionButton disabled={status === "saving"} onClick={() => void save()}>
          <Save size={16} aria-hidden="true" />
          {status === "saving" ? t("config.saving") : t("config.saveCard")}
        </ActionButton>
      </div>
    </section>
  );
}

function McpServerConfigCard({ server, onRefresh }: { server: McpServerConfig; onRefresh: () => Promise<void> }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => server);
  const [status, setStatus] = useState<CardStatus>("clean");
  const [message, setMessage] = useState<string>();
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    if (status === "dirty" || status === "saving") {
      return;
    }

    setDraft(server);
  }, [server, status]);

  const update = (patch: Partial<McpServerConfig>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setStatus("dirty");
    setMessage(undefined);
  };

  const save = async () => {
    setStatus("saving");
    setMessage(undefined);
    try {
      if (draft.id === server.id) {
        await api.upsertMcpServer(draft);
      } else {
        await api.replaceMcpServer(server.id, draft);
      }
      setStatus("saved");
      setMessage(t("config.saveSucceeded"));
      await onRefresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : t("config.saveFailed"));
    }
  };

  return (
    <section className="rounded border border-stone-200 bg-white">
      <CardHeader title={draft.name || draft.id} status={status} message={message} />
      <div className="grid gap-3 p-4 md:grid-cols-2">
        <TextField label="id" value={draft.id} onChange={(value) => update({ id: value })} />
        <TextField label={t("config.name")} value={draft.name} onChange={(value) => update({ name: value })} />
        <TextField label="command" value={draft.command} onChange={(value) => update({ command: value })} />
        <NumberField label="timeoutMs" value={draft.timeoutMs ?? 0} onChange={(value) => update(value > 0 ? { timeoutMs: value } : {})} />
        <label className="flex h-9 items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={draft.enabled} onChange={(event) => update({ enabled: event.target.checked })} />
          {t("common.enabled")}
        </label>
      </div>
      <div className="px-4 pb-4">
        <div className="mb-2 text-xs font-medium text-stone-600">args</div>
        <div className="space-y-2">
          {draft.args.map((arg, index) => (
            <div key={`${index}:${arg}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                value={arg}
                onChange={(event) => {
                  const nextArgs = [...draft.args];
                  nextArgs[index] = event.target.value;
                  update({ args: nextArgs });
                }}
                className="h-9 rounded border border-stone-300 px-3 text-sm"
              />
              <IconButton
                title={t("config.removeArg")}
                onClick={() => update({ args: draft.args.filter((_, candidateIndex) => candidateIndex !== index) })}
              >
                <Trash2 size={16} aria-hidden="true" />
              </IconButton>
            </div>
          ))}
          <button type="button" onClick={() => update({ args: [...draft.args, ""] })} className="inline-flex h-9 items-center gap-2 rounded border border-stone-300 px-3 text-sm hover:bg-stone-50">
            <Plus size={16} aria-hidden="true" />
            {t("config.addArg")}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-stone-100 p-4">
        <ActionButton disabled={status === "saving"} onClick={() => void save()}>
          <Save size={16} aria-hidden="true" />
          {status === "saving" ? t("config.saving") : t("config.saveCard")}
        </ActionButton>
        <ActionButton
          disabled={discovering}
          onClick={async () => {
            setDiscovering(true);
            setMessage(undefined);
            try {
              await api.discoverMcp(server.id);
              await onRefresh();
              setMessage(t("config.discoveryRefreshed"));
            } catch (error) {
              setMessage(error instanceof Error ? error.message : t("config.discoveryFailed"));
            } finally {
              setDiscovering(false);
            }
          }}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {discovering ? t("config.testing") : t("config.discover")}
        </ActionButton>
      </div>
    </section>
  );
}

function McpCapabilitiesPanel({ config, onRefresh }: { config: SystemConfig; onRefresh: () => Promise<void> }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<string>();
  return (
    <section className="rounded border border-stone-200 bg-white">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{t("config.mcpCapabilities")}</h2>
          {status ? <p className="mt-1 text-xs text-stone-500">{status}</p> : null}
        </div>
        <button
          type="button"
          onClick={async () => {
            setStatus(undefined);
            try {
              await api.discoverMcp();
              await onRefresh();
              setStatus(t("config.discoveryRefreshed"));
            } catch (error) {
              setStatus(error instanceof Error ? error.message : t("config.discoveryFailed"));
            }
          }}
          className="h-8 rounded border border-stone-300 px-2 text-xs hover:bg-stone-50"
        >
          {t("config.discover")}
        </button>
      </div>
      <div className="divide-y divide-stone-100">
        {Object.values(config.mcpCapabilities).length === 0 ? (
          <div className="px-4 py-6 text-sm text-stone-500">{t("config.noDiscoveredCapabilities")}</div>
        ) : (
          Object.values(config.mcpCapabilities).map((snapshot) => (
            <div key={snapshot.serverId} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">{snapshot.serverId}</div>
                <div className="text-xs text-stone-500">{snapshot.ok ? "ok" : snapshot.error}</div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-stone-600">
                <span>{snapshot.tools.length} tools</span>
                <span>{snapshot.resources.length} resources</span>
                <span>{snapshot.prompts.length} prompts</span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function CardHeader({ title, status, message }: { title: string; status: CardStatus; message?: string | undefined }) {
  const { t } = useI18n();
  return (
    <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-4 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold">{title}</h2>
        {message ? <p className={`mt-1 text-xs ${status === "error" ? "text-rose-600" : "text-stone-500"}`}>{message}</p> : null}
      </div>
      <span className={`shrink-0 rounded px-2 py-1 text-xs ${status === "dirty" ? "bg-amber-100 text-amber-800" : status === "error" ? "bg-rose-100 text-rose-700" : "bg-stone-100 text-stone-600"}`}>
        {statusLabel(status, t)}
      </span>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs font-medium text-stone-600">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded border border-stone-300 px-3 text-sm text-neutral-900" />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="text-xs font-medium text-stone-600">
      {label}
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 h-9 w-full rounded border border-stone-300 px-3 text-sm text-neutral-900" />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-medium text-stone-600">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded border border-stone-300 bg-white px-2 text-sm text-neutral-900">
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick} className="inline-flex h-9 items-center justify-center rounded border border-stone-300 px-3 text-sm hover:bg-stone-50">
      {children}
    </button>
  );
}

function ActionButton({
  disabled,
  onClick,
  children
}: {
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="inline-flex h-9 items-center gap-2 rounded border border-stone-300 bg-white px-3 text-sm hover:bg-stone-50 disabled:bg-stone-100">
      {children}
    </button>
  );
}

function readSection(config: SystemConfig, section: EditableSection): unknown[] {
  switch (section) {
    case "providers":
      return config.providers;
    case "models":
      return config.models;
    case "prompts":
      return config.prompts;
    case "mcp":
      return config.mcpServers;
  }
}

function sectionLabel(section: EditableSection, t: ReturnType<typeof useI18n>["t"]) {
  switch (section) {
    case "providers":
      return t("config.providers");
    case "models":
      return t("config.models");
    case "prompts":
      return t("config.prompts");
    case "mcp":
      return t("config.mcp");
  }
}

function statusLabel(status: CardStatus, t: ReturnType<typeof useI18n>["t"]) {
  switch (status) {
    case "clean":
      return t("config.statusClean");
    case "dirty":
      return t("config.statusDirty");
    case "saving":
      return t("config.statusSaving");
    case "saved":
      return t("config.statusSaved");
    case "error":
      return t("config.statusError");
  }
}

function cleanProvider(provider: ProviderConfig): ProviderConfig {
  const {
    apiKey,
    apiKeyEnv,
    baseUrl,
    hasApiKey: _hasApiKey,
    maskedApiKey: _maskedApiKey,
    ...rest
  } = provider;
  return {
    ...rest,
    ...(baseUrl?.trim() ? { baseUrl: baseUrl.trim() } : {}),
    ...(apiKeyEnv?.trim() ? { apiKeyEnv: apiKeyEnv.trim() } : {}),
    ...(apiKey !== undefined ? { apiKey } : {})
  };
}

function cleanModel(model: ModelConfig): ModelConfig {
  const { modelName, ...rest } = model;
  return {
    ...rest,
    ...(modelName?.trim() ? { modelName: modelName.trim() } : {})
  };
}

async function saveSection(section: EditableSection, draft: string, jsonArrayError: string): Promise<void> {
  const parsed = JSON.parse(draft) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(jsonArrayError);
  }

  switch (section) {
    case "providers":
      for (const item of parsed as ProviderConfig[]) {
        await api.upsertProvider(item);
      }
      return;
    case "models":
      for (const item of parsed as ModelConfig[]) {
        await api.upsertModel(item);
      }
      return;
    case "prompts":
      for (const item of parsed as PromptConfig[]) {
        await api.upsertPrompt(item);
      }
      return;
    case "mcp":
      for (const item of parsed as McpServerConfig[]) {
        await api.upsertMcpServer(item);
      }
      return;
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-normal text-stone-500">{label}</dt>
      <dd className="mt-1 truncate font-mono text-xs text-neutral-900">{value}</dd>
    </div>
  );
}
