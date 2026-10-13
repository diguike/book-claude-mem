// SQLite FTS5 全文搜索实战
// 演示：建表、插入数据、FTS5 搜索

import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, '..', '.data');
const DB_PATH = join(DB_DIR, 'fts5-demo.db');

// 清理旧数据
rmSync(DB_DIR, { recursive: true, force: true });
mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// 1. 创建普通表和 FTS5 虚拟表
console.log('=== SQLite FTS5 Demo ===\n');
console.log('[1] 创建表结构...');

db.exec(`
  -- 普通 observations 表
  CREATE TABLE observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    category TEXT NOT NULL,
    project TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- FTS5 虚拟表（全文索引）
  CREATE VIRTUAL TABLE observations_fts USING fts5(
    content,
    category,
    project,
    content='observations',
    content_rowid='id'
  );

  -- 触发器：插入时自动更新 FTS 索引
  CREATE TRIGGER observations_ai AFTER INSERT ON observations BEGIN
    INSERT INTO observations_fts(rowid, content, category, project)
    VALUES (new.id, new.content, new.category, new.project);
  END;

  -- 触发器：删除时同步删除 FTS 索引
  CREATE TRIGGER observations_ad AFTER DELETE ON observations BEGIN
    INSERT INTO observations_fts(observations_fts, rowid, content, category, project)
    VALUES ('delete', old.id, old.content, old.category, old.project);
  END;
`);

// 2. 插入测试数据
console.log('[2] 插入测试数据...\n');

const insertStmt = db.prepare(`
  INSERT INTO observations (content, category, project) VALUES (?, ?, ?)
`);

const testData = [
  ['项目使用 Next.js 14 App Router 架构，路由在 app/ 目录下', 'architecture', 'web-app'],
  ['数据库使用 Supabase PostgreSQL，ORM 是 Drizzle', 'database', 'web-app'],
  ['部署在 Vercel，CI/CD 使用 GitHub Actions', 'deploy', 'web-app'],
  ['测试框架使用 Vitest，组件测试用 Testing Library', 'testing', 'web-app'],
  ['认证使用 NextAuth.js v5，支持 GitHub OAuth', 'auth', 'web-app'],
  ['项目使用 Express + SQLite 作为后端', 'architecture', 'api-server'],
  ['Claude Code 的 Hook 系统支持 SessionStart 和 PostToolUse', 'hook', 'claude-mem'],
  ['SQLite FTS5 支持布尔查询和短语匹配', 'database', 'claude-mem'],
  ['Progressive Disclosure 通过索引层减少 token 消耗', 'architecture', 'claude-mem'],
  ['Worker 使用 HTTP 协议接收 CLI 的请求', 'architecture', 'claude-mem'],
];

const insertMany = db.transaction((data: string[][]) => {
  for (const [content, category, project] of data) {
    insertStmt.run(content, category, project);
  }
});
insertMany(testData);
console.log(`  已插入 ${testData.length} 条数据\n`);

// 3. FTS5 搜索演示
console.log('[3] FTS5 搜索演示...\n');

function rawMatch(match: string): any[] {
  return db.prepare(`
    SELECT o.id, o.content, o.category, o.project, rank
    FROM observations_fts fts
    JOIN observations o ON o.id = fts.rowid
    WHERE observations_fts MATCH ?
    ORDER BY rank
  `).all(match);
}

function printRows(rows: any[]): void {
  if (rows.length === 0) console.log('    无结果');
  for (const row of rows) console.log(`    #${row.id} [${row.category}/${row.project}] ${row.content.slice(0, 50)}`);
}

// 3a. MATCH 的原生语法：只适合程序内部构造，不能直接拼用户输入
console.log('  [3a] 原生 MATCH 语法（程序内部构造的查询）');
for (const q of ['SQLite', 'database OR testing', '"GitHub Actions"']) {
  console.log(`  MATCH ${q}`);
  printRows(rawMatch(q));
}

// 3b. 用户输入：每个词单独加引号、内部引号翻倍，再用 AND 连接（claude-mem v13 的 buildFTSMatchQuery）
function buildFtsQuery(query: string): string {
  const tokens = (query.match(/\S+/g) ?? []).filter(t => /[\p{L}\p{N}]/u.test(t));
  if (tokens.length === 0) return `"${query.replace(/"/g, '""')}"`;
  return tokens.map(t => `"${t.replace(/"/g, '""')}"`).join(' AND ');
}

console.log('\n  [3b] 用户输入：原样交给 MATCH vs 先经过 buildFtsQuery');
for (const input of ['Next.js', 'claude-mem', 'Express SQLite', 'auth "unclosed']) {
  let raw: string;
  try {
    raw = `${rawMatch(input).length} 条`;
  } catch (e) {
    raw = `报错 ${(e as Error).message}`;
  }
  const safeQuery = buildFtsQuery(input);
  console.log(`  输入 ${JSON.stringify(input)}：原样 → ${raw}；安全构造 ${safeQuery} → ${rawMatch(safeQuery).length} 条`);
}

// 3c. 中文：unicode61 把连续汉字当成一个 token，子串搜不到；改用 LIKE
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;
function search(input: string): { via: string; rows: any[] } {
  if (CJK.test(input)) {
    const pattern = `%${input.replace(/[\\%_]/g, '\\$&')}%`;
    return { via: 'LIKE 子串', rows: db.prepare(`SELECT * FROM observations WHERE content LIKE ? ESCAPE '\\'`).all(pattern) };
  }
  return { via: 'FTS5', rows: rawMatch(buildFtsQuery(input)) };
}

console.log('\n  [3c] 中文查询：FTS5（unicode61）vs 子串回退');
for (const input of ['数据库', '测试框架', '路由']) {
  const ftsCount = rawMatch(buildFtsQuery(input)).length;
  const { via, rows } = search(input);
  console.log(`  ${input}：FTS5 ${ftsCount} 条；路由到 ${via} → ${rows.length} 条`);
}
console.log('');

// 4. 高亮和摘要
console.log('[4] FTS5 高亮与摘要...\n');

const highlightResult = db.prepare(`
  SELECT highlight(observations_fts, 0, '**', '**') as highlighted
  FROM observations_fts
  WHERE observations_fts MATCH 'SQLite'
`).all();

for (const row of highlightResult as any[]) {
  console.log(`  高亮: ${row.highlighted}`);
}

db.close();
console.log('\nDemo 结束。');
