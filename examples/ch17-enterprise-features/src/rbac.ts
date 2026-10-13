/**
 * 把“角色”落到 claude-mem Server 的 API Key 上（设计示例）
 *
 * claude-mem 开源版的鉴权只看 API Key：每个 Key 绑定 team_id、可选的 project_id 和一组作用域。
 * schema 里有 team_members(user_id, role)，角色取 owner / admin / member / viewer（src/storage/postgres/teams.ts），
 * 但没有任何路由读它。这里演示一种接线方式：签发 Key 时把成员角色翻译成作用域和范围。
 * 作用域检查语义与 claude-mem 一致：要求的每一项都必须被授予，只有 '*' 是通配。
 * 运行：npm run demo:rbac
 */

type Scope = 'memories:read' | 'memories:write' | 'memories:admin' | '*';
type Role = 'viewer' | 'member' | 'admin' | 'owner'; // 与 PostgresTeamRole 一致

interface KeySpec { scopes: Scope[]; projectScoped: boolean; ttlDays: number | null }

// 角色 → 签发 Key 时用的作用域、范围和有效期
const ROLE_TO_KEY: Record<Role, KeySpec> = {
  viewer: { scopes: ['memories:read'], projectScoped: true, ttlDays: 30 },
  member: { scopes: ['memories:read', 'memories:write'], projectScoped: true, ttlDays: 90 },
  admin: { scopes: ['memories:read', 'memories:write'], projectScoped: false, ttlDays: 90 },
  owner: { scopes: ['memories:read', 'memories:write', 'memories:admin'], projectScoped: false, ttlDays: 7 },
};

// claude-mem 各接口要求的作用域（ServerV1PostgresRoutes.ts）
const ROUTES: Array<{ route: string; required: Scope[]; needsTeamWide?: boolean }> = [
  { route: 'POST /v1/search', required: ['memories:read'] },
  { route: 'POST /v1/events', required: ['memories:write'] },
  { route: 'DELETE /v1/memories/:id', required: ['memories:write'] },
  { route: 'DELETE /v1/projects/:id/memory', required: ['memories:write'] },
  { route: 'GET /v1/jobs?include=payload', required: ['memories:read', 'memories:admin'] },
  { route: 'GET /v1/jobs 看到全团队', required: ['memories:read'], needsTeamWide: true }, // 项目级 Key 只看到自己项目的任务
];

function hasRequiredScopes(granted: Scope[], required: Scope[]): boolean {
  if (required.length === 0 || granted.includes('*')) return true;
  return required.every(s => granted.includes(s));
}

const roles = Object.keys(ROLE_TO_KEY) as Role[];
console.log(`${'接口'.padEnd(36)}${roles.map(r => r.padEnd(8)).join('')}`);
for (const { route, required, needsTeamWide } of ROUTES) {
  const cells = roles.map(role => {
    const spec = ROLE_TO_KEY[role];
    const ok = hasRequiredScopes(spec.scopes, required) && !(needsTeamWide && spec.projectScoped);
    return (ok ? 'Y' : '-').padEnd(8);
  });
  console.log(`${route.padEnd(36)}${cells.join('')}`);
}

console.log('\n观察：');
console.log('  1. member 能调 DELETE /v1/projects/:id/memory —— 删除和写入共用 memories:write，开源版区分不了。');
console.log('  2. memories:admin 不隐含读写，owner 角色要同时授予三个作用域。');
console.log('  3. 需要“能写但不能清空项目”的角色，只能在网关层按路由再拦一道，或者给 claude-mem 加一个 memories:delete 作用域。');
