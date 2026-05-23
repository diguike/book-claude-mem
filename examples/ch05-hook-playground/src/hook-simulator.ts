// Hook 模拟器：模拟 Claude Code 的 Hook 调用流程
// 演示 Hook 的生命周期、计时、错误处理

import { handleSessionStart, type SessionStartInput } from './sample-hooks/session-start.js';
import { handlePostToolUse, type PostToolUseInput } from './sample-hooks/post-tool-use.js';

type HookType = 'SessionStart' | 'PostToolUse' | 'PreToolUse' | 'Stop';

interface HookConfig {
  type: HookType;
  timeout_ms: number;
  enabled: boolean;
}

interface HookExecution {
  type: HookType;
  duration_ms: number;
  success: boolean;
  result: unknown;
  error?: string;
}

// 模拟 Hook 执行（带超时控制）
async function executeHook(
  config: HookConfig,
  payload: unknown
): Promise<HookExecution> {
  const start = performance.now();

  if (!config.enabled) {
    return {
      type: config.type,
      duration_ms: 0,
      success: false,
      result: null,
      error: 'Hook disabled',
    };
  }

  try {
    let result: unknown;

    // 模拟异步执行（实际场景中 Hook 是独立进程）
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 50));

    switch (config.type) {
      case 'SessionStart':
        result = handleSessionStart(payload as SessionStartInput);
        break;
      case 'PostToolUse':
        result = handlePostToolUse(payload as PostToolUseInput);
        break;
      default:
        result = { log: `[${config.type}] No handler registered` };
    }

    const duration = performance.now() - start;

    // 超时检查
    if (duration > config.timeout_ms) {
      return {
        type: config.type,
        duration_ms: duration,
        success: false,
        result: null,
        error: `Timeout: ${duration.toFixed(1)}ms > ${config.timeout_ms}ms`,
      };
    }

    return {
      type: config.type,
      duration_ms: duration,
      success: true,
      result,
    };
  } catch (err) {
    return {
      type: config.type,
      duration_ms: performance.now() - start,
      success: false,
      result: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// 模拟完整的会话生命周期
async function simulateSession() {
  console.log('=== Hook 模拟器 ===\n');

  const hookConfigs: HookConfig[] = [
    { type: 'SessionStart', timeout_ms: 500, enabled: true },
    { type: 'PostToolUse', timeout_ms: 200, enabled: true },
    { type: 'PreToolUse', timeout_ms: 200, enabled: false },
    { type: 'Stop', timeout_ms: 1000, enabled: true },
  ];

  console.log('已注册 Hook:');
  for (const config of hookConfigs) {
    const status = config.enabled ? 'ON' : 'OFF';
    console.log(`  [${status}] ${config.type} (timeout: ${config.timeout_ms}ms)`);
  }
  console.log('');

  const executions: HookExecution[] = [];

  // 1. 触发 SessionStart
  console.log('--- 模拟会话开始 ---');
  const sessionPayload: SessionStartInput = {
    session_id: 'sim-001',
    cwd: '/home/user/my-project',
    timestamp: new Date().toISOString(),
  };
  const startExec = await executeHook(hookConfigs[0], sessionPayload);
  executions.push(startExec);
  console.log(`  结果: ${startExec.success ? 'OK' : 'FAIL'} (${startExec.duration_ms.toFixed(1)}ms)`);
  if (startExec.success && (startExec.result as any)?.inject) {
    console.log(`  注入内容:\n${(startExec.result as any).inject}`);
  }
  console.log('');

  // 2. 模拟几次工具调用触发 PostToolUse
  const toolCalls = [
    {
      tool_name: 'Read',
      tool_input: { file_path: '/home/user/my-project/package.json' },
      tool_output: '{"name": "my-project", "version": "1.0.0", "dependencies": {"next": "^14.0.0"}}',
    },
    {
      tool_name: 'Bash',
      tool_input: { command: 'echo hello' },
      tool_output: 'hello',
    },
    {
      tool_name: 'Grep',
      tool_input: { pattern: 'TODO', path: '/home/user/my-project/src' },
      tool_output: '3 matches found in 2 files',
    },
  ];

  console.log('--- 模拟工具调用 ---');
  for (const call of toolCalls) {
    const payload: PostToolUseInput = {
      session_id: 'sim-001',
      ...call,
      timestamp: new Date().toISOString(),
    };
    const exec = await executeHook(hookConfigs[1], payload);
    executions.push(exec);
    const resultLog = (exec.result as any)?.log || exec.error || 'no output';
    console.log(`  [${call.tool_name}] ${exec.success ? 'OK' : 'FAIL'} (${exec.duration_ms.toFixed(1)}ms) - ${resultLog}`);
  }
  console.log('');

  // 3. 汇总统计
  console.log('--- 执行统计 ---');
  const successful = executions.filter((e) => e.success);
  const totalTime = executions.reduce((sum, e) => sum + e.duration_ms, 0);
  console.log(`  总执行次数: ${executions.length}`);
  console.log(`  成功: ${successful.length}, 失败: ${executions.length - successful.length}`);
  console.log(`  总耗时: ${totalTime.toFixed(1)}ms`);
  console.log(`  平均耗时: ${(totalTime / executions.length).toFixed(1)}ms`);
}

simulateSession();
