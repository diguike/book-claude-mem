---
title: "第 12 章：开发环境搭建"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/PPq1wgX9si8JqykA1UJcvVngn3e"
last_synced: "2026-10-13T11:42:45+08:00"
---

## Claude Code Plugin 开发基础

**运行时说明**：claude-mem 源码运行在 Bun 上（利用它内置的 SQLite 驱动和直接执行 TypeScript 的能力），第 13 章的 mini-mem 则用 Node.js 加 better-sqlite3，对大多数前端和全栈工程师更熟悉，也不需要额外安装运行时。本章的配套代码要求 Node.js 20.12 以上，better-sqlite3 用 12.x（它的预编译包覆盖 Node 20 到 26；11.x 在 Node 24 上没有预编译包，源码编译会失败）。

开发一个 Claude Code Plugin 需要理解三件事：插件目录结构、Hook 和 MCP Server。

### 插件目录结构

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json          # 插件元数据
├── hooks/
│   └── hooks.json           # Hook 注册
├── .mcp.json                # MCP Server 注册（可选）
├── skills/
│   └── my-skill/
│       └── SKILL.md         # Skill 定义（可选）
└── scripts/                 # Hook 和 MCP Server 的可执行文件
```

claude-mem 的插件目录是仓库里的 `plugin/`，结构相同，另有 `modes/`（观察模式）和 `ui/`（Viewer 的静态资源）。仓库根目录的 `.claude-plugin/marketplace.json` 把它发布成一个插件市场，用户才能通过 `/plugin marketplace add thedotmack/claude-mem` 安装。

`plugin.json` 定义插件的基本信息：

```json
{
  "name": "mini-mem",
  "version": "1.1.0",
  "description": "Minimal Agent Memory Plugin — stores observations and injects context",
  "author": { "name": "Your Name" }
}
```

### 本地加载与校验

开发时不需要发布到市场。Claude Code 提供两个命令：

```bash
# 校验插件目录：manifest、hooks.json、skills 等
claude plugin validate ./plugin

# 只在这次会话里加载本地插件目录
claude --plugin-dir ./plugin
```

`claude plugin validate` 会指出常见问题，比如缺少作者信息、命令里的 `${CLAUDE_PLUGIN_ROOT}` 没加引号（路径含空格时命令会被拆开）。本书在 Claude Code 2.1.296 上验证过这两个命令。旧版书介绍的“把插件目录软链到 `~/.claude/plugins/`”的做法不再推荐。

### Hook 注册

`hooks/hooks.json` 是插件与 Claude Code 交互的核心配置。mini-mem 的版本：

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup|clear|compact",
      "hooks": [{
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/../dist/hooks/context-hook.js\"",
        "timeout": 30
      }]
    }],
    "PostToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/../dist/hooks/save-hook.js\"",
        "timeout": 30,
        "async": true
      }]
    }]
  }
}
```

几个要点，都来自第 5 章对 claude-mem 的分析：

- `${CLAUDE_PLUGIN_ROOT}` 由 Claude Code 注入，指向插件目录。用双引号包住
- 只写数据、不需要宿主读取返回值的 Hook（PostToolUse、PostToolUseFailure、Stop、SessionEnd）标 `"async": true`，宿主不等它
- 需要把内容注入模型、或者需要拒绝某个操作的 Hook（SessionStart、UserPromptSubmit、PreToolUse）必须同步
- SessionStart 的 matcher 不要包含 `resume`：恢复的会话已经有完整上下文，再注入会让 prompt cache 失效
- 宿主给 SessionEnd 的时间很短（claude-mem 源码注释里记的是 1.5 秒），只适合做“写一个文件”这种事

### 退出码

Claude Code 对 Hook 退出码的解释：

| 退出码 | 含义 |
|-------|------|
| 0 | 成功，读取 stdout 上的 JSON |
| 2 | 阻断：UserPromptSubmit 会丢掉 prompt，PreToolUse 会拒绝工具调用，Stop 会让 Agent 继续工作 |
| 其他 | 非阻断错误，stderr 展示给用户 |

