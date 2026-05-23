---
title: "ch10 示例：Observation 压缩管道"
---

# ch10：Observation 压缩管道 Demo

演示 Observation 从原始工具调用数据到结构化记忆的压缩过程。

## 运行

```bash
npm install

# 演示规则提取（不需要 API Key）
npm run demo:rule

# 演示完整管道（包含结构化输出）
npm run demo
```

## 演示内容

1. **工具调用数据**：模拟 PostToolUse Hook 接收到的原始数据
2. **规则提取**：基于工具名、文件路径、关键词的启发式提取
3. **结构化输出**：生成 type/title/narrative/facts 四字段结构

注意：`demo:ai` 需要设置 `ANTHROPIC_API_KEY` 环境变量，且会消耗 API 额度。
