---
title: "附录 B：Claude Code Hook API 速查"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/SE3OwrStlihD2WkVQAUc61oRnVb"
last_synced: "2026-10-13T11:44:05+08:00"
---

本附录汇总写一个记忆插件时会用到的 Hook 接口，在 Claude Code 2.1.296 上验证，claude-mem 的配置以 v13.35.0 为准。完整规范见官方文档 [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks)。

## 事件

| 事件 | 触发时机 | stdin 主要字段 | 常用输出 | claude-mem 的用法 |
|------|---------|---------------|---------|------------------|
| Setup | 插件安装或更新后 | 通用字段 | 无 | 依赖自愈（300 秒） |
| SessionStart | 会话开始；`source` 为 `startup` / `resume` / `clear` / `compact` | `source` | `additionalContext` 注入上下文 | 一个异步拉起 Worker，一个同步注入；`resume` 不注入 |
| UserPromptSubmit | 用户提交 prompt | `prompt` | 退出码 2 会丢弃 prompt | 登记本轮 prompt（15 秒） |
| PreToolUse | 工具调用前 | `tool_name`、`tool_input`、`tool_use_id` | `additionalContext`；`permissionDecision: 'deny'` | 文件上下文与 File Read Gate（15 秒） |
| PostToolUse | 工具调用成功后 | 上述字段 + `tool_response` | 无 | 写 spool，`async`（120 秒） |
| PostToolUseFailure | 工具调用失败后 | 上述字段 + `error`、`is_interrupt` | 无 | 同 PostToolUse |
| Stop | 本轮回复结束 | 通用字段 | 退出码 2 会让 Agent 继续工作 | 触发摘要，`async` |
| SessionEnd | 会话关闭 | `reason` | 无 | 写一个结束条目，`async`；宿主只给约 1.5 秒 |

通用字段：`session_id`、`cwd`、`transcript_path`、`hook_event_name`；子代理触发时另有 `agent_id`、`agent_type`。

## hooks.json

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "shell": "bash",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/save-hook.js\"",
            "timeout": 120,
            "async": true
          }
        ]
      }
    ]
  }
}
```

| 字段 | 说明 |
|------|------|
| `matcher` | `"*"` 匹配全部；`"Read\|Edit"` 多值；支持正则，如 `^Bash$`、`^mcp__.+__memory_search$`；SessionStart 匹配的是 `source` |
| `timeout` | 秒，超时后宿主终止进程 |
| `async` | `true` 时宿主不等待返回，命令在后台跑完；同步 Hook 的输出才会被宿主采纳 |
| `shell` | 指定 `bash`，保证 PATH 和变量展开一致 |

`${CLAUDE_PLUGIN_ROOT}` 由宿主注入，指向插件目录；路径可能含空格，务必加双引号。`claude plugin validate <路径>` 会检查这类问题，`claude --plugin-dir <路径>` 可以不安装直接加载本地插件。

## stdout

```jsonc
// 什么都不做
{ "continue": true, "suppressOutput": true }

// SessionStart / PreToolUse：附加上下文
{ "hookSpecificOutput": { "hookEventName": "SessionStart", "additionalContext": "..." } }

// PreToolUse：拒绝这次调用，理由会交给模型
{ "hookSpecificOutput": { "hookEventName": "PreToolUse",
                          "permissionDecision": "deny",
                          "permissionDecisionReason": "..." } }

// 任意事件：给用户看的一行提示，不进模型上下文
{ "systemMessage": "..." }
```

**注入上限**：`additionalContext` 超过 10,000 字符时，宿主会把整段换成一个预览，模型实际收不到内容，而 Hook 仍显示成功。注入前先量长度（第 8 章）。

## 退出码

| 退出码 | 宿主行为 |
|------|---------|
| 0 | 成功，解析 stdout |
| 2 | 阻断：UserPromptSubmit 丢弃 prompt，PreToolUse 拒绝调用，Stop 让 Agent 继续；stderr 交给模型 |
| 其他 | 非阻断错误，stderr 展示给用户，会话继续 |

记忆插件的出错不应该影响会话。claude-mem 的做法是所有路径都以 0 退出：每条命令末尾包一层 `|| exit 0`，Hook 内部缓冲 stderr，连续失败达到阈值（`CLAUDE_MEM_HOOK_FAIL_LOUD_THRESHOLD`，默认 3）才用 `systemMessage` 提示用户。v12 曾用退出码 2 报告内部错误，结果用户的 prompt 被宿主丢掉（第 5 章）。

## 性能

在 Intel Xeon 8255C（4 核）、Node 24.14、Bun 1.3.11 上实测（第 5 章）：

| 场景 | 耗时 |
|------|------|
| `node` 空跑 | 82–89 ms |
| `bun` 空跑 | 12–15 ms |
| claude-mem 打包文件（3.37 MB）空操作 | 466–480 ms |
| 一次观察，bun 直接执行 | 501–554 ms |
| 一次观察，经 node 的 bun-runner | 591–639 ms |

同步 Hook 的每一毫秒都直接加在用户的等待上。能异步的事件（PostToolUse、Stop、SessionEnd）一律 `async`；必须同步的（SessionStart 注入、PreToolUse）尽量只读本地文件，不发网络请求。

## 调试

- `CLAUDE_CONFIG_DIR` 指向一个空目录，可以隔离本机的 Claude Code 设置。本机设置里禁用了某个插件时，它的 Hook 会直接退出，测出来的结果没有意义
- 手动执行 Hook：`echo '{"session_id":"t","cwd":"/tmp","hook_event_name":"PostToolUse","tool_name":"Read"}' | node save-hook.js`
- 第 5 章的 `examples/ch05-hook-playground` 是一个按上述规则执行 Hook 的极简宿主，可以离线观察同步 / async、deny 和退出码的行为

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

---

> 本附录来自《Agent Memory 工程实战》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
