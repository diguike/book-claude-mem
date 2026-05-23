// Token 计算器：用简单规则估算中英文混合文本的 token 数
// 规则：英文按空格分词后约 1 word = 1.3 token；中文每个字约 1.5-2 token

interface TokenEstimate {
  text: string;
  englishWords: number;
  chineseChars: number;
  estimatedTokens: number;
}

// 判断字符是否为中文
function isChinese(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0x4e00 && code <= 0x9fff;
}

// 估算 token 数
export function estimateTokens(text: string): TokenEstimate {
  let chineseChars = 0;
  let englishBuffer = '';
  let englishWords = 0;

  for (const char of text) {
    if (isChinese(char)) {
      chineseChars++;
      // 结算当前英文缓冲区
      if (englishBuffer.trim()) {
        englishWords += englishBuffer.trim().split(/\s+/).length;
      }
      englishBuffer = '';
    } else {
      englishBuffer += char;
    }
  }

  // 处理尾部英文
  if (englishBuffer.trim()) {
    englishWords += englishBuffer.trim().split(/\s+/).length;
  }

  // 估算公式：英文 1 word ≈ 1.3 token，中文 1 字 ≈ 1.8 token
  const estimatedTokens = Math.ceil(englishWords * 1.3 + chineseChars * 1.8);

  return { text, englishWords, chineseChars, estimatedTokens };
}

// 演示
function main() {
  console.log('=== Token 估算器 ===\n');

  const samples = [
    'Hello, world! This is a simple English sentence.',
    '这是一段纯中文文本，用来测试 token 估算。',
    'claude-mem 的核心设计思路是 Progressive Disclosure，即渐进式披露上下文信息。',
    'The observation pipeline processes raw tool usage data into structured knowledge entries that can be efficiently retrieved.',
    '在 SQLite FTS5 中，我们使用 MATCH 语法来执行全文搜索，支持 AND、OR、NOT 等布尔运算符。',
  ];

  for (const sample of samples) {
    const result = estimateTokens(sample);
    console.log(`文本: "${result.text.slice(0, 50)}${result.text.length > 50 ? '...' : ''}"`);
    console.log(`  英文单词: ${result.englishWords}, 中文字符: ${result.chineseChars}`);
    console.log(`  估算 token: ${result.estimatedTokens}`);
    console.log('');
  }
}

main();
