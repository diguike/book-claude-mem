/**
 * PostToolUse / PostToolUseFailure Hook：捕获工具调用，写入 SQLite
 *
 * hooks.json 里标了 "async": true，Claude Code 不等它返回
 * 任何错误都以退出码 0 结束，绝不阻塞会话
 */
import { readJsonFromStdin } from '../utils/stdin.js';
import { ObservationStore } from '../db/store.js';
import { extractTitle, categorize, extractFiles, shouldSkipTool } from '../utils/title-extractor.js';
import { projectNameOf } from '../utils/project.js';

interface ToolHookInput {
  session_id: string;
  cwd: string;
  hook_event_name?: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response?: unknown;
  error?: unknown;          // PostToolUseFailure 才有
  is_interrupt?: boolean;   // PostToolUseFailure 才有
}

async function main(): Promise<void> {
  try {
    const input = await readJsonFromStdin<ToolHookInput>();
    const { session_id, cwd, tool_name } = input;
    const toolInput = input.tool_input ?? {};
    if (!tool_name || shouldSkipTool(tool_name)) return;

    const failed = input.hook_event_name === 'PostToolUseFailure' || input.error !== undefined;
    const outcome = failed ? { error: input.error, is_interrupt: input.is_interrupt === true } : input.tool_response;
    const title = (failed ? '失败: ' : '') + extractTitle(tool_name, toolInput);
    const narrative = `${tool_name} ${JSON.stringify(toolInput).slice(0, 200)} → ${JSON.stringify(outcome ?? null).slice(0, 200)}`;

    const store = new ObservationStore();
    try {
      store.insertObservation({
        sessionId: session_id,
        project: projectNameOf(cwd),
        type: categorize(tool_name),
        title,
        narrative,
        files: extractFiles(toolInput),
      });
    } finally {
      store.close();
    }
  } catch {
    // 记忆是锦上添花：解析失败、数据库被锁都只是丢掉这一条
  } finally {
    // stdout 只写一次 JSON
    process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
  }
}

main();
