---
title: 目录
feishu_url: ""
last_synced: ""
---

# Agent Memory 工程实战 — 完整目录

> 源码基线：claude-mem v13.35.0（2026-10-08 发布）

## 前言

- [前言](00-preface/README.md)

## 第一部分：认知篇 — 为什么 Agent 需要记忆

### [第 1 章：Agent Memory 问题域](01-cognition/ch01-problem-domain/README.md)
- 1.1 5 分钟体验：先感受问题，再理解问题
- 1.2 AI Agent 的“金鱼记忆”困境
- 1.3 会话间上下文断裂的代价
- 1.4 Memory 系统的三个核心问题
- 1.5 现有方案对比
- 1.6 claude-mem 的设计哲学：Observe → Compress → Inject
- 配套代码：`examples/ch01-memory-comparison/` — 对比不同 Memory 策略（全量注入 vs RAG vs Progressive Disclosure）的 Token 效率

### [第 2 章：认识 claude-mem — 能力全景与快速上手](01-cognition/ch02-claude-mem-intro/README.md)
- 2.1 claude-mem 是什么
- 2.2 六项核心能力
- 2.3 安装与配置
- 2.4 日常使用场景
- 2.5 Viewer UI：实时观察面板
- 2.6 Skills 体系
- 2.7 配置调优
- 配套代码：`examples/ch02-quick-start/` — claude-mem 常用配置模板与验证脚本

### [第 3 章：Context Engineering 基础](01-cognition/ch03-context-engineering/README.md)
- 3.1 Token 预算即注意力预算
- 3.2 上下文腐烂（Context Rot）与信噪比
- 3.3 System Prompt 的“正确高度”
- 3.4 Just-In-Time Context vs Pre-Inference Retrieval
- 3.5 长任务三板斧
- 3.6 前缀稳定：Prompt Cache 也是上下文工程的一部分
- 配套代码：`examples/ch03-context-engineering/` — Token 计算器与注入策略对比演示

## 第二部分：架构篇 — claude-mem 全景解析

### [第 4 章：系统架构总览](02-architecture/ch04-system-overview/README.md)
- 4.1 源码探索路线图：从哪里开始读
- 4.2 四层架构与两处交接
- 4.3 一次会话里的八个 Hook
- 4.4 数据流全链路
- 4.5 为什么用 Hook 采集，而不做成 Middleware
- 4.6 优雅降级：记忆挂了不能影响 IDE
- 配套代码：`examples/ch04-architecture-demo/` — 模拟 claude-mem 4 层架构的最小 Demo

### [第 5 章：Hook 驱动的生命周期](02-architecture/ch05-hook-lifecycle/README.md)
- 5.1 Claude Code Hook 系统原理
- 5.2 Hook 的 IO 纪律
- 5.3 Setup：依赖不全时在这里自愈
- 5.4 SessionStart：两个 Hook，一个异步一个同步
- 5.5 UserPromptSubmit：本轮 prompt 的登记
- 5.6 PostToolUse 与 PostToolUseFailure：落盘即返回
- 5.7 PreToolUse：文件上下文与读取闸门
- 5.8 Stop 与 SessionEnd：收尾也不等待
- 5.9 Hook 的性能
- 配套代码：`examples/ch05-hook-playground/` — 极简宿主：按 Claude Code 规则执行 Hook 进程，演示同步/async、resume、deny 与退出码策略

### [第 6 章：Worker Service — 异步处理引擎](02-architecture/ch06-worker-service/README.md)
- 6.1 为什么需要后台 Worker
- 6.2 HTTP 层：路由按调用方分组
- 6.3 取件：hook-spool 的“恰好一次”交接
- 6.4 内存缓冲：为什么删掉了持久队列
- 6.5 观察者生成器
- 6.6 Session ID 双轨制
- 6.7 进程管理：以端口和健康检查为准
- 6.8 优雅关闭：六步加一个硬期限
- 配套代码：`examples/ch06-worker-queue/` — Hook spool 交接 + Worker 内存缓冲 Demo（claude-mem v13 模式）

### [第 7 章：存储层设计](02-architecture/ch07-storage/README.md)
- 7.1 SQLite：从 6 张表到 21 张表
- 7.2 PRAGMA 与并发
- 7.3 FTS5 全文搜索
- 7.4 Chroma 向量存储
- 7.5 搜索路由：Chroma 优先，SQLite 补齐
- 7.6 去重：重复不再被丢弃，而是变成证据
- 配套代码：`examples/ch07-storage-layer/` — SQLite FTS5 全文搜索与 WAL 模式实战

