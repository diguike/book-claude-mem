# ch07-storage-layer

SQLite FTS5 全文搜索与 WAL 模式并发读写实战。

## 运行

```bash
npm install
npm run demo  # FTS5 全文搜索演示
npm run wal   # WAL 模式并发读写演示
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/fts5-demo.ts` | 建表、插入数据、FTS5 搜索、展示结果 |
| `src/wal-demo.ts` | 演示 WAL 模式下的并发读写 |

更多讨论见 [inferloop.dev](https://inferloop.dev)
