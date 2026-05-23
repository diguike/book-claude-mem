/**
 * 第 1 章配套代码：Memory 策略效率对比
 *
 * 演示三种不同的 Memory 检索策略在 Token 消耗和信息命中率上的差异：
 * 1. 全量注入（Dump Everything）
 * 2. 传统 RAG（Pre-Inference Retrieval）
 * 3. Progressive Disclosure（claude-mem 的做法）
 */

import { encoding_for_model } from 'tiktoken';

// 模拟 50 条历史 Observation 数据
interface Observation {
  id: number;
  type: 'decision' | 'bugfix' | 'discovery' | 'change' | 'how-it-works';
  title: string;
  narrative: string;
  facts: string[];
  files: string[];
  tokens: number; // 完整内容的 Token 数
}

// 生成模拟数据
function generateObservations(count: number): Observation[] {
  const types: Observation['type'][] = ['decision', 'bugfix', 'discovery', 'change', 'how-it-works'];
  const observations: Observation[] = [];

  for (let i = 0; i < count; i++) {
    const type = types[i % types.length];
    const narrative = generateNarrative(type, i);
    observations.push({
      id: i + 1,
      type,
      title: generateTitle(type, i),
      narrative,
      facts: [`事实 ${i}-1: 具体的技术细节描述`, `事实 ${i}-2: 相关的实现约束`],
      files: [`src/module-${i % 10}/index.ts`],
      tokens: estimateTokens(narrative),
    });
  }

  return observations;
}

function generateTitle(type: string, index: number): string {
  const titles: Record<string, string[]> = {
    decision: ['选用 PostgreSQL 存储用户数据', '采用 JWT 而非 Session 认证', '使用 BullMQ 作为任务队列'],
    bugfix: ['修复登录超时导致的 500 错误', '解决并发写入的竞态条件', '修复 WebSocket 重连逻辑'],
    discovery: ['发现 FTS5 性能瓶颈在大表上', '确认 WAL 模式支持并发读写', '找到内存泄漏的根因'],
    change: ['重构认证中间件为 Plugin 模式', '将同步处理改为异步队列', '数据库从 MySQL 迁移到 PostgreSQL'],
    'how-it-works': ['Hook 系统通过 stdin 传递数据', 'Worker 通过 PID 文件管理生命周期', 'MCP 使用 JSON-RPC over stdio'],
  };
  const list = titles[type] || titles.decision;
  return list[index % list.length];
}

function generateNarrative(type: string, index: number): string {
  // 模拟一段 200-500 字的叙述
  return `这是第 ${index + 1} 条 ${type} 类型的观察记录。在实际项目中，这里会包含 200-500 字的详细叙述，描述发生了什么、为什么这样做、以及相关的技术上下文。这段内容通常是从原始 Tool Usage（可能有几千字的 diff 或命令输出）中由 AI 压缩提取得到的精华信息。它需要足够完整以便后续参考，同时足够精炼以避免浪费 Token。`;
}

function estimateTokens(text: string): number {
  // 粗略估算：中英混合文本约 1.5 字/token
  return Math.ceil(text.length / 1.5);
}

// === 策略 1：全量注入 ===
function strategyDumpAll(observations: Observation[]): {
  totalTokens: number;
  relevantTokens: number;
  relevantCount: number;
} {
  // 将所有 Observation 的完整内��注入上下文
  let totalTokens = 0;
  for (const obs of observations) {
    totalTokens += obs.tokens;
    // 加上元数据的 Token 开销
    totalTokens += 20; // type, title, files 等
  }

  // 假设当前任务只与 3 条记录相关
  const relevantCount = 3;
  const relevantTokens = observations.slice(0, relevantCount).reduce((sum, o) => sum + o.tokens, 0);

  return { totalTokens, relevantTokens, relevantCount };
}

// === 策略 2：传�� RAG（Top-K 检索） ===
function strategyRAG(observations: Observation[], k: number = 10): {
  totalTokens: number;
  relevantTokens: number;
  relevantCount: number;
} {
  // 向量检索 Top-K 条，注入完整内容
  const retrieved = observations.slice(0, k); // 模拟 Top-K
  let totalTokens = 0;
  for (const obs of retrieved) {
    totalTokens += obs.tokens + 20;
  }

  // RAG 的准确率约 30%（10 条中 3 条真正相关）
  const relevantCount = Math.ceil(k * 0.3);
  const relevantTokens = retrieved.slice(0, relevantCount).reduce((sum, o) => sum + o.tokens, 0);

  return { totalTokens, relevantTokens, relevantCount };
}

