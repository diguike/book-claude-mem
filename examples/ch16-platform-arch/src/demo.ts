/**
 * 第 16 章演示：多租户 + 发件箱 + 确定性任务 ID + 运维重试
 * 运行：npm run demo（随机端口，跑完自动退出）
 */
import type { AddressInfo } from 'node:net';
import { openDb } from './db.js';
import { createApiKey } from './auth.js';
import { InProcessQueue, processOne } from './jobs.js';
import { createApp } from './app.js';

const db = openDb();
db.prepare("INSERT INTO teams VALUES ('team_acme', 'Acme'), ('team_globex', 'Globex')").run();
db.prepare("INSERT INTO projects VALUES ('proj_shop', 'team_acme', 'shop'), ('proj_crm', 'team_globex', 'crm')").run();

const acmeWriter = createApiKey(db, { teamId: 'team_acme', actorId: 'ci-bot', scopes: ['memories:read', 'memories:write'] });
const acmeReader = createApiKey(db, { teamId: 'team_acme', projectId: 'proj_shop', actorId: 'dashboard', scopes: ['memories:read'] });
const globexWriter = createApiKey(db, { teamId: 'team_globex', actorId: 'globex-bot', scopes: ['memories:read', 'memories:write'] });

const queue = new InProcessQueue();
const server = createApp(db, queue).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

async function call(method: string, path: string, key: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() as any };
}
const fakeGenerate = (payload: string) => `观察：${JSON.parse(payload).tool} 执行完成`;
const drain = () => queue.waiting.splice(0).map(id => `${id.slice(0, 12)}… → ${processOne(db, id, fakeGenerate)}`);
const show = (label: string, value: unknown) => console.log(`  ${label}：${typeof value === 'string' ? value : JSON.stringify(value)}`);

const event = { projectId: 'proj_shop', sourceType: 'hook', contentSessionId: 'sess-1', eventType: 'tool_use', occurredAtEpoch: 1_791_790_000_000, payload: { tool: 'Edit' } };

console.log('[1] 写入事件：事件行 + 发件箱行同一事务，提交后发布');
const first = await call('POST', '/v1/events', acmeWriter, event);
show('首次 POST', first.json.generationJob);
show('确定性任务 ID', queue.waiting[0]);

console.log('\n[2] 客户端超时，把同一个 body 原样重发');
const again = await call('POST', '/v1/events', acmeWriter, event);
show('第二次 POST 的事件 ID 相同', again.json.event.id === first.json.event.id);
show('队列里的任务数', queue.waiting.length);
const later = await call('POST', '/v1/events', acmeWriter, { ...event, occurredAtEpoch: event.occurredAtEpoch + 1 });
show('occurredAt 差 1 ms 的事件 ID 相同', later.json.event.id === first.json.event.id);
show('Worker 处理', drain());

console.log('\n[3] BullMQ 把已完成的任务又投递了一次');
const { bullmq_job_id } = db.prepare('SELECT bullmq_job_id FROM observation_generation_jobs WHERE id = ?').get(first.json.generationJob.id) as { bullmq_job_id: string };
queue.redeliver(bullmq_job_id);
show('Worker 处理', drain());
show('observations 行数', (db.prepare('SELECT count(*) AS n FROM observations').get() as any).n);

console.log('\n[4] 租户隔离与作用域');
show('Globex 读 Acme 的事件', (await call('GET', `/v1/events/${first.json.event.id}`, globexWriter)).status);
show('Globex 读不存在的事件', (await call('GET', '/v1/events/no-such-id', globexWriter)).status);
show('Globex 往 Acme 的项目写', (await call('POST', '/v1/events', globexWriter, { ...event, occurredAtEpoch: 1 })).status);
show('只读 key 写事件', (await call('POST', '/v1/events', acmeReader, { ...event, occurredAtEpoch: 2 })).status);
show('只读 key 读事件', (await call('GET', `/v1/events/${first.json.event.id}`, acmeReader)).status);
try {
  db.prepare("INSERT INTO agent_events VALUES ('evil', 'proj_crm', 'team_acme', 'k', 'tool_use', '{}')").run();
} catch (e) {
  show('绕过 API 直接写错配的租户', (e as Error).message);
}

console.log('\n[5] 任务没有送达队列：Redis 故障期间进程崩溃，重启后没有启动对账');
queue.failNextPublish = true;
const lost = await call('POST', '/v1/events', acmeWriter, { ...event, occurredAtEpoch: 3, payload: { tool: 'Bash' } });
const jobId = lost.json.generationJob.id;
show('POST 结果', lost.json.generationJob);
show('直接 retry', (await call('POST', `/v1/jobs/${jobId}/retry`, acmeWriter)).json);
show('先 cancel', (await call('POST', `/v1/jobs/${jobId}/cancel`, acmeWriter)).json.generationJob);
show('再 retry', (await call('POST', `/v1/jobs/${jobId}/retry`, acmeWriter)).json);
show('Worker 处理', drain());
show('对已完成任务 retry', (await call('POST', `/v1/jobs/${jobId}/retry`, acmeWriter)).status);

console.log('\n[6] 审计日志');
for (const row of db.prepare('SELECT action, resource_type, details FROM audit_log ORDER BY id').all() as any[]) {
  console.log(`  ${row.action.padEnd(38)} ${row.details}`);
}

server.close();
