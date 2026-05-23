---
title: "第 13 章：实现简版 Memory Plugin（mini-mem）"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/BstDwVMp4i9bwbkdGa9c3JYPnrf"
last_synced: "2026-05-05T16:52:35Z"
---

## 项目规划：MVP 功能范围

mini-mem 是一个精简但完整的 Memory Plugin，实现 claude-mem 的核心闭环：

**包含的功能**：
- SessionStart Hook：注入历史 Observation 索引
- PostToolUse Hook：捕获工具使用并存入 SQLite
- SessionEnd Hook：标记会话结束
- FTS5 全文搜索
- MCP Server：提供 search + get_observations 两个工具
- Progressive Disclosure 索引格式

**不包含的功能（留给第 14 章扩展）**：
- AI 压缩（本章直接从 Tool Usage 提取标题，不调 LLM）
- ChromaDB 向量搜索
- Worker 守护进程（本章用同步处理）
- Viewer UI

### 项目结构

```
examples/ch13-mini-mem/
├── package.json
├── tsconfig.json
├── src/
│   ├── hooks/
│   │   ├── context-hook.ts      # SessionStart：注入索引
│   │   ├── save-hook.ts         # PostToolUse：保存观察
│   │   └── cleanup-hook.ts      # SessionEnd：清理
│   ├── mcp/
│   │   └── server.ts            # MCP Server
│   ├── db/
│   │   ├── schema.ts            # 建表语句
│   │   └── store.ts             # CRUD 操作
│   └── utils/
│       ├── stdin.ts             # 读取 stdin
│       └── title-extractor.ts   # 从 Tool Usage 提取标题
├── plugin/
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── hooks/
│   │   └── hooks.json
│   └── .mcp.json
└── scripts/
    └── install.sh               # 安装脚本
```

## Hook Layer

### 读取 stdin（通用工具）

```typescript
// src/utils/stdin.ts
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export async function readJsonFromStdin<T = unknown>(): Promise<T> {
  const raw = await readStdin();
  return JSON.parse(raw) as T;
}
```

### PostToolUse Hook：保存观察

```typescript
// src/hooks/save-hook.ts
import { readJsonFromStdin } from '../utils/stdin.js';
import { ObservationStore } from '../db/store.js';
import { extractTitle } from '../utils/title-extractor.js';

interface PostToolUseInput {
  session_id: string;
  cwd: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: Record<string, unknown>;
}

async function main() {
  // 禁用 stderr 防止污染
  process.stderr.write = (() => true) as typeof process.stderr.write;

  try {
    const input = await readJsonFromStdin<PostToolUseInput>();
    const { session_id, cwd, tool_name, tool_input, tool_response } = input;

    // 从工具使用中提取标题（不调 AI，规则提取）
    const title = extractTitle(tool_name, tool_input);
    const narrative = `${tool_name}: ${JSON.stringify(tool_input).slice(0, 200)}`;

    // 获取项目名（最后一级目录名）
    const project = cwd.split('/').pop() || 'unknown';

    // 存入数据库
    const store = new ObservationStore();
    store.insertObservation({
      sessionId: session_id,
      project,
      type: categorize(tool_name),
      title,
      narrative,
      files: extractFiles(tool_input),
    });
    store.close();

    // 返回 success
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  } catch (error) {
    // 永不阻塞 Claude Code
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

function categorize(toolName: string): string {
  switch (toolName) {
    case 'Edit': case 'Write': return 'change';
    case 'Read': case 'Glob': case 'Grep': return 'how-it-works';
    case 'Bash': return 'discovery';
    default: return 'how-it-works';
  }
}

function extractFiles(toolInput: Record<string, unknown>): string[] {
  const filePath = toolInput.file_path || toolInput.path;
  return filePath ? [String(filePath)] : [];
}

main();
```

### SessionStart Hook：注入索引

