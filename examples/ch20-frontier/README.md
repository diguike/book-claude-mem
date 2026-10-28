# ch20-frontier：开场索引的三种遗忘策略

第 20 章配套示例。开场索引只能放 8 条，从 20 条观察里选，对比三种策略：

| 策略 | 来源 |
|------|------|
| A. 最新的 N 条 | claude-mem 默认（`CLAUDE_MEM_REINFORCE_ALPHA=0`） |
| B. ACT-R 强度排序 | 逐行移植 claude-mem v13.35.0 `src/services/reinforcement/rank.ts` 的 `blendedScore` / `rankByStrength` |
| C. 指数衰减保留分数 | 朴素方案（按类型加权，180 天时间常数，访问次数用强化次数代替） |

```bash
npm install
npm run demo
npm run typecheck
```

输出的最后一部分把幂律衰减 `t^-0.5` 和指数衰减 `e^(-t/180)` 放在一起，可以看出两者在第一周和一年以后的差别。
