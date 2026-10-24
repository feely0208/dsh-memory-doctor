// 深鲸记忆体检（dsh-memory-doctor）
// ------------------------------------------------------------------
// 定位：**不重造记忆引擎**，而是在「明文记忆」这套已经好用的底座上，补它没做的三件事：
//   ① 体检：膨胀 / 重复 / 低信息量 / 该归档的条目，一次说清
//   ② 瘦身：按建议归档（先备份、可回滚，绝不删）
//   ③ 记忆包：导出/导入（换机、团队共享、留档）
//
// 底座路径（默认）：~/.mnemon/runtime/{MEMORY.md,USER.md,memories.json,archived/}
// 全部本地明文，不联网、不上传。零依赖（只用 node 内置）。
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, renameSync, unlinkSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const ROUTE = '/dsh-memory-doctor';
const 包根 = join(dirname(fileURLToPath(import.meta.url)), '..');

// 记忆上限（与运行时记忆协议一致）
export const 上限 = { 'MEMORY.md': 10240, 'USER.md': 4096 };

export function 记忆家() {
  return process.env.MEMORY_DOCTOR_HOME || join(homedir(), '.mnemon');
}
export function 运行时目录() {
  return join(记忆家(), 'runtime');
}

/** 读一个记忆文件（不存在则空） */
export function 读文件(名) {
  const p = join(运行时目录(), 名);
  if (!existsSync(p)) return '';
  return readFileSync(p, 'utf8');
}

/** 按独立的 § 行拆条目（运行时记忆格式） */
export function 拆条目(文本) {
  const 行 = 文本.split('\n');
  const 条目 = [];
  let 当前 = [];
  const 收 = () => {
    const t = 当前.join('\n').trim();
    if (t) 条目.push(t);
    当前 = [];
  };
  for (const l of 行) {
    if (l.trim() === '§') { 收(); continue; }
    当前.push(l);
  }
  收();
  return 条目;
}

