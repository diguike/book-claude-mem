/**
 * SessionStart 注入文本的渲染与预算裁剪
 * 单行格式参考 claude-mem 的真实输出（第 8 章）：ID 时间 类型符号 标题，按天分组
 */
import type { Observation } from '../db/store.js';

// Claude Code 原样交付 Hook 输出的上限；超出后模型实际收不到内容
export const CONTEXT_OUTPUT_LIMIT = 10_000;

const TYPE_SYMBOLS: Record<string, string> = {
  bugfix: '●', feature: '◆', refactor: '↻', change: '✓', discovery: '○', decision: '⚖',
};

export function renderIndex(project: string, observations: Observation[]): string {
  const lines = [
    `# [${project}] recent context (mini-mem)`,
    'Legend: ●bugfix ◆feature ↻refactor ✓change ○discovery ⚖decision',
    'Format: ID TIME TYPE TITLE | Details: get_observations([IDs]) | Search: search(query)',
    '',
  ];
  let currentDay = '';
  // 最新的在前取出，按时间正序展示
  for (const obs of [...observations].reverse()) {
    const date = new Date(obs.created_at * 1000);
    const day = date.toISOString().slice(0, 10);
    if (day !== currentDay) {
      lines.push(`### ${day}`);
      currentDay = day;
    }
    const time = date.toTimeString().slice(0, 5);
    lines.push(`${obs.id} ${time} ${TYPE_SYMBOLS[obs.type] ?? '•'} ${obs.title}`);
  }
  return lines.join('\n');
}

/** 按测量裁剪：超出上限就把条数减半再渲染，整条丢弃，不截断半条 */
export function fitToBudget(project: string, observations: Observation[], limit = CONTEXT_OUTPUT_LIMIT): string {
  let count = observations.length;
  let text = renderIndex(project, observations);
  while (text.length > limit && count > 1) {
    count = Math.floor(count / 2);
    text = renderIndex(project, observations.slice(0, count));
  }
  return text;
}
