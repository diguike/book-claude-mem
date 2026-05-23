/**
 * Mem0 HTTP API 调用示例
 *
 * Mem0 提供 RESTful API 进行 memory 的增删改查。
 * 本示例展示核心操作：添加记忆、搜索记忆、获取用户所有记忆。
 *
 * API 文档: https://docs.mem0.ai/api-reference
 */

const BASE_URL = process.env.MEM0_BASE_URL || 'https://api.mem0.ai/v1';
const API_KEY = process.env.MEM0_API_KEY || '';

if (!API_KEY) {
  console.error('请设置 MEM0_API_KEY 环境变量');
  process.exit(1);
}

// 通用请求函数
async function mem0Request(
  method: string,
  path: string,
  body?: Record<string, unknown>
) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${API_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mem0 API error ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * 添加记忆
 * Mem0 会自动从对话中提取 facts 并存储
 */
async function addMemory(userId: string, messages: Array<{ role: string; content: string }>) {
  const result = await mem0Request('POST', '/memories/', {
    messages,
    user_id: userId,
  });
  console.log('添加记忆结果:', JSON.stringify(result, null, 2));
  return result;
}

/**
 * 搜索记忆
 * 基于语义相似度从用户的记忆中检索
 */
async function searchMemories(userId: string, query: string) {
  const result = await mem0Request('POST', '/memories/search/', {
    query,
    user_id: userId,
  });
  console.log('搜索结果:', JSON.stringify(result, null, 2));
  return result;
}

/**
 * 获取用户所有记忆
 */
async function getAllMemories(userId: string) {
  const result = await mem0Request('GET', `/memories/?user_id=${userId}`);
  console.log('所有记忆:', JSON.stringify(result, null, 2));
  return result;
}

/**
 * 删除指定记忆
 */
async function deleteMemory(memoryId: string) {
  await mem0Request('DELETE', `/memories/${memoryId}/`);
  console.log(`已删除记忆: ${memoryId}`);
}

// --- Demo 运行 ---

async function main() {
  const userId = 'demo-user-001';

  console.log('=== 1. 添加记忆 ===');
  await addMemory(userId, [
    { role: 'user', content: '我是一个前端工程师，主要用 TypeScript 开发' },
    { role: 'assistant', content: '了解，你是前端工程师，使用 TypeScript 作为主要开发语言。' },
    { role: 'user', content: '对，我现在在学习 LLM 相关的基础设施知识' },
    { role: 'assistant', content: '明白了，你正在学习 LLM 基础设施相关的知识。' },
  ]);

  console.log('\n=== 2. 搜索记忆 ===');
  await searchMemories(userId, '用户的编程语言是什么');

  console.log('\n=== 3. 获取所有记忆 ===');
  await getAllMemories(userId);
}

main().catch(console.error);
