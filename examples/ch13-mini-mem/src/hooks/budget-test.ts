/**
 * 验证注入文本永远不超过 10,000 字符：构造 400 条长标题的观察，看裁剪后保留多少条
 * 运行：npm run test:budget
 */
import { fitToBudget, renderIndex, CONTEXT_OUTPUT_LIMIT } from './context-render.js';
import type { Observation } from '../db/store.js';

const now = Math.floor(Date.now() / 1000);
const observations: Observation[] = Array.from({ length: 400 }, (_, i) => ({
  id: 400 - i,
  session_id: 's',
  project: 'demo',
  type: i % 3 === 0 ? 'change' : 'discovery',
  title: `第 ${400 - i} 条：` + '把连接池的释放逻辑移到 finally，避免错误路径泄漏连接'.repeat(2),
  narrative: '',
  files: '[]',
  created_at: now - i * 60,
}));

const full = renderIndex('demo', observations);
const fitted = fitToBudget('demo', observations);
const kept = fitted.split('\n').filter(line => /^\d+ \d\d:\d\d /.test(line)).length;

console.log(`未裁剪：${full.length} 字符`);
console.log(`裁剪后：${fitted.length} 字符，保留 ${kept} 条（上限 ${CONTEXT_OUTPUT_LIMIT}）`);
if (fitted.length > CONTEXT_OUTPUT_LIMIT) {
  console.error('超出上限');
  process.exit(1);
}
console.log('通过');
