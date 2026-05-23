# ch03-context-engineering

Token 计算器与注入策略（全量 vs Progressive Disclosure）对比演示。

## 运行

```bash
npm install
npm run demo     # Token 计算器
npm run compare  # 注入策略对比
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/token-counter.ts` | 中英文混合文本的 token 数估算 |
| `src/injection-strategies.ts` | 全量注入 vs Progressive Disclosure 的 token 消耗对比 |

更多讨论见 [inferloop.dev](https://inferloop.dev)
