---
title: "第 14 章：进阶功能扩展"
feishu_url: "https://fivwvysqdz.feishu.cn/wiki/ALTcwXGZeisixDkyuPccFoVlnUf"
last_synced: "2026-05-05T16:52:35Z"
---

## 添加 AI 压缩（接入 Claude API）

mini-mem 的基础版使用规则提取标题，信息密度有限。接入 Claude API 后可以实现真正的语义压缩。

### 实现思路

```typescript
// src/services/compressor.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // 读取 ANTHROPIC_API_KEY 环境变量

export async function compressObservation(
  toolName: string,
  toolInput: Record<string, unknown>,
  toolResponse: Record<string, unknown>
): Promise<{ type: string; title: string; narrative: string; facts: string[] }> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001', // 用最新的 Haiku 模型降低成本（请替换为当前可用的模型 ID）
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `分析以下工具调用，提取一条结构化观察。

工具: ${toolName}
输入: ${JSON.stringify(toolInput).slice(0, 1000)}
输出: ${JSON.stringify(toolResponse).slice(0, 500)}

以 JSON 格式返回：
{"type": "change|bugfix|discovery|decision|how-it-works", "title": "10字以内的标题", "narrative": "50字以内的叙述", "facts": ["事实1", "事实2"]}`
    }]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return JSON.parse(text);
}
```

### 异步化改造

AI 调用需要 5-15 秒，不能放在 Hook 同步路径中。改造方案：将 save-hook 改为入队模式，单独启动一个 Worker 处理队列。

```typescript
// src/worker/processor.ts
import { ObservationStore } from '../db/store.js';
import { compressObservation } from '../services/compressor.js';

export async function processQueue(): Promise<void> {
  const store = new ObservationStore();
  const pending = store.getPending(10); // 取最多 10 条待处理

  for (const item of pending) {
    try {
      const compressed = await compressObservation(
        item.tool_name,
        JSON.parse(item.tool_input),
        JSON.parse(item.tool_response)
      );

      store.updateObservation(item.id, compressed);
      store.markProcessed(item.id);
    } catch (error) {
      // 失败不阻塞，下次重试
      console.error(`Failed to compress #${item.id}:`, error);
    }
  }

  store.close();
}
```

Worker 用 setInterval 定时拉取队列：

```typescript
// src/worker/index.ts
import { processQueue } from './processor.js';

// 每 5 秒处理一次队列
setInterval(processQueue, 5000);
```

## 实现 Timeline 时间线视图

Timeline 提供某条 Observation 前后的上下文视图：

```typescript
// src/db/store.ts 中添加
getTimeline(anchorId: number, before: number = 3, after: number = 3) {
  const anchor = this.db.prepare('SELECT created_at, project FROM observations WHERE id = ?').get(anchorId) as any;
  if (!anchor) return { before: [], anchor: null, after: [] };

  const beforeRows = this.db.prepare(`
    SELECT id, type, title, created_at FROM observations
    WHERE project = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?
  `).all(anchor.project, anchor.created_at, before);

  const afterRows = this.db.prepare(`
    SELECT id, type, title, created_at FROM observations
    WHERE project = ? AND created_at > ? ORDER BY created_at ASC LIMIT ?
  `).all(anchor.project, anchor.created_at, after);

  return {
    before: beforeRows.reverse(),
    anchor: this.db.prepare('SELECT id, type, title, narrative, created_at FROM observations WHERE id = ?').get(anchorId),
    after: afterRows
  };
}
```

在 MCP Server 中注册 timeline 工具：

```typescript
{
  name: 'timeline',
  description: 'Get observations before/after a specific observation.',
  inputSchema: {
    type: 'object',
    properties: {
      anchor: { type: 'number', description: 'Observation ID' },
      before: { type: 'number', description: 'Count before (default 3)' },
      after: { type: 'number', description: 'Count after (default 3)' }
    },
    required: ['anchor']
  }
}
```

## 向量搜索集成

用 ChromaDB 或 Qdrant 实现语义搜索。以下示例使用 ChromaDB 的 Node.js 客户端：

```typescript
// src/services/vector-store.ts
import { ChromaClient, Collection } from 'chromadb';

let collection: Collection | null = null;

async function getCollection(): Promise<Collection> {
  if (collection) return collection;
  const client = new ChromaClient({ path: 'http://localhost:8000' });
  collection = await client.getOrCreateCollection({ name: 'mini-mem-observations' });
  return collection;
}

