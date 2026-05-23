// PostToolUse Hook 示例
// 当 Claude Code 使用完一个工具后触发，用于提取 observation

export interface PostToolUseInput {
  session_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_output: string;
  timestamp: string;
}

export interface HookOutput {
  observation?: {
    content: string;
    category: string;
    confidence: number;
  };
  log?: string;
}

// 判断工具输出是否包含有价值的项目信息
function isValuable(toolName: string, output: string): boolean {
  // Read 工具读取配置文件时通常包含有价值的信息
  if (toolName === 'Read' && output.length > 100) return true;
  // Bash 工具运行命令如果输出包含版本/配置信息
  if (toolName === 'Bash' && /version|config|error/i.test(output)) return true;
  // Grep 搜索结果通常有上下文价值
  if (toolName === 'Grep' && output.includes('match')) return true;
  return false;
}

// 从工具输出中提取摘要
function extractSummary(toolName: string, input: Record<string, unknown>, output: string): string {
  const maxLen = 200;
  const truncated = output.length > maxLen ? output.slice(0, maxLen) + '...' : output;

  if (toolName === 'Read') {
    return `读取文件 ${input.file_path}: ${truncated}`;
  }
  if (toolName === 'Bash') {
    return `执行命令 ${input.command}: ${truncated}`;
  }
  if (toolName === 'Grep') {
    return `搜索 "${input.pattern}" in ${input.path}: ${truncated}`;
  }
  return `${toolName}: ${truncated}`;
}

export function handlePostToolUse(input: PostToolUseInput): HookOutput {
  if (!isValuable(input.tool_name, input.tool_output)) {
    return {
      log: `[PostToolUse] ${input.tool_name} 输出无显著价值，跳过`,
    };
  }

  const summary = extractSummary(input.tool_name, input.tool_input, input.tool_output);

  return {
    observation: {
      content: summary,
      category: 'tool_usage',
      confidence: 0.7,
    },
    log: `[PostToolUse] 提取 observation: "${summary.slice(0, 60)}..."`,
  };
}
