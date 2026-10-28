---
title: "Appendix C: MCP Protocol Essentials"
---

MCP (Model Context Protocol) is an open protocol started by Anthropic that standardizes communication between LLM applications and external tools and data sources. This appendix collects the parts you'll need when writing a memory system. SDK usage was verified on `@modelcontextprotocol/sdk` 1.32.

## Core Concepts

| Concept | Description |
|------|------|
| Server | The process that provides tools and resources (such as claude-mem's MCP server) |
| Client | The side that consumes tools (such as Claude Code, Codex, Cursor) |
| Transport | The communication layer: stdio or Streamable HTTP |
| Tool | A callable function the server exposes |
| Resource | Read-only data the server exposes |

## Transports

| Transport | Shape | How claude-mem uses it |
|------|------|------------------|
| stdio | The host starts the server process and exchanges JSON-RPC over stdin / stdout | Worker runtime: `plugin/scripts/mcp-server.cjs` |
| Streamable HTTP | One HTTP endpoint handles both POST requests and streamed responses | Server runtime: `/v1/mcp`, authenticated with `Authorization: Bearer` (Chapter 16) |

The old two-endpoint HTTP + SSE transport has been superseded by Streamable HTTP. The command to connect a remote MCP server looks like this:

```bash
claude mcp add --transport http claude-mem https://<host>/v1/mcp \
  --header "Authorization: Bearer <API_KEY>"
```

There's one hard rule under stdio: **stdout carries protocol messages and nothing else.** All logging goes to stderr. Otherwise the host treats your log lines as malformed JSON-RPC messages and the whole connection breaks.

## JSON-RPC Messages

```json
// Request (client → server)
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "search", "arguments": { "query": "webhook dedup", "limit": 10 } } }

// Response (server → client)
{ "jsonrpc": "2.0", "id": 1,
  "result": { "content": [ { "type": "text", "text": "..." } ] } }

// Tool execution error: still a normal response, with isError, so the model can read the error message
{ "jsonrpc": "2.0", "id": 1,
  "result": { "content": [ { "type": "text", "text": "query is required" } ], "isError": true } }
```

| Method | Purpose |
|------|------|
| `initialize` | Establishes the connection, exchanging protocol version and capabilities |
| `tools/list` | Lists available tools |
| `tools/call` | Calls a tool |
| `resources/list`, `resources/read` | Lists and reads resources |

## Tool Definitions

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

| Field | Key points |
|------|------|
| `inputSchema` | Put bounds, enums, and formats in the schema so the client can validate before calling; hosts like Codex and Cursor validate strictly |
| `annotations.readOnlyHint` | Declares the tool read-only. In Claude Code's plan mode, only read-only tools can run without confirmation |
| Tool name | The full name inside the host is `mcp__<server>__<tool>`, and hook matchers match against that name |

## The Node.js SDK

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

The first argument to `setRequestHandler` must be a schema object exported by the SDK. Passing the string `'tools/list'` throws `Schema is missing a method literal` immediately in current versions (Chapter 12).

For testing, use the SDK's own Client to start the server over stdio; it's less work than writing JSON-RPC by hand. See `examples/ch13-mini-mem/src/mcp/test-client.ts`.

## Registering It in a Plugin

The plugin directory's `.mcp.json`:

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

## Design Advice for Memory MCP Servers

1. **The number of tools and the length of their definitions are both costs.** claude-mem went from deleting all 9 of its tools, to coming back with 3 (plus a workflow note), to registering 24 today, of which it exposes the 19 that work under the local runtime (Chapter 9)
2. **Put constraints in the schema, not the description.** Saving a few dozen tokens is worth less than sparing the model one mistake
3. **Return curated text to the model, not raw JSON.** Keep structured state (such as the result set behind a pagination cursor) on the server
4. **Frame search results as data.** Recalled records may carry instructions aimed at the agent, so state plainly in the returned text that this is record content, not instructions
5. **Don't declare write tools read-only**, so the host keeps its confirmation step

## References

- Specification: https://modelcontextprotocol.io
- TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk

---

> From the open-source edition of *Engineering Agent Memory* by diguike.  
> Read online: [inferloop.dev](https://inferloop.dev) · Source: [github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
