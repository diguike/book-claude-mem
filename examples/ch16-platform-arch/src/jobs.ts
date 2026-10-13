/** 确定性任务 ID + 进程内队列（模拟 BullMQ 的 jobId 去重）+ 生成 Worker */
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

/** src/server/jobs/job-id.ts：同一来源永远得到同一个 ID；不含 ':'（BullMQ 用它做键分隔符） */
export function buildJobId(parts: { kind: 'event' | 'summary'; team_id: string; project_id: string; source_type: string; source_id: string }): string {
  const prefix = parts.kind === 'event' ? 'evt' : 'sum';
  return `${prefix}_${createHash('sha256').update(JSON.stringify(parts)).digest('hex')}`;
}

export class InProcessQueue {
  private readonly ids = new Set<string>();
  readonly waiting: string[] = [];
  failNextPublish = false; // 模拟 Redis 暂时不可用

  add(jobId: string): 'enqueued' | 'duplicate' {
    if (this.failNextPublish) {
      this.failNextPublish = false;
      throw new Error('ECONNREFUSED redis');
    }
    if (this.ids.has(jobId)) return 'duplicate'; // BullMQ 对相同 jobId 不会重复入队
    this.ids.add(jobId);
    this.waiting.push(jobId);
    return 'enqueued';
  }

  /** 运维重试前先移除旧槽位（真实代码里是 queue.remove，失败也忽略） */
  remove(jobId: string): void {
    this.ids.delete(jobId);
  }

  /** 模拟 BullMQ 把同一个任务再投递一次（例如 stalled 之后的重投） */
  redeliver(jobId: string): void {
    this.waiting.push(jobId);
  }
}

/** 生成 Worker：先把发件箱行从 queued 锁成 processing，已在 processing 的直接跳过，避免同一任务付两次模型费用 */
export function processOne(db: Database.Database, bullmqJobId: string, generate: (payload: string) => string): string {
  const job = db.prepare('SELECT id, project_id, team_id, agent_event_id, status FROM observation_generation_jobs WHERE bullmq_job_id = ?').get(bullmqJobId) as
    { id: string; project_id: string; team_id: string; agent_event_id: string; status: string } | undefined;
  if (!job) return 'missing';
  if (job.status !== 'queued') return `skip(${job.status})`;
  const locked = db.prepare("UPDATE observation_generation_jobs SET status = 'processing', attempts = attempts + 1 WHERE id = ? AND status = 'queued'").run(job.id);
  if (locked.changes === 0) return 'skip(raced)';
  const event = db.prepare('SELECT payload FROM agent_events WHERE id = ? AND project_id = ? AND team_id = ?').get(job.agent_event_id, job.project_id, job.team_id) as { payload: string };
  db.transaction(() => {
    db.prepare('INSERT INTO observations (project_id, team_id, content, created_by_job_id) VALUES (?, ?, ?, ?)')
      .run(job.project_id, job.team_id, generate(event.payload), job.id);
    db.prepare("UPDATE observation_generation_jobs SET status = 'completed' WHERE id = ?").run(job.id);
  })();
  return 'completed';
}
