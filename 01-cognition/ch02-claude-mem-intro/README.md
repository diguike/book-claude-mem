---
title: "第 2 章：认识 claude-mem — 能力全景与快速上手"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/R7FYw8Wf2iRdvFktJE3cmi6nn6d"
last_synced: "2026-05-05T16:52:35Z"
---

## claude-mem 是什么

一句话定义：**claude-mem 是一个 Claude Code 插件，通过自动观察工具使用、AI 压缩生成结构化记忆、并在未来会话中按需注入上下文，实现跨会话的持久记忆。**

它不需要你做任何事情——安装后全自动运行。你正常使用 Claude Code 写代码，claude-mem 在后台默默观察、记录、压缩。下次开会话时，相关的历史上下文自动出现在 Claude 的视野中。

从技术角度，claude-mem 由以下几个部分组成：

```
┌─────────────────────────────────────────────────────┐
│  Claude Code 主进程                                  │
│  ├── 5 个生命周期 Hook（观察点）                      │
│  └── MCP Client（搜索接口）                          │
├─────────────────────────────────────────────────────┤
│  Worker 守护进程（Express API，端口 37700+）          │
│  ├── SessionManager（会话管理）                       │
│  ├── SDK Agent（AI 压缩引擎）                        │
│  ├── SearchManager（搜索编排）                       │
│  └── Viewer UI（Web 实时面板）                       │
├─────────────────────────────────────────────────────┤
│  存储层                                              │
│  ├── SQLite（结构化数据 + FTS5 全文搜索）             │
│  └── ChromaDB（向量 Embedding 语义搜索）              │
└─────────────────────────────────────────────────────┘
```

## 五大核心能力

### 1. 自动观察（Observe）

通过 PostToolUse Hook 捕获每次工具调用：文件读取、代码编辑、命令执行、搜索操作。你不需要手动标记哪些操作"值得记录"——系统全量捕获，后续由 AI 判断价值。

### 2. AI 压缩（Compress）

后台 Worker 使用 Claude Agent SDK 对原始观察进行智能压缩。一次代码编辑操作可能产生几千 Token 的 diff 内容，压缩后变成一条约 100-200 Token 的结构化 Observation：

```
类型：🟡 problem-solution
标题：Fixed race condition in session cleanup
叙述：The SessionEnd hook was firing before Worker finished processing...
事实：
  - 原因：SessionEnd 和 Worker 的 summary generation 存在竞争
  - 修复：改用 graceful completion（UPDATE + poll）替代 DELETE
文件：src/hooks/cleanup-hook.ts, src/services/worker-service.ts
```

### 3. 上下文注入（Inject）

SessionStart Hook 在每次新会话开始时注入一个轻量级索引。索引包含最近的 Observations 的标题、类型、时间和预估 Token 数——通常占用 800-2000 Token，不到上下文窗口的 1%。

Agent 看到索引后，如果某条记录与当前任务相关，通过 MCP 搜索工具获取完整内容。不相关的记录不消耗任何 Token。

### 4. 智能搜索（Search）

通过 MCP（Model Context Protocol，Anthropic 定义的工具协议，类比 LSP 之于编辑器——它标准化了 LLM 如何调用外部工具）暴露 3 个搜索工具 + 1 个工作流描述，支持 3 层渐进式检索：

| 工具 | 用途 | Token 成本 |
|------|------|-----------|
| `search` | 全文搜索 + 过滤，返回紧凑索引 | ~50-100/条 |
| `timeline` | 获取某条观察前后的时间线上下文 | 可变 |
| `get_observations` | 按 ID 批量获取完整 Observation | ~500-1000/条 |
| `__IMPORTANT` | 工作流说明（自动可见） | 固定 |

Agent 自主决定搜索深度：简单任务只看索引标题就够了，复杂任务才需要 fetch 完整内容。

### 5. 知识库构建（Knowledge Agent）

从历史 Observations 中编译出聚焦特定主题的知识库（Corpus），支持会话式查询：

```
build_corpus name="auth-architecture" project="my-app" concepts="auth,jwt,session"
prime_corpus name="auth-architecture"
query_corpus name="auth-architecture" question="认证模块的刷新策略是什么？"
```

适合对特定领域做深度知识沉淀，比如"所有关于部署流程的决策"或"过去一个月的 Bug 修复模式"。

## 安装与配置

### 安装方式

最简单的安装方式，一条命令：

```bash
npx claude-mem install
```

这条命令会：
1. 检查并安装 Bun（如果缺失）——Bun 是一个高性能 JS 运行时，claude-mem 用它是因为内置 SQLite 驱动且启动速度快
2. 检查并安装 uv（如果缺失）——uv 是 Python 的包管理器，ChromaDB（向量数据库）是 Python 写的所以需要它
3. 在 Claude Code 插件目录注册 Hook 配置
4. 启动 Worker 守护进程

安装完成后重启 Claude Code，记忆系统自动开始工作。

也可以通过 Claude Code 内置的插件市场安装：

```bash
# 在 Claude Code 中执行
/plugin marketplace add thedotmack/claude-mem
/plugin install claude-mem
```

### 验证安装

安装成功后，访问 Viewer UI 确认 Worker 运行正常：

```
http://localhost:37700
```

（端口号可能因系统不同而变化，计算公式：`37700 + (uid % 100)`）

在 Claude Code 中开始一次正常对话，观察 Viewer UI 中是否出现新的 Observation 卡片。如果能看到实时的记忆流，说明一切正常。

### 核心配置

