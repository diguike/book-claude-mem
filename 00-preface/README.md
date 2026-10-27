---
title: 前言
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/KAKQwYDjRiqn9DklFT4cwrpVnOf"
last_synced: "2026-10-27T11:41:08+08:00"
---

> **配套资源**  
> 源码仓库 · [github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)  
> 在线阅读 · [inferloop.dev/claude-mem](https://inferloop.dev/claude-mem)

> **For English readers**  
> This book walks through the source code of [claude-mem](https://github.com/thedotmack/claude-mem) (revised for v13.35.0, October 2026): hooks, the worker service, storage, search, building a mini version from scratch, and the newer server runtime, multi-host adapters and cross-device sync. It is written in Chinese; browser translation works fine for reading it, and the code is on [GitHub](https://github.com/diguike/book-claude-mem). New to agent memory? Start with the interactive companion course at [cmem.ai/learn](https://cmem.ai/learn).

## 为什么写这本书

2025 年下半年，Agent 开发从"能跑通 Demo"进入了"能上生产"的阶段。越来越多工程师开始构建真正有用的 AI Agent，很快撞上同一堵墙：Agent 没有记忆。

每次新会话开始，Agent 对项目一无所知。上一轮花 20 分钟定位的 Bug 根因、做出的架构决策、踩过的坑——全部丢失。工程师不得不反复交代背景，Agent 不得不反复探索已知的代码。它直接决定了 Agent 的实际生产力上限。

我第一次注意到 claude-mem 时，它已经在 GitHub 上积累了超过 10,000 stars——一个 Claude Code 的记忆插件能做到这个量级，说明痛点确实普遍。但真正让我产生写书冲动的不是 star 数，而是读完源码后的感受：它不是一个"把东西存起来再找出来"的 CRUD 应用，而是在解决一个更深层的问题——如何在有限的上下文窗口里，以最高效率向 Agent 提供它真正需要的信息。

claude-mem 的 Progressive Disclosure（渐进式信息披露）设计、基于 Hook 的非侵入式架构、3 层搜索工作流，这些设计背后是对 LLM 注意力机制的深刻理解，对任何做 Agent 开发的工程师都有直接价值——不管你用不用 claude-mem 本身。

## 第二版修订说明

第一版基于 claude-mem v12.6.2。之后 claude-mem 官方的学习页面 [cmem.ai/learn](https://cmem.ai/learn) 推荐了这本书，而项目本身在一个大版本里变化很大：GitHub star 从我第一次注意到它时的一万出头涨到了 99,871（2026-10-12），许可证从 AGPL-3.0 改为 Apache-2.0，内部几乎每一层都重写过。

这一版以 v13.35.0（2026-10-08 发布）为基线全面修订：

- **架构变了的地方全部重写**：Hook 不再直接请求 Worker，而是先落盘到 spool；Worker 删掉了持久化队列，改用内存缓冲；开场上下文改为预渲染缓存；MCP 工具从 13 个增加到 24 个（Worker 运行时对模型暴露其中 19 个），检索改成强制分步的 `mem_search` 协议。第 4 到 11 章按新源码重新讲解
- **设想变成了现实的地方改写为源码分析**：第一版第 16、17 章是“把插件改造成平台”的设想，v13 官方做出了 Server 运行时，这两章改为拿官方实现对照当初的设想
- **新增两章**：第 18 章讲一份记忆怎么接入 17 种 Agent 宿主，第 19 章讲跨设备同步。原第 18 章前沿探索顺延为第 20 章
- **每一处论断回到源码核对，每个示例在 Node.js 24 上重新跑通**。第 16 章的结论来自一次本地实跑（Postgres + Redis + 假的模型 provider），其中包括几处源码注释与实现不符的地方，书里如实写明

## 什么是 Claude Code

Claude Code 是 Anthropic 官方的命令行 AI 编程工具，直接运行在 shell 中，能读写文件、执行命令、搜索代码。claude-mem 是为它量身设计的记忆插件，借助 Plugin 系统（Hook + MCP 协议）在后台工作，不改变正常使用方式。

## 这本书给谁看

- **前端/全栈工程师**，熟悉 TypeScript + Node.js，想进入 Agent 开发领域
- **已经在做 Agent 开发的人**，想系统理解 Memory 这一层该怎么设计
- **技术负责人**，在评估或规划企业级 Agent Memory 平台

不需要机器学习背景。需要的是：能看懂 TypeScript 代码、理解 HTTP API 设计、用过 SQLite 或类似数据库。

两类读者不适合这本书：完全没写过 TypeScript/Node.js 的读者，书中大量源码分析会读得吃力，建议先补语言基础；只想找一个开箱即用的记忆 SaaS、不关心内部实现的读者，直接看第 15 章的方案对比就够了，不必读全书。

## 版本与范围

本书基于 claude-mem v13.35.0，不复述用户手册。claude-mem 迭代很快，行号和配置项会随版本变化，书的重心放在相对稳定的架构设计与工程取舍上。

另有两处边界：第五部分讲的 Server 运行时在官方文档里仍标注为 Beta；第 17 章的团队权限、审计防篡改等内容属于 claude-mem 商业版保留的区域，书中给的是自建设计，章节里都有标注，这部分代码不能直接用于生产部署。

## 这本书怎么读

全书分五个部分：

**第一部分（认知篇）** 建立心智模型：Agent Memory 的问题域、claude-mem 快速上手、Context Engineering 基础。

**第二部分（架构篇）** 深入源码，逐层拆解系统设计：Hook → Worker → Storage。想理解"生产级 Memory 系统长什么样"，这四章是核心。

**第三部分（机制篇）** 聚焦创新点：Progressive Disclosure、MCP 搜索、Observation 压缩——claude-mem 区别于简单 RAG 的关键设计。

**第四部分（实战篇）** 动手构建 mini-mem，做完你会拥有一个能在 Claude Code 里实际使用的 Memory Plugin。

**第五部分（进阶篇）** 面向团队和产品化：业界方案调研、Server 运行时、企业特性、多宿主接入、跨设备同步，最后是前沿方向。

每章都有配套的可执行代码（`examples/` 目录，TypeScript，可独立运行），也可以直接跳到感兴趣的章节，配合代码上手。

**推荐阅读路线**：

- **"我想快速上手"**：第 2 章 → 第 12 章 → 第 13 章
- **"我想理解设计思想"**：第 1-3 章 → 第 8 章（Progressive Disclosure）
- **"我想深入源码"**：第 4-7 章 → 第 9-11 章
- **"我想做产品/平台"**：前面基础上 + 第 15-17 章，团队部署重点看第 16 章的故障分析
- **"我在用 Codex / Cursor / 多台机器"**：第 4 章 → 第 18 章 → 第 19 章

## 全书知识图谱

```mermaid
graph TB
    subgraph host["宿主：Claude Code / Codex / Cursor / ...（第 5、18 章）"]
        A["SessionStart"]
        C["PostToolUse"]
        E["Stop / SessionEnd"]
    end
    subgraph handoff["交接层（第 4、6 章）"]
        SP[("hook-spool<br/>一个事件一个文件")]
        CC[("context-cache<br/>预渲染的开场上下文")]
    end
    subgraph worker["Worker（第 6、10 章）"]
        BUF["内存缓冲 SessionMessageBuffer"]
        OBS["观察者：生成结构化 Observation"]
    end
    subgraph store["存储（第 7 章）"]
        DB[("SQLite + FTS5")]
        VEC[("Chroma 向量")]
    end
    subgraph read["读取（第 8、9、11 章）"]
        IDX["开场索引 ≤ 10,000 字符"]
        MS["mem_search 三步检索"]
        KA["Knowledge Agent"]
    end
    C --> SP --> BUF --> OBS --> DB
    OBS --> VEC
    E --> SP
    DB --> CC --> A
    A --> IDX
    DB --> MS
    VEC --> MS
    DB --> KA
    DB -.->|"第 16 章 Server 运行时"| PG[("Postgres + BullMQ")]
    DB -.->|"第 19 章 云同步"| HUB[("sync hub")]
```

核心链路：**Observe（Hook 落盘）→ Compress（观察者生成）→ Store（SQLite + 向量）→ Inject（开场索引）→ Search（MCP 分步获取）**

## 社区与勘误

本书在 [inferloop.dev](https://inferloop.dev) 开源发布，勘误反馈和 mini-mem 扩展分享请到社区提交。内容以 CC BY-NC-SA 4.0 协议发布，代码示例以 MIT 协议发布；商业转载请联系作者，个人转载请注明出处。

## 致谢

感谢 Alex Newman 和 claude-mem 社区创建并维护了这个开源项目（v13 起以 Apache-2.0 发布），为这个领域提供了生产级的参考实现。

---

> 本章来自《Agent Memory 工程实战》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
