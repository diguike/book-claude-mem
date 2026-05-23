---
title: "第 7 章：存储层设计"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/L3xQwJNuMiOUxskqnLjc31Jvnvg"
last_synced: "2026-05-05T16:52:35Z"
---

## SQLite 数据模型：6 张核心表

claude-mem 的持久化存储使用 SQLite，通过 Bun 原生的 `bun:sqlite` 驱动访问。数据库文件位于 `~/.claude-mem/claude-mem.db`。

初始化时设置了一系列 PRAGMA（SQLite 的运行时配置指令，类似于数据库的 "设置项"）：

```typescript
// src/services/sqlite/Database.ts
this.db.run('PRAGMA journal_mode = WAL');       // WAL 模式：读写互不阻塞（类似 optimistic locking）
this.db.run('PRAGMA synchronous = NORMAL');      // 不要每次写都等磁盘确认，换取性能
this.db.run('PRAGMA foreign_keys = ON');         // 开启外键约束
this.db.run('PRAGMA temp_store = memory');       // 临时计算在内存中完成
this.db.run('PRAGMA mmap_size = 268435456');     // 用 256MB 内存映射文件，加速读取
this.db.run('PRAGMA cache_size = 10000');        // 缓存 10000 个数据页
```

如果你之前只用过 Prisma 或 TypeORM，直接写 SQL 和 PRAGMA 可能感觉 "底层"。但 SQLite 的优势正在于：它不需要安装服务、不需要连接字符串，就是一个文件。PRAGMA 只需要设置一次，之后的 CRUD 操作和 ORM 里写的没有本质区别。

6 张核心表及其关系：

```sql
-- 会话表：每次 Claude Code 会话的生命周期
CREATE TABLE sdk_sessions (
  id INTEGER PRIMARY KEY,
  content_session_id TEXT NOT NULL,    -- Claude Code 分配的会话 ID
  memory_session_id TEXT,              -- SDK Agent 的内部 ID
  project TEXT,                        -- 项目名称
  status TEXT DEFAULT 'active',        -- active → summarizing → completed
  user_prompt TEXT,                    -- 首条用户 prompt
  cwd TEXT,                           -- 工作目录
  platform_source TEXT,               -- claude-code / cursor / gemini-cli
  created_at_epoch INTEGER,
  completed_at_epoch INTEGER
);

-- 观察表：AI 压缩后的结构化记忆单元
CREATE TABLE observations (
  id INTEGER PRIMARY KEY,
  memory_session_id TEXT NOT NULL,
  type TEXT NOT NULL,                  -- decision/bugfix/discovery/change/...
  title TEXT NOT NULL,                 -- 10 字内的标题
  narrative TEXT,                      -- 详细叙述
  facts TEXT,                         -- JSON 数组，关键事实
  files_read TEXT,                    -- JSON 数组
  files_modified TEXT,                -- JSON 数组
  concepts TEXT,                      -- JSON 数组，概念标签
  content_hash TEXT,                  -- SHA256[:16] 去重
  token_estimate INTEGER,             -- 预估 Token 数
  created_at_epoch INTEGER,
  FOREIGN KEY (memory_session_id) REFERENCES sdk_sessions(memory_session_id)
);

-- 会话摘要表：AI 生成的会话级总结
CREATE TABLE session_summaries (
  id INTEGER PRIMARY KEY,
  memory_session_id TEXT NOT NULL,
  project TEXT,
  request TEXT,                       -- 用户原始需求
  investigated TEXT,                  -- 调查了什么
  learned TEXT,                       -- 发现了什么
  completed TEXT,                     -- 完成了什么
  next_steps TEXT,                    -- 下一步建议
  files_read TEXT,                    -- JSON 数组
  files_modified TEXT,                -- JSON 数组
  notes TEXT,                         -- 补充说明
  created_at_epoch INTEGER
);

-- 用户 Prompt 表：原始 prompt 存储
CREATE TABLE user_prompts (
  id INTEGER PRIMARY KEY,
  content_session_id TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  prompt_number INTEGER DEFAULT 1,
  created_at_epoch INTEGER
);

-- 待处理消息队列
CREATE TABLE pending_messages (
  id INTEGER PRIMARY KEY,
  session_db_id INTEGER NOT NULL,
  message_type TEXT NOT NULL,         -- observation / summary
  payload TEXT NOT NULL,              -- JSON 序列化的原始数据
  status TEXT DEFAULT 'pending',      -- pending → processing
  created_at_epoch INTEGER,
  FOREIGN KEY (session_db_id) REFERENCES sdk_sessions(id)
);

-- 观察反馈表：跟踪哪些 Observation 被实际使用
CREATE TABLE observation_feedback (
  id INTEGER PRIMARY KEY,
  observation_id INTEGER NOT NULL,
  signal_type TEXT NOT NULL,          -- viewed / fetched / cited
  created_at_epoch INTEGER,
  FOREIGN KEY (observation_id) REFERENCES observations(id)
);
```

