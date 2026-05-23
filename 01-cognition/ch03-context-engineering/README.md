---
title: "第 3 章：Context Engineering 基础"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/CUjPw8UyeiHBmEkMNticZ7B2nId"
last_synced: "2026-05-05T16:52:35Z"
---

本章介绍 Context Engineering（上下文工程）的核心概念——这些概念直接决定了 claude-mem 为什么这样设计。每个理论点都会用 claude-mem 的实际行为来举例，帮助你建立"设计原则 → 系统实现"的因果关系。

## Token 预算即注意力预算

LLM 的上下文窗口有一个容易被忽视的性质：**它不是一个等价的存储空间，而是一个有衰减的注意力场**。

往上下文里塞 100,000 Token 的内容，不等于模型对这 100,000 Token 的每一个都"读到了"。Transformer 的注意力机制意味着：
- 每个 Token 需要与所有其他 Token 计算注意力权重（n² 关系）
- 上下文越长，单个 Token 获得的平均注意力越低
- 长序列中间位置的信息容易被忽略（Lost in the Middle 效应），模型对开头和结尾的注意力相对更强
- 模型对超长序列的训练经验不如短序列充分

把上下文窗口想象成一个预算：

| 类比 | 含义 |
|------|------|
| 总预算 | 上下文窗口大小（如 200K Token） |
| 每笔支出 | 注入的每段上下文 |
| 投资回报率 | 这段上下文对任务完成有多大帮助 |
| 机会成本 | 占用了本该留给"真正工作"的空间 |

claude-mem 的设计原则就是：**最大化每个 Token 的投资回报率**。Progressive Disclosure 的本质是让 Agent 自己管理预算，而不是系统替它花钱。

## 上下文腐烂（Context Rot）与信噪比

Context Rot 是一个实践中频繁出现但少有人命名的问题：

**随着对话轮次增加，早期注入的上下文逐渐失去有效性。**

原因有几个：
1. 任务目标可能已经转变（用户从 "修 Bug" 转到 "加新功能"）
2. 早期的代码状态可能已被修改
3. 中间产出的大量工具输出稀释了关键信息
4. 模型对更早的 Token 注意力衰减

传统 RAG 系统的做法是在会话开始时一次性注入大量"可能相关"的上下文。这在短会话中问题不大，但在多轮长会话中，这些一开始注入的上下文很快就"腐烂"了——它们占用空间但不再提供价值。

信噪比的公式：

```
SNR = 有效 Token 数 / 总消耗 Token 数
```

传统全量注入的 SNR 通常在 5-15%（注入了 20,000 Token，实际用到 1,000-3,000）。

claude-mem 的 Progressive Disclosure 设计目标是让 SNR 尽可能接近 100%：Agent 消耗的每个 Token 都是自己主动选择的、与当前任务相关的。

## System Prompt 的"正确高度"

System Prompt 是上下文工程中最核心的元素之一。"正确高度"是指在两个极端之间找到平衡点：

### 过于具体（Too Prescriptive）

```
如果用户说 "fix bug"，先运行 git status，然后...
如果用户说 "add feature"，先检查 package.json，然后...
```

问题：脆性高，覆盖不了所有场景，维护成本高。

### 过于模糊（Too Vague）

```
你是一个有帮助的编程助手。请做好你的工作。
```

问题：没有提供任何可操作的指导。

### 正确高度

```
你是一个代码工程助手。在修改代码前先阅读相关文件。
优先使用项目已有的模式和约定。如果不确定，先问。
```

claude-mem 的 Context Injection 遵循同样的原则：不是注入具体的指令（"当你修 auth bug 时记得看 #342"），而是提供一个索引让 Agent 自主判断。

这对 Memory 系统的启示是：**注入的上下文应该是 Enabling（赋能）而非 Prescribing（规定）**。给 Agent 信息，而不是命令。

## Just-In-Time Context vs Pre-Inference Retrieval

两种检索策略的对比：

### Pre-Inference Retrieval（预推理检索）

```
用户输入 → Embedding → 向量检索 → Top-K 结果注入 → LLM 推理
```

在 LLM 开始思考之前，系统已经决定了注入哪些上下文。这是传统 RAG 的做法。

**适用场景**：
- 静态知识库查询（FAQ、文档问答）
- 短会话、单轮问答
- 上下文与查询关系明确

**局限**：
- 系统不知道 Agent 后续会做什么
- 多步任务中，第一步的检索对第三步可能无用
- 无法适应任务中途的方向变化

### Just-In-Time Context（即时上下文）

```
用户输入 → LLM 开始推理 → Agent 判断需要什么信息 → 使用工具检索 → 继续推理
```

Agent 在推理过程中会根据实际需要动态获取上下文。

