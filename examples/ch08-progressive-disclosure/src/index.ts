/**
 * ch08：渐进式信息披露 Token 效率 Demo
 *
 * 演示三层信息披露策略的 Token 消耗差异：
 *   Layer 1 (索引层)   → 标题索引表，最节省 Token
 *   Layer 2 (上下文层) → narrative 摘要，平衡信息量与 Token
 *   Layer 3 (详情层)   → 完整 facts，最完整但 Token 最多
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────
// 数据结构
// ─────────────────────────────────────────────────────────────

interface Observation {
  id: number;
  type: string;
  title: string;
  narrative: string;
  facts: string[];
  project: string;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// 初始化内存数据库，写入示例 Observation
// ─────────────────────────────────────────────────────────────

function initDb(): Database.Database {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE observations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      type       TEXT NOT NULL,
      title      TEXT NOT NULL,
      narrative  TEXT NOT NULL,
      facts      TEXT NOT NULL,  -- JSON array
      project    TEXT NOT NULL DEFAULT 'demo',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const insert = db.prepare(`
    INSERT INTO observations (type, title, narrative, facts)
    VALUES (@type, @title, @narrative, @facts)
  `);

  const sampleData: Omit<Observation, 'id' | 'project' | 'created_at'>[] = [
    {
      type: 'bugfix',
      title: '修复连接池泄漏',
      narrative: '发现 Worker 在处理队列任务时未正确关闭 SQLite 连接，导致文件描述符耗尽。根本原因是 store.close() 未在 finally 块中调用。',
      facts: [
        'SQLite better-sqlite3 是同步 API，close() 必须显式调用',
        '复现路径：连续处理 200 条任务后 EMFILE 报错',
        '修复方案：用 try/finally 包裹所有 store 操作',
        '影响文件：src/worker/processor.ts:45',
      ],
    },
    {
      type: 'change',
      title: '升级 FTS5 分词器为 trigram',
      narrative: '将 observations_fts 表的分词器从 unicode61 改为 trigram，中文搜索召回率从约 30% 提升到 85%。',
      facts: [
        'trigram 通过三字符滑动窗口索引，适合中文等无空格语言',
        '建表时指定：tokenize="trigram"',
        '旧数据需要 INSERT INTO observations_fts(observations_fts) VALUES ("rebuild") 重建索引',
        'Token 消耗增加约 15%，可接受',
      ],
    },
    {
      type: 'decision',
      title: '选用 BullMQ 替代自研队列',
      narrative: '评估了 BullMQ、Bee-Queue、自研 SQLite 队列三个方案，最终选用 BullMQ。自研方案无法处理 Worker 崩溃后的任务重试，Bee-Queue 已停止维护。',
      facts: [
        'BullMQ 基于 Redis，支持优先级、延迟、重试、失败队列',
        '需要额外部署 Redis，增加运维复杂度',
        '并发处理能力：单 Worker 5 concurrency，可横向扩展',
        '相关文档：https://docs.bullmq.io',
      ],
    },
    {
      type: 'discovery',
      title: 'Claude Hook stdin 有 4MB 限制',
      narrative: '测试时发现当工具调用的 input+output 超过 4MB 时，Hook stdin 会被截断，导致 JSON 解析失败。需要在 Hook 中做长度检查。',
      facts: [
        'Claude Code 的 Hook stdin 上限约 4MB（未官方确认）',
        '超长工具调用：主要是 Read 大文件或 Bash 命令输出过长',
        '缓解方案：在 save-hook 中检查 JSON 长度，超限时截断 toolResponse',
        '截断策略：保留前 500 字符 + 后 200 字符',
      ],
    },
    {
      type: 'how-it-works',
      title: 'MCP Server 工具调用流程',
      narrative: 'Claude 通过 MCP 协议调用 search 工具时，Server 先做 FTS5 全文搜索，再按 BM25 分数排序，返回前 N 条 Observation 的 ID 和标题。',
      facts: [
        'MCP 通信协议：JSON-RPC over stdio',
        'search 工具参数：query (string), project (string?), limit (number?)',
        'FTS5 查询：SELECT id, title FROM observations_fts WHERE observations_fts MATCH ? ORDER BY rank LIMIT ?',
        'get_observations 工具根据 ID 数组返回完整 narrative + facts',
      ],
    },
    {
      type: 'change',
      title: '添加 PreToolUse 文件过滤 Hook',
      narrative: '在 PostToolUse 之外新增 PreToolUse Hook，用于过滤不需要记录的工具调用（如 Read .env 文件），避免敏感信息进入记忆。',
      facts: [
        'PreToolUse 可以通过返回 {"decision": "block"} 阻止工具执行',
        '过滤规则：Read .env / Read *secret* / Bash 命令包含 password',
        '配置文件：plugin/hooks/hooks.json',
        '实现文件：src/cli/handlers/pre-tool-use.ts',
      ],
    },
    {
      type: 'bugfix',
      title: '修复 context-hook 项目名解析错误',
      narrative: 'monorepo 中 git rev-parse --show-toplevel 返回根目录，导致所有子项目的记忆都混入同一个 project key。改为优先读取 package.json name 字段。',
      facts: [
        'monorepo 场景：git root 是 /workspace，package.json 在 /workspace/packages/api',
        '修复策略：先找最近的 package.json，再 fallback 到 git root basename',
        '影响文件：src/hooks/context-hook.ts:getProjectName()',
      ],
    },
    {
      type: 'discovery',
      title: 'ChromaDB 向量维度必须一致',
      narrative: '尝试混用 text-embedding-ada-002（1536 维）和 text-embedding-3-small（1536 维）时没问题，但切换到 3-large（3072 维）后 Collection 报错。ChromaDB 的 Collection 维度在创建时固定。',
      facts: [
        'ChromaDB Collection 维度在首次 add 时由第一条数据决定',
        '切换模型需要删除旧 Collection 并重建',
        'claude-mem 使用 OpenAI text-embedding-3-small（1536 维）',
        '相关代码：src/services/sync/chroma-sync.ts',
      ],
    },
    {
      type: 'decision',
      title: '选择 WAL 模式而非 Journal 模式',
      narrative: 'SQLite 默认的 DELETE journal 模式在并发读写时容易产生 SQLITE_BUSY 错误。切换到 WAL 模式后，读写并发性大幅提升，Worker 和 MCP Server 可同时访问数据库。',
      facts: [
        'WAL 模式：写操作先写 WAL 文件，不阻塞并发读',
        '启用方法：PRAGMA journal_mode=WAL',
        '缺点：多了 .db-wal 和 .db-shm 文件，备份时需一并备份',
        'WAL 文件超过 1000 页时自动 checkpoint',
      ],
    },
    {
      type: 'change',
      title: '压缩 Prompt 从 500 Token 优化到 180 Token',
      narrative: '原来的 AI 压缩 Prompt 包含大量示例，导致每次调用额外消耗 500 Token。重写为简洁版本后降至 180 Token，年均节省约 $12（基于 Haiku 定价）。',
      facts: [
        '原 Prompt：包含 3 个 few-shot 示例，约 500 Token',
        '新 Prompt：只保留 JSON Schema 定义，约 180 Token',
        '质量对比：压缩质量基本持平（抽样 100 条人工评估）',
        '涉及文件：src/services/worker/agents/observation-agent.ts',
      ],
    },
    {
      type: 'bugfix',
      title: '修复 Session ID 在重启后重置',
      narrative: 'Claude Code 重启后 CLAUDE_SESSION_ID 环境变量变化，导致正在处理中的任务关联的 Session ID 丢失，进而影响 timeline 展示。改为在 SQLite 中持久化 session 映射。',
      facts: [
        'CLAUDE_SESSION_ID 是 Claude Code 注入的环境变量，每次启动刷新',
        '持久化方案：sessions 表存储 (external_id, internal_id, started_at)',
        '查询时 JOIN sessions 表获取 timeline',
      ],
    },
    {
      type: 'how-it-works',
      title: 'Knowledge Agent Build 阶段流程',
      narrative: 'build_corpus 命令读取指定项目的全部 Observation，分批发给 Claude Agent SDK 进行主题聚类和摘要，生成结构化的 Corpus 文档。',
      facts: [
        '批大小：每批 20 条 Observation（约 4000 Token 输入）',
        'Agent 输出：topics 数组，每个 topic 含 title + summary + observation_ids',
        '结果存储：corpus 表，JSON 格式存储 topics',
        '调用限制：每次 build 最多处理 500 条 Observation',
      ],
    },
    {
      type: 'discovery',
      title: 'Bun 与 Node.js 的 stdin 读取差异',
      narrative: 'Bun 的 process.stdin 在没有数据时不会阻塞退出，而 Node.js 会等待。Hook 脚本在 Bun 下需要显式处理 stdin 结束事件，否则进程提前退出导致 JSON 解析失败。',
      facts: [
        'Node.js：process.stdin 默认暂停模式，需要 resume() 或 on("data")',
        'Bun：stdin 行为略有不同，测试时发现空输入会直接退出',
        '解决方案：用 Promise 包装 stdin 读取，确保等待完整 JSON',
        '影响文件：src/utils/stdin.ts',
      ],
    },
    {
      type: 'change',
      title: '添加 Observation 去重逻辑',
      narrative: '同一个文件在短时间内被多次编辑时，会产生多条高度相似的 Observation。添加基于标题+项目的去重窗口（5 分钟内标题相同则跳过）。',
      facts: [
        '去重策略：同项目内，5 分钟内标题相同的 Observation 跳过',
        '实现：INSERT OR IGNORE + UNIQUE INDEX ON (title, project, window)',
        '误判率约 2%（相同文件不同改动被合并）',
      ],
    },
    {
      type: 'decision',
      title: '前端 Viewer 使用 SSE 而非 WebSocket',
      narrative: '实时推送新 Observation 到浏览器时，SSE（Server-Sent Events）比 WebSocket 更简单：无需握手协议，HTTP 天然支持，浏览器自动重连。',
      facts: [
        'SSE 单向推送（Server → Client），满足只读展示需求',
        '实现：Express res.write("data: " + JSON.stringify(obs) + "\\n\\n")',
        '浏览器端：new EventSource("/api/stream")',
        'WebSocket 适合双向通信场景，此处需求不需要',
      ],
    },
    {
      type: 'bugfix',
      title: '修复 FTS5 短语搜索中文乱码',
      narrative: '用户搜索 "连接池" 时，FTS5 MATCH 查询用引号包裹导致短语匹配失败，因为 unicode61 分词器将中文每个字作为独立 token，短语匹配找不到连续出现。',
      facts: [
        '错误写法：WHERE observations_fts MATCH \'"连接池"\'（强制短语匹配）',
        '正确写法：WHERE observations_fts MATCH \'连接 池\'（OR 语义）或用 trigram 分词器',
        '根本原因：unicode61 将 "连接池" 分为 "连"+"接"+"池" 三个 token',
        '最终方案：切换为 trigram 分词器，无需修改查询',
      ],
    },
    {
      type: 'how-it-works',
      title: 'claude-mem 插件安装原理',
      narrative: 'install-plugin 脚本将 plugin/ 目录软链接到 ~/.claude/plugins/ 下，Claude Code 启动时扫描该目录并加载 plugin.json。Hook 和 MCP 配置从 plugin/ 目录读取。',
      facts: [
        '安装路径：~/.claude/plugins/claude-mem → /path/to/claude-mem/plugin',
        'plugin.json 定义插件名、版本、权限',
        'hooks.json 注册 SessionStart 和 PostToolUse',
        '.mcp.json 注册 MCP Server 启动命令',
      ],
    },
    {
      type: 'change',
      title: '实现 smart_search 工具',
      narrative: 'smart_search 在 FTS5 关键词搜索基础上加入向量语义搜索，结果用 RRF（Reciprocal Rank Fusion）算法融合排序，相关性显著优于单纯关键词搜索。',
      facts: [
        'RRF 公式：score = sum(1 / (k + rank_i))，k=60',
        'FTS5 结果权重 0.4，向量结果权重 0.6',
        '需要 ChromaDB 运行，降级时自动 fallback 到纯 FTS5',
        '实现文件：src/services/worker/SearchManager.ts',
      ],
    },
    {
      type: 'discovery',
      title: 'Lost in the Middle 对 Context Injection 的影响',
      narrative: '实验发现，将最重要的 Observation 放在 Context Block 的开头和结尾，而非中间，可以提高 Claude 在对话中引用这些记忆的概率。这与 "Lost in the Middle" 研究结论一致。',
      facts: [
        '"Lost in the Middle" 论文：大模型对上下文首尾信息注意力更高',
        'claude-mem 的 context-hook 按 recency 排序，最新的在最前',
        '改进方案：最新 + 最高 fetch_count 的 Observation 分别放首尾',
        '改进效果：在 50 次对话中测试，引用率从 62% 提升到 78%',
      ],
    },
    {
      type: 'decision',
      title: '选择 CC BY-NC-SA 4.0 开源许可',
      narrative: '书籍内容选用 CC BY-NC-SA 4.0：允许自由传播和修改，但禁止商业使用，修改后必须以相同许可发布。代码示例使用 MIT 许可，允许商业使用。',
      facts: [
        'CC BY-NC-SA：署名-非商业-相同方式共享',
        '代码示例：MIT License（可自由用于商业项目）',
        '商业使用授权：联系 inferloop.dev',
      ],
    },
  ];

  for (const obs of sampleData) {
    insert.run({ ...obs, facts: JSON.stringify(obs.facts) });
  }

  return db;
}

// ─────────────────────────────────────────────────────────────
// 三层渐进式信息披露
// ─────────────────────────────────────────────────────────────

/** 粗估 Token 数量（中文约 1.5 字/token，英文约 4 字/token） */
function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

