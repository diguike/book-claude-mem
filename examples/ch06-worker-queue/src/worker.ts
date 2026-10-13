/**
 * Worker 侧：取件 → 交接标记 → 内存缓冲 → 批量“压缩” → 写库
 *
 * 持久化只发生在交接点：
 *   1. 条目的键已在 handoff 表里 → 上次交接过、文件没来得及删 → 只删文件
 *   2. 放进内存缓冲的同时写 handoff 标记
 *   3. 删除文件，再删除标记
 * 交接之后的处理全在内存里（claude-mem 删掉 pending_messages 持久队列的理由见第 6 章）
 */
import Database from 'better-sqlite3';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { listEntries, type ToolEvent } from './spool.js';

export type CrashPoint = 'none' | 'before-marker' | 'after-marker-before-unlink';

export class Worker {
  private readonly db: Database.Database;
  /** 每个会话一个内存缓冲；进程死了它就没了，这是有意的 */
  private readonly buffers = new Map<string, ToolEvent[]>();

  constructor(private readonly spoolDir: string, dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS handoff (entry_key TEXT PRIMARY KEY, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY,
        session_id TEXT NOT NULL,
        title TEXT NOT NULL,
        source_keys TEXT NOT NULL
      );
    `);
  }

  /** 取件。crash 参数用来模拟进程在某个位置被杀掉 */
  drain(crash: CrashPoint = 'none'): { handedOff: number; skippedAlreadyHandedOff: number } {
    let handedOff = 0;
    let skippedAlreadyHandedOff = 0;
    for (const { file, key, entry } of listEntries(this.spoolDir)) {
      const marked = this.db.prepare('SELECT 1 FROM handoff WHERE entry_key = ?').get(key);
      if (marked) {
        // 上次已经交接，崩溃发生在删文件之前：只删文件，不再入缓冲
        unlinkSync(join(this.spoolDir, file));
        this.db.prepare('DELETE FROM handoff WHERE entry_key = ?').run(key);
        skippedAlreadyHandedOff++;
        continue;
      }
      if (crash === 'before-marker') throw new Error('模拟崩溃：交接标记写入之前');

      // 放进内存缓冲与写标记放在同一个同步代码段里，中间没有 await
      const buffer = this.buffers.get(entry.payload.sessionId) ?? [];
      buffer.push(entry.payload);
      this.buffers.set(entry.payload.sessionId, buffer);
      this.db.prepare('INSERT INTO handoff (entry_key, at) VALUES (?, ?)').run(key, Date.now());
      handedOff++;

      if (crash === 'after-marker-before-unlink') throw new Error('模拟崩溃：标记已写、文件未删');
      unlinkSync(join(this.spoolDir, file));
      this.db.prepare('DELETE FROM handoff WHERE entry_key = ?').run(key);
    }
    return { handedOff, skippedAlreadyHandedOff };
  }

  /** 把每个会话缓冲里的一批事件“压缩”成一条观察（这里用规则代替模型） */
  flush(): number {
    let written = 0;
    for (const [sessionId, events] of this.buffers) {
      if (events.length === 0) continue;
      const tools = events.map(e => e.toolName).join(', ');
      this.db.prepare('INSERT INTO observations (session_id, title, source_keys) VALUES (?, ?, ?)')
        .run(sessionId, `本批 ${events.length} 次工具调用：${tools}`, JSON.stringify(events.map(e => e.toolUseId)));
      written++;
    }
    this.buffers.clear();
    return written;
  }

  bufferedCount(): number {
    let n = 0;
    for (const events of this.buffers.values()) n += events.length;
    return n;
  }

  observations(): Array<{ id: number; session_id: string; title: string; source_keys: string }> {
    return this.db.prepare('SELECT * FROM observations ORDER BY id').all() as never;
  }

  close(): void {
    this.db.close();
  }
}
