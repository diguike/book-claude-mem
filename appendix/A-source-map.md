---
title: "附录 A：claude-mem 源码导航图"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/Izgzwz9gjitMULkwVQlctduTn0d"
last_synced: "2026-10-13T11:44:02+08:00"
---

基于 v13.35.0，按功能模块组织的文件路径速查。表中路径均已在该版本的源码树中核对存在；右列标出主要讲解它的章节。

## 入口与配置

| 文件 | 功能 | 章节 |
|------|------|------|
| `plugin/hooks/hooks.json` | Claude Code 的 Hook 注册（8 个事件） | 5 |
| `plugin/hooks/codex-hooks.json` | Codex CLI 的 Hook 注册 | 18 |
| `plugin/.mcp.json` | MCP Server 注册 | 9 |
| `plugin/.claude-plugin/plugin.json` | 插件元数据 | 12 |
| `src/shared/SettingsDefaultsManager.ts` | 全部 `CLAUDE_MEM_*` 配置项与默认值 | 2 |
| `src/shared/paths.ts` | 数据目录、数据库等路径 | 2 |
| `transcript-watch.example.json` | Codex / DSH 的 transcript schema 示例 | 18 |
| `docker-compose.yml` | Server 运行时部署栈 | 16 |
| `docs/ip-boundary.md` | 开源与商业版保留区域的边界 | 17 |

## Hook 命令层

| 文件 | 功能 | 章节 |
|------|------|------|
| `src/cli/hook-command.ts` | Hook 统一入口：缓冲 stderr、永远以 0 退出 | 4、5 |
| `src/shared/hook-io.ts` | Hook 的 stdout / stderr / 退出码纪律 | 5 |
| `src/shared/hook-constants.ts` | 超时与退出码常量 | 5 |
| `src/cli/types.ts` | `NormalizedHookInput` 统一结构 | 18 |
| `src/cli/adapters/` | 7 个平台适配器（claude-code、codex、cursor、kimi、windsurf、antigravity-cli、raw） | 18 |
| `src/cli/handlers/index.ts` | 9 个 Handler 注册表 | 4 |
| `src/cli/handlers/context.ts` | SessionStart：读 context-cache 注入 | 5、8 |
| `src/cli/handlers/session-init.ts` | UserPromptSubmit：登记本轮 prompt | 5 |
| `src/cli/handlers/observation.ts` | PostToolUse：写 spool 后立即返回 | 5 |
| `src/cli/handlers/file-context.ts` | PreToolUse：文件上下文与 File Read Gate | 5、8 |
| `src/cli/handlers/memory-search.ts` | 宿主原生记忆检索时补充 claude-mem 结果 | 20 |
| `src/cli/handlers/summarize.ts`、`session-end.ts` | Stop / SessionEnd 收尾 | 5 |

## 交接层

| 文件 | 功能 | 章节 |
|------|------|------|
| `src/shared/hook-spool.ts` | Hook 侧：一个事件一个文件，原子写入 | 4、6 |
| `src/services/worker/hook-spool-drain.ts` | Worker 侧取件，`hook_spool_consumed` 恰好一次交接 | 6 |
| `src/shared/context-cache.ts` | 预渲染的开场上下文缓存 | 4、8 |

## Worker

| 文件 | 功能 | 章节 |
|------|------|------|
| `src/services/worker-service.ts` | Worker 主入口与 CLI 分发 | 6 |
| `src/services/worker-shutdown.ts` | `runShutdownSequence`：硬期限与继任进程 | 6 |
| `src/services/infrastructure/GracefulShutdown.ts` | 六步优雅关闭 | 6 |
| `src/services/infrastructure/ProcessManager.ts` | 进程启停 | 6 |
| `src/shared/worker-spawn-gate.ts` | `spawn.lock` 防重复拉起 | 6 |
| `src/services/server/init-phase.ts` | `/api/ready` 的启动阶段 | 6 |
| `src/services/worker/http/middleware.ts` | Host 检查（DNS rebinding）、跨域、删除来源限制 | 6、17 |
| `src/services/worker/http/shared.ts` | 隐私标签剥离、项目排除等入口检查 | 10、17 |
| `src/services/worker/SessionManager.ts` | 会话生命周期 | 6 |
| `src/services/worker/SessionMessageBuffer.ts` | 内存缓冲（取代 v12 的持久队列） | 6 |
| `src/services/worker/agents/ResponseProcessor.ts` | 观察者输出的处理与入库 | 10 |
| `src/shared/observer-recycle.ts` | 观察者会话的分代回收 | 6 |

## 观察者

