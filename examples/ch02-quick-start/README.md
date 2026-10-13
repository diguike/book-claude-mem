# ch02-quick-start

claude-mem（v13.35.0）安装验证与配置示例。

## 运行

```bash
npm install
npm run demo    # 验证安装：数据目录、settings.json、claude-mem.db、Worker 的 /api/health
npm run config  # 输出几份常用配置
```

端口算法与 claude-mem 一致：`CLAUDE_MEM_WORKER_PORT` 环境变量或 settings.json 里的同名键，否则 `37700 + uid % 100`。

| 文件 | 说明 |
|------|------|
| `src/verify-install.ts` | 安装检查 |
| `src/config-templates.ts` | 配置示例（扁平的 `CLAUDE_MEM_*` 字符串键） |

更多讨论见 [inferloop.dev](https://inferloop.dev)
