/**
 * 第 18 章配套代码：遗忘算法 Demo
 *
 * 基于 Ebbinghaus 遗忘曲线思路，为 Observation 计算"保留分数"。
 * 分数越高越应该保留在索引中，分数越低越应该被归档或删除。
 *
 * 运行：npx tsx src/retention-demo.ts
 */

// 类型对应的基础重要性权重
const TYPE_IMPORTANCE: Record<string, number> = {
  'decision': 10,        // 架构决策最重要，衰减最慢
  'gotcha': 8,           // 陷阱长期有效
  'trade-off': 7,        // 折中方案需要持续记忆
  'problem-solution': 5, // Bug 修复中等重要
  'what-changed': 3,     // 变更记录
  'how-it-works': 2,     // 技术原理
  'discovery': 2,        // 学习洞察
};

interface ObservationWeight {
  id: number;
  title: string;
  type: string;
  createdAt: number;      // Unix timestamp
  lastAccessedAt: number; // 最后被 fetch 的时间（0 = 从未被访问）
  accessCount: number;    // 被检索次数
}

/**
 * 计算保留分数
 *
 * 公式：baseImportance × log2(1 + accessCount) × exp(-age/180) × (1 + recencyBonus)
 *
 * - baseImportance：由 type 决定，decision=10, discovery=2
 * - accessCount：对数增长，防止高频刷分
 * - age：以天为单位，180天半衰期（约6个月后分数减半）
 * - recencyBonus：30天内被访问过有加分
 */
function calculateRetentionScore(weight: ObservationWeight, now: number): number {
  const ageInDays = (now - weight.createdAt) / 86400;
  const baseImportance = TYPE_IMPORTANCE[weight.type] || 2;

  // 访问频率加成（对数增长，1次=1.0, 4次=2.32, 16次=4.09）
  const accessBonus = Math.log2(1 + weight.accessCount);

  // 时间衰减（指数衰减，180天半衰期）
  const timeDecay = Math.exp(-ageInDays / 180);

  // 近期访问加成（30天内访问过 = 最多 +1.0）
  let recencyBonus = 0;
  if (weight.lastAccessedAt > 0) {
    const daysSinceAccess = (now - weight.lastAccessedAt) / 86400;
    recencyBonus = Math.max(0, 1 - daysSinceAccess / 30);
  }

  return baseImportance * (1 + accessBonus) * timeDecay * (1 + recencyBonus);
}

/**
 * 根据分数决定处理策略
 */
function getRetentionStrategy(score: number): { action: string; emoji: string } {
  if (score > 5.0) return { action: '始终展示在索引中', emoji: '🟢' };
  if (score > 2.0) return { action: '仅在搜索时出现', emoji: '🟡' };
  if (score > 0.5) return { action: '归档（不参与搜索，可手动恢复）', emoji: '🟠' };
  return { action: '可安全删除', emoji: '🔴' };
}

// === Demo 数据 ===
function main() {
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;

  const observations: ObservationWeight[] = [
    {
      id: 1,
      title: '选用 PostgreSQL 做主存储',
      type: 'decision',
      createdAt: now - 30 * DAY,  // 30天前
      lastAccessedAt: now - 2 * DAY, // 2天前被查看
      accessCount: 5,
    },
    {
      id: 2,
      title: '修复连接池泄漏',
      type: 'problem-solution',
      createdAt: now - 90 * DAY,  // 90天前
      lastAccessedAt: now - 60 * DAY, // 60天前
      accessCount: 2,
    },
    {
      id: 3,
      title: 'jwt.sign 必须异步调用',
      type: 'gotcha',
      createdAt: now - 180 * DAY, // 半年前
      lastAccessedAt: now - 7 * DAY, // 一周前还被查看（说明仍有价值）
      accessCount: 8,
    },
    {
      id: 4,
      title: '读取 package.json 查看依赖',
      type: 'how-it-works',
      createdAt: now - 200 * DAY, // 200天前
      lastAccessedAt: 0,           // 从未被访问
      accessCount: 0,
    },
    {
      id: 5,
      title: 'API 响应时间从 2s 优化到 200ms',
      type: 'discovery',
      createdAt: now - 365 * DAY, // 一年前
      lastAccessedAt: 0,
      accessCount: 0,
    },
    {
      id: 6,
      title: '用 BullMQ 替代 setTimeout 做队列',
      type: 'decision',
      createdAt: now - 7 * DAY,   // 一周前
      lastAccessedAt: now - 1 * DAY,
      accessCount: 3,
    },
  ];

  console.log('=== Observation 保留分数计算 ===\n');
  console.log('公式：baseImportance × log2(1+access) × exp(-age/180) × (1+recency)\n');
  console.log('─'.repeat(80));

  const results = observations.map(obs => {
    const score = calculateRetentionScore(obs, now);
    const strategy = getRetentionStrategy(score);
    return { ...obs, score, strategy };
  });

  // 按分数降序排列
  results.sort((a, b) => b.score - a.score);

  for (const r of results) {
    const ageStr = `${Math.round((now - r.createdAt) / DAY)}d ago`;
    console.log(`${r.strategy.emoji} #${r.id} [${r.type}] ${r.title}`);
    console.log(`   Score: ${r.score.toFixed(2)} | Age: ${ageStr} | Access: ${r.accessCount}x | Strategy: ${r.strategy.action}`);
    console.log('');
  }

  console.log('─'.repeat(80));
  console.log('\n📊 策略分布：');
  const groups = {
    '🟢 始终展示': results.filter(r => r.score > 5.0).length,
    '🟡 仅搜索': results.filter(r => r.score > 2.0 && r.score <= 5.0).length,
    '🟠 归档': results.filter(r => r.score > 0.5 && r.score <= 2.0).length,
    '🔴 可删除': results.filter(r => r.score <= 0.5).length,
  };
  for (const [label, count] of Object.entries(groups)) {
    console.log(`   ${label}: ${count} 条`);
  }

  console.log('\n💡 洞察：');
  console.log('  - "decision" 类型即使很久前创建，只要被访问过，分数仍然很高');
  console.log('  - "how-it-works" 类型如果从未被访问，会快速衰减到可删除状态');
  console.log('  - 近期访问（30天内）能显著提升保留分数（recencyBonus）');
}

main();
