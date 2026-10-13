/**
 * 可校验的审计日志：在 claude-mem audit_log 的字段之上加一条哈希链（设计示例）
 *
 * claude-mem Server 的 audit_log 是普通的 Postgres 表，有写权限的人可以改历史行，事后无从察觉。
 * 哈希链让每一行都包含上一行的哈希，改动任意一行，从这一行起的校验全部失败。
 * 运行：npm run demo:audit
 */
import { createHash, randomUUID } from 'node:crypto';

interface AuditRow {
  seq: number;
  team_id: string;
  project_id: string | null;
  api_key_id: string | null;
  actor_id: string | null;
  request_id: string;
  action: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  prev_hash: string;
  hash: string;
}

const GENESIS = '0'.repeat(64);

class ChainedAuditLog {
  readonly rows: AuditRow[] = [];

  append(entry: Omit<AuditRow, 'seq' | 'created_at' | 'prev_hash' | 'hash'>, at: Date): AuditRow {
    const seq = this.rows.length + 1;
    const prev_hash = this.rows.at(-1)?.hash ?? GENESIS;
    const base = { ...entry, seq, created_at: at.toISOString(), prev_hash };
    const row = { ...base, hash: digest(base) };
    this.rows.push(row);
    return row;
  }

  /** 从头重算哈希，返回第一处不一致的行号；全部一致返回 null */
  verify(): number | null {
    let prev = GENESIS;
    for (const row of this.rows) {
      const { hash, ...base } = row;
      if (row.prev_hash !== prev || digest(base) !== hash) return row.seq;
      prev = hash;
    }
    return null;
  }
}

// 键排序后序列化，保证同一内容永远得到同一个哈希
function digest(value: object): string {
  const canonical = JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
  return createHash('sha256').update(canonical).digest('hex');
}

const log = new ChainedAuditLog();
const t0 = Date.parse('2026-10-12T09:00:00Z');
const req1 = randomUUID();
const req2 = randomUUID();
const base = { team_id: 'team_acme', project_id: 'proj_shop', api_key_id: 'key_ci', actor_id: 'system:ci' };

log.append({ ...base, request_id: req1, action: 'event.received', resource_id: 'evt_1', details: { eventType: 'tool_use' } }, new Date(t0));
log.append({ ...base, request_id: req1, action: 'generation_job.completed', resource_id: 'job_1', details: { observationCount: 1 } }, new Date(t0 + 2_000));
log.append({ ...base, api_key_id: 'key_alice', actor_id: 'human:alice', request_id: req2, action: 'observation.read', resource_id: null, details: { mode: 'search', query: 'payment webhook' } }, new Date(t0 + 60_000));
log.append({ ...base, api_key_id: 'key_alice', actor_id: 'human:alice', request_id: randomUUID(), action: 'project.memory_purged', resource_id: 'proj_shop', details: { observations: 412, agentEvents: 1380 } }, new Date(t0 + 120_000));

console.log('=== 审计日志 ===');
for (const r of log.rows) console.log(`  #${r.seq} ${r.created_at.slice(11, 19)} ${r.actor_id?.padEnd(12)} ${r.action.padEnd(26)} ${r.hash.slice(0, 12)}…`);
console.log(`\n校验：${log.verify() ?? '全部一致'}`);

console.log('\n=== 按 request_id 串起一次请求 ===');
for (const r of log.rows.filter(r => r.request_id === req1)) console.log(`  ${r.action}`);

console.log('\n=== 有人改掉了第 4 行，想掩盖清空项目的操作 ===');
log.rows[3].action = 'observation.read';
console.log(`校验：第 ${log.verify()} 行起不一致`);

console.log('\n=== 连哈希一起重算第 4 行 ===');
const { hash: _old, ...forged } = log.rows[3];
log.rows[3].hash = digest(forged);
console.log(`校验：${log.verify() ?? '全部一致'}  ← 链尾被整体重写时，单靠哈希链发现不了`);
console.log('应对：定期把最新一行的哈希写到别处（另一个库、对象存储的不可变桶、工单系统），校验时比对。');