## FTS5 全文搜索

SQLite 的 FTS5 扩展为 claude-mem 提供了高性能的全文搜索能力，无需外部搜索引擎。

### 建表

```sql
-- FTS5 虚拟表，索引 observations 的文本字段
CREATE VIRTUAL TABLE observations_fts USING fts5(
  title,
  narrative,
  facts,
  concepts,
  content='observations',
  content_rowid='id',
  tokenize='unicode61'
);

-- 触发器：observations 表变更时自动同步 FTS5
CREATE TRIGGER observations_ai AFTER INSERT ON observations BEGIN
  INSERT INTO observations_fts(rowid, title, narrative, facts, concepts)
  VALUES (new.id, new.title, new.narrative, new.facts, new.concepts);
END;
```

### 查询

MCP search 工具最终执行的就是 FTS5 查询：

```sql
-- 基本搜索
SELECT o.*, rank
FROM observations_fts
JOIN observations o ON o.id = observations_fts.rowid
WHERE observations_fts MATCH ?
ORDER BY rank
LIMIT ? OFFSET ?;

-- 带过滤的搜索
SELECT o.*, rank
FROM observations_fts
JOIN observations o ON o.id = observations_fts.rowid
WHERE observations_fts MATCH ?
  AND o.type = ?
  AND o.created_at_epoch >= ?
  AND o.created_at_epoch <= ?
ORDER BY rank
LIMIT ?;
```

FTS5 的 MATCH 语法支持：
- 简单词搜索：`authentication bug`
- 短语搜索：`"token refresh"`
- 前缀搜索：`auth*`
- 布尔操作：`authentication AND NOT session`
- 列限定：`title: timeout`

### 注入防护

FTS5 的 MATCH 语法对特殊字符敏感。claude-mem 在查询前进行转义：

```typescript
function escapeFTS5Query(query: string): string {
  // 双引号转义
  return query.replace(/"/g, '""');
}
```

源码中有 332 个注入测试用例覆盖各种攻击向量：特殊字符、SQL 关键字、引号逃逸、布尔操作符注入等。

## WAL 模式与并发读写

WAL（Write-Ahead Logging）模式是 claude-mem 选择的日志模式：

```sql
PRAGMA journal_mode = WAL;
```

在默认的 rollback journal 模式下，写操作会阻塞读操作。WAL 模式的优势：

- **并发读写**：读操作不阻塞写操作，写操作不阻塞读操作
- **更好的写性能**：写入先进入 WAL 文件，减少主数据库文件的 I/O
- **崩溃安全**：WAL 文件在崩溃后可用于恢复

这对 claude-mem 的场景至关重要：Hook 层可能在写入 pending_messages 的同时，MCP Server 正在读取 observations 做搜索。WAL 确保两者互不阻塞。

`PRAGMA synchronous = NORMAL` 是在安全性和性能之间的折中：不像 FULL 那样每次写都 fsync，但在 WAL 模式下仍然保证崩溃一致性。

## ChromaDB 向量存储

ChromaDB 为 claude-mem 提供语义搜索能力。当关键词搜索不够精确时（比如用户搜索"性能优化"但实际 observation 标题是"减少 API 响应时间"），向量搜索通过 Embedding 相似度找到语义相关的结果。

### Embedding 同步策略

每条 Observation 生成后，ChromaSync 服务将其同步到 ChromaDB：

