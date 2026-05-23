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
| `search` | FTS5 全文搜索，返回 ID + 标题列表 |
| `get_observations` | 根据 ID 数组返回完整 narrative + facts |
| `timeline` | 返回某条 Observation 前后的时间线 |
