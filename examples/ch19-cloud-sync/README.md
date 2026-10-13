# ch19-cloud-sync：两台设备 + 一个 hub

第 19 章配套示例。用两个内存 SQLite 库模拟笔记本和台式机，一个进程内的 `Hub` 模拟 claude-mem 的 `workers/sync-hub`（每个用户一条有序日志），演示 claude-mem v13.35.0 云同步（`src/services/sync/`）的几条核心规则。

```bash
npm install
npm run demo
npm run typecheck
```

| 场景 | 对应的规则 |
|------|-----------|
| [1] 离线写入后一次推送 | 数据库即队列：`WHERE synced_at IS NULL AND origin_device_id IS NULL` |
| [2] 推送途中本地又改了 | 盖戳前核对 ack 与推送内容一一对应；只在当前版本等于 ack 版本时盖戳，否则下一轮按新版本重推 |
| [3] 回声 | 拉来的行预先盖上 `synced_at`，自己设备的操作直接跳过 |
| [4] 拉取中途崩溃 | 整批数据和游标在同一个事务里 |
| [5] 设备本地字段 | 强化次数之类的字段不进操作体 |
| [6] 删除 | 墓碑作为一个更高版本的操作同步；只能删本机产生的行 |
| [7] 超大行 | 单条超过 256,000 字节进死信，不阻塞后面的行 |

## 与真实实现的差别

- hub 只做了追加、去重和分页读取，没有鉴权、epoch、投影（claude-mem 的 hub 会把数据投影到 cmem.ai 的检索服务）和实时推送通道
- 操作体只带 `title` 和 `narrative` 两个字段；真实的 observation 操作体字段见 `SyncApply.ts` 文件头的字段映射
- 没有实现变更类操作（改标题、项目重映射）、毒药操作的三次拒绝阈值、401/403 暂停
- 推送时直接从业务表读行发送，没有实现 `sync_content_outbox` 的不可变快照层（正文“两层：脏标记和不可变快照”一节解释了真实实现为什么需要它）
