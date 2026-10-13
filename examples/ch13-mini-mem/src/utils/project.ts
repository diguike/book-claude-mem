/**
 * 项目名：取工作目录的最后一级。
 * claude-mem 的真实规则更复杂（git 根目录、worktree、子模块、环境映射），见第 2、14 章
 */
import path from 'path';

export function projectNameOf(cwd: string | undefined): string {
  if (!cwd) return 'unknown';
  return path.basename(path.resolve(cwd)) || 'unknown';
}
