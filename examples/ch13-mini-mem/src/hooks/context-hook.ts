/**
 * SessionStart Hook：把最近的观察索引注入新会话
 *
 * 只在 startup / clear / compact 时注入；resume 恢复的会话已经有完整上下文，
 * 再注入会改变对话前缀、让 prompt cache 失效（claude-mem v13.30.1 的教训）
 */
import { readJsonFromStdin } from '../utils/stdin.js';
import { ObservationStore } from '../db/store.js';
import { fitToBudget } from './context-render.js';
import { projectNameOf } from '../utils/project.js';

interface SessionStartInput {
  session_id: string;
  cwd: string;
  source?: 'startup' | 'resume' | 'clear' | 'compact';
}

function emit(additionalContext: string): void {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext },
  }) + '\n');
}

async function main(): Promise<void> {
  try {
    const input = await readJsonFromStdin<SessionStartInput>();
    if (input.source === 'resume') return emit('');

    const project = projectNameOf(input.cwd);
    const store = new ObservationStore();
    const observations = store.getRecentByProject(project, 50);
    store.close();

    emit(observations.length === 0 ? '' : fitToBudget(project, observations));
  } catch {
    emit('');
  }
}

main();
