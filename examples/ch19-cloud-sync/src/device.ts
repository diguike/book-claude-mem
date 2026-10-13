/**
 * 一台设备上的本地库 + 推送 + 拉取
 * 推送对照 src/services/sync/CloudSync.ts，拉取对照 SyncApply.ts / SyncClient.ts（claude-mem v13.35.0）
 */
import Database from 'better-sqlite3';
import { buildOp, type OpBody } from './canonical.js';
import type { Ack, Hub } from './hub.js';

export class Device {
  readonly db: Database.Database;

  constructor(readonly id: string, private readonly hub: Hub) {
    this.db = new Database(':memory:');
    this.db.exec(`
      CREATE TABLE observations (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL, narrative TEXT NOT NULL,
        sync_rev INTEGER NOT NULL DEFAULT 1,
        synced_at INTEGER,                       -- NULL = 还不在 hub 的日志里：数据库本身就是待推送队列
        origin_device_id TEXT, origin_local_id TEXT,   -- 从别的设备拉来的行才有值
        reinforce_count INTEGER NOT NULL DEFAULT 0,    -- 设备本地字段，不同步
        UNIQUE (origin_device_id, origin_local_id)
      );
      CREATE TABLE tombstones (local_id TEXT PRIMARY KEY, rev INTEGER NOT NULL, synced_at INTEGER);
      CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE dead_letter (local_id TEXT, rev INTEGER, reason TEXT);
    `);
  }

  // ---------- 本地写入 ----------
  write(title: string, narrative: string): number {
    return Number(this.db.prepare('INSERT INTO observations (title, narrative) VALUES (?, ?)').run(title, narrative).lastInsertRowid);
  }

  edit(id: number, narrative: string): void {
    // 改内容必须升版本、清 synced_at，这一行才会重新进入待推送集合
    this.db.prepare('UPDATE observations SET narrative = ?, sync_rev = sync_rev + 1, synced_at = NULL WHERE id = ?').run(narrative, id);
  }

