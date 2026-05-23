# mini-mem — 简版 Agent Memory Plugin

第 13 章配套的完整可运行项目。实现了 claude-mem 的核心闭环：

```
Hook 捕获 → SQLite 存储 → FTS5 搜索 → MCP 暴露 → Context 注入
```

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 编译 TypeScript
npm run build

# 3. 测试 save hook（模拟一次工具调用）
npm run test:save

# 4. 测试 context hook（应该输出 Markdown 索引表）
npm run test:context

# 5. 查看数据库内容
sqlite3 ~/.mini-mem/mini-mem.db "SELECT id, type, title FROM observations;"
```

## 安装到 Claude Code

```bash
npm run install-plugin
# 重启 Claude Code 后生效
```

## 项目结构

```
src/
├── hooks/
│   ├── context-hook.ts    # SessionStart：注入索引
│   └── save-hook.ts       # PostToolUse：保存观察
├── mcp/
│   └── server.ts          # MCP Server：search + get_observations
├── db/
│   ├── schema.ts          # 建表语句
│   └── store.ts           # CRUD + FTS5 搜索
└── utils/
    ├── stdin.ts           # 读取 Hook 输入
    └── title-extractor.ts # 标题提取（规则版，不调 AI）
plugin/
├── .claude-plugin/plugin.json
├── hooks/hooks.json       # Hook 注册
└── .mcp.json              # MCP Server 注册
```

## 与 claude-mem 的对比

| 特性 | mini-mem | claude-mem |
|------|----------|-----------|
| AI 压缩 | 规则提取 | Claude Agent SDK |
| 向量搜索 | 无 | ChromaDB |
| Worker | 无（同步） | Express daemon |
| Progressive Disclosure | 基础索引表 | 完整 3 层工作流 |
| 多平台 | 仅 Claude Code | Claude Code + Cursor + Gemini CLI |

mini-mem 是理解 claude-mem 核心原理的最小实现。掌握后，阅读 claude-mem 的完整源码会更容易。
