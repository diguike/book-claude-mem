/** API Key：只存哈希，按作用域鉴权（src/server/middleware/postgres-auth.ts 的思路） */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type Database from 'better-sqlite3';

export interface AuthContext { apiKeyId: string; teamId: string | null; projectId: string | null; scopes: string[] }
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function createApiKey(db: Database.Database, opts: { teamId: string; projectId?: string; actorId: string; scopes: string[] }): string {
  const raw = `cmem_${randomBytes(32).toString('base64url')}`; // claude-mem 的服务端 key 也以 cmem_ 开头
  db.prepare('INSERT INTO api_keys (id, key_hash, team_id, project_id, actor_id, scopes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), sha256(raw), opts.teamId, opts.projectId ?? null, opts.actorId, JSON.stringify(opts.scopes));
  return raw;
}

export function requireScope(db: Database.Database, scope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const raw = req.header('authorization')?.replace(/^Bearer\s+/i, '') || req.header('x-api-key') || '';
    if (!raw) return res.status(401).json({ error: 'Unauthorized', message: 'Missing API key' });
    // 每个请求都按哈希重新查库：吊销立即生效，没有内存缓存可以被污染
    // 作用域要求逐个命中，只有 '*' 是通配；memories:admin 不隐含读写
    const row = db.prepare('SELECT id, team_id, project_id, scopes, revoked_at FROM api_keys WHERE key_hash = ?').get(sha256(raw)) as
      { id: string; team_id: string | null; project_id: string | null; scopes: string; revoked_at: number | null } | undefined;
    const scopes: string[] = row ? JSON.parse(row.scopes) : [];
    if (!row || row.revoked_at !== null || !(scopes.includes(scope) || scopes.includes('*'))) {
      return res.status(403).json({ error: 'Forbidden', message: 'Invalid API key or insufficient scope' });
    }
    res.locals.auth = { apiKeyId: row.id, teamId: row.team_id, projectId: row.project_id, scopes } satisfies AuthContext;
    next();
  };
}