## 第三部分：核心机制篇 — 记什么、怎么取

### [第 8 章：Progressive Disclosure — 渐进式信息披露](03-mechanisms/ch08-progressive-disclosure/README.md)
- 8.1 设计哲学：让 Agent 自己决定看什么
- 8.2 一次会话里的五层
- 8.3 Layer 0：工作状态先于记忆
- 8.4 Layer 1：记忆索引
- 8.5 Layer 2 和 Layer 3：被强制执行的三步搜索
- 8.6 Layer 4：原始证据
- 8.7 读代码时的渐进披露：File Read Gate
- 8.8 类型与概念：两个正交的维度
- 8.9 对比传统 RAG
- 配套代码：`examples/ch08-progressive-disclosure/` — 渐进式信息披露 Token 效率对比 Demo

### [第 9 章：MCP 搜索架构](03-mechanisms/ch09-mcp-search/README.md)
- 9.1 MCP (Model Context Protocol) 入门
- 9.2 工具清单：从 4 个到 19 个
- 9.3 从 `__IMPORTANT` 到 `important_workflow`
- 9.4 只读声明与 plan mode
- 9.5 运行时感知的工具列表
- 9.6 Schema：从“越少越好”到“说清楚”
- 9.7 MCP Server 的实现
- 9.8 查询层的注入防护
- 配套代码：`examples/ch09-mcp-server/` — 最小化 MCP Server：search / timeline / get_observations + 带 HMAC 游标的 mem_search 三步协议

### [第 10 章：Observation 系统](03-mechanisms/ch10-observation-system/README.md)
- 10.1 记忆单元：一次工具调用
- 10.2 从工具调用到 Observation 的流水线
- 10.3 Observation 的字段
- 10.4 模式：同一套流水线，不同的记录标准
- 10.5 文件关联
- 10.6 隐私：标签在 Worker 里剥离
- 10.7 显式记忆：save_memory
- 10.8 使用信号：强化排序
- 配套代码：`examples/ch10-observation-pipeline/` — Observation 流水线 Demo：过滤链、标签剥离、提示词组装、XML 解析与校正（不调模型）

### [第 11 章：Knowledge Agent — 知识库构建](03-mechanisms/ch11-knowledge-agent/README.md)
- 11.1 从 Observations 到 Corpus
- 11.2 Corpus 是一个 JSON 文件
- 11.3 Build → Prime → Query
- 11.4 过滤与聚焦
- 11.5 维护：Rebuild 与 Reprime
- 11.6 Knowledge Agent 与 mem_search 的分工
- 配套代码：`examples/ch11-knowledge-agent/` — Knowledge Agent Build→Prime→Query 流程 Demo

## 第四部分：实战篇 — 从零构建 Memory Plugin

### [第 12 章：开发环境搭建](04-practice/ch12-dev-setup/README.md)
- 12.1 Claude Code Plugin 开发基础
- 12.2 Hook 调试
- 12.3 MCP Server 本地开发
- 12.4 SQLite 开发工具链
- 配套代码：`examples/ch12-dev-setup/` — 开发环境验证脚本：检查 Node.js/Bun/SQLite/MCP 配置

### [第 13 章：实现简版 Memory Plugin（mini-mem）](04-practice/ch13-mini-mem/README.md)
- 13.1 项目规划：MVP 功能范围
- 13.2 Hook Layer
- 13.3 存储层
- 13.4 MCP Search
- 13.5 测试与调试
- 13.6 常见问题排查
- 配套代码：`examples/ch13-mini-mem/` — 简版 Agent Memory Plugin — 第13章实战项目

### [第 14 章：进阶功能扩展](04-practice/ch14-extensions/README.md)
- 14.1 扩展全景
- 14.2 异步化：先做这一步
- 14.3 添加 AI 压缩
- 14.4 实现 Timeline 时间线视图
- 14.5 向量检索集成
- 14.6 Viewer UI：实时展示面板
- 14.7 多项目识别
- 配套代码：`examples/ch14-extensions/` — AI 压缩 + 向量搜索 + Viewer UI 模块示例

