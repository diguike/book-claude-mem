/**
 * 向量搜索：使用 ChromaDB 实现 observation 的语义检索
 *
 * ChromaDB 内置 embedding 能力，无需额外调用 embedding API。
 * 适用于根据自然语言查询召回相关 observation 的场景。
 */

import { ChromaClient } from 'chromadb';

const COLLECTION_NAME = 'observations';

// 初始化 ChromaDB 客户端（连接本地实例）
const chroma = new ChromaClient({
  path: process.env.CHROMA_HOST || 'http://localhost:8000',
});

interface Observation {
  id: string;
  content: string;
  category: string;
  timestamp: string;
}

/**
 * 初始化 collection 并写入 observation 数据
 */
async function seedObservations(observations: Observation[]) {
  // 获取或创建 collection（ChromaDB 默认使用内置 embedding 函数）
  const collection = await chroma.getOrCreateCollection({
    name: COLLECTION_NAME,
    metadata: { description: 'User observation memory store' },
  });

  // 批量添加文档
  await collection.add({
    ids: observations.map((obs) => obs.id),
    documents: observations.map((obs) => obs.content),
    metadatas: observations.map((obs) => ({
      category: obs.category,
      timestamp: obs.timestamp,
    })),
  });

  console.log(`已写入 ${observations.length} 条 observation 到 ChromaDB`);
  return collection;
}

/**
 * 语义搜索：根据自然语言查询返回最相关的 observation
 */
async function semanticSearch(query: string, topK: number = 3) {
  const collection = await chroma.getCollection({ name: COLLECTION_NAME });

  const results = await collection.query({
    queryTexts: [query],
    nResults: topK,
  });

  return results;
}

/**
 * 按 category 过滤 + 语义搜索
 */
async function filteredSearch(
  query: string,
  category: string,
  topK: number = 3
) {
  const collection = await chroma.getCollection({ name: COLLECTION_NAME });

  const results = await collection.query({
    queryTexts: [query],
    nResults: topK,
    where: { category: { $eq: category } },
  });

  return results;
}

// --- Demo 运行 ---

async function main() {
  // 准备测试数据
  const observations: Observation[] = [
    {
      id: 'obs-1',
      content: '用户是前端工程师，主要使用 React 和 TypeScript 开发',
      category: 'background',
      timestamp: '2024-01-10T08:00:00Z',
    },
    {
      id: 'obs-2',
      content: '用户正在写一本关于 LLM 基础设施的技术书籍',
      category: 'project',
      timestamp: '2024-01-12T10:00:00Z',
    },
    {
      id: 'obs-3',
      content: '用户偏好 Cloudflare 部署，数据库选择 Supabase PostgreSQL',
      category: 'preference',
      timestamp: '2024-01-13T14:00:00Z',
    },
    {
      id: 'obs-4',
      content: '用户对 Agent 架构很感兴趣，正在研究多 Agent 协作模式',
      category: 'interest',
      timestamp: '2024-01-15T09:00:00Z',
    },
    {
      id: 'obs-5',
      content: '用户的包管理器是 npm，不用 yarn 或 pnpm',
      category: 'preference',
      timestamp: '2024-01-16T11:00:00Z',
    },
  ];

  // 写入数据
  await seedObservations(observations);

  // 语义搜索示例
  console.log('\n=== 语义搜索：「用户的技术栈是什么」 ===');
  const results1 = await semanticSearch('用户的技术栈是什么');
  results1.documents?.[0]?.forEach((doc, i) => {
    const distance = results1.distances?.[0]?.[i];
    console.log(`  [${i + 1}] (距离: ${distance?.toFixed(4)}) ${doc}`);
  });

  // 带过滤的搜索
  console.log('\n=== 过滤搜索：category=preference, 「部署方式」 ===');
  const results2 = await filteredSearch('部署方式', 'preference');
  results2.documents?.[0]?.forEach((doc, i) => {
    const distance = results2.distances?.[0]?.[i];
    console.log(`  [${i + 1}] (距离: ${distance?.toFixed(4)}) ${doc}`);
  });

  // 清理
  await chroma.deleteCollection({ name: COLLECTION_NAME });
  console.log('\n已清理测试 collection');
}

main().catch(console.error);
