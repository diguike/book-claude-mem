/**
 * HTTP 层：对照 claude-mem 的 src/server/routes/v1/ServerV1PostgresRoutes.ts
 * - POST /v1/events：事件行 + 发件箱行在同一事务里写入，提交后再发布到队列
 * - GET  /v1/events/:id：跨租户访问返回 404，不暴露“这个 ID 存在”
 * - POST /v1/jobs/:id/retry | cancel：运维动作，全部写审计
 */
import express, { type Request, type Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { requireScope, type AuthContext } from './auth.js';
import { buildJobId, type InProcessQueue } from './jobs.js';

type EnqueueOutcome = 'enqueued' | 'queued_only' | 'skipped';

export function createApp(db: Database.Database, queue: InProcessQueue) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  const readAuth = requireScope(db, 'memories:read');
  const writeAuth = requireScope(db, 'memories:write');
  const auth = (res: Response) => res.locals.auth as AuthContext;

  const audit = (res: Response, action: string, resourceType: string, resourceId: string, projectId: string | null, details: object) => {
    const a = auth(res);
    db.prepare('INSERT INTO audit_log (team_id, project_id, api_key_id, action, resource_type, resource_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(a.teamId, projectId, a.apiKeyId, action, resourceType, resourceId, JSON.stringify(details), Date.now());
  };

  // 项目级 key 只能碰自己的项目；团队级 key 只能碰本团队的项目
  const projectAllowed = (a: AuthContext, projectId: string) => {
    if (a.projectId && a.projectId !== projectId) return false;
    return !!db.prepare('SELECT 1 FROM projects WHERE id = ? AND team_id = ?').get(projectId, a.teamId);
  };

  const publish = (jobId: string): EnqueueOutcome => {
    try {
      queue.add(jobId);
      return 'enqueued';
    } catch {
      return 'queued_only'; // 发布失败：行留在 queued，如实告诉调用方，不谎报 enqueued
    }
  };

  app.post('/v1/events', writeAuth, (req: Request, res: Response) => {
    const a = auth(res);
    const { projectId, sourceType, contentSessionId, eventType, occurredAtEpoch, payload } = req.body ?? {};
    if (!projectId || !sourceType || !eventType || typeof occurredAtEpoch !== 'number') return res.status(400).json({ error: 'ValidationError' });
    if (!projectAllowed(a, projectId)) return res.status(403).json({ error: 'Forbidden', message: 'Project not allowed' });

    // 幂等键 = 事件内容的哈希（对照 buildAgentEventIdempotencyKey）：
    // 客户端把同一个 body 原样重发，得到的还是同一行；occurredAt 差 1 ms 就是新事件
    const idempotencyKey = createHash('sha256')
      .update(JSON.stringify([a.teamId, projectId, sourceType, contentSessionId ?? null, eventType, occurredAtEpoch, payload ?? {}]))
      .digest('hex');
    // 事务内：事件 upsert + 发件箱 upsert；任何一步失败都整体回滚
    const { eventId, outbox } = db.transaction(() => {
      db.prepare(`INSERT INTO agent_events (id, project_id, team_id, idempotency_key, event_type, payload) VALUES (?, ?, ?, ?, ?, ?)
                  ON CONFLICT (idempotency_key) DO NOTHING`)
        .run(randomUUID(), projectId, a.teamId, idempotencyKey, eventType, JSON.stringify(payload ?? {}));
      const ev = db.prepare('SELECT id FROM agent_events WHERE idempotency_key = ?').get(idempotencyKey) as { id: string };
      const bullmqJobId = buildJobId({ kind: 'event', team_id: a.teamId!, project_id: projectId, source_type: 'agent_event', source_id: ev.id });
      db.prepare(`INSERT INTO observation_generation_jobs (id, project_id, team_id, agent_event_id, status, idempotency_key, bullmq_job_id)
                  VALUES (?, ?, ?, ?, 'queued', ?, ?) ON CONFLICT (idempotency_key) DO NOTHING`)
        .run(randomUUID(), projectId, a.teamId, ev.id, `agent_event:${ev.id}`, bullmqJobId);
      const job = db.prepare('SELECT id, status, bullmq_job_id FROM observation_generation_jobs WHERE agent_event_id = ?').get(ev.id) as
        { id: string; status: string; bullmq_job_id: string };
      return { eventId: ev.id, outbox: job };
    })();

    // 事务提交之后才发布：先发布再提交的话，Worker 可能拿到一个还看不见的行
    const enqueueState = outbox.status === 'queued' ? publish(outbox.bullmq_job_id) : 'skipped';
    audit(res, 'event.received', 'agent_event', eventId, projectId, { generationJobId: outbox.id });
    res.status(201).json({ event: { id: eventId }, generationJob: { id: outbox.id, status: outbox.status, enqueueState } });
  });

  app.get('/v1/events/:id', readAuth, (req: Request, res: Response) => {
    const a = auth(res);
    const row = db.prepare('SELECT id, project_id, event_type FROM agent_events WHERE id = ? AND team_id = ?').get(req.params.id, a.teamId) as
      { id: string; project_id: string; event_type: string } | undefined;
    // 租户条件写在 WHERE 里：别的团队的 ID 与不存在的 ID 返回完全相同的 404
    if (!row || (a.projectId && a.projectId !== row.project_id)) return res.status(404).json({ error: 'NotFound' });
    res.json({ event: row });
  });

  const loadJob = (req: Request, res: Response) => {
    const job = db.prepare('SELECT * FROM observation_generation_jobs WHERE id = ? AND team_id = ?').get(req.params.id, auth(res).teamId) as
      { id: string; project_id: string; status: string; bullmq_job_id: string; retried_count: number } | undefined;
    if (!job) res.status(404).json({ error: 'NotFound' });
    return job;
  };

  app.post('/v1/jobs/:id/retry', writeAuth, (req: Request, res: Response) => {
    const job = loadJob(req, res);
    if (!job) return;
    if (job.status === 'queued') {
      // 与 claude-mem 一致：已经是 queued 的任务只记审计，不重新发布
      audit(res, 'generation_job.retried_by_operator', 'generation_job', job.id, job.project_id, { outcome: 'noop_already_queued' });
      return res.json({ generationJob: { id: job.id, status: job.status }, alreadyQueued: true });
    }
    if (job.status === 'processing' || job.status === 'completed') {
      // processing：让正在跑的 Worker 走完；completed：模型输出不确定，重跑会产生一套平行的观察
      return res.status(409).json({ error: 'Conflict', status: job.status });
    }
    db.prepare("UPDATE observation_generation_jobs SET status = 'queued', retried_count = retried_count + 1 WHERE id = ?").run(job.id);
    queue.remove(job.bullmq_job_id);
    const enqueueState = publish(job.bullmq_job_id);
    audit(res, 'generation_job.retried_by_operator', 'generation_job', job.id, job.project_id, { previousStatus: job.status, enqueueState });
    res.json({ generationJob: { id: job.id, status: 'queued', enqueueState }, retriedCount: job.retried_count + 1, alreadyQueued: false });
  });

  app.post('/v1/jobs/:id/cancel', writeAuth, (req: Request, res: Response) => {
    const job = loadJob(req, res);
    if (!job) return;
    if (job.status === 'completed') return res.status(409).json({ error: 'Conflict', status: job.status });
    db.prepare("UPDATE observation_generation_jobs SET status = 'cancelled' WHERE id = ?").run(job.id);
    audit(res, 'generation_job.cancelled_by_operator', 'generation_job', job.id, job.project_id, { previousStatus: job.status });
    res.json({ generationJob: { id: job.id, status: 'cancelled' } });
  });

  return app;
}
