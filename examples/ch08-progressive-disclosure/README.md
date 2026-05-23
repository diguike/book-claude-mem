---
title: "ch08 示例：渐进式信息披露"
---

# ch08：渐进式信息披露 Token 效率 Demo

演示三层信息披露策略对 Token 消耗的影响。

## 运行

```bash
npm install
npm run demo
```

## 演示内容

1. **Layer 1（索引层）**：只输出标题索引表，约 30-50 Token/条
2. **Layer 2（上下文层）**：展开 narrative 摘要，约 80-120 Token/条
3. **Layer 3（详情层）**：完整 facts 数组，约 200-400 Token/条

对比同样 20 条 Observation 在三种策略下的 Token 开销差异。
