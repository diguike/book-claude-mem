---
title: "附录 B：Claude Code Hook API 速查"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/SE3OwrStlihD2WkVQAUc61oRnVb"
last_synced: "2026-05-05T16:52:35Z"
---

# 附录 B：Claude Code Hook API 速查

## Hook 事件类型

| 事件 | 触发时机 | stdin 包含 | 可返回 |
|------|---------|-----------|--------|
| Setup | Claude Code 启动时 | `{}` | `{ continue: true }` |
| SessionStart | 新会话开始 | `session_id, cwd, source` | `hookSpecificOutput.additionalContext` |
| UserPromptSubmit | 用户提交 prompt | `session_id, cwd, prompt` | `{ continue: true }` |
| PreToolUse | 工具调用前 | `session_id, tool_name, tool_input` | 可阻止工具执行 |
| PostToolUse | 工具调用后 | `session_id, tool_name, tool_input, tool_response` | `{ continue: true }` |
| Stop | Claude 停止时 | `session_id, transcript_path` | `{ continue: true }` |

## hooks.json 格式

```json
{
  "hooks": {
    "<EventName>": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "shell": "bash",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/my-hook.js",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

## Matcher 语法

| 模式 | 含义 | 示例 |
|------|------|------|
| `"*"` | 匹配所有 | PostToolUse 的所有工具 |
| `"Read"` | 精确匹配 | 只匹配 Read 工具 |
| `"Read\|Write\|Edit"` | 多值匹配 | 匹配三种工具 |
| `"startup\|clear"` | SessionStart 源 | 匹配 startup 或 clear |

## stdin 输入格式

### SessionStart

```json
{
  "session_id": "uuid-string",
  "cwd": "/path/to/project",
  "source": "startup"
}
```

### PostToolUse

```json
{
  "session_id": "uuid-string",
  "cwd": "/path/to/project",
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "/path/to/file.ts",
    "old_string": "...",
    "new_string": "..."
  },
  "tool_response": {
    "success": true
  }
}
```

### Stop

```json
{
  "session_id": "uuid-string",
  "cwd": "/path/to/project",
  "transcript_path": "/path/to/transcript.jsonl"
}
```

## stdout 返回格式

### 基本返回（不注入内容）

```json
{ "continue": true, "suppressOutput": true }
```

### 注入上下文（SessionStart）

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "你要注入的文本内容..."
  }
}
```

## Exit Code 策略

| Code | 含义 | Claude Code 行为 |
|------|------|-----------------|
| 0 | 成功 / 非阻塞错误 | 继续正常运行 |
| 1 | 非阻塞错误 | stderr 展示给用户，继续运行 |
| 2 | 阻塞错误 | stderr 发送给 Claude 处理 |

## 环境变量

| 变量 | 说明 |
|------|------|
| `CLAUDE_PLUGIN_ROOT` | 插件安装目录的绝对路径 |
| `HOME` | 用户 home 目录 |

## 性能要求

- Hook 应在 **100ms 以内** 返回（p95）
- 超时后 Claude Code 会强制终止 Hook 进程
- 耗时操作应委托给后台 Worker

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。
