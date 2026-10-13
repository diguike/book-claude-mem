// UserPromptSubmit：v13 的做法，任何内部错误都返回 no-op 并以 0 退出
import { readInput } from './read-stdin.mjs';
await readInput();
try {
  throw new TypeError("Cannot read properties of undefined (reading 'project')");
} catch (e) {
  process.stderr.write(`claude-mem: hook error, continuing without memory: ${e.message}\n`);
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
  process.exit(0);
}
