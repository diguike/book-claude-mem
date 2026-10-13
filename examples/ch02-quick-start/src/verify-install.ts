// claude-mem 安装验证脚本（对应 v13.35.0）
// 检查：数据目录、数据库与配置文件、Worker 的 /api/health
// 端口算法与 claude-mem 一致：CLAUDE_MEM_WORKER_PORT，或 settings.json 里的同名键，否则 37700 + uid % 100

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const dataDir = process.env.CLAUDE_MEM_DATA_DIR || join(homedir(), '.claude-mem');
const settingsPath = join(dataDir, 'settings.json');

function readSettings(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch {
    return {};
  }
}

function workerPort(settings: Record<string, string>): number {
  const configured = process.env.CLAUDE_MEM_WORKER_PORT || settings.CLAUDE_MEM_WORKER_PORT;
  if (configured) return Number(configured);
  const uid = typeof process.getuid === 'function' ? process.getuid() : 77; // 取不到 uid 时按 77 算（Windows → 37777）
  return 37700 + (uid % 100);
}

interface CheckResult { name: string; passed: boolean; detail: string }

async function checkHealth(host: string, port: number): Promise<CheckResult> {
  try {
    const res = await fetch(`http://${host}:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
    const body = await res.json() as Record<string, unknown>;
    return { name: 'Worker', passed: res.ok, detail: `http://${host}:${port} 返回 ${res.status}，version=${String(body.version ?? '?')}` };
  } catch (e) {
    return { name: 'Worker', passed: false, detail: `http://${host}:${port}/api/health 不可达（${(e as Error).message}）。运行 npx claude-mem start 或 npx claude-mem doctor` };
  }
}

async function main(): Promise<void> {
  console.log('=== claude-mem 安装验证 ===\n');
  const settings = readSettings();
  const host = process.env.CLAUDE_MEM_WORKER_HOST || settings.CLAUDE_MEM_WORKER_HOST || '127.0.0.1';
  const port = workerPort(settings);

  const results: CheckResult[] = [
    { name: '数据目录', passed: existsSync(dataDir), detail: dataDir },
    { name: '配置文件', passed: existsSync(settingsPath), detail: settingsPath },
    { name: '数据库', passed: existsSync(join(dataDir, 'claude-mem.db')), detail: join(dataDir, 'claude-mem.db') },
    await checkHealth(host, port),
  ];

  for (const r of results) console.log(`${r.passed ? '[PASS]' : '[FAIL]'} ${r.name}: ${r.detail}`);
  console.log(`\nViewer 地址：http://localhost:${port}`);

  if (results.every(r => r.passed)) {
    console.log('所有检查通过。');
  } else {
    console.log('有检查未通过。还没安装的话先运行：npx claude-mem install --ide claude-code --provider claude');
    process.exitCode = 1;
  }
}

main();
