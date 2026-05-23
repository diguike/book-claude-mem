# ch04-architecture-demo

模拟 claude-mem 4 层架构（Hook -> CLI -> Worker -> Storage）的最小完整 Demo。

## 运行

```bash
npm install
npm run demo
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/index.ts` | 完整 mini 演示：Hook stdin -> CLI 处理 -> HTTP 发到 Worker -> Worker 存库 |

更多讨论见 [inferloop.dev](https://inferloop.dev)
