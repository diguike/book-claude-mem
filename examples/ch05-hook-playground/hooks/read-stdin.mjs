// 所有示例 Hook 共用：先拼接全部字节再解码，避免多字节字符被切断
export async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
}
