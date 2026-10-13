---
title: "附录 E：mini-mem 完整源码清单"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/EEBGwjO9fi6cnXkvnx7cWlU9nWh"
last_synced: "2026-10-13T11:44:15+08:00"
---

完整项目位于 `examples/ch13-mini-mem/`（v1.1.0），以下是关键文件的路径和职责。`claude plugin validate plugin` 零警告通过。

## 项目结构

```
examples/ch13-mini-mem/
├── package.json                # 依赖和 npm scripts（Node.js 20.12+）
├── tsconfig.json
├── README.md
├── src/
│   ├── hooks/
│   │   ├── save-hook.ts        # PostToolUse / PostToolUseFailure：观察捕获
│   │   ├── context-hook.ts     # SessionStart：索引注入，resume 时跳过
│   │   ├── context-render.ts   # 索引渲染 + 10,000 字符预算裁剪
│   │   └── budget-test.ts      # 构造超长数据验证预算裁剪
│   ├── mcp/
│   │   ├── server.ts           # MCP Server：search + get_observations（只读注解）
│   │   └── test-client.ts      # 用 SDK Client 通过 stdio 测试
│   ├── db/
│   │   ├── schema.ts           # 建表 + FTS5 + 触发器（更新触发器只盯索引列）
│   │   └── store.ts            # 读写封装：busy_timeout、安全的 MATCH、中文 LIKE 兜底
│   └── utils/
│       ├── stdin.ts            # stdin JSON 读取
│       ├── project.ts          # 项目识别
│       └── title-extractor.ts  # 规则提取标题、分类、跳过无意义的工具
└── plugin/
    ├── .claude-plugin/
    │   └── plugin.json         # 插件元数据（含 author）
    ├── hooks/
    │   └── hooks.json          # SessionStart（同步）+ PostToolUse / PostToolUseFailure（async）
    └── .mcp.json               # MCP Server 注册
```

## 快速运行

```bash
cd examples/ch13-mini-mem
npm install
npm run build
npm run test:save      # 模拟一次成功的工具调用 → 写入 SQLite
npm run test:fail      # 模拟一次失败的工具调用
npm run test:context   # 模拟 SessionStart(startup) → 输出索引
npm run test:resume    # 模拟 SessionStart(resume) → 不注入
npm run test:budget    # 验证 10,000 字符预算
npm run test:search    # 启动 MCP Server，列工具并调用
npm run claude:dev     # claude --plugin-dir ./plugin，在 Claude Code 里加载
```

数据默认写在 `~/.mini-mem/`，测试时可以用 `MINI_MEM_DATA_DIR` 指到临时目录。

## 与 claude-mem 的功能映射

| mini-mem 文件 | claude-mem v13.35.0 对应 | 简化点 |
|--------------|------------------------|--------|
| `save-hook.ts` | `src/cli/handlers/observation.ts` | 没有 spool 和 Worker，Hook 直接写 SQLite（靠 `async` 不阻塞宿主） |
| `context-hook.ts` | `src/cli/handlers/context.ts` | 没有预渲染缓存，每次现查 |
| `context-render.ts` | `src/services/context/ContextBudget.ts` | 只按条数裁剪，裁剪顺序更简单 |
| `server.ts` | `src/servers/mcp-server.ts` | 2 个工具，没有 `mem_search` 的分步协议 |
| `store.ts` | `src/services/sqlite/` | 单文件，没有迁移 |
| `title-extractor.ts` | 观察者模型生成 | 规则提取，不调模型 |

## 扩展方向

完成 mini-mem 后，推荐按以下顺序扩展（第 14 章详述）：

1. **异步化**：Hook 只落盘，交给后台进程处理（第 6 章的 spool 模式）
2. **接模型生成观察**：用 Claude 替代规则提取（`examples/ch14-extensions` 的 `ai-compressor.ts`）
3. **加 timeline 工具**：按时间前后取上下文，注意同一时刻多条记录的排序
4. **加向量检索**：Chroma；中文要换多语言 embedding 模型
5. **加 Viewer**：Express + SSE

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

---

> 本附录来自《Agent Memory 工程实战》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
