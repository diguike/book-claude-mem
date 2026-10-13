// 输出几份常用的 claude-mem 配置（v13.35.0）
// settings.json 是扁平的键值，键名与环境变量同名，值一律是字符串；
// 全部键与默认值见 claude-mem 源码 src/shared/SettingsDefaultsManager.ts

interface SettingsTemplate {
  name: string;
  description: string;
  config: Record<string, string>;
}

const templates: SettingsTemplate[] = [
  {
    name: '中文用户的起步配置',
    description: '观察用中文书写；观察者用自己的 Anthropic 账号',
    config: {
      CLAUDE_MEM_MODE: 'code--zh',
      CLAUDE_MEM_PROVIDER: 'claude',
      CLAUDE_MEM_CONTEXT_OBSERVATIONS: '50',
      CLAUDE_MEM_CONTEXT_SESSION_COUNT: '10',
    },
  },
  {
    name: '隐私优先',
    description: '排除个人目录、开启自动脱敏、关闭遥测（遥测也可用 DO_NOT_TRACK=1）',
    config: {
      CLAUDE_MEM_EXCLUDED_PROJECTS: '~/personal/**,~/tmp/**',
      CLAUDE_MEM_REDACT_ENABLED: 'true',
      CLAUDE_MEM_TELEMETRY: '0',
    },
  },
  {
    name: '用 OpenAI 兼容接口做观察者',
    description: '例如 DeepSeek；密钥建议放在 ~/.claude-mem/.env 或环境变量里',
    config: {
      CLAUDE_MEM_PROVIDER: 'openai-compatible',
      CLAUDE_MEM_OPENAI_COMPAT_PRESET: 'deepseek',
      CLAUDE_MEM_OPENAI_COMPAT_MODEL: '<模型 ID>',
    },
  },
  {
    name: '只用 SQLite 搜索',
    description: '不装 uv / Chroma 的环境；中文查询由 SQLite 子串匹配兜底',
    config: {
      CLAUDE_MEM_CHROMA_ENABLED: 'false',
    },
  },
  {
    name: '长期知识优先',
    description: '让被反复确认的老观察重新进入开场索引，并合并标题相同的重复观察',
    config: {
      CLAUDE_MEM_REINFORCE_ALPHA: '1',
      CLAUDE_MEM_DEDUP_ENABLED: 'true',
    },
  },
];

console.log('=== claude-mem 配置示例（v13.35.0）===\n');
for (const t of templates) {
  console.log(`--- ${t.name} ---`);
  console.log(`说明: ${t.description}\n`);
  console.log(JSON.stringify(t.config, null, 2));
  console.log('');
}
console.log('把需要的键合并进 ~/.claude-mem/settings.json，或者设置同名环境变量（环境变量优先）。');
console.log('改完后运行 npx claude-mem restart 让 Worker 重新读取配置。');
