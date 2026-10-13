/**
 * 第 18 章演示：同一个引擎 + 两份 schema，读两种宿主的会话日志
 * 运行：npm run demo
 */
import { appendFileSync, copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TranscriptTail, type TranscriptSchema, type UnifiedEvent } from './engine.js';

const here = import.meta.dirname;
const schema = (name: string) => JSON.parse(readFileSync(join(here, '..', 'schemas', `${name}.json`), 'utf-8')) as TranscriptSchema;
const work = mkdtempSync(join(tmpdir(), 'ch18-'));
const fixture = (name: string) => {
  const dst = join(work, name);
  copyFileSync(join(here, '..', 'fixtures', name), dst);
  return dst;
};

const show = (e: UnifiedEvent) => {
  if (e.kind === 'prompt') return `prompt       [${e.sessionId}] ${e.text}`;
  if (e.kind === 'observation') return `observation  [${e.sessionId}] ${e.toolName} → ${String(e.toolResponse).slice(0, 48)}`;
  return `summarize    [${e.sessionId}] ${e.lastAssistantMessage ?? ''}`;
};
const accept = (e: UnifiedEvent) => { console.log(`  ${show(e)}`); return true; };

console.log('[1] Codex 会话日志（schemas/codex.json）');
const codex = new TranscriptTail(schema('codex'), join(work, 'state-codex.json'));
codex.poll(fixture('codex-rollout.jsonl'), accept);

console.log('\n[2] DSH 会话日志（schemas/dsh.json），引擎代码完全相同');
const dsh = new TranscriptTail(schema('dsh'), join(work, 'state-dsh.json'));
const dshFile = fixture('dsh-session.jsonl');
dsh.poll(dshFile, accept);

console.log('\n[3] 日志继续增长：从上次的偏移接着读，旧行不重发');
appendFileSync(dshFile, [
  '{"type":"tool/call","data":{"callId":"c2","name":"run","arguments":{"cmd":"npm test"}}}',
  '{"type":"tool/result","data":{"message":{"content":[{"toolCallId":"c2","content":[{"type":"text","text":"Tests: 51 passed"}]}]}}}',
].join('\n') + '\n');
dsh.poll(dshFile, accept);

console.log('\n[4] 下游拒收（Worker 没起来）：检查点停在这一行，恢复后从这一行重试');
appendFileSync(dshFile, '{"type":"tool/call","data":{"callId":"c3","name":"read_file","arguments":{"path":"README.md"}}}\n'
  + '{"type":"tool/result","data":{"message":{"content":[{"toolCallId":"c3","content":[{"type":"text","text":"# shop"}]}]}}}\n');
const down = dsh.poll(dshFile, () => false);
console.log(`  Worker 离线：投递 ${down.delivered} 条，停在字节偏移 ${down.stoppedAt}`);
const up = dsh.poll(dshFile, accept);
console.log(`  Worker 恢复：投递 ${up.delivered} 条`);

console.log('\n[5] 单写者：Codex 原生 Hook 已经记录顶层会话，transcript 只补子代理会话');
const scoped = new TranscriptTail(schema('codex'), join(work, 'state-scoped.json'));
const opt = { subagentOnly: { path: 'payload.source.subagent.thread_spawn' } };
const top = scoped.poll(fixture('codex-rollout.jsonl'), accept, opt);
console.log(`  顶层会话 codex-rollout.jsonl：投递 ${top.delivered} 条（交给原生 Hook）`);
const sub = scoped.poll(fixture('codex-subagent.jsonl'), accept, opt);
console.log(`  子代理会话 codex-subagent.jsonl：投递 ${sub.delivered} 条`);

rmSync(work, { recursive: true, force: true });
