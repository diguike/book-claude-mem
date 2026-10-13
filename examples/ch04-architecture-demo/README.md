# ch04-architecture-demo

claude-mem v13 四层架构的最小演示：宿主 → Hook → 交接层（hook-spool / context-cache）→ Worker → 存储。

## 运行

```bash
npm install
npm run demo
```

演示四步：

1. Worker 没启动时，Hook 照样把事件写进 spool 并以 0 退出
2. Worker 启动后先补取积压，防抖后重渲染开场上下文缓存
3. Worker 在线时，Hook 写完文件顺手唤醒它（唤醒失败无所谓）
4. Worker 停掉后开新会话，SessionStart 直接读缓存

| 文件 | 说明 |
|------|------|
| `src/index.ts` | 单进程模拟全部四层，便于逐步观察 |

更多讨论见 [inferloop.dev](https://inferloop.dev)
