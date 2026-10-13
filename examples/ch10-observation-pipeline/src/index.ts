/**
 * ch10：Observation 流水线演示（对应 claude-mem v13 的各个环节，不调用模型）
 *
 *   过滤链 → 剥离标签 + 可选脱敏 → 观察者 prompt（字段头尾截断）
 *   → 解析观察者回复（容错）→ 按工具证据校正文件列表 → content_hash 去重 + 强化
 *
 * 运行：npm run demo
 */
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';

interface ToolEvent {
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResponse: unknown;
  promptIsPrivate?: boolean;
}

// ─── 1. 过滤链（src/services/worker/http/shared.ts ingestObservation） ───
const SKIP_TOOLS = new Set(['listmcpresourcestool', 'slashcommand', 'skill', 'todowrite', 'askuserquestion']);
const SKIP_BASH = /^(ls|pwd|cat)\b/; // CLAUDE_MEM_SKIP_BASH_PATTERNS 的示例值，默认为空

function filterReason(e: ToolEvent): string | null {
  if (/^mcp__.*(mem-search|claude-mem)/.test(e.toolName)) return 'claude-mem 自己的工具';
  if (SKIP_TOOLS.has(e.toolName.toLowerCase())) return '跳过列表';
  if (e.toolName === 'Bash' && SKIP_BASH.test(String(e.toolInput.command ?? ''))) return 'Bash 跳过模式';
  if (e.promptIsPrivate) return '本轮 prompt 整个是 <private>';
  return null;
}

