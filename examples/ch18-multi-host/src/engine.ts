/**
 * 声明式 transcript 引擎：用 JSON schema 描述“某个宿主的日志一行长什么样”，
 * 同一份代码就能把 Codex、DSH 等不同宿主的会话日志翻译成统一的事件。
 * match 规则与字段写法对照 claude-mem v13.35.0 的 src/services/transcripts/（types.ts、field-utils.ts）
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export type FieldSpec = string | { path?: string; value?: unknown; coalesce?: FieldSpec[]; default?: unknown };

export interface MatchRule {
  path?: string;
  equals?: unknown; not_equals?: unknown;
  in?: unknown[]; not_in?: unknown[];
  exists?: boolean;
  starts_with?: string; not_starts_with?: string;
  contains?: string; regex?: string;
  all?: MatchRule[]; any?: MatchRule[];
}

export type EventAction = 'session_init' | 'session_context' | 'user_message' | 'assistant_message'
  | 'tool_use' | 'tool_result' | 'observation' | 'file_edit' | 'session_end';

export interface TranscriptSchema {
  name: string;
  events: Array<{ name: string; match?: MatchRule; action: EventAction; fields?: Record<string, FieldSpec> }>;
}

/** 统一后的事件：这就是 Worker 收到的东西，和宿主无关 */
export type UnifiedEvent =
  | { kind: 'prompt'; sessionId: string; cwd?: string; text: string }
  | { kind: 'observation'; sessionId: string; cwd?: string; toolName: string; toolInput: unknown; toolResponse: unknown }
  | { kind: 'summarize'; sessionId: string; lastAssistantMessage?: string };

// "payload.content[0].text" → ['payload', 'content', 0, 'text']
export function getValueByPath(input: unknown, path: string): unknown {
  const tokens: Array<string | number> = [];
  for (const part of path.replace(/^\$\.?/, '').split('.')) {
    for (const m of part.matchAll(/([^[\]]+)|\[(\d+)\]/g)) tokens.push(m[1] ?? Number(m[2]));
  }
  let cur: any = input;
  for (const t of tokens) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[t];
  }
  return cur;
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === '';

export function resolveField(spec: FieldSpec, line: unknown): unknown {
  if (typeof spec === 'string') return getValueByPath(line, spec);
  if ('value' in spec) return spec.value;
  if (spec.coalesce) {
    for (const s of spec.coalesce) {
      const v = resolveField(s, line);
      if (!isEmpty(v)) return v; // 取第一个非空的候选
    }
  }
  const v = spec.path ? getValueByPath(line, spec.path) : undefined;
  return isEmpty(v) ? spec.default : v;
}

export function matchesRule(line: unknown, rule: MatchRule | undefined): boolean {
  if (!rule) return true;
  if (rule.all && !rule.all.every(r => matchesRule(line, r))) return false;
  if (rule.any && !rule.any.some(r => matchesRule(line, r))) return false;
  if (!rule.path) return true;
  const v = getValueByPath(line, rule.path);
  if (rule.exists !== undefined && (v !== undefined && v !== null) !== rule.exists) return false;
  if ('equals' in rule && v !== rule.equals) return false;
  if ('not_equals' in rule && v === rule.not_equals) return false;
  if (rule.in && !rule.in.includes(v)) return false;
  if (rule.not_in && rule.not_in.includes(v)) return false;
  const s = typeof v === 'string' ? v : undefined;
  if (rule.starts_with !== undefined && !s?.startsWith(rule.starts_with)) return false;
  if (rule.not_starts_with !== undefined && s?.startsWith(rule.not_starts_with)) return false;
  if (rule.contains !== undefined && !s?.includes(rule.contains)) return false;
  if (rule.regex !== undefined && !(s !== undefined && new RegExp(rule.regex).test(s))) return false;
  return true;
}

interface SessionState { sessionId: string; cwd?: string; lastAssistant?: string; pendingTools: Record<string, { toolName: string; toolInput: unknown }> }

