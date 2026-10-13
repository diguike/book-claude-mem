/**
 * 第 19 章演示：笔记本和台式机通过一个 hub 同步记忆
 * 运行：npm run demo
 */
import { Hub } from './hub.js';
import { Device } from './device.js';

const hub = new Hub();
const laptop = new Device('dev-laptop', hub);
const desktop = new Device('dev-desktop', hub);
const out = (label: string, v: unknown) => console.log(`  ${label}：${typeof v === 'string' ? v : JSON.stringify(v)}`);

console.log('[1] 笔记本离线写了两条，联网后一次推送');
const a = laptop.write('支付回调重复入账', 'webhook 按事件 ID 加唯一索引');
laptop.write('订单导出改流式', '游标分页 + Readable');
out('推送', laptop.flush());
out('台式机拉取', desktop.pull());
out('台式机的行', desktop.rows().map(r => `${r.title}（来自 ${r.origin}，rev ${r.rev}）`));

console.log('\n[2] 推送请求还在路上时，笔记本又改了第一条');
laptop.edit(a, 'webhook 按事件 ID 加唯一索引，并补了幂等测试');
const inflight = laptop.flush(() => laptop.edit(a, 'webhook 按事件 ID 加唯一索引，幂等测试 + 重放脚本'));
out('第一次推送（rev 2）', inflight);
out('第一条现在', laptop.rows().find(r => r.id === a));
out('下一轮推送（rev 3）', laptop.flush());
out('台式机拉取', desktop.pull());
out('台式机上的第一条', desktop.rows()[0].narrative);

console.log('\n[3] 回声：台式机写一条推上去，再拉一次');
desktop.write('Windows 下路径大小写', 'path.resolve 后再比较');
out('台式机推送', desktop.flush());
out('台式机自己拉', desktop.pull());
out('笔记本拉', laptop.pull());

console.log('\n[4] 拉取中途崩溃：整批回滚，游标不动');
laptop.write('Redis 宕机时请求挂起', 'BullMQ 离线队列');
laptop.write('pg_trgm 两个字不走索引', '少于 3 个字凑不出三元组');
laptop.flush();
const before = desktop.cursor();
try { desktop.pull(100, 1); } catch (e) { out('第二条处理时', (e as Error).message); }
out('游标', `${before} → ${desktop.cursor()}`);
out('台式机行数', desktop.rows().length);
out('重新拉取', desktop.pull());
out('台式机行数', desktop.rows().length);

console.log('\n[5] 设备本地字段：强化次数不同步');
laptop.db.prepare('UPDATE observations SET reinforce_count = 5 WHERE id = ?').run(a);
out('笔记本 reinforced', laptop.rows().find(r => r.id === a)!.reinforced);
out('台式机 reinforced', desktop.rows()[0].reinforced);
out('笔记本待推送', laptop.flush());

console.log('\n[6] 删除：墓碑同步到另一台设备');
laptop.remove(a);
out('笔记本推送墓碑', laptop.flush());
out('台式机拉取', desktop.pull());
out('台式机剩下', desktop.rows().map(r => r.title));
const foreign = desktop.rows().find(r => r.origin === 'dev-laptop')!.id as number;
try { desktop.remove(foreign); } catch (e) { out('台式机删笔记本同步来的行', (e as Error).message); }

console.log('\n[7] 超过 256 KB 的行进死信，不堵后面的队列');
laptop.write('超大输出', 'x'.repeat(300_000));
laptop.write('正常的一条', '在超大行之后写入');
out('推送', laptop.flush());
out('死信', laptop.db.prepare('SELECT local_id, reason FROM dead_letter').all());