/** Layer 1：只输出索引表（ID + 类型图标 + 标题） */
function layer1Index(db: Database.Database): string {
  const typeIcon: Record<string, string> = {
    bugfix: '[fix]', change: '[chg]', decision: '[dec]',
    discovery: '[disc]', 'how-it-works': '[how]',
  };

  const rows = db.prepare(
    'SELECT id, type, title FROM observations ORDER BY created_at DESC'
  ).all() as { id: number; type: string; title: string }[];

  const lines = rows.map(r => `  ${r.id}. ${typeIcon[r.type] ?? '[obs]'} ${r.title}`);
  return `## 最近记忆索引（共 ${rows.length} 条）\n\n${lines.join('\n')}\n\n> 使用 get_observations([id,...]) 获取详情`;
}

/** Layer 2：上下文层（索引 + narrative） */
function layer2Context(db: Database.Database, ids: number[]): string {
  const rows = db.prepare(
    `SELECT id, type, title, narrative FROM observations WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at DESC`
  ).all(...ids) as { id: number; type: string; title: string; narrative: string }[];

  const blocks = rows.map(r =>
    `### ${r.id}. [${r.type}] ${r.title}\n${r.narrative}`
  );
  return blocks.join('\n\n');
}

/** Layer 3：完整详情（narrative + facts） */
function layer3Details(db: Database.Database, ids: number[]): string {
  const rows = db.prepare(
    `SELECT id, type, title, narrative, facts FROM observations WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at DESC`
  ).all(...ids) as { id: number; type: string; title: string; narrative: string; facts: string }[];

  const blocks = rows.map(r => {
    const facts = JSON.parse(r.facts) as string[];
    const factLines = facts.map(f => `  - ${f}`).join('\n');
    return `### ${r.id}. [${r.type}] ${r.title}\n\n${r.narrative}\n\n**Facts:**\n${factLines}`;
  });
  return blocks.join('\n\n---\n\n');
}