```typescript
// src/hooks/context-hook.ts
import { readJsonFromStdin } from '../utils/stdin.js';
import { ObservationStore } from '../db/store.js';

interface SessionStartInput {
  session_id: string;
  cwd: string;
  source: string;
}

async function main() {
  process.stderr.write = (() => true) as typeof process.stderr.write;

  try {
    const input = await readJsonFromStdin<SessionStartInput>();
    const project = input.cwd.split('/').pop() || 'unknown';

    const store = new ObservationStore();
    const observations = store.getRecentByProject(project, 30);
    store.close();

    if (observations.length === 0) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    // 构建 Progressive Disclosure 索引
    const index = buildIndex(observations);

    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: index
      }
    }));
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

function buildIndex(observations: Array<{id: number; type: string; title: string; created_at: number}>): string {
  const typeIcons: Record<string, string> = {
    'change': '🟢', 'how-it-works': '🔵', 'discovery': '🟣',
    'decision': '🟤', 'bugfix': '🟡', 'gotcha': '🔴'
  };

  let md = '# [mini-mem] recent context\n\n';
  md += '| ID | Time | T | Title |\n';
  md += '|----|------|---|-------|\n';

  for (const obs of observations) {
    const time = new Date(obs.created_at * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const icon = typeIcons[obs.type] || '🔵';
    md += `| #${obs.id} | ${time} | ${icon} | ${obs.title} |\n`;
  }

  md += '\n*Use MCP search tools to access full details*';
  return md;
}

main();
```

## 存储层

### Schema 定义

```typescript
// src/db/schema.ts
export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    project TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'how-it-works',
    title TEXT NOT NULL,
    narrative TEXT,
    files TEXT DEFAULT '[]',
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
    title, narrative,
    content='observations',
    content_rowid='id',
    tokenize='unicode61'
  );

  CREATE TRIGGER IF NOT EXISTS obs_fts_insert AFTER INSERT ON observations BEGIN
    INSERT INTO observations_fts(rowid, title, narrative)
    VALUES (new.id, new.title, new.narrative);
  END;

  CREATE TRIGGER IF NOT EXISTS obs_fts_delete AFTER DELETE ON observations BEGIN
    INSERT INTO observations_fts(observations_fts, rowid, title, narrative)
    VALUES ('delete', old.id, old.title, old.narrative);
  END;
`;
```

### Store 实现

