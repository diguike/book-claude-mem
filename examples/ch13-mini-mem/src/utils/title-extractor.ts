/**
 * 从工具调用中提取标题和类型（规则提取，不调 AI）
 * 真实的 claude-mem 用观察者模型做压缩，见第 10 章
 */
export function extractTitle(toolName: string, toolInput: Record<string, unknown>): string {
  switch (toolName) {
    case 'Edit':
    case 'MultiEdit':
      return `编辑 ${shortPath(toolInput.file_path as string)}`;
    case 'Write':
      return `创建 ${shortPath(toolInput.file_path as string)}`;
    case 'Read':
      return `读取 ${shortPath(toolInput.file_path as string)}`;
    case 'Bash':
      return `执行: ${String(toolInput.command || '').slice(0, 40)}`;
    case 'Glob':
      return `搜索文件: ${toolInput.pattern || '*'}`;
    case 'Grep':
      return `搜索内容: ${toolInput.pattern || toolInput.query || ''}`;
    default:
      return `${toolName} 调用`;
  }
}

function shortPath(filePath: string | undefined): string {
  if (!filePath) return 'unknown';
  const parts = filePath.split('/');
  return parts.length > 2 ? `.../${parts.slice(-2).join('/')}` : filePath;
}

/**
 * 根据工具名给出类型。注意 type 和 concept 是两个维度：
 * how-it-works、gotcha 是 concept，不能当 type 用
 */
export function categorize(toolName: string): 'change' | 'discovery' {
  switch (toolName) {
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return 'change';
    default:
      return 'discovery';
  }
}

/** 从 tool_input 中提取关联文件路径 */
export function extractFiles(toolInput: Record<string, unknown>): string[] {
  const filePath = toolInput.file_path || toolInput.notebook_path || toolInput.path;
  return filePath ? [String(filePath)] : [];
}

/** 不值得记录的工具：mini-mem 自己的检索工具（避免递归）和纯簿记类工具 */
export function shouldSkipTool(toolName: string): boolean {
  if (/^mcp__.*mini-mem.*__/.test(toolName)) return true;
  return ['TodoWrite', 'AskUserQuestion', 'ListMcpResourcesTool', 'Skill'].includes(toolName);
}
