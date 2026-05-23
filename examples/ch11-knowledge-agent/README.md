---
title: "ch11 示例：Knowledge Agent"
---

# ch11：Knowledge Agent Build→Prime→Query Demo

演示 Knowledge Agent 的三阶段工作流，不依赖 AI API（使用规则模拟聚类）。

## 运行

```bash
npm install
npm run demo
```

## 演示阶段

1. **Build**：从 Observation 集合中按类型聚类，生成主题 Corpus
2. **Prime**：将 Corpus 压缩为 LLM 可注入的上下文摘要
3. **Query**：在 Corpus 中搜索特定主题，返回相关 Observation

实际的 claude-mem 使用 Claude Agent SDK 做 Build 阶段的 AI 聚类，
此 Demo 使用基于 type 字段的规则聚类作为近似替代。
