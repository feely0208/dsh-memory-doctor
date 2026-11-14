/**
 * 会话提炼（digest）：把 DSH 的会话日志压成「可核对的记忆草稿」。
 *
 * 用途：用户从 DeepSeek 官网导入历史会话后，不必从零重讲背景——
 *       跑一遍 digest，得到 MEMORY/USER 的候选条目，自己删改后再写进记忆。
 *
 * 边界（重要）：
 *   · 只读会话，不写记忆；产出是「候选清单」，每条带出现次数，可回溯。
 *   · 不调用任何模型，纯统计；不编事实，没证据的不写。
 *   · 会话文件是 append-only 的 zstd 多帧流，必须用 zstd -dc 整段解；
 *     Node 自带 zstd 只解第一帧，会静默丢内容（本模块优先用 zstd 命令）。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const 会话文件名 = ['session.v4.jsonl.zstd', 'session.jsonl.zstd', 'session.v4.jsonl', 'session.jsonl'];

function 找zstd() {
  for (const p of ['/opt/homebrew/bin/zstd', '/usr/local/bin/zstd', '/usr/bin/zstd']) {
    if (existsSync(p)) return p;
  }
  const r = spawnSync('zstd', ['--version'], { encoding: 'utf8' });
  return r.status === 0 ? 'zstd' : null;
}

function 读事件流(文件, zstd) {
  const 原始 = readFileSync(文件);
  let 文本;
  let 截断 = false;
  if (文件.endsWith('.zstd')) {
    if (zstd) {
      const r = spawnSync(zstd, ['-dc', 文件], { maxBuffer: 1024 * 1024 * 1024 });
      if (r.status !== 0) throw new Error(`zstd 解压失败：${(r.stderr || '').toString().slice(0, 200)}`);
      文本 = r.stdout.toString('utf8');
    } else {
      // 兜底：Node 的 zstd 只解第一帧，会丢后续追加内容，必须告诉调用方
      const z = require('node:zlib');
      文本 = z.zstdDecompressSync(原始).toString('utf8');
      截断 = true;
    }
  } else {
    文本 = 原始.toString('utf8');
  }
  const 事件 = [];
  for (const line of 文本.split('\n')) {
    if (!line.trim()) continue;
    try { 事件.push(JSON.parse(line)); } catch { /* 坏行跳过，不中断整段 */ }
  }
  return { 事件, 截断 };
}

// 兼容 CJS 里拿 zlib 的写法（本文件是 ESM，这里用动态 require 语义）
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function 文段(内容) {
  if (!内容) return '';
  if (typeof 内容 === 'string') return 内容;
  if (Array.isArray(内容)) {
    return 内容.map((c) => (typeof c === 'string' ? c : c?.type === 'text' ? c.text || '' : '')).join('\n').trim();
  }
  return '';
}

function 遍历(根, 过滤) {
  const 结果 = [];
  const 走 = (目录) => {
    let 项;
    try { 项 = readdirSync(目录, { withFileTypes: true }); } catch { return; }
    for (const e of 项) {
      const p = join(目录, e.name);
      if (e.isDirectory()) { 走(p); continue; }
      if (!会话文件名.includes(e.name)) continue;
      if (过滤 && !过滤(p)) continue;
      结果.push(p);
    }
  };
  走(根);
  return 结果;
}

function 工作区名(路径) {
  // DSH 把工作区路径编码成 --Users-mac-xxx--，空格写作 ~0020
  const 名 = 路径.split('/sessions/')[1]?.split('/')[0] || '';
  return 名.replace(/~0020/g, ' ').replace(/^--|--$/g, '').replace(/-/g, '/').replace(/\/+/g, '/');
}

