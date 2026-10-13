/**
 * 每个用户一条有序日志（对照 claude-mem 的 workers/sync-hub：Cloudflare Durable Object）
 * - 追加时按 (origin_device, kind, origin_id, rev) 去重，先写者胜；同一个键换了内容直接拒绝
 * - 返回的 ack 带上序号，客户端拿 ack 证明“这条确实进了日志”
 */
import { buildOp, sha256, type OpBody, type WireOp } from './canonical.js';

export interface Ack { origin_id: string; rev: number; operation_sha256: string; seq: number }

export class Hub {
  private readonly log: Array<{ seq: number; op: WireOp }> = [];
  private readonly entity = new Map<string, string>(); // 实体键 → 内容哈希
  readonly maxBodyBytes = 256_000;

  push(ops: WireOp[]): { acked: Ack[]; head_seq: number } | { refused: string } {
    const acked: Ack[] = [];
    for (const op of ops) {
      if (sha256(op.body) !== op.operation_sha256) return { refused: 'hash_mismatch' };
      if (Buffer.byteLength(op.body) > this.maxBodyBytes) return { refused: 'body_too_large' };
      const b = JSON.parse(op.body) as OpBody;
      const key = `${b.origin_device}|${b.kind}|${b.origin_id}|${b.rev}`;
      const existing = this.entity.get(key);
      if (existing && existing !== op.operation_sha256) return { refused: `revision_hash_conflict:${b.origin_id}:${b.rev}` };
      let seq: number;
      if (existing) {
        seq = this.log.find(e => e.op.operation_sha256 === existing)!.seq; // 重发：返回原来的序号，不重复追加
      } else {
        seq = this.log.length + 1;
        this.log.push({ seq, op });
        this.entity.set(key, op.operation_sha256);
      }
      acked.push({ origin_id: b.origin_id, rev: b.rev, operation_sha256: op.operation_sha256, seq });
    }
    return { acked: acked.reverse(), head_seq: this.log.length }; // 故意打乱顺序：ack 可以乱序返回
  }

  changes(since: number, limit: number): { ops: Array<{ seq: number; body: string }>; head_seq: number } {
    return { ops: this.log.filter(e => e.seq > since).slice(0, limit).map(e => ({ seq: e.seq, body: e.op.body })), head_seq: this.log.length };
  }
}

export { buildOp };
