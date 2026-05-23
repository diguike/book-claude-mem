// Express + SQLite 队列 Demo
// 模拟 claude-mem Worker 的异步任务处理

import express from 'express';
import { TaskQueue } from './queue.js';

const PORT = 7780;
const POLL_INTERVAL_MS = 3000; // 每 3 秒处理一批队列

const app = express();
app.use(express.json());

const queue = new TaskQueue();

// POST /enqueue - 提交任务
app.post('/enqueue', (req, res) => {
  const { task, payload } = req.body;
  if (!task || !payload) {
    res.status(400).json({ error: 'Missing task or payload' });
    return;
  }

  const queuedTask = queue.enqueue(task, JSON.stringify(payload));
  console.log(`[Enqueue] 任务 #${queuedTask.id} (${task}) 已入队`);
  res.json({ ok: true, task_id: queuedTask.id });
});

// GET /stats - 队列统计
app.get('/stats', (_req, res) => {
  res.json(queue.stats());
});

// 模拟任务处理器
function processTask(taskType: string, payload: string): boolean {
  // 模拟不同任务类型的处理
  switch (taskType) {
    case 'compress':
      console.log(`    处理压缩任务: ${payload}`);
      return true;
    case 'index':
      console.log(`    处理索引任务: ${payload}`);
      return true;
    case 'notify':
      console.log(`    处理通知任务: ${payload}`);
      // 模拟偶尔失败
      return Math.random() > 0.3;
    default:
      console.log(`    未知任务类型: ${taskType}`);
      return false;
  }
}

// 定时轮询处理队列
function pollQueue() {
  const tasks = queue.dequeue(3);
  if (tasks.length === 0) return;

  console.log(`[Poll] 取出 ${tasks.length} 个任务处理中...`);
  for (const task of tasks) {
    try {
      const success = processTask(task.task_type, task.payload);
      if (success) {
        queue.markDone(task.id);
        console.log(`    [Done] 任务 #${task.id} 完成`);
      } else {
        queue.markFailed(task.id, 'Processing returned false');
        console.log(`    [Fail] 任务 #${task.id} 失败`);
      }
    } catch (err) {
      queue.markFailed(task.id, err instanceof Error ? err.message : 'Unknown error');
      console.log(`    [Error] 任务 #${task.id} 异常: ${err}`);
    }
  }

  const stats = queue.stats();
  console.log(`[Stats] pending=${stats.pending} processing=${stats.processing} done=${stats.done} failed=${stats.failed}`);
}

// 启动服务
const server = app.listen(PORT, () => {
  console.log(`=== Worker Queue Demo ===`);
  console.log(`服务启动: http://localhost:${PORT}`);
  console.log(`API: POST /enqueue { task, payload }`);
  console.log(`API: GET /stats`);
  console.log(`轮询间隔: ${POLL_INTERVAL_MS}ms\n`);

  // 预填充一些测试任务
  queue.enqueue('compress', JSON.stringify({ obs_id: 'obs-001' }));
  queue.enqueue('index', JSON.stringify({ corpus: 'default' }));
  queue.enqueue('notify', JSON.stringify({ event: 'corpus_updated' }));
  console.log('[Init] 已预填充 3 个测试任务\n');
});

const timer = setInterval(pollQueue, POLL_INTERVAL_MS);

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n[Shutdown] 清理中...');
  clearInterval(timer);
  server.close();
  queue.close();
  process.exit(0);
});
