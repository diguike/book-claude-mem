---
title: "第 15 章：业界 Agent Memory 方案调研"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/KDaYw1QwniHcpSk1QHacu3GOn3e"
last_synced: "2026-05-05T16:52:35Z"
---

## OpenAI Memory / ChatGPT Memory 机制分析

OpenAI 在 2024 年为 ChatGPT 引入的 Memory 功能是目前覆盖面最广的 Agent Memory 实现。

### 架构特征

- **显式记忆**：用户或 AI 可以主动创建/删除记忆点
- **隐式记忆**：AI 在对话中自动提取值得记住的信息
- **记忆格式**：短句（每条记忆是一个简短的陈述句）
- **注入方式**：每次对话开始时将所有记忆拼接注入 System Prompt

### 设计取舍

| 维度 | 选择 | 代价 |
|------|------|------|
| 粒度 | 粗粒度（1 句话 = 1 条记忆） | 无法保留复杂的上下文细节 |
| 存储 | 云端集中 | 隐私风险，依赖网络 |
| 检索 | 全量注入 | 记忆数量受 Token 预算限制 |
| 主动性 | AI 自主决定记什么 | 用户对记忆控制感弱 |

### 对 claude-mem 的启发

OpenAI 的方案证明了"记忆短句"的格式对消费级产品有效，但对工程场景不够用——软件决策需要 narrative（叙述）和 facts（依据），不是一句话能概括的。claude-mem 的 Observation 结构（type + title + narrative + facts）是对这个限制的回应。

## LangChain / LangGraph Memory 模块

LangChain 的 Memory 模块是开发者最常接触的 Agent Memory 框架。

### 架构特征

```python
# LangChain Memory 类型
ConversationBufferMemory      # 完整对话历史
ConversationSummaryMemory     # 对话摘要
ConversationKGMemory          # 知识图谱记忆
VectorStoreRetrieverMemory    # 向量检索记忆
```

### 设计取舍

- **框架耦合**：Memory 深度绑定到 LangChain 的 Chain/Agent 抽象
- **运行时范围**：主要解决单次运行内的上下文管理，跨运行的持久化需要额外接入
- **灵活性高**：提供多种 Memory 类型组合使用
- **无 Observation 概念**：记忆单元是"消息"或"摘要"，不是结构化的工作观察

### 与 claude-mem 的对比

LangChain Memory 解决的是"框架内的对话记忆管理"，claude-mem 解决的是"IDE 级别的跨会话工作记忆"。两者面向不同层次：LangChain 在 Agent Runtime 层，claude-mem 在 Developer Tool 层。

LangGraph 的 State Persistence（CheckPointer）更接近 claude-mem 的定位——它持久化 Agent 的执行状态，支持恢复和回放。但它是执行级持久化，不做语义压缩。

## Mem0：开源 Memory Layer

Mem0（前身 embedchain）是目前最活跃的开源 Agent Memory 项目之一。

### 架构特征

```python
from mem0 import Memory

m = Memory()
m.add("用户偏好使用 TypeScript", user_id="alice", metadata={"category": "preference"})
results = m.search("编程语言偏好", user_id="alice")
```

核心组件：
- **Memory Store**：向量数据库（Qdrant / ChromaDB / Pinecone）
- **LLM Extraction**：用 LLM 从对话中提取记忆点
- **Graph Memory**：可选的知识图谱层（Neo4j）
- **Multi-Level**：用户级 / Agent 级 / 会话级记忆分层

### 设计取舍

| 维度 | Mem0 | claude-mem |
|------|------|-----------|
| 记忆单元 | 短句/事实 | 结构化 Observation |
| 检索方式 | 向量相似度 | FTS5 + 向量混合 |
| 注入方式 | 预检索注入 | Progressive Disclosure |
| 运行环境 | 通用（任何 Agent） | Claude Code 插件 |
| 隐私 | 需配置（支持本地/云） | 完全本地 |

### 值得借鉴的设计

- **Memory 分层**（user/agent/session）是企业级场景的刚需
- **Graph Memory** 用知识图谱建立记忆间的关系，比纯向量检索多了一层"关联性"
- **Memory 冲突检测**：新记忆与旧记忆矛盾时主动处理

## Zep：长期记忆服务

Zep 定位为 Agent 的长期记忆基础设施服务。

### 架构特征

- **自动摘要**：对话过长时自动生成 running summary
- **实体提取**：从对话中提取人名、组织、概念等实体
- **时间感知**：记忆带时间戳，支持"最近 vs 久远"的衰减排序
- **多会话**：跨会话共享用户画像
- **Fact Extraction**：从非结构化对话中提取结构化事实

### 独特之处

Zep 的"时间感知"设计值得关注：记忆不是平等的。一周前的决策比一年前的偏好更可能相关。Zep 通过时间衰减因子影响检索排名。

这对 claude-mem 的索引排序有启发——目前 claude-mem 按时间倒序展示索引，但没有"重要性衰减"机制。

## MemGPT / Letta：操作系统式内存管理

MemGPT（现在的 Letta）将操作系统的虚拟内存概念引入 Agent：

### 架构特征

```
Main Context (Working Memory) ← → Archival Memory (Long-term)
        ↕                              ↕
  Conversation Buffer            Vector Database
  (当前对话窗口)                (所有历史信息)
```

核心创新：
- **自我编辑的上下文**：Agent 可以主动将信息从 Working Memory 移到 Archival Memory
- **分页系统**：类似 OS 的 page in/page out
- **持久化 Agent**：Agent 状态完整保存，支持暂停和恢复
- **Function Calling 驱动**：内存操作通过工具调用完成

### 设计取舍

