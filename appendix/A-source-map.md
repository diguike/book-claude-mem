---
title: "附录 A：claude-mem 源码导航图"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/Izgzwz9gjitMULkwVQlctduTn0d"
last_synced: "2026-05-05T16:52:35Z"
---

# 附录 A：claude-mem 源码导航图

基于 v12.6.2，按功能模块组织的文件路径速查。

## 入口与配置

| 文件 | 功能 |
|------|------|
| `plugin/hooks/hooks.json` | Hook 注册配置（6 个事件） |
| `plugin/.mcp.json` | MCP Server 注册 |
| `plugin/.claude-plugin/plugin.json` | 插件元数据 |
| `package.json` | 项目依赖和脚本 |
| `CLAUDE.md` | 项目开发说明 |

## CLI Layer（Hook 处理）

| 文件 | 功能 |
|------|------|
| `src/cli/hook-command.ts` | Hook 统一入口，错误分级 |
| `src/cli/stdin-reader.ts` | 从 stdin 读取 JSON |
| `src/cli/adapters/index.ts` | 平台适配器分发 |
| `src/cli/adapters/claude-code.ts` | Claude Code 适配器 |
| `src/cli/adapters/cursor.ts` | Cursor 适配器 |
| `src/cli/adapters/gemini-cli.ts` | Gemini CLI 适配器 |
| `src/cli/handlers/index.ts` | 7 个 Handler 注册表 |
| `src/cli/handlers/context.ts` | SessionStart → 上下文注入 |
| `src/cli/handlers/session-init.ts` | UserPromptSubmit → 会话注册 |
| `src/cli/handlers/observation.ts` | PostToolUse → 观察捕获 |
| `src/cli/handlers/summarize.ts` | Stop → 摘要生成 |
| `src/cli/handlers/file-context.ts` | PreToolUse(Read) → 文件上下文 |

## Worker Service

| 文件 | 功能 |
|------|------|
| `src/services/worker-service.ts` | Worker 主入口，依赖初始化 |
| `src/services/server/Server.ts` | Express HTTP 服务封装 |
| `src/services/worker/SessionManager.ts` | 会话生命周期管理 |
| `src/services/worker/SearchManager.ts` | 搜索编排 |
| `src/services/worker/DatabaseManager.ts` | 数据库连接管理 |
| `src/services/worker/SSEBroadcaster.ts` | 实时事件推送 |
| `src/services/worker/TimelineService.ts` | 时间线查询 |
| `src/services/queue/SessionQueueProcessor.ts` | 会话队列处理 |

## 存储层

| 文件 | 功能 |
|------|------|
| `src/services/sqlite/Database.ts` | SQLite 初始化 + PRAGMA |
| `src/services/sqlite/PendingMessageStore.ts` | pending_messages CRUD |
| `src/services/sync/ChromaSync.ts` | ChromaDB 向量同步 |
| `src/services/sync/ChromaMcpManager.ts` | ChromaDB MCP 进程管理 |

## 搜索

| 文件 | 功能 |
|------|------|
| `plugin/scripts/mcp-server.cjs` | MCP Server（4 工具） |
| `src/services/worker/search/SearchOrchestrator.ts` | 搜索编排器 |
| `src/services/worker/search/strategies/SQLiteSearchStrategy.ts` | FTS5 策略 |
| `src/services/worker/search/strategies/ChromaSearchStrategy.ts` | 向量策略 |
| `src/services/worker/search/strategies/HybridSearchStrategy.ts` | 混合策略 |

## Context 生成

| 文件 | 功能 |
|------|------|
| `src/services/context/ContextBuilder.ts` | 上下文构建器 |
| `src/services/context/ObservationCompiler.ts` | Observation 编译为索引 |
| `src/services/context/TokenCalculator.ts` | Token 估算 |
| `src/services/context/sections/TimelineRenderer.ts` | 时间线渲染 |
| `src/services/context/sections/SummaryRenderer.ts` | 摘要渲染 |

## 基础设施

| 文件 | 功能 |
|------|------|
| `src/services/infrastructure/ProcessManager.ts` | PID 文件 + 进程启停 |
| `src/services/infrastructure/HealthMonitor.ts` | 健康检查 + 端口检测 |
| `src/services/infrastructure/GracefulShutdown.ts` | 7 步优雅关闭 |
| `src/supervisor/index.ts` | 进程监督器 |
| `src/shared/paths.ts` | 路径常量（DATA_DIR, DB_PATH） |
| `src/shared/hook-constants.ts` | Hook 退出码定义 |
| `src/utils/tag-stripping.ts` | `<private>` 标签剥离 |

## Skills

| 文件 | 功能 |
|------|------|
| `plugin/skills/learn-codebase/SKILL.md` | 代码库学习 |
| `plugin/skills/make-plan/SKILL.md` | 计划生成 |
| `plugin/skills/do/SKILL.md` | 计划执行 |
| `plugin/skills/mem-search/SKILL.md` | 记忆搜索 |
| `plugin/skills/knowledge-agent/SKILL.md` | 知识库 |
| `plugin/skills/smart-explore/SKILL.md` | AST 代码探索 |

## 快速阅读路径

```
hooks.json → hook-command.ts → handlers/observation.ts → worker-service.ts → SessionManager.ts → Database.ts
```

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

---

> 本附录来自《Agent Memory 工程实战》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
