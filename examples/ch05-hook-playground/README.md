# ch05-hook-playground

Hook 模拟器：模拟 Claude Code 的 Hook 调用流程，支持计时和多 Hook 类型。

## 运行

```bash
npm install
npm run demo
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/hook-simulator.ts` | Hook 调用流程模拟器，支持计时 |
| `src/sample-hooks/session-start.ts` | SessionStart hook 示例 |
| `src/sample-hooks/post-tool-use.ts` | PostToolUse hook 示例 |

更多讨论见 [inferloop.dev](https://inferloop.dev)
