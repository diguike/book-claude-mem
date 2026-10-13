// SQLite 开发环境检查：FTS5、WAL，以及中文检索在两种分词器下的差异
// 运行：npm run check:sqlite

import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'ch12-sqlite-'));
const db = new Database(join(dir, 'check.db'));

function line(label: string, value: string): void {
  console.log(`  ${label.padEnd(28)} ${value}`);
}

console.log('=== SQLite 环境检查 ===\n');
const version = db.prepare('select sqlite_version() as v').get() as { v: string };
line('SQLite 版本', version.v);

// 1. WAL：读写互不阻塞（claude-mem 的 connection.ts 同样开启）
const mode = db.pragma('journal_mode = WAL', { simple: true });
line('journal_mode', String(mode));
db.pragma('busy_timeout = 5000');
line('busy_timeout', String(db.pragma('busy_timeout', { simple: true })));

// 2. FTS5 是否可用
let fts5 = true;
try {
  db.exec('CREATE VIRTUAL TABLE temp.probe USING fts5(x)');
  db.exec('DROP TABLE temp.probe');
} catch {
  fts5 = false;
}
line('FTS5', fts5 ? '可用' : '不可用（搜索只能退回 LIKE）');
if (!fts5) process.exit(1);

// 3. 中文检索：unicode61（claude-mem 默认）vs trigram
db.exec(`
  CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT);
  CREATE VIRTUAL TABLE docs_u61 USING fts5(title, content='docs', content_rowid='id');
  CREATE VIRTUAL TABLE docs_tri USING fts5(title, content='docs', content_rowid='id', tokenize='trigram');
`);
const titles = ['修改了项目配置', '修复连接池泄漏导致的 5xx', 'payload优先使用LLM', 'JWT 验证改为异步'];
const insert = db.prepare('INSERT INTO docs (title) VALUES (?)');
for (const t of titles) insert.run(t);
db.exec(`INSERT INTO docs_u61(rowid, title) SELECT id, title FROM docs;
         INSERT INTO docs_tri(rowid, title) SELECT id, title FROM docs;`);

const quote = (q: string) => `"${q.replace(/"/g, '""')}"`;
function count(table: string, query: string): string {
  try {
    const rows = db.prepare(`SELECT rowid FROM ${table} WHERE ${table} MATCH ?`).all(quote(query));
    return String(rows.length);
  } catch (e) {
    return `报错: ${(e as Error).message}`;
  }
}
function likeCount(query: string): number {
  const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
  return (db.prepare(`SELECT id FROM docs WHERE title LIKE ? ESCAPE '\\'`).all(pattern)).length;
}

console.log('\n  中文检索对比（命中条数）：');
console.log('  ' + ['查询', 'unicode61', 'trigram', 'LIKE 子串'].map(s => s.padEnd(12)).join(''));
for (const q of ['项目', '连接池', '修复连接池', 'payload', 'JWT']) {
  console.log('  ' + [q, count('docs_u61', q), count('docs_tri', q), String(likeCount(q))].map(s => s.padEnd(12)).join(''));
}
console.log(`
  说明：
  - unicode61 把连续的汉字当成一个 token，“项目”“连接池”在长串里搜不到
  - trigram 按 3 个字符滑窗建索引，能搜到 3 字以上的子串，但 2 个字的查询（如“项目”）仍然搜不到
  - claude-mem v13 的做法：查询含 CJK 时直接用 LIKE 子串匹配（见第 7 章）`);

db.close();
rmSync(dir, { recursive: true, force: true });