```typescript
// src/db/store.ts
import Database from 'better-sqlite3';
import path from 'path';
import { mkdirSync } from 'fs';
import { SCHEMA } from './schema.js';

const DATA_DIR = path.join(process.env.HOME || '~', '.mini-mem');
const DB_PATH = path.join(DATA_DIR, 'mini-mem.db');

export class ObservationStore {
  private db: Database.Database;

  constructor() {
    mkdirSync(DATA_DIR, { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA);
  }

  insertObservation(obs: {
    sessionId: string;
    project: string;
    type: string;
    title: string;
    narrative: string;
    files: string[];
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO observations (session_id, project, type, title, narrative, files)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(obs.sessionId, obs.project, obs.type, obs.title, obs.narrative, JSON.stringify(obs.files));
    return result.lastInsertRowid as number;
  }

  getRecentByProject(project: string, limit: number = 30): Array<{id: number; type: string; title: string; created_at: number}> {
    return this.db.prepare(`
      SELECT id, type, title, created_at FROM observations
      WHERE project = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(project, limit) as any[];
  }

  search(query: string, limit: number = 20): Array<{id: number; type: string; title: string; narrative: string; created_at: number}> {
    // 将用户查询中的双引号转义，然后按空格分词
    // 不用引号包裹整体，以支持分词匹配（"auth timeout" 可匹配含 auth 或 timeout 的记录）
    const escaped = query.replace(/"/g, '""');
    return this.db.prepare(`
      SELECT o.id, o.type, o.title, o.narrative, o.created_at
      FROM observations_fts
      JOIN observations o ON o.id = observations_fts.rowid
      WHERE observations_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(escaped, limit) as any[];
  }

  getByIds(ids: number[]): Array<{id: number; type: string; title: string; narrative: string; files: string; created_at: number}> {
    const placeholders = ids.map(() => '?').join(',');
    return this.db.prepare(`
      SELECT id, type, title, narrative, files, created_at FROM observations
      WHERE id IN (${placeholders})
      ORDER BY created_at DESC
    `).all(...ids) as any[];
  }

  close(): void {
    this.db.close();
  }
}
```

## MCP Search 实现

```typescript
// src/mcp/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ObservationStore } from '../db/store.js';

const server = new Server(
  { name: 'mini-mem-search', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'search',
      description: 'Search memory observations. Returns compact index with IDs.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number', description: 'Max results (default 20)' }
        },
        required: ['query']
      }
    },
    {
      name: 'get_observations',
      description: 'Fetch full observation details by IDs.',
      inputSchema: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'number' }, description: 'Observation IDs' }
        },
        required: ['ids']
      }
    }
  ]
}));

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;
  const store = new ObservationStore();

  try {
    if (name === 'search') {
      const results = store.search(args.query as string, (args.limit as number) || 20);
      const text = results.length === 0
        ? 'No observations found.'
        : formatSearchResults(results);
      return { content: [{ type: 'text', text }] };
    }

    if (name === 'get_observations') {
      const observations = store.getByIds(args.ids as number[]);
      const text = observations.map(formatObservation).join('\n\n---\n\n');
      return { content: [{ type: 'text', text }] };
    }

    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  } finally {
    store.close();
  }
});

function formatSearchResults(results: Array<{id: number; type: string; title: string; created_at: number}>): string {
  let md = '| ID | Type | Title |\n|---|---|---|\n';
  for (const r of results) {
    md += `| #${r.id} | ${r.type} | ${r.title} |\n`;
  }
  return md;
}

function formatObservation(obs: {id: number; type: string; title: string; narrative: string; files: string; created_at: number}): string {
  const files = JSON.parse(obs.files || '[]');
  return `#${obs.id} [${obs.type}] ${obs.title}\n${obs.narrative}\nFiles: ${files.join(', ') || 'none'}`;
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
```

## 标题提取（不调 AI 的简化版本）

```typescript
// src/utils/title-extractor.ts
export function extractTitle(toolName: string, toolInput: Record<string, unknown>): string {
  switch (toolName) {
    case 'Edit': {
      const file = shortPath(toolInput.file_path as string);
      return `编辑 ${file}`;
    }
    case 'Write': {
      const file = shortPath(toolInput.file_path as string);
      return `创建 ${file}`;
    }
    case 'Read': {
      const file = shortPath(toolInput.file_path as string);
      return `读取 ${file}`;
    }
    case 'Bash': {
      const cmd = String(toolInput.command || '').slice(0, 40);
      return `执行: ${cmd}`;
    }
    case 'Glob': {
      return `搜索文件: ${toolInput.pattern || '*'}`;
    }
    case 'Grep': {
      return `搜索内容: ${toolInput.pattern || toolInput.query || ''}`;
    }
    default:
      return `${toolName} 调用`;
  }
}

function shortPath(filePath: string | undefined): string {
  if (!filePath) return 'unknown';
  const parts = filePath.split('/');
  return parts.length > 2 ? `.../${parts.slice(-2).join('/')}` : filePath;
}
```

## 测试与调试

### 端到端验证

```bash
# 1. 构建项目
npm run build

# 2. 手动测试 save hook
echo '{"session_id":"test","cwd":"/tmp/myproject","tool_name":"Edit","tool_input":{"file_path":"src/index.ts"},"tool_response":{"success":true}}' | node dist/hooks/save-hook.js

# 3. 手动测试 context hook
echo '{"session_id":"test","cwd":"/tmp/myproject","source":"startup"}' | node dist/hooks/context-hook.js

# 4. 验证数据库
sqlite3 ~/.mini-mem/mini-mem.db "SELECT * FROM observations;"

# 5. 测试 FTS5 搜索
sqlite3 ~/.mini-mem/mini-mem.db "SELECT * FROM observations_fts WHERE observations_fts MATCH 'index';"
```

### 安装到 Claude Code

```bash
# 将 plugin 目录链接到 Claude Code 插件目录
ln -s $(pwd)/plugin ~/.claude/plugins/mini-mem

# 重启 Claude Code
# 在会话中测试：编辑文件后检查 ~/.mini-mem/mini-mem.db 是否有新记录
```

## 常见问题排查

在开发 mini-mem 的过程中，以下是你最可能遇到的问题：

### 问题 1：Hook 返回值被 Claude Code 忽略

**症状**：Hook 脚本执行了，但 Context 没有注入到会话中。

**原因**：stdout 中混入了非 JSON 内容。常见来源是第三方库的 warning、Node.js 的 deprecation notice、或 `console.log` 调试输出。

**解决**：
```typescript
// 必须在脚本最开头加这一行
process.stderr.write = (() => true) as typeof process.stderr.write;
// 确保只有最后一个 console.log(JSON.stringify(...)) 写到 stdout
```

### 问题 2：FTS5 搜索中文效果差

**症状**：搜索"连接池"找不到标题为"修复连接池泄漏"的记录。

**原因**：FTS5 默认的 `unicode61` tokenizer 按 Unicode 词边界分词，对中文支持有限——它可能把"修复连接池泄漏"当作一个整体 token。

**解决**（开发阶段的 workaround）：
```sql
-- 使用前缀匹配
WHERE observations_fts MATCH '连接*'
-- 或在存入时同时存入关键词（空格分隔）
-- 如：title = "修复 连接池 泄漏"（人工加空格辅助分词）
```

生产环境建议使用 jieba 分词 + 自定义 tokenizer，但这超出了 mini-mem 的 MVP 范围。

### 问题 3：MCP Server 连接失败

**症状**：Claude Code 中搜索工具不出现，或调用时报错。

**排查步骤**：
```bash
# 1. 检查 MCP Server 是否能独立启动
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/mcp/server.js

# 2. 检查 .mcp.json 路径是否正确
cat plugin/.mcp.json
# command 中的路径必须是绝对路径或使用 ${CLAUDE_PLUGIN_ROOT}

# 3. 检查 Worker 是否在运行（如果 MCP Server 需要查询 Worker API）
curl http://localhost:37700/health
```

### 问题 4：better-sqlite3 安装失败

**症状**：`npm install` 时 better-sqlite3 编译报错（常见于 M1 Mac 或 Linux 缺少 build tools）。

**解决**：
```bash
# macOS
xcode-select --install

# Ubuntu/Debian
sudo apt-get install build-essential python3

# 如果仍然失败，用 Bun 替代（内置 SQLite）
bun add bun-types  # 然后将 import Database from 'better-sqlite3' 改为 import { Database } from 'bun:sqlite'
```

### 验证完整闭环

走完以下步骤说明 mini-mem 工作正常：

```bash
# 1. 构建
npm run build

# 2. 注入测试数据（模拟 3 次工具调用）
for i in 1 2 3; do
echo "{\"session_id\":\"test\",\"cwd\":\"$(pwd)\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"src/file$i.ts\"},\"tool_response\":{\"success\":true}}" | node dist/hooks/save-hook.js
done

# 3. 验证数据库中有 3 条记录
sqlite3 ~/.mini-mem/mini-mem.db "SELECT id, title FROM observations;"

# 4. 测试 context hook（应该输出包含 3 条记录的索引表）
echo "{\"session_id\":\"new\",\"cwd\":\"$(pwd)\",\"source\":\"startup\"}" | node dist/hooks/context-hook.js

# 5. 安装到 Claude Code
ln -sf $(pwd)/plugin ~/.claude/plugins/mini-mem
# 重启 Claude Code，开始正常使用
# 编辑任何文件后，检查 ~/.mini-mem/mini-mem.db 中是否有新记录
```

如果第 4 步输出了一个 Markdown 表格（包含 ID、时间、类型和标题），恭喜——你已经有了一个可用的 Memory Plugin。下次启动 Claude Code 时，它会自动注入历史上下文。

mini-mem 的完整可运行代码在 `examples/ch13-mini-mem/` 目录中。

---

**思考题**

1. mini-mem 的标题提取是规则的（`extractTitle`），信息密度低。不接入 AI 的前提下，还有什么办法提高标题质量？提示：想想 tool_response 里有什么信息可以利用。
2. 当前的 FTS5 搜索对中文支持有限。如果你的项目主要用中文开发，有哪些改进方案？（不限于 SQLite 生态）
3. mini-mem 没有去重机制。如果用户连续保存同一个文件 10 次，会产生 10 条近似的 Observation。设计一个最简单的去重方案。

---

下一章将在 mini-mem 基础上扩展：接入 AI 压缩、向量搜索和 Viewer UI。

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

---

> 本章来自《Agent Memory 工程实战》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