export function 扫描({ 根 = join(homedir(), '.dsh', 'sessions'), 工作区 = '', 上限 = 200, 起始 = null } = {}) {
  const zstd = 找zstd();
  const 文件们 = 遍历(根, (p) => (工作区 ? 工作区名(p).includes(工作区) : true));
  const 会话 = [];
  let 截断数 = 0;
  for (const 文件 of 文件们) {
    // 同一会话目录里可能同时有 v4 与旧文件，取列表里第一个即可（v4 优先）
    if (会话.some((s) => s.文件 === 文件)) continue;
    let 读;
    try { 读 = 读事件流(文件, zstd); } catch { continue; }
    if (读.截断) 截断数 += 1;
    const 头 = 读.事件.find((e) => e.type === 'session') || {};
    const 时间 = Number(头.createdAt) || Number(读.事件.find((e) => e.time)?.time) || 0;
    if (起始 && 时间 && 时间 < 起始) continue;
    const 用户 = [];
    const 工具 = {};
    let 助手数 = 0;
    let 最后待办 = null;
    let 审批数 = 0;
    for (const e of 读.事件) {
      if (e.type === 'user/message') {
        const t = 文段(e.data?.content);
        if (t) 用户.push(t);
      } else if (e.type === 'assistant/message') {
        助手数 += 1;
      } else if (e.type === 'tool/call') {
        const n = e.data?.name || 'unknown';
        工具[n] = (工具[n] || 0) + 1;
      } else if (e.type === 'todo/write') {
        最后待办 = e.data?.todos || null;
      } else if (e.type === 'approval/asked') {
        审批数 += 1;
      }
    }
    会话.push({
      文件, id: 头.id || '', 工作区: 工作区名(文件), cwd: 头.cwd || '', 时间,
      用户, 助手数, 工具, 待办: 最后待办, 审批数, 截断: 读.截断,
    });
  }
  会话.sort((a, b) => b.时间 - a.时间);
  const 取 = 会话.slice(0, 上限);
  return { 根, 总数: 会话.length, 采用: 取.length, 会话: 取, 截断数, zstd: Boolean(zstd) };
}

const 领域 = {
  'DSH / 插件开发': /dsh|deepseek harness|插件|plugin|engines\.dsh/i,
  '官网 / 部署': /官网|deepwhale|nginx|部署|服务器|cdn/i,
  '律师端 / 法律': /律师端|法律|文书|判决|合同|备案|合规/i,
  '内容 / 分发': /抖音|公众号|csdn|掘金|知乎|选题|文案|封面/i,
  '记忆 / 上下文': /记忆|memory|MEMORY\.md|USER\.md|上下文/i,
  '文档 / 办公': /文档|pdf|docx|xlsx|pptx|表格|排版/i,
  '发布 / 版本': /发布|发版|npm publish|版本号|tag|release/i,
};

