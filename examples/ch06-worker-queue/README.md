# ch06-worker-queue

Express + SQLite 实现的任务队列 Demo，模拟 claude-mem Worker 的异步处理机制。

## 运行

```bash
npm install
npm run demo
# 另一个终端测试：curl -X POST http://localhost:7780/enqueue -H "Content-Type: application/json" -d '{"task":"compress","payload":"obs-001"}'
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/server.ts` | Express 服务，POST /enqueue 入队 + 定时处理队列 |
| `src/queue.ts` | SQLite 实现的 pending queue |

更多讨论见 [inferloop.dev](https://inferloop.dev)
