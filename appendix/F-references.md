---
title: "附录 F：参考资料"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/Wzlhwc5YmiQthXkxZhScz1yKnkl"
last_synced: "2026-05-05T16:52:35Z"
---

# 附录 F：参考资料

## 核心项目

### claude-mem
- **GitHub**：claude-mem 插件（版本 v12.6.2）
- **安装**：`npx claude-mem` 或通过 Claude Code 插件市场

### Claude Code
- **官方文档**：Claude Code 使用指南（Anthropic 官网）
- **Hook 文档**：Claude Code Hook 系统参考
- **MCP 规范**：Model Context Protocol 规范文档（v2024-11-05）

---

## 论文与研究

### Lost in the Middle
> Liu, N. F., et al. (2023). **Lost in the Middle: How Language Models Use Long Contexts**. *Transactions of the Association for Computational Linguistics*, 12, 157–173.

关键结论：LLM 对长上下文首尾的信息注意力显著高于中间部分。第 8 章的 Context Injection 策略直接源自此研究。

### Ebbinghaus 遗忘曲线
> Ebbinghaus, H. (1885). **Über das Gedächtnis: Untersuchungen zur experimentellen Psychologie**. Leipzig: Duncker & Humblot.

经典的记忆保留曲线研究，第 18 章的 Retention Score 算法使用了其衰减公式：R = e^(-t/S)。

### BM25 排序算法
> Robertson, S., & Zaragoza, H. (2009). **The Probabilistic Relevance Framework: BM25 and Beyond**. *Foundations and Trends in Information Retrieval*, 3(4), 333–389.

SQLite FTS5 的默认排序算法基于 BM25，第 7、9 章有详细说明。

### Retrieval-Augmented Generation (RAG)
> Lewis, P., et al. (2020). **Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks**. *NeurIPS 2020*.

RAG 是 claude-mem 向量搜索模块（ChromaDB + Embedding）的理论基础。

---

## 开源项目

### 同类 Agent 记忆系统

| 项目 | 简介 | 地址 |
|------|------|------|
| **Mem0** | 多层记忆架构，支持用户/会话/Agent 级别 | mem0.ai |
| **Zep** | 对话长期记忆，时序感知搜索 | getzep.com |
| **MemGPT / Letta** | 操作系统式虚拟上下文管理，AI 自主读写记忆 | letta.ai |
| **Cognee** | 知识图谱增强记忆，实体抽取 + 关系推理 | cognee.ai |
| **LangChain Memory** | 多种策略内置（Buffer/Summary/VectorStore/Entity） | python.langchain.com/docs/modules/memory |

### 基础设施

| 项目 | 用途 |
|------|------|
| **better-sqlite3** | Node.js SQLite 驱动（同步 API） |
| **ChromaDB** | 向量数据库，用于语义搜索 |
| **BullMQ** | Redis 任务队列，用于异步 Worker |
| **pgvector** | PostgreSQL 向量扩展，企业级部署 |
| **Express** | Node.js HTTP 框架，Worker Service |

---

## 标准与规范

### Model Context Protocol (MCP)
MCP 是 Anthropic 主导的开放协议，定义 AI 工具接口标准。本书第 9 章深度解析 claude-mem 的 MCP Server 实现。

核心规范：
- 传输层：JSON-RPC 2.0 over stdio（或 HTTP/SSE）
- 工具定义：inputSchema（JSON Schema）+ description
- 生命周期：initialize → tools/list → tools/call

### JSON-RPC 2.0
> Specification: jsonrpc.org/specification

MCP 的底层通信协议，支持请求/响应/通知三种消息类型。

### SQLite FTS5
> SQLite FTS5 官方文档：sqlite.org/fts5.html

附录 D 提供了 FTS5 语法速查表，涵盖建表、分词器选项、MATCH 语法和 BM25 排序。

---

## 延伸阅读

### 上下文工程
- **"The Context Window is All You Need"**：探讨 LLM 上下文管理的工程实践
- **Anthropic 工程博客**：claude.ai/blog — 包含 Claude 上下文处理的技术细节

### Agent 系统设计
- **"Building Effective Agents"**（Anthropic）：Agent 设计模式，包括工具使用和记忆管理
- **LangChain 文档**：Agent 记忆模块的实现参考

### 数据库设计
- **"SQLite is Not a Toy Database"**：SQLite 在生产环境中的使用指南
- **pgvector 文档**：PostgreSQL 向量搜索，第 16 章企业升级路径

---

## 社区与反馈

本书开源发布于 [inferloop.dev](https://inferloop.dev)，遵循 CC BY-NC-SA 4.0 许可：

- **勘误与讨论**：在 GitHub 提交 Issue 或 PR
- **内容转载**：需注明出处，禁止商业使用
- **商业授权**：联系 inferloop.dev

> 代码示例（`examples/` 目录）遵循 MIT 许可，可自由用于商业项目。
