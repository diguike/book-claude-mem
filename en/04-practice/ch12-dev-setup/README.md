---
title: "Chapter 12: Setting Up a Development Environment"
---

## Claude Code Plugin Basics

**A note on runtimes:** claude-mem's source runs on Bun, taking advantage of its built-in SQLite driver and its ability to execute TypeScript directly. Chapter 13's mini-mem uses Node.js with better-sqlite3 instead, which most frontend and full-stack engineers know better and which needs no extra runtime. This chapter's companion code requires Node.js 20.12 or later and better-sqlite3 12.x. Its prebuilt binaries cover Node 20 through 26; 11.x has no prebuilt binaries for Node 24, and building it from source fails.

Building a Claude Code plugin means understanding three things: the plugin directory layout, hooks, and the MCP server.

### Plugin Directory Layout

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json          # plugin metadata
├── hooks/
│   └── hooks.json           # hook registration
├── .mcp.json                # MCP server registration (optional)
├── skills/
│   └── my-skill/
│       └── SKILL.md         # skill definition (optional)
└── scripts/                 # executables for hooks and the MCP server
```

claude-mem's plugin directory is `plugin/` in the repository. It has the same layout plus `modes/` (observation modes) and `ui/` (static assets for the Viewer). `.claude-plugin/marketplace.json` at the repository root publishes it as a plugin marketplace, which is what lets users install it with `/plugin marketplace add thedotmack/claude-mem`.

`plugin.json` defines the plugin's basic information:

```json
{
  "name": "mini-mem",
  "version": "1.1.0",
  "description": "Minimal Agent Memory Plugin — stores observations and injects context",
  "author": { "name": "Your Name" }
}
```

### Loading and Validating Locally

You don't need to publish to a marketplace during development. Claude Code provides two commands:

```bash
# Validate a plugin directory: manifest, hooks.json, skills, and so on
claude plugin validate ./plugin

# Load a local plugin directory for this session only
claude --plugin-dir ./plugin
```

`claude plugin validate` points out common problems, such as missing author information or an unquoted `${CLAUDE_PLUGIN_ROOT}` in a command (which splits the command when the path contains spaces). Both commands were verified for this book on Claude Code 2.1.296. Symlinking the plugin directory into `~/.claude/plugins/`, an approach older guides describe, is no longer recommended.

### Registering Hooks

`hooks/hooks.json` is the core configuration for how a plugin interacts with Claude Code. mini-mem's version:

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

A few points, all drawn from Chapter 5's analysis of claude-mem:

- `${CLAUDE_PLUGIN_ROOT}` is injected by Claude Code and points to the plugin directory. Wrap it in double quotes
- Hooks that only write data and whose return value the host doesn't need (PostToolUse, PostToolUseFailure, Stop, SessionEnd) should be marked `"async": true` so the host doesn't wait
- Hooks that inject content into the model or need to deny an operation (SessionStart, UserPromptSubmit, PreToolUse) must be synchronous
- Don't include `resume` in SessionStart's matcher. A resumed session already has its full context, and injecting again invalidates the prompt cache
- The host gives SessionEnd very little time (claude-mem's source comments record 1.5 seconds). It's only suitable for something like writing one file

### Exit Codes

How Claude Code interprets hook exit codes:

| Exit code | Meaning |
|-------|------|
| 0 | Success; read the JSON on stdout |
| 2 | Block: UserPromptSubmit drops the prompt, PreToolUse denies the tool call, Stop makes the agent keep working |
| Anything else | Non-blocking error; stderr is shown to the user |

A background feature like memory should never return 2. claude-mem v13 returns 0 on every path, and when it needs to deny a tool call, it says so explicitly with `permissionDecision: 'deny'` in the stdout JSON instead of relying on the exit code (Chapters 4 and 5).

## Debugging Hooks

### Feeding stdin by Hand

A hook reads JSON from stdin and writes JSON to stdout, so you can simulate it directly on the command line:

```bash
# Simulate a PostToolUse
echo '{
  "session_id": "test-session-123",
  "cwd": "/home/user/my-project",
  "hook_event_name": "PostToolUse",
  "tool_name": "Edit",
  "tool_use_id": "toolu_01",
  "tool_input": {"file_path": "src/index.ts", "old_string": "foo", "new_string": "bar"},
  "tool_response": {"success": true}
}' | node dist/hooks/save-hook.js

# Simulate a failed tool call (PostToolUseFailure has no tool_response; it has error)
echo '{"session_id":"t","cwd":"/tmp/demo","hook_event_name":"PostToolUseFailure",
  "tool_name":"Bash","tool_input":{"command":"npm test"},"error":"Exit code 1","is_interrupt":false}' \
  | node dist/hooks/save-hook.js
```

### Debug Mode

```bash
claude --debug
```

The output shows which hooks matched, the command that ran, how long it took, and what it returned.

### Common Problems

**The hook doesn't run.** Matchers are case-sensitive, and the host silently ignores a misspelled event name (writing `PostToolFailure` instead of `PostToolUseFailure` raises no error). Run `claude plugin validate` first.

**The output is ignored.** stdout must contain exactly one valid JSON document. A `console.log` left over from debugging, or a notice some library prints to stdout, makes the whole output invalid. stderr doesn't affect how stdout is parsed, so there's no need to swallow stderr entirely (as claude-mem v12 did). A better approach is to write diagnostics to a log file. claude-mem v13 buffers stderr while the handler runs and discards it on exit (Chapter 5).

**The model never receives the injected content.** When SessionStart output exceeds 10,000 characters, Claude Code replaces the whole thing with a preview. The model effectively receives nothing, yet the hook shows success. Measure the length before injecting (Chapter 8).

**Timeouts.** `timeout` is in seconds. A synchronous hook's run time is time the user spends waiting. As Chapter 5 measured, a hook process can spend several hundred milliseconds just loading a 3 MB bundle.

## Developing an MCP Server Locally

An MCP server is a separate process that talks to the host over stdio.

### Skeleton

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
    annotations: { readOnlyHint: true },   // can run without confirmation in plan mode
  }],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return { content: [{ type: 'text', text: `result for ${name}` }] };
});

await server.connect(new StdioServerTransport());
```

