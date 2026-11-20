// 记忆审计账本 + 记忆溯源（0.6.7）
// ------------------------------------------------------------------
// 为什么单独一个文件：审计必须是「不碰磁盘也能验证」的纯逻辑，
// 否则「每条记忆都能引用出处」就只是一句宣传语。
//
// 两个东西：
//   ① 条目指纹：同一段内容 → 同一个指纹（跨备份、跨压缩、跨会话都能对上）
//   ② 哈希链账本：每条记录带 prev + hash，任何一行被改/被删，链就断，
//      校验能指出断在第几条——这就是「可审计」和「有日志」的区别。
//
// 账本只记「发生了什么」，不存记忆正文（正文在 MEMORY.md / archived 里），
// 所以账本可以长期留着也不占多少字节。
import { createHash } from 'node:crypto';

/** 账本格式版本（改了字段含义就升它，读旧账本时按版本兼容） */
export const 审计版本 = 1;
/** 链的起点；第一条记录的 prev 固定是这个字符串 */
export const 链头 = 'genesis';

const 规范 = (s) => String(s ?? '').toLowerCase().replace(/[\s\u3000，。、；：！？,.;:!?（）()【】\[\]"'“”‘’·|—\-_/\\§]/g, '');

/**
 * 条目指纹：内容规范化后的 sha256 前 16 位。
 * 用途：写入时记一次、压缩/归档后还能凭指纹找回这条记忆的来龙去脉。
 */
export function 条目指纹(文本) {
  return createHash('sha256').update(规范(文本)).digest('hex').slice(0, 16);
}

/** 稳定性：同一个体对象永远序列化成同一串（键序固定），否则链哈希不可复现 */
function 序列化(体) {
  const 键 = Object.keys(体).sort();
  return JSON.stringify(键.map((k) => [k, 体[k]]));
}

/** 记录体的 hash（链上的一环） */
export function 记录哈希(体) {
  return createHash('sha256').update(序列化(体)).digest('hex').slice(0, 24);
}

/**
 * 造一条记录体（不含 prev/hash/序，由 追加记录 补）。
 * @param {{动作:string, 目标?:string, 条目?:string, 条目摘要?:string, 前sha256?:string,
 *          后sha256?:string, 前字节?:number, 后字节?:number, 会话?:string, 依据?:string,
 *          备注?:string, 时间?:string}} 入参
 */
export function 审计体({
  动作, 目标 = '', 条目 = '', 条目摘要 = '', 前sha256 = '', 后sha256 = '',
  前字节 = 0, 后字节 = 0, 会话 = '', 依据 = '', 备注 = '', 时间 = '',
} = {}) {
  return {
    v: 审计版本,
    时间: 时间 || new Date().toISOString(),
    动作: String(动作 || 'unknown'),
    目标: String(目标 || ''),
    条目: String(条目 || ''),
    条目摘要: String(条目摘要 || '').replace(/\s+/g, ' ').slice(0, 60),
    前sha256: String(前sha256 || ''),
    后sha256: String(后sha256 || ''),
    前字节: Math.max(0, Number(前字节) || 0),
    后字节: Math.max(0, Number(后字节) || 0),
    会话: String(会话 || ''),
    依据: String(依据 || '').slice(0, 200),
    备注: String(备注 || '').slice(0, 300),
  };
}

/**
 * 往账本尾部追加一条记录：补 序 / prev / hash。
 * 纯函数：返回新数组，不改入参。
 */
export function 追加记录(记录们 = [], 体 = {}) {
  const 前一条 = 记录们.length ? 记录们[记录们.length - 1] : null;
  const prev = 前一条 && 前一条.hash ? 前一条.hash : 链头;
  const 带链 = { ...体, 序: 记录们.length + 1, prev };
  const 记录 = { ...带链, hash: 记录哈希(带链) };
  return [...记录们, 记录];
}

/**
 * 校验整条链：序连续、prev 对得上、hash 没被改。
 * @returns {{ok:boolean, 条数:number, 断点:number, 原因:string}}
 */
export function 校验链(记录们 = []) {
  let prev = 链头;
  for (let i = 0; i < 记录们.length; i++) {
    const r = 记录们[i] || {};
    if (r.序 !== i + 1) return { ok: false, 条数: 记录们.length, 断点: i + 1, 原因: `第 ${i + 1} 条序号是 ${r.序}（被删过或乱序）` };
    if ((r.prev || '') !== prev) return { ok: false, 条数: 记录们.length, 断点: i + 1, 原因: `第 ${i + 1} 条的 prev 与上一条对不上（中间被删或被换）` };
    const { hash, ...体 } = r;
    if (记录哈希(体) !== hash) return { ok: false, 条数: 记录们.length, 断点: i + 1, 原因: `第 ${i + 1} 条内容被改过（hash 不符）` };
    prev = hash;
  }
  return { ok: true, 条数: 记录们.length, 断点: 0, 原因: '' };
}

/** 凭指纹或原文找记录（原文会被算成指纹再比） */
export function 找记录(记录们 = [], 查询 = '') {
  const q = String(查询 || '').trim();
  if (!q) return [];
  const 指纹 = 条目指纹(q);
  return 记录们.filter((r) => {
    const 摘 = r.条目摘要 || '';
    return r.条目 === q || r.条目 === 指纹
      || (摘 && 摘.includes(q.slice(0, 20)))
      || (摘 && q.includes(摘)) // 反向包含：「改名后的新内容」能追到当初那条
      || (r.备注 || '').includes(q);
  });
}

/**
 * 账本摘要：给体检/面板用的一句话 + 动作计数。
 */
export function 账本概要(记录们 = []) {
  const 链 = 校验链(记录们);
  const 动作计数 = {};
  for (const r of 记录们) 动作计数[r.动作] = (动作计数[r.动作] || 0) + 1;
  const 说明 = 链.ok
    ? `账本 ${链.条数} 条，哈希链完整（可核对：改一行就会断链）`
    : `账本 ${链.条数} 条，**链在 #${链.断点} 断了**：${链.原因}`;
  return { 条数: 记录们.length, 链, 动作计数, 说明 };
}
