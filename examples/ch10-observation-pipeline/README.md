---
title: "ch10 示例：Observation 流水线"
---

# ch10：Observation 流水线

不调用模型，按 claude-mem v13.35.0 的顺序走一遍第 10 章的流水线：

1. 过滤链：跳过列表、Bash 跳过模式、整轮私有 prompt
2. 剥离 6 种标签 + 可选脱敏（超长字段整段替换为 `<redacted type='oversize'/>`）
3. 观察者 prompt：字段超长时保留头 60%、尾 30%，中间插入 `<elided … />` 标记
4. 解析一段“不守规矩”的观察者回复：大写标签、`keyword: description` 形式的 concept、`<skip_summary />`
5. `files_modified` 按真实写操作校正，模型多报的文件被丢弃
6. `content_hash` 唯一约束：同一会话内的重复观察变成一次“强化”

## 运行

```bash
npm install
npm run demo
```

更多讨论见 [inferloop.dev](https://inferloop.dev)
