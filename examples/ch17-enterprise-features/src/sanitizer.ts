/**
 * 数据脱敏器 — 自动检测和脱敏敏感信息
 *
 * 在 observation 写入前自动扫描内容，对敏感信息进行脱敏处理。
 * 支持：手机号、身份证号、邮箱、银行卡号、API Key 等。
 */

interface SanitizeRule {
  name: string;
  pattern: RegExp;
  replacement: (match: string) => string;
}

// 内置脱敏规则
const RULES: SanitizeRule[] = [
  {
    name: '中国手机号',
    pattern: /1[3-9]\d{9}/g,
    replacement: (match) => match.slice(0, 3) + '****' + match.slice(7),
  },
  {
    name: '身份证号',
    pattern: /[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g,
    replacement: (match) => match.slice(0, 6) + '********' + match.slice(14),
  },
  {
    name: '邮箱地址',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: (match) => {
      const [local, domain] = match.split('@');
      const masked = local.slice(0, 2) + '***';
      return `${masked}@${domain}`;
    },
  },
  {
    name: '银行卡号',
    pattern: /\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/g,
    replacement: (match) => {
      const digits = match.replace(/[\s-]/g, '');
      return digits.slice(0, 4) + ' **** **** ' + digits.slice(12);
    },
  },
  {
    name: 'API Key (sk-)',
    pattern: /sk-[a-zA-Z0-9]{20,}/g,
    replacement: (match) => match.slice(0, 6) + '...' + match.slice(-4),
  },
  {
    name: 'API Key (key_)',
    pattern: /key_[a-zA-Z0-9]{16,}/g,
    replacement: (match) => match.slice(0, 7) + '...' + match.slice(-4),
  },
  {
    name: 'IPv4 地址',
    pattern: /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g,
    replacement: (match) => {
      const parts = match.split('.');
      return parts[0] + '.' + parts[1] + '.*.*';
    },
  },
];

interface SanitizeResult {
  original: string;
  sanitized: string;
  detections: Array<{
    rule: string;
    original: string;
    masked: string;
    position: number;
  }>;
}

/**
 * 对文本内容进行脱敏处理
 */
function sanitize(text: string, customRules?: SanitizeRule[]): SanitizeResult {
  const allRules = [...RULES, ...(customRules || [])];
  const detections: SanitizeResult['detections'] = [];
  let result = text;

  for (const rule of allRules) {
    // 重置 regex 的 lastIndex
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    // 先收集所有匹配
    const matches: Array<{ value: string; index: number }> = [];
    while ((match = rule.pattern.exec(text)) !== null) {
      matches.push({ value: match[0], index: match.index });
    }

    // 执行替换
    for (const m of matches) {
      const masked = rule.replacement(m.value);
      detections.push({
        rule: rule.name,
        original: m.value,
        masked,
        position: m.index,
      });
      result = result.replace(m.value, masked);
    }
  }

  return {
    original: text,
    sanitized: result,
    detections,
  };
}

/**
 * 检查文本中是否包含敏感信息（不做替换，仅检测）
 */
function detectSensitiveInfo(text: string): boolean {
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) return true;
  }
  return false;
}

// --- Demo 运行 ---

function main() {
  console.log('=== 数据脱敏示例 ===\n');

  const testCases = [
    '用户手机号是 13812345678，邮箱 zhangsan@example.com',
    '身份证号: 110101199001011234，银行卡: 6222 0200 1234 5678',
    '他的 API key 是 sk-ant1234567890abcdefghij，IP 地址 192.168.1.100',
    '这段文本没有敏感信息，只是普通的技术讨论内容',
  ];

  for (const text of testCases) {
    const result = sanitize(text);
    console.log(`原文: ${result.original}`);
    console.log(`脱敏: ${result.sanitized}`);

    if (result.detections.length > 0) {
      console.log(`检测到 ${result.detections.length} 处敏感信息:`);
      for (const d of result.detections) {
        console.log(`  - [${d.rule}] "${d.original}" -> "${d.masked}"`);
      }
    }
    console.log('');
  }

  // 仅检测模式
  console.log('=== 敏感信息检测 ===');
  console.log(`"包含手机号 13900001111" -> ${detectSensitiveInfo('包含手机号 13900001111')}`);
  console.log(`"普通文本内容" -> ${detectSensitiveInfo('普通文本内容')}`);
}

main();

export { sanitize, detectSensitiveInfo };
export type { SanitizeRule, SanitizeResult };
