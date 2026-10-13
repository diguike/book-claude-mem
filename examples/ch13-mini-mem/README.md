# mini-mem — 简版 Agent Memory Plugin

第 13 章配套的完整可运行项目（1.1.0，按 claude-mem v13 的经验修订）。实现了 claude-mem 的核心闭环：

```
Hook 捕获（含失败的调用）→ SQLite 存储 → FTS5 / 子串搜索 → MCP 暴露 → SessionStart 注入
```

要求 Node.js 20.12 以上。

## 快速开始

```bash
npm install
npm run build

# 测试数据放到临时目录，不碰真实的 ~/.mini-mem
export MINI_MEM_DATA_DIR=$(mktemp -d)

npm run test:save      # 模拟一次成功的 Edit
npm run test:fail      # 模拟一次失败的 Bash（PostToolUseFailure）
npm run test:context   # 输出注入的索引
npm run test:resume    # resume 时输出空内容
npm run test:budget    # 验证注入文本不超过 10,000 字符
npm run test:search    # MCP 端到端测试（英文、中文、中英粘连）
```

## 在 Claude Code 里使用

```bash
claude plugin validate ./plugin   # 校验插件目录
npm run claude:dev                # 等价于 claude --plugin-dir ./plugin
```

## 项目结构

```
src/
├── hooks/
│   ├── save-hook.ts       # PostToolUse / PostToolUseFailure：保存观察（async）
│   ├── context-hook.ts    # SessionStart：注入索引（resume 不注入）
│   ├── context-render.ts  # 单行索引渲染 + 10,000 字符预算裁剪
│   └── budget-test.ts
├── mcp/
│   ├── server.ts          # MCP Server：search + get_observations（readOnlyHint）
│   └── test-client.ts     # MCP SDK 客户端端到端测试
├── db/
│   ├── schema.ts          # 建表、FTS5、触发器
│   └── store.ts           # 读写；FTS5 为主，CJK 走 LIKE 子串
└── utils/
    ├── stdin.ts
    ├── project.ts
    └── title-extractor.ts # 规则提取标题和类型（不调 AI）
plugin/
├── .claude-plugin/plugin.json
├── hooks/hooks.json
└── .mcp.json
```

## 与 claude-mem 的对比

| 特性 | mini-mem | claude-mem v13.35.0 |
|------|----------|--------------------|
| 记录内容 | 规则提取标题 | 观察者模型压缩成结构化 Observation |
| 写入路径 | Hook 进程直接写 SQLite | Hook 写 spool 文件，Worker 取件后处理 |
| 注入格式 | 单行索引，按条数减半裁剪 | 单行索引 + 待办清单 + 摘要，按优先级裁剪 |
| 搜索 | FTS5 + CJK 子串 | Chroma 语义为主，SQLite FTS5/子串补齐 |
| MCP 工具 | 2 个 | 19 个（本地运行时） |

更多讨论见 [inferloop.dev](https://inferloop.dev)
