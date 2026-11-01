/**
 * 深鲸记忆 · 工作项（work items）
 *
 * 定位（2026-11-01 拍定）：**工单管「现在」，记忆管「以后」。**
 *   · 工作项 = 一个"正在做的事"：谁发起的、凭什么做（授权依据）、做到哪个阶段、卡在等谁、产出在哪。
 *   · 记忆   = 做成之后值得留下的结论：为什么这么做、踩了什么坑、用户的偏好。
 *   · 规则：工作项里**永不存**知识结论；结项时给的「教训」由本模块自动写入 MEMORY.md。
 *     （对应 dsh-superagent 的 Ticket/Mandate 思路，但只取最小集合，不引入 Policy/Subscription 等概念。）
 *
 * 存储：<记忆家>/work-items.json（与 MEMORY.md/USER.md 同根、明文、本地、不上传）
 * 写法：临时文件 + rename 原子替换；每次写入前备份到 archived/work-items.<时间>.bak（只留 20 份）。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, readdirSync, unlinkSync, copyFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export const 阶段们 = ['open', 'working', 'awaiting-person', 'awaiting-review', 'done', 'stopped', 'failed'];
export const 阶段中文 = {
  open: '待开工',
  working: '进行中',
  'awaiting-person': '等人工决定',
  'awaiting-review': '等评审',
  done: '已完成',
  stopped: '已停止',
  failed: '已失败',
};
export const 模式中文 = { observe: '观察（只记录）', auto: '执行（可动手）' };
const 结束阶段 = new Set(['done', 'stopped', 'failed']);

/** 允许的阶段迁移（覆盖全部合法路径；其余一律拒绝，避免状态乱跳） */
export const 允许迁移 = {
  open: ['working', 'awaiting-person', 'done', 'stopped', 'failed'],
  working: ['awaiting-person', 'awaiting-review', 'done', 'failed', 'stopped'],
  'awaiting-person': ['working', 'done', 'stopped', 'failed'],
  'awaiting-review': ['working', 'done', 'failed', 'stopped'],
  done: [],
  stopped: [],
  failed: ['working', 'done', 'stopped'], // 失败可重试；也可直接放弃/记为完成
};

/** 由宿主注入「写记忆」实现，避免 index.js ↔ works.js 循环依赖 */
let 写记忆实现 = null;
export function 注入记忆写入器(fn) {
  写记忆实现 = typeof fn === 'function' ? fn : null;
}

export function 工作项家() {
  return process.env.MEMORY_DOCTOR_HOME || join(homedir(), '.mnemon');
}
export function 工作项路径() {
  return join(工作项家(), 'work-items.json');
}
function 备份目录() {
  return join(工作项家(), 'archived');
}
const 时间 = () => new Date().toISOString().replace(/[:.]/g, '-');

function 备份() {
  const 文件 = 工作项路径();
  if (!existsSync(文件)) return '';
  try {
    mkdirSync(备份目录(), { recursive: true });
    const 目标 = join(备份目录(), `work-items.${时间()}.bak`);
    copyFileSync(文件, 目标);
    const 同类 = readdirSync(备份目录()).filter((n) => n.startsWith('work-items.') && n.endsWith('.bak')).sort();
    for (const 旧 of 同类.slice(0, Math.max(0, 同类.length - 20))) {
      try { unlinkSync(join(备份目录(), 旧)); } catch { /* 清理失败不影响写入 */ }
    }
    return 目标;
  } catch {
    return '';
  }
}

/** 读全部工作项（结构坏了就当空表，不让面板整个挂掉） */
export function 读工作项() {
  const 文件 = 工作项路径();
  if (!existsSync(文件)) return { version: 1, updatedAt: null, items: {} };
  try {
    const 数据 = JSON.parse(readFileSync(文件, 'utf8'));
    if (!数据 || typeof 数据 !== 'object' || typeof 数据.items !== 'object' || 数据.items === null) {
      return { version: 1, updatedAt: null, items: {} };
    }
    return { version: 1, updatedAt: 数据.updatedAt || null, items: 数据.items };
  } catch {
    return { version: 1, updatedAt: null, items: {} };
  }
}

function 写工作项(数据) {
  数据.version = 1;
  数据.updatedAt = new Date().toISOString();
  备份();
  mkdirSync(工作项家(), { recursive: true });
  const 临时 = `${工作项路径()}.tmp-${randomBytes(4).toString('hex')}`;
  writeFileSync(临时, JSON.stringify(数据, null, 2), 'utf8');
  renameSync(临时, 工作项路径());
  return 数据;
}

