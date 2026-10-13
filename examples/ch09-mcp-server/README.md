---
title: "ch09 示例：MCP Server 实现"
---

# ch09：MCP Server 实现 Demo

演示如何用纯 TypeScript 实现一个符合 MCP 协议的 Server，提供 search、get_observations、timeline 三个工具。

## 运行

```bash
npm install
# 启动 MCP Server（监听 stdin/stdout）
npm run start

# 另一个终端运行测试客户端（模拟 Claude 调用）
npm run test
```

## MCP 协议要点

MCP 使用 JSON-RPC 2.0 over stdio：
- Claude 向 Server stdin 发送 JSON-RPC 请求
- Server 向 stdout 写 JSON-RPC 响应
- 每条消息以 `\n` 分隔

## 工具列表

| 工具 | 用途 |
|------|------|
| `mem_search` | 服务端强制的三步渐进搜索：索引 → 时间线 → 详情。游标由 HMAC 派生、状态只存在服务端，只能选上一步披露过的 ID（claude-mem v13.35 `mem_search` 的精简版） |
| `search` | FTS5 搜索，每个词单独加引号后用 AND 连接；trigram 搜不到的短中文查询回退到 LIKE |
| `get_observations` | 按 ID 取详情 |
| `timeline` | 某条观察前后的时间线，同一秒写入的记录用 id 打破平局 |

所有工具都声明了 `readOnlyHint`。

更多讨论见 [inferloop.dev](https://inferloop.dev)
