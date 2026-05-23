// WAL 模式并发读写演示
// 展示 WAL 模式下读写不阻塞的特性

import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, '..', '.data');
const DB_PATH = join(DB_DIR, 'wal-demo.db');

// 清理
rmSync(DB_PATH, { force: true });
rmSync(DB_PATH + '-wal', { force: true });
rmSync(DB_PATH + '-shm', { force: true });
mkdirSync(DB_DIR, { recursive: true });

console.log('=== SQLite WAL 模式并发读写演示 ===\n');

// 创建数据库并启用 WAL
const db = new Database(DB_PATH);
const journalMode = db.pragma('journal_mode = WAL');
console.log(`Journal Mode: ${(journalMode as any)[0].journal_mode}`);

db.exec(`
  CREATE TABLE observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// 插入初始数据
const insert = db.prepare('INSERT INTO observations (content) VALUES (?)');
for (let i = 1; i <= 100; i++) {
  insert.run(`Observation #${i}: 这是第 ${i} 条测试数据`);
}
console.log('已插入 100 条初始数据\n');

// 模拟并发场景：一个连接在写，另一个连接在读
// better-sqlite3 是同步的，所以我们用交错操作模拟

console.log('[测试 1] 读写交错操作...');

const reader = new Database(DB_PATH, { readonly: true });
reader.pragma('journal_mode = WAL');

const writer = db;

const readStmt = reader.prepare('SELECT COUNT(*) as cnt FROM observations');
const writeStmt = writer.prepare('INSERT INTO observations (content) VALUES (?)');

const results: string[] = [];

// 交错执行读写操作
for (let i = 0; i < 10; i++) {
  // 写入
  writeStmt.run(`New observation during concurrent test #${i}`);
  results.push(`[Write] 插入第 ${101 + i} 条`);

  // 读取（在 WAL 模式下不会被写入阻塞）
  const count = readStmt.get() as { cnt: number };
  results.push(`[Read] 当前总数: ${count.cnt}`);
}

for (const r of results) {
  console.log(`  ${r}`);
}
console.log('');

// 测试 2：批量写入性能对比
console.log('[测试 2] 事务批量写入性能...');

// 无事务逐条写入
const start1 = performance.now();
for (let i = 0; i < 1000; i++) {
  writeStmt.run(`Perf test no-txn #${i}`);
}
const time1 = performance.now() - start1;
console.log(`  逐条写入 1000 条: ${time1.toFixed(1)}ms`);

// 事务批量写入
const batchInsert = writer.transaction((count: number) => {
  for (let i = 0; i < count; i++) {
    writeStmt.run(`Perf test with-txn #${i}`);
  }
});

const start2 = performance.now();
batchInsert(1000);
const time2 = performance.now() - start2;
console.log(`  事务批量写入 1000 条: ${time2.toFixed(1)}ms`);
console.log(`  性能提升: ${(time1 / time2).toFixed(1)}x\n`);

// 测试 3：WAL 文件大小
console.log('[测试 3] WAL 相关 pragma...');
const walInfo = {
  journal_mode: (db.pragma('journal_mode') as any)[0].journal_mode,
  wal_autocheckpoint: (db.pragma('wal_autocheckpoint') as any)[0].wal_autocheckpoint,
  synchronous: (db.pragma('synchronous') as any)[0].synchronous,
};
console.log(`  journal_mode: ${walInfo.journal_mode}`);
console.log(`  wal_autocheckpoint: ${walInfo.wal_autocheckpoint} pages`);
console.log(`  synchronous: ${walInfo.synchronous}`);

// 手动 checkpoint
const checkpointResult = db.pragma('wal_checkpoint(TRUNCATE)');
console.log(`  checkpoint 结果: ${JSON.stringify(checkpointResult)}`);

reader.close();
db.close();
console.log('\nDemo 结束。');
