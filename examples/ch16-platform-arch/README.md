# ch16-platform-arch：多租户记忆服务的最小模型

第 16 章配套示例。用 SQLite + Express 5 把 claude-mem Server 运行时（v13.35.0，`src/server/`、`src/storage/postgres/`）里最关键的几条设计压缩到一个进程里，跑完自动退出，不需要 Postgres 和 Redis。

| 演示点 | 对应的 claude-mem 实现 |
|--------|------------------------|
| 每张业务表带 `(project_id, team_id)`，复合外键指向 `projects(id, team_id)` | `src/storage/postgres/schema.ts` |
| API Key 只存 SHA-256，按 `memories:read` / `memories:write` 作用域鉴权（只有 `*` 是通配） | `src/server/middleware/postgres-auth.ts` |
| 事件行 + 发件箱行同一事务写入，提交后再发布 | `src/server/services/IngestEventsService.ts` |
| 事件幂等键是内容哈希，同一个 body 重发只入库一次 | `buildAgentEventIdempotencyKey()`（`src/storage/postgres/agent-events.ts`） |
| 确定性任务 ID `evt_<sha256>`，同一来源重复发布被队列去重 | `src/server/jobs/job-id.ts` |
| Worker 只处理 `queued` 行，`processing` / 终态直接跳过 | `ProviderObservationGenerator.lockOutbox()` |
| `retry` 对 `queued` 是空操作；对 `processing` / `completed` 返回 409 | `ServerV1PostgresRoutes.retryGenerationJob()` |
| 跨租户读返回 404，与不存在的 ID 无法区分 | `loadScopedById(..., scopeMismatch: 'not-found')` |

## 运行

```bash
npm install
npm run demo        # 随机端口，跑完退出
npm run typecheck
```

## 文件

| 文件 | 说明 |
|------|------|
| `src/db.ts` | 建表：teams / projects / api_keys / audit_log / agent_events / observation_generation_jobs / observations |
| `src/auth.ts` | 生成 `cmem_` 前缀的 key、按哈希查库、作用域检查 |
| `src/jobs.ts` | `buildJobId`、模拟 BullMQ 去重的进程内队列、生成 Worker |
| `src/app.ts` | `/v1/events`、`/v1/events/:id`、`/v1/jobs/:id/retry`、`/v1/jobs/:id/cancel` |
| `src/demo.ts` | 6 个场景：写入、重发、重复投递、租户隔离、发布失败后的运维恢复、审计日志 |

## 与真实实现的差别

- 存储用 SQLite 内存库代替 Postgres 17，队列用进程内数组代替 BullMQ + Valkey，模型调用用固定字符串代替
- 没有限流、用量计量、会话、摘要通道（summary lane）和 MCP 端点
- 场景 [5] 演示的“先 cancel 再 retry”是 v13.35.0 里把发布失败的任务重新送进队列的唯一手动路径：源码注释提到的启动对账（startup reconciliation）在这个版本里没有实现