The first argument to `setRequestHandler` must be a schema object exported by the SDK (`ListToolsRequestSchema`, `CallToolRequestSchema`); the SDK reads the method name out of it. Passing a string, as in `server.setRequestHandler('tools/list', ...)`, throws `Schema is missing a method literal` on the current SDK.

Register it in the plugin directory's `.mcp.json`:

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

### Debugging Locally

The MCP server owns stdout, so you can't log with `console.log`. Two ways to debug:

- Write a test client that starts the server with the SDK's `Client` and `StdioClientTransport`, then walks through `initialize`, `tools/list`, and `tools/call` (mini-mem's `npm run test:search` does exactly this)
- Use the MCP Inspector, `npx @modelcontextprotocol/inspector node dist/mcp/server.js`, and call tools by hand in the browser

## SQLite Tooling

### Choosing a Driver

| Runtime | Driver | Notes |
|-------|------|------|
| Node.js | better-sqlite3 12.x | Synchronous API, fast, requires a native module |
| Node.js 22.13+ | `node:sqlite` | Built in, nothing to install (earlier 22.x versions need the `--experimental-sqlite` flag); the API is still marked experimental |
| Bun | `bun:sqlite` | Built in; this is what claude-mem uses |

### Basic Usage

```typescript
import Database from 'better-sqlite3';

const db = new Database('./data/mini-mem.db');
db.pragma('journal_mode = WAL');   // readers and writers don't block each other
db.pragma('busy_timeout = 5000');  // when the hook process and MCP process collide on a lock, wait up to 5 s

db.exec(`
  CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    narrative TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  )
`);

db.prepare('INSERT INTO observations (title, narrative) VALUES (?, ?)').run('Fix timeout issue', 'Raised the timeout from 60s to 120s');
const rows = db.prepare('SELECT * FROM observations WHERE title LIKE ?').all('%timeout%');
```

`busy_timeout` is easy to overlook. A memory plugin has at least three kinds of process opening the database at the same time: hooks, the MCP server, and a background worker. Without it, a write-lock conflict throws `SQLITE_BUSY` immediately. claude-mem added this setting in v13.10.2.

### FTS5 and CJK Text

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
  title, narrative,
  content='observations',
  content_rowid='id'
);
```

Without a `tokenize` option, FTS5 uses `unicode61`, which splits on whitespace and punctuation, so a run of Chinese characters is treated as a single token. The companion script `npm run check:sqlite` tested three approaches on SQLite 3.53.2 (the test strings are Chinese because that's the case being tested; English glosses are in parentheses):

| Query | unicode61 | trigram | LIKE substring |
|------|-----------|---------|----------|
| 项目 ("project," inside 修改了项目配置, "changed the project config") | 0 | 0 | 1 |
| 连接池 ("connection pool," inside 修复连接池泄漏导致的 5xx, "fix 5xx caused by connection pool leak") | 0 | 1 | 1 |
| payload (inside payload优先使用LLM, "payload prefers the LLM") | 0 | 1 | 1 |
| JWT (inside JWT 验证改为异步, "JWT verification made async") | 1 | 1 | 1 |

The `trigram` tokenizer indexes a sliding window of three characters. Substrings of three or more characters can be found, but two-character queries (very common in Chinese) still can't, and the index is several times larger. claude-mem v13 keeps `unicode61` and switches to LIKE substring matching when a query contains CJK characters (Chapter 7). mini-mem does the same.

### Recommended Tools

- **The sqlite3 CLI** for quick queries: `sqlite3 ~/.mini-mem/mini-mem.db "SELECT id, title FROM observations"`
- **DB Browser for SQLite** and **Beekeeper Studio** for a GUI

## Companion Code

`examples/ch12-dev-setup/` has three scripts:

```bash
npm install
npm run check          # checks Node, Bun, better-sqlite3, FTS5, WAL, Claude Code, and more
npm run check:sqlite   # FTS5, WAL, and the CJK search comparison in the table above
npm run check:plugin   # validates a plugin directory (Chapter 13's mini-mem by default)
```

---

**Questions to consider**

1. How would you write automated tests for your plugin? Design an approach that covers the hook firing, data landing in the database, and the MCP query. Think about how to simulate the host's calls and how to keep tests away from the real data directory.
2. What do you do if the SQLite file in your development environment gets deleted by accident? Design a simple backup strategy. (Hint: consider SQLite's `.backup` command, and the risk of copying the file directly in WAL mode.)
3. The FTS5 index and the main table are kept in sync by triggers. If a trigger problem leaves them inconsistent, how do you detect and repair it? (Hint: FTS5's `'integrity-check'` and `'rebuild'` commands.)

---

The next chapter builds mini-mem for real: a small memory plugin that actually runs in Claude Code.

---

> From the open-source edition of *Engineering Agent Memory* by diguike.  
> Read online: [inferloop.dev](https://inferloop.dev) · Source: [github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