function 新编号() {
  const d = new Date();
  const 日 = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `wi-${日}-${randomBytes(2).toString('hex')}`;
}
const 现在 = () => new Date().toISOString();
const 文本 = (v, n = 400) => String(v ?? '').trim().slice(0, n);

/** 新建工作项。mode=observe 表示「只记录、不动手」（对应 superagent 的 observe 模式） */
export function 建工作项({ 标题, 来源 = 'agent', 会话 = '', 模式 = 'auto', 范围 = '', 授权依据 = '', 计划动作 = '', 链接 = [], 执行者 = '' } = {}) {
  const 名 = 文本(标题, 120);
  if (!名) return { ok: false, 错误: '标题不能为空' };
  if (!['observe', 'auto'].includes(模式)) return { ok: false, 错误: `未知模式：${模式}（只能是 observe / auto）` };
  const 数据 = 读工作项();
  const id = 新编号();
  数据.items[id] = {
    id,
    title: 名,
    source: 文本(来源, 80) || 'agent',
    sessionId: 文本(会话, 120),
    mode: 模式,
    stage: 'open',
    scope: 文本(范围, 400),
    mandate: 文本(授权依据, 400),
    plannedAction: 文本(计划动作, 800),
    links: Array.isArray(链接) ? 链接.map((x) => 文本(x, 300)).filter(Boolean).slice(0, 10) : [],
    // 执行者：谁在跑。空 = 还没人认领（「进行中」但没有 owner 就是假进度）
    owner: 文本(执行者, 120),
    createdAt: 现在(),
    updatedAt: 现在(),
    closedAt: null,
    history: [{ at: 现在(), from: null, to: 'open', note: '创建' }],
  };
  写工作项(数据);
  return { ok: true, item: 数据.items[id] };
}

export function 找工作项(id) {
  return 读工作项().items[文本(id, 60)] || null;
}

/** 更新描述性字段（标题/范围/授权依据/计划动作/链接）；不改阶段，阶段走 移阶段() */
export function 更新工作项(id, { 标题, 范围, 授权依据, 计划动作, 链接 } = {}) {
  const 数据 = 读工作项();
  const it = 数据.items[文本(id, 60)];
  if (!it) return { ok: false, 错误: '找不到这个工作项' };
  if (标题 !== undefined) {
    const 名 = 文本(标题, 120);
    if (!名) return { ok: false, 错误: '标题不能为空' };
    it.title = 名;
  }
  if (范围 !== undefined) it.scope = 文本(范围, 400);
  if (授权依据 !== undefined) it.mandate = 文本(授权依据, 400);
  if (计划动作 !== undefined) it.plannedAction = 文本(计划动作, 800);
  if (链接 !== undefined) it.links = Array.isArray(链接) ? 链接.map((x) => 文本(x, 300)).filter(Boolean).slice(0, 10) : it.links;
  it.updatedAt = 现在();
  写工作项(数据);
  return { ok: true, item: it };
}

/**
 * 移动阶段（唯一入口）。拒绝非法迁移，并把每次迁移写进 history。
 * 结束阶段（done/stopped/failed）会记 closedAt；failed 重新开工时清掉 closedAt。
 */
export function 移阶段(id, 目标阶段, 备注 = '') {
  const 数据 = 读工作项();
  const it = 数据.items[文本(id, 60)];
  if (!it) return { ok: false, 错误: '找不到这个工作项' };
  const 阶段 = 文本(目标阶段, 40);
  if (!阶段们.includes(阶段)) return { ok: false, 错误: `未知阶段：${阶段}` };
  if (it.stage === 阶段) return { ok: true, item: it, 说明: '阶段未变' };
  const 合法 = 允许迁移[it.stage] || [];
  if (!合法.includes(阶段)) {
    return { ok: false, 错误: `不能从「${阶段中文[it.stage] || it.stage}」直接到「${阶段中文[阶段] || 阶段}」` };
  }
  const 前 = it.stage;
  it.stage = 阶段;
  it.updatedAt = 现在();
  it.closedAt = 结束阶段.has(阶段) ? 现在() : null;
  it.history.push({ at: 现在(), from: 前, to: 阶段, note: 文本(备注, 300) });
  写工作项(数据);
  return { ok: true, item: it };
}

/**
 * 认领：给工作项指定执行者（谁在跑），没开工的顺带进入 working。
 * 为什么必须有：没有 owner 的「进行中」是假进度 —— 面板上看像有人在干，其实没人。
 */
