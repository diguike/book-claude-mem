/**
 * Viewer Server：Express SSE 服务 + 简单 HTML 页面
 *
 * 提供实时的 observation 流展示，用于调试和可视化 memory 系统的运行状态。
 * 包含：
 * - SSE endpoint：推送新 observation 事件
 * - HTML 页面：实时渲染 observation 列表
 * - REST API：查询和写入 observation
 */

import express from 'express';
import type { Request, Response } from 'express';

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3000', 10);

// 内存中的 observation 存储（演示用）
interface Observation {
  id: string;
  content: string;
  category: string;
  timestamp: string;
}

const observations: Observation[] = [];
const sseClients: Set<Response> = new Set();

// --- SSE Endpoint ---

app.get('/api/stream', (req: Request, res: Response) => {
  // 设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // 发送已有 observation 作为初始数据
  res.write(
    `data: ${JSON.stringify({ type: 'init', observations })}\n\n`
  );

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

/**
 * 向所有 SSE 客户端广播新 observation
 */
function broadcast(observation: Observation) {
  const payload = `data: ${JSON.stringify({ type: 'new', observation })}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

// --- REST API ---

app.get('/api/observations', (_req: Request, res: Response) => {
  res.json(observations);
});

app.post('/api/observations', (req: Request, res: Response) => {
  const { content, category } = req.body;
  const observation: Observation = {
    id: `obs-${Date.now()}`,
    content,
    category: category || 'general',
    timestamp: new Date().toISOString(),
  };
  observations.push(observation);
  broadcast(observation);
  res.status(201).json(observation);
});

// --- HTML Viewer ---

const HTML_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Observation Viewer</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #1a1a2e; color: #e0e0e0; }
    h1 { color: #64ffda; }
    .observation { background: #16213e; border-left: 3px solid #64ffda; padding: 12px 16px; margin: 8px 0; border-radius: 4px; }
    .observation .meta { font-size: 12px; color: #888; margin-bottom: 4px; }
    .observation .content { font-size: 14px; }
    .category { background: #0f3460; padding: 2px 8px; border-radius: 12px; font-size: 11px; }
    #status { font-size: 12px; color: #64ffda; margin-bottom: 16px; }
    .empty { color: #666; font-style: italic; }
  </style>
</head>
<body>
  <h1>Observation Viewer</h1>
  <div id="status">Connecting...</div>
  <div id="observations"><p class="empty">No observations yet.</p></div>

  <script>
    const container = document.getElementById('observations');
    const status = document.getElementById('status');
    let count = 0;

    function renderObservation(obs) {
      const div = document.createElement('div');
      div.className = 'observation';
      div.innerHTML = \`
        <div class="meta">
          <span class="category">\${obs.category}</span>
          \${new Date(obs.timestamp).toLocaleString()}
        </div>
        <div class="content">\${obs.content}</div>
      \`;
      return div;
    }

    const es = new EventSource('/api/stream');

    es.onopen = () => {
      status.textContent = 'Connected - listening for observations...';
    };

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'init') {
        if (data.observations.length > 0) {
          container.innerHTML = '';
          data.observations.forEach(obs => {
            container.appendChild(renderObservation(obs));
            count++;
          });
        }
      } else if (data.type === 'new') {
        if (count === 0) container.innerHTML = '';
        container.prepend(renderObservation(data.observation));
        count++;
      }

      status.textContent = \`Connected - \${count} observation(s) loaded\`;
    };

    es.onerror = () => {
      status.textContent = 'Disconnected - retrying...';
    };
  </script>
</body>
</html>`;

app.get('/', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(HTML_PAGE);
});

// --- 启动服务 ---

app.listen(PORT, () => {
  console.log(`Observation Viewer 已启动: http://localhost:${PORT}`);
  console.log(`SSE 端点: http://localhost:${PORT}/api/stream`);
  console.log(`\n测试写入 observation:`);
  console.log(
    `  curl -X POST http://localhost:${PORT}/api/observations -H "Content-Type: application/json" -d '{"content":"用户喜欢 TypeScript","category":"preference"}'`
  );
});
