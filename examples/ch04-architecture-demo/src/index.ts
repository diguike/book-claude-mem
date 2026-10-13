// claude-mem v13 四层架构的最小演示（单进程模拟，便于观察每一步）
//
// Layer 1 宿主：产生 PostToolUse / SessionStart 事件
// Layer 2 命令层：Hook 进程，只做“写文件”或“读文件”
// 交接层：hook-spool/（写路径）+ context-cache/（读路径）
// Layer 3 Worker：取件 → 存储 → 防抖后重渲染开场上下文
// Layer 4 存储：内存 Map 模拟 SQLite

import * as http from 'node:http';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

const DATA = mkdtempSync(join(tmpdir(), 'ch04-arch-'));
const SPOOL = join(DATA, 'state', 'hook-spool');
const CACHE = join(DATA, 'state', 'context-cache');
mkdirSync(SPOOL, { recursive: true });
mkdirSync(CACHE, { recursive: true });

function atomicWrite(path: string, body: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body);
  renameSync(tmp, path);
}

// ===== Layer 4：存储 =====
interface Observation { id: number; title: string; at: string }
const storage: Observation[] = [];

// ===== Layer 3：Worker =====
let renderTimer: NodeJS.Timeout | null = null;
const RENDER_DEBOUNCE_MS = 200; // claude-mem 是 2,000 ms；演示里缩短

function renderContextCache(): void {
  const lines = ['# [demo] recent context', ...storage.map(o => `${o.id} ${o.at} ✓ ${o.title}`)];
  atomicWrite(join(CACHE, 'demo.json'), JSON.stringify({ renderedAt: Date.now(), body: lines.join('\n') }));
  console.log(`  [Worker] 重渲染 context-cache（${storage.length} 条）`);
}

function drainSpool(): void {
  const files = readdirSync(SPOOL).filter(f => f.endsWith('.json')).sort();
  for (const f of files) {
    const event = JSON.parse(readFileSync(join(SPOOL, f), 'utf-8'));
    storage.push({ id: storage.length + 1, title: `${event.toolName} ${event.file}`, at: new Date().toISOString().slice(11, 16) });
    unlinkSync(join(SPOOL, f));
    console.log(`  [Worker] 取件 ${f} → 存储 #${storage.length}`);
  }
  if (files.length > 0) {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(renderContextCache, RENDER_DEBOUNCE_MS); // 一串写入只渲染一次
  }
}

function startWorker(): Promise<http.Server> {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/api/spool/nudge') {
        drainSpool();
        res.writeHead(202).end();
      } else {
        res.writeHead(404).end();
      }
    });
    server.listen(0, '127.0.0.1', () => {
      drainSpool(); // 启动时先把积压的文件取完
      resolve(server);
    });
  });
}

// ===== Layer 2：Hook 进程 =====
async function postToolUseHook(workerPort: number | null, toolName: string, file: string, toolUseId: string): Promise<void> {
  atomicWrite(join(SPOOL, `observation-${toolUseId}.json`), JSON.stringify({ toolName, file }));
  console.log(`  [Hook] 写 spool：observation-${toolUseId}.json，退出码 0`);
  if (workerPort === null) return;
  // 唤醒 Worker：失败无所谓，文件已经落盘
  await fetch(`http://127.0.0.1:${workerPort}/api/spool/nudge`, { method: 'POST', signal: AbortSignal.timeout(250) }).catch(() => undefined);
}

function sessionStartHook(): string {
  try {
    const cached = JSON.parse(readFileSync(join(CACHE, 'demo.json'), 'utf-8'));
    return cached.body;
  } catch {
    return '（缓存未命中：真实实现会改为请求 Worker 的 /api/context/inject）';
  }
}

// ===== Layer 1：宿主 =====
async function main(): Promise<void> {
  console.log('=== claude-mem v13 四层架构 Mini Demo ===\n');

  console.log('[1] Worker 还没启动，宿主照常调用工具');
  await postToolUseHook(null, 'Read', 'package.json', 'toolu_01');
  await postToolUseHook(null, 'Edit', 'src/app.ts', 'toolu_02');
  console.log(`  spool 中积压 ${readdirSync(SPOOL).length} 个文件，宿主没有等待任何东西\n`);

  console.log('[2] Worker 启动，先补取积压');
  const server = await startWorker();
  const port = (server.address() as AddressInfo).port;
  await new Promise(r => setTimeout(r, RENDER_DEBOUNCE_MS + 50));

  console.log('\n[3] Worker 在线时，Hook 写完文件顺手唤醒它');
  await postToolUseHook(port, 'Bash', 'npm test', 'toolu_03');
  await new Promise(r => setTimeout(r, RENDER_DEBOUNCE_MS + 50));

  console.log('\n[4] Worker 停掉之后开新会话：SessionStart 直接读缓存');
  await new Promise<void>(r => server.close(() => r()));
  console.log(sessionStartHook().split('\n').map(l => `  ${l}`).join('\n'));

  rmSync(DATA, { recursive: true, force: true });
  console.log('\nDemo 结束。');
}

main();