  remove(id: number): void {
    // 只能删本机产生的行；删除留下墓碑，墓碑也要同步出去
    const row = this.db.prepare('SELECT sync_rev FROM observations WHERE id = ? AND origin_device_id IS NULL').get(id) as { sync_rev: number } | undefined;
    if (!row) throw new Error(`#${id} 不是本机产生的行`);
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM observations WHERE id = ?').run(id);
      this.db.prepare('INSERT INTO tombstones (local_id, rev) VALUES (?, ?)').run(String(id), row.sync_rev + 1);
    })();
  }

  // ---------- 推送 ----------
  private pendingOps(): OpBody[] {
    const tombs = this.db.prepare('SELECT local_id, rev FROM tombstones WHERE synced_at IS NULL').all() as Array<{ local_id: string; rev: number }>;
    const rows = this.db.prepare('SELECT id, title, narrative, sync_rev FROM observations WHERE synced_at IS NULL AND origin_device_id IS NULL ORDER BY id')
      .all() as Array<{ id: number; title: string; narrative: string; sync_rev: number }>;
    return [
      // 墓碑先推：已冻结的内容优先（与 CloudSync 的排水顺序一致）
      ...tombs.map(t => ({ kind: 'observation' as const, origin_device: this.id, origin_id: t.local_id, rev: t.rev, tombstone: true, fields: null })),
      ...rows.map(r => ({ kind: 'observation' as const, origin_device: this.id, origin_id: String(r.id), rev: r.sync_rev, tombstone: false, fields: { title: r.title, narrative: r.narrative } })),
    ];
  }

  /** beforeStamp 用来模拟“请求在路上时，本地又改了这一行” */
  flush(beforeStamp?: () => void): { pushed: number; stamped: number; deadLettered: number } {
    const bodies = this.pendingOps();
    const ops = bodies.map(buildOp);
    let deadLettered = 0;
    const ok = ops.filter((op, i) => {
      if (Buffer.byteLength(op.body) <= 256_000) return true;
      // 超限的行永远推不出去：移进死信，不让它堵住后面的队列
      this.db.prepare('INSERT INTO dead_letter VALUES (?, ?, ?)').run(bodies[i].origin_id, bodies[i].rev, 'body_too_large');
      this.db.prepare('UPDATE observations SET synced_at = -1 WHERE id = ?').run(Number(bodies[i].origin_id));
      deadLettered++;
      return false;
    });
    if (ok.length === 0) return { pushed: 0, stamped: 0, deadLettered };
    const res = this.hub.push(ok);
    if ('refused' in res) throw new Error(res.refused);
    beforeStamp?.();
    // 盖戳前先核对：ack 必须与推送的 (origin_id, rev, hash) 一一对应，顺序可以不同
    const sent = ok.map(o => { const b = JSON.parse(o.body) as OpBody; return `${b.origin_id}|${b.rev}|${o.operation_sha256}`; }).sort();
    const got = res.acked.map((a: Ack) => `${a.origin_id}|${a.rev}|${a.operation_sha256}`).sort();
    if (sent.join() !== got.join()) throw new Error('ack 与推送内容不一致，本轮不盖戳');
    let stamped = 0;
    const now = Date.now();
    this.db.transaction(() => {
      for (const a of res.acked) {
        const body = JSON.parse(ok.find(o => o.operation_sha256 === a.operation_sha256)!.body) as OpBody;
        const r = body.tombstone
          ? this.db.prepare('UPDATE tombstones SET synced_at = ? WHERE local_id = ? AND rev = ?').run(now, a.origin_id, a.rev)
          // 只有当前版本仍等于 ack 的版本才盖戳：路上被改过的行保持未同步，下一轮按新版本重推
          : this.db.prepare('UPDATE observations SET synced_at = ? WHERE id = ? AND sync_rev = ?').run(now, Number(a.origin_id), a.rev);
        stamped += r.changes;
      }
    })();
    return { pushed: ok.length, stamped, deadLettered };
  }

  // ---------- 拉取 ----------
  cursor(): number {
    const row = this.db.prepare("SELECT value FROM sync_state WHERE key = 'cursor'").get() as { value: string } | undefined;
    return row ? Number(row.value) : 0;
  }

  /** failAfter：处理到第几条时抛错，模拟进程在批次中途崩溃 */
  pull(limit = 100, failAfter?: number): { applied: number; skipped: number } {
    const page = this.hub.changes(this.cursor(), limit);
    let applied = 0;
    let skipped = 0;
    // 整批数据和游标在同一个事务里：要么一起落地，要么都不落地
    this.db.transaction(() => {
      page.ops.forEach((change, i) => {
        if (failAfter !== undefined && i === failAfter) throw new Error('模拟崩溃');
        const op = JSON.parse(change.body) as OpBody;
        if (op.origin_device === this.id) { skipped++; return; } // 自己推出去的，回声直接跳过
        const local = this.db.prepare('SELECT id, sync_rev FROM observations WHERE origin_device_id = ? AND origin_local_id = ?')
          .get(op.origin_device, op.origin_id) as { id: number; sync_rev: number } | undefined;
        if (local && op.rev <= local.sync_rev) { skipped++; return; } // 版本不高于本地：跳过
        if (op.tombstone) {
          if (local) this.db.prepare('DELETE FROM observations WHERE id = ?').run(local.id);
        } else if (local) {
          this.db.prepare('UPDATE observations SET title = ?, narrative = ?, sync_rev = ?, synced_at = ? WHERE id = ?')
            .run(op.fields!.title, op.fields!.narrative, op.rev, Date.now(), local.id);
        } else {
          // 预先盖上 synced_at：拉来的行永远不会被自己的推送选中（回声防护是结构性的）
          this.db.prepare('INSERT INTO observations (title, narrative, sync_rev, synced_at, origin_device_id, origin_local_id) VALUES (?, ?, ?, ?, ?, ?)')
            .run(op.fields!.title, op.fields!.narrative, op.rev, Date.now(), op.origin_device, op.origin_id);
        }
        applied++;
      });
      const last = page.ops.at(-1);
      if (last) this.db.prepare("INSERT INTO sync_state VALUES ('cursor', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(last.seq));
    })();
    return { applied, skipped };
  }

  rows(): Array<Record<string, unknown>> {
    return this.db.prepare('SELECT id, title, narrative, sync_rev AS rev, synced_at IS NOT NULL AS synced, origin_device_id AS origin, reinforce_count AS reinforced FROM observations ORDER BY id').all() as Array<Record<string, unknown>>;
  }
}