## 第五部分：进阶篇 — 平台化、多宿主与前沿

### [第 15 章：业界 Agent Memory 方案调研](05-enterprise/ch15-industry-survey/README.md)
- 15.1 OpenAI Memory / ChatGPT Memory 机制分析
- 15.2 LangChain / LangGraph Memory 模块
- 15.3 Mem0：开源 Memory Layer
- 15.4 Zep：长期记忆服务
- 15.5 MemGPT / Letta：操作系统式内存管理
- 15.6 Cognee：知识图谱驱动的记忆引擎
- 15.7 宿主自带的记忆：Claude Code 与 Codex
- 15.8 Quick Try：各方案 5 分钟体验
- 15.9 各方案横向对比与启发提炼
- 配套代码：`examples/ch15-industry-survey/` — 各方案核心 API 调用对比

### [第 16 章：从 Plugin 到平台：claude-mem Server 运行时](05-enterprise/ch16-platform-upgrade/README.md)
- 16.1 两种运行时
- 16.2 一条事件的旅程
- 16.3 租户隔离写在 schema 里
- 16.4 鉴权、作用域与配额
- 16.5 故障时会发生什么
- 16.6 检索：tsvector，以及还没用上的 embedding
- 16.7 从 worker 迁到 Server
- 16.8 和直觉方案的对照
- 配套代码：`examples/ch16-platform-arch/` — 多租户记忆服务的最小模型：复合外键隔离、发件箱、确定性任务 ID、运维重试

### [第 17 章：企业级特性：开源版给了什么，还要补什么](05-enterprise/ch17-enterprise-features/README.md)
- 17.1 数据会去哪里
- 17.2 密钥会不会被记下来
- 17.3 系统自身是否可信
- 17.4 能不能删干净
- 17.5 团队记忆与权限（保留区域，自建设计）
- 17.6 审计日志（保留区域，自建设计）
- 17.7 度量：记忆有没有被用上（自建设计）
- 配套代码：`examples/ch17-enterprise-features/` — 自动脱敏（移植 claude-mem 规则）+ 角色到作用域的映射 + 哈希链审计日志

### [第 18 章：一份记忆，多个宿主](05-enterprise/ch18-multi-host/README.md)
- 18.1 三种接入方式
- 18.2 Hook 适配器：把不同的 stdin 翻译成同一个结构
- 18.3 声明式 transcript：用配置描述日志格式
- 18.4 原生插件
- 18.5 单写者原则
- 18.6 身份：会话 ID 和 prompt ID 要用宿主给的
- 18.7 接入新宿主的检查清单
- 配套代码：`examples/ch18-multi-host/` — 声明式 transcript 引擎：同一份代码读 Codex 与 DSH 的会话日志

### [第 19 章：跨设备同步：数据库就是队列](05-enterprise/ch19-cloud-sync/README.md)
- 19.1 整体结构
- 19.2 推送：数据库就是队列
- 19.3 拉取：一个事务里应用数据和游标
- 19.4 哪些东西不同步
- 19.5 删除与墓碑
- 19.6 与第 16 章 Server 运行时的对照
- 配套代码：`examples/ch19-cloud-sync/` — 两台设备 + 一个 hub：数据库即队列、ack 盖戳、事务拉取、回声防护、墓碑

### [第 20 章：前沿探索](05-enterprise/ch20-frontier/README.md)
- 20.1 互操作：没有标准，但有了事实上的接口
- 20.2 遗忘：从保留分数到 ACT-R
- 20.3 多 Agent：子代理的观察
- 20.4 多模态：先把图片挡在外面
- 20.5 记忆驱动的自我进化
- 配套代码：`examples/ch20-frontier/` — 开场索引的三种遗忘策略对比：默认最新 N 条 / claude-mem ACT-R / 指数衰减

## 附录

- [附录 A：claude-mem 源码导航图](appendix/A-source-map.md)
- [附录 B：Claude Code Hook API 速查](appendix/B-hook-api.md)
- [附录 C：MCP 协议规范要点](appendix/C-mcp-protocol.md)
- [附录 D：SQLite FTS5 语法速查](appendix/D-fts5-syntax.md)
- [附录 E：mini-mem 完整源码清单](appendix/E-mini-mem-listing.md)
- [附录 F：参考资料](appendix/F-references.md)