// ─────────────────────────────────────────────────────────────
// 主程序：对比三层的 Token 开销
// ─────────────────────────────────────────────────────────────

const db = initDb();
const totalObs = (db.prepare('SELECT COUNT(*) as n FROM observations').get() as { n: number }).n;
const allIds = (db.prepare('SELECT id FROM observations').all() as { id: number }[]).map(r => r.id);
const sampleIds = allIds.slice(0, 5); // 取前 5 条演示 Layer 2/3

console.log('='.repeat(60));
console.log('渐进式信息披露 Token 效率对比');
console.log('='.repeat(60));

// Layer 1
const l1 = layer1Index(db);
const l1Tokens = estimateTokens(l1);
console.log(`\n[Layer 1 - 索引层] 全部 ${totalObs} 条 Observation`);
console.log('-'.repeat(60));
console.log(l1);
console.log(`\n估算 Token 数：${l1Tokens}`);

// Layer 2
const l2 = layer2Context(db, sampleIds);
const l2Tokens = estimateTokens(l2);
console.log(`\n${'='.repeat(60)}`);
console.log(`[Layer 2 - 上下文层] 展开前 ${sampleIds.length} 条 Observation`);
console.log('-'.repeat(60));
console.log(l2);
console.log(`\n估算 Token 数：${l2Tokens}（${sampleIds.length} 条）`);

