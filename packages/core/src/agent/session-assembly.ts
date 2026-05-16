import type { ModelConfig, PromptConfig, SkillConfig, SystemConfig, ToolConfig } from "../types/config";

export interface AgentSessionAssembly {
  prompt: PromptConfig;
  model: ModelConfig;
  builtinTools: ToolConfig[];
  customTools: ToolConfig[];
  skills: SkillConfig[];
  mcpServers: SystemConfig["mcpServers"];
  extensionFactories: string[];
  systemPrompt: string;
}

export function assembleAgentSession(config: SystemConfig, prompt: PromptConfig): AgentSessionAssembly {
  const model = config.models.find((candidate) => candidate.id === prompt.modelId);
  if (!model) {
    throw new Error(`Prompt ${prompt.id} references missing model ${prompt.modelId}`);
  }

  const builtinTools = config.tools.filter(
    (tool) => tool.enabled && prompt.builtinTools.includes(tool.id)
  );
  const customTools = config.tools.filter(
    (tool) => tool.enabled && prompt.customTools.includes(tool.id)
  );
  const skills = config.skills.filter((skill) => {
    if (!skill.enabled) {
      return false;
    }

    return prompt.skillsFilter.length === 0 || prompt.skillsFilter.includes(skill.id);
  });
  const mcpServers = config.mcpServers.filter(
    (server) => server.enabled && prompt.enabledMcpServers.includes(server.id)
  );

  return {
    prompt,
    model,
    builtinTools,
    customTools,
    skills,
    mcpServers,
    extensionFactories: prompt.extensionFactories,
    systemPrompt: prompt.systemPrompt
  };
}
