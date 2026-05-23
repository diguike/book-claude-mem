/**
 * Observation CRUD 路由
 *
 * 所有操作自动按 org_id 隔离，确保租户间数据不互通。
 * 实际生产中会对接 PostgreSQL + pgvector，这里用内存存储演示接口设计。
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

export const observationsRouter = Router();

// 内存存储（演示用，生产环境应使用 PostgreSQL）
interface StoredObservation {
  id: string;
  orgId: string;
  userId: string;
  content: string;
  category: string;
  embedding?: number[]; // pgvector 存储的向量
  createdAt: string;
  updatedAt: string;
}

const store: StoredObservation[] = [];

/**
 * GET /api/observations
 * 列出当前组织的所有 observation（分页）
 */
observationsRouter.get('/', (req: Request, res: Response) => {
  const { orgId } = req.tenant!;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = parseInt(req.query.offset as string) || 0;
  const category = req.query.category as string | undefined;

  let results = store.filter((obs) => obs.orgId === orgId);

  if (category) {
    results = results.filter((obs) => obs.category === category);
  }

  // 按时间倒序
  results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const paged = results.slice(offset, offset + limit);

  res.json({
    data: paged,
    total: results.length,
    limit,
    offset,
  });
});

/**
 * GET /api/observations/:id
 * 获取单条 observation
 */
observationsRouter.get('/:id', (req: Request, res: Response) => {
  const { orgId } = req.tenant!;
  const obs = store.find((o) => o.id === req.params.id && o.orgId === orgId);

  if (!obs) {
    res.status(404).json({ error: 'Observation not found' });
    return;
  }

  res.json(obs);
});

/**
 * POST /api/observations
 * 创建 observation
 */
observationsRouter.post('/', (req: Request, res: Response) => {
  const { orgId, userId } = req.tenant!;
  const { content, category } = req.body;

  if (!content) {
    res.status(400).json({ error: 'content is required' });
    return;
  }

  const now = new Date().toISOString();
  const observation: StoredObservation = {
    id: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    orgId,
    userId,
    content,
    category: category || 'general',
    createdAt: now,
    updatedAt: now,
  };

  store.push(observation);
  res.status(201).json(observation);
});

/**
 * PUT /api/observations/:id
 * 更新 observation
 */
observationsRouter.put('/:id', (req: Request, res: Response) => {
  const { orgId } = req.tenant!;
  const idx = store.findIndex((o) => o.id === req.params.id && o.orgId === orgId);

  if (idx === -1) {
    res.status(404).json({ error: 'Observation not found' });
    return;
  }

  const { content, category } = req.body;
  if (content) store[idx].content = content;
  if (category) store[idx].category = category;
  store[idx].updatedAt = new Date().toISOString();

  res.json(store[idx]);
});

/**
 * DELETE /api/observations/:id
 * 删除 observation
 */
observationsRouter.delete('/:id', (req: Request, res: Response) => {
  const { orgId } = req.tenant!;
  const idx = store.findIndex((o) => o.id === req.params.id && o.orgId === orgId);

  if (idx === -1) {
    res.status(404).json({ error: 'Observation not found' });
    return;
  }

  store.splice(idx, 1);
  res.status(204).send();
});
