---
title: "附录 C：MCP 协议规范要点"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/XbVFwyRa4iSinik5RZKcCpOwn3b"
last_synced: "2026-05-05T16:52:35Z"
---

# 附录 C：MCP 协议规范要点

MCP（Model Context Protocol）是 Anthropic 定义的开放协议，标准化 LLM 与外部工具/数据源的通信。

## 核心概念

| 概念 | 说明 |
|------|------|
| Server | 提供工具和资源的进程（如 claude-mem 的 MCP Server） |
| Client | 消费工具的进程（如 Claude Code） |
| Transport | 通信层（stdio / HTTP SSE） |
| Tool | Server 暴露的可调用函数 |
| Resource | Server 暴露的只读数据 |

## 通信方式

### stdio Transport（claude-mem 使用）

```
Client（Claude Code）←── stdin/stdout（JSON-RPC）──→ Server（MCP Server 进程）
```

- Client 通过 stdin 发送请求
- Server 通过 stdout 返回响应
- 一问一答模式

### HTTP SSE Transport

```
Client ←── HTTP POST（请求）+ SSE（响应流）──→ Server
```

- 适合远程服务器
- 支持流式响应

## JSON-RPC 消息格式

### 请求（Client → Server）

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search",
    "arguments": {
      "query": "authentication bug",
      "limit": 10
    }
  }
}
```

### 响应（Server → Client）

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "| ID | Title |\n|---|---|\n| #1 | Fix auth |"
      }
    ]
  }
}
```

## 核心方法

| 方法 | 用途 |
|------|------|
| `initialize` | 初始化连接，交换能力 |
| `tools/list` | 列出可用工具 |
| `tools/call` | 调用工具 |
| `resources/list` | 列出可用资源 |
| `resources/read` | 读取资源 |

## Tool 定义格式

```json
{
  "name": "search",
  "description": "Search memory observations",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Full-text search query"
      },
      "limit": {
        "type": "number",
        "description": "Max results"
      }
    },
    "required": ["query"]
  }
}
```

## Node.js SDK 快速上手

```bash
npm install @modelcontextprotocol/sdk
```

### 创建 Server

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  { name: 'my-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler('tools/list', async () => ({
  tools: [{ name: 'hello', description: 'Say hello', inputSchema: { type: 'object' } }]
}));

server.setRequestHandler('tools/call', async (req) => {
  return { content: [{ type: 'text', text: 'Hello!' }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### 注册到 Claude Code

在 Plugin 目录的 `.mcp.json` 中：

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/server.js"]
    }
  }
}
```

## 设计建议

1. **工具数量控制在 3-5 个**：每个工具的 description 消耗 Token
2. **用 `additionalProperties: true`**：减少 Schema 的 Token 开销
3. **返回 Markdown 格式**：表格比 JSON 更省 Token 且可读性好
4. **无状态设计**：每次调用独立，不依赖之前的调用

## 参考

- 官方规范：https://modelcontextprotocol.io
- TypeScript SDK：https://github.com/modelcontextprotocol/typescript-sdk

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。