配置文件位于 `~/.claude-mem/settings.json`，首次运行自动创建。关键配置项：

```json
{
  "contextObservations": 50,
  "contextSessions": 10,
  "workerPort": 37700
}
```

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `contextObservations` | 50 | SessionStart 注入索引中包含的最近 Observation 数量 |
| `contextSessions` | 10 | 注入的最近会话摘要数量 |
| `workerPort` | 37700+(uid%100) | Worker API 端口 |

环境变量覆盖：
- `CLAUDE_MEM_DATA_DIR`：数据目录路径（默认 `~/.claude-mem/`）
- `CLAUDE_MEM_WORKER_PORT`：指定固定端口

## 日常使用场景

### 场景 1：跨会话连续开发

第一天你和 Claude 讨论了数据库 Schema 的设计方案，做出了几个关键决策。第二天开新会话继续开发时，不需要重述这些决策——SessionStart 注入的索引中会包含类似：

```
| #342 | 昨天 3:15 PM | 🟤 | 用 jsonb 而非单独表存 metadata | ~180 |
```

Claude 看到这条记录，自动知道 metadata 的存储方案已经确定，不会再给出冲突的建议。

### 场景 2：代码考古

三个月前做过一个性能优化，现在需要回忆具体做了什么。直接让 Claude 搜索：

```
"搜索之前关于 API 响应时间优化的记录"
```

Claude 使用 MCP search 工具找到相关 Observations，获取完整的 narrative 和修改的文件列表。比翻 git log 或 grep 代码更高效。

### 场景 3：决策追溯

产品经理问"为什么选了 PostgreSQL 而不是 MongoDB"。如果当初的技术选型讨论被 claude-mem 记录了，可以直接查询：

```
search(query="database selection postgresql mongodb", type="decision")
```

找到当时的决策记录，包含选型理由、对比分析、当时的约束条件。

### 场景 4：团队 Onboarding

新成员接手项目，通过 Knowledge Agent 快速构建项目知识：

```
build_corpus name="project-overview" project="my-app" limit=200
prime_corpus name="project-overview"
query_corpus name="project-overview" question="项目的核心架构是什么？主要模块有哪些？"
```

## Viewer UI：实时观察面板

Worker 服务自带一个 React 实现的 Web UI，默认在 Worker 端口提供服务：

```
http://localhost:37700
```

UI 功能包括：

- **实时 Observation 流**：通过 SSE（Server-Sent Events）实时展示新生成的 Observation
- **Session 摘要卡片**：每个会话的 Summary 结构化展示
- **统计面板**：Observation 总数、今日数量、类型分布
- **搜索功能**：在 UI 中搜索历史 Observation

Viewer UI 是可选的——claude-mem 的核心功能完全通过 CLI 和 MCP 工具运作，UI 只是一个方便的可视化补充。

## Skills 体系

claude-mem 通过 Skill 系统扩展了多个高级功能。Skill 是 Claude Code 的一种扩展机制：预定义的 Prompt 模板，通过 `/` 斜杠命令触发（类似 Slack 的 `/` 命令），被 Claude Code 自动识别并执行：

### learn-codebase

一次性通读整个代码仓库，将每个文件的结构和功能记录为 Observations。适合首次接触新项目时使用。

```bash
/learn-codebase
```

执行后，后续会话可以直接查询"这个项目的路由系统怎么组织的"这类问题。

### make-plan

创建分阶段的实现计划，包含文档发现和依赖分析。

```bash
/make-plan 实现用户认证模块
```

### mem-search

专用的记忆搜索技能，当用户问"之前做过什么"类问题时自动触发。

### knowledge-agent

构建和查询知识库，如上文"知识库构建"一节所述。

### smart-explore

基于 tree-sitter AST 解析的 Token 高效代码探索工具。不需要读取完整文件就能了解代码结构。

## 配置调优

### 控制注入量

如果觉得 SessionStart 注入的上下文太多或太少：

```json
{
  "contextObservations": 30,
  "contextSessions": 5
}
```

减少数量可以降低起始 Token 消耗，增加数量可以让 Agent 有更完整的历史视野。

### 项目过滤

claude-mem 默认对所有项目生效。如果某些目录不需要记忆（如临时实验目录），可以在项目根目录创建 `.claude-mem-ignore` 文件。

### 隐私标签

对敏感信息使用 `<private>` 标签防止被记录：

```
<private>这段内容不会被 claude-mem 存储</private>
```

标签在 Hook 层（数据到达 Worker 之前）被剥离，确保敏感信息永远不会进入数据库。

### 多账号/多环境

在同一台机器上运行多个 claude-mem 实例（如工作 vs 个人）：

```bash
# 工作环境
export CLAUDE_MEM_DATA_DIR="$HOME/.claude-mem-work"
export CLAUDE_MEM_WORKER_PORT=37800

# 个人环境（默认）
export CLAUDE_MEM_DATA_DIR="$HOME/.claude-mem"
```

---

---

**思考题**

1. claude-mem 的 Worker 端口是 `37700 + (uid % 100)`。这个设计解决什么问题？如果两个用户的 uid 对 100 取模相同怎么办？
2. `<private>` 标签在 Hook 层剥离——如果用户忘记加标签，敏感信息已经进入 Worker，还有补救手段吗？
3. Knowledge Agent 的 Build → Prime → Query 模式和"给 ChatGPT 发一段长文然后问问题"有什么本质区别？

---

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

下一章我们进入 Context Engineering 的理论基础，理解 claude-mem 设计决策背后的认知科学原理。

---

> 本章来自《Agent Memory 工程实战》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
