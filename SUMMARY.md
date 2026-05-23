---
title: 目录
feishu_url: ""
last_synced: ""
---

# Agent Memory 工程实战 — 完整目录

## 第一部分：认知篇 — 为什么 Agent 需要记忆

### 第 1 章：Agent Memory 问题域
- 1.1 AI Agent 的"金鱼记忆"困境
- 1.2 会话间上下文断裂的代价
- 1.3 Memory 系统的三个核心问题：记什么、怎么记、怎么用
- 1.4 现有方案对比：RAG vs 结构化笔记 vs 压缩摘要
- 1.5 claude-mem 的设计哲学：Observe → Compress → Inject
- 配套代码：`examples/ch01-memory-comparison/` — 不同 Memory 策略的效果对比演示

### 第 2 章：认识 claude-mem — 能力全景与快速上手
- 2.1 claude-mem 是什么：一句话定义与核心价值
- 2.2 五大核心能力：观察、压缩、注入、搜索、知识库
- 2.3 安装与配置：5 分钟跑通第一个 Memory 循环
- 2.4 日常使用场景：跨会话记忆、代码考古、决策追溯
- 2.5 Viewer UI：实时观察面板使用指南
- 2.6 Skills 体系：learn-codebase / make-plan / mem-search / knowledge-agent
- 2.7 配置调优：observation 数量、项目过滤、隐私标签
- 配套代码：`examples/ch02-quick-start/` — 安装脚本 + 常用配置模板 + 使用场景演示

### 第 3 章：Context Engineering 基础
- 3.1 Token 预算即注意力预算
- 3.2 上下文腐烂（Context Rot）与信噪比
- 3.3 System Prompt 的"正确高度"
- 3.4 Just-In-Time Context vs Pre-Inference Retrieval
- 3.5 长任务三板斧：Compaction、结构化笔记、Sub-Agent
- 配套代码：`examples/ch03-context-engineering/` — Token 计算器 + 不同注入策略的 A/B 对比实验

## 第二部分：架构篇 — claude-mem 全景解析

### 第 4 章：系统架构总览
- 4.1 四层架构：Claude Code → CLI Layer → Worker Daemon → Storage
- 4.2 五个生命周期 Hook 的职责划分
- 4.3 数据流全链路：从用户 Prompt 到 Observation 落库
- 4.4 关键设计决策：为什么是 Hook 而不是 Middleware
- 4.5 优雅降级：Memory 挂了不能影响 IDE
- 配套代码：`examples/ch04-architecture-demo/` — 模拟 4 层架构的最小可运行 Demo

### 第 5 章：Hook 驱动的生命周期
- 5.1 Claude Code Hook 系统原理
- 5.2 Setup Hook：版本检测的"不打扰"哲学
- 5.3 SessionStart Hook：上下文注入的时机选择
- 5.4 UserPromptSubmit Hook：会话追踪的起点
- 5.5 PostToolUse Hook：观察捕获的"快进快出"
- 5.6 Summary & SessionEnd Hook：优雅收尾
- 5.7 Hook 的性能指标：p95 < 50ms 的工程实践
- 配套代码：`examples/ch05-hook-playground/` — 可独立运行的 Hook 模拟器，含计时与日志

### 第 6 章：Worker Service — 异步处理引擎
- 6.1 为什么需要后台 Worker（Hook 必须快，AI 压缩慢）
- 6.2 Express HTTP API 设计
- 6.3 Pending Queue 机制：入队 → 处理 → 确认
- 6.4 SDK Agent 的 Generator 模式与重启策略
- 6.5 Session ID 双轨制：contentSessionId vs memorySessionId
- 6.6 进程管理：PID 文件、健康检查、Orphan Reaper
- 6.7 Graceful Shutdown 七步法
- 配套代码：`examples/ch06-worker-queue/` — Express + SQLite 队列的完整异步处理 Demo

### 第 7 章：存储层设计
- 7.1 SQLite 数据模型：6 张核心表
- 7.2 FTS5 全文搜索：从建表到查询优化
- 7.3 WAL 模式与并发读写
- 7.4 ChromaDB 向量存储：Embedding 同步策略
- 7.5 混合检索：关键词 + 语义的 Hybrid Search
- 7.6 Deduplication：内容哈希去重的 30 秒窗口
- 配套代码：`examples/ch07-storage-layer/` — SQLite FTS5 + better-sqlite3 实战 + ChromaDB 接入示例

## 第三部分：核心机制篇 — 深入关键实现

### 第 8 章：Progressive Disclosure — 渐进式信息披露
- 8.1 设计哲学：让 Agent 自己决定看什么
- 8.2 三层工作流：Index → Context → Details
- 8.3 Token 成本可见化：为什么展示"~155 tokens"
- 8.4 语义压缩：好标题的 10 个字原则
- 8.5 图标分类系统的认知负载优化
- 8.6 对比传统 RAG 的效率差异（案例实测）
- 配套代码：`examples/ch08-progressive-disclosure/` — 实现一个带 Token 计量的 3 层索引系统

