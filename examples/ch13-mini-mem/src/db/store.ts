/**
 * Observation 存储层
 * 封装 SQLite CRUD 和搜索：FTS5 为主，中日韩文本走 LIKE 子串
 */
import Database from 'better-sqlite3';
import path from 'path';
import { mkdirSync } from 'fs';
import { SCHEMA } from './schema.js';

// MINI_MEM_DATA_DIR 便于测试时把数据放到临时目录，不碰真实的 ~/.mini-mem
const DATA_DIR = process.env.MINI_MEM_DATA_DIR || path.join(process.env.HOME || '/tmp', '.mini-mem');
export const DB_PATH = path.join(DATA_DIR, 'mini-mem.db');

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

const COLUMNS = 'o.id, o.session_id, o.project, o.type, o.title, o.narrative, o.files, o.created_at';

// unicode61 分不开的文字：CJK 统一表意文字、假名、韩文、注音
const UNSEGMENTED = /[぀-ヿ㄀-㆏㐀-䶿一-鿿가-힯豈-﫿]/;

/** 每个 token 单独加引号并用 AND 连接：任意输入都不会改变 MATCH 语法（同 claude-mem buildFTSMatchQuery） */
export function buildFtsQuery(query: string): string {
  const tokens = (query.match(/\S+/g) ?? []).filter(t => /[\p{L}\p{N}]/u.test(t));
  if (tokens.length === 0) return `"${query.replace(/"/g, '""')}"`;
  return tokens.map(t => `"${t.replace(/"/g, '""')}"`).join(' AND ');
}

/** 子串匹配：每个连续段一组 LIKE，组之间 AND；%、_、\ 先转义 */
function buildSubstringClause(query: string): { clause: string; params: string[] } {
  const terms = [...new Set(query.match(/[぀-ヿ㄀-㆏㐀-䶿一-鿿가-힯豈-﫿]+|[^\s぀-ヿ㄀-㆏㐀-䶿一-鿿가-힯豈-﫿]+/g) ?? [query])].slice(0, 50);
  const params: string[] = [];
  const groups = terms.map(term => {
    const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
    params.push(pattern, pattern);
    return `(o.title LIKE ? ESCAPE '\\' OR o.narrative LIKE ? ESCAPE '\\')`;
  });
  return { clause: groups.join(' AND '), params };
}

export class ObservationStore {
  private db: Database.Database;

  constructor(dbPath: string = DB_PATH) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000'); // Hook 进程和 MCP 进程会同时访问这个文件
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
    const result = this.db.prepare(`
      INSERT INTO observations (session_id, project, type, title, narrative, files)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(obs.sessionId, obs.project, obs.type, obs.title, obs.narrative, JSON.stringify(obs.files));
    return Number(result.lastInsertRowid);
  }

  getRecentByProject(project: string, limit: number = 50): Observation[] {
    return this.db.prepare(`
      SELECT ${COLUMNS} FROM observations o
      WHERE o.project = ?
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT ?
    `).all(project, limit) as Observation[];
  }

  search(query: string, limit: number = 20): Observation[] {
    const q = query.trim();
    if (!q) return [];
    // 1. 含中日韩文字：FTS5 的 unicode61 搜不到子串，直接走 LIKE
    if (UNSEGMENTED.test(q)) return this.searchBySubstring(q, limit);
    // 2. 其他：FTS5，按 BM25 排序
    const rows = this.db.prepare(`
      SELECT ${COLUMNS} FROM observations_fts
      JOIN observations o ON o.id = observations_fts.rowid
      WHERE observations_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(buildFtsQuery(q), limit) as Observation[];
    // 3. FTS5 一条都没命中（比如 "payload" 粘在汉字上），再用子串试一次
    return rows.length > 0 ? rows : this.searchBySubstring(q, limit);
  }

  private searchBySubstring(query: string, limit: number): Observation[] {
    const { clause, params } = buildSubstringClause(query);
    return this.db.prepare(`
      SELECT ${COLUMNS} FROM observations o
      WHERE ${clause}
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT ?
    `).all(...params, limit) as Observation[];
  }

  getByIds(ids: number[]): Observation[] {
    const clean = ids.filter(id => Number.isSafeInteger(id));
    if (clean.length === 0) return [];
    const placeholders = clean.map(() => '?').join(',');
    return this.db.prepare(`
      SELECT ${COLUMNS} FROM observations o
      WHERE o.id IN (${placeholders})
      ORDER BY o.created_at DESC, o.id DESC
    `).all(...clean) as Observation[];
  }

  getAfter(afterId: number, limit: number = 10): Observation[] {
    return this.db.prepare(`
      SELECT ${COLUMNS} FROM observations o
      WHERE o.id > ?
      ORDER BY o.id ASC
      LIMIT ?
    `).all(afterId, limit) as Observation[];
  }

  close(): void {
    this.db.close();
  }
}
