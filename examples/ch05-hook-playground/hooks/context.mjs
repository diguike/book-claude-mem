// SessionStart（同步）：注入上下文；resume 恢复的会话不注入，保护 prompt cache 前缀
import { readInput } from './read-stdin.mjs';
const input = await readInput();
const additionalContext = input.source === 'resume'
  ? ''
  : '# [demo] recent context\n41 3:15p ⚖ 用 jsonb 存 metadata\n42 4:02p ● 修复连接池泄漏';
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }) + '\n');
