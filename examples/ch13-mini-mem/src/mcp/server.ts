/**
 * MCP Server：暴露 search + get_observations 给 Claude Code
 *
 * 通信方式：JSON-RPC over stdio（Claude Code 启动此进程并通过 stdin/stdout 通信）
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ObservationStore, type Observation } from '../db/store.js';

const server = new Server(
  { name: 'mini-mem-search', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// 注册工具列表
server.setRequestHandler('tools/list' as any, async () => ({
  tools: [
    {
      name: 'search',
      description: 'Search memory observations by keyword. Returns compact index with IDs for further retrieval.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Full-text search query' },
          limit: { type: 'number', description: 'Max results (default 20)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_observations',
      description: 'Fetch full observation details by IDs. Use after search to get complete content.',
      inputSchema: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'number' },
            description: 'Array of observation IDs to fetch',
          },
        },
        required: ['ids'],
      },
    },
  ],
}));

// 处理工具调用
server.setRequestHandler('tools/call' as any, async (request: any) => {
  const { name, arguments: args } = request.params;
  const store = new ObservationStore();

  try {
    if (name === 'search') {
      const results = store.search(args.query as string, (args.limit as number) || 20);
      const text = results.length === 0
        ? 'No observations found matching your query.'
        : formatSearchResults(results);
      return { content: [{ type: 'text', text }] };
    }

    if (name === 'get_observations') {
      const observations = store.getByIds(args.ids as number[]);
      if (observations.length === 0) {
        return { content: [{ type: 'text', text: 'No observations found for given IDs.' }] };
      }
      const text = observations.map(formatFullObservation).join('\n\n---\n\n');
      return { content: [{ type: 'text', text }] };
    }

    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  } finally {
    store.close();
  }
});

function formatSearchResults(results: Observation[]): string {
  const typeIcons: Record<string, string> = {
    'change': '🟢', 'how-it-works': '🔵', 'discovery': '🟣',
    'decision': '🟤', 'bugfix': '🟡', 'gotcha': '🔴',
  };

  let md = '| ID | Type | Title |\n|---|---|---|\n';
  for (const r of results) {
    const icon = typeIcons[r.type] || '🔵';
    md += `| #${r.id} | ${icon} ${r.type} | ${r.title} |\n`;
  }
  md += `\n*Use get_observations tool with IDs above to fetch full details*`;
  return md;
}

function formatFullObservation(obs: Observation): string {
  const files = JSON.parse(obs.files || '[]') as string[];
  const time = new Date(obs.created_at * 1000).toISOString();
  return [
    `**#${obs.id}** [${obs.type}] ${obs.title}`,
    `Time: ${time}`,
    ``,
    obs.narrative,
    files.length > 0 ? `\nFiles: ${files.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