记忆这类后台功能永远不应该返回 2。claude-mem v13 的做法是所有路径都返回 0，需要拒绝某个工具调用时，用 stdout JSON 里的 `permissionDecision: 'deny'` 明确表达，而不是靠退出码（第 4、5 章）。

## Hook 调试

### 手动喂 stdin

Hook 从 stdin 读 JSON，向 stdout 写 JSON，可以直接在命令行模拟：

```bash
# 模拟一次 PostToolUse
echo '{
  "session_id": "test-session-123",
  "cwd": "/home/user/my-project",
  "hook_event_name": "PostToolUse",
  "tool_name": "Edit",
  "tool_use_id": "toolu_01",
  "tool_input": {"file_path": "src/index.ts", "old_string": "foo", "new_string": "bar"},
  "tool_response": {"success": true}
}' | node dist/hooks/save-hook.js

# 模拟一次失败的工具调用（PostToolUseFailure 没有 tool_response，有 error）
echo '{"session_id":"t","cwd":"/tmp/demo","hook_event_name":"PostToolUseFailure",
  "tool_name":"Bash","tool_input":{"command":"npm test"},"error":"Exit code 1","is_interrupt":false}' \
  | node dist/hooks/save-hook.js
```

### 调试模式

```bash
claude --debug
```

输出会显示哪些 Hook 被匹配、执行的命令、耗时和返回值。

### 常见问题

**Hook 不执行**：matcher 区分大小写；事件名拼错时宿主会静默忽略（`PostToolUseFailure` 写成 `PostToolFailure` 不会报错）。先跑一遍 `claude plugin validate`。

**输出被忽略**：stdout 必须只有一段合法 JSON。调试时顺手写的 `console.log`、某个库打到 stdout 的提示，都会让整段输出无效。stderr 不影响 stdout 的解析，所以不需要把 stderr 整个吞掉（旧版书和 claude-mem v12 都这么做过）；更好的做法是把诊断信息写进日志文件，claude-mem v13 用的是“执行期间缓冲 stderr、退出时丢弃”的方式（第 5 章）。

**注入的内容模型没收到**：SessionStart 的输出超过 10,000 字符时，Claude Code 会把整段换成一个预览，模型实际收不到任何内容，Hook 却显示成功。注入前先量长度（第 8 章）。

**超时**：`timeout` 单位是秒。同步 Hook 的时间就是用户等待的时间；第 5 章实测过，一个 Hook 进程光加载 3 MB 的打包文件就要几百毫秒。

## MCP Server 本地开发

MCP Server 是一个独立进程，通过 stdio 与宿主通信。

### 骨架

```bash
npm install @modelcontextprotocol/sdk
```

```typescript
// src/mcp/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server({ name: 'mini-mem', version: '1.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'search',
    description: 'Search memory. Returns a compact index with IDs.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
    annotations: { readOnlyHint: true },   // plan mode 下可以免确认运行
  }],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return { content: [{ type: 'text', text: `result for ${name}` }] };
});

await server.connect(new StdioServerTransport());
```

`setRequestHandler` 的第一个参数必须是 SDK 导出的 Schema 对象（`ListToolsRequestSchema`、`CallToolRequestSchema`），SDK 从里面读出方法名。旧版书写的 `server.setRequestHandler('tools/list', ...)` 在当前 SDK 上会抛出 `Schema is missing a method literal`。

在插件目录的 `.mcp.json` 里注册：

```json
{
  "mcpServers": {
    "mini-mem": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/../dist/mcp/server.js"]
    }
  }
}
```

### 本地调试

MCP Server 占用了 stdout，不能用 `console.log` 打日志。两种调试办法：

- 写一个测试客户端，用 SDK 的 `Client` 加 `StdioClientTransport` 启动服务端，走一遍 `initialize`、`tools/list`、`tools/call`（mini-mem 的 `npm run test:search` 就是这么做的）
- 用 MCP Inspector：`npx @modelcontextprotocol/inspector node dist/mcp/server.js`，在浏览器里手动调用工具