const 字节 = (s) => Buffer.byteLength(s, 'utf8');
const 归一 = (s) => s.toLowerCase().replace(/[\s\u3000，。、；：！？,.;:!?（）()【】\[\]"'“”‘’·|—\-_/\\]/g, '');

/** 3-gram Jaccard 相似度（近重复检测；无依赖） */
function 相似(a, b) {
  const A = new Set(), B = new Set();
  for (let i = 0; i < a.length - 2; i++) A.add(a.slice(i, i + 3));
  for (let i = 0; i < b.length - 2; i++) B.add(b.slice(i, i + 3));
  if (!A.size || !B.size) return 0;
  let 交 = 0;
  for (const x of A) if (B.has(x)) 交++;
  return 交 / (A.size + B.size - 交);
}

// 归档词：只标“真·临时/进度”语义。⚠️ “一次性”曾在「掘金/知乎一次性占位」上误报，已移除。
const 归档词 = /(临时|暂存|进度|今天|昨天|刚才|正在|TODO|待办|下一步|回头|稍后)/i;

/** 体检：对 MEMORY.md / USER.md 各做一遍 */
export function 体检(选项 = {}) {
  const 近重复阈值 = 选项.近重复阈值 ?? 0.82;
  const 结果 = { 家目录: 记忆家(), 文件: {}, 条目: [], 建议: [], 摘要: {} };

  for (const 名 of ['MEMORY.md', 'USER.md']) {
    const 文本 = 读文件(名);
    const 条目们 = 拆条目(文本);
    const 大小 = 字节(文本);
    const 限 = 上限[名];
    const 档 = {
      大小, 上限: 限, 余量: 限 - 大小, 百分比: Math.round((大小 / 限) * 100),
      条目数: 条目们.length, 最长条目字节: 条目们.reduce((m, t) => Math.max(m, 字节(t)), 0),
    };
    结果.文件[名] = 档;
    if (大小 > 限 * 0.85) 结果.建议.push(`${名} 已用 ${档.百分比}%（${大小}/${限} 字节）→ 建议瘦身，否则会触发自动归档`);

    条目们.forEach((t, i) => {
      const e = {
        文件: 名, 序号: i + 1, 字节: 字节(t),
        摘要: t.replace(/\s+/g, ' ').slice(0, 60),
        全文: t,
        标记: [],
      };
      if (字节(t) < 40) e.标记.push('低信息量');
      if (归档词.test(t)) e.标记.push('可归档(临时/进度类)');
      结果.条目.push(e);
    });
  }

  // 重复 / 近重复（同一文件内 + 跨文件）
  const 全部 = 结果.条目.map((e, idx) => ({ e, idx, 归一: 归一((e.文件 === 'MEMORY.md' ? 读文件('MEMORY.md') : 读文件('USER.md'))) }));
  // 为省比较成本：用每条自己的文本重算
  const 文本们 = [];
  for (const e of 结果.条目) {
    const 源 = e.文件 === 'MEMORY.md' ? 读文件('MEMORY.md') : 读文件('USER.md');
    const 条 = 拆条目(源)[e.序号 - 1] || '';
    文本们.push({ e, 原文: 条, 归: 归一(条) });
  }
  const 标记重复 = (i, 类) => { if (!文本们[i].e.标记.includes(类)) 文本们[i].e.标记.push(类); };
  for (let i = 0; i < 文本们.length; i++) {
    for (let j = i + 1; j < 文本们.length; j++) {
      if (文本们[i].归 && 文本们[i].归 === 文本们[j].归) { 标记重复(i, '重复'); 标记重复(j, '重复'); continue; }
      if (文本们[i].归.length > 30 && 文本们[j].归.length > 30 && 相似(文本们[i].归, 文本们[j].归) >= 近重复阈值) {
        标记重复(i, '近重复'); 标记重复(j, '近重复');
      }
    }
  }

  // 汇总
  const 标记计数 = {};
  for (const e of 结果.条目) for (const m of e.标记) 标记计数[m] = (标记计数[m] || 0) + 1;
  结果.摘要 = {
    总条目: 结果.条目.length,
    标记计数,
    MEMORY百分比: 结果.文件['MEMORY.md'].百分比,
    USER百分比: 结果.文件['USER.md'].百分比,
  };
  // 建议补全
  if (标记计数['重复'] || 标记计数['近重复']) 结果.建议.push(`发现重复/近重复 ${(标记计数['重复'] || 0) + (标记计数['近重复'] || 0)} 条 → 建议合并`);
  if (标记计数['低信息量']) 结果.建议.push(`低信息量 ${标记计数['低信息量']} 条（<40 字节）→ 建议合并或删`);
  if (标记计数['可归档(临时/进度类)']) 结果.建议.push(`临时/进度类 ${标记计数['可归档(临时/进度类)']} 条 → 建议归档到 archived/`);
  if (!结果.建议.length) 结果.建议.push('状态健康：没有明显膨胀或重复');
  return 结果;
}

/** 瘦身：把指定条目归档（先备份原文件，绝不删除内容） */
export function 瘦身({ 文件 = 'MEMORY.md', 序号们 = [], 确认 = false } = {}) {
  if (!确认) return { ok: false, 错误: '需要确认：先看清要归档哪几条，再带 确认=true 调用' };
  if (!序号们.length) return { ok: false, 错误: '没有指定要归档的条目' };
  const 原 = 读文件(文件);
  if (!原) return { ok: false, 错误: `文件不存在或为空：${文件}` };
  const 条目们 = 拆条目(原);
  const 选 = [...new Set(序号们.map(Number).filter((n) => n >= 1 && n <= 条目们.length))].sort((a, b) => a - b);
  if (!选.length) return { ok: false, 错误: '序号全部越界' };

  const 归档目录 = join(运行时目录(), 'archived');
  mkdirSync(归档目录, { recursive: true });
  const 时间 = new Date().toISOString().replace(/[:.]/g, '-');
  const 备份 = join(归档目录, `${basename(文件)}.${时间}.bak`);
  copyFileSync(join(运行时目录(), 文件), 备份);

  const 移出 = 选.map((n) => 条目们[n - 1]);
  const 留下 = 条目们.filter((_, i) => !选.includes(i + 1));
  // 归档成一个文件，便于日后翻查
  const 归档文件 = join(归档目录, `${basename(文件)}.${时间}.归档.md`);
  writeFileSync(归档文件, 移出.join('\n§\n'), 'utf8');

  const 新文本 = 留下.length ? 留下.join('\n§\n') + '\n' : '';
  writeFileSync(join(运行时目录(), 文件), 新文本, 'utf8');

  return {
    ok: true, 文件, 归档条数: 移出.length,
    之前字节: 字节(原), 之后字节: 字节(新文本), 省下字节: 字节(原) - 字节(新文本),
    备份, 归档文件,
    说明: '原内容已归档（不是删除），可随时从 archived/ 取回；备份也在 archived/',
  };
}

/** 导出记忆包（换机/团队共享/留档） */
export function 导出记忆包() {
  const 日期 = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const 目标 = join(记忆家(), `记忆包-${日期}-${Date.now().toString(36)}`);
  mkdirSync(目标, { recursive: true });
  const 清单 = { 导出时间: new Date().toISOString(), 来源: 记忆家(), 文件: {} };
  for (const 名 of ['MEMORY.md', 'USER.md', 'memories.json']) {
    const p = join(运行时目录(), 名);
    if (existsSync(p)) {
      copyFileSync(p, join(目标, 名));
      清单.文件[名] = { 字节: statSync(p).size, 条目数: 名.endsWith('.md') ? 拆条目(readFileSync(p, 'utf8')).length : undefined };
    }
  }
  // 文档目录一并带走（如果存在）
  const 文档 = join(记忆家(), 'documents');
  if (existsSync(文档)) {
    try {
      execFileSync('cp', ['-R', 文档, join(目标, 'documents')]);
      清单.文件['documents/'] = { 字节: 0 };
    } catch { /* 复制失败不阻断 */ }
  }
  let git版本 = '';
  try { git版本 = execFileSync('git', ['-C', 记忆家(), 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { }
  清单.git版本 = git版本 || '(无 git)';
  writeFileSync(join(目标, 'manifest.json'), JSON.stringify(清单, null, 2), 'utf8');
  return { ok: true, 目录: 目标, 清单 };
}

/** 导入记忆包：合并未出现过的条目（不覆盖现有内容） */
export function 导入记忆包({ 目录, 确认 = false } = {}) {
  if (!目录) return { ok: false, 错误: '需要提供记忆包目录' };
  if (!确认) return { ok: false, 错误: '需要确认：导入是追加合并，请确认目录无误后再带 确认=true' };
  const 清单路径 = join(目录, 'manifest.json');
  if (!existsSync(清单路径)) return { ok: false, 错误: '不是有效的记忆包（缺 manifest.json）' };
  const 结果 = { ok: true, 合并: {} };
  for (const 名 of ['MEMORY.md', 'USER.md']) {
    const 源 = join(目录, 名);
    if (!existsSync(源)) continue;
    const 新条目 = 拆条目(readFileSync(源, 'utf8'));
    const 现有 = 拆条目(读文件(名));
    const 现有归 = new Set(现有.map(归一));
    const 要加 = 新条目.filter((t) => !现有归.has(归一(t)));
    if (要加.length) {
      const 合并后 = [...现有, ...要加];
      writeFileSync(join(运行时目录(), 名), 合并后.join('\n§\n') + '\n', 'utf8');
    }
    结果.合并[名] = { 新增: 要加.length, 跳过重复: 新条目.length - 要加.length };
  }
  return 结果;
}

/** 目录递归大小（字节）与文件数；目录不存在返回 0 */
function 目录统计(dir) {
  let 字节数 = 0, 文件数 = 0;
  const 走 = (d) => {
    let 项;
    try { 项 = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const it of 项) {
      const p = join(d, it.name);
      if (it.isDirectory()) 走(p);
      else if (it.isFile()) {
        try { 字节数 += statSync(p).size; 文件数++; } catch { /* 跳过读不到的 */ }
      }
    }
  };
  走(dir);
  return { 字节: 字节数, 文件数 };
}

/** 检测 profile 里装着哪些「别的记忆插件」（只读探测，用于共存提示） */
export function 检测其他记忆插件() {
  const out = [];
  try {
    const dshHome = join(包根, '..', '..');
    const profiles = join(dshHome, 'profiles');
    for (const name of readdirSync(profiles)) {
      let pj;
      try { pj = JSON.parse(readFileSync(join(profiles, name, 'package.json'), 'utf8')); } catch { continue; }
      const bundles = pj?.dsh?.profile?.bundles || [];
      const deps = Object.keys(pj?.dependencies || {});
      for (const pkg of new Set([...bundles, ...deps])) {
        if (pkg === 'dsh-memory-doctor') continue;
        if (!/memory|mnemon/i.test(pkg)) continue;
        let version = '';
        try { version = JSON.parse(readFileSync(join(profiles, name, 'node_modules', pkg, 'package.json'), 'utf8')).version || ''; } catch { /* 可能没装到 node_modules */ }
        out.push({ 包: pkg, 版本: version, profile: name, 启用: bundles.includes(pkg) });
      }
    }
  } catch { /* 非桌面环境 */ }
  return out;
}

/** 读历史快照（每次体检追加一条，保留最近 30 条） */
export function 历史快照() {
  const f = join(记忆家(), 'doctor-history.json');
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return []; }
}
function 条目指纹() {
  const 出 = [];
  for (const 文件 of ['MEMORY.md', 'USER.md']) {
    拆条目(读文件(文件)).forEach((t) => {
      出.push({ k: createHash('sha1').update(文件 + '\n' + 归一文本(t)).digest('hex').slice(0, 12), 文件, 摘要: t.replace(/\s+/g, ' ').slice(0, 80) });
    });
  }
  return 出;
}
function 记录历史(快照) {
  const 家 = 记忆家();
  try {
    mkdirSync(家, { recursive: true });
    const 历史 = 历史快照();
    快照.指纹 = 条目指纹();
    历史.push(快照);
    const 保留 = 历史.slice(-30);
    writeFileSync(join(家, 'doctor-history.json'), JSON.stringify(保留, null, 2), 'utf8');
    return 保留;
  } catch { return 历史; }
}

/** 与上一次体检相比：新增 / 移除 的记忆条目 */
export function 对比上次() {
  const 历史 = 历史快照();
  if (历史.length < 2) return { ok: true, 可用: false };
  const 上次 = 历史[历史.length - 2];
  const 本次 = 历史[历史.length - 1];
  const 上次K = new Set((上次.指纹 || []).map((x) => x.k));
  const 本次K = new Set((本次.指纹 || []).map((x) => x.k));
  return {
    ok: true, 可用: true, 上次时间: 上次.时间,
    新增: (本次.指纹 || []).filter((x) => !上次K.has(x.k)),
    移除: (上次.指纹 || []).filter((x) => !本次K.has(x.k)),
  };
}

/** 从 session 事件流里取某条 assistant 消息的纯文本（给「存入记忆」用） */
export function 提取回复文本(事件们, messageId) {
  for (const e of (事件们 || [])) {
    if (e?.type !== 'assistant/message') continue;
    const m = e.data?.message;
    if (!m || typeof m !== 'object' || m.id !== messageId) continue;
    const blocks = Array.isArray(m.content) ? m.content : [];
    const text = blocks.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => String(b.text)).join('\n\n').trim();
    return text || null;
  }
  return null;
}

/** 诊断：面板「状态 / 存储 / 来源 / 历史」用的结构化数据 */
export function 诊断() {
  const 家 = 记忆家();
  const 运行时 = join(家, 'runtime');
  const 归档 = join(运行时, 'archived');
  const 文档 = join(家, 'documents');
  const 记忆包们 = (() => {
    try { return readdirSync(家).filter((n) => n.startsWith('记忆包-') && statSync(join(家, n)).isDirectory()); } catch { return []; }
  })();
  let 版本 = '';
  try { 版本 = JSON.parse(readFileSync(join(包根, 'package.json'), 'utf8')).version || ''; } catch { /* ignore */ }
  return {
    插件: { 名称: 'dsh-memory-doctor', 版本 },
    注入: 注入是否开启(),
    其他记忆插件: 检测其他记忆插件(),
    存储: {
      根: 家,
      运行时: { 路径: 运行时, ...目录统计(运行时) },
      归档: { 路径: 归档, ...目录统计(归档) },
      文档: { 路径: 文档, 存在: existsSync(文档), ...目录统计(文档) },
      记忆包: { 数量: 记忆包们.length, 最近: 记忆包们.sort().slice(-1)[0] || '' },
    },
    历史: 历史快照(),
  };
}

/** 写入/读取面板开关（~/.mnemon/doctor.json） */
export function 读配置() {
  try { return JSON.parse(readFileSync(join(记忆家(), 'doctor.json'), 'utf8')); } catch { return {}; }
}
export function 写配置(补丁 = {}) {
  const 家 = 记忆家();
  mkdirSync(家, { recursive: true });
  const 新 = { ...读配置(), ...补丁 };
  writeFileSync(join(家, 'doctor.json'), JSON.stringify(新, null, 2) + '\n', 'utf8');
  return 新;
}

/** 导出 Markdown 诊断报告到 ~/.mnemon/报告/ */
export function 导出诊断报告() {
  const r = 体检();
  const d = 诊断();
  const 目录 = join(记忆家(), '报告');
  mkdirSync(目录, { recursive: true });
  const 日期 = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const 路径 = join(目录, `诊断-${日期}.md`);
  const 行 = [];
  行.push('# 深鲸记忆 · 诊断报告', '', `生成时间：${new Date().toLocaleString()}`, '');
  行.push('## 用量', '');
  for (const [名, 档] of Object.entries(r.文件)) 行.push(`- ${名}：${档.大小}/${档.上限} 字节（${档.百分比}%，${档.条目数} 条）`);
  行.push('', '## 建议', '');
  for (const s of r.建议) 行.push(`- ${s}`);
  行.push('', '## 存储', '');
  行.push(`- 记忆根：\`${d.存储.根}\``);
  行.push(`- 运行时记忆：${d.存储.运行时.文件数} 个文件，${d.存储.运行时.字节} 字节`);
  行.push(`- 归档与备份：${d.存储.归档.文件数} 份，${d.存储.归档.字节} 字节`);
  行.push(`- 记忆包：${d.存储.记忆包.数量} 份`);
  行.push('', '## 标记统计', '');
  for (const [k, v] of Object.entries(r.摘要.标记计数)) 行.push(`- ${k}：${v}`);
  writeFileSync(路径, 行.join('\n') + '\n', 'utf8');
  return { ok: true, 路径 };
}

// ── 记忆读写（供面板 / memory 工具共用；写前备份、超限拒绝、去重）────────
const 归一文本 = (t) => String(t).toLowerCase().replace(/[\s\u3000，。、；：！？,.;:!?（）()【】\[\]"'“”‘’·|—\-_/\\]/g, '');

function 备份文件(文件) {
  const 归档目录 = join(运行时目录(), 'archived');
  mkdirSync(归档目录, { recursive: true });
  const 时间 = new Date().toISOString().replace(/[:.]/g, '-');
  const 目标 = join(运行时目录(), basename(文件));
  if (!existsSync(目标)) return '';
  const 备份 = join(归档目录, `${basename(文件)}.${时间}.bak`);
  copyFileSync(目标, 备份);
  // 只留最近 20 份同类备份，避免无限膨胀
  try {
    const 同类 = readdirSync(归档目录).filter((n) => n.startsWith(basename(文件) + '.') && n.endsWith('.bak')).sort();
    for (const 旧 of 同类.slice(0, Math.max(0, 同类.length - 20))) {
      try { unlinkSync(join(归档目录, 旧)); } catch { /* 清理失败保留现场 */ }
    }
  } catch { /* 清理失败不影响写入 */ }
  return 备份;
}
function 跳过前缀(n) { return n; }

/** 追加一条记忆；返回 {ok, 说明, 备份?, 条数} */
export function 写记忆({ 目标 = 'MEMORY.md', 内容 }) {
  const 文本 = String(内容 || '').trim();
  if (!文本) return { ok: false, 错误: '内容为空' };
  const 限 = 上限[目标];
  if (!限) return { ok: false, 错误: `未知记忆文件：${目标}` };
  const 现有 = 读文件(目标);
  const 条目们 = 拆条目(现有);
  const 归 = new Set(条目们.map(归一文本));
  if (归.has(归一文本(文本))) return { ok: true, 说明: '已存在相同条目，跳过（去重）', 条数: 条目们.length };
  const 新 = [...条目们, 文本].join('\n§\n') + '\n';
  const 字节数 = 字节(新);
  if (字节数 > 限) {
    return { ok: false, 错误: `${目标} 会超上限（${字节数}/${限} 字节）：先归档/合并旧条目，或把这条写短一点` };
  }
  const 备份 = 备份文件(目标);
  writeFileSync(join(运行时目录(), 目标), 新, 'utf8');
  return { ok: true, 说明: `已追加 1 条（现 ${条目们.length + 1} 条，${字节数}/${限} 字节）`, 备份, 条数: 条目们.length + 1 };
}

/** 替换一条（按 old_text 唯一匹配） */
export function 改记忆({ 目标 = 'MEMORY.md', 旧文本, 内容 }) {
  const 现 = 读文件(目标);
  const 条目们 = 拆条目(现);
  const 命中 = 条目们.map((t, i) => ({ t, i })).filter((x) => x.t.includes(旧文本 || ''));
  if (!旧文本) return { ok: false, 错误: '缺 old_text（要替换哪条）' };
  if (命中.length === 0) return { ok: false, 错误: '没有条目包含 old_text' };
  if (命中.length > 1) return { ok: false, 错误: `old_text 命中 ${命中.length} 条，请写得更具体` };
  const 新条目们 = [...条目们];
  新条目们[命中[0].i] = String(内容 || '').trim();
  const 新 = 新条目们.filter(Boolean).join('\n§\n') + '\n';
  if (字节(新) > 上限[目标]) return { ok: false, 错误: '替换后超上限，请先归档' };
  const 备份 = 备份文件(目标);
  writeFileSync(join(运行时目录(), 目标), 新, 'utf8');
  return { ok: true, 说明: `已替换 1 条（现 ${字节(新)}/${上限[目标]} 字节）`, 备份 };
}

/** 归档一条（按 old_text 匹配；移到 archived/，不删除） */
export function 归档一条({ 目标 = 'MEMORY.md', 旧文本 }) {
  const 条目们 = 拆条目(读文件(目标));
  const 命中 = 条目们.map((t, i) => ({ t, i })).filter((x) => x.t.includes(旧文本 || ''));
  if (!旧文本) return { ok: false, 错误: '缺 old_text（要归档哪条）' };
  if (命中.length === 0) return { ok: false, 错误: '没有条目包含 old_text' };
  if (命中.length > 1) return { ok: false, 错误: `old_text 命中 ${命中.length} 条，请写得更具体` };
  return 瘦身({ 文件: 目标, 序号们: [命中[0].i + 1], 确认: true });
}

/** 搜索条目 */
export function 搜记忆(关键词) {
  const 词 = String(关键词 || '').toLowerCase();
  const 出 = [];
  for (const 文件 of ['MEMORY.md', 'USER.md']) {
    const 条目们 = 拆条目(读文件(文件));
    条目们.forEach((t, i) => { if (!词 || t.toLowerCase().includes(词)) 出.push({ 文件, 序号: i + 1, 文本: t, 字节: 字节(t) }); });
  }
  return 出;
}

/** 文档（只读）：列出 ~/.mnemon/documents 下的 md 文件 */
export function 文档列表() {
  const 根 = join(记忆家(), 'documents');
  const 出 = [];
  const 走 = (d, 相对) => {
    let 项;
    try { 项 = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const it of 项) {
      if (it.name.startsWith('.')) continue;
      const p = join(d, it.name);
      const rel = 相对 ? 相对 + '/' + it.name : it.name;
      if (it.isDirectory()) 走(p, rel);
      else if (/\.md$/i.test(it.name)) {
        try { const st = statSync(p); 出.push({ 路径: rel, 字节: st.size, 修改时间: st.mtime.toISOString() }); } catch { /* skip */ }
      }
    }
  };
  走(根, '');
  出.sort((a, b) => (a.修改时间 < b.修改时间 ? 1 : -1));
  return { ok: true, 根, 存在: existsSync(根), 文件: 出 };
}

/** 读一篇文档（限制在 documents 根内，防目录穿越） */
export function 读文档(相对) {
  const 根 = join(记忆家(), 'documents');
  const 目标 = join(根, String(相对 || ''));
  if (!目标.startsWith(根 + '/') && 目标 !== 根) return { ok: false, 错误: '路径不合法' };
  if (!existsSync(目标)) return { ok: false, 错误: '文档不存在' };
  try {
    const st = statSync(目标);
    if (!st.isFile() || !/\.md$/i.test(目标)) return { ok: false, 错误: '只支持 Markdown 文档' };
    return { ok: true, 路径: String(相对), 内容: readFileSync(目标, 'utf8'), 字节: st.size, 修改时间: st.mtime.toISOString() };
  } catch (e) { return { ok: false, 错误: String(e && e.message || e) }; }
}

/** 归档列表：archived/ 下的备份与归档文件（给面板「归档」页） */
export function 归档列表() {
  const dir = join(运行时目录(), 'archived');
  if (!existsSync(dir)) return { ok: true, 目录: dir, 文件: [] };
  const 文件 = [];
  for (const 名 of readdirSync(dir)) {
    const p = join(dir, 名);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (!st.isFile()) continue;
    const 类型 = 名.endsWith('.bak') ? '备份' : 名.endsWith('.归档.md') ? '归档条目' : '其他';
    文件.push({ 名, 类型, 字节: st.size, 修改时间: st.mtime.toISOString() });
  }
  文件.sort((a, b) => (a.修改时间 < b.修改时间 ? 1 : -1));
  return { ok: true, 目录: dir, 文件 };
}

/** 恢复一个备份到运行时文件（先给当前文件再做一份安全备份，绝不静默丢内容） */
export function 恢复归档({ 归档文件名, 文件, 确认 = false } = {}) {
  if (!归档文件名) return { ok: false, 错误: '需要提供归档文件名' };
  if (!文件) return { ok: false, 错误: '需要指定恢复到哪个文件（MEMORY.md / USER.md）' };
  if (!确认) return { ok: false, 错误: '需要确认：恢复会用归档覆盖当前文件，请确认后再带 确认=true' };
  const 源 = join(运行时目录(), 'archived', 归档文件名);
  if (!existsSync(源)) return { ok: false, 错误: `归档文件不存在：${归档文件名}` };
  const 目标 = join(运行时目录(), basename(文件));
  const 归档目录 = join(运行时目录(), 'archived');
  mkdirSync(归档目录, { recursive: true });
  const 时间 = new Date().toISOString().replace(/[:.]/g, '-');
  if (existsSync(目标)) copyFileSync(目标, join(归档目录, `${basename(文件)}.${时间}.恢复前.bak`));
  copyFileSync(源, 目标);
  return { ok: true, 文件: 目标, 来源: 源, 字节: statSync(目标).size, 说明: '已恢复；恢复前的当前内容另存了一份 .恢复前.bak' };
}

/** 纯文本摘要（给 /记忆 命令用） */
export function 摘要文本(r) {
  const 行 = [];
  行.push(`深鲸记忆体检 · ${r.家目录}`);
  for (const [名, 档] of Object.entries(r.文件)) {
    行.push(`  ${名}: ${档.大小}/${档.上限} 字节（${档.百分比}%，${档.条目数} 条）`);
  }
  行.push(`  标记：${Object.entries(r.摘要.标记计数).map(([k, v]) => `${k} ${v}`).join(' · ') || '无'}`);
  for (const s of r.建议) 行.push(`  → ${s}`);
  return 行.join('\n');
}

/** 热记忆：每轮塞进 system prompt 的记忆正文（没人写就是空，不占预算） */
export function 热记忆文本(选项 = {}) {
  const 预算 = 选项.预算 || 6000; // 本段最多占多少字符，防止把上下文吃光
  const 块 = [];
  const 源 = [
    ['MEMORY.md', '项目 / 环境记忆'],
    ['USER.md', '用户画像'],
  ];
  for (const [名, 标题] of 源) {
    const 文本 = 读文件(名).trim();
    if (!文本) continue;
    块.push(`## ${标题}（${名}）\n${文本}`);
  }
  if (!块.length) return '';
  let 正文 = 块.join('\n\n');
  if (正文.length > 预算) 正文 = 正文.slice(0, 预算) + '\n…（记忆过长，已截断；请用「记忆体检」归档旧条目）';

  const 目录 = 运行时目录();
  const 协议 = [
    '',
    '## 记忆维护协议（dsh-memory-doctor）',
    `- 记忆文件：\`${目录}/MEMORY.md\`（上限 ${上限['MEMORY.md']} 字节）、\`${目录}/USER.md\`（上限 ${上限['USER.md']} 字节）`,
    '- 写入：优先用 `memory` 工具（action=append/replace/remove/search/stats）；也可直接改文件；条目之间用单独一行 `§` 分隔；已有的别重复写',
    '- 该写：用户明确的偏好/纠正、项目稳定事实、决策与理由、可复用教训',
    '- 不该写：临时进度、一次性任务、问句、猜测、随手可查的东西',
    '- 预算：接近 90% 时先合并/归档旧条目（面板「记忆体检」可一键归档，不删除）',
  ].join('\n');
  return 正文 + 协议;
}

const 回 = (res, code, obj) => {
  const 体 = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(体) });
  res.end(体);
};

async function 读请求体(req) {
  const 块 = [];
  for await (const c of req) 块.push(c);
  const 文 = Buffer.concat(块).toString('utf8');
  return 文 ? JSON.parse(文) : {};
}

/**
 * 是否开启「每轮热记忆注入」。
 * 优先级：MEMORY_DOCTOR_INJECT=0/1（显式）> ~/.mnemon/doctor.json {inject:true/false} >
 * 自动让位：dsh-home/profiles/* 里出现别的记忆插件（如 dsh-mnemon）→ 默认不注入，只做体检。
 * 这样和别的记忆插件共存时不会重复注入，用户也不会被两份记忆打架。
 */
export function 注入是否开启() {
  const env = process.env.MEMORY_DOCTOR_INJECT;
  if (env === '0') return false;
  if (env === '1') return true;
  try {
    const cfg = JSON.parse(readFileSync(join(记忆家(), 'doctor.json'), 'utf8'));
    if (cfg && typeof cfg.inject === 'boolean') return cfg.inject;
  } catch {
    /* 没有配置文件就继续判断 */
  }
  try {
    const dshHome = join(包根, '..', '..');
    const profiles = join(dshHome, 'profiles');
    for (const name of readdirSync(profiles)) {
      const pj = JSON.parse(readFileSync(join(profiles, name, 'package.json'), 'utf8'));
      // 只认「已启用」的 bundles：装了但停用（还在 dependencies 里）不算占用注入
      const bundles = pj?.dsh?.profile?.bundles || [];
      if (bundles.includes('dsh-mnemon')) return false;
    }
  } catch {
    /* 读不到 profile（非桌面环境）：按开启处理 */
  }
  return true;
}

export const inject = ['commands', 'webServer', 'tools', 'agents'];

export function apply(ctx) {
  // ① 热记忆：每轮 system prompt 里带上一段「记忆正文 + 维护协议」
  //    MEMORY_DOCTOR_INJECT=0 可关掉注入（和别的记忆插件同时装时用，避免重复注入）
  try {
    if (注入是否开启() && typeof ctx.inject === 'function') {
      ctx.inject(['systemPrompt'], (prompted) => {
        const sp = prompted && typeof prompted.get === 'function' ? prompted.get('systemPrompt') : prompted;
        if (sp && typeof sp.section === 'function') {
          sp.section({
            name: 'dsh-memory-doctor:hot-memory',
            order: 120,
            text: () => 热记忆文本(),
          });
        }
      });
    }
  } catch (e) {
    // 注入失败不影响体检/面板
  }

  // 命令：/记忆 —— 一句话看记忆健康度
  if (ctx.commands && typeof ctx.commands.register === 'function') {
    ctx.commands.register({
      name: 'memory',
      description: '深鲸记忆体检：看记忆膨胀/重复/该归档的条目（/memory）',
      handler: () => 摘要文本(体检()),
    });
  }

  // 工具：memory（DSH 工具总线；没有 tools 服务时静默跳过）
  if (ctx.tools && typeof ctx.tools.register === 'function') {
    const 注册工具 = async () => {
      try {
        const { defineTool } = await import('@deepseek-ai/dsh-tools');
        const 文本输出 = { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] };
        ctx.tools.register(defineTool({
          name: 'memory',
          description: '读写深鲸记忆（MEMORY.md 项目/环境记忆、USER.md 用户画像）。action=read 查看；append 追加（自动去重、写前备份、超上限拒绝）；replace 按 old_text 唯一匹配替换；remove 按 old_text 归档（不删除）；search 搜索；stats 看用量。',
          parameters: {
            action: { type: 'string', description: 'read | append | replace | remove | search | stats', required: true },
            target: { type: 'string', description: 'memory（默认）| user' },
            content: { type: 'string', description: 'append/replace 的新内容' },
            old_text: { type: 'string', description: 'replace/remove 用于定位旧条目的唯一片段' },
            query: { type: 'string', description: 'search 关键词' },
          },
          output: 文本输出,
          isConcurrencySafe: () => false,
          timeoutMs: 30_000,
          execute: async (args) => {
            const 目标 = args?.target === 'user' ? 'USER.md' : 'MEMORY.md';
            const 动作 = args?.action;
            if (动作 === 'read' || 动作 === 'stats') {
              const r = 体检();
              const 行 = [`记忆用量（${目标 === 'USER.md' ? 'USER' : 'MEMORY'} 视角）`];
              for (const [名, 档] of Object.entries(r.文件)) 行.push(`- ${名}：${档.大小}/${档.上限} 字节（${档.百分比}%，${档.条目数} 条）`);
              行.push('', '标记：' + (Object.entries(r.摘要.标记计数).map(([k, v]) => `${k} ${v}`).join(' · ') || '无'));
              for (const s of r.建议) 行.push('- ' + s);
              return 行.join('\n');
            }
            if (动作 === 'search') {
              const 命中 = 搜记忆(args?.query || '');
              if (!命中.length) return '没有匹配的记忆条目';
              return 命中.map((x) => `${x.文件} #${x.序号}：${x.文本.slice(0, 120)}`).join('\n');
            }
            if (动作 === 'append') {
              const r = 写记忆({ 目标, 内容: args?.content });
              return r.ok ? r.说明 : '失败：' + r.错误;
            }
            if (动作 === 'replace') {
              const r = 改记忆({ 目标, 旧文本: args?.old_text, 内容: args?.content });
              return r.ok ? r.说明 : '失败：' + r.错误;
            }
            if (动作 === 'remove') {
              const r = 归档一条({ 目标, 旧文本: args?.old_text });
              return r.ok ? `已归档 1 条（${r.归档条数} 条到 ${r.归档文件}）` : '失败：' + r.错误;
            }
            return '未知 action，可用：read / append / replace / remove / search / stats';
          },
          presentCall: (args) => ({ card: 'generic', kind: args?.action === 'read' || args?.action === 'search' || args?.action === 'stats' ? 'read' : 'write', title: `深鲸记忆 · ${args?.action || ''}` }),
        }));
      } catch (e) {
        // 没有 @deepseek-ai/dsh-tools（非完整宿主）时不影响面板/体检
      }
    };
    注册工具();
  }

  // HTTP：面板用
  if (ctx.webServer && typeof ctx.webServer.register === 'function') {
    const handler = async (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      const p = u.pathname;
      try {
        if (p === `${ROUTE}/api/audit` && req.method === 'GET') {
          const 结果 = 体检();
          const 对比 = 对比上次();
          记录历史({ 时间: new Date().toISOString(), MEMORY字节: 结果.文件['MEMORY.md'].大小, USER字节: 结果.文件['USER.md'].大小, 条目数: 结果.摘要.总条目, 标记计数: 结果.摘要.标记计数 });
          return 回(res, 200, { ok: true, 体检: 结果, 诊断: 诊断(), 对比 });
        }
        if (p === `${ROUTE}/api/config` && req.method === 'GET') return 回(res, 200, { ok: true, 配置: 读配置(), 注入: 注入是否开启() });
        if (p === `${ROUTE}/api/config` && req.method === 'POST') {
          const b = await 读请求体(req);
          const 补丁 = {};
          if (typeof b.inject === 'boolean') 补丁.inject = b.inject;
          const 新 = 写配置(补丁);
          return 回(res, 200, { ok: true, 配置: 新, 注入: 注入是否开启() });
        }
        if (p === `${ROUTE}/api/report` && req.method === 'POST') return 回(res, 200, 导出诊断报告());
        if (p === `${ROUTE}/api/slim` && req.method === 'POST') {
          const b = await 读请求体(req);
          return 回(res, 200, 瘦身({ 文件: b.文件, 序号们: b.序号们, 确认: b.确认 === true }));
        }
        if (p === `${ROUTE}/api/archive` && req.method === 'GET') return 回(res, 200, 归档列表());
        if (p === `${ROUTE}/api/message` && req.method === 'GET') {
          const sessionId = u.searchParams.get('sessionId') || '';
          const messageId = u.searchParams.get('messageId') || '';
          let 文本 = null;
          try {
            const agent = ctx.agents && typeof ctx.agents.get === 'function' ? ctx.agents.get(sessionId) : void 0;
            const events = agent && agent.session && typeof agent.session.snapshotEvents === 'function' ? agent.session.snapshotEvents() : [];
            文本 = 提取回复文本(events, messageId);
          } catch { /* 取不到就按未找到处理 */ }
          if (!文本) return 回(res, 404, { ok: false, 错误: '找不到这条回复（可能已被撤回或会话未加载）' });
          return 回(res, 200, { ok: true, 文本, 长度: 文本.length });
        }
        if (p === `${ROUTE}/api/save-message` && req.method === 'POST') {
          const b = await 读请求体(req);
          const 目标 = b.target === 'user' ? 'USER.md' : 'MEMORY.md';
          let 文本 = typeof b.text === 'string' && b.text.trim() ? b.text : null;
          if (!文本) {
            try {
              const agent = ctx.agents && typeof ctx.agents.get === 'function' ? ctx.agents.get(String(b.sessionId || '')) : void 0;
              const events = agent && agent.session && typeof agent.session.snapshotEvents === 'function' ? agent.session.snapshotEvents() : [];
              文本 = 提取回复文本(events, String(b.messageId || ''));
            } catch { /* ignore */ }
          }
          if (!文本) return 回(res, 404, { ok: false, 错误: '找不到这条回复' });
          const 截断 = 文本.length > 3000 ? 文本.slice(0, 3000) + '…（已截断）' : 文本;
          const r = 写记忆({ 目标, 内容: `会话回复（${new Date().toISOString().slice(0, 10)}）：${截断.replace(/\n{3,}/g, '\n\n')}` });
          return 回(res, r.ok ? 200 : 409, r);
        }
        if (p === `${ROUTE}/api/docs` && req.method === 'GET') return 回(res, 200, 文档列表());
        if (p === `${ROUTE}/api/doc` && req.method === 'GET') return 回(res, 200, 读文档(u.searchParams.get('path') || ''));
        if (p === `${ROUTE}/api/diff` && req.method === 'GET') return 回(res, 200, 对比上次());
        if (p === `${ROUTE}/api/restore` && req.method === 'POST') {
          const b = await 读请求体(req);
          return 回(res, 200, 恢复归档({ 归档文件名: b.归档文件名, 文件: b.文件, 确认: b.确认 === true }));
        }
        if (p === `${ROUTE}/api/pack` && req.method === 'POST') return 回(res, 200, 导出记忆包());
        if (p === `${ROUTE}/api/import` && req.method === 'POST') {
          const b = await 读请求体(req);
          return 回(res, 200, 导入记忆包({ 目录: b.目录, 确认: b.确认 === true }));
        }
        if (p === `${ROUTE}/api/badge` && req.method === 'GET') {
          const 图 = readFileSync(join(包根, 'assets', 'deepwhale-badge.png'));
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
          return res.end(图);
        }
        return 回(res, 404, { ok: false, 错误: '没有这个接口' });
      } catch (e) {
        return 回(res, 500, { ok: false, 错误: String(e && e.message || e) });
      }
    };
    // ⚠️ 正确 API 是 {kind,path,handler}：只给 handler 不会挂到任何路径（真机 404 的根因）
    const 注册 = () => ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler });
    if (typeof ctx.effect === 'function') ctx.effect(注册);
    else 注册();
  }
}
