/**
 * 第 20 章：三种“遗忘”策略对比
 *  A. claude-mem 默认（CLAUDE_MEM_REINFORCE_ALPHA=0）：取最新的 N 条
 *  B. claude-mem ACT-R 排序（ALPHA>0）：逐行移植自 src/services/reinforcement/rank.ts（v13.35.0）
 *  C. 本书第一版设想的指数衰减保留分数
 * 运行：npm run demo
 */

const DAY = 86_400_000;
const ACT_R_DECAY = 0.5;
const POOL_MULTIPLIER = 5;
const POOL_CAP = 500;

interface Obs {
  id: number;
  title: string;
  type: string;
  created_at_epoch: number;
  reinforcement_dates: string; // JSON 数组，ISO 日期
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const ageDays = (iso: string, today: Date) => Math.max(1, Math.floor((today.getTime() - Date.parse(iso)) / DAY));

// ---- B：claude-mem 的实现 ----
function blendedScore(item: Obs, today: Date, alpha: number): number {
  const created = Math.pow(Math.max(1, Math.floor((today.getTime() - item.created_at_epoch) / DAY)), -ACT_R_DECAY);
  const creationDay = isoDay(new Date(item.created_at_epoch));
  let sum = 0;
  for (const day of JSON.parse(item.reinforcement_dates) as string[]) {
    if (day !== creationDay) sum += Math.pow(ageDays(day, today), -ACT_R_DECAY);
  }
  return Math.log(1 + created + alpha * sum);
}

const poolSize = (count: number, alpha: number) =>
  !(alpha > 0) || count >= POOL_CAP ? count : Math.min(POOL_CAP, Math.max(count, count * POOL_MULTIPLIER));
const recencyHeadSize = (count: number) => Math.max(1, Math.ceil(count / 4));

function rankByStrength(pool: Obs[], count: number, alpha: number, today: Date): Obs[] {
  if (pool.length <= count) return pool;
  if (!(alpha > 0)) return pool.slice(0, count);
  const head = pool.slice(0, Math.min(count, recencyHeadSize(count))); // 最新的 1/4 原样保留
  const scored = pool.slice(head.length).map((item, i) => ({ item, i, score: blendedScore(item, today, alpha) }));
  scored.sort((a, b) => b.score - a.score || b.item.created_at_epoch - a.item.created_at_epoch || a.i - b.i);
  return [...head, ...scored.slice(0, count - head.length).map(s => s.item)].sort((a, b) => b.created_at_epoch - a.created_at_epoch);
}

// ---- C：第一版设想（指数衰减，180 天时间常数；访问次数用强化次数代替） ----
const TYPE_IMPORTANCE: Record<string, number> = { decision: 10, security_alert: 8, bugfix: 5, feature: 4, change: 3, discovery: 2 };
function retentionScore(o: Obs, today: Date): number {
  const age = (today.getTime() - o.created_at_epoch) / DAY;
  const hits = (JSON.parse(o.reinforcement_dates) as string[]).length;
  return (TYPE_IMPORTANCE[o.type] ?? 2) * (1 + Math.log2(1 + hits)) * Math.exp(-age / 180);
}

// ---- 数据：20 条观察，越靠前越新 ----
const today = new Date('2026-10-12T00:00:00Z');
const daysAgo = (n: number) => today.getTime() - n * DAY;
const dates = (...ns: number[]) => JSON.stringify(ns.map(n => isoDay(new Date(daysAgo(n)))));

const raw: Array<[string, string, number, string]> = [
  ['改了 README 的徽章', 'change', 1, '[]'],
  ['调整日志级别', 'change', 2, '[]'],
  ['升级 eslint 配置', 'change', 3, '[]'],
  ['重命名测试文件', 'change', 4, '[]'],
  ['修复 CI 缓存键', 'bugfix', 5, '[]'],
  ['补充类型注解', 'change', 6, '[]'],
  ['调整 Prettier 行宽', 'change', 8, '[]'],
  ['删除废弃脚本', 'change', 9, '[]'],
  ['更新依赖锁文件', 'change', 11, '[]'],
  ['拆分 utils 目录', 'change', 13, '[]'],
  ['修正 changelog 格式', 'change', 15, '[]'],
  ['本地端口冲突换成 3001', 'change', 20, '[]'],
  ['webhook 必须按事件 ID 去重', 'decision', 120, dates(120, 60, 21, 7, 2)],
  ['生产库禁止在事务里调外部 API', 'decision', 200, dates(200, 90, 30, 3)],
  ['订单导出改成流式', 'feature', 45, '[]'],
  ['Redis 必须配 noeviction', 'security_alert', 150, dates(150, 14)],
  ['老的部署脚本已经停用', 'discovery', 300, '[]'],
  ['发版前跑一遍迁移回滚', 'decision', 400, dates(400, 180, 40, 10, 1)],
  ['试过 pnpm 后回退到 npm', 'change', 250, '[]'],
  ['一次性排查记录：某个 flaky 测试', 'bugfix', 60, '[]'],
];
const all: Obs[] = raw
  .map(([title, type, ago, rd], i) => ({ id: i + 1, title, type, created_at_epoch: daysAgo(ago), reinforcement_dates: rd }))
  .sort((a, b) => b.created_at_epoch - a.created_at_epoch);

const COUNT = 8;
const label = (o: Obs) => `${o.title}（${Math.round((today.getTime() - o.created_at_epoch) / DAY)} 天前，强化 ${(JSON.parse(o.reinforcement_dates) as string[]).length} 次）`;

console.log(`=== 开场索引只能放 ${COUNT} 条，从 ${all.length} 条里选 ===\n`);

console.log('A. 默认（ALPHA=0）：最新的 8 条');
for (const o of rankByStrength(all.slice(0, poolSize(COUNT, 0)), COUNT, 0, today)) console.log(`   ${label(o)}`);

console.log(`\nB. ACT-R（ALPHA=1）：候选池 ${poolSize(COUNT, 1)} 条，最新 ${recencyHeadSize(COUNT)} 条原样保留，其余按强度`);
for (const o of rankByStrength(all.slice(0, poolSize(COUNT, 1)), COUNT, 1, today)) console.log(`   ${label(o)}  score=${blendedScore(o, today, 1).toFixed(3)}`);

console.log('\nC. 第一版设想：指数衰减保留分数，取最高的 8 条');
for (const o of [...all].sort((a, b) => retentionScore(b, today) - retentionScore(a, today)).slice(0, COUNT)) {
  console.log(`   ${label(o)}  score=${retentionScore(o, today).toFixed(2)}`);
}

console.log('\n=== 两种衰减曲线 ===');
console.log('  天数    幂律 t^-0.5    指数 e^(-t/180)');
for (const t of [1, 7, 30, 90, 180, 365, 730]) {
  console.log(`  ${String(t).padStart(4)}    ${Math.pow(t, -ACT_R_DECAY).toFixed(3).padStart(10)}    ${Math.exp(-t / 180).toFixed(3).padStart(14)}`);
}
