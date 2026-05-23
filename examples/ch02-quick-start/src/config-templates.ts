// 输出 claude-mem 推荐配置模板

interface SettingsTemplate {
  name: string;
  description: string;
  config: Record<string, unknown>;
}

const templates: SettingsTemplate[] = [
  {
    name: '最小配置',
    description: '适合个人项目，单 corpus，无高级功能',
    config: {
      port: 7777,
      storage: {
        database: '~/.claude-mem/observations.db',
        corpora_dir: '~/.claude-mem/corpora',
      },
      hooks: {
        session_start: true,
        post_tool_use: true,
        pre_tool_use: false,
      },
      progressive_disclosure: {
        enabled: true,
        max_inject_tokens: 2000,
      },
    },
  },
  {
    name: '多项目配置',
    description: '适合同时维护多个项目的工程师，按项目隔离 corpus',
    config: {
      port: 7777,
      storage: {
        database: '~/.claude-mem/observations.db',
        corpora_dir: '~/.claude-mem/corpora',
      },
      hooks: {
        session_start: true,
        post_tool_use: true,
        pre_tool_use: true,
      },
      progressive_disclosure: {
        enabled: true,
        max_inject_tokens: 3000,
      },
      corpus_isolation: {
        enabled: true,
        strategy: 'by_project_root',
      },
      observation: {
        auto_compress: true,
        compress_threshold_days: 7,
      },
    },
  },
  {
    name: '团队配置',
    description: '适合团队共享知识库场景，开启同步和权限控制',
    config: {
      port: 7777,
      storage: {
        database: '~/.claude-mem/observations.db',
        corpora_dir: '~/.claude-mem/corpora',
      },
      hooks: {
        session_start: true,
        post_tool_use: true,
        pre_tool_use: true,
      },
      progressive_disclosure: {
        enabled: true,
        max_inject_tokens: 4000,
      },
      sync: {
        enabled: true,
        remote: 'git',
        auto_push: false,
      },
      access_control: {
        enabled: true,
        default_visibility: 'team',
      },
    },
  },
];

function main() {
  console.log('=== claude-mem 推荐配置模板 ===\n');

  for (const t of templates) {
    console.log(`--- ${t.name} ---`);
    console.log(`说明: ${t.description}\n`);
    console.log(JSON.stringify(t.config, null, 2));
    console.log('');
  }

  console.log('将上述配置写入 ~/.claude-mem/settings.json 即可生效。');
}

main();
