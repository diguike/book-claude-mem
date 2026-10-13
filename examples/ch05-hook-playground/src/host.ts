/**
 * 一个极简的“宿主”：按 Claude Code 的规则执行 Hook（第 5 章）
 *
 * - 按事件名和 matcher（正则）找到要执行的 Hook
 * - 每个 Hook 是一个独立进程，stdin 传 JSON，stdout 读 JSON
 * - 同步 Hook：宿主等待，按超时杀掉；退出码 2 视为“阻断”，0 时解析 stdout
 * - async Hook：宿主不等待，记录到后台列表，结束前统一收尾
 */
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

export interface HookConfig { command: string[]; timeout: number; async?: boolean }
export interface HookEntry { matcher?: string; hooks: HookConfig[] }
export type HooksJson = Record<string, HookEntry[]>;

export interface HookOutcome {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  ms: number;
}

export interface EventResult {
  hostWaitMs: number;                  // 宿主在这个事件上等待了多久
  blocked: boolean;                    // 有同步 Hook 以 2 退出
  denied?: string;                     // PreToolUse 返回了 deny
  additionalContext: string[];
  stderr: string[];
}

function run(cmd: string[], input: unknown, timeoutSec: number, env: NodeJS.ProcessEnv): Promise<HookOutcome> {
  return new Promise(resolve => {
    const start = performance.now();
    const child = spawn(cmd[0], cmd.slice(1), { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => (stdout += d));
    child.stderr.on('data', d => (stderr += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutSec * 1000);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, ms: Math.round(performance.now() - start) });
    });
    child.stdin.end(JSON.stringify(input));
  });
}

export class Host {
  readonly background: Promise<HookOutcome>[] = [];

  constructor(private readonly config: HooksJson, private readonly env: NodeJS.ProcessEnv) {}

  private matching(event: string, subject: string | undefined): HookConfig[] {
    return (this.config[event] ?? [])
      .filter(e => !e.matcher || e.matcher === '*' || (subject !== undefined && new RegExp(`^(?:${e.matcher})$`).test(subject)))
      .flatMap(e => e.hooks);
  }

  async fire(event: string, input: Record<string, unknown>, subject?: string): Promise<EventResult> {
    const start = performance.now();
    const result: EventResult = { hostWaitMs: 0, blocked: false, additionalContext: [], stderr: [] };
    const payload = { hook_event_name: event, ...input };
    for (const hook of this.matching(event, subject)) {
      if (hook.async) {
        this.background.push(run(hook.command, payload, hook.timeout, this.env));
        continue;
      }
      const out = await run(hook.command, payload, hook.timeout, this.env);
      if (out.stderr) result.stderr.push(out.stderr.trim());
      if (out.exitCode === 2) {
        result.blocked = true;
        continue;
      }
      if (out.exitCode !== 0) continue; // 非阻断错误：stderr 展示给用户，继续
      try {
        const json = JSON.parse(out.stdout.trim().split('\n').pop() ?? '{}');
        const specific = json.hookSpecificOutput ?? {};
        if (specific.permissionDecision === 'deny') result.denied = specific.permissionDecisionReason;
        if (specific.additionalContext) result.additionalContext.push(specific.additionalContext);
      } catch {
        // stdout 不是合法 JSON：宿主忽略这个 Hook 的输出
      }
    }
    result.hostWaitMs = Math.round(performance.now() - start);
    return result;
  }

  async drainBackground(): Promise<HookOutcome[]> {
    return Promise.all(this.background.splice(0));
  }
}