/** 把一行日志翻译成 0 个或 1 个统一事件；会话级状态（cwd、未配对的工具调用）留在 session 里 */
export function processLine(schema: TranscriptSchema, line: unknown, session: SessionState): UnifiedEvent | null {
  const ev = schema.events.find(e => matchesRule(line, e.match)); // 第一条命中的规则生效
  if (!ev) return null;
  const f: Record<string, any> = {};
  for (const [k, spec] of Object.entries(ev.fields ?? {})) f[k] = resolveField(spec, line);
  const { sessionId, cwd } = session;
  switch (ev.action) {
    case 'session_context':
      if (f.sessionId) session.sessionId = String(f.sessionId);
      if (f.cwd) session.cwd = String(f.cwd);
      return null;
    case 'session_init':
    case 'user_message': {
      const text = f.prompt ?? f.message;
      return typeof text === 'string' ? { kind: 'prompt', sessionId, cwd, text } : null;
    }
    case 'assistant_message':
      if (typeof f.message === 'string') session.lastAssistant = f.message;
      return null;
    case 'tool_use':
      session.pendingTools[String(f.toolId)] = { toolName: String(f.toolName), toolInput: f.toolInput };
      return null;
    case 'tool_result': {
      // 调用和结果在日志里是两行，按 toolId 配对后才是一条完整的观察
      const pending = session.pendingTools[String(f.toolId)];
      if (!pending) return null;
      delete session.pendingTools[String(f.toolId)];
      return { kind: 'observation', sessionId, cwd, toolName: pending.toolName, toolInput: pending.toolInput, toolResponse: f.toolResponse };
    }
    case 'observation':
      return { kind: 'observation', sessionId, cwd, toolName: String(f.toolName), toolInput: f.toolInput, toolResponse: f.toolResponse };
    case 'session_end':
      return { kind: 'summarize', sessionId, lastAssistantMessage: session.lastAssistant };
    default:
      return null;
  }
}

/**
 * 增量读取：从上次的字节偏移继续，每一行被下游接受之后才推进检查点。
 * 下游拒绝时停在这一行，下次从这一行重试，不会丢，也不会把前面的行重发。
 */
export class TranscriptTail {
  constructor(private readonly schema: TranscriptSchema, private readonly statePath: string) {}

  private loadState(): { offsets: Record<string, number>; sessions: Record<string, SessionState> } {
    return existsSync(this.statePath) ? JSON.parse(readFileSync(this.statePath, 'utf-8')) : { offsets: {}, sessions: {} };
  }

  poll(file: string, deliver: (e: UnifiedEvent) => boolean, opts: { subagentOnly?: { path: string } } = {}): { delivered: number; stoppedAt?: number } {
    const state = this.loadState();
    const buf = readFileSync(file);
    let offset = state.offsets[file] ?? 0;
    const session: SessionState = state.sessions[file] ?? { sessionId: file.split('/').pop()!.replace(/\.jsonl$/, ''), pendingTools: {} };
    let delivered = 0;
    let stoppedAt: number | undefined;
    while (offset < buf.length) {
      const nl = buf.indexOf(0x0a, offset);
      if (nl === -1) break; // 最后一行还没写完，等下次
      const line = JSON.parse(buf.subarray(offset, nl).toString('utf-8'));
      // 单写者：宿主的原生 Hook 已经记录顶层会话时，transcript 只补子代理会话
      if (opts.subagentOnly && getValueByPath(line, 'type') === 'session_meta' && getValueByPath(line, opts.subagentOnly.path) === undefined) {
        offset = buf.length;
        break;
      }
      // 先备份会话状态：下游拒收时连同“已配对掉的工具调用”一起回滚，
      // 否则重试时结果行找不到它的调用行
      const before = structuredClone(session);
      const ev = processLine(this.schema, line, session);
      if (ev && !deliver(ev)) {
        Object.assign(session, before);
        stoppedAt = offset;
        break;
      }
      if (ev) delivered++;
      offset = nl + 1;
    }
    state.offsets[file] = offset;
    state.sessions[file] = session; // 未配对的工具调用也要存下来，重启后结果行才能配上
    writeFileSync(this.statePath, JSON.stringify(state, null, 2));
    return { delivered, stoppedAt };
  }
}
