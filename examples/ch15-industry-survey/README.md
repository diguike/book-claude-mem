# ch15-industry-survey — 行业方案 API 调用对比

本项目演示第 15 章中各 Memory 方案的核心 API 用法和特性对比。

## 运行

```bash
# 安装依赖
npm install

# 复制环境变量并填入真实值
cp .env.example .env

# 运行 Mem0 调用示例
npm run demo:mem0

# 输出特性对比表
npm run demo:compare
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/mem0-example.ts` | Mem0 HTTP API 的 TypeScript 调用示例，包含 add/search/get 操作 |
| `src/comparison-table.ts` | 终端格式化输出各方案（Mem0、Zep、LangMem 等）的特性对比表 |

## 前置要求

- Node.js >= 18
- Mem0 示例需要有效的 `MEM0_API_KEY`（从 https://app.mem0.ai 获取）

---

更多讨论见 [inferloop.dev](https://inferloop.dev)
