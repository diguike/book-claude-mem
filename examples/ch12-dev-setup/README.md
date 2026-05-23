---
title: "ch12 示例：开发环境验证"
---

# ch12：开发环境验证脚本

快速验证 claude-mem 开发环境是否配置正确。

## 运行

```bash
npm install

# 完整环境检查
npm run check

# 只检查 SQLite + FTS5
npm run check:sqlite

# 检查 Claude Code Plugin 目录
npm run check:plugin
```

## 检查项目

- Node.js 版本（要求 20+）
- Bun 是否已安装（可选，Worker 使用）
- better-sqlite3 是否可以正常 require
- SQLite FTS5 扩展是否可用
- WAL 模式是否可以启用
- Claude Code Plugin 目录是否存在
- ANTHROPIC_API_KEY 环境变量是否设置
