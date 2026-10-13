# ch06-worker-queue

Hook → spool 文件 → Worker 的交接演示，对应 claude-mem v13 的 hook-spool 设计（第 4、6 章）。

## 运行

```bash
npm install
npm run demo
```

演示四个场景：

1. Worker 不在线时 Hook 照样落盘，重复投递的同一事件只留一个文件
2. Worker 上线后取件、写交接标记、放进内存缓冲、批量生成观察
3. 崩溃发生在“标记已写、文件未删”之间：重启后只删文件，不重复入库（那一批内存数据随进程丢失）
4. 崩溃发生在“标记写入之前”：文件还在，重启后正常处理

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/spool.ts` | Hook 侧：原子写文件，文件名即去重键 |
| `src/worker.ts` | Worker 侧：取件、交接标记表、内存缓冲、批量写库 |
| `src/demo.ts` | 场景演示 |

旧版示例是一个 SQLite 持久队列（pending → processing → done），对应 claude-mem v12 的 `pending_messages` 设计。v13.4.0 删除了那套机制，原因见第 6 章“内存缓冲”一节。

更多讨论见 [inferloop.dev](https://inferloop.dev)