export function 认领工作项(id, 执行者 = '', 备注 = '') {
  const 数据 = 读工作项();
  const it = 数据.items[文本(id, 60)];
  if (!it) return { ok: false, 错误: '找不到这个工作项' };
  const 人 = 文本(执行者, 120);
  if (!人) return { ok: false, 错误: '执行者不能为空（写会话/agent/人的名字）' };
  it.owner = 人;
  it.updatedAt = 现在();
  if (it.stage === 'open') {
    it.stage = 'working';
    it.closedAt = null;
    it.history.push({ at: 现在(), from: 'open', to: 'working', note: '认领：' + 人 + (备注 ? '（' + 文本(备注, 200) + '）' : '') });
  } else {
    it.history.push({ at: 现在(), from: it.stage, to: it.stage, note: '认领：' + 人 + (备注 ? '（' + 文本(备注, 200) + '）' : '') });
  }
  写工作项(数据);
  return { ok: true, item: it };
}

/** 观察 → 执行：人确认后才允许动手（不执行任何动作，只翻模式；这是 L2 的人工闸门） */
export function 确认工作项(id, 备注 = '') {
  const 数据 = 读工作项();
  const it = 数据.items[文本(id, 60)];
  if (!it) return { ok: false, 错误: '找不到这个工作项' };
  if (it.mode !== 'observe') return { ok: false, 错误: '只有观察（observe）模式的工作项需要确认' };
  it.mode = 'auto';
  it.updatedAt = 现在();
  it.history.push({ at: 现在(), from: it.stage, to: it.stage, note: '人工确认：允许执行' + (备注 ? '（' + 文本(备注, 200) + '）' : '') });
  写工作项(数据);
  return { ok: true, item: it };
}

/**
 * 结项：移到结束阶段，并把「教训」写进记忆（工单管现在，记忆管以后）。
 * @returns {{ok:boolean, item?:object, 记忆?:string, 错误?:string}}
 */
export function 结项工作项(id, { 结果 = 'done', 教训 = '', 备注 = '' } = {}) {
  if (!结束阶段.has(结果)) return { ok: false, 错误: `结果只能是 done / stopped / failed` };
  const 迁移 = 移阶段(id, 结果, 备注);
  if (!迁移.ok) return 迁移;
  const 结论 = 文本(教训, 500);
  let 记忆说明 = '';
  if (结论) {
    if (!写记忆实现) return { ok: true, item: 迁移.item, 记忆: '（未接入记忆写入器，教训未落盘）' };
    const r = 写记忆实现({ 目标: 'MEMORY.md', 内容: 结论 });
    记忆说明 = r && r.ok ? (r.说明 || '已写入记忆') : '写入记忆失败：' + ((r && r.错误) || '未知原因');
  }
  return { ok: true, item: 迁移.item, 记忆: 记忆说明 };
}

/** 列出工作项（按更新时间倒序） */
export function 列工作项({ 阶段, 模式, 只看未结束 = false, 限制 = 50 } = {}) {
  const 数据 = 读工作项();
  let 项 = Object.values(数据.items);
  if (阶段) 项 = 项.filter((x) => x.stage === 阶段);
  if (模式) 项 = 项.filter((x) => x.mode === 模式);
  if (只看未结束) 项 = 项.filter((x) => !结束阶段.has(x.stage));
  项.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return 项.slice(0, Math.max(1, Math.min(500, Number(限制) || 50)));
}

export function 统计工作项() {
  const 数据 = 读工作项();
  const 项 = Object.values(数据.items);
  const 按阶段 = {};
  for (const s of 阶段们) 按阶段[s] = 0;
  let 观察中 = 0;
  let 未认领 = 0;
  let 近七天成 = 0;
  const 七天前 = Date.now() - 7 * 24 * 3600 * 1000;
  for (const it of 项) {
    按阶段[it.stage] = (按阶段[it.stage] || 0) + 1;
    if (it.mode === 'observe' && !结束阶段.has(it.stage)) 观察中 += 1;
    if (!it.owner && !结束阶段.has(it.stage) && it.stage !== 'awaiting-person') 未认领 += 1;
    if (it.stage === 'done' && it.closedAt && Date.parse(it.closedAt) >= 七天前) 近七天成 += 1;
  }
  return {
    总数: 项.length,
    按阶段,
    进行中: 按阶段.open + 按阶段.working,
    待人工: 按阶段['awaiting-person'],
    待评审: 按阶段['awaiting-review'],
    观察中,
    未认领,
    近七天成,
    更新于: 数据.updatedAt,
  };
}
