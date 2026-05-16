import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { McpServerConfig, ModelConfig, PromptConfig, ProviderConfig, SystemConfig } from "../types";

interface ConfigPageProps {
  config: SystemConfig | undefined;
  onRefresh: () => Promise<void>;
}

type EditableSection = "providers" | "models" | "prompts" | "mcp";

export function ConfigPage({ config, onRefresh }: ConfigPageProps) {
  const [section, setSection] = useState<EditableSection>("providers");
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [testingProviderId, setTestingProviderId] = useState<string>();

  useEffect(() => {
    if (!config) {
      setDraft("");
      return;
    }

    setDraft(JSON.stringify(readSection(config, section), null, 2));
  }, [config, section]);

  if (!config) {
    return <section className="rounded border border-stone-200 bg-white p-5 text-sm text-stone-600">Loading config.</section>;
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-950">Config</h1>
        <p className="mt-1 text-sm text-stone-600">{config.host.workspaceRoot}</p>
      </div>
      {status ? (
        <div className="rounded border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">{status}</div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_520px]">
        <div className="grid gap-4">
          <ConfigTable title="Providers" rows={config.providers.map((item) => [item.id, item.name, item.type, item.enabled ? "enabled" : "off"])} />
          <ConfigTable title="Models" rows={config.models.map((item) => [item.id, item.providerId, item.displayName, item.defaultThinking])} />
          <ConfigTable title="Prompts" rows={config.prompts.map((item) => [item.id, item.role, item.modelId, item.thinking])} />
          <ConfigTable title="MCP" rows={config.mcpServers.map((item) => [item.id, item.name, item.command, item.enabled ? "enabled" : "off"])} />
          <div className="rounded border border-stone-200 bg-white">
            <div className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">Provider Tests</div>
            <div className="divide-y divide-stone-100">
              {config.providers.map((provider) => (
                <div key={provider.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{provider.name}</div>
                    <div className="truncate text-xs text-stone-500">{provider.baseUrl ?? provider.type}</div>
                  </div>
                  <button
                    type="button"
                    disabled={testingProviderId === provider.id}
                    onClick={async () => {
                      setTestingProviderId(provider.id);
                      setStatus(undefined);
                      try {
                        const result = await api.testProvider({ providerId: provider.id });
                        setStatus(result.ok ? `Provider ${provider.id}: ${result.content ?? "ok"}` : result.error ?? "Provider test failed");
                      } catch (error) {
                        setStatus(error instanceof Error ? error.message : "Provider test failed");
                      } finally {
                        setTestingProviderId(undefined);
                      }
                    }}
                    className="h-8 rounded border border-stone-300 px-2 text-xs hover:bg-stone-50 disabled:bg-stone-100"
                  >
                    {testingProviderId === provider.id ? "Testing" : "Test"}
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded border border-stone-200 bg-white">
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
              <div className="text-sm font-semibold">MCP Capabilities</div>
              <button
                type="button"
                onClick={async () => {
                  setStatus(undefined);
                  try {
                    await api.discoverMcp();
                    await onRefresh();
                    setStatus("MCP discovery refreshed");
                  } catch (error) {
                    setStatus(error instanceof Error ? error.message : "MCP discovery failed");
                  }
                }}
                className="h-8 rounded border border-stone-300 px-2 text-xs hover:bg-stone-50"
              >
                Discover
              </button>
            </div>
            <div className="divide-y divide-stone-100">
              {Object.values(config.mcpCapabilities).length === 0 ? (
                <div className="px-4 py-6 text-sm text-stone-500">No discovered capabilities.</div>
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
          </div>
          <ConfigTable title="Tools" rows={config.tools.map((item) => [item.id, item.category, item.enabled ? "enabled" : "off", item.name])} />
        </div>

        <aside className="rounded border border-stone-200 bg-white">
          <div className="border-b border-stone-200 px-4 py-3">
            <h2 className="text-sm font-semibold">Edit Config</h2>
            <p className="mt-1 text-xs text-stone-500">Edit JSON arrays, save, and the tables refresh from persisted config.</p>
          </div>
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-4 rounded border border-stone-300 p-1">
              {(["providers", "models", "prompts", "mcp"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setSection(item)}
                  className={`h-8 rounded text-xs ${section === item ? "bg-neutral-950 text-white" : "text-stone-700 hover:bg-stone-50"}`}
                >
                  {item}
                </button>
              ))}
            </div>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              spellCheck={false}
              className="min-h-[440px] w-full rounded border border-stone-300 bg-neutral-950 p-3 font-mono text-xs leading-5 text-stone-100"
            />
            <button
              type="button"
              title="Save config section"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                setStatus(undefined);
                try {
                  await saveSection(section, draft);
                  await onRefresh();
                  setStatus(`Saved ${section}`);
                } catch (error) {
                  setStatus(error instanceof Error ? error.message : "Save failed");
                } finally {
                  setSaving(false);
                }
              }}
              className="inline-flex h-9 items-center gap-2 rounded bg-neutral-950 px-3 text-sm font-medium text-white disabled:bg-stone-300"
            >
              <Save size={16} aria-hidden="true" />
              {saving ? "Saving" : "Save"}
            </button>
          </div>
        </aside>
      </div>
      <div className="rounded border border-stone-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Host Settings</h2>
        <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
          <Field label="Web" value={`${config.host.webHost}:${config.host.webPort}`} />
          <Field label="Runtime image" value={config.host.defaultRuntimeImage} />
          <Field label="Docker network" value={config.host.dockerNetwork} />
          <Field label="Shell tools" value={config.host.allowShellTools ? "enabled" : "disabled"} />
        </dl>
      </div>
    </section>
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

async function saveSection(section: EditableSection, draft: string): Promise<void> {
  const parsed = JSON.parse(draft) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Config section must be a JSON array.");
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

function ConfigTable({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className="rounded border border-stone-200 bg-white">
      <div className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">{title}</div>
      <div className="divide-y divide-stone-100">
        {rows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-stone-500">Empty</div>
        ) : (
          rows.map((row) => (
            <div key={row.join(":")} className="grid grid-cols-4 gap-2 px-4 py-3 text-sm">
              {row.map((cell) => (
                <div key={cell} className="truncate text-stone-700">
                  {cell}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-normal text-stone-500">{label}</dt>
      <dd className="mt-1 truncate font-mono text-xs text-neutral-900">{value}</dd>
    </div>
  );
}
