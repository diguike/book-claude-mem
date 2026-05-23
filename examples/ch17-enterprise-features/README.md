# ch17-enterprise-features — RBAC + 数据脱敏 + 审计日志

本项目演示第 17 章企业级 Memory 平台的三个核心安全能力。

## 运行

```bash
# 安装依赖
npm install

# 运行 RBAC 权限检查示例
npm run demo:rbac

# 运行数据脱敏示例
npm run demo:sanitizer

# 运行审计日志示例
npm run demo:audit
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/rbac.ts` | 基于角色的权限控制，定义权限矩阵并提供检查函数 |
| `src/sanitizer.ts` | 敏感信息自动检测和脱敏（手机号、身份证、邮箱、银行卡等） |
| `src/audit-logger.ts` | 结构化审计日志记录器，支持文件和控制台输出 |

## 设计要点

- RBAC 采用 `role -> permission[]` 映射，支持资源级细粒度控制
- 脱敏器使用正则匹配 + 模式识别，可扩展自定义规则
- 审计日志遵循不可变原则，记录 who/what/when/where

---

更多讨论见 [inferloop.dev](https://inferloop.dev)
