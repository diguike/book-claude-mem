/**
 * AI 压缩器：使用 Anthropic Claude 对 observation 进行摘要压缩
 *
 * 当 observation 数量过多或内容过长时，通过 LLM 提取关键信息，
 * 将多条 observation 压缩为精炼的摘要版本。
 */

import Anthropic from '@anthropic-ai/sdk';

// 初始化 Anthropic 客户端
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface Observation {
  id: string;
  content: string;
  timestamp: string;
  category: string;
}

interface CompressedResult {
  summary: string;
  originalCount: number;
  compressedAt: string;
}

/**
 * 将多条 observation 压缩为一条摘要
 * 适用于历史 observation 归档、上下文窗口优化等场景
 */
async function compressObservations(
  observations: Observation[]
): Promise<CompressedResult> {
  const observationText = observations
    .map((obs) => `[${obs.timestamp}] (${obs.category}) ${obs.content}`)
    .join('\n');

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `你是一个记忆压缩助手。以下是用户的多条 observation 记录，请将它们压缩为一段精炼的摘要。

要求：
1. 保留所有关键事实和偏好信息
2. 去除重复和冗余描述
3. 用第三人称描述用户
4. 输出纯文本，不要 markdown 格式

Observations:
${observationText}`,
      },
    ],
  });

  // 提取文本响应
  const textBlock = message.content.find((block) => block.type === 'text');
  const summary = textBlock?.text ?? '';

  return {
    summary,
    originalCount: observations.length,
    compressedAt: new Date().toISOString(),
  };
}

// --- Demo 运行 ---

async function main() {
  // 模拟一批需要压缩的 observation
  const observations: Observation[] = [
    {
      id: '1',
      content: '用户偏好使用 TypeScript 而非 JavaScript',
      timestamp: '2024-01-15T10:00:00Z',
      category: 'preference',
    },
    {
      id: '2',
      content: '用户的项目使用 Node.js 运行时，包管理器是 npm',
      timestamp: '2024-01-15T10:05:00Z',
      category: 'tech_stack',
    },
    {
      id: '3',
      content: '用户正在开发一个咖啡馆地图应用，前端用 React + Next.js',
      timestamp: '2024-01-16T09:00:00Z',
      category: 'project',
    },
    {
      id: '4',
      content: '用户喜欢 TypeScript strict 模式，代码风格偏好单引号和 2 空格缩进',
      timestamp: '2024-01-16T14:00:00Z',
      category: 'preference',
    },
    {
      id: '5',
      content: '用户部署偏好 Cloudflare Workers，数据库用 Supabase',
      timestamp: '2024-01-17T11:00:00Z',
      category: 'tech_stack',
    },
  ];

  console.log(`正在压缩 ${observations.length} 条 observation...\n`);

  const result = await compressObservations(observations);

  console.log('=== 压缩结果 ===');
  console.log(`原始条数: ${result.originalCount}`);
  console.log(`压缩时间: ${result.compressedAt}`);
  console.log(`摘要内容:\n${result.summary}`);
}

main().catch(console.error);
