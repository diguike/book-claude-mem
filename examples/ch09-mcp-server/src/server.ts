/**
 * ch09：最小化 MCP Server 实现
 *
 * 实现 MCP 协议（JSON-RPC 2.0 over stdio）的三个核心工具：
 *   search          → FTS5 全文搜索
 *   get_observations → 根据 ID 返回完整详情
 *   timeline        → 返回 anchor 前后的时间线
 *
 * 运行：tsx src/server.ts
 * 测试：tsx src/test-client.ts（另起终端或管道输入）
 */

import Database from 'better-sqlite3';
import { createInterface } from 'readline';

// ─────────────────────────────────────────────────────────────
// 数据库初始化（内存数据库，便于演示）
// ─────────────────────────────────────────────────────────────

const db = new Database(':memory:');

db.exec(`
  CREATE TABLE observations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL DEFAULT 'change',
    title      TEXT NOT NULL,
    narrative  TEXT NOT NULL DEFAULT '',
    facts      TEXT NOT NULL DEFAULT '[]',
    project    TEXT NOT NULL DEFAULT 'demo',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- FTS5 虚拟表，使用 trigram 分词器支持中文
  CREATE VIRTUAL TABLE observations_fts USING fts5(
    title,
    narrative,
    content='observations',
    content_rowid='id',
    tokenize='trigram'
  );

  -- 同步触发器
  CREATE TRIGGER obs_fts_insert AFTER INSERT ON observations BEGIN
    INSERT INTO observations_fts(rowid, title, narrative)
    VALUES (new.id, new.title, new.narrative);
  END;
`);

// 写入示例数据
const insert = db.prepare(
  'INSERT INTO observations (type, title, narrative, facts) VALUES (?, ?, ?, ?)'
);
const sampleObs = [
  ['bugfix', '修复连接池泄漏', 'Worker 处理队列任务时未关闭 SQLite 连接，导致文件描述符耗尽。在 finally 块中添加 store.close() 修复。', '["复现：连续处理200条任务后EMFILE报错","修复：try/finally包裹所有store操作"]'],
  ['change', 'FTS5 分词器升级为 trigram', '将 unicode61 改为 trigram，中文搜索召回率从 30% 提升到 85%。需重建 FTS5 索引。', '["建表：tokenize=trigram","重建：INSERT INTO obs_fts(obs_fts) VALUES(rebuild)"]'],
  ['decision', '选用 BullMQ 替代自研队列', '评估 BullMQ、Bee-Queue 和自研 SQLite 方案，选 BullMQ。支持重试、优先级和失败队列。', '["需要 Redis","单Worker 5 concurrency","可横向扩展"]'],
  ['discovery', 'Hook stdin 有 4MB 上限', 'Hook stdin 超过 4MB 时 JSON 解析失败。需在 save-hook 中检查长度并截断 toolResponse。', '["截断策略：前500字+后200字","影响：Read大文件或Bash长输出"]'],
  ['how-it-works', 'MCP search 工具流程', 'FTS5 全文搜索 → BM25 排序 → 返回前N条 ID+标题。get_observations 根据 ID 返回完整详情。', '["协议：JSON-RPC over stdio","search参数：query,project,limit","返回：{id,title}数组"]'],
];
for (const [type, title, narrative, facts] of sampleObs) {
  insert.run(type, title, narrative, facts);
}

// ─────────────────────────────────────────────────────────────
// MCP 工具实现
// ─────────────────────────────────────────────────────────────

interface SearchArgs { query: string; project?: string; limit?: number }
interface GetObsArgs { ids: number[] }
interface TimelineArgs { anchor: number; before?: number; after?: number }

