---
title: "附录 F：参考资料"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/Wzlhwc5YmiQthXkxZhScz1yKnkl"
last_synced: "2026-10-28T15:09:58+08:00"
---

## 核心项目

### claude-mem
- **GitHub**：[github.com/thedotmack/claude-mem](https://github.com/thedotmack/claude-mem)，本书基线 v13.35.0（2026-10-08），Apache-2.0（v13.0.0 起，此前为 AGPL-3.0）
- **官网与文档**：[claude-mem.ai](https://claude-mem.ai)
- **交互式入门课程**：[cmem.ai/learn](https://cmem.ai/learn)
- **安装**：`npx claude-mem install`
- 源码里值得一读的设计文档：`docs/ip-boundary.md`（开源边界）、`docs/server.md`（Server 运行时）、`docs/native-memory-bridge.md`（原生记忆桥接）、`docs/native-prompt-identity.md`（轮次身份）、`workers/sync-hub/DEPLOY.md`（同步 hub 部署）。注意 `docs/architecture-overview.md` 等部分文档落后于代码，以代码为准

### Claude Code
- **Hook 参考**：[code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks)
- **插件**：`claude plugin validate`、`claude --plugin-dir`（本书在 2.1.296 上验证）
- **记忆**：[code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory)

### Model Context Protocol
- **规范**：[modelcontextprotocol.io](https://modelcontextprotocol.io)
- **TypeScript SDK**：[github.com/modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk)（本书示例用 1.32）

---

## 论文与研究

### Lost in the Middle
> Liu, N. F., et al. (2024). **Lost in the Middle: How Language Models Use Long Contexts**. *Transactions of the Association for Computational Linguistics*, 12, 157–173.

长上下文中间位置的信息更容易被模型忽略。第 3 章讨论上下文腐烂时引用了这一结论。

### ACT-R 与遗忘的幂律
> Anderson, J. R., & Schooler, L. J. (1991). **Reflections of the Environment in Memory**. *Psychological Science*, 2(6), 396–408.

记忆的可提取性随时间按幂律衰减，并随每次重复出现而增强。claude-mem 的强化排序（`src/services/reinforcement/`）按这一模型计算，衰减指数取 0.5。第 7、10、20 章。

### Ebbinghaus 遗忘曲线
> Ebbinghaus, H. (1885). **Über das Gedächtnis: Untersuchungen zur experimentellen Psychologie**. Leipzig: Duncker & Humblot.

第 20 章把指数衰减的保留分数和 ACT-R 的幂律衰减放在一起比较。

### BM25 排序算法
> Robertson, S., & Zaragoza, H. (2009). **The Probabilistic Relevance Framework: BM25 and Beyond**. *Foundations and Trends in Information Retrieval*, 3(4), 333–389.

SQLite FTS5 的 `rank` 基于 BM25。第 7 章、附录 D。

### Retrieval-Augmented Generation (RAG)
> Lewis, P., et al. (2020). **Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks**. *NeurIPS 2020*.

第 1、8 章把渐进式披露和传统 RAG 做了对比。

---

## 开源项目

### 同类 Agent 记忆系统（第 15 章）

| 项目 | 简介 | 地址 |
|------|------|------|
| **Mem0** | 多层记忆架构，支持用户 / 会话 / Agent 级别 | mem0.ai |
| **Zep / Graphiti** | 时序知识图谱 | getzep.com |
| **Letta（原 MemGPT）** | 操作系统式虚拟上下文管理，Agent 自主读写记忆 | letta.com |
| **Cognee** | 知识图谱增强记忆 | cognee.ai |
| **LangGraph** | 短期状态 + 长期 Store | langchain-ai.github.io/langgraph |

### 基础设施

| 项目 | 本书中的用途 |
|------|------|
| **bun:sqlite / better-sqlite3** | claude-mem 用前者；本书示例用后者（12.x，支持 Node 24） |
| **SQLite FTS5** | 全文检索，sqlite.org/fts5.html |
| **Chroma** | 向量检索，claude-mem 本地默认的 embedding 是 all-MiniLM-L6-v2 |
| **PostgreSQL / Valkey / BullMQ** | claude-mem Server 运行时的存储与队列（第 16 章） |
| **pg_trgm** | Postgres 上的中文子串检索加速（第 16 章实测） |
| **Cloudflare Durable Objects** | claude-mem 同步 hub 的每用户有序日志（第 19 章） |

---

## 延伸阅读

### 上下文工程与 Agent 设计
- **Building Effective Agents**（Anthropic Engineering，2024）：Agent 设计模式
- **Effective Context Engineering for AI Agents**（Anthropic Engineering，2025）：第 3 章讨论的上下文腐烂、System Prompt 的“正确高度”、即时上下文，以及长任务的 Compaction / 结构化笔记 / Sub-Agent，都可以在这篇文章里找到对应的论述

### 数据库
- **SQLite Is Not a Toy Database**（Anton Zhiyanov）：SQLite 在生产环境中的能力边界
- **Transactional Outbox 模式**：第 16 章 Server 运行时的写入链路、第 19 章“数据库就是队列”都是它的变体

### 同系列
- 本系列的 DeepSeek Harness 和 OpenClaw 两本源码精读，对应第 18 章的两个宿主
- 《AI Agent 评测工程实战》：怎么用对照实验衡量记忆的效果（第 17 章）

---

## 社区与反馈

本书开源发布于 [inferloop.dev](https://inferloop.dev)，遵循 CC BY-NC-SA 4.0 许可：

- **勘误与讨论**：在 GitHub 提交 Issue 或 PR
- **内容转载**：需注明出处，禁止商业使用
- **商业授权**：联系 inferloop.dev

> 代码示例（`examples/` 目录）遵循 MIT 许可，可自由用于商业项目。

---

> 本附录来自《Agent Memory 工程实战》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
