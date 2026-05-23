// 模拟 claude-mem 4 层架构的最小 Demo
// Layer 1: Hook（stdin 输入）
// Layer 2: CLI（解析 + 路由）
// Layer 3: Worker（HTTP 服务处理）
// Layer 4: Storage（内存模拟 SQLite）

import * as http from 'node:http';

// === Layer 4: Storage ===
// 用内存 Map 模拟 SQLite 存储

interface StoredObservation {
  id: number;
  content: string;
  category: string;
  created_at: string;
}

const storage: Map<number, StoredObservation> = new Map();
let nextId = 1;

function storageInsert(content: string, category: string): StoredObservation {
  const obs: StoredObservation = {
    id: nextId++,
    content,
    category,
    created_at: new Date().toISOString(),
  };
  storage.set(obs.id, obs);
  return obs;
}

function storageQuery(keyword: string): StoredObservation[] {
  const results: StoredObservation[] = [];
  for (const obs of storage.values()) {
    if (obs.content.includes(keyword)) {
      results.push(obs);
    }
  }
  return results;
}

// === Layer 3: Worker (HTTP Server) ===

const WORKER_PORT = 17777; // 使用非常规端口避免冲突

function startWorker(): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/observe') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          const { content, category } = JSON.parse(body);
          const obs = storageInsert(content, category);
          console.log(`  [Worker] 存储 observation #${obs.id}: "${content}"`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, id: obs.id }));
        });
      } else if (req.method === 'GET' && req.url?.startsWith('/search')) {
        const url = new URL(req.url, `http://localhost:${WORKER_PORT}`);
        const keyword = url.searchParams.get('q') || '';
        const results = storageQuery(keyword);
        console.log(`  [Worker] 搜索 "${keyword}"，命中 ${results.length} 条`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results }));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    server.listen(WORKER_PORT, () => {
      console.log(`  [Worker] 启动在 http://localhost:${WORKER_PORT}`);
      resolve(server);
    });
  });
}

// === Layer 2: CLI（解析 + 路由） ===

async function cliProcess(hookOutput: string): Promise<void> {
  console.log(`  [CLI] 收到 Hook 输出，解析中...`);

  // 解析 Hook 输出格式: "OBSERVE|category|content"
  const parts = hookOutput.split('|');
  if (parts[0] === 'OBSERVE' && parts.length === 3) {
    const [, category, content] = parts;
    console.log(`  [CLI] 识别为 OBSERVE 指令，转发给 Worker`);

    // 发送 HTTP 请求到 Worker
    const response = await fetch(`http://localhost:${WORKER_PORT}/observe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, category }),
    });
    const result = await response.json();
    console.log(`  [CLI] Worker 返回: ${JSON.stringify(result)}`);
  } else if (parts[0] === 'SEARCH' && parts.length === 2) {
    const keyword = parts[1];
    console.log(`  [CLI] 识别为 SEARCH 指令，查询 Worker`);

    const response = await fetch(`http://localhost:${WORKER_PORT}/search?q=${encodeURIComponent(keyword)}`);
    const result = await response.json();
    console.log(`  [CLI] 搜索结果: ${JSON.stringify(result, null, 2)}`);
  }
}

// === Layer 1: Hook（模拟 stdin 输入） ===

function simulateHook(eventType: string, payload: Record<string, string>): string {
  console.log(`  [Hook] 收到事件: ${eventType}`);

  // Hook 将事件转化为 CLI 可处理的格式
  if (eventType === 'PostToolUse') {
    const { tool, result } = payload;
    // 模拟从工具调用结果中提取有价值的 observation
    return `OBSERVE|tool_usage|${tool}: ${result}`;
  } else if (eventType === 'SessionStart') {
    return `SEARCH|${payload.query || 'project'}`;
  }

  return '';
}

// === Main: 串联演示 ===

async function main() {
  console.log('=== claude-mem 4 层架构 Mini Demo ===\n');

  // 1. 启动 Worker
  console.log('[Step 1] 启动 Worker 层...');
  const server = await startWorker();
  console.log('');

  // 2. 模拟几次 Hook 事件 -> CLI -> Worker -> Storage
  console.log('[Step 2] 模拟 PostToolUse 事件...');
  const hookOutput1 = simulateHook('PostToolUse', {
    tool: 'Read',
    result: '读取了 package.json，项目使用 Next.js 14',
  });
  await cliProcess(hookOutput1);
  console.log('');

  console.log('[Step 3] 模拟第二次 PostToolUse 事件...');
  const hookOutput2 = simulateHook('PostToolUse', {
    tool: 'Bash',
    result: '运行 npm test，所有测试通过',
  });
  await cliProcess(hookOutput2);
  console.log('');

  console.log('[Step 4] 模拟 SessionStart 事件（触发搜索）...');
  const hookOutput3 = simulateHook('SessionStart', { query: 'Next.js' });
  await cliProcess(hookOutput3);
  console.log('');

  // 3. 展示最终存储状态
  console.log('[Final] Storage 中的数据:');
  for (const obs of storage.values()) {
    console.log(`  #${obs.id} [${obs.category}] ${obs.content} (${obs.created_at})`);
  }

  // 清理
  server.close();
  console.log('\nDemo 结束，Worker 已关闭。');
}

main();
