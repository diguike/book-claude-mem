---
title: "Agent Memory 工程实战：从 claude-mem 源码到企业级记忆平台"
feishu_url: ""
last_synced: ""
---

# Agent Memory 工程实战：从 claude-mem 源码到企业级记忆平台

> 在线阅读 · [inferloop.dev/claude-mem](https://inferloop.dev/claude-mem)  
> 所有书目 · [inferloop.dev](https://inferloop.dev)


> **作者**：递归客 | **社区**：[inferloop.dev](https://inferloop.dev) | **协议**：CC BY-NC-SA 4.0

基于 claude-mem 开源项目的深度源码解析，面向前端/全栈工程师的 Agent Memory 系统设计与实现指南。

## 目标读者

- 有 2+ 年前端/全栈开发经验，熟悉 TypeScript + Node.js
- 对 AI Agent 开发感兴趣，想深入理解 Memory 系统的设计
- 想从"调 API 做应用"进阶到"理解 Agent 基础设施"的工程师
- 有意构建企业级 Agent Memory 平台的技术负责人

## 你将学到

- Claude Code Plugin 系统的架构设计与 Hook 机制
- Agent Memory 的核心问题：什么该记、怎么记、怎么用
- Context Engineering：LLM 上下文窗口的工程化管理
- Progressive Disclosure（渐进式信息披露）的设计哲学
- MCP (Model Context Protocol) 的实际应用
- SQLite + ChromaDB 混合搜索架构
- 从零实现一个简版 Memory Plugin（mini-mem）
- 企业级 Memory 平台的架构思考

## 快速开始

```bash
# 跟着第 13 章动手做 mini-mem
cd examples/ch13-mini-mem
npm install && npm run build
npm run test:save    # 模拟工具调用
npm run test:context # 查看索引输出
```

## 目录

- [前言](00-preface/README.md)

**第一部分　认知篇 — 为什么 Agent 需要记忆**

- [第 1 章　Agent Memory 问题域](01-cognition/ch01-problem-domain/README.md)
- [第 2 章　认识 claude-mem — 能力全景与快速上手](01-cognition/ch02-claude-mem-intro/README.md)
- [第 3 章　Context Engineering 基础](01-cognition/ch03-context-engineering/README.md)

**第二部分　架构篇 — claude-mem 全景解析**

- [第 4 章　系统架构总览](02-architecture/ch04-system-overview/README.md)
- [第 5 章　Hook 驱动的生命周期](02-architecture/ch05-hook-lifecycle/README.md)
- [第 6 章　Worker Service — 异步处理引擎](02-architecture/ch06-worker-service/README.md)
- [第 7 章　存储层设计](02-architecture/ch07-storage/README.md)

**第三部分　核心机制篇 — 深入关键实现**

- [第 8 章　Progressive Disclosure — 渐进式信息披露](03-mechanisms/ch08-progressive-disclosure/README.md)
- [第 9 章　MCP 搜索架构](03-mechanisms/ch09-mcp-search/README.md)
- [第 10 章　Observation 系统](03-mechanisms/ch10-observation-system/README.md)
- [第 11 章　Knowledge Agent — 知识库构建](03-mechanisms/ch11-knowledge-agent/README.md)

**第四部分　实战篇 — 从零构建 Memory Plugin**

- [第 12 章　开发环境搭建](04-practice/ch12-dev-setup/README.md)
- [第 13 章　实现简版 Memory Plugin（mini-mem）](04-practice/ch13-mini-mem/README.md)
- [第 14 章　进阶功能扩展](04-practice/ch14-extensions/README.md)

**第五部分　进阶篇 — 企业级 Memory 平台**

- [第 15 章　业界 Agent Memory 方案调研](05-enterprise/ch15-industry-survey/README.md)
- [第 16 章　从 Plugin 到平台的架构升级](05-enterprise/ch16-platform-upgrade/README.md)
- [第 17 章　企业级特性设计](05-enterprise/ch17-enterprise-features/README.md)
- [第 18 章　前沿探索](05-enterprise/ch18-frontier/README.md)

**附录**

- [附录 A　claude-mem 源码导航图](appendix/A-source-map.md)
- [附录 B　Claude Code Hook API 速查](appendix/B-hook-api.md)
- [附录 C　MCP 协议规范要点](appendix/C-mcp-protocol.md)
- [附录 D　SQLite FTS5 语法速查](appendix/D-fts5-syntax.md)
- [附录 E　mini-mem 完整源码清单](appendix/E-mini-mem-listing.md)
- [附录 F　参考资料](appendix/F-references.md)

## 参考项目

- 源码：`_references/claude-mem/` (v12.6.2, AGPL-3.0)
- 官网：https://claude-mem.ai
- GitHub：https://github.com/thedotmack/claude-mem

## 社区

- **读者交流 & 勘误反馈**：[inferloop.dev](https://inferloop.dev)
- **mini-mem 扩展分享**：欢迎在社区展示你的实现

## 版权声明

本书内容以 **CC BY-NC-SA 4.0** 协议发布，代码示例以 **MIT** 协议发布。

- 个人学习转载：注明出处 + 链接回 [inferloop.dev](https://inferloop.dev)
- 商业使用：请联系作者获取授权
- 禁止：去除版权信息后二次分发


## 相关书

来自同一作者的其他书:

- [《Hermes Agent 源码解读》](https://inferloop.dev/hermes-agent)
- [《LLM Infra 工程实战》](https://inferloop.dev/llm-infra)
- [《AI Token 中转站实战》](https://inferloop.dev/llm-gateway)
- [《百万级 AI Agent 平台架构》](https://inferloop.dev/enterprise-agent)
- [《OpenClaw 源码解析》](https://inferloop.dev/openclaw)
- [《Transformer 教学》](https://inferloop.dev/transformer)
- [《Claude Code Skill 开发指南》](https://inferloop.dev/claude-skill)
- [《Claude 插件官方指南》](https://inferloop.dev/claude-plugins)
- [《自己动手写 AI Agent》](https://inferloop.dev/ling-agent)
