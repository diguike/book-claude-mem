/**
 * mini-mem 数据库 Schema
 * 使用 SQLite + FTS5 全文搜索
 */
export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    project TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'how-it-works',
    title TEXT NOT NULL,
    narrative TEXT,
    files TEXT DEFAULT '[]',
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_obs_project ON observations(project, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_obs_session ON observations(session_id);

  CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
    title, narrative,
    content='observations',
    content_rowid='id',
    tokenize='unicode61'
  );

  CREATE TRIGGER IF NOT EXISTS obs_fts_insert AFTER INSERT ON observations BEGIN
    INSERT INTO observations_fts(rowid, title, narrative)
    VALUES (new.id, new.title, new.narrative);
  END;

  CREATE TRIGGER IF NOT EXISTS obs_fts_delete AFTER DELETE ON observations BEGIN
    INSERT INTO observations_fts(observations_fts, rowid, title, narrative)
    VALUES ('delete', old.id, old.title, old.narrative);
  END;
`;
