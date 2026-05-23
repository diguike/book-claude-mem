---
title: "第 5 章：Hook 驱动的生命周期"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/GLKZw8Mu6ic0HBk44tWcawDin3g"
last_synced: "2026-05-05T16:52:35Z"
---

## Claude Code Hook 系统原理

如果你用过 Git Hooks（pre-commit、post-push），Claude Code Hook 是类似的概念：在特定事件发生时自动执行注册的脚本。区别在于 Git Hook 关注代码提交事件，而 Claude Code Hook 关注 AI 会话事件（会话开始、工具调用、会话结束等）。

Claude Code 的 Hook 系统是一个事件驱动的扩展机制。插件通过 `hooks.json` 声明要监听的生命周期事件，Claude Code 在对应时机执行注册的命令。

Hook 的执行模型：

```
Claude Code 触发事件
  → 查找匹配的 Hook 配置
  → 构造 JSON 输入
  → 通过 stdin 传递给 Hook 命令
  → 等待 Hook 通过 stdout 返回 JSON
  → 根据返回值决定后续行为
```

Hook 配置格式（`hooks.json`）：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "shell": "bash",
            "command": "node $PLUGIN_ROOT/scripts/worker-service.cjs hook claude-code observation",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

关键属性：
- `matcher`：匹配规则。`"*"` 匹配所有工具，`"Read"` 只匹配 Read 工具，`"startup|clear|compact"` 匹配多种触发源
- `timeout`：超时时间（秒）。超时后 Claude Code 强制终止 Hook 进程
- `shell`：指定 shell（bash），确保环境变量和 PATH 正确

### 输入格式

Claude Code 通过 stdin 传递的 JSON 结构因事件而异：

```typescript
// SessionStart
{ session_id: string, cwd: string, source: "startup" | "clear" | "compact" }

// UserPromptSubmit
{ session_id: string, cwd: string, prompt: string }

// PostToolUse
{ session_id: string, cwd: string, tool_name: string, tool_input: object, tool_response: object }

// Stop
{ session_id: string, cwd: string, transcript_path: string }
```

### 输出格式

Hook 通过 stdout 返回 JSON，控制 Claude Code 的行为：

```typescript
// 基础返回
{ continue: true, suppressOutput: true }

// SessionStart 可以注入上下文
{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: "... 注入的上下文文本 ..."
  }
}
```

## Setup Hook：版本检测的"不打扰"哲学

Setup Hook 在每次 Claude Code 启动时执行，是最先运行的 Hook。claude-mem 在这里只做一件事：检查版本是否匹配。

源码位置：`plugin/scripts/version-check.js`

设计要点：
- 读取 `.install-version` marker 文件，与当前插件版本比较
- 版本一致：直接 exit 0（耗时 < 10ms）
- 版本不一致：往 stderr 写一行 `run: npx claude-mem repair`，然后 exit 0
- **绝不阻塞**：无论什么情况都返回 exit 0

为什么不在 Setup Hook 里自动修复？因为修复（安装依赖、重启 Worker）是耗时操作，放在 Setup 里会拖慢每次启动。让用户主动运行 `npx claude-mem repair` 更合理——这是"不打扰"哲学的体现。

## SessionStart Hook：上下文注入的时机选择

SessionStart 在 Claude Code 每次新会话开始时触发（包括 startup、/clear、/compact 三种场景）。claude-mem 注册了两个顺序执行的 Hook：

### Hook 1：启动 Worker

```bash
node "$_R/scripts/bun-runner.js" "$_R/scripts/worker-service.cjs" start
```

如果 Worker 已经在运行则跳过，否则启动。这确保后续 Hook 有可用的 HTTP API。

### Hook 2：注入上下文

```bash
node "$_R/scripts/bun-runner.js" "$_R/scripts/worker-service.cjs" hook claude-code context
```

`contextHandler` 的实现（`src/cli/handlers/context.ts`）：

```typescript
export const contextHandler: EventHandler = {
  async execute(input: NormalizedHookInput): Promise<HookResult> {
    const cwd = input.cwd ?? process.cwd();
    const context = getProjectContext(cwd);  // 提取项目名
    const port = getWorkerPort();

    // 构造 API 路径，支持多项目
    const projectsParam = context.allProjects.join(',');
    const apiPath = `/api/context/inject?projects=${encodeURIComponent(projectsParam)}`;

    // 向 Worker 请求上下文
    const contextResult = await executeWithWorkerFallback<string>(apiPath, 'GET');
    if (isWorkerFallback(contextResult)) {
      return emptyResult; // Worker 不可用，返回空上下文
    }

    // 通过 hookSpecificOutput.additionalContext 注入
    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: contextResult.trim()
      }
    };
  }
};
```

注入的上下文格式是一个 Progressive Disclosure 索引：

