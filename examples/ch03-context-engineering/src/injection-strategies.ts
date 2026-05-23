// 注入策略对比：全量注入 vs Progressive Disclosure
// 模拟不同场景下两种策略的 token 消耗差异

import { estimateTokens } from './token-counter.js';

interface Observation {
  id: string;
  category: string;
  summary: string;      // 摘要（索引层）
  detail: string;       // 完整内容（详情层）
}

// 模拟 observation 数据
const observations: Observation[] = [
  {
    id: 'obs-001',
    category: 'architecture',
    summary: '项目使用 Next.js 14 App Router',
    detail: '项目使用 Next.js 14 App Router 架构，路由定义在 app/ 目录下。布局组件在 layout.tsx，页面在 page.tsx。使用 Server Components 为默认，Client Components 需显式标记 "use client"。API 路由在 app/api/ 下。',
  },
  {
    id: 'obs-002',
    category: 'database',
    summary: '数据库使用 Supabase PostgreSQL',
    detail: '数据库使用 Supabase 托管的 PostgreSQL。连接字符串存在 .env.local 的 DATABASE_URL。使用 Drizzle ORM，schema 定义在 src/db/schema.ts。迁移文件在 drizzle/ 目录。主要表：users, posts, comments, tags。',
  },
  {
    id: 'obs-003',
    category: 'auth',
    summary: '认证使用 NextAuth.js v5',
    detail: '认证使用 NextAuth.js v5 (Auth.js)。配置在 auth.ts。支持 GitHub 和 Google OAuth provider。Session 策略为 JWT。中间件在 middleware.ts 保护 /dashboard 路由。用户角色存在 session.user.role。',
  },
  {
    id: 'obs-004',
    category: 'deploy',
    summary: '部署在 Vercel，CI/CD 走 GitHub Actions',
    detail: '部署在 Vercel 平台，每次 push main 自动部署。Preview 部署对每个 PR 生效。环境变量在 Vercel Dashboard 配置。CI pipeline 在 .github/workflows/ci.yml，包含 lint、test、type-check 三个步骤。',
  },
  {
    id: 'obs-005',
    category: 'testing',
    summary: '测试使用 Vitest + Testing Library',
    detail: '单元测试使用 Vitest，配置在 vitest.config.ts。组件测试使用 @testing-library/react。E2E 测试使用 Playwright，配置在 playwright.config.ts。测试覆盖率要求 > 80%。运行 npm test 执行所有测试。',
  },
  {
    id: 'obs-006',
    category: 'style',
    summary: '样式使用 Tailwind CSS + shadcn/ui',
    detail: '样式使用 Tailwind CSS v3.4，配置在 tailwind.config.ts。组件库使用 shadcn/ui，组件在 src/components/ui/。主题色定义在 globals.css 的 CSS 变量中。支持 dark mode（class 策略）。',
  },
  {
    id: 'obs-007',
    category: 'api',
    summary: 'API 层使用 tRPC',
    detail: 'API 层使用 tRPC v11，router 定义在 src/server/routers/。AppRouter 类型导出供客户端使用。使用 superjson transformer。中间件包含 auth check 和 rate limiting。客户端使用 @trpc/react-query 集成。',
  },
  {
    id: 'obs-008',
    category: 'state',
    summary: '客户端状态管理用 Zustand',
    detail: '客户端全局状态使用 Zustand。Store 定义在 src/stores/。主要 store：useAuthStore, useUIStore, useCartStore。使用 persist middleware 做本地持久化。服务端状态依赖 TanStack Query（通过 tRPC 集成）。',
  },
];

function simulateFullInjection(obs: Observation[]): number {
  // 全量注入：所有 observation 的完整内容
  const fullContent = obs.map((o) => `[${o.category}] ${o.detail}`).join('\n');
  return estimateTokens(fullContent).estimatedTokens;
}

function simulateProgressiveDisclosure(obs: Observation[], relevantIds: string[]): number {
  // Progressive Disclosure：先注入索引（摘要），再按需展开详情
  const indexContent = obs.map((o) => `- [${o.id}] ${o.summary}`).join('\n');
  const indexTokens = estimateTokens(indexContent).estimatedTokens;

  // 只展开相关的 observation 详情
  const relevantObs = obs.filter((o) => relevantIds.includes(o.id));
  const detailContent = relevantObs.map((o) => `[${o.category}] ${o.detail}`).join('\n');
  const detailTokens = estimateTokens(detailContent).estimatedTokens;

  return indexTokens + detailTokens;
}

function main() {
  console.log('=== 注入策略对比 ===\n');
  console.log(`Observation 总数: ${observations.length}\n`);

  // 场景 1：用户问数据库相关问题，只需要 1-2 条 observation
  const scenario1Relevant = ['obs-002'];
  const fullTokens = simulateFullInjection(observations);
  const pdTokens1 = simulateProgressiveDisclosure(observations, scenario1Relevant);

  console.log('--- 场景 1: 用户问数据库问题 ---');
  console.log(`全量注入 token: ${fullTokens}`);
  console.log(`Progressive Disclosure token: ${pdTokens1}`);
  console.log(`节省: ${fullTokens - pdTokens1} token (${Math.round((1 - pdTokens1 / fullTokens) * 100)}%)`);
  console.log('');

  // 场景 2：用户问部署+测试相关问题，需要 2 条
  const scenario2Relevant = ['obs-004', 'obs-005'];
  const pdTokens2 = simulateProgressiveDisclosure(observations, scenario2Relevant);

  console.log('--- 场景 2: 用户问部署+测试问题 ---');
  console.log(`全量注入 token: ${fullTokens}`);
  console.log(`Progressive Disclosure token: ${pdTokens2}`);
  console.log(`节省: ${fullTokens - pdTokens2} token (${Math.round((1 - pdTokens2 / fullTokens) * 100)}%)`);
  console.log('');

  // 场景 3：用户问全栈架构问题，需要 5 条
  const scenario3Relevant = ['obs-001', 'obs-002', 'obs-003', 'obs-007', 'obs-008'];
  const pdTokens3 = simulateProgressiveDisclosure(observations, scenario3Relevant);

  console.log('--- 场景 3: 用户问全栈架构问题（需要较多上下文）---');
  console.log(`全量注入 token: ${fullTokens}`);
  console.log(`Progressive Disclosure token: ${pdTokens3}`);
  console.log(`节省: ${fullTokens - pdTokens3} token (${Math.round((1 - pdTokens3 / fullTokens) * 100)}%)`);
  console.log('');

  console.log('--- 结论 ---');
  console.log('Progressive Disclosure 的优势随着 observation 总量增大而更加明显。');
  console.log('当只需要少量上下文时（场景 1），节省比例最高。');
  console.log('即使需要较多上下文（场景 3），索引层仍然比全量注入更经济。');
}

main();
