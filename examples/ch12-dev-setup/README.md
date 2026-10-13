---
title: "ch12 示例：开发环境验证"
---

# ch12：开发环境验证脚本

快速验证插件开发环境是否就绪。要求 Node.js 20.12 以上。

## 运行

```bash
npm install

# 完整环境检查：Node、Bun、tsx、better-sqlite3、FTS5、WAL、Claude Code CLI 等
npm run check

# SQLite：FTS5、WAL，以及中文检索在 unicode61 / trigram / LIKE 下的命中对比
npm run check:sqlite

# 校验一个插件目录（plugin.json、hooks/hooks.json、.mcp.json），默认检查 ../ch13-mini-mem/plugin
npm run check:plugin
npm run check:plugin -- /path/to/your/plugin
```

`check:plugin` 是一个轻量的本地检查，Claude Code 自带的 `claude plugin validate <目录>` 更完整，两者可以一起用。

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/check-env.ts` | 环境检查 |
| `src/check-sqlite.ts` | SQLite 能力与中文检索对比 |
| `src/check-plugin.ts` | 插件目录校验：事件名拼写、async 用法、`${CLAUDE_PLUGIN_ROOT}` 引用 |

更多讨论见 [inferloop.dev](https://inferloop.dev)