// 宿主会把运行时上下文/清单追加在用户消息后面；从第一条这样的行起整段截掉。
// 若第一条就命中，说明整条都是注入内容，直接跳过。
const 注入前缀 = /^(Time sampled|Current |Browser time zone|Elapsed since|You are an AI agent|You are interacting|A skill is|# The following skills|Agent Teams is available|<system-reminder>|<\/system-reminder>|Tokens prefixed with|Check the \[exit code|Use the |Prefer |The runtime context|Create a persisted goal|Update the current goal|Track every background job|Before giving a final answer|send_message steers|wait_agent|inactive means|provisioning means|failed means|web_search results|web_fetch returns|Use session_search|Use the workflow tool|你是 DSH agent|§\s*$)/;
function 清洗(文本) {
  const 行 = String(文本 || '').split('\n');
  const 截 = 行.findIndex((l) => 注入前缀.test(l.trim()));
  const 取 = 截 >= 0 ? 行.slice(0, 截) : 行;
  return 取.join('\n').trim();
}

function 归一(文本, 长度 = 40) {
  return 清洗(文本).replace(/\s+/g, ' ').replace(/[「」“”"'`]/g, '').trim().slice(0, 长度);
}

export function 汇总(扫描结果) {
  const 提问 = [];
  const 域计数 = {};
  const 路径计数 = {};
  const 包计数 = {};
  const 未完成 = [];
  const 工具总 = {};
  let 消息数 = 0;
  let 最早 = Infinity;
  let 最晚 = 0;
  for (const s of 扫描结果.会话) {
    if (s.时间) { 最早 = Math.min(最早, s.时间); 最晚 = Math.max(最晚, s.时间); }
    for (const [k, v] of Object.entries(s.工具)) 工具总[k] = (工具总[k] || 0) + v;
    for (const 原文 of s.用户) {
      const t = 清洗(原文);
      if (t.length < 2) continue;
      消息数 += 1;
      提问.push(t);
      for (const [名, 式] of Object.entries(领域)) if (式.test(t)) 域计数[名] = (域计数[名] || 0) + 1;
      for (const m of t.matchAll(/(~\/|\/Users\/)[\w.\-~/ ]{2,80}/g)) {
        const p = m[0].trim().replace(/[\s，。；、]+$/, '');
        // 只要「像个真路径」的：至少三层，且不是用户目录本身
        if (p.split('/').filter(Boolean).length < 3) continue;
        if (p === '/Users/mac' || p === '~/') continue;
        if (p.includes('/.dsh/sessions/') || p.length > 80) continue;
        路径计数[p] = (路径计数[p] || 0) + 1;
      }
      for (const m of t.matchAll(/@[\w-]+\/[\w.-]{2,40}/g)) 包计数[m[0]] = (包计数[m[0]] || 0) + 1;
    }
    for (const td of s.待办 || []) {
      if (td?.status && td.status !== 'completed') 未完成.push({ 内容: td.content, 状态: td.status, 会话: s.id.slice(0, 18) });
    }
  }
  // 重复出现的提问（同一句话被问过多次，往往就是反复踩的坑）
  const 问句计数 = {};
  for (const t of 提问) {
    const n = 归一(t, 30);
    if (n.length < 4) continue;
    问句计数[n] = (问句计数[n] || 0) + 1;
  }
  const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
  return {
    会话数: 扫描结果.采用,
    消息数,
    最早: 最早 === Infinity ? null : 最早,
    最晚: 最晚 || null,
    领域: top(域计数, 8),
    路径: top(路径计数, 8),
    包: top(包计数, 8),
    工具: top(工具总, 8),
    重复提问: top(问句计数, 8).filter(([, v]) => v >= 2),
    未完成: [...new Map(未完成.map((x) => [x.内容, x])).values()].slice(0, 12),
    截断数: 扫描结果.截断数,
  };
}

const 日 = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : '?');

export function 生成草稿(汇总结果, { 工作区 = '' } = {}) {
  const s = 汇总结果;
  const 行 = [];
  行.push('# 会话提炼草稿（需你确认，不会自动写入记忆）');
  行.push('');
  行.push(`范围：${工作区 || '全部工作区'} · 会话 ${s.会话数} 个 · 用户消息 ${s.消息数} 条 · ${日(s.最早)} → ${日(s.最晚)}`);
  if (s.截断数) 行.push(`注意：${s.截断数} 个会话因 zstd 不可用只读到第一帧，内容可能不全。`);
  行.push('');
  行.push('## 主题分布（按用户消息命中关键词统计）');
  for (const [k, v] of s.领域) 行.push(`- ${k}：${v} 条`);
  行.push('');
  行.push('## 反复提到的对象');
  if (s.路径.length) { 行.push('路径：'); for (const [k, v] of s.路径) 行.push(`- \`${k}\`（${v} 次）`); }
  if (s.包.length) { 行.push('包名：'); for (const [k, v] of s.包) 行.push(`- \`${k}\`（${v} 次）`); }
  if (s.工具.length) { 行.push('常用工具：' + s.工具.map(([k, v]) => `${k}×${v}`).join(' · ')); }
  行.push('');
  行.push('## 反复出现的问题（问过 2 次以上）');
  if (!s.重复提问.length) 行.push('- 无');
  for (const [k, v] of s.重复提问) 行.push(`- ${k}（${v} 次）`);
  行.push('');
  行.push('## 未完成的待办（上次留下的）');
  if (!s.未完成.length) 行.push('- 无');
  for (const t of s.未完成) 行.push(`- [${t.状态}] ${t.内容}（会话 ${t.会话}）`);
  行.push('');
  行.push('## 候选记忆条目（挑你认可的，再写进 MEMORY/USER）');
  const 候选 = [];
  for (const [k, v] of s.领域.slice(0, 4)) 候选.push(`项目涉及「${k}」（${v} 条消息提及）`);
  for (const [k, v] of s.路径.slice(0, 3)) 候选.push(`常用路径 \`${k}\`（${v} 次）`);
  for (const [k, v] of s.包.slice(0, 3)) 候选.push(`常用依赖/包 \`${k}\`（${v} 次）`);
  if (!候选.length) 候选.push('（会话太少，没有足够线索；多积累一些再跑）');
  for (const c of 候选) 行.push(`- [候选] ${c}`);
  行.push('');
  行.push('> 写入方式：确认后让我用 memory 工具 append，或直接编辑 MEMORY.md / USER.md。');
  return 行.join('\n');
}

export function 提炼(选项 = {}) {
  const 扫描结果 = 扫描(选项);
  if (!扫描结果.会话.length) {
    return { ok: false, 错误: `没有找到会话（根：${扫描结果.根}）；用 --workspace 缩小范围，或确认 DSH 数据目录` };
  }
  const 汇总结果 = 汇总(扫描结果);
  return { ok: true, 扫描: 扫描结果, 汇总: 汇总结果, 草稿: 生成草稿(汇总结果, 选项) };
}
