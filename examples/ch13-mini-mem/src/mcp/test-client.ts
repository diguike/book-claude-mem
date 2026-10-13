/**
 * 用 MCP SDK 的 Client 启动 mini-mem 的 MCP Server，走一遍 initialize → tools/list → tools/call
 * 运行：npm run test:search（会先写入几条测试数据）
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { ObservationStore } from '../db/store.js';

// 准备数据：英文、中文、中英粘连各一条
const store = new ObservationStore();
const seed = [
  { title: 'Fix connection pool leak in checkout API', type: 'bugfix', narrative: 'release() moved into finally' },
  { title: '修复连接池泄漏导致的 5xx', type: 'bugfix', narrative: '错误路径没有释放连接' },
  { title: 'payload优先使用LLM返回的字段', type: 'decision', narrative: '解析失败时才回退到正则' },
];
for (const s of seed) {
  store.insertObservation({ sessionId: 'mcp-test', project: 'demo', type: s.type, title: s.title, narrative: s.narrative, files: [] });
}
store.close();

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(import.meta.dirname, 'server.js')],
  env: { ...process.env } as Record<string, string>,
});
const client = new Client({ name: 'mini-mem-test', version: '1.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log('tools:', tools.map(t => `${t.name}${t.annotations?.readOnlyHint ? '(readOnly)' : ''}`).join(', '));

for (const query of ['connection pool', '连接池', 'payload']) {
  const res = await client.callTool({ name: 'search', arguments: { query, limit: 5 } });
  const text = (res.content as Array<{ type: string; text: string }>)[0].text;
  console.log(`\nsearch("${query}"):\n${text}`);
}

const first = await client.callTool({ name: 'search', arguments: { query: '连接池' } });
const id = Number(/\[(\d+)\]/.exec((first.content as Array<{ text: string }>)[0].text)?.[1]);
const detail = await client.callTool({ name: 'get_observations', arguments: { ids: [id] } });
console.log(`\nget_observations([${id}]):\n${(detail.content as Array<{ text: string }>)[0].text}`);

await client.close();