export async function addObservation(id: number, text: string, metadata: Record<string, string>): Promise<void> {
  const coll = await getCollection();
  await coll.add({
    ids: [`obs_${id}`],
    documents: [text],
    metadatas: [metadata]
  });
}

export async function semanticSearch(query: string, limit: number = 10): Promise<Array<{ id: number; score: number }>> {
  const coll = await getCollection();
  const results = await coll.query({
    queryTexts: [query],
    nResults: limit
  });

  return (results.ids[0] || []).map((id, i) => ({
    id: parseInt(id.replace('obs_', '')),
    score: results.distances?.[0]?.[i] || 0
  }));
}
```

ChromaDB 需要单独启动服务：

```bash
# 使用 Docker
docker run -p 8000:8000 chromadb/chroma

# 或用 pip
pip install chromadb
chroma run --path ./chroma-data
```

## Viewer UI：React 实时展示面板

添加一个简单的 Web UI 展示 Observation 流：

```typescript
// src/viewer/server.ts
import express from 'express';
import { ObservationStore } from '../db/store.js';

const app = express();

// SSE 端点：实时推送新 Observation
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 每 2 秒检查新数据
  let lastId = 0;
  const interval = setInterval(() => {
    const store = new ObservationStore();
    const newObs = store.getAfter(lastId, 10);
    store.close();
    for (const obs of newObs) {
      res.write(`data: ${JSON.stringify(obs)}\n\n`);
      lastId = Math.max(lastId, obs.id);
    }
  }, 2000);

  req.on('close', () => clearInterval(interval));
});

// API 端点
app.get('/api/observations', (req, res) => {
  const store = new ObservationStore();
  const observations = store.getRecentByProject(req.query.project as string || '', 50);
  store.close();
  res.json(observations);
});

app.listen(37800, () => console.log('Viewer UI: http://localhost:37800'));
```

前端用一个简单的 React 组件消费 SSE：

```tsx
// src/viewer/App.tsx
function ObservationFeed() {
  const [observations, setObservations] = useState<Observation[]>([]);

  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onmessage = (event) => {
      const obs = JSON.parse(event.data);
      setObservations(prev => [obs, ...prev].slice(0, 100));
    };
    return () => es.close();
  }, []);

  return (
    <div className="feed">
      {observations.map(obs => (
        <div key={obs.id} className="observation-card">
          <span className="type">{obs.type}</span>
          <h3>{obs.title}</h3>
          <p>{obs.narrative}</p>
        </div>
      ))}
    </div>
  );
}
```

## 多项目隔离与切换

支持同时追踪多个项目的记忆，在 Context Injection 时只注入当前项目相关的内容：

```typescript
// context-hook.ts 中的项目识别
function getProjectName(cwd: string): string {
  // 策略 1：如果有 package.json，用其 name 字段
  const pkgPath = path.join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    if (pkg.name) return pkg.name;
  }

  // 策略 2：用 git 仓库根目录名
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', { cwd }).toString().trim();
    return path.basename(gitRoot);
  } catch {}

  // 策略 3：用当前目录名
  return path.basename(cwd);
}
```

查询时自动按项目过滤：

```sql
SELECT * FROM observations WHERE project = ? ORDER BY created_at DESC LIMIT ?
```

---

**思考题**

1. AI 压缩每条 Observation 的成本约 $0.001（基于 Claude Haiku）。如果一天产生 200 条 Observation，一年的压缩成本是多少？如何在质量和成本之间取舍（比如只压缩超过一定长度的 Observation）？
2. 向量搜索和 FTS5 全文搜索各有优劣。设计一个混合排序策略：什么情况下优先用向量搜索，什么情况下优先用 FTS5？
3. 多项目支持中，项目识别依赖 package.json name 和 git 仓库名。如果用户在 monorepo 中工作（多个子项目共享一个 git root），如何正确识别当前子项目？

---

> 本书开源发布于 [inferloop.dev](https://inferloop.dev)，转载请注明出处。

至此，mini-mem 从基础的同步版本扩展到了具备 AI 压缩、向量搜索、实时 UI 和多项目支持的完整系统。下一部分将讨论如何将这类系统从个人工具升级到企业级平台。

---

> 本章来自《Agent Memory 工程实战》开源版 · 作者「递归客」  
> 在线阅读完整书系：[inferloop.dev](https://inferloop.dev)  
> 源码仓库：[github.com/diguike/book-claude-mem](https://github.com/diguike/book-claude-mem)
