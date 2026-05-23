---
title: "第 16 章：从 Plugin 到平台的架构升级"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/AfWHw1XmhilSuWkD8eyc9KmInIg"
last_synced: "2026-05-05T16:52:35Z"
---

## 单用户 → 多用户：认证与隔离

claude-mem 作为本地 Plugin 不需要认证——数据文件在用户 home 目录下。升级为多用户平台后，认证和数据隔离是第一个要解决的问题。

### 认证方案

```typescript
// JWT-based 认证中间件
import { verify } from 'jsonwebtoken';

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const payload = verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;
    req.orgId = payload.org;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
```

### 数据隔离模型

三种隔离方案的对比：

| 方案 | 隔离度 | 运维复杂度 | 适用规模 |
|------|--------|-----------|---------|
| 行级隔离（同表加 org_id） | 低 | 低 | < 100 团队 |
| Schema 隔离（每个 org 一个 schema） | 中 | 中 | 100-1000 团队 |
| 数据库隔离（每个 org 独立 DB） | 高 | 高 | > 1000 团队或合规要求 |

推荐起步方案：**行级隔离 + RLS（Row Level Security）**。PostgreSQL 原生支持 RLS，最小侵入性：

```sql
-- 开启 RLS
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;

-- 策略：用户只能看到自己组织的数据
CREATE POLICY org_isolation ON observations
  USING (org_id = current_setting('app.org_id')::int);
```

## 本地 SQLite → 分布式存储

### PostgreSQL + pgvector

从 SQLite 迁移到 PostgreSQL 获得：
- 多客户端并发访问
- 原生的 JSONB 支持
- pgvector 扩展做向量搜索（无需独立的 ChromaDB）
- 成熟的备份和复制方案

Schema 迁移对照：

```sql
-- 从 SQLite FTS5 到 PostgreSQL 全文搜索
-- SQLite
CREATE VIRTUAL TABLE observations_fts USING fts5(title, narrative);

-- PostgreSQL
ALTER TABLE observations ADD COLUMN search_vector tsvector;
CREATE INDEX obs_search_idx ON observations USING gin(search_vector);

-- 搜索查询（注意：中文全文搜索需要安装 pg_jieba 或 zhparser 扩展）
-- 安装：CREATE EXTENSION pg_jieba; 或 CREATE EXTENSION zhparser;
SELECT * FROM observations
WHERE search_vector @@ plainto_tsquery('jiebacfg', '连接池 泄漏')
ORDER BY ts_rank(search_vector, plainto_tsquery('jiebacfg', '连接池 泄漏')) DESC;
```

向量搜索：

```sql
-- pgvector 向量列
ALTER TABLE observations ADD COLUMN embedding vector(1536);
CREATE INDEX obs_embedding_idx ON observations USING ivfflat (embedding vector_cosine_ops);

-- 语义搜索
SELECT *, embedding <=> $1 AS distance
FROM observations
WHERE org_id = $2
ORDER BY embedding <=> $1
LIMIT 10;
```

pgvector 将关键词搜索和向量搜索统一在一个数据库中，大幅简化了架构（不再需要 ChromaDB + SQLite 两个存储引擎）。

## 单 Worker → 队列集群

本地 Plugin 的 Worker 是单进程。当并发用户达到数百时，需要分布式队列。

### BullMQ 方案

```typescript
import { Queue, Worker } from 'bullmq';

// 生产者：Hook 接收到 observation 后入队
const observationQueue = new Queue('observations', {
  connection: { host: 'redis-host', port: 6379 }
});

await observationQueue.add('compress', {
  userId: 'user-123',
  orgId: 'org-456',
  toolName: 'Edit',
  toolInput: {...},
  toolResponse: {...}
});

// 消费者：Worker 从队列取出处理
const worker = new Worker('observations', async (job) => {
  const { userId, orgId, toolName, toolInput, toolResponse } = job.data;
  const compressed = await compressObservation(toolName, toolInput, toolResponse);
  await storeObservation(orgId, userId, compressed);
}, {
  connection: { host: 'redis-host', port: 6379 },
  concurrency: 5  // 每个 Worker 实例并发处理 5 个
});
```

### 扩缩容策略

- 根据队列深度自动扩展 Worker 实例数
- AI 压缩是 I/O 密集型（等待 API 响应），单实例可以高并发
- 按组织分配独立队列，防止大组织占满共享资源

## Hook → Webhook/Event Bus：解耦与扩展

本地 Plugin 通过 Claude Code Hook 触发。平台化后需要支持更多事件源。

### Webhook 模式

```typescript
// 统一的事件接收接口
app.post('/api/events', authMiddleware, async (req, res) => {
  const { event_type, payload, source } = req.body;

  switch (event_type) {
    case 'tool_use':
      await observationQueue.add('compress', { ...payload, userId: req.userId });
      break;
    case 'session_start':
      // 返回注入的上下文
      const context = await getContext(req.userId, req.orgId, payload.project);
      res.json({ context });
      return;
    case 'session_end':
      await sessionQueue.add('summarize', { ...payload, userId: req.userId });
      break;
  }

  res.json({ status: 'accepted' });
});
```

### 多 IDE 适配

不同 IDE 的集成方式：

| IDE | 集成方式 | 事件传递 |
|-----|---------|---------|
| Claude Code | Hook + MCP | stdin/stdout JSON |
| Cursor | Rules + Hook | HTTP Webhook |
| VS Code (Copilot) | Extension API | HTTP Webhook |
| Gemini CLI | Hook | stdin/stdout |
| 自研 Agent | SDK | HTTP/gRPC |

平台提供统一的 SDK，各 IDE 的适配层将本地事件转换为标准 Webhook 格式：

```typescript
// @mini-mem/sdk
import { MemoryClient } from '@mini-mem/sdk';

const client = new MemoryClient({
  endpoint: 'https://memory.example.com',
  apiKey: process.env.MEMORY_API_KEY
});

// 上报工具使用
await client.reportToolUse({
  sessionId: 'session-123',
  project: 'my-app',
  toolName: 'Edit',
  toolInput: {...},
  toolResponse: {...}
});

// 获取上下文
const context = await client.getContext({
  project: 'my-app',
  limit: 30
});
```

---

**思考题**

1. PostgreSQL RLS（Row Level Security）的性能开销是多少？在 Observation 表达到百万级时，每条查询额外的 RLS 检查对延迟的影响有多大？有什么替代方案（如应用层过滤、分库）？
2. 从 SQLite 迁移到 PostgreSQL 后，FTS5 不再可用，需要换用 PostgreSQL 的 `tsvector` 全文搜索。两者在中文分词支持上有什么差异？如何处理？
3. 平台化后需要支持多租户。"共享数据库 + RLS" 和 "每租户独立数据库" 两种方案各有什么优缺点？在 Agent Memory 场景下哪种更合适？

---

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

下一章将设计企业级特性：团队知识共享、权限模型、数据治理和 Analytics。

---

> 本章来自《Agent Memory 工程实战》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