function search({ query, project, limit = 10 }: SearchArgs) {
  // 对用户输入转义：替换双引号为两个双引号（FTS5 规则）
  const safeQuery = query.replace(/"/g, '""');
  let sql = `
    SELECT o.id, o.type, o.title, o.project
    FROM observations_fts f
    JOIN observations o ON o.id = f.rowid
    WHERE f.observations_fts MATCH ?
  `;
  const params: (string | number)[] = [safeQuery];
  if (project) { sql += ' AND o.project = ?'; params.push(project); }
  sql += ' ORDER BY rank LIMIT ?';
  params.push(limit);

  try {
    const rows = db.prepare(sql).all(...params) as Array<{
      id: number; type: string; title: string; project: string
    }>;
    return { results: rows, count: rows.length };
  } catch {
    // FTS5 语法错误时降级为 LIKE 搜索
    const likeRows = db.prepare(
      'SELECT id, type, title, project FROM observations WHERE title LIKE ? LIMIT ?'
    ).all(`%${query}%`, limit) as Array<{ id: number; type: string; title: string; project: string }>;
    return { results: likeRows, count: likeRows.length, fallback: true };
  }
}

function getObservations({ ids }: GetObsArgs) {
  if (!ids.length) return { observations: [] };
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT id, type, title, narrative, facts, project, created_at
     FROM observations WHERE id IN (${placeholders}) ORDER BY created_at DESC`
  ).all(...ids) as Array<{
    id: number; type: string; title: string;
    narrative: string; facts: string; project: string; created_at: string
  }>;

  return {
    observations: rows.map(r => ({ ...r, facts: JSON.parse(r.facts) })),
  };
}

function timeline({ anchor, before = 3, after = 3 }: TimelineArgs) {
  const anchorRow = db.prepare(
    'SELECT id, type, title, narrative, created_at, project FROM observations WHERE id = ?'
  ).get(anchor) as { id: number; type: string; title: string; narrative: string; created_at: string; project: string } | undefined;

  if (!anchorRow) return { error: `Observation ${anchor} not found` };

  const beforeRows = db.prepare(`
    SELECT id, type, title, created_at FROM observations
    WHERE project = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?
  `).all(anchorRow.project, anchorRow.created_at, before) as Array<{ id: number; type: string; title: string; created_at: string }>;

  const afterRows = db.prepare(`
    SELECT id, type, title, created_at FROM observations
    WHERE project = ? AND created_at > ? ORDER BY created_at ASC LIMIT ?
  `).all(anchorRow.project, anchorRow.created_at, after) as Array<{ id: number; type: string; title: string; created_at: string }>;

  return {
    before: beforeRows.reverse(),
    anchor: anchorRow,
    after: afterRows,
  };
}

// ─────────────────────────────────────────────────────────────
// MCP 协议处理（JSON-RPC 2.0 over stdio）
// ─────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'search',
    description: 'Full-text search across observations. Returns matching IDs and titles.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords' },
        project: { type: 'string', description: 'Filter by project name (optional)' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_observations',
    description: 'Fetch full details (narrative + facts) for given observation IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'number' }, description: 'Observation IDs to fetch' },
      },
      required: ['ids'],
    },
  },
  {
    name: 'timeline',
    description: 'Get observations before/after a specific observation.',
    inputSchema: {
      type: 'object',
      properties: {
        anchor: { type: 'number', description: 'Anchor observation ID' },
        before: { type: 'number', description: 'Count before (default 3)' },
        after: { type: 'number', description: 'Count after (default 3)' },
      },
      required: ['anchor'],
    },
  },
];

function handleRequest(req: Record<string, unknown>): Record<string, unknown> {
  const id = req.id ?? null;
  const method = req.method as string;

  // 初始化握手
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'ch09-mcp-demo', version: '1.0.0' },
      },
    };
  }

  // 工具列表
  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  }

  // 工具调用
  if (method === 'tools/call') {
    const params = req.params as { name: string; arguments: Record<string, unknown> };
    const toolName = params.name;
    const args = params.arguments;

    let toolResult: unknown;
    try {
      if (toolName === 'search') toolResult = search(args as unknown as SearchArgs);
      else if (toolName === 'get_observations') toolResult = getObservations(args as unknown as GetObsArgs);
      else if (toolName === 'timeline') toolResult = timeline(args as unknown as TimelineArgs);
      else throw new Error(`Unknown tool: ${toolName}`);
    } catch (err) {
      return {
        jsonrpc: '2.0', id,
        error: { code: -32603, message: String(err) },
      };
    }

    return {
      jsonrpc: '2.0', id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }],
      },
    };
  }

  return {
    jsonrpc: '2.0', id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

// ─────────────────────────────────────────────────────────────
// stdin/stdout 主循环
// ─────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const req = JSON.parse(trimmed) as Record<string, unknown>;
    const response = handleRequest(req);
    process.stdout.write(JSON.stringify(response) + '\n');
  } catch (err) {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id: null,
      error: { code: -32700, message: `Parse error: ${err}` },
    }) + '\n');
  }
});

rl.on('close', () => {
  db.close();
  process.exit(0);
});

process.stderr.write('[ch09-mcp-demo] MCP Server started, waiting for JSON-RPC input...\n');
