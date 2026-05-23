/**
 * ch11：Knowledge Agent Build→Prime→Query Demo
 *
 * 模拟 claude-mem 的 Knowledge Agent 三阶段流程：
 *   1. Build   → 读取 Observations，按主题聚类生成 Corpus
 *   2. Prime   → 将 Corpus 压缩为可注入上下文的摘要
 *   3. Query   → 在 Corpus 中搜索特定主题
 *
 * 此 Demo 用规则聚类代替 AI 聚类（无需 API Key）。
 */

import Database from 'better-sqlite3';

// ─────────────────────────────────────────────────────────────
// 数据结构
// ─────────────────────────────────────────────────────────────

interface ObservationRow {
  id: number;
  type: string;
  title: string;
  narrative: string;
  facts: string;
  project: string;
}

interface Topic {
  id: string;
  title: string;
  summary: string;
  observation_ids: number[];
  type_filter: string;
}

interface Corpus {
  id: string;
  project: string;
  built_at: string;
  topics: Topic[];
  total_observations: number;
}

// ─────────────────────────────────────────────────────────────
// 初始化数据库，写入示例 Observation
// ─────────────────────────────────────────────────────────────

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE observations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL,
    title      TEXT NOT NULL,
    narrative  TEXT NOT NULL DEFAULT '',
    facts      TEXT NOT NULL DEFAULT '[]',
    project    TEXT NOT NULL DEFAULT 'my-app',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE corpora (
    id         TEXT PRIMARY KEY,
    project    TEXT NOT NULL,
    built_at   TEXT NOT NULL,
    data       TEXT NOT NULL  -- JSON 序列化的 Corpus
  );
`);

const insert = db.prepare(
  'INSERT INTO observations (type, title, narrative, facts, project) VALUES (?, ?, ?, ?, ?)'
);

const obs: [string, string, string, string, string][] = [
  ['bugfix', '修复 SQLite 连接泄漏', '在 finally 块中添加 store.close() 修复文件描述符耗尽问题。', '["影响：连续处理200条任务后报EMFILE","修复文件：processor.ts:45"]', 'my-app'],
  ['bugfix', '修复 FTS5 中文搜索乱码', '将分词器从 unicode61 改为 trigram，中文搜索召回率从30%提升到85%。', '["影响：所有中文关键词搜索","解决：重建FTS5索引"]', 'my-app'],
  ['bugfix', '修复 context-hook 项目名解析', 'monorepo 场景下优先读 package.json name，避免所有子项目共享记忆。', '["影响：monorepo用户","修复文件：context-hook.ts"]', 'my-app'],
  ['change', '升级 FTS5 分词器为 trigram', '修改建表 SQL：tokenize="trigram"，需重建索引。', '["重建：INSERT INTO fts(fts) VALUES(rebuild)"]', 'my-app'],
  ['change', '添加 Observation 去重逻辑', '5分钟内同标题同项目跳过，减少重复记忆。', '["误判率约2%","实现：UNIQUE INDEX+窗口"]', 'my-app'],
  ['change', '压缩 Prompt 从500 Token 优化到180 Token', '去除 few-shot 示例，仅保留 JSON Schema 定义。', '["年省约$12（Haiku定价）","质量基本持平"]', 'my-app'],
  ['decision', '选用 BullMQ 替代自研队列', '自研队列无法处理 Worker 崩溃重试，Bee-Queue 已停止维护。', '["需要 Redis","支持优先级/延迟/重试/失败队列"]', 'my-app'],
  ['decision', '选择 WAL 模式', 'WAL 模式下读写并发不互斥，Worker 和 MCP Server 可同时访问。', '["启用：PRAGMA journal_mode=WAL","缺点：多了.db-wal和.db-shm文件"]', 'my-app'],
  ['decision', '选用 CC BY-NC-SA 4.0 许可', '允许传播修改，禁止商业使用，代码示例用 MIT。', '["书籍：CC BY-NC-SA 4.0","代码：MIT"]', 'my-app'],
  ['discovery', 'Hook stdin 有4MB 上限', 'stdin 超过4MB 时 JSON 解析失败，需截断 toolResponse。', '["截断策略：前500字+后200字","影响：Read大文件"]', 'my-app'],
  ['discovery', 'ChromaDB 向量维度固定', 'Collection 维度在首次 add 时确定，切换模型需删除重建。', '["claude-mem使用1536维","相关：chroma-sync.ts"]', 'my-app'],
  ['discovery', 'Lost in the Middle 影响记忆引用率', '关键 Observation 放首尾比放中间引用率高16个百分点。', '["测试：50次对话","引用率：62%→78%"]', 'my-app'],
  ['how-it-works', 'MCP search 工具流程', 'FTS5全文搜索 → BM25排序 → 返回前N条ID+标题。', '["协议：JSON-RPC over stdio","参数：query,project,limit"]', 'my-app'],
  ['how-it-works', 'claude-mem 插件安装原理', 'install-plugin 将 plugin/ 软链接到 ~/.claude/plugins/。', '["Hook：SessionStart+PostToolUse","MCP：.mcp.json注册"]', 'my-app'],
  ['how-it-works', 'Knowledge Agent Build 阶段', '分批发 Observations 给 AI 做主题聚类，每批20条约4000 Token。', '["上限：每次build最多500条","结果：topics数组"]', 'my-app'],
];

for (const row of obs) insert.run(...row);

// ─────────────────────────────────────────────────────────────
// Phase 1: Build（规则聚类，模拟 AI 聚类行为）
// ─────────────────────────────────────────────────────────────

function buildCorpus(project: string): Corpus {
  const rows = db.prepare(
    'SELECT id, type, title, narrative, facts FROM observations WHERE project = ? ORDER BY created_at DESC'
  ).all(project) as ObservationRow[];

  console.log(`\n[Build] 读取 ${rows.length} 条 Observation，开始聚类...`);

  // 按 type 分组（模拟 AI 主题聚类）
  const typeGroups = new Map<string, ObservationRow[]>();
  for (const row of rows) {
    if (!typeGroups.has(row.type)) typeGroups.set(row.type, []);
    typeGroups.get(row.type)!.push(row);
  }

  const typeLabels: Record<string, string> = {
    bugfix: 'Bug 修复记录',
    change: '功能变更记录',
    decision: '技术决策记录',
    discovery: '技术发现记录',
    'how-it-works': '原理说明记录',
  };

  const topics: Topic[] = [];
  for (const [type, typeRows] of typeGroups) {
    const topTitles = typeRows.slice(0, 3).map(r => r.title).join('、');
    topics.push({
      id: `topic_${type}`,
      title: typeLabels[type] ?? type,
      summary: `共 ${typeRows.length} 条，包括：${topTitles}${typeRows.length > 3 ? '等' : ''}`,
      observation_ids: typeRows.map(r => r.id),
      type_filter: type,
    });
  }

  const corpus: Corpus = {
    id: `corpus_${project}_${Date.now()}`,
    project,
    built_at: new Date().toISOString(),
    topics,
    total_observations: rows.length,
  };

  // 存储 Corpus
  db.prepare('INSERT OR REPLACE INTO corpora (id, project, built_at, data) VALUES (?, ?, ?, ?)').run(
    corpus.id, corpus.project, corpus.built_at, JSON.stringify(corpus)
  );

  console.log(`[Build] 生成 ${topics.length} 个主题 Corpus，已存储`);
  return corpus;
}

// ─────────────────────────────────────────────────────────────
// Phase 2: Prime（生成可注入上下文的摘要）
// ─────────────────────────────────────────────────────────────

function primeCorpus(corpus: Corpus): string {
  const lines: string[] = [
    `## ${corpus.project} 知识库概览（${corpus.total_observations} 条 Observation）`,
    '',
  ];

  for (const topic of corpus.topics) {
    lines.push(`### ${topic.title}`);
    lines.push(topic.summary);
    lines.push(`  IDs: [${topic.observation_ids.join(', ')}]`);
    lines.push('');
  }

  lines.push(`> 使用 query_corpus("关键词") 搜索详情，或 get_observations([IDs]) 获取完整内容`);

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────
// Phase 3: Query（在 Corpus 中搜索）
// ─────────────────────────────────────────────────────────────

