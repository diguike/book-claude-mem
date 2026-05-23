/**
 * ch12：开发环境验证脚本
 *
 * 检查 claude-mem 开发和运行所需的全部依赖和配置。
 * 运行：tsx src/check-env.ts
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';
import Database from 'better-sqlite3';

// ─────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────

type CheckStatus = 'ok' | 'warn' | 'fail';

interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  fix?: string;
}

const results: CheckResult[] = [];

function check(name: string, fn: () => { status: CheckStatus; message: string; fix?: string }) {
  try {
    const result = fn();
    results.push({ name, ...result });
  } catch (err) {
    results.push({ name, status: 'fail', message: String(err) });
  }
}

function runCommand(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

// ─────────────────────────────────────────────────────────────
// 检查项
// ─────────────────────────────────────────────────────────────

// 1. Node.js 版本
check('Node.js 版本', () => {
  const version = process.version; // e.g. "v20.11.0"
  const major = parseInt(version.slice(1).split('.')[0]);
  if (major >= 20) return { status: 'ok', message: `${version}（满足 v20+ 要求）` };
  return {
    status: 'fail',
    message: `${version}（需要 v20+）`,
    fix: '升级 Node.js：nvm install 20 && nvm use 20',
  };
});

// 2. Bun（可选）
check('Bun（可选）', () => {
  try {
    const version = runCommand('bun --version');
    return { status: 'ok', message: `v${version}（Worker 运行时）` };
  } catch {
    return {
      status: 'warn',
      message: '未安装（开发阶段可用 tsx 替代）',
      fix: 'curl -fsSL https://bun.sh/install | bash',
    };
  }
});

// 3. tsx（开发工具）
check('tsx（TypeScript 运行）', () => {
  try {
    const version = runCommand('npx tsx --version');
    return { status: 'ok', message: `v${version}` };
  } catch {
    return {
      status: 'fail',
      message: '未安装',
      fix: 'npm install -g tsx',
    };
  }
});

// 4. better-sqlite3
check('better-sqlite3', () => {
  try {
    const db = new Database(':memory:');
    db.exec('SELECT 1');
    db.close();
    return { status: 'ok', message: '可正常创建内存数据库' };
  } catch (err) {
    return {
      status: 'fail',
      message: `加载失败：${err}`,
      fix: 'npm install better-sqlite3 && npm rebuild better-sqlite3',
    };
  }
});

// 5. SQLite FTS5 扩展
check('SQLite FTS5 扩展', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE VIRTUAL TABLE fts_test USING fts5(title, tokenize='trigram');
      INSERT INTO fts_test VALUES ('连接池泄漏修复');
      SELECT * FROM fts_test WHERE fts_test MATCH '连接';
    `);
    db.close();
    return { status: 'ok', message: 'FTS5 + trigram 分词器可用' };
  } catch (err) {
    db.close();
    return {
      status: 'fail',
      message: `FTS5 不可用：${err}`,
      fix: '重新编译 SQLite（通常随 better-sqlite3 自动包含 FTS5）',
    };
  }
});

// 6. SQLite WAL 模式
check('SQLite WAL 模式', () => {
  const db = new Database(':memory:');
  try {
    db.exec('PRAGMA journal_mode=WAL');
    const mode = (db.pragma('journal_mode') as { journal_mode: string }[])[0].journal_mode;
    db.close();
    // 内存数据库返回 memory 而非 wal，这是正常的
    if (mode === 'wal' || mode === 'memory') {
      return { status: 'ok', message: `PRAGMA journal_mode 可用（内存DB返回：${mode}）` };
    }
    return { status: 'warn', message: `WAL 模式返回：${mode}（文件数据库才会生效）` };
  } catch (err) {
    db.close();
    return { status: 'fail', message: `WAL 模式失败：${err}` };
  }
});

// 7. Claude Code 安装
check('Claude Code CLI', () => {
  try {
    const version = runCommand('claude --version');
    return { status: 'ok', message: version };
  } catch {
    return {
      status: 'warn',
      message: '未安装（读者需要安装才能使用插件功能）',
      fix: 'npm install -g @anthropic-ai/claude-code',
    };
  }
});

// 8. Claude Code Plugin 目录
check('Claude Code Plugin 目录', () => {
  const pluginDir = join(homedir(), '.claude', 'plugins');
  if (existsSync(pluginDir)) {
    return { status: 'ok', message: `~/.claude/plugins/ 存在` };
  }
  return {
    status: 'warn',
    message: '~/.claude/plugins/ 不存在（首次安装插件时会自动创建）',
  };
});

// 9. ANTHROPIC_API_KEY
check('ANTHROPIC_API_KEY', () => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return {
      status: 'warn',
      message: '未设置（AI 压缩功能需要此 Key）',
      fix: 'export ANTHROPIC_API_KEY=sk-ant-...',
    };
  }
  if (key.startsWith('sk-ant-')) {
    return { status: 'ok', message: `已设置（sk-ant-...${key.slice(-4)}）` };
  }
  return { status: 'warn', message: '已设置但格式不标准' };
});

// 10. 操作系统
check('操作系统', () => {
  const os = platform();
  const supported = ['darwin', 'linux'];
  if (supported.includes(os)) {
    return { status: 'ok', message: `${os}（支持的平台）` };
  }
  return {
    status: 'warn',
    message: `${os}（Windows 支持有限，推荐使用 WSL2）`,
  };
});

// ─────────────────────────────────────────────────────────────
// 输出结果
// ─────────────────────────────────────────────────────────────

const icons = { ok: '✓', warn: '!', fail: '✗' };
const labels = { ok: 'OK  ', warn: 'WARN', fail: 'FAIL' };

console.log('\n='.repeat(60));
console.log(' claude-mem 开发环境验证报告');
console.log('='.repeat(60));

for (const r of results) {
  const icon = icons[r.status];
  const label = labels[r.status];
  console.log(`\n[${icon}] ${label} ${r.name}`);
  console.log(`       ${r.message}`);
  if (r.fix) console.log(`       修复：${r.fix}`);
}

const okCount = results.filter(r => r.status === 'ok').length;
const warnCount = results.filter(r => r.status === 'warn').length;
const failCount = results.filter(r => r.status === 'fail').length;

console.log('\n' + '-'.repeat(60));
console.log(`汇总：${okCount} 通过 / ${warnCount} 警告 / ${failCount} 失败`);

if (failCount === 0 && warnCount === 0) {
  console.log('环境检查全部通过，可以开始 mini-mem 实战！');
} else if (failCount === 0) {
  console.log('关键依赖已就绪，警告项可选择性修复。');
} else {
  console.log('请修复 FAIL 项后再继续。');
}
console.log('='.repeat(60) + '\n');
