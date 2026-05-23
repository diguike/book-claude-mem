/**
 * 从 Tool Usage 中提取标题（规则提取，不调 AI）
 * 这是 mini-mem 的简化版——真实的 claude-mem 使用 Claude Agent SDK 做 AI 压缩
 */
export function extractTitle(toolName: string, toolInput: Record<string, unknown>): string {
  switch (toolName) {
    case 'Edit': {
      const file = shortPath(toolInput.file_path as string);
      return `编辑 ${file}`;
    }
    case 'Write': {
      const file = shortPath(toolInput.file_path as string);
      return `创建 ${file}`;
    }
    case 'Read': {
      const file = shortPath(toolInput.file_path as string);
      return `读取 ${file}`;
    }
    case 'Bash': {
      const cmd = String(toolInput.command || '').slice(0, 40);
      return `执行: ${cmd}`;
    }
    case 'Glob': {
      return `搜索文件: ${toolInput.pattern || '*'}`;
    }
    case 'Grep': {
      return `搜索内容: ${toolInput.pattern || toolInput.query || ''}`;
    }
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
 * 根据工具名分类 Observation 类型
 */
export function categorize(toolName: string): string {
  switch (toolName) {
    case 'Edit': case 'Write': return 'change';
    case 'Read': case 'Glob': case 'Grep': return 'how-it-works';
    case 'Bash': return 'discovery';
    default: return 'how-it-works';
  }
}

/**
 * 从 tool_input 中提取关联文件路径
 */
export function extractFiles(toolInput: Record<string, unknown>): string[] {
  const filePath = toolInput.file_path || toolInput.path;
  return filePath ? [String(filePath)] : [];
}