function queryCorpus(corpus: Corpus, query: string): void {
  const lower = query.toLowerCase();
  console.log(`\n[Query] 搜索: "${query}"`);
  console.log('-'.repeat(50));

  let matched = 0;
  for (const topic of corpus.topics) {
    // 在 topic 级别匹配
    if (topic.title.toLowerCase().includes(lower) || topic.summary.toLowerCase().includes(lower)) {
      console.log(`主题匹配: ${topic.title}`);
      console.log(`  ${topic.summary}`);
      console.log(`  相关 IDs: [${topic.observation_ids.join(', ')}]`);
      matched++;
    }
  }

  if (matched === 0) {
    // 降级到 Observation 级别搜索
    const rows = db.prepare(`
      SELECT id, type, title FROM observations
      WHERE project = ? AND (title LIKE ? OR narrative LIKE ?)
      LIMIT 5
    `).all(corpus.project, `%${query}%`, `%${query}%`) as { id: number; type: string; title: string }[];

    if (rows.length > 0) {
      console.log(`主题未匹配，降级搜索到 ${rows.length} 条 Observation：`);
      for (const r of rows) console.log(`  #${r.id} [${r.type}] ${r.title}`);
    } else {
      console.log('无匹配结果');
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 主程序
// ─────────────────────────────────────────────────────────────

console.log('='.repeat(60));
console.log('Knowledge Agent Build→Prime→Query Demo');
console.log('='.repeat(60));

// Phase 1: Build
const corpus = buildCorpus('my-app');

// Phase 2: Prime
console.log('\n[Prime] 生成可注入上下文的 Corpus 摘要：');
console.log('─'.repeat(60));
const primed = primeCorpus(corpus);
console.log(primed);

// 估算 Token
const tokenEstimate = Math.ceil(primed.length / 3); // 粗估
console.log(`[Prime] 摘要长度: ${primed.length} 字符，估算 Token: ~${tokenEstimate}`);
console.log('（对比：直接注入全部 Observation 原文约需 8000-15000 Token）');

// Phase 3: Query
const queries = ['Bug', '队列', 'SQLite', '分词'];
console.log('\n[Query] 演示三次查询：');
for (const q of queries.slice(0, 3)) {
  queryCorpus(corpus, q);
}

console.log('\n' + '='.repeat(60));
console.log('总结：Build 阶段压缩 15 条 Observations → 5 个主题');
console.log(`Prime 后的 Corpus 摘要约 ${tokenEstimate} Token`);
console.log('Query 实现在 Corpus 级别的快速检索，无需全量扫描');
console.log('='.repeat(60));

db.close();
