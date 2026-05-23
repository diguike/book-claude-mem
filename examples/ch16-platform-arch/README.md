# ch16-platform-arch — 多租户 Memory API 骨架

本项目演示第 16 章的多租户 Memory 平台架构设计，包含 JWT 认证、组织隔离、PostgreSQL + pgvector 数据模型。

## 运行

```bash
# 安装依赖
npm install

# 复制环境变量并填入真实值
cp .env.example .env

# 启动 API 服务
npm run demo

# 开发模式（热重载）
npm run dev
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/server.ts` | Express 服务入口，挂载中间件和路由 |
| `src/middleware/auth.ts` | JWT 认证中间件，解析 token 并注入租户信息 |
| `src/routes/observations.ts` | Observation CRUD 路由，自动按 org_id 隔离 |
| `src/db/schema.sql` | PostgreSQL + pgvector 建表语句 |

## API 示例

```bash
# 获取 token（演示用，实际应通过 OAuth 流程）
TOKEN="eyJhbGciOiJIUzI1NiJ9..."

# 创建 observation
curl -X POST http://localhost:3001/api/observations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"用户偏好 TypeScript","category":"preference"}'

# 查询 observations
curl http://localhost:3001/api/observations \
  -H "Authorization: Bearer $TOKEN"
```

## 前置要求

- Node.js >= 18
- PostgreSQL 15+ with pgvector 扩展（建表语句见 `src/db/schema.sql`）

---

更多讨论见 [inferloop.dev](https://inferloop.dev)
