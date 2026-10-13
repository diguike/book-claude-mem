/**
 * mini-mem 数据库 Schema
 * SQLite + FTS5 全文索引。type 取值参考 claude-mem 的 code 模式：change / discovery / bugfix …
 */
export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    project TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'discovery',
    title TEXT NOT NULL,
    narrative TEXT,
    files TEXT DEFAULT '[]',
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_obs_project ON observations(project, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_obs_session ON observations(session_id);

  -- 默认 unicode61 分词：英文按词切，连续的汉字会被当成一个 token
  -- 中文查询由 store.ts 的子串回退兜底（与 claude-mem v13 的做法一致）
  CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
    title, narrative,
    content='observations',
    content_rowid='id'
  );

  CREATE TRIGGER IF NOT EXISTS obs_fts_insert AFTER INSERT ON observations BEGIN
    INSERT INTO observations_fts(rowid, title, narrative)
    VALUES (new.id, new.title, new.narrative);
  END;

  CREATE TRIGGER IF NOT EXISTS obs_fts_delete AFTER DELETE ON observations BEGIN
    INSERT INTO observations_fts(observations_fts, rowid, title, narrative)
    VALUES ('delete', old.id, old.title, old.narrative);
  END;

  -- 只在被索引的列变化时重建索引行（claude-mem v13.29 的同款修复）
  CREATE TRIGGER IF NOT EXISTS obs_fts_update AFTER UPDATE OF title, narrative ON observations BEGIN
    INSERT INTO observations_fts(observations_fts, rowid, title, narrative)
    VALUES ('delete', old.id, old.title, old.narrative);
    INSERT INTO observations_fts(rowid, title, narrative)
    VALUES (new.id, new.title, new.narrative);
  END;
`;
