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

function ftsSearch(query: string) {
  const rows = db.prepare(`
    SELECT o.id, o.content, o.category, o.project,
           rank
    FROM observations_fts fts
    JOIN observations o ON o.id = fts.rowid
    WHERE observations_fts MATCH ?
    ORDER BY rank
  `).all(query);
  return rows;
}

const queries = [
  'Next.js',                    // 简单关键词
  'SQLite',                     // 精确匹配
  'architecture',               // 按 category 搜索
  'claude-mem',                 // 按 project 搜索
  'database OR testing',        // 布尔 OR
  '"GitHub Actions"',           // 短语匹配
];

for (const q of queries) {
  console.log(`  搜索: "${q}"`);
  const results = ftsSearch(q);
  if (results.length === 0) {
    console.log('    无结果');
  } else {
    for (const row of results as any[]) {
      console.log(`    #${row.id} [${row.category}/${row.project}] ${row.content.slice(0, 60)}...`);
    }
  }
  console.log('');
}

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
