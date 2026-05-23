/**
 * PostToolUse Hook：捕获工具调用，存入 SQLite
 *
 * 触发时机：Claude 每次使用工具（读文件、写文件、执行命令等）后
 * 设计原则：快进快出，< 30ms 返回，永不阻塞 Claude Code
 */
import { readJsonFromStdin } from '../utils/stdin.js';
import { ObservationStore } from '../db/store.js';
import { extractTitle, categorize, extractFiles } from '../utils/title-extractor.js';

interface PostToolUseInput {
  session_id: string;
  cwd: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: Record<string, unknown>;
}

async function main() {
  // 静默 stderr，防止第三方库的 warning 污染 stdout JSON
  process.stderr.write = (() => true) as typeof process.stderr.write;

  try {
    const input = await readJsonFromStdin<PostToolUseInput>();
    const { session_id, cwd, tool_name, tool_input, tool_response } = input;

    // 提取标题和分类（规则提取，不调 AI）
    const title = extractTitle(tool_name, tool_input);
    const narrative = `${tool_name}: ${JSON.stringify(tool_input).slice(0, 200)}`;
    const project = cwd.split('/').pop() || 'unknown';

    // 存入数据库
    const store = new ObservationStore();
    store.insertObservation({
      sessionId: session_id,
      project,
      type: categorize(tool_name),
      title,
      narrative,
      files: extractFiles(tool_input),
    });
    store.close();

    // 返回 success（必须是合法 JSON）
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  } catch {
    // 永不阻塞 Claude Code——即使出错也返回 success
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

main();
