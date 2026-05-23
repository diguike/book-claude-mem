/**
 * JWT 认证中间件
 *
 * 从 Authorization header 解析 JWT token，验证签名后将租户信息注入 req。
 * 所有下游路由通过 req.tenant 获取当前用户和组织信息，实现数据隔离。
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// JWT payload 结构
export interface TenantInfo {
  userId: string;
  orgId: string;
  role: 'admin' | 'member' | 'viewer';
}

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      tenant?: TenantInfo;
    }
  }
}

/**
 * 认证中间件：验证 JWT 并注入租户信息
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as TenantInfo;

    // 验证必要字段
    if (!payload.userId || !payload.orgId) {
      res.status(401).json({ error: 'Invalid token payload: missing userId or orgId' });
      return;
    }

    req.tenant = {
      userId: payload.userId,
      orgId: payload.orgId,
      role: payload.role || 'member',
    };

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired' });
    } else {
      res.status(401).json({ error: 'Invalid token' });
    }
  }
}

/**
 * 辅助函数：生成测试用 JWT token
 */
export function generateTestToken(tenant: TenantInfo): string {
  return jwt.sign(tenant, JWT_SECRET, { expiresIn: '24h' });
}
