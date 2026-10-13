# ch14-extensions

mini-mem 的三个扩展演示：AI 压缩、向量检索、实时 Viewer。异步处理（spool + Worker）的演示在 `../ch06-worker-queue/`。

## 运行

```bash
# onnxruntime-node 在 Linux x64 上默认会下载 CUDA 运行库，CPU 版已包含在 npm 包里，可以跳过
ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm install

# 1. AI 压缩：需要 Anthropic API 凭据（ANTHROPIC_API_KEY 或 `ant auth login`）
npm run demo:compress
ANTHROPIC_MODEL=claude-haiku-5-5 npm run demo:compress   # 换成更便宜的模型

# 2. 向量检索：先启动 Chroma
uvx --from chromadb chroma run --path ./chroma-data --port 8000
CHROMA_URL=http://localhost:8000 npm run demo:search
# 第一次运行会从 HuggingFace 下载 embedding 模型；需要走代理时加 NODE_USE_ENV_PROXY=1

# 3. 实时 Viewer
npm run demo:viewer   # 浏览器打开 http://localhost:3000
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/ai-compressor.ts` | 用 Claude 把一批 observation 压缩成摘要 |
| `src/vector-search.ts` | Chroma 写入、语义检索、按 metadata 过滤 |
| `src/viewer-server.ts` | Express + SSE 实时推送 |

更多讨论见 [inferloop.dev](https://inferloop.dev)