| 文件 | 功能 | 章节 |
|------|------|------|
| `src/sdk/prompts.ts` | 观察者提示词（缓存友好的前缀） | 10 |
| `src/sdk/hardened-options.ts` | 观察者的六层收紧 | 10、17 |
| `src/sdk/parser.ts` | 观察 XML 解析与容错 | 10 |
| `src/utils/tag-stripping.ts` | `<private>` 等标签剥离 | 10 |
| `src/utils/redaction.ts` | 自动脱敏（11 条内置规则） | 17 |

## 存储与检索

| 文件 | 功能 | 章节 |
|------|------|------|
| `src/services/sqlite/SessionStore.ts` | 建表、迁移、写入、去重与强化 | 7 |
| `src/services/sqlite/SessionSearch.ts` | FTS5 检索 | 7 |
| `src/services/sqlite/tool-uses.ts` | `tool_uses` 原始证据表 | 8、10 |
| `src/services/worker/DatabaseManager.ts` | 数据库与 Chroma 集合管理 | 7 |
| `src/services/worker/SearchManager.ts` | 检索入口 | 7、9 |
| `src/services/worker/search/SearchOrchestrator.ts` | Chroma 优先、SQLite 补齐的路由 | 7 |
| `src/services/sync/ChromaSync.ts` | 向量同步 | 7 |
| `src/services/reinforcement/` | ACT-R 强化历史与排序 | 7、20 |

## 上下文与 MCP

| 文件 | 功能 | 章节 |
|------|------|------|
| `src/services/context/ContextBuilder.ts` | 开场上下文组装 | 8 |
| `src/services/context/ContextBudget.ts` | 10,000 字符预算与裁剪顺序 | 8 |
| `src/servers/mcp-server.ts` | MCP Server（24 个工具） | 9 |
| `src/servers/mcp-tool-visibility.ts` | 按运行时隐藏工具 | 9 |
| `src/services/worker/knowledge/` | Knowledge Agent：Corpus 构建、prime、query | 11 |

## Server 运行时

| 文件 | 功能 | 章节 |
|------|------|------|
| `src/storage/postgres/schema.ts` | Postgres 表结构与复合外键 | 16 |
| `src/server/routes/v1/ServerV1PostgresRoutes.ts` | `/v1/*` 路由、重试与取消、删除 | 16、17 |
| `src/server/services/IngestEventsService.ts` | 事务发件箱 | 16 |
| `src/server/jobs/job-id.ts`、`ServerJobQueue.ts` | 确定性任务 ID、BullMQ 参数 | 16 |
| `src/server/generation/ProviderObservationGenerator.ts` | 生成 worker：`lockOutbox`、租户复核 | 16 |
| `src/server/middleware/postgres-auth.ts`、`rate-limit.ts` | API Key 鉴权、限流与配额 | 16、17 |
| `src/services/hooks/runtime-selector.ts`、`server-client.ts` | Hook 选择运行时与回落规则 | 16 |

## 多宿主与同步

| 文件 | 功能 | 章节 |
|------|------|------|
| `src/services/transcripts/` | 声明式 transcript watcher | 18 |
| `src/integrations/opencode-plugin/`、`pi-extension/`、`dsh-plugin/` | 原生插件 | 18 |
| `openclaw/src/index.ts` | OpenClaw 插件 | 18 |
| `src/services/sync/CloudSync.ts` | 云同步推送 | 19 |
| `src/services/sync/SyncApply.ts`、`SyncClient.ts` | 云同步拉取与应用 | 19 |
| `src/services/sync/CanonicalContent.ts` | 规范化 JSON 与稳定文档 ID | 19 |
| `workers/sync-hub/src/do/SyncHub.ts` | hub：每个用户一条有序日志 | 19 |
| `src/services/telemetry/scrub.ts` | 遥测属性白名单 | 17 |

## Skills

`plugin/skills/` 下共 22 个技能。与记忆直接相关的有 `mem-search`、`knowledge-agent`、`learn-codebase`、`smart-explore`、`timeline-report`、`weekly-digests`、`cloud-sync`、`mode-creator`；`make-plan`、`do`、`handoff`、`standup` 等是建立在记忆之上的工作流技能。第 2 章按用途分组介绍。

## 快速阅读路径

写入路径：

```text
hooks.json → hook-command.ts → handlers/observation.ts → shared/hook-spool.ts
  → worker/hook-spool-drain.ts → SessionMessageBuffer.ts → sdk/prompts.ts
  → agents/ResponseProcessor.ts → sqlite/SessionStore.ts
```

读取路径：

```text
handlers/context.ts → shared/context-cache.ts → context/ContextBuilder.ts → ContextBudget.ts
servers/mcp-server.ts（mem_search）→ worker/SearchManager.ts → search/SearchOrchestrator.ts
```

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

---

> 本附录来自《Agent Memory 工程实战》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
