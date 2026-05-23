/**
 * 从 stdin 读取 JSON 输入
 * Claude Code Hook 通过 stdin 传递事件数据
 */
export async function readJsonFromStdin<T = unknown>(): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  return JSON.parse(raw) as T;
}
