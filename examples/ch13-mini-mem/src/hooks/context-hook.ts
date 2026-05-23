/**
 * SessionStart Hook：注入历史 Observation 索引到新会话
 *
 * 触发时机：每次 Claude Code 新会话开始时
 * 产出：Progressive Disclosure 格式的 Markdown 索引表
 */
import { readJsonFromStdin } from '../utils/stdin.js';
import { ObservationStore, type Observation } from '../db/store.js';

interface SessionStartInput {
  session_id: string;
  cwd: string;
  source: string; // "startup" | "clear" | "compact"
}

async function main() {
  process.stderr.write = (() => true) as typeof process.stderr.write;

  try {
    const input = await readJsonFromStdin<SessionStartInput>();
    const project = input.cwd.split('/').pop() || 'unknown';

    const store = new ObservationStore();
    const observations = store.getRecentByProject(project, 30);
    store.close();

    // 没有历史数据则跳过
    if (observations.length === 0) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    // 构建 Progressive Disclosure 索引
    const index = buildIndex(observations);

    // 通过 hookSpecificOutput.additionalContext 注入到会话
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: index
      }
    }));
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

function buildIndex(observations: Observation[]): string {
  const typeIcons: Record<string, string> = {
    'change': '🟢',
    'how-it-works': '🔵',
    'discovery': '🟣',
    'decision': '🟤',
    'bugfix': '🟡',
    'gotcha': '🔴',
  };

  let md = '# [mini-mem] recent context\n\n';
  md += '| ID | Time | T | Title |\n';
  md += '|----|------|---|-------|\n';

  for (const obs of observations) {
    const time = new Date(obs.created_at * 1000).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    const icon = typeIcons[obs.type] || '🔵';
    md += `| #${obs.id} | ${time} | ${icon} | ${obs.title} |\n`;
  }

  md += '\n*Use MCP search tools to access full observation details*';
  return md;
}

main();
