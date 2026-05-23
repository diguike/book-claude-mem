/**
 * ch10：Observation 压缩管道 Demo
 *
 * 演示从原始工具调用 → 结构化 Observation 的完整转换过程。
 * 对比规则提取 vs AI 压缩的输出质量差异。
 */

import Database from 'better-sqlite3';

// ─────────────────────────────────────────────────────────────
// 数据结构
// ─────────────────────────────────────────────────────────────

interface ToolCall {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: Record<string, unknown>;
  session_id: string;
  timestamp: string;
}

interface Observation {
  type: 'change' | 'bugfix' | 'discovery' | 'decision' | 'how-it-works';
  title: string;
  narrative: string;
  facts: string[];
}

// ─────────────────────────────────────────────────────────────
// 模拟工具调用数据（PostToolUse Hook 接收到的原始数据）
// ─────────────────────────────────────────────────────────────

const sampleToolCalls: ToolCall[] = [
  {
    tool_name: 'Edit',
    tool_input: {
      file_path: 'src/worker/processor.ts',
      old_string: 'const store = new ObservationStore();\n  const items = store.getPending(10);',
      new_string: 'const store = new ObservationStore();\n  try {\n    const items = store.getPending(10);',
    },
    tool_response: { success: true, message: 'File edited successfully' },
    session_id: 'sess_abc123',
    timestamp: new Date().toISOString(),
  },
  {
    tool_name: 'Bash',
    tool_input: {
      command: 'npm test -- --testPathPattern=processor',
      description: '运行 processor 单元测试',
    },
    tool_response: {
      stdout: 'PASS src/worker/processor.test.ts\n  ✓ processes pending observations (245ms)\n  ✓ handles compression errors gracefully (89ms)\n\nTest Suites: 1 passed\nTests: 2 passed',
      exit_code: 0,
    },
    session_id: 'sess_abc123',
    timestamp: new Date().toISOString(),
  },
  {
    tool_name: 'Write',
    tool_input: {
      file_path: 'src/db/schema.ts',
      content: '// SQLite 建表语句\nexport const CREATE_TABLES = `\n  CREATE TABLE IF NOT EXISTS observations (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    type TEXT NOT NULL,\n    title TEXT NOT NULL,\n    ...\n  );\n`;',
    },
    tool_response: { success: true },
    session_id: 'sess_abc123',
    timestamp: new Date().toISOString(),
  },
  {
    tool_name: 'Bash',
    tool_input: {
      command: 'node -e "const db = require(\'better-sqlite3\')(\':memory:\'); db.exec(\'PRAGMA journal_mode=WAL\'); console.log(db.pragma(\'journal_mode\'));"',
    },
    tool_response: {
      stdout: '[{"journal_mode":"wal"}]',
      exit_code: 0,
    },
    session_id: 'sess_def456',
    timestamp: new Date().toISOString(),
  },
  {
    tool_name: 'Read',
    tool_input: { file_path: 'src/services/worker-service.ts' },
    tool_response: {
      content: '// 文件内容（模拟）\nexport class WorkerService {\n  private server: Express.Application;\n  ...\n}',
    },
    session_id: 'sess_def456',
    timestamp: new Date().toISOString(),
  },
];

// ─────────────────────────────────────────────────────────────
// 规则提取器
// ─────────────────────────────────────────────────────────────

const TYPE_KEYWORDS: Record<string, string[]> = {
  bugfix: ['fix', 'bug', 'error', 'issue', 'crash', 'leak', '修复', '错误', '泄漏'],
  decision: ['decide', 'choose', 'select', 'option', '选择', '决定', '方案'],
  discovery: ['found', 'discover', 'notice', 'realize', '发现', '注意', '意识到'],
  'how-it-works': ['understand', 'explain', 'work', '原理', '机制', '工作'],
};

function classifyType(text: string): Observation['type'] {
  const lower = text.toLowerCase();
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return type as Observation['type'];
  }
  return 'change';
}

function extractTitle(toolCall: ToolCall): string {
  const { tool_name, tool_input } = toolCall;

  if (tool_name === 'Edit' || tool_name === 'Write') {
    const filePath = (tool_input.file_path as string) || '';
    const fileName = filePath.split('/').pop() ?? filePath;
    return `修改 ${fileName}`;
  }

  if (tool_name === 'Bash') {
    const cmd = (tool_input.command as string) || '';
    if (cmd.includes('test')) return '运行测试';
    if (cmd.includes('npm install')) return '安装依赖';
    if (cmd.includes('PRAGMA')) return '验证 SQLite 配置';
    return `执行命令: ${cmd.slice(0, 30)}`;
  }

  if (tool_name === 'Read') {
    const filePath = (tool_input.file_path as string) || '';
    return `读取 ${filePath.split('/').pop()}`;
  }

  return `${tool_name} 操作`;
}

