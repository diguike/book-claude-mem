/**
 * 自动脱敏演示：内置规则的盲区与自定义规则
 * 运行：npm run demo:redact
 */
import { MAX_INPUT_CHARS, redactSensitive } from './redaction.js';

// 测试用的“密钥”在运行时拼出来，源码里不出现完整的密钥形态字符串，避免触发代码托管平台的密钥扫描
const fake = (prefix: string, n: number, ch = 'x') => prefix + ch.repeat(n);
const awsSecret = 'a'.repeat(20) + 'B'.repeat(20);

const samples: Array<[string, string]> = [
  ['shell 风格 AWS 密钥', `export AWS_ACCESS_KEY_ID=${fake('AKIA', 16, 'Q')}\nexport AWS_SECRET_ACCESS_KEY=${awsSecret}`],
  ['JSON 风格 AWS 密钥', `{"AWS_SECRET_ACCESS_KEY": "${awsSecret}"}`],
  ['Anthropic / OpenAI key', `ANTHROPIC_API_KEY=${fake('sk-ant-', 24)} OPENAI_API_KEY=${fake('sk-', 24)}`],
  ['claude-mem 服务端 key（CLI 签发）', `curl -H "Authorization: Bearer ${fake('cmem_', 43, 'k')}" .../v1/search`],
  ['claude-mem 只读 key（POST /v1/keys 签发）', `curl -H "Authorization: Bearer ${fake('cm_', 48, 'a')}" .../v1/mcp`],
  ['中文个人信息', '用户 张三，手机 13812345678，身份证 110101199003071234，反馈登录超时'],
];

const chinesePii = [
  { name: 'cn_mobile', regex: '(?<!\\d)1[3-9]\\d{9}(?!\\d)' },
  { name: 'cn_id_card', regex: '(?<!\\d)[1-9]\\d{5}(?:19|20)\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx](?!\\d)' },
];

console.log('=== 只用内置规则 ===');
for (const [label, text] of samples) {
  const { redacted, counts } = redactSensitive(text);
  console.log(`\n[${label}] 命中 ${JSON.stringify(counts)}`);
  console.log(redacted.split('\n').map(l => `  ${l}`).join('\n'));
}

console.log('\n=== 加上自定义规则（CLAUDE_MEM_REDACT_CUSTOM_PATTERNS 的 JSON 写法）===');
console.log(`  ${JSON.stringify(chinesePii)}`);
const { redacted, counts } = redactSensitive(samples[5][1], chinesePii);
console.log(`  命中 ${JSON.stringify(counts)}\n  ${redacted}`);

console.log('\n=== 超长字段 ===');
const huge = 'x'.repeat(MAX_INPUT_CHARS + 1);
console.log(`  ${huge.length} 字符 → ${redactSensitive(huge).redacted}`);
