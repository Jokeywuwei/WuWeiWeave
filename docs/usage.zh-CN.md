# WuWeiWeave 使用指南

WuWeiWeave 是一个面向 CTF 和安全研究任务的多智能体工作台。你可以用它创建挑战、启动 AI solver、管理模型服务、观察运行状态，并通过调度器把任务排队执行。

## 1. 环境准备

需要安装：

- Bun 1.x
- Docker，可选，仅 Docker 隔离运行模式需要

安装依赖：

```bash
bun install
```

如果 Windows PowerShell 提示找不到 `bun`，先确认 Bun 已安装并加入 PATH：

```powershell
bun --version
```

## 2. 启动 Web 控制台

```bash
bun run web
```

默认访问地址：

```text
http://127.0.0.1:3217
```

Web 控制台默认显示中文。左侧侧栏底部可以在“中文 / English”之间切换。

## 3. 初始化本地状态

```bash
bun run bootstrap
```

默认数据目录：

```text
~/.wuweiweave
```

常见内容包括：

- `config/system.json`：provider、模型、prompt、MCP、主机配置
- `challenges/`：题目状态
- `solvers/`：solver 会话、消息和工作区
- `runtime/`：事件、队列、worker、用量指标

## 4. 配置真实模型 Provider

默认 `local-dry-run` 可以跑通流程，但不会真正解题。要让 solver 调用真实模型，需要启用 OpenAI 兼容 provider。

在 Web 控制台中：

1. 打开“配置”页面。
2. 编辑“模型服务”配置。
3. 将 `openai` 或兼容 provider 的 `enabled` 改为 `true`。
4. 设置 `baseUrl` 和 `apiKeyEnv`。
5. 保存后进入“模型服务”页面测试 provider。

也可以直接编辑：

```text
~/.wuweiweave/config/system.json
```

示例：

```json
{
  "id": "openai",
  "type": "openai",
  "enabled": true,
  "baseUrl": "https://api.openai.com/v1",
  "apiKeyEnv": "OPENAI_API_KEY"
}
```

启动前设置环境变量：

```bash
OPENAI_API_KEY=... bun run web
```

Windows PowerShell：

```powershell
$env:OPENAI_API_KEY="..."
bun run web
```

## 5. 创建 CTF 挑战

进入“挑战”页面：

1. 填写标题。
2. 填写分类，例如 `web`、`crypto`、`misc`、`pwn`、`reverse`。
3. 填写题目描述，包括附件说明、服务地址、flag 格式、已知限制。
4. 点击“创建”。

创建后可以查看详情，并用“规划器”刷新下一步建议。

## 6. 启动 Solver

进入“运行时”页面：

1. 在任务框中写清楚 solver 要做什么。
2. 默认 prompt 使用 `solver-default`。
3. 可选择关联某个 challenge。
4. 选择本地或 Docker 运行模式。
5. 点击“启动”。

CLI 方式：

```bash
bun run cli -- solver "Inspect the seed challenge and propose first attack path" --prompt solver-default
```

Docker 模式：

```bash
bun run cli -- solver "Run isolated recon" --prompt solver-default --docker
```

## 7. 使用调度器排队任务

进入“调度器”页面：

1. 输入任务描述。
2. 点击“入队”。
3. 点击“运行”，让调度器尝试派发任务。
4. 查看队列、worker、租约和死信任务。

调度器适合批量或长期运行任务。失败任务会根据恢复策略重试，最终失败会进入死信列表。

启动 worker supervisor：

```bash
bun run worker
```

只执行一次 worker tick：

```bash
bun run worker -- --once
```

## 8. MCP 工具接入

进入“配置”页面配置 MCP server。保存后点击“MCP 能力”里的“发现”，系统会读取：

- tools
- resources
- prompts

发现成功后，solver 可以通过统一工具调度器调用 MCP 工具。

## 9. 查看运行状态和用量

常用页面：

- “仪表盘”：总览挑战、solver、token、费用和事件。
- “可观测性”：查看事件时间线、solver 健康度、provider 用量聚合。
- “模型服务”：测试 provider，配置默认模型和 fallback provider。
- “运行时”：管理 solver，停止、恢复、归档会话。
- “调度器”：查看队列、worker 租约和死信任务。

## 10. 验证项目是否正常

推荐从项目根目录运行：

```bash
bun run typecheck
bun test
bun run build
```

进一步验证：

```bash
bun run smoke
bun run smoke:product
bun run smoke:reliability
bun run smoke:operations
bun run smoke:acceptance
```

Docker 验证：

```bash
bun run smoke:docker
```

真实 provider 验证默认不会运行，避免误花费。需要显式开启：

```bash
WUWEIWEAVE_RUN_PROVIDER_SMOKE=1 OPENAI_API_KEY=... bun run smoke:provider
```

## 11. 建议解题流程

1. 准备题目描述、附件、源码或服务地址。
2. 创建 challenge。
3. 配置真实模型 provider。
4. 启动本地 solver 做侦察和分析。
5. 查看 solver 消息和工作区产物。
6. 如果一次没解出，补充线索后继续启动新任务。
7. 对批量题目或长任务，使用调度器排队。

## 12. 常见问题

### Web 页面打不开

确认服务已启动：

```bash
bun run web
```

然后访问：

```text
http://127.0.0.1:3217
```

### Solver 只是在干跑

检查是否还在使用 `local-dry-run`。如果要真实解题，需要启用真实 provider，并设置 API key。

### Docker 模式失败

先验证 Docker：

```bash
docker --version
docker ps
```

再构建运行镜像：

```bash
bun run docker:build
```

### Provider 测试失败

检查：

- Provider 是否 enabled
- `baseUrl` 是否正确
- `apiKeyEnv` 对应的环境变量是否已设置
- 模型 id 是否存在
- 当前网络是否能访问 provider
