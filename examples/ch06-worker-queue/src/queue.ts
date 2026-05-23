// SQLite pending queue 实现
// 模拟 claude-mem Worker 中的任务队列

import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, '..', '.data');
const DB_PATH = join(DB_DIR, 'queue.db');

export type TaskStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface QueueTask {
  id: number;
  task_type: string;
  payload: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  attempts: number;
  error?: string;
}

export class TaskQueue {
  private db: Database.Database;

  constructor() {
    mkdirSync(DB_DIR, { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        attempts INTEGER NOT NULL DEFAULT 0,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    `);
  }

  // 入队
  enqueue(taskType: string, payload: string): QueueTask {
    const stmt = this.db.prepare(`
      INSERT INTO tasks (task_type, payload) VALUES (?, ?)
    `);
    const result = stmt.run(taskType, payload);
    return this.getById(result.lastInsertRowid as number)!;
  }

  // 获取下一批待处理任务
  dequeue(limit: number = 5): QueueTask[] {
    const selectStmt = this.db.prepare(`
      SELECT * FROM tasks WHERE status = 'pending'
      ORDER BY created_at ASC LIMIT ?
    `);
    const tasks = selectStmt.all(limit) as QueueTask[];

    // 标记为 processing
    const updateStmt = this.db.prepare(`
      UPDATE tasks SET status = 'processing', updated_at = datetime('now'), attempts = attempts + 1
      WHERE id = ?
    `);
    for (const task of tasks) {
      updateStmt.run(task.id);
      task.status = 'processing';
    }

    return tasks;
  }

  // 标记完成
  markDone(id: number): void {
    this.db.prepare(`
      UPDATE tasks SET status = 'done', updated_at = datetime('now') WHERE id = ?
    `).run(id);
  }

  // 标记失败
  markFailed(id: number, error: string): void {
    this.db.prepare(`
      UPDATE tasks SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?
    `).run(error, id);
  }

  // 获取队列统计
  stats(): Record<TaskStatus, number> {
    const rows = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM tasks GROUP BY status
    `).all() as { status: TaskStatus; count: number }[];

    const result: Record<TaskStatus, number> = { pending: 0, processing: 0, done: 0, failed: 0 };
    for (const row of rows) {
      result[row.status] = row.count;
    }
    return result;
  }

  private getById(id: number): QueueTask | undefined {
    return this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as QueueTask | undefined;
  }

  close() {
    this.db.close();
  }
}