function extractNarrative(toolCall: ToolCall): string {
  const { tool_name, tool_input, tool_response } = toolCall;

  if (tool_name === 'Edit') {
    const filePath = tool_input.file_path as string;
    const oldStr = (tool_input.old_string as string || '').slice(0, 100);
    const newStr = (tool_input.new_string as string || '').slice(0, 100);
    return `在 ${filePath} 中将 "${oldStr}" 替换为 "${newStr}"`;
  }

  if (tool_name === 'Bash') {
    const cmd = tool_input.command as string;
    const stdout = (tool_response.stdout as string || '').slice(0, 200);
    const exitCode = tool_response.exit_code as number;
    return `执行命令 "${cmd.slice(0, 60)}"，退出码 ${exitCode}。输出：${stdout.slice(0, 100)}`;
  }

  if (tool_name === 'Write') {
    const filePath = tool_input.file_path as string;
    return `创建/覆盖文件 ${filePath}`;
  }

  return `工具 ${tool_name} 执行完成`;
}

function extractFacts(toolCall: ToolCall): string[] {
  const facts: string[] = [];
  const { tool_name, tool_input, tool_response } = toolCall;

  facts.push(`工具: ${tool_name}`);

  if (tool_input.file_path) {
    facts.push(`文件: ${tool_input.file_path}`);
  }

  if (tool_name === 'Bash') {
    const exitCode = tool_response.exit_code as number;
    facts.push(`退出码: ${exitCode}`);
    if (exitCode !== 0 && tool_response.stderr) {
      facts.push(`错误: ${String(tool_response.stderr).slice(0, 100)}`);
    }
  }

  return facts;
}

function ruleExtract(toolCall: ToolCall): Observation {
  const title = extractTitle(toolCall);
  const narrative = extractNarrative(toolCall);
  const type = classifyType(title + ' ' + narrative);
  const facts = extractFacts(toolCall);

  return { type, title, narrative, facts };
}

// ─────────────────────────────────────────────────────────────
// 存储层
// ─────────────────────────────────────────────────────────────

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE observations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL,
    title      TEXT NOT NULL,
    narrative  TEXT NOT NULL,
    facts      TEXT NOT NULL,
    tool_name  TEXT NOT NULL,
    session_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const insertObs = db.prepare(`
  INSERT INTO observations (type, title, narrative, facts, tool_name, session_id)
  VALUES (@type, @title, @narrative, @facts, @tool_name, @session_id)
`);

// ─────────────────────────────────────────────────────────────
// 主程序
// ─────────────────────────────────────────────────────────────

console.log('='.repeat(60));
console.log('Observation 压缩管道 Demo');
console.log('='.repeat(60));
console.log(`\n输入：${sampleToolCalls.length} 条工具调用\n`);

// 过滤不需要记录的工具调用（Read 通常信息量低）
const filtered = sampleToolCalls.filter(tc => tc.tool_name !== 'Read');
console.log(`过滤后（排除 Read 操作）：${filtered.length} 条\n`);

// 规则提取并存储
const observations: Observation[] = [];
for (const tc of filtered) {
  const obs = ruleExtract(tc);
  observations.push(obs);

  insertObs.run({
    ...obs,
    facts: JSON.stringify(obs.facts),
    tool_name: tc.tool_name,
    session_id: tc.session_id,
  });

  console.log(`[${obs.type.padEnd(12)}] ${obs.title}`);
  console.log(`  ${obs.narrative.slice(0, 80)}`);
  console.log(`  facts: ${obs.facts.join(' | ')}`);
  console.log();
}

// 查询存储结果
const stored = db.prepare('SELECT COUNT(*) as n FROM observations').get() as { n: number };
console.log('-'.repeat(60));
console.log(`已存储 ${stored.n} 条 Observation 到 SQLite`);
console.log('-'.repeat(60));

// 类型分布统计
const typeDist = db.prepare(
  'SELECT type, COUNT(*) as n FROM observations GROUP BY type ORDER BY n DESC'
).all() as { type: string; n: number }[];
console.log('\n类型分布:');
for (const { type, n } of typeDist) {
  console.log(`  ${type}: ${n}`);
}

console.log('\n='.repeat(60));
console.log('说明：规则提取速度快（<1ms/条），但语义质量低于 AI 压缩');
console.log('AI 压缩（需 ANTHROPIC_API_KEY）质量更高，但每条约 100-200ms');
console.log('='.repeat(60));

db.close();
