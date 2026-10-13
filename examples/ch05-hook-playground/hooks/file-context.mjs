// PreToolUse（同步）：大文件的整文件 Read 被拒绝，引导去做局部读取；其他情况附加历史时间线
import { readInput } from './read-stdin.mjs';
const input = await readInput();
const ti = input.tool_input ?? {};
const fullRead = input.tool_name === 'Read' && ti.offset === undefined && ti.limit === undefined;
const bigFile = (ti.__size_bytes ?? 0) >= 32 * 1024; // 演示用：真实实现会 stat 文件
const out = fullRead && bigFile
  ? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny',
      permissionDecisionReason: `Full-file Read blocked: ${ti.file_path} is large and has prior observations. Use smart_outline, then Read with offset/limit.` } }
  : { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: `History for ${ti.file_path}: 42 ● 修复连接池泄漏` } };
process.stdout.write(JSON.stringify(out) + '\n');
