// UserPromptSubmit：模拟 v12 的错误处理，内部 bug 时以 2 退出
import { readInput } from './read-stdin.mjs';
await readInput();
try {
  throw new TypeError("Cannot read properties of undefined (reading 'project')");
} catch (e) {
  process.stderr.write(`hook error: ${e.message}\n`);
  process.exit(2);
}