// Layer 3
const l3 = layer3Details(db, sampleIds.slice(0, 2));
const l3Tokens = estimateTokens(l3);
console.log(`\n${'='.repeat(60)}`);
console.log(`[Layer 3 - 详情层] 展开前 2 条 Observation（含 facts）`);
console.log('-'.repeat(60));
console.log(l3);
console.log(`\n估算 Token 数：${l3Tokens}（2 条）`);

// 汇总
console.log(`\n${'='.repeat(60)}`);
console.log('Token 消耗对比汇总');
console.log('-'.repeat(60));
console.log(`策略                   Token 数    每条均摊`);
console.log(`Layer 1（全 ${totalObs} 条索引）  ${l1Tokens.toString().padStart(6)}     ${Math.round(l1Tokens / totalObs)}/条`);
console.log(`Layer 2（${sampleIds.length} 条 narrative）  ${l2Tokens.toString().padStart(6)}     ${Math.round(l2Tokens / sampleIds.length)}/条`);
console.log(`Layer 3（2 条完整详情）  ${l3Tokens.toString().padStart(6)}     ${Math.round(l3Tokens / 2)}/条`);
console.log('-'.repeat(60));
console.log('结论：Layer 1 索引层 Token 效率最高，按需展开后续层级');
console.log('='.repeat(60));

db.close();
