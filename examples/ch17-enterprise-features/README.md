# ch17-enterprise-features：脱敏、角色映射、可校验审计

第 17 章配套示例，三个独立脚本，无外部依赖。

| 脚本 | 内容 |
|------|------|
| `npm run demo:redact` | `src/redaction.ts`（只导出函数）+ `src/redaction-demo.ts`：移植 claude-mem v13.35.0 `src/utils/redaction.ts` 的 11 条内置规则与 fail-closed 超长处理，演示内置规则的盲区（JSON 风格的 AWS 密钥、中文个人信息）和自定义规则的写法 |
| `npm run demo:rbac` | `src/rbac.ts`：把企业角色翻译成 claude-mem Server 的 API Key 作用域，按真实的作用域检查语义（逐项命中、只有 `*` 通配）算出每个角色能调哪些接口 |
| `npm run demo:audit` | `src/audit-logger.ts`：在 claude-mem `audit_log` 的字段上加哈希链，演示篡改检测和它的边界 |

```bash
npm install
npm run demo:redact
npm run demo:rbac
npm run demo:audit
npm run typecheck
```

`demo:redact` 里的测试密钥在运行时拼接生成，源码中不出现完整的密钥形态字符串。

`rbac.ts` 和 `audit-logger.ts` 是设计示例：claude-mem 开源版没有用户 / 角色模型，`audit_log` 也没有哈希链，这两项属于 `docs/ip-boundary.md` 列出的商业版保留区域，示例演示的是自建时的一种做法。