```markdown
# claude-mem status

**Legend:** 🎯 session-request | 🔴 gotcha | 🟡 problem-solution | 🔵 how-it-works | 🟢 what-changed | 🟣 discovery | 🟤 decision | ⚖️ trade-off

### May 4, 2026

**General**
| ID | Time | T | Title | Tokens |
|----|------|---|-------|--------|
| #1234 | 2:15 PM | 🟤 | 选用 pgvector 做向量搜索 | ~180 |
| #1235 | 2:30 PM | 🟡 | 修复连接池泄漏 | ~120 |

**src/services/auth.ts**
| ID | Time | T | Title | Tokens |
|----|------|---|-------|--------|
| #1236 | 3:00 PM | 🟢 | JWT 验证改为异步 | ~95 |
```

关键设计：
- 每条记录只有标题级信息（~15 Token），50 条总共约 750 Token
- 按日期和文件分组，便于 Agent 快速扫描
- 包含 Token 预估值，让 Agent 评估"获取详情"的成本

## UserPromptSubmit Hook：会话追踪的起点

当用户提交 prompt 时，`sessionInitHandler` 执行：

```typescript
export const sessionInitHandler: EventHandler = {
  async execute(input: NormalizedHookInput): Promise<HookResult> {
    const { sessionId, prompt } = input;
    const cwd = input.cwd ?? process.cwd();

    // 检查项目是否应该被追踪
    if (!shouldTrackProject(cwd)) {
      return { continue: true, suppressOutput: true };
    }

    // 过滤内部协议消息
    if (rawPrompt && isInternalProtocolPayload(rawPrompt)) {
      return { continue: true, suppressOutput: true };
    }

    const project = getProjectContext(cwd).primary;

    // 向 Worker 注册会话
    const initResult = await executeWithWorkerFallback<SessionInitResponse>(
      '/api/sessions/init',
      'POST',
      {
        contentSessionId: sessionId,
        project,
        prompt,
        platformSource,
        cwd,
      }
    );

    // 语义上下文注入（可选）
    // ...
  }
};
```

这个 Handler 做了三件事：
1. **过滤**：跳过被排除的项目、内部协议消息
2. **注册**：在 Worker 的 SQLite 中创建 session 记录
3. **存储 Prompt**：将用户原始 prompt 保存到 user_prompts 表

为什么要存 prompt？两个用途：
- 搜索功能：用户可以按 prompt 内容搜索历史会话
- Summary 生成：会话结束时，prompt 帮助 AI 理解"这次会话的目标是什么"

## PostToolUse Hook：观察捕获的"快进快出"

这是 claude-mem 最高频触发的 Hook——每次 Claude 使用工具都会触发。`observationHandler` 的设计极度追求速度：

```typescript
export const observationHandler: EventHandler = {
  async execute(input: NormalizedHookInput): Promise<HookResult> {
    const { sessionId, cwd, toolName, toolInput, toolResponse } = input;

    // 无工具名则跳过
    if (!toolName) {
      return { continue: true, suppressOutput: true, exitCode: HOOK_EXIT_CODES.SUCCESS };
    }

    // 项目排除检查
    if (!shouldTrackProject(cwd)) {
      return { continue: true, suppressOutput: true };
    }

    // 发送到 Worker（异步处理）
    const result = await executeWithWorkerFallback<{ status?: string }>(
      '/api/sessions/observations',
      'POST',
      {
        contentSessionId: sessionId,
        tool_name: toolName,
        tool_input: toolInput,
        tool_response: toolResponse,
        cwd,
      }
    );

    return { continue: true, suppressOutput: true };
  }
};
```

整个 Handler 只做一件事：**把数据发到 Worker**。不解析、不压缩、不存库——这些全部由 Worker 异步完成。

这是经典的"Fire-and-Forget"模式：

```
Hook（快）: 读 stdin → POST 到 Worker → 返回 success（< 30ms）
Worker（慢）: 收到 POST → 入队 → 按序处理 → AI 压缩 → 存库（5-30s）
```

为什么 PostToolUse 的 timeout 设为 120s？因为 Worker 可能暂时过载（在处理大量排队的 observations），HTTP 请求需要等待 Worker 接收完成。但 Worker 内部的实际处理是异步的，不在这 120s 窗口内。

## PreToolUse Hook：文件级上下文注入

除了上述核心 Hook，claude-mem 还注册了一个 PreToolUse Hook，matcher 设为 `"Read"`——只在 Claude 即将读取文件时触发。

`fileContextHandler`（`src/cli/handlers/file-context.ts`）的职责：当 Claude 准备读取某个文件时，检查该文件是否有关联的历史 Observation。如果有，将相关的 Observation 标题作为额外上下文注入，帮助 Claude 在阅读代码时带着历史认知。

```typescript
// 简化逻辑：检查文件是否有关联的 observations
// 完整实现见 src/cli/handlers/file-context.ts
const filePath = input.toolInput?.file_path;
if (filePath) {
  const context = await getFileContext(filePath, project);
  if (context) {
    return { hookSpecificOutput: { additionalContext: context } };
  }
}
```

这是一个"渐进增强"特性：有相关记忆时注入额外上下文，没有时完全不影响正常文件读取。

## Summary & SessionEnd Hook：优雅收尾

### Stop Hook（Summary）

