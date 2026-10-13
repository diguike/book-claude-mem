/**
 * 自动脱敏：移植自 claude-mem v13.35.0 的 src/utils/redaction.ts
 * - 11 条内置规则，命中整段替换成 <redacted type='名字'/>，不做“保留首尾”的部分遮盖
 * - 自定义规则排在内置规则之前
 * - 单个字段超过 1M 字符时整体替换成 oversize 标记（fail closed：宁可丢内容，不存未扫描的内容）
 * 演示见 redaction-demo.ts（npm run demo:redact）；本文件只导出函数，可以直接 import 去测自己的规则
 */

interface RedactionPattern { name: string; regex: RegExp }

export const BUILTIN_REDACTION_PATTERNS: RedactionPattern[] = [
  { name: 'aws_access_key',  regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'aws_secret_key',  regex: /(?<=AWS_SECRET_ACCESS_KEY\s*[=:]\s*['"]?)[A-Za-z0-9/+=]{40}/g },
  { name: 'github_pat',      regex: /\bgh[oprs]_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{82}\b/g },
  { name: 'openai_key',      regex: /\bsk-(?!ant-)[A-Za-z0-9_-]{20,}\b/g },
  { name: 'anthropic_key',   regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'slack_token',     regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'jwt',             regex: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
  { name: 'private_key_pem', regex: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: 'stripe_key',      regex: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{24,}\b/g },
  { name: 'google_api_key',  regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'claude_mem_key',  regex: /\bcmem_[A-Za-z0-9_-]{32,}|\bcm_pro_[A-Za-z0-9_-]{8,}/g },
];

export const MAX_INPUT_CHARS = 1024 * 1024;
export const OVERSIZE_MARKER = "<redacted type='oversize'/>";

export function redactSensitive(input: string, customPatterns: { name: string; regex: string }[] = []) {
  if (input.length > MAX_INPUT_CHARS) return { redacted: OVERSIZE_MARKER, counts: { oversize: 1 } as Record<string, number> };
  const counts: Record<string, number> = {};
  const custom = customPatterns.map(p => ({ name: p.name, regex: new RegExp(p.regex, 'g') }));
  let working = input;
  for (const pattern of [...custom, ...BUILTIN_REDACTION_PATTERNS]) {
    pattern.regex.lastIndex = 0;
    working = working.replace(pattern.regex, () => {
      counts[pattern.name] = (counts[pattern.name] ?? 0) + 1;
      return `<redacted type='${pattern.name}'/>`;
    });
  }
  return { redacted: working, counts };
}