```typescript
// 简化的同步逻辑
// 完整实现见 src/services/sync/ChromaSync.ts
async function syncObservation(obs: Observation): Promise<void> {
  const documents = [];

  // 主叙述
  documents.push({
    id: `obs_${obs.id}_narrative`,
    text: obs.narrative,
    metadata: { type: obs.type, project: obs.project }
  });

  // 每个 fact 单独建索引
  for (let i = 0; i < obs.facts.length; i++) {
    documents.push({
      id: `obs_${obs.id}_fact_${i}`,
      text: obs.facts[i],
      metadata: { type: obs.type, project: obs.project }
    });
  }

  await chromaCollection.add(documents);
}
```

每条 Observation 被拆分为多个 Document（narrative + 各个 fact），分别 Embedding。这样搜索时可以命中具体的某个 fact，而非整条 Observation 的"平均语义"。

### 通信方式

ChromaDB 通过 MCP 进程方式运行（不是 HTTP 服务），claude-mem 通过 `ChromaMcpManager` 管理其生命周期：

```
Worker 进程 ←── stdio（JSON-RPC）──→ ChromaDB MCP 进程
```

这种设计避免了额外的端口占用和网络开销，同时利用 MCP 协议的标准化通信模式。

## 混合检索：关键词 + 语义

claude-mem 的搜索不是单纯的 FTS5 或单纯的向量搜索，而是两者的混合：

```typescript
// 简化的混合搜索逻辑
// 完整实现见 src/services/worker/search/strategies/HybridSearchStrategy.ts
async function hybridSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
  // 并行执行两种搜索
  const [ftsResults, vectorResults] = await Promise.all([
    sqliteSearch(query, options),    // FTS5 关键词搜索
    chromaSearch(query, options),    // 向量语义搜索
  ]);

  // 合并去重（同一个 observation ID 可能出现在两种结果中）
  const merged = mergeAndDeduplicate(ftsResults, vectorResults);

  // 按综合相关度排序
  return merged.sort((a, b) => b.score - a.score);
}
```

两种搜索的互补性：

| 场景 | FTS5 | ChromaDB |
|------|------|----------|
| 精确关键词 | 强 | 一般 |
| 语义相关（换了说法） | 弱 | 强 |
| 文件路径搜索 | 强 | 弱 |
| 概念关联 | 一般 | 强 |

通过混合搜索，用户无论使用精确术语还是模糊描述都能找到相关记忆。

## Deduplication：内容哈希去重的 30 秒窗口

在高频操作时（比如连续保存文件），PostToolUse Hook 可能在短时间内发送多条近似的观察。AI 压缩后可能产生相同的 Observation。claude-mem 通过 content_hash 去重：

```typescript
// 去重逻辑
function computeContentHash(sessionId: string, title: string, narrative: string): string {
  const input = `${sessionId}${title}${narrative}`;
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function shouldInsert(hash: string, now: number): boolean {
  const existing = db.query(
    'SELECT created_at_epoch FROM observations WHERE content_hash = ? ORDER BY created_at_epoch DESC LIMIT 1'
  ).get(hash);

  if (!existing) return true;

  // 30 秒窗口内的重复内容不重复插入
  const elapsed = now - existing.created_at_epoch;
  return elapsed > 30;
}
```

为什么是 30 秒？
- 太短（如 5 秒）：可能漏掉真正的重复（AI 处理延迟可能超过 5 秒）
- 太长（如 5 分钟）：可能误判正常的重复操作（比如用户确实在 2 分钟后做了相同的修改）
- 30 秒是基于"AI 压缩单条 Observation 通常 5-30 秒"这个经验值选取的

---

**思考题**

1. 如果 Observation 量达到 100 万条，SQLite 还够用吗？FTS5 索引的大小和查询延迟会如何变化？设计一个基准测试来评估。
2. 当前的去重窗口是 30 秒。如果用户在做"撤销-重做"操作（间隔可能 1-2 分钟），这个窗口够大吗？如何设计一个自适应的去重策略？
3. ChromaDB 向量同步是异步的，这意味着刚写入的 Observation 可能还没有向量索引。这对搜索结果有什么影响？如何缓解？

---

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

下一章进入核心机制篇，深入分析 Progressive Disclosure 的设计细节和实现方式。

---

> 本章来自《Agent Memory 工程实战》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