// ─── 2. 剥离标签 + 可选脱敏（src/utils/tag-stripping.ts、redaction.ts） ───
const TAGS = ['private', 'claude-mem-context', 'system_instruction', 'system-instruction', 'persisted-output', 'system-reminder'];
const TAG_RE = new RegExp(`<(${TAGS.join('|')})\\b[^>]*>[\\s\\S]*?</\\1>`, 'g');
const REDACT = [
  { name: 'anthropic_key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'openai_key', re: /\bsk-(?!ant-)[A-Za-z0-9_-]{20,}\b/g },
  { name: 'aws_access_key', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'github_pat', re: /\bgh[oprs]_[A-Za-z0-9]{36}\b/g },
];
const MAX_REDACT_INPUT = 1024 * 1024;

function stripAndRedact(text: string, redactEnabled: boolean): string {
  const stripped = text.replace(TAG_RE, '').trim();
  if (!redactEnabled) return stripped;
  if (stripped.length > MAX_REDACT_INPUT) return "<redacted type='oversize'/>"; // 失败即封闭
  return REDACT.reduce((acc, p) => acc.replace(p.re, `<redacted type='${p.name}'/>`), stripped);
}

// ─── 3. 观察者 prompt：字段超长时保留头 60%、尾 30%（src/sdk/prompts.ts） ───
function truncateField(value: unknown, max = 400): string {
  const raw = JSON.stringify(value, null, 2) ?? '';
  if (raw.length <= max) return raw;
  const head = raw.slice(0, Math.floor(max * 0.6));
  const tail = raw.slice(-Math.floor(max * 0.3));
  return `${head}\n... <elided chars="${raw.length - head.length - tail.length}" original_size_chars="${raw.length}" reason="oversize" /> ...\n${tail}`;
}

function observationPrompt(e: ToolEvent): string {
  return `<observed_from_primary_session>
  <what_happened>${e.toolName}</what_happened>
  <parameters>${truncateField(e.toolInput)}</parameters>
  <outcome>${truncateField(e.toolResponse)}</outcome>
</observed_from_primary_session>
Return either one or more <observation>...</observation> blocks, or <skip_summary reason="noise" />.`;
}

// ─── 4. 解析观察者回复（src/sdk/parser.ts 的几种容错） ───
interface Parsed {
  type: string; title: string; narrative: string;
  facts: string[]; concepts: string[]; files_read: string[]; files_modified: string[];
}
const TYPES = new Set(['bugfix', 'feature', 'refactor', 'change', 'discovery', 'decision', 'security_alert', 'security_note', 'sensitive']);

function tag(block: string, name: string): string {
  return new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i').exec(block)?.[1].trim() ?? '';
}
function list(block: string, outer: string, inner: string): string[] {
  const body = tag(block, outer);
  return [...body.matchAll(new RegExp(`<${inner}>([\\s\\S]*?)</${inner}>`, 'gi'))].map(m => m[1].trim()).filter(Boolean);
}

function parseReply(reply: string): Parsed[] | 'skip' {
  if (/<skip_summary\b[^>]*\/>/i.test(reply)) return 'skip';
  const blocks = [...reply.matchAll(/<observation>([\s\S]*?)<\/observation>/gi)].map(m => m[1]); // 大小写不敏感
  return blocks.map(b => {
    const type = tag(b, 'type').toLowerCase();
    return {
      type: TYPES.has(type) ? type : 'discovery',
      title: tag(b, 'title'),
      narrative: tag(b, 'narrative'),
      facts: list(b, 'facts', 'fact'),
      // "keyword: description" 在第一个冒号处截断（v13.12.4）
      concepts: list(b, 'concepts', 'concept').map(c => (c.includes(':') ? c.slice(0, c.indexOf(':')) : c).trim()),
      files_read: list(b, 'files_read', 'file'),
      files_modified: list(b, 'files_modified', 'file'),
    };
  }).filter(o => o.title); // 空标题不入库
}

// ─── 5. 文件列表按工具证据校正（src/services/worker/agents/ResponseProcessor.ts） ───
const WRITE_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit', 'write_file']);
function evidence(batch: ToolEvent[]): { read: string[]; modified: string[] } {
  const read = new Set<string>(); const modified = new Set<string>();
  for (const e of batch) {
    const file = String(e.toolInput.file_path ?? '');
    if (!file) continue;
    if (e.toolName === 'Read') read.add(file);
    if (WRITE_TOOLS.has(e.toolName)) modified.add(file);
  }
  return { read: [...read], modified: [...modified] };
}

// ─── 6. 入库：content_hash 唯一约束，重复时强化已有记录（SessionStore.storeObservations） ───
const db = new Database(':memory:');
db.exec(`CREATE TABLE observations (
  id INTEGER PRIMARY KEY, memory_session_id TEXT, type TEXT, title TEXT, narrative TEXT,
  concepts TEXT, files_read TEXT, files_modified TEXT, content_hash TEXT, reinforcement_dates TEXT,
  UNIQUE (memory_session_id, content_hash))`);
const hash = (s: string, t: string, n: string) => createHash('sha256').update([s, t, n].join('\x00')).digest('hex').slice(0, 16);

function store(sessionId: string, o: Parsed, day: string): string {
  const h = hash(sessionId, o.title, o.narrative);
  const inserted = db.prepare(`INSERT INTO observations
    (memory_session_id, type, title, narrative, concepts, files_read, files_modified, content_hash, reinforcement_dates)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(memory_session_id, content_hash) DO NOTHING RETURNING id`)
    .get(sessionId, o.type, o.title, o.narrative, JSON.stringify(o.concepts), JSON.stringify(o.files_read),
      JSON.stringify(o.files_modified), h, JSON.stringify([day])) as { id: number } | undefined;
  if (inserted) return `新增 #${inserted.id}`;
  const row = db.prepare('SELECT id, reinforcement_dates FROM observations WHERE memory_session_id = ? AND content_hash = ?').get(sessionId, h) as { id: number; reinforcement_dates: string };
  const dates = JSON.parse(row.reinforcement_dates) as string[];
  if (!dates.includes(day)) dates.push(day);
  db.prepare('UPDATE observations SET reinforcement_dates = ? WHERE id = ?').run(JSON.stringify(dates.slice(-10)), row.id);
  return `重复，强化 #${row.id} → ${dates.join(', ')}`;
}

// ─── 演示 ───
const events: ToolEvent[] = [
  { sessionId: 'mem-1', toolName: 'Read', toolInput: { file_path: 'src/auth.ts' }, toolResponse: { content: 'export function sign() {}'.repeat(40) } },
  { sessionId: 'mem-1', toolName: 'Edit', toolInput: { file_path: 'src/auth.ts', new_string: 'const key = "sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA"' }, toolResponse: { success: true } },
  { sessionId: 'mem-1', toolName: 'Bash', toolInput: { command: 'ls -la' }, toolResponse: 'total 8' },
  { sessionId: 'mem-1', toolName: 'TodoWrite', toolInput: {}, toolResponse: {} },
  { sessionId: 'mem-1', toolName: 'Bash', toolInput: { command: 'npm test <private>DB_PASSWORD=hunter2</private>' }, toolResponse: { error: 'Exit code 1', is_interrupt: false } },
];

console.log('=== 1. 过滤链 ===');
const kept = events.filter(e => {
  const reason = filterReason(e);
  console.log(`  ${e.toolName.padEnd(9)} ${reason ? `跳过：${reason}` : '保留'}`);
  return !reason;
});

console.log('\n=== 2. 剥离标签 + 脱敏（CLAUDE_MEM_REDACT_ENABLED=true） ===');
const cleaned = kept.map(e => ({
  ...e,
  toolInput: JSON.parse(stripAndRedact(JSON.stringify(e.toolInput), true)),
  toolResponse: JSON.parse(stripAndRedact(JSON.stringify(e.toolResponse), true)),
}));
for (const e of cleaned) console.log(`  ${e.toolName}: ${JSON.stringify(e.toolInput)}`);
console.log(`  超长字段：${stripAndRedact('x'.repeat(MAX_REDACT_INPUT + 1), true)}`);

console.log('\n=== 3. 观察者 prompt（第 1 条，outcome 被头尾截断） ===');
console.log(observationPrompt(cleaned[0]).split('\n').map(l => '  ' + l).join('\n'));

console.log('\n=== 4. 解析一段“不守规矩”的观察者回复 ===');
const reply = `<OBSERVATION>
  <type>bugfix</type>
  <title>auth 模块签名改用环境变量里的密钥</title>
  <narrative>Edit 把硬编码密钥换成读取环境变量；随后 npm test 失败。</narrative>
  <facts><fact>测试以 Exit code 1 失败</fact></facts>
  <concepts><concept>gotcha: 密钥不能硬编码</concept><concept>problem-solution</concept></concepts>
  <files_read><file>src/auth.ts</file></files_read>
  <files_modified><file>src/auth.ts</file><file>src/config.ts</file></files_modified>
</OBSERVATION>`;
const parsed = parseReply(reply);
if (parsed === 'skip') throw new Error('unexpected skip');
console.log(`  解析出 ${parsed.length} 条；concepts = ${JSON.stringify(parsed[0].concepts)}`);
console.log(`  模型声称修改了：${JSON.stringify(parsed[0].files_modified)}`);
console.log(`  <skip_summary reason="noise" /> 的解析结果：${parseReply('<skip_summary reason="noise" />')}`);

console.log('\n=== 5. 按工具证据校正文件列表 ===');
const ev = evidence(kept);
const corrected = parsed.map(o => ({ ...o, files_read: [...new Set([...ev.read, ...o.files_read])], files_modified: ev.modified }));
console.log(`  files_modified 改为真实写操作：${JSON.stringify(corrected[0].files_modified)}（src/config.ts 没有对应的写操作，被丢弃）`);

console.log('\n=== 6. 入库：同一会话内的重复观察变成强化 ===');
console.log(`  ${store('mem-1', corrected[0], '2026-10-10')}`);
console.log(`  ${store('mem-1', corrected[0], '2026-10-12')}`);
console.log(`  ${store('mem-2', corrected[0], '2026-10-12')}（另一个会话，哈希不同，独立保存）`);
db.close();
