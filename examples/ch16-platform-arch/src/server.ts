/**
 * 多租户 Memory API 服务入口
 *
 * 架构要点：
 * - JWT 认证，token 中携带 orgId 实现租户隔离
 * - RESTful API 设计
 * - 启动时输出测试 token 方便调试
 */

import express from 'express';
import { authMiddleware, generateTestToken } from './middleware/auth.js';
import { observationsRouter } from './routes/observations.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// 全局中间件
app.use(express.json());

// 健康检查（无需认证）
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 认证保护的路由
app.use('/api/observations', authMiddleware, observationsRouter);

// 启动服务
app.listen(PORT, () => {
  console.log(`Memory Platform API 已启动: http://localhost:${PORT}`);
  console.log(`健康检查: http://localhost:${PORT}/health\n`);

  // 生成测试 token
  const testToken = generateTestToken({
    userId: 'user-001',
    orgId: 'org-001',
    role: 'admin',
  });

  console.log('=== 测试 Token (org-001, admin) ===');
  console.log(testToken);
  console.log('\n=== 测试命令 ===');
  console.log(
    `curl -X POST http://localhost:${PORT}/api/observations \\
  -H "Authorization: Bearer ${testToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"content":"用户喜欢 TypeScript","category":"preference"}'`
  );
  console.log(
    `\ncurl http://localhost:${PORT}/api/observations \\
  -H "Authorization: Bearer ${testToken}"`
  );
});
