---
title: "附录 E：mini-mem 完整源码清单"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/EEBGwjO9fi6cnXkvnx7cWlU9nWh"
last_synced: "2026-05-05T16:52:35Z"
---

# 附录 E：mini-mem 完整源码清单

完整项目位于 `examples/ch13-mini-mem/`，以下是关键文件的路径和职责：

## 项目结构

```
examples/ch13-mini-mem/
├── package.json              # 依赖和 npm scripts
├── tsconfig.json             # TypeScript 配置
├── README.md                 # 使用说明
├── src/
│   ├── hooks/
│   │   ├── save-hook.ts      # PostToolUse Hook（观察捕获）
│   │   └── context-hook.ts   # SessionStart Hook（索引注入）
│   ├── mcp/
│   │   └── server.ts         # MCP Server（search + get_observations）
│   ├── db/
│   │   ├── schema.ts         # SQLite 建表语句 + FTS5 + 触发器
│   │   └── store.ts          # CRUD 操作封装
│   └── utils/
│       ├── stdin.ts          # stdin JSON 读取
│       └── title-extractor.ts # 标题提取 + 分类 + 文件提取
└── plugin/
    ├── .claude-plugin/
    │   └── plugin.json       # 插件元数据
    ├── hooks/
    │   └── hooks.json        # Hook 注册（SessionStart + PostToolUse）
    └── .mcp.json             # MCP Server 注册
```

## 快速运行

```bash
cd examples/ch13-mini-mem
npm install
npm run build
npm run test:save      # 模拟工具调用 → 存入 SQLite
npm run test:context   # 模拟 SessionStart → 输出索引表
npm run install-plugin # 链接到 Claude Code 插件目录
```

## 与 claude-mem 的功能映射

| mini-mem 文件 | claude-mem 对应 | 简化点 |
|--------------|----------------|--------|
| `save-hook.ts` | `src/cli/handlers/observation.ts` | 无 Worker 队列，同步写入 |
| `context-hook.ts` | `src/cli/handlers/context.ts` | 无项目多选、无彩色输出 |
| `server.ts` | `plugin/scripts/mcp-server.cjs` | 仅 2 个工具（无 timeline） |
| `store.ts` | `src/services/sqlite/` | 单文件，无 migration |
| `title-extractor.ts` | Claude Agent SDK 压缩 | 规则提取，不调 AI |

## 扩展方向

完成 mini-mem 后，推荐按以下顺序扩展（第 14 章详述）：

1. **加 Worker**：将 save-hook 改为入队，Worker 定时处理
2. **接 AI 压缩**：用 Claude Haiku 替代规则提取
3. **加 timeline 工具**：MCP Server 增加第三个工具
4. **加 Viewer UI**：Express + SSE + React
5. **加向量搜索**：ChromaDB 或 pgvector

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

---

> 本附录来自《Agent Memory 工程实战》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
