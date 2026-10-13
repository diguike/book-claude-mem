/**
 * 用一个极简宿主跑一次“会话”，观察同步 / async Hook、resume、deny 和退出码策略
 * 运行：npm run demo
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Host, type HooksJson } from './host.js';

const here = import.meta.dirname;
const hook = (name: string) => [process.execPath, join(here, '..', 'hooks', name)];
const spoolDir = mkdtempSync(join(tmpdir(), 'ch05-spool-'));

// 结构与 claude-mem 的 plugin/hooks/hooks.json 一致（命令简化成直接调用 node）
const config: HooksJson = {
  SessionStart: [{ matcher: 'startup|clear|compact', hooks: [{ command: hook('context.mjs'), timeout: 60 }] }],
  UserPromptSubmit: [{ hooks: [{ command: hook('session-init-v13.mjs'), timeout: 15 }] }],
  PreToolUse: [{ matcher: 'Read|Bash|Grep|Glob', hooks: [{ command: hook('file-context.mjs'), timeout: 15 }] }],
  PostToolUse: [{ matcher: '*', hooks: [{ command: hook('observation.mjs'), timeout: 120, async: true }] }],
  PostToolUseFailure: [{ matcher: '*', hooks: [{ command: hook('observation.mjs'), timeout: 120, async: true }] }],
};

const host = new Host(config, { ...process.env, SPOOL_DIR: spoolDir });
const line = (label: string, text: string) => console.log(`  ${label.padEnd(30)} ${text}`);

console.log('=== 一次会话 ===');
const start = await host.fire('SessionStart', { source: 'startup' }, 'startup');
line('SessionStart(startup)', `等待 ${start.hostWaitMs} ms，注入 ${start.additionalContext.join('').length} 字符`);

const resume = await host.fire('SessionStart', { source: 'resume' }, 'resume');
line('SessionStart(resume)', `等待 ${resume.hostWaitMs} ms，没有 Hook 匹配，注入 0 字符`);

const prompt = await host.fire('UserPromptSubmit', { prompt: '修一下登录超时' });
line('UserPromptSubmit（v13 策略）', `等待 ${prompt.hostWaitMs} ms，blocked=${prompt.blocked}，stderr: ${prompt.stderr.join(' ')}`);

const smallRead = await host.fire('PreToolUse', { tool_name: 'Read', tool_input: { file_path: 'src/pool.ts', __size_bytes: 4_000 } }, 'Read');
line('PreToolUse(Read 4 KB)', `等待 ${smallRead.hostWaitMs} ms，附加上下文：${smallRead.additionalContext[0]}`);

const bigRead = await host.fire('PreToolUse', { tool_name: 'Read', tool_input: { file_path: 'src/server.ts', __size_bytes: 49_000 } }, 'Read');
line('PreToolUse(Read 49 KB)', `等待 ${bigRead.hostWaitMs} ms，deny：${bigRead.denied}`);

const partialRead = await host.fire('PreToolUse', { tool_name: 'Read', tool_input: { file_path: 'src/server.ts', __size_bytes: 49_000, offset: 120, limit: 40 } }, 'Read');
line('PreToolUse(Read 带 offset)', `等待 ${partialRead.hostWaitMs} ms，deny=${partialRead.denied ?? '无'}（局部读取永远放行）`);

for (let i = 1; i <= 3; i++) {
  const r = await host.fire('PostToolUse', { tool_name: 'Edit', tool_use_id: `toolu_0${i}`, tool_input: {}, tool_response: { ok: true } }, 'Edit');
  line(`PostToolUse #${i}（async）`, `等待 ${r.hostWaitMs} ms`);
}
const failed = await host.fire('PostToolUseFailure', { tool_name: 'Bash', tool_use_id: 'toolu_04', tool_input: { command: 'npm test' }, error: 'Exit code 1' }, 'Bash');
line('PostToolUseFailure（async）', `等待 ${failed.hostWaitMs} ms`);

const bg = await host.drainBackground();
line('后台 Hook 实际耗时', `${bg.map(b => `${b.ms} ms`).join(', ')}（宿主没有等它们）`);
line('spool 里的文件', readdirSync(spoolDir).join(', '));

console.log('\n=== 退出码策略对比：同一个内部 bug ===');
const v12 = new Host({ UserPromptSubmit: [{ hooks: [{ command: hook('session-init-v12.mjs'), timeout: 15 }] }] }, process.env);
const r12 = await v12.fire('UserPromptSubmit', { prompt: '修一下登录超时' });
line('v12：exit 2', `blocked=${r12.blocked} → 宿主丢弃这条用户 prompt`);
const v13 = new Host({ UserPromptSubmit: [{ hooks: [{ command: hook('session-init-v13.mjs'), timeout: 15 }] }] }, process.env);
const r13 = await v13.fire('UserPromptSubmit', { prompt: '修一下登录超时' });
line('v13：exit 0 + no-op', `blocked=${r13.blocked} → 会话照常进行，只是这一轮没有记忆`);

rmSync(spoolDir, { recursive: true, force: true });