### 第 9 章：MCP 搜索架构
- 9.1 MCP (Model Context Protocol) 入门
- 9.2 从 9 个工具到 4 个工具的演进之路
- 9.3 `__IMPORTANT` 工具：用工具定义引导行为
- 9.4 search → timeline → get_observations 三步曲
- 9.5 MCP Server 实现：协议翻译层的极简设计
- 9.6 FTS5 注入防护：332 个攻击测试用例
- 配套代码：`examples/ch09-mcp-server/` — 从零实现一个 MCP Server（TypeScript + @modelcontextprotocol/sdk）

### 第 10 章：Observation 系统
- 10.1 什么值得记：Tool Usage 作为观察单元
- 10.2 AI 压缩流水线：Claude Agent SDK 的使用
- 10.3 Observation 结构：type / title / narrative / facts / concepts
- 10.4 文件关联与空间分组
- 10.5 隐私控制：`<private>` 标签的边缘处理
- 10.6 反馈信号：observation_feedback 的用途
- 配套代码：`examples/ch10-observation-pipeline/` — 从原始 Tool Output 到结构化 Observation 的完整流水线

### 第 11 章：Knowledge Agent — 知识库构建
- 11.1 从 Observations 到 Corpus 的编译过程
- 11.2 Build → Prime → Query 工作流
- 11.3 Corpus 的过滤与聚焦策略
- 11.4 会话式知识查询的实现
- 11.5 Corpus 的维护：Rebuild 与 Reprime
- 配套代码：`examples/ch11-knowledge-agent/` — 基于本地 Observations 构建可查询知识库

## 第四部分：实战篇 — 从零构建 Memory Plugin

### 第 12 章：开发环境搭建
- 12.1 Claude Code Plugin 开发基础
- 12.2 Hook 配置与调试技巧
- 12.3 MCP Server 本地开发流程
- 12.4 SQLite 开发工具链
- 配套代码：`examples/ch12-dev-setup/` — 开发环境一键初始化脚本

### 第 13 章：实现简版 Memory Plugin（mini-mem）
- 13.1 项目规划：MVP 功能范围
- 13.2 Hook Layer：SessionStart + PostToolUse + SessionEnd
- 13.3 存储层：SQLite Schema 设计与 FTS5 建表
- 13.4 Worker Service：Express + Queue 基础架构
- 13.5 Context Injection：渐进式上下文注入
- 13.6 MCP Search：实现 search + get_observations
- 13.7 测试与调试：端到端验证
- 配套代码：`examples/ch13-mini-mem/` — 完整可运行的 mini-mem Plugin 项目

### 第 14 章：进阶功能扩展
- 14.1 添加 AI 压缩（接入 Claude API）
- 14.2 实现 Timeline 时间线视图
- 14.3 向量搜索集成（ChromaDB / Qdrant）
- 14.4 Viewer UI：React 实时展示面板
- 14.5 多项目隔离与切换
- 配套代码：`examples/ch14-extensions/` — AI 压缩 + 向量搜索 + Viewer UI 独立模块

## 第五部分：进阶篇 — 企业级 Memory 平台

### 第 15 章：业界 Agent Memory 方案调研
- 15.1 OpenAI Memory / ChatGPT Memory 机制分析
- 15.2 LangChain / LangGraph Memory 模块解析
- 15.3 Mem0：开源 Memory Layer 的设计取舍
- 15.4 Zep：长期记忆服务的架构选型
- 15.5 MemGPT / Letta：操作系统式内存管理
- 15.6 Cognee：知识图谱驱动的记忆引擎
- 15.7 各方案横向对比与启发提炼
- 配套代码：`examples/ch15-industry-survey/` — 各方案核心 API 调用对比 Demo

### 第 16 章：从 Plugin 到平台的架构升级
- 16.1 单用户 → 多用户：认证与隔离
- 16.2 本地 SQLite → 分布式存储（PostgreSQL + pgvector）
- 16.3 单 Worker → 队列集群（BullMQ / Temporal）
- 16.4 Hook → Webhook/Event Bus：解耦与扩展
- 16.5 多 IDE 支持：Cursor / Windsurf / Gemini CLI 适配
- 配套代码：`examples/ch16-platform-arch/` — 多租户 Memory API 服务骨架（Express + PostgreSQL + pgvector）

### 第 17 章：企业级特性设计
- 17.1 团队知识共享：Shared Memory Space
- 17.2 权限模型：项目级 / 团队级 / 组织级
- 17.3 数据治理：保留策略、脱敏、审计日志
- 17.4 Analytics Dashboard：使用洞察与优化建议
- 17.5 API 网关：统一的 Memory-as-a-Service 接口
- 配套代码：`examples/ch17-enterprise-features/` — RBAC 权限 + 数据脱敏 + 审计日志模块

### 第 18 章：前沿探索
- 18.1 RAD (Real-Time Agent Data) 开放标准
- 18.2 Agent Memory 与 Agent-to-Agent 协作
- 18.3 长期记忆的遗忘曲线：何时淘汰旧知识
- 18.4 多模态记忆：代码之外的设计稿、对话、文档
- 18.5 Memory 驱动的 Agent 自我进化
- 配套代码：`examples/ch18-frontier/` — 遗忘算法实现 + 多 Agent 共享记忆 PoC

## 附录

### 附录 A：claude-mem 源码导航图
### 附录 B：Claude Code Hook API 速查
### 附录 C：MCP 协议规范要点
### 附录 D：SQLite FTS5 语法速查
### 附录 E：mini-mem 完整源码清单
### 附录 F：推荐阅读与参考资料