## SQLite 开发工具链

### 驱动的选择

| 运行时 | 驱动 | 说明 |
|-------|------|------|
| Node.js | better-sqlite3 12.x | 同步 API，性能好，需要原生模块 |
| Node.js 22.13+ | `node:sqlite` | 内置，无需安装（更早的 22.x 需要 `--experimental-sqlite` 参数），API 仍标记为实验性 |
| Bun | `bun:sqlite` | 内置，claude-mem 用的就是它 |

### 基础用法

```typescript
import Database from 'better-sqlite3';

const db = new Database('./data/mini-mem.db');
db.pragma('journal_mode = WAL');   // 读写互不阻塞
db.pragma('busy_timeout = 5000');  // Hook 进程和 MCP 进程同时访问时，遇到锁等 5 秒

db.exec(`
  CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    narrative TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  )
`);

db.prepare('INSERT INTO observations (title, narrative) VALUES (?, ?)').run('修复超时问题', '把超时从 60s 改为 120s');
const rows = db.prepare('SELECT * FROM observations WHERE title LIKE ?').all('%超时%');
```

`busy_timeout` 在旧版书里没有提。一个记忆插件至少有三类进程会同时打开数据库：Hook、MCP Server、后台 Worker。不设它，写锁冲突时会立刻抛 `SQLITE_BUSY`；claude-mem 在 v13.10.2 补上了这一项。

### FTS5 与中文

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
  title, narrative,
  content='observations',
  content_rowid='id'
);
```

不指定 `tokenize` 时用 `unicode61`，它按空白和标点切词，连续的汉字会被当成一个 token。配套脚本 `npm run check:sqlite` 在本机 SQLite 3.53.2 上实测了三种方式：

| 查询 | unicode61 | trigram | LIKE 子串 |
|------|-----------|---------|----------|
| 项目（在“修改了项目配置”里） | 0 | 0 | 1 |
| 连接池（在“修复连接池泄漏导致的 5xx”里） | 0 | 1 | 1 |
| payload（在“payload优先使用LLM”里） | 0 | 1 | 1 |
| JWT（在“JWT 验证改为异步”里） | 1 | 1 | 1 |

`trigram` 分词器按 3 个字符的滑动窗口建索引，3 个字以上的子串能搜到，2 个字的查询（中文里很常见）仍然搜不到，索引也会大好几倍。claude-mem v13 的选择是保留 `unicode61`，查询里含中日韩文字时直接改用 LIKE 子串匹配（第 7 章）。mini-mem 用了同样的办法。

### 推荐工具

- **sqlite3 命令行**：快速查询，`sqlite3 ~/.mini-mem/mini-mem.db "SELECT id, title FROM observations"`
- **DB Browser for SQLite**、**Beekeeper Studio**：图形界面

## 配套代码

`examples/ch12-dev-setup/` 有三个脚本：

```bash
npm install
npm run check          # Node、Bun、better-sqlite3、FTS5、WAL、Claude Code 等环境检查
npm run check:sqlite   # FTS5、WAL 和上表的中文检索对比
npm run check:plugin   # 校验一个插件目录（默认检查第 13 章的 mini-mem）
```

---

**思考题**

1. 如何为你的插件写自动化测试？设计一个方案，覆盖 Hook 触发、数据落库、MCP 查询三个环节，考虑如何模拟宿主的调用，以及如何让测试不碰真实的数据目录。
2. 开发环境里的 SQLite 文件被误删了怎么办？设计一个简单的备份策略（提示：考虑 SQLite 的 `.backup` 命令，以及 WAL 模式下直接复制文件的风险）。
3. FTS5 索引和主表靠触发器同步。触发器出问题导致两者不一致时，如何检测和修复？（提示：FTS5 的 `'integrity-check'` 和 `'rebuild'` 命令）

---

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

下一章正式实现 mini-mem：一个能在 Claude Code 里实际运行的简版 Memory Plugin。

---

> 本章来自《Agent Memory 工程实战》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
