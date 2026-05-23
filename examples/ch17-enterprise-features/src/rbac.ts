/**
 * RBAC — 基于角色的访问控制
 *
 * 定义角色权限矩阵，提供权限检查函数。
 * 适用于多租户 Memory 平台中不同角色对 observation 的访问控制。
 */

// 可执行的操作
type Action = 'create' | 'read' | 'update' | 'delete' | 'search' | 'export';

// 资源类型
type Resource = 'observation' | 'user' | 'organization' | 'audit_log';

// 角色定义
type Role = 'owner' | 'admin' | 'member' | 'viewer' | 'api_key';

// 权限条目
interface Permission {
  resource: Resource;
  actions: Action[];
}

// 角色 -> 权限映射表
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    { resource: 'observation', actions: ['create', 'read', 'update', 'delete', 'search', 'export'] },
    { resource: 'user', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'organization', actions: ['read', 'update', 'delete'] },
    { resource: 'audit_log', actions: ['read', 'export'] },
  ],
  admin: [
    { resource: 'observation', actions: ['create', 'read', 'update', 'delete', 'search', 'export'] },
    { resource: 'user', actions: ['create', 'read', 'update'] },
    { resource: 'organization', actions: ['read', 'update'] },
    { resource: 'audit_log', actions: ['read'] },
  ],
  member: [
    { resource: 'observation', actions: ['create', 'read', 'update', 'search'] },
    { resource: 'user', actions: ['read'] },
    { resource: 'organization', actions: ['read'] },
  ],
  viewer: [
    { resource: 'observation', actions: ['read', 'search'] },
    { resource: 'user', actions: ['read'] },
    { resource: 'organization', actions: ['read'] },
  ],
  api_key: [
    { resource: 'observation', actions: ['create', 'read', 'search'] },
  ],
};

/**
 * 检查指定角色是否有权限执行某操作
 */
function checkPermission(role: Role, resource: Resource, action: Action): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;

  const resourcePerm = permissions.find((p) => p.resource === resource);
  if (!resourcePerm) return false;

  return resourcePerm.actions.includes(action);
}

/**
 * 批量检查权限，返回所有不通过的项
 */
function checkPermissions(
  role: Role,
  checks: Array<{ resource: Resource; action: Action }>
): Array<{ resource: Resource; action: Action; allowed: boolean }> {
  return checks.map((check) => ({
    ...check,
    allowed: checkPermission(role, check.resource, check.action),
  }));
}

/**
 * 获取角色的所有权限列表（用于前端展示）
 */
function getRolePermissions(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

// --- Demo 运行 ---

function main() {
  console.log('=== RBAC 权限检查示例 ===\n');

  const testCases: Array<{ role: Role; resource: Resource; action: Action }> = [
    { role: 'admin', resource: 'observation', action: 'delete' },
    { role: 'member', resource: 'observation', action: 'delete' },
    { role: 'viewer', resource: 'observation', action: 'read' },
    { role: 'viewer', resource: 'observation', action: 'create' },
    { role: 'api_key', resource: 'observation', action: 'search' },
    { role: 'api_key', resource: 'user', action: 'read' },
    { role: 'member', resource: 'audit_log', action: 'read' },
    { role: 'owner', resource: 'audit_log', action: 'export' },
  ];

  for (const tc of testCases) {
    const allowed = checkPermission(tc.role, tc.resource, tc.action);
    const icon = allowed ? '[ALLOW]' : '[DENY] ';
    console.log(`  ${icon} ${tc.role.padEnd(8)} | ${tc.resource.padEnd(14)} | ${tc.action}`);
  }

  console.log('\n=== viewer 角色权限列表 ===');
  const viewerPerms = getRolePermissions('viewer');
  for (const perm of viewerPerms) {
    console.log(`  ${perm.resource}: ${perm.actions.join(', ')}`);
  }

  console.log('\n=== 批量检查 (member) ===');
  const batchResults = checkPermissions('member', [
    { resource: 'observation', action: 'create' },
    { resource: 'observation', action: 'export' },
    { resource: 'user', action: 'delete' },
  ]);
  for (const r of batchResults) {
    console.log(`  ${r.allowed ? '[ALLOW]' : '[DENY] '} ${r.resource}.${r.action}`);
  }
}

main();

export { checkPermission, checkPermissions, getRolePermissions };
export type { Role, Resource, Action, Permission };
