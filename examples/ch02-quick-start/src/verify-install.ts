import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as net from 'node:net';

// claude-mem 安装验证脚本
// 检查项：配置目录是否存在、默认端口是否可达

const CLAUDE_MEM_DIR = join(homedir(), '.claude-mem');
const DEFAULT_PORT = 7777;

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

function checkDirectory(): CheckResult {
  const exists = existsSync(CLAUDE_MEM_DIR);
  return {
    name: '配置目录',
    passed: exists,
    detail: exists
      ? `${CLAUDE_MEM_DIR} 存在`
      : `${CLAUDE_MEM_DIR} 不存在，请先运行 claude-mem init`,
  };
}

function checkPort(port: number): Promise<CheckResult> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 2000;

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      socket.destroy();
      resolve({
        name: `端口 ${port}`,
        passed: true,
        detail: `localhost:${port} 可达，Worker 正在运行`,
      });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        name: `端口 ${port}`,
        passed: false,
        detail: `localhost:${port} 超时，Worker 可能未启动`,
      });
    });

    socket.on('error', () => {
      resolve({
        name: `端口 ${port}`,
        passed: false,
        detail: `localhost:${port} 不可达，Worker 未运行`,
      });
    });

    socket.connect(port, '127.0.0.1');
  });
}

function checkSubFiles(): CheckResult {
  const expectedFiles = ['settings.json', 'corpora', 'observations.db'];
  const found: string[] = [];
  const missing: string[] = [];

  for (const file of expectedFiles) {
    const path = join(CLAUDE_MEM_DIR, file);
    if (existsSync(path)) {
      found.push(file);
    } else {
      missing.push(file);
    }
  }

  return {
    name: '核心文件',
    passed: missing.length === 0,
    detail: missing.length === 0
      ? `所有核心文件就绪: ${found.join(', ')}`
      : `缺少: ${missing.join(', ')}`,
  };
}

async function main() {
  console.log('=== claude-mem 安装验证 ===\n');

  const results: CheckResult[] = [];

  results.push(checkDirectory());
  results.push(checkSubFiles());
  results.push(await checkPort(DEFAULT_PORT));

  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? '[PASS]' : '[FAIL]';
    console.log(`${icon} ${r.name}: ${r.detail}`);
    if (!r.passed) allPassed = false;
  }

  console.log('');
  if (allPassed) {
    console.log('所有检查通过，claude-mem 安装正常。');
  } else {
    console.log('部分检查未通过，请根据提示修复。');
    process.exit(1);
  }
}

main();
