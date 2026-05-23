---
title: "第 11 章：Knowledge Agent — 知识库构建"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/LVFowV8KciUj8CkDuF3cyVosnCh"
last_synced: "2026-05-05T16:52:35Z"
---

## 从 Observations 到 Corpus 的编译过程

单条 Observation 解决的是"点"的记忆——某个时刻发生了什么。但工程师经常需要"面"的知识：关于某个主题，系统整体上"知道什么"。

Knowledge Agent 的功能就是把散落在时间线上的 Observations 编译成一个聚焦特定主题的知识库（Corpus），然后支持会话式查询。

编译过程：

```
源数据（observations 表，可能有上千条）
    ↓ 过滤（project / type / concepts / files / date / query）
    ↓ 筛选（最多 500 条）
    ↓ 序列化为结构化文本
    ↓ 存储为 Corpus 定义（名称 + 过滤规则 + 观察列表）
= Corpus（一个聚焦主题的知识包）
```

Corpus 本身不是一段摘要文本，而是一组经过筛选的 Observation 的集合定义。"知识"是在 Prime 阶段通过 AI 加载和理解后产生的。

## Build → Prime → Query 工作流

### Build：定义并编译 Corpus

```
build_corpus name="hooks-expertise"
  description="Everything about the hooks lifecycle"
  project="claude-mem"
  concepts="hooks"
  limit=500
```

Build 接受的过滤参数：
- `name`：Corpus 名称（必填）
- `description`：描述这个知识库聚焦什么
- `project`：限定项目
- `types`：限定 Observation 类型（decision,bugfix,change...）
- `concepts`：限定概念标签
- `files`：限定文件路径前缀
- `query`：语义搜索关键词
- `dateStart` / `dateEnd`：限定日期范围
- `limit`：最大 Observation 数量（默认 500）

Build 执行后，系统将匹配的 Observation ID 列表存储起来，形成一个 Corpus 定义。

### Prime：加载知识到 AI 会话

```
prime_corpus name="hooks-expertise"
```

Prime 是将 Corpus 中的所有 Observation 内容一次性加载到一个 Claude Agent SDK 会话中。这相当于"让 AI 读完这些资料"，之后的 Query 都在这个已加载知识的会话上下文中进行。

对于大型 Corpus（几百条 Observation），Prime 可能需要 10-30 秒。但这是一次性成本——Prime 后的会话可以反复 Query。

### Query：会话式知识查询

```
query_corpus name="hooks-expertise"
  question="SessionStart Hook 的超时时间是多少？为什么设为这个值？"
```

Knowledge Agent 基于已 Prime 的知识回答问题。由于 AI 已经"读过"所有相关 Observation，它可以：
- 综合多条 Observation 的信息给出完整答案
- 引用具体的 Observation ID
- 指出知识中的矛盾或演变（"v3 中超时是 60s，v4 改为了 120s"）

Query 支持追问——后续问题在同一个会话中，AI 保持之前问答的上下文。

## Corpus 的过滤与聚焦策略

**聚焦的 Corpus 效果远好于宽泛的 Corpus。**

原因：AI 的上下文窗口有限。如果 Corpus 包含 500 条各种主题的 Observation，AI 在回答某个具体问题时仍然需要从大量无关信息中找答案。

推荐实践：

| 场景 | 推荐过滤策略 |
|------|-------------|
| 了解某个模块的架构 | `files="src/services/auth"` |
| 回顾所有架构决策 | `types="decision,trade-off"` |
| 查看某段时间的工作 | `dateStart="2026-04-01" dateEnd="2026-04-30"` |
| 某个概念的完整知识 | `concepts="hooks"` |
| 某类问题的修复模式 | `types="bugfix" query="timeout"` |

组合过滤比单一条件更有效：`types="decision" concepts="database"` 比单独的 `concepts="database"` 更聚焦。

## 会话式知识查询的实现

Knowledge Agent 的底层实现基于 Claude Agent SDK 的 Conversation 模式：

```typescript
// 简化的知识代理实现思路
class KnowledgeAgent {
  private session: AgentSession | null = null;

  async prime(corpus: Corpus): Promise<void> {
    // 创建新的 AI 会话
    this.session = await createSession();

    // 将所有 Observation 格式化为结构化文本
    const content = corpus.observations.map(obs => formatObservation(obs)).join('\n\n');

    // 加载知识（作为系统消息）
    await this.session.loadContext(`
      你是一个知识代理。以下是你的知识库，包含 ${corpus.observations.length} 条观察记录。
      基于这些知识回答问题。如果知识库中没有相关信息，如实说明。

      ${content}
    `);
  }

  async query(question: string): Promise<string> {
    if (!this.session) throw new Error('Corpus not primed');
    // 在已有会话上下文中提问
    return await this.session.send(question);
  }

  async reprime(corpus: Corpus): Promise<void> {
    // 清除旧会话，重新加载
    this.session = null;
    await this.prime(corpus);
  }
}
```

会话保持的好处：
- 追问不需要重新加载知识
- AI 可以回答"你刚才提到的 X 具体是什么意思？"
- 多轮对话中可以逐步深入

## Corpus 的维护：Rebuild 与 Reprime

### Rebuild

当新的 Observation 产生后，旧 Corpus 不会自动包含新内容。需要手动 Rebuild：

```
rebuild_corpus name="hooks-expertise"
```

Rebuild 会使用原来的过滤规则重新查询 observations 表，获取最新的匹配结果。这意味着新增的、符合条件的 Observation 会被纳入。

### Reprime

Rebuild 后，已 Prime 的会话仍然基于旧的知识。需要 Reprime 刷新：

```
reprime_corpus name="hooks-expertise"
```

Reprime 创建一个全新的 AI 会话并重新加载 Corpus。这也会清除之前的对话历史，适合：
- Corpus 内容更新后
- 对话已偏离主题需要"重来"
- 会话上下文太长影响回答质量

### 生命周期

```
build_corpus → [Corpus 定义存储]
  ↓
prime_corpus → [AI 会话创建，知识加载]
  ↓
query_corpus → [基于知识回答] ← 可反复调用
  ↓
rebuild_corpus → [重新查询，更新 Observation 列表]
  ↓
reprime_corpus → [新会话，重新加载]
  ↓
query_corpus → [基于最新知识回答]
```

---

**思考题**

1. 如果一个项目有 500 条 Observation，全部 Prime 到 context 会超出窗口吗？按每条 Observation 平均 200 tokens 计算，评估可行性并设计一个分批加载策略。
2. `rebuild_corpus` 会重新查询 Observation 列表，但不会清除之前的 AI 会话记忆。这可能导致什么问题？如何改进？
3. Knowledge Agent 本质上是"用一个 AI 来服务另一个 AI"。这种二级代理模式的延迟和成本分别是多少？在什么场景下直接搜索比经过 Knowledge Agent 更合适？

---

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

至此，第三部分（核心机制篇）完成。从 Progressive Disclosure 的设计哲学，到 MCP 搜索的工具实现，到 Observation 的压缩流水线，再到 Knowledge Agent 的知识编译——这四章覆盖了 claude-mem 最核心的创新设计。

下一部分（实战篇）将带你从零构建一个可运行的简版 Memory Plugin。
