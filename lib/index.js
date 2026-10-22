// 深鲸记忆体检（dsh-memory-doctor）
// ------------------------------------------------------------------
// 定位：**不重造记忆引擎**，而是在「明文记忆」这套已经好用的底座上，补它没做的三件事：
//   ① 体检：膨胀 / 重复 / 低信息量 / 该归档的条目，一次说清
//   ② 瘦身：按建议归档（先备份、可回滚，绝不删）
//   ③ 记忆包：导出/导入（换机、团队共享、留档）
//
// 底座路径（默认）：~/.mnemon/runtime/{MEMORY.md,USER.md,memories.json,archived/}
// 全部本地明文，不联网、不上传。零依赖（只用 node 内置）。
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, renameSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

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

const 归档词 = /(临时|暂存|进度|今天|昨天|刚才|正在|一次性|存档|TODO|待办|下一步|回头|稍后)/i;

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
    '- 写入：先读一遍，**追加**新条目；条目之间用单独一行 `§` 分隔；已有的别重复写',
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

export const inject = ['commands', 'webServer'];

export function apply(ctx) {
  // ① 热记忆：每轮 system prompt 里带上一段「记忆正文 + 维护协议」
  //    MEMORY_DOCTOR_INJECT=0 可关掉注入（和别的记忆插件同时装时用，避免重复注入）
  try {
    if (process.env.MEMORY_DOCTOR_INJECT !== '0' && typeof ctx.inject === 'function') {
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
      name: '记忆',
      description: '深鲸记忆体检：看记忆膨胀/重复/该归档的条目',
      handler: () => 摘要文本(体检()),
    });
  }

  // HTTP：面板用
  if (ctx.webServer && typeof ctx.webServer.register === 'function') {
    const handler = async (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      const p = u.pathname;
      try {
        if (p === `${ROUTE}/api/audit` && req.method === 'GET') return 回(res, 200, { ok: true, 体检: 体检() });
        if (p === `${ROUTE}/api/slim` && req.method === 'POST') {
          const b = await 读请求体(req);
          return 回(res, 200, 瘦身({ 文件: b.文件, 序号们: b.序号们, 确认: b.确认 === true }));
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
    ctx.webServer.register({ handler });
  }
}