MemGPT 给予 Agent 完全的内存管理自主权——Agent 自己决定什么放 Working Memory、什么归档。代价是：
- Agent 需要额外的"内存管理 Token"开销
- 不合理的内存管理决策可能导致关键信息丢失
- 调试复杂度高（为什么 Agent 忘记了某个信息？）

### 与 claude-mem 的对比

| 维度 | MemGPT | claude-mem |
|------|--------|-----------|
| 内存管理者 | Agent 自身 | 外部系统 |
| 操作模型 | 主动 page in/out | 被动观察 + 按需检索 |
| 信息来源 | 对话内容 | 工具使用记录 |
| 上下文控制 | Agent 自编辑 | System Hook 注入 |

## Cognee：知识图谱驱动的记忆引擎

Cognee 的独特之处在于将知识图谱作为记忆的底层表示。

### 架构特征

- **知识图谱优先**：每条信息转化为图中的节点和边
- **关系推理**：可以回答"A 和 B 有什么关系？"
- **增量更新**：新信息自动合并到图中，处理冲突
- **Multi-Source**：支持从文档、代码、对话等多种来源提取知识

### 对企业级 Memory 的启发

知识图谱在以下场景特别有价值：
- 团队知识管理：谁负责什么模块？模块之间怎么依赖？
- 决策追溯：这个技术选型影响了哪些后续实现？
- 冲突检测：新的决策是否与旧决策矛盾？

## Quick Try：各方案 5 分钟体验

想亲自感受各方案的差异？以下是最快的体验路径：

### Mem0

```bash
pip install mem0ai
python3 -c "
from mem0 import Memory
m = Memory()
m.add('用户偏好 TypeScript 和 React', user_id='demo')
m.add('项目使用 PostgreSQL 数据库', user_id='demo')
results = m.search('数据库技术栈', user_id='demo')
print(results)
"
```

### LangChain Memory

```bash
pip install langchain langchain-community
python3 -c "
from langchain.memory import ConversationSummaryBufferMemory
from langchain_community.llms import FakeListLLM
llm = FakeListLLM(responses=['摘要：用户在讨论数据库选型'])
memory = ConversationSummaryBufferMemory(llm=llm, max_token_limit=100)
memory.save_context({'input': '我们用 PostgreSQL 还是 MongoDB?'}, {'output': '取决于数据结构'})
print(memory.load_memory_variables({}))
"
```

### MemGPT / Letta

```bash
pip install letta
# Letta 需要更多配置，以下仅展示核心概念
python3 -c "
from letta import create_client
client = create_client()
# 需要配置 LLM provider，详见 https://docs.letta.com
print('Letta client created. See docs for full setup.')
"
```

### Zep

```bash
# Zep 需要运行服务端，推荐 Docker
docker run -p 8000:8000 ghcr.io/getzep/zep:latest
pip install zep-python
python3 -c "
from zep_python import ZepClient
client = ZepClient('http://localhost:8000')
print('Zep server running. Add messages via client.memory.add_memory()')
"
```

### Cognee

```bash
# Cognee 依赖 Neo4j（知识图谱数据库），门槛较高
# 如果不想装 Neo4j，可以用 Cognee 的内存模式体验核心概念
pip install cognee
python3 -c "
import cognee
# 需要配置 LLM 和图数据库，详见 https://github.com/topoteretes/cognee
print('Cognee installed. Requires Neo4j for full graph features.')
"
```

> 如果你只想体验一个，推荐 **Mem0**——安装最简单，API 最直观，且不需要额外的数据库服务。

## 各方案横向对比与启发提炼

| 方案 | 最大优势 | 最大限制 | 适用场景 | 开源 | Star 量级 |
|------|---------|---------|---------|------|----------|
| OpenAI Memory | 零配置，全自动 | 粒度粗，容量小 | 消费级聊天 | 否 | - |
| LangChain Memory | 灵活组合，框架内开箱即用 | 深度绑定 LangChain | 框架内 Agent | 是 | 100K+ |
| Mem0 | 多层记忆，Graph 支持 | 需要基础设施 | 通用 Agent 平台 | 是 | 25K+ |
| Zep | 时间感知，自动摘要 | 部署复杂 | 有对话历史需求的产品 | 是 | 2K+ |
| MemGPT/Letta | Agent 自管理，最大自主性 | Token 开销大，调试难 | 研究/长任务 Agent | 是 | 12K+ |
| Cognee | 关系推理，冲突检测 | 图数据库运维复杂 | 知识密集型场景 | 是 | 2K+ |
| claude-mem | Progressive Disclosure，IDE 原生 | 绑定 Claude Code 生态 | 工程师开发环境 | 是 | 10K+ |

> Star 数据为 2026 年初的近似值，仅供参考量级。

### 构建企业级平台时的关键借鉴

1. **来自 Mem0**：多层记忆分离（个人/团队/组织）
2. **来自 Zep**：时间衰减与自动摘要
3. **来自 MemGPT**：Agent 应有"主动管理记忆"的能力
4. **来自 Cognee**：知识图谱做关系追溯和冲突检测
5. **来自 claude-mem**：Progressive Disclosure + Hook 驱动的非侵入性

---

---

**思考题**

1. Mem0 和 claude-mem 都支持本地存储。如果你要做一个 "Memory 迁移工具"（从 Mem0 导入到 claude-mem），数据模型的映射关系是什么？哪些字段会丢失？
2. MemGPT 让 Agent 自己管理内存，claude-mem 用外部系统自动管理。对于"写代码"这个场景，哪种方案更合适？为什么？
3. 如果你是技术负责人要在这些方案中选型，除了技术能力外，还要考虑哪些因素？（提示：社区活跃度、商业可持续性、锁定风险）

---

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

下一章将基于这些调研结论，设计从单机 Plugin 到分布式多租户平台的架构升级路径。

---

> 本章来自《Agent Memory 工程实战》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
