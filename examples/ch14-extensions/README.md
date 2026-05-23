# ch14-extensions — AI 压缩 + 向量搜索 + Viewer UI

本项目演示第 14 章扩展模块的三个核心能力：

1. 使用 Anthropic SDK 对 observation 进行 AI 压缩
2. 使用 ChromaDB 实现语义向量搜索
3. Express SSE 服务 + HTML 页面实时展示 observation 流

## 运行

```bash
# 安装依赖
npm install

# 复制环境变量并填入真实值
cp .env.example .env

# 运行 AI 压缩示例
npm run demo:compress

# 运行向量搜索示例（需要本地 ChromaDB 服务）
npm run demo:search

# 启动 Viewer 服务
npm run demo:viewer
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/ai-compressor.ts` | 调用 Anthropic Claude API 对冗长 observation 进行摘要压缩 |
| `src/vector-search.ts` | 基于 ChromaDB 的语义搜索，支持相似度查询 |
| `src/viewer-server.ts` | Express SSE 服务器，提供实时 observation 流和简单 HTML UI |

## 前置要求

- Node.js >= 18
- 有效的 `ANTHROPIC_API_KEY`
- 向量搜索示例需要本地运行 ChromaDB（`docker run -p 8000:8000 chromadb/chroma`）

---

更多讨论见 [inferloop.dev](https://inferloop.dev)
