/** 规范化 JSON：键排序后序列化，同一内容在任何设备上都得到同一串字节、同一个哈希 */
import { createHash } from 'node:crypto';

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v);
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** 一条同步操作：哪台设备、本地第几行、第几个版本、内容是什么 */
export interface OpBody {
  kind: 'observation';
  origin_device: string;
  origin_id: string;
  rev: number;
  tombstone: boolean;
  fields: { title: string; narrative: string } | null;
}

export interface WireOp { body: string; operation_sha256: string }

export function buildOp(body: OpBody): WireOp {
  const json = canonicalJson(body);
  return { body: json, operation_sha256: sha256(json) };
}
