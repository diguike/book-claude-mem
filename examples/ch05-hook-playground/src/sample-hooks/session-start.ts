// SessionStart Hook 示例
// 当 Claude Code 会话开始时触发，用于注入项目上下文

export interface SessionStartInput {
  session_id: string;
  cwd: string;
  timestamp: string;
}

export interface HookOutput {
  inject?: string;   // 注入到 system prompt 的内容
  log?: string;      // 日志信息
}

export function handleSessionStart(input: SessionStartInput): HookOutput {
  // 模拟从 corpus 中加载项目摘要
  const projectSummary = `
## Project Context
- Working directory: ${input.cwd}
- Session: ${input.session_id}
- Key observations: 3 items loaded
  - Architecture: Next.js 14 App Router
  - Database: Supabase PostgreSQL
  - Deploy: Vercel + GitHub Actions
`.trim();

  return {
    inject: projectSummary,
    log: `[SessionStart] 已为 session ${input.session_id} 注入项目上下文`,
  };
}
