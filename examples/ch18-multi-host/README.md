# ch18-multi-host：声明式 transcript 引擎

第 18 章配套示例。一份约 150 行的引擎（`src/engine.ts`）加两份 JSON schema，读取两种宿主的会话日志，翻译成统一的 prompt / observation / summarize 事件。

```bash
npm install
npm run demo
npm run typecheck
```

| 场景 | 说明 |
|------|------|
| [1] Codex 日志 | `schemas/codex.json`，跳过宿主注入的 `<skills_instructions>`，按 `call_id` 把调用和结果配成一条观察 |
| [2] DSH 日志 | `schemas/dsh.json`，引擎代码不变，只换 schema |
| [3] 增量读取 | 从上次的字节偏移继续，旧行不重发 |
| [4] 下游拒收 | 检查点停在被拒的那一行；会话状态（未配对的工具调用）一起回滚，恢复后重试成功 |
| [5] 单写者 | 原生 Hook 已覆盖顶层会话时，transcript 只读子代理会话 |

## 来源与差别

`schemas/` 下的两份 schema 复制自 claude-mem v13.35.0 的 `transcript-watch.example.json`（Apache-2.0），只做了一处改动：DSH 的 `session-meta` 事件加了 `"sessionId": "id"`。claude-mem 的 watcher 另行读取日志头里的会话 ID，本示例没有实现这条旁路，改为在 schema 里声明。

match 规则（`equals / in / exists / not_starts_with / all / any` 等）和字段写法（路径、`coalesce`、`value`、`default`）与 `src/services/transcripts/types.ts`、`field-utils.ts` 一致。没有实现的部分：文件轮转识别（inode + 检查点前 4 KiB 指纹）、zstd 压缩日志、目录监听、待配对工具调用的数量上限。