当 Claude Code 执行到 Stop 点时（用户按 Escape、任务完成、或手动 /stop），`summarizeHandler` 被触发：

```typescript
export const summarizeHandler: EventHandler = {
  async execute(input: NormalizedHookInput): Promise<HookResult> {
    // 子代理不生成 summary（避免噪音）
    if (input.agentId) {
      return { continue: true, suppressOutput: true };
    }

    const { sessionId, transcriptPath } = input;

    // 从 transcript 文件提取最后一条 assistant 消息
    let lastAssistantMessage = extractLastMessage(transcriptPath, 'assistant', true);
    lastAssistantMessage = stripMemoryTagsFromPrompt(lastAssistantMessage);

    // 请求 Worker 生成摘要
    await executeWithWorkerFallback<{ status?: string }>(
      '/api/sessions/summarize',
      'POST',
      {
        contentSessionId: sessionId,
        lastAssistantMessage,
        platformSource,
      }
    );

    return { continue: true, suppressOutput: true };
  }
};
```

Summary 的生成流程：
1. Hook 将最后的 assistant 消息发送给 Worker
2. Worker 收集该 session 的所有 observations
3. 调用 Claude Agent SDK 生成结构化摘要：

```xml
<summary>
  <request>用户的原始需求</request>
  <investigated>调查了哪些内容</investigated>
  <learned>发现了什么</learned>
  <completed>完成了什么</completed>
  <next_steps>下一步建议</next_steps>
  <files_read>读取的文件列表</files_read>
  <files_modified>修改的文件列表</files_modified>
</summary>
```

关键设计：
- **子代理跳过**：Sub-Agent 的 Stop 不触发 summary，避免噪音
- **transcript 解析**：从文件中提取最后一条回复，作为上下文辅助 summary 生成
- **privacy 剥离**：`<private>` 标签内容在此阶段被彻底移除

### SessionEnd（隐式的优雅退出）

注意 `hooks.json` 中没有显式的 SessionEnd Hook。这是有意为之——从 v4.1.0 开始，claude-mem 不再在 SessionEnd 时发送 DELETE 请求强制终止 Worker 会话。

旧做法的问题：
```
SessionEnd → DELETE /worker/session → Worker 立即停止
问题：正在处理的 summary 被中断，pending observations 丢失
```

新做法：
```
SessionEnd → Worker 自然完成当前处理 → 检测到 session inactive → 优雅退出
```

Worker 通过心跳机制检测 session 是否仍然活跃。当 session 超过一定时间没有新的 observation 或 prompt，Worker 自动标记为 completed。

## Hook 的性能指标

实际测量数据（来自 claude-mem 官方文档）：

| Hook | 平均耗时 | p95 | p99 | 瓶颈 |
|------|---------|-----|-----|------|
| Setup (version-check) | 8ms | 20ms | 40ms | 文件读取 |
| SessionStart (context) | 45ms | 120ms | 250ms | SQLite 查询 |
| UserPromptSubmit | 12ms | 25ms | 50ms | HTTP 请求 |
| PostToolUse | 8ms | 15ms | 30ms | HTTP 请求 |
| Stop (summarize) | 5ms | 10ms | 20ms | HTTP 请求（入队即返回） |

所有 Hook 的 p99 都在 250ms 以内。用户在正常使用 Claude Code 时完全感知不到 claude-mem 的存在。

### 性能优化手段

**1. stderr 静默**

```typescript
// hook-command.ts 第一行
process.stderr.write = (() => true) as typeof process.stderr.write;
```

防止任何依赖库的 warning/error 输出污染 stdout 的 JSON 响应。

**2. PATH 预构建**

`hooks.json` 中每个命令都有一段 PATH 设置逻辑：

```bash
export PATH="$($SHELL -lc 'echo $PATH' 2>/dev/null):$PATH"
```

确保在任何环境下都能找到 node、bun 等可执行文件。

**3. bun-runner.js 桥接**

Hook 命令不直接执行 TypeScript 文件，而是通过 `bun-runner.js` 桥接。这允许在 Node 环境下执行但利用 Bun 的快速启动和 TS 支持。

**4. Worker 连接复用**

`executeWithWorkerFallback` 内部使用 fetch（Node.js 原生），自动复用 TCP 连接。连续的 Hook 调用不需要反复建立连接。

---

---

**思考题**

1. `process.stderr.write = (() => true)` 是一个"暴力"的做法。如果某个依赖库通过 stderr 报告了关键错误（如数据库损坏），你怎么知道？设计一个更优雅的方案。
2. PostToolUse Hook 的 matcher 设为 `"*"`（所有工具）。有些工具的输出很大（如 Read 一个 1MB 的文件），全部发给 Worker 会有性能问题。你会怎么设计过滤策略？
3. claude-mem 的 Hook 采用 `bash -c "..."` 包裹 node 命令。如果用户的 shell 是 fish 或 PowerShell，这个方案能工作吗？

---

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

下一章将深入 Worker Service 的内部设计：队列处理、AI Agent 管理、进程生命周期等核心实现。
