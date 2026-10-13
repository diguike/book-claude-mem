/**
 * 用 SQLite 模拟 claude-mem Server 的 Postgres schema（src/storage/postgres/schema.ts 的子集）
 * 关键点：租户隔离写在 schema 里——每张业务表都带 (project_id, team_id)，
 * 并用复合外键指向 projects(id, team_id)，一个项目不可能被挂到别的团队下
 */
import Database from 'better-sqlite3';

export function openDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      UNIQUE (id, team_id)
    );
    CREATE TABLE api_keys (
      id TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL UNIQUE,          -- 只存 SHA-256，原始 key 只在创建时显示一次
      team_id TEXT REFERENCES teams(id),
      project_id TEXT,
      actor_id TEXT NOT NULL,
      scopes TEXT NOT NULL DEFAULT '[]',
      revoked_at INTEGER,
      CHECK (project_id IS NULL OR team_id IS NOT NULL),
      FOREIGN KEY (project_id, team_id) REFERENCES projects(id, team_id)
    );
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY,
      team_id TEXT, project_id TEXT, api_key_id TEXT,
      action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT,
      details TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
    );
    CREATE TABLE agent_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL, team_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,   -- 客户端重发同一事件只入库一次
      event_type TEXT NOT NULL, payload TEXT NOT NULL,
      FOREIGN KEY (project_id, team_id) REFERENCES projects(id, team_id)
    );
    CREATE TABLE observation_generation_jobs (  -- 发件箱：与事件同一事务写入
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL, team_id TEXT NOT NULL,
      agent_event_id TEXT NOT NULL REFERENCES agent_events(id),
      status TEXT NOT NULL CHECK (status IN ('queued','processing','completed','failed','cancelled')),
      idempotency_key TEXT NOT NULL UNIQUE,     -- 同一事件只会有一个生成任务
      bullmq_job_id TEXT UNIQUE,
      attempts INTEGER NOT NULL DEFAULT 0,
      retried_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (project_id, team_id) REFERENCES projects(id, team_id)
    );
    CREATE TABLE observations (
      id INTEGER PRIMARY KEY,
      project_id TEXT NOT NULL, team_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_by_job_id TEXT REFERENCES observation_generation_jobs(id),
      FOREIGN KEY (project_id, team_id) REFERENCES projects(id, team_id)
    );
  `);
  return db;
}
