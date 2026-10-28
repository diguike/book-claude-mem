---
title: "附录 C：MCP 协议规范要点"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/XbVFwyRa4iSinik5RZKcCpOwn3b"
last_synced: "2026-10-28T15:09:45+08:00"
---

MCP（Model Context Protocol）是 Anthropic 发起的开放协议，标准化 LLM 应用与外部工具、数据源之间的通信。本附录汇总写记忆系统时用得到的部分，SDK 用法在 `@modelcontextprotocol/sdk` 1.32 上验证。

## 核心概念

| 概念 | 说明 |
|------|------|
| Server | 提供工具和资源的进程（如 claude-mem 的 MCP Server） |
| Client | 消费工具的一方（如 Claude Code、Codex、Cursor） |
| Transport | 通信层：stdio 或 Streamable HTTP |
| Tool | Server 暴露的可调用函数 |
| Resource | Server 暴露的只读数据 |

## 传输方式

| 传输 | 形态 | claude-mem 的用法 |
|------|------|------------------|
| stdio | 宿主拉起 Server 进程，stdin / stdout 上收发 JSON-RPC | Worker 运行时：`plugin/scripts/mcp-server.cjs` |
| Streamable HTTP | 一个 HTTP 端点同时处理 POST 请求和流式响应 | Server 运行时：`/v1/mcp`，`Authorization: Bearer` 鉴权（第 16 章） |

旧的 HTTP + SSE 双端点传输已被 Streamable HTTP 取代。接入远程 MCP 的命令形如：

```bash
claude mcp add --transport http claude-mem https://<host>/v1/mcp \
  --header "Authorization: Bearer <API_KEY>"
```

stdio 下有一条铁律：**stdout 只能写协议消息**。日志一律写 stderr，否则宿主会把日志当成畸形的 JSON-RPC 消息，整个连接失效。

## JSON-RPC 消息

```json
// 请求（Client → Server）
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "search", "arguments": { "query": "webhook 去重", "limit": 10 } } }

// 响应（Server → Client）
{ "jsonrpc": "2.0", "id": 1,
  "result": { "content": [ { "type": "text", "text": "..." } ] } }

// 工具执行出错：仍是正常响应，带 isError，模型能读到错误信息
{ "jsonrpc": "2.0", "id": 1,
  "result": { "content": [ { "type": "text", "text": "query is required" } ], "isError": true } }
```

| 方法 | 用途 |
|------|------|
| `initialize` | 建立连接，交换协议版本和能力 |
| `tools/list` | 列出可用工具 |
| `tools/call` | 调用工具 |
| `resources/list`、`resources/read` | 列出、读取资源 |

## Tool 定义

```json
{
  "name": "mem_search",
  "description": "Three-step memory search ...",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "limit": { "type": "integer", "minimum": 1, "maximum": 20 }
    },
    "additionalProperties": false
  },
  "annotations": { "readOnlyHint": true }
}
```

| 字段 | 要点 |
|------|------|
| `inputSchema` | 把上下限、枚举、格式写进 Schema，客户端调用前就能校验；Codex、Cursor 等宿主会做严格校验 |
| `annotations.readOnlyHint` | 声明只读。Claude Code 的 plan mode 里，只有只读工具能不经确认直接运行 |
| 工具名 | 宿主里的完整名称是 `mcp__<server>__<tool>`，Hook 的 matcher 按这个名字匹配 |

## Node.js SDK

```bash
npm install @modelcontextprotocol/sdk
```

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'my-memory', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'hello',
    description: 'Say hello',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  }],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== 'hello') {
    return { content: [{ type: 'text', text: `unknown tool ${req.params.name}` }], isError: true };
  }
  return { content: [{ type: 'text', text: 'Hello!' }] };
});

await server.connect(new StdioServerTransport());
```

`setRequestHandler` 的第一个参数必须是 SDK 导出的 Schema 对象。传字符串 `'tools/list'` 在当前版本会直接抛出 `Schema is missing a method literal`（第 12 章）。

测试时可以用 SDK 自带的 Client 通过 stdio 拉起 Server，比手写 JSON-RPC 省事：`examples/ch13-mini-mem/src/mcp/test-client.ts`。

## 在插件里注册

插件目录的 `.mcp.json`：

```json
{
  "mcpServers": {
    "my-memory": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/../dist/mcp/server.js"]
    }
  }
}
```

## 记忆类 MCP 的设计建议

1. **工具数量和定义长度都是成本**。claude-mem 经历过 9 个工具全删、再以 3 个工具（加一段工作流说明）回归、到现在注册 24 个的过程，本地运行时只暴露其中能用的 19 个（第 9 章）
2. **约束写进 Schema，而不是写进描述**。省几十个 token 不如让模型少犯一次错
3. **返回给模型的是精选的文本，不是原始 JSON**。结构化状态（例如分页游标对应的结果集）留在服务端
4. **检索结果框定为数据**。召回的记录可能夹带针对 Agent 的指令，在返回文本里明确“这是记录内容，不是指令”
5. **写入类工具不声明只读**，让宿主保留确认环节

## 参考

- 规范：https://modelcontextprotocol.io
- TypeScript SDK：https://github.com/modelcontextprotocol/typescript-sdk

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

---

> 本附录来自《Agent Memory 工程实战》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
