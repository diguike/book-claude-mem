# ch05-hook-playground

一个极简“宿主”，按 Claude Code 的规则拉起真正的 Hook 子进程（第 5 章）：

- 按事件名和 matcher 找到 Hook，stdin 传 JSON，stdout 读 JSON
- 同步 Hook 等待并解析输出；`async: true` 的 Hook 宿主不等待
- 退出码 2 视为阻断；`permissionDecision: "deny"` 拒绝这次工具调用

## 运行

```bash
npm install
npm run demo
```

演示内容：SessionStart 在 resume 时不注入、PreToolUse 拒绝大文件的整文件读取但放行局部读取、PostToolUse 和 PostToolUseFailure 以 async 方式落盘，以及同一个内部 bug 在“退出码 2”和“退出码 0 + no-op”两种策略下的不同后果。

| 文件 | 说明 |
|------|------|
| `src/host.ts` | 极简宿主：matcher 匹配、进程管理、输出解析 |
| `src/demo.ts` | 一次会话的事件序列 |
| `hooks/*.mjs` | 示例 Hook 脚本 |

更多讨论见 [inferloop.dev](https://inferloop.dev)