**适用场景**：
- 多步骤任务
- 探索性工作（不确定需要什么信息）
- 长会话、上下文需求动态变化

**局限**：
- 比预检索慢（多了一轮工具调用）
- 需要 Agent 有"主动搜索"的意识
- 工具描述本身占用 Token

### claude-mem 的混合策略

claude-mem 结合了两者：

1. **Pre-Inference**：SessionStart 注入轻量级索引（~800 Token），提供"地图"
2. **Just-In-Time**：MCP 搜索工具允许 Agent 在推理过程中按需获取详情

这个设计的效果是：索引够轻所以预注入的成本低，但信息够丰富让 Agent 能判断什么时候该深入。

## 长任务三板斧

软件工程中的任务经常需要几十轮工具调用，上下文很容易在中途耗尽或腐烂。三种应对策略：

### 策略 1：Compaction（压缩）

当对话接近上下文限制时，将历史消息交给模型生成压缩摘要，用摘要替换原始消息继续对话。

```
原始对话（90,000 Token）
    ↓ 压缩
摘要（3,000 Token）+ 最近 5 轮对话（7,000 Token）
    ↓
继续在 10,000 Token 基础上工作
```

**调优思路**：
- 先最大化 Recall（不漏掉关键信息）
- 再优化 Precision（去除冗余）
- 优先清理旧的工具调用输出（Token 量大但价值衰减快）

**claude-mem 的关联**：Session Summary 就是一种 Compaction——将整个会话的工具使用压缩为 request / investigated / learned / completed / next_steps 五个维度的结构化摘要。

### 策略 2：Structured Note-Taking（结构化笔记）

Agent 在工作过程中主动向外部存储写入笔记，需要时再读回来。笔记不在上下文窗口内，不占用 Token。

```typescript
// Agent 完成第一阶段后
await writeFile('PROGRESS.md', `
## 已完成
- 数据库 Schema 设计
- API 路由定义

## 待做
- 实现认证中间件
- 写入测试
`);

// 下一步开始时
const progress = await readFile('PROGRESS.md');
// Agent 知道当前状态，不需要从头回忆
```

**claude-mem 的关联**：整个 Observation 系统本质上就是自动化的结构化笔记。区别在于：不需要 Agent "记得"写笔记，系统自动完成。

### 策略 3：Sub-Agent Architecture（子代理架构）

将复杂任务拆分给专门的子代理，每个子代理有独立的、干净的上下文窗口。

```
Main Agent（协调者）
  ├── Sub-Agent A：调研现有实现（读 20 个文件，返回 2000 Token 摘要）
  ├── Sub-Agent B：分析依赖关系（查 5 个包，返回 1000 Token 报告）
  └── Sub-Agent C：实现代码（基于 A+B 的摘要，专注写代码）
```

每个子代理可以深入探索（消耗数万 Token），但只向主代理返回浓缩的结果（1-2K Token）。

**claude-mem 的关联**：Knowledge Agent 的 Build → Prime → Query 模式就是一种 Sub-Agent 架构——Corpus 编译是一个"子代理"任务，将大量 Observation 浓缩为一个可查询的知识库。

### 选择策略的决策框架

| 场景 | 推荐策略 |
|------|---------|
| 长对话接近上下文限制 | Compaction |
| 迭代开发，需要跟踪进度 | Structured Note-Taking |
| 需要大量信息收集后做决策 | Sub-Agent |
| 跨会话的持久记忆 | 以上三者的组合（即 claude-mem 的做法） |

## 小结

Context Engineering 的核心认知：

1. **Token 是稀缺资源**，不是"反正窗口很大就往里塞"
2. **注入的上下文会腐烂**，越早注入的信息在长会话中越容易失去价值
3. **让 Agent 自主管理上下文**比系统替它决定更高效
4. **混合策略优于单一策略**——预注入轻量索引 + 按需深度获取

这些原则是理解后续 claude-mem 架构设计的基础。为什么选 Progressive Disclosure 而非传统 RAG？为什么 Hook 层只做快速入队而不做处理？为什么 MCP 工具被精简到只有 4 个？——这些决策都可以追溯到本章讨论的 Context Engineering 原则。

---

**思考题**

1. 如何为你自己的项目量化 Context Rot？设计一个实验：在长对话的不同轮次注入同一条信息，观察 Agent 对该信息的引用准确率变化曲线。
2. 如果你的项目 context window 只有 8K tokens（如本地小模型），上述四种 Context Management 策略中你会优先选哪个？为什么？
3. "让 Agent 自主管理上下文"和"系统替 Agent 决定"之间的边界在哪里？举一个适合系统强制注入的场景。

---

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

下一章开始进入架构篇，从 claude-mem 的系统全景开始，逐层拆解每个组件的设计与实现。
