/**
 * 演示 Hook → spool → Worker 的交接，以及两种崩溃时机下的行为
 * 运行：npm run demo
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spoolEvent } from './spool.js';
import { Worker, type CrashPoint } from './worker.js';

const root = mkdtempSync(join(tmpdir(), 'ch06-spool-'));
const spoolDir = join(root, 'hook-spool');
const dbPath = join(root, 'worker.db');
const pending = () => readdirSync(spoolDir).filter(f => f.endsWith('.json')).length;

function hook(sessionId: string, toolUseId: string, toolName: string): void {
  // Hook 进程只做这一件事，然后退出；不需要 Worker 在线
  spoolEvent(spoolDir, { sessionId, toolUseId, toolName, toolInput: {}, toolResponse: { ok: true } });
}

function runWorker(label: string, crash: CrashPoint = 'none'): void {
  const worker = new Worker(spoolDir, dbPath);
  try {
    const r = worker.drain(crash);
    const written = worker.flush();
    console.log(`  ${label}: 交接 ${r.handedOff} 条，跳过已交接 ${r.skippedAlreadyHandedOff} 条，写入观察 ${written} 条，剩余文件 ${pending()}`);
  } catch (e) {
    // 进程“死掉”：内存缓冲随之丢失，不调用 flush
    console.log(`  ${label}: ${(e as Error).message}；内存缓冲里 ${worker.bufferedCount()} 条随进程丢失，剩余文件 ${pending()}`);
  } finally {
    worker.close();
  }
}

console.log('=== 1. Worker 不在线时，Hook 照样落盘 ===');
hook('s1', 'toolu_01', 'Read');
hook('s1', 'toolu_02', 'Edit');
hook('s1', 'toolu_02', 'Edit'); // 宿主重复投递同一事件
console.log(`  写了 3 次，spool 里有 ${pending()} 个文件（重复投递覆盖了同一个文件）`);

console.log('\n=== 2. Worker 上线后取件 ===');
runWorker('第一次运行');

console.log('\n=== 3. 崩溃发生在“标记已写、文件未删”之间 ===');
hook('s2', 'toolu_03', 'Bash');
runWorker('崩溃的 Worker', 'after-marker-before-unlink');
runWorker('重启后的 Worker');
console.log('  说明：标记证明这条已经交接过，重启后只删文件、不再入库。');
console.log('  代价：它在崩溃的进程内存里，那一批观察没有生成。claude-mem 接受这个代价，');
console.log('  恢复靠重放宿主的 transcript，而不是重放中间状态。');

console.log('\n=== 4. 崩溃发生在“标记写入之前” ===');
hook('s3', 'toolu_04', 'Grep');
runWorker('崩溃的 Worker', 'before-marker');
runWorker('重启后的 Worker');
console.log('  说明：没有标记，文件还在，重启后正常处理，不丢。');

const worker = new Worker(spoolDir, dbPath);
console.log('\n=== 最终的观察 ===');
for (const o of worker.observations()) console.log(`  #${o.id} [${o.session_id}] ${o.title}  来源=${o.source_keys}`);
worker.close();
rmSync(root, { recursive: true, force: true });
