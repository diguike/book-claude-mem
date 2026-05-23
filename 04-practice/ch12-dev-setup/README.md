---
title: "第 12 章：开发环境搭建"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/PPq1wgX9si8JqykA1UJcvVngn3e"
last_synced: "2026-05-05T16:52:35Z"
---

## Claude Code Plugin 开发基础

**运行时说明**：claude-mem 源码使用 Bun 作为运行时（利用其内置的 SQLite 驱动和 TypeScript 支持），而本章的 mini-mem 实战项目使用 Node.js + better-sqlite3，对前端工程师更友好且无需安装额外运行时。两种选择都是可行的。

开发一个 Claude Code Plugin 需要理解三个核心概念：Hooks、MCP Server 和 Plugin 目录结构。

### Plugin 目录结构

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json          # 插件元数据
├── hooks/
│   └── hooks.json           # Hook 注册配置
├── scripts/
│   ├── my-hook.js           # Hook 脚本
│   └── mcp-server.js        # MCP Server
├── skills/
│   └── my-skill/
│       └── SKILL.md         # Skill 定义
└── package.json
```

`plugin.json` 定义了插件的基本信息：

```json
{
  "name": "mini-mem",
  "version": "1.0.0",
  "description": "简版 Memory Plugin",
  "author": "Your Name"
}
```

### Hook 注册

`hooks.json` 是插件与 Claude Code 交互的核心配置：

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup",
      "hooks": [{
        "type": "command",
        "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/context-hook.js",
        "timeout": 30
      }]
    }],
    "PostToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/save-hook.js",
        "timeout": 30
      }]
    }]
  }
}
```

`${CLAUDE_PLUGIN_ROOT}` 是 Claude Code 自动注入的环境变量，指向插件安装目录。

## Hook 配置与调试技巧

### 手动测试 Hook

Hook 脚本从 stdin 读取 JSON，向 stdout 写入 JSON。可以手动模拟：

```bash
# 模拟 PostToolUse Hook 调用
echo '{
  "session_id": "test-session-123",
  "cwd": "/home/user/my-project",
  "tool_name": "Edit",
  "tool_input": {"file_path": "src/index.ts", "old_string": "foo", "new_string": "bar"},
  "tool_response": {"success": true}
}' | node scripts/save-hook.js
```

### 调试模式

启动 Claude Code 时加 `--debug` 参数，可以看到 Hook 执行的详细日志：

```bash
claude --debug
```

输出包含：
- 哪些 Hook 被匹配
- 执行命令和参数
- 耗时统计
- 返回值

### 常见问题

**Hook 不执行**：检查 matcher 是否匹配（区分大小写），确认脚本有执行权限。

**输出污染**：Hook 脚本中 `console.error` 或第三方库的 warning 会污染 stdout。用 `process.stderr.write = () => true` 禁用 stderr 输出。

**超时**：由 hooks.json 中的 `timeout` 字段指定（单位秒）。claude-mem 中不同 Hook 设置了 60-300 秒不等的超时。mini-mem 使用 30 秒即可满足需求。

## MCP Server 本地开发流程

MCP Server 是一个独立的 Node.js 进程，通过 stdio 与 Claude Code 通信。

### 开发步骤

1. 安装 MCP SDK：

```bash
npm install @modelcontextprotocol/sdk
```

2. 创建 MCP Server 骨架：

```typescript
// scripts/mcp-server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'mini-mem-search',
  version: '1.0.0'
}, {
  capabilities: { tools: {} }
});

// 注册工具列表
server.setRequestHandler('tools/list', async () => ({
  tools: [{
    name: 'search',
    description: 'Search memory',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } }
  }]
}));

// 处理工具调用
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;
  // 处理逻辑...
  return { content: [{ type: 'text', text: 'result' }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

3. 在 `.mcp.json` 中注册：

```json
{
  "mcpServers": {
    "mini-mem": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.js"]
    }
  }
}
```

### 本地调试

MCP Server 通过 stdio 通信，不方便直接调试。推荐方式：
- 将日志写入文件（不要写到 stdout/stderr）
- 使用 MCP Inspector 工具测试

## SQLite 开发工具链

本书的 mini-mem 使用 `better-sqlite3`（Node.js 原生）或 `bun:sqlite`（Bun 环境）。

### 安装

```bash
# Node.js 环境
npm install better-sqlite3
npm install -D @types/better-sqlite3

# Bun 环境无需安装，bun:sqlite 是内置模块
```

### 基础用法

```typescript
// Node.js + better-sqlite3
import Database from 'better-sqlite3';

const db = new Database('./data/mini-mem.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 建表
db.exec(`
  CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    narrative TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  )
`);

// 插入
const insert = db.prepare('INSERT INTO observations (title, narrative) VALUES (?, ?)');
insert.run('修复了超时问题', '将超时时间从 60s 改为 120s');

// 查询
const rows = db.prepare('SELECT * FROM observations WHERE title LIKE ?').all('%超时%');
```

### FTS5 建表

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
  title,
  narrative,
  content='observations',
  content_rowid='id',
  tokenize='unicode61'
);

-- 同步触发器
CREATE TRIGGER IF NOT EXISTS obs_fts_insert AFTER INSERT ON observations BEGIN
  INSERT INTO observations_fts(rowid, title, narrative)
  VALUES (new.id, new.title, new.narrative);
END;
```

### 推荐工具

- **DB Browser for SQLite**：GUI 查看和编辑数据库
- **sqlite3 CLI**：命令行快速查询
- **Beekeeper Studio**：跨平台数据库客户端

---

**思考题**

1. 如何为你的 Plugin 写自动化测试？设计一个测试方案，覆盖 Hook 触发、Worker 处理、MCP 查询三个环节，考虑如何 mock Claude Code 的调用。
2. 开发环境中 SQLite 数据库文件存储在本地，如果误删了怎么办？设计一个简单的备份策略（提示：考虑 SQLite 的 `.backup` 命令和定时任务）。
3. 当前 FTS5 索引和主表数据是通过触发器同步的。如果触发器出现问题导致索引和数据不一致，如何检测和修复？

---

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

下一章开始正式实现 mini-mem——一个可在 Claude Code 中实际运行的简版 Memory Plugin。

---

> 本章来自《Agent Memory 工程实战》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
