/**
 * Hook 侧：把事件原子地写成一个文件就返回（claude-mem v13 的 hook-spool 模式）
 *
 * - 一个事件一个文件，不共享追加文件：并发的 Hook 进程不会互相交错
 * - 文件名就是去重键：同一事件被重复投递，只会覆盖同一个文件
 * - 先写临时文件再 rename：读者永远看不到写了一半的文件
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ToolEvent {
  sessionId: string;
  toolUseId?: string;
  toolName: string;
  toolInput: unknown;
  toolResponse: unknown;
}

export interface SpoolEntry {
  kind: 'observation';
  payload: ToolEvent;
  enqueuedAtEpochMs: number;
}

let lastEnqueuedAt = 0;

/** 去重键：有 tool_use_id 时用“会话哈希-工具调用 ID”，否则用内容哈希 */
export function entryKey(event: ToolEvent): string {
  const session = createHash('sha256').update(event.sessionId).digest('hex').slice(0, 16);
  if (event.toolUseId && /^[A-Za-z0-9_-]{1,128}$/.test(event.toolUseId)) {
    return `observation-${session}-${event.toolUseId}`;
  }
  const body = createHash('sha256').update(JSON.stringify(event)).digest('hex').slice(0, 32);
  return `observation-${session}-${body}`;
}

export function spoolEvent(dir: string, event: ToolEvent): string {
  mkdirSync(dir, { recursive: true });
  // 同一进程内保证单调递增，用于取件时排序
  const now = Math.max(Date.now(), lastEnqueuedAt + 1);
  lastEnqueuedAt = now;
  const entry: SpoolEntry = { kind: 'observation', payload: event, enqueuedAtEpochMs: now };
  const name = `${entryKey(event)}.json`;
  const tmp = join(dir, `.${name}.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(entry));
  renameSync(tmp, join(dir, name)); // 原子替换
  return name;
}

/** 按入队时间排序列出待取的条目；格式坏掉的文件跳过（真实实现会移进 corrupt/） */
export function listEntries(dir: string): Array<{ file: string; key: string; entry: SpoolEntry }> {
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('.'));
  } catch {
    return [];
  }
  const entries = [];
  for (const file of files) {
    try {
      const entry = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as SpoolEntry;
      entries.push({ file, key: file.replace(/\.json$/, ''), entry });
    } catch {
      // 读取过程中被并发删除，或者内容损坏
    }
  }
  return entries.sort((a, b) => a.entry.enqueuedAtEpochMs - b.entry.enqueuedAtEpochMs || a.file.localeCompare(b.file));
}