// === 策略 3：Progressive Disclosure ===
function strategyProgressiveDisclosure(observations: Observation[]): {
  totalTokens: number;
  relevantTokens: number;
  relevantCount: number;
  indexTokens: number;
  fetchedTokens: number;
} {
  // Layer 1: 注入索引（每条约 15 Token：ID + time + type + title + token_count）
  const indexTokensPerItem = 15;
  const indexTokens = observations.length * indexTokensPerItem;

  // Agent 查看索引后，选择 3 条最相关的获取详情
  const fetchedCount = 3;
  const fetchedTokens = observations.slice(0, fetchedCount).reduce((sum, o) => sum + o.tokens + 20, 0);

  const totalTokens = indexTokens + fetchedTokens;
  const relevantTokens = fetchedTokens; // Agent 选择的全部是相关的

  return { totalTokens, relevantTokens, relevantCount: fetchedCount, indexTokens, fetchedTokens };
}

// === 运行对比 ===
function main() {
  const observations = generateObservations(50);

  console.log('=== Agent Memory 策略效率对比 ===\n');
  console.log(`模拟数据：${observations.length} 条历史 Observation`);
  console.log(`假设当前任务与其中 3 条相关\n`);
  console.log('─'.repeat(60));

  // 策略 1
  const dump = strategyDumpAll(observations);
  const dumpSNR = ((dump.relevantTokens / dump.totalTokens) * 100).toFixed(1);
  console.log('\n📋 策略 1：全量注入（Dump Everything）');
  console.log(`  总消耗 Token：${dump.totalTokens}`);
  console.log(`  有效 Token：${dump.relevantTokens}`);
  console.log(`  信噪比（SNR）：${dumpSNR}%`);
  console.log(`  评价：浪费严重，大量不相关信息稀释注意力`);

  // 策略 2
  const rag = strategyRAG(observations, 10);
  const ragSNR = ((rag.relevantTokens / rag.totalTokens) * 100).toFixed(1);
  console.log('\n🔍 策略 2：传统 RAG（Top-10 检索）');
  console.log(`  总消耗 Token：${rag.totalTokens}`);
  console.log(`  有效 Token：${rag.relevantTokens}`);
  console.log(`  信噪比（SNR）：${ragSNR}%`);
  console.log(`  评价：比全量好，但准确率受 Embedding 质量限制`);

  // 策略 3
  const pd = strategyProgressiveDisclosure(observations);
  const pdSNR = ((pd.relevantTokens / pd.totalTokens) * 100).toFixed(1);
  console.log('\n✨ 策略 3：Progressive Disclosure（claude-mem 方式）');
  console.log(`  索引 Token：${pd.indexTokens}（${observations.length} 条标题）`);
  console.log(`  按需获取 Token：${pd.fetchedTokens}（${pd.relevantCount} 条完整内容）`);
  console.log(`  总消耗 Token：${pd.totalTokens}`);
  console.log(`  有效 Token：${pd.relevantTokens}`);
  console.log(`  信噪比（SNR）：${pdSNR}%`);
  console.log(`  评价：Agent 自主选择，几乎 100% 相关`);

  // 对比总结
  console.log('\n' + '─'.repeat(60));
  console.log('\n📊 对比总结：');
  console.log(`  全量注入 vs Progressive Disclosure：`);
  console.log(`    Token 节省：${((1 - pd.totalTokens / dump.totalTokens) * 100).toFixed(0)}%`);
  console.log(`    SNR 提升：${dumpSNR}% → ${pdSNR}%`);
  console.log(`\n  RAG vs Progressive Disclosure：`);
  console.log(`    Token 节省：${((1 - pd.totalTokens / rag.totalTokens) * 100).toFixed(0)}%`);
  console.log(`    SNR 提升：${ragSNR}% → ${pdSNR}%`);

  console.log('\n💡 核心洞察：');
  console.log('  Progressive Disclosure 的优势不在于"检索更准"，');
  console.log('  而在于"让 Agent 自己决定需要什么"——');
  console.log('  系统只需提供低成本的索引，Agent 自带最准确的相关性判断。');
}

main();
