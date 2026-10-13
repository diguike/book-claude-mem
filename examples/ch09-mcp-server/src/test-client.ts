/**
 * ch09 MCP Server 测试客户端
 *
 * 模拟 Claude 调用 MCP Server 的三个工具。
 * 运行方式：
 *   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | tsx src/server.ts
 *   或直接：tsx src/test-client.ts（通过子进程启动 server）
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, 'server.ts');

// 启动 Server 子进程
const server = spawn('tsx', [serverPath], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

let buffer = '';
const pending = new Map<number, (result: unknown) => void>();
let nextId = 1;

server.stdout!.on('data', (chunk: Buffer) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line) as { id: number; result?: unknown; error?: unknown };
      const resolve = pending.get(msg.id);
      if (resolve) { pending.delete(msg.id); resolve(msg); }
    } catch { /* ignore */ }
  }
});

function call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    const req = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    server.stdin!.write(req);
  });
}

async function main() {
  console.log('=== MCP Server 测试客户端 ===\n');

  // 1. 初始化握手
  const init = await call('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  });
  console.log('1. 初始化握手:');
  console.log(JSON.stringify((init as { result: unknown }).result, null, 2));

  // 2. 列出工具
  const toolsList = await call('tools/list');
  const tools = ((toolsList as { result: { tools: { name: string }[] } }).result.tools);
  console.log('\n2. 工具列表:');
  for (const t of tools) console.log(`   - ${t.name}`);

  // 3. 调用 search
  const searchResult = await call('tools/call', {
    name: 'search',
    arguments: { query: '连接', limit: 3 },
  });
  console.log('\n3. search("连接", limit=3):');
  console.log(((searchResult as { result: { content: { text: string }[] } }).result.content[0].text));

  // 4. 调用 get_observations
  const getResult = await call('tools/call', {
    name: 'get_observations',
    arguments: { ids: [1, 2] },
  });
  console.log('\n4. get_observations([1, 2]):');
  const obsData = JSON.parse(((getResult as { result: { content: { text: string }[] } }).result.content[0].text)) as { observations: { id: number; title: string; narrative: string }[] };
  for (const obs of obsData.observations) {
    console.log(`   #${obs.id}: ${obs.title}`);
    console.log(`   ${obs.narrative.slice(0, 80)}...`);
  }

  // 5. 调用 timeline
  const timelineResult = await call('tools/call', {
    name: 'timeline',
    arguments: { anchor: 3, before: 2, after: 2 },
  });
  console.log('\n5. timeline(anchor=3, before=2, after=2):');
  const tlData = JSON.parse(((timelineResult as { result: { content: { text: string }[] } }).result.content[0].text)) as { before: { id: number; title: string }[]; anchor: { id: number; title: string }; after: { id: number; title: string }[] };
  for (const obs of tlData.before) console.log(`   [before] #${obs.id}: ${obs.title}`);
  console.log(`   [anchor] #${tlData.anchor.id}: ${tlData.anchor.title}`);
  for (const obs of tlData.after) console.log(`   [after]  #${obs.id}: ${obs.title}`);

  // 6. mem_search：三步渐进搜索，服务端强制只能选上一步出现过的 ID
  const text = (r: unknown) => {
    const m = r as { result?: { content: { text: string }[] }; error?: { message: string } };
    return m.error ? { error: m.error.message } : JSON.parse(m.result!.content[0].text);
  };
  console.log('\n6. mem_search 三步协议:');
  const s1 = text(await call('tools/call', { name: 'mem_search', arguments: { query: '连接' } }));
  console.log(`   step 1：索引 ${s1.index.map((r: { id: number }) => r.id).join(', ')}，continuation=${s1.continuation}`);
  const s2 = text(await call('tools/call', { name: 'mem_search', arguments: { continuation: s1.continuation, selectedIds: [s1.index[0].id] } }));
  console.log(`   step 2：时间线 ${s2.index.map((r: { id: number }) => r.id).join(', ')}`);
  const s3 = text(await call('tools/call', { name: 'mem_search', arguments: { continuation: s2.continuation, selectedIds: [s2.index[0].id] } }));
  console.log(`   step 3：${s3.note} 取到 ${s3.observations.length} 条详情：${s3.observations.map((o: { title: string }) => o.title).join('；')}`);
  const again = text(await call('tools/call', { name: 'mem_search', arguments: { query: '连接' } }));
  const bad = text(await call('tools/call', { name: 'mem_search', arguments: { continuation: again.continuation, selectedIds: [999] } }));
  console.log(`   选了一个没披露过的 ID：${bad.error}`);
  const reuse = text(await call('tools/call', { name: 'mem_search', arguments: { continuation: s1.continuation, selectedIds: [s1.index[0].id] } }));
  console.log(`   重复使用已经用过的游标：${reuse.error}`);

  console.log('\n=== 测试完成 ===');
  server.stdin!.end();
  server.kill();
}

main().catch(console.error);
