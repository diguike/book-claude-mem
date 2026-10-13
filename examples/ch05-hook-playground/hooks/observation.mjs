// PostToolUse / PostToolUseFailure（async）：把事件写进 spool 文件就退出
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readInput } from './read-stdin.mjs';
const input = await readInput();
const dir = process.env.SPOOL_DIR;
mkdirSync(dir, { recursive: true });
const name = `observation-${input.tool_use_id ?? Date.now()}.json`;
const tmp = join(dir, `.${name}.tmp`);
writeFileSync(tmp, JSON.stringify({ event: input.hook_event_name, tool: input.tool_name, error: input.error }));
renameSync(tmp, join(dir, name));
// 模拟一个慢操作：宿主对 async Hook 不等待，用户感觉不到这 300 ms
await new Promise(r => setTimeout(r, 300));
process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
