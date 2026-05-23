/**
 * Memory 方案特性对比表
 *
 * 终端格式化输出各主流 Memory 方案的核心特性对比。
 * 覆盖维度：存储方式、检索策略、多租户、开源与否等。
 */

interface Solution {
  name: string;
  storage: string;
  retrieval: string;
  multiTenant: string;
  openSource: string;
  selfHosted: string;
  pricing: string;
  highlights: string;
}

const solutions: Solution[] = [
  {
    name: 'Mem0',
    storage: '向量 + 图谱',
    retrieval: '语义搜索 + Graph RAG',
    multiTenant: 'user_id / agent_id',
    openSource: '核心开源 (MIT)',
    selfHosted: '支持',
    pricing: '免费层 + 按量付费',
    highlights: '自动事实提取，冲突检测',
  },
  {
    name: 'Zep',
    storage: '向量 + 时序',
    retrieval: '语义 + 时间衰减',
    multiTenant: 'session / user',
    openSource: '社区版开源',
    selfHosted: '支持',
    pricing: '开源免费 / 云版付费',
    highlights: '对话摘要，实体提取',
  },
  {
    name: 'LangMem (LangChain)',
    storage: '向量 (可插拔)',
    retrieval: '语义搜索',
    multiTenant: 'namespace',
    openSource: '开源 (MIT)',
    selfHosted: '支持',
    pricing: '免费',
    highlights: '与 LangGraph 深度集成',
  },
  {
    name: 'Letta (MemGPT)',
    storage: '分层 (core/archival)',
    retrieval: 'Agent 自主管理',
    multiTenant: 'agent 级别',
    openSource: '开源 (Apache 2.0)',
    selfHosted: '支持',
    pricing: '免费 / 云版付费',
    highlights: 'Agent 自管理内存，无限上下文',
  },
  {
    name: 'Claude Memory (MCP)',
    storage: '文件 + 语义索引',
    retrieval: 'MCP tool 调用',
    multiTenant: '项目目录隔离',
    openSource: '插件开源',
    selfHosted: '本地运行',
    pricing: '免费',
    highlights: '与 Claude Code 深度集成，开发者体验好',
  },
];

// --- 格式化输出 ---

function padRight(str: string, len: number): string {
  const strLen = [...str].length; // 处理中文字符宽度近似
  if (strLen >= len) return str;
  return str + ' '.repeat(len - strLen);
}

function printTable() {
  const columns = [
    { key: 'name' as const, label: '方案', width: 20 },
    { key: 'storage' as const, label: '存储方式', width: 18 },
    { key: 'retrieval' as const, label: '检索策略', width: 22 },
    { key: 'multiTenant' as const, label: '多租户', width: 18 },
    { key: 'openSource' as const, label: '开源', width: 18 },
    { key: 'highlights' as const, label: '核心亮点', width: 30 },
  ];

  // 表头
  const header = columns.map((c) => padRight(c.label, c.width)).join(' | ');
  const separator = columns.map((c) => '-'.repeat(c.width)).join('-+-');

  console.log('\n=== Memory 方案特性对比 ===\n');
  console.log(header);
  console.log(separator);

  // 数据行
  for (const sol of solutions) {
    const row = columns
      .map((c) => padRight(sol[c.key], c.width))
      .join(' | ');
    console.log(row);
  }

  console.log('\n');

  // 补充说明
  console.log('=== 选型建议 ===\n');
  console.log('- 快速接入 + 托管服务 → Mem0 Cloud');
  console.log('- 需要完全自主控制 → Mem0 OSS / Letta 自部署');
  console.log('- 已在 LangChain 生态 → LangMem');
  console.log('- Claude Code 开发者 → Claude Memory MCP 插件');
  console.log('- 需要 Agent 自管理内存 → Letta (MemGPT)');
}

printTable();
