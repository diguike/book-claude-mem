// Claude Code 插件目录检查：plugin.json、hooks/hooks.json、.mcp.json
// 运行：npm run check:plugin [插件目录]，默认检查 ../ch13-mini-mem/plugin

import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const KNOWN_EVENTS = new Set([
  'Setup', 'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'PostToolUseFailure', 'Stop', 'SubagentStop', 'SessionEnd', 'PreCompact', 'Notification',
]);
// 宿主需要等待返回值的事件：这些 Hook 不适合标 async
const NEEDS_SYNC = new Set(['SessionStart', 'UserPromptSubmit', 'PreToolUse']);

const root = resolve(process.argv[2] ?? join(import.meta.dirname, '../../ch13-mini-mem/plugin'));
let problems = 0;
const ok = (msg: string) => console.log(`  [OK]   ${msg}`);
const warn = (msg: string) => console.log(`  [WARN] ${msg}`);
const fail = (msg: string) => { problems++; console.log(`  [FAIL] ${msg}`); };

function readJson(path: string): any | null {
  if (!existsSync(path)) { fail(`缺少 ${path}`); return null; }
  try { return JSON.parse(readFileSync(path, 'utf-8')); }
  catch (e) { fail(`${path} 不是合法 JSON：${(e as Error).message}`); return null; }
}

console.log(`=== 检查插件目录 ${root} ===\n`);

const manifest = readJson(join(root, '.claude-plugin/plugin.json'));
if (manifest) {
  manifest.name ? ok(`plugin.json name = ${manifest.name}`) : fail('plugin.json 缺少 name');
  manifest.version ? ok(`plugin.json version = ${manifest.version}`) : warn('plugin.json 没有 version');
}

const hooksFile = readJson(join(root, 'hooks/hooks.json'));
if (hooksFile) {
  const hooks = hooksFile.hooks ?? {};
  for (const [event, entries] of Object.entries<any[]>(hooks)) {
    if (!KNOWN_EVENTS.has(event)) warn(`未知事件名 ${event}（拼写错误时宿主会静默忽略）`);
    for (const entry of entries) {
      for (const h of entry.hooks ?? []) {
        const where = `${event}${entry.matcher ? `[${entry.matcher}]` : ''}`;
        if (h.type !== 'command') fail(`${where} 的 type 应为 command`);
        if (typeof h.command !== 'string' || !h.command.trim()) fail(`${where} 缺少 command`);
        else if (!h.command.includes('${CLAUDE_PLUGIN_ROOT}')) warn(`${where} 的命令没有用 \${CLAUDE_PLUGIN_ROOT}，换个目录安装可能找不到脚本`);
        if (h.timeout === undefined) warn(`${where} 没有 timeout，将使用宿主默认值`);
        if (h.async === true && NEEDS_SYNC.has(event)) warn(`${where} 标了 async，宿主不会读取它的输出`);
        if (h.async !== true && (event === 'PostToolUse' || event === 'Stop')) {
          warn(`${where} 是同步执行的；只写数据、不需要返回值时可以考虑 "async": true`);
        }
        ok(`${where} → ${String(h.command).slice(0, 60)}${String(h.command).length > 60 ? '…' : ''}`);
      }
    }
  }
}

const mcpPath = join(root, '.mcp.json');
if (existsSync(mcpPath)) {
  const mcp = readJson(mcpPath);
  for (const [name, server] of Object.entries<any>(mcp?.mcpServers ?? {})) {
    server.command ? ok(`MCP server ${name}: ${server.command} ${(server.args ?? []).join(' ')}`) : fail(`MCP server ${name} 缺少 command`);
  }
} else {
  warn('没有 .mcp.json（插件不提供 MCP 工具时可以忽略）');
}

console.log(problems === 0 ? '\n检查通过。' : `\n发现 ${problems} 个问题。`);
process.exit(problems === 0 ? 0 : 1);
