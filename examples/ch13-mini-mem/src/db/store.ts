/**
 * Observation 存储层
 * 封装 SQLite CRUD 操作和 FTS5 搜索
 */
import Database from 'better-sqlite3';
import path from 'path';
import { mkdirSync } from 'fs';
import { SCHEMA } from './schema.js';

const DATA_DIR = path.join(process.env.HOME || '/tmp', '.mini-mem');
const DB_PATH = path.join(DATA_DIR, 'mini-mem.db');

export interface Observation {
  id: number;
  session_id: string;
  project: string;
  type: string;
  title: string;
  narrative: string;
  files: string;
  created_at: number;
}

export class ObservationStore {
  private db: Database.Database;

  constructor(dbPath: string = DB_PATH) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA);
  }

  insertObservation(obs: {
    sessionId: string;
    project: string;
    type: string;
    title: string;
    narrative: string;
    files: string[];
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO observations (session_id, project, type, title, narrative, files)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      obs.sessionId, obs.project, obs.type,
      obs.title, obs.narrative, JSON.stringify(obs.files)
    );
    return result.lastInsertRowid as number;
  }

  getRecentByProject(project: string, limit: number = 30): Observation[] {
    return this.db.prepare(`
      SELECT id, session_id, project, type, title, narrative, files, created_at
      FROM observations
      WHERE project = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(project, limit) as Observation[];
  }

  search(query: string, limit: number = 20): Observation[] {
    // 转义双引号，防止 FTS5 注入
    const escaped = query.replace(/"/g, '""');
    return this.db.prepare(`
      SELECT o.id, o.session_id, o.project, o.type, o.title, o.narrative, o.files, o.created_at
      FROM observations_fts
      JOIN observations o ON o.id = observations_fts.rowid
      WHERE observations_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(escaped, limit) as Observation[];
  }

  getByIds(ids: number[]): Observation[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    return this.db.prepare(`
      SELECT id, session_id, project, type, title, narrative, files, created_at
      FROM observations
      WHERE id IN (${placeholders})
      ORDER BY created_at DESC
    `).all(...ids) as Observation[];
  }

  getAfter(afterId: number, limit: number = 10): Observation[] {
    return this.db.prepare(`
      SELECT id, session_id, project, type, title, narrative, files, created_at
      FROM observations
      WHERE id > ?
      ORDER BY id ASC
      LIMIT ?
    `).all(afterId, limit) as Observation[];
  }

  close(): void {
    this.db.close();
  }
}
