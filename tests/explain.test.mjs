#!/usr/bin/env node
/**
 * 0.6.7 回归：近重复用「包含相似度」、搜索给「为什么命中」、驱逐给「为什么是它」。
 * 目标是让我们自己的三件事更像自家产品：单库 + 人工把关 + 每步能解释，不引入第二套记忆库。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const 包根 = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = await import(path.join(包根, 'lib/index.js'));
const C = await import(path.join(包根, 'lib/compress.js'));

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅ ' + m); };
const bad = (m, e) => { fail++; console.log('  ❌ ' + m + (e ? '：' + e : '')); };
function 检查(name, fn) { try { fn(); ok(name); } catch (e) { bad(name, e.message); } }

function 新家(内容 = '') {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-doctor-sim-'));
  process.env.MEMORY_DOCTOR_HOME = d;
  fs.mkdirSync(path.join(d, 'runtime'), { recursive: true });
  if (内容) fs.writeFileSync(path.join(d, 'runtime', 'MEMORY.md'), 内容, 'utf8');
  return d;
}
const 归一 = (t) => String(t).toLowerCase().replace(/[\s\u3000，。、；：！？,.;:!?（）()【】\[\]"'“”‘’·|—\-_/\\]/g, '');

console.log('\n  dsh-memory-doctor · 0.6.7 包含相似度 / 检索理由 / 驱逐理由');

// ① 包含相似度（纯函数）
{
  const 短 = '先备份再部署确认本地与线上一致';
  const 长 = '官网部署铁律：先备份再部署确认本地与线上一致，否则 rsync 静默覆盖';
  检查('短规则被长段落包含 → 判重复（Jaccard 会被长度稀释）', () => {
    const 分 = C.包含相似度(C.三元组集(归一(短)), C.三元组集(归一(长)));
    assert.ok(分 > 0.9, '实际 ' + 分);
  });
  检查('无关内容 → 0', () => {
    const 分 = C.包含相似度(C.三元组集(归一('iOS 打包要签名')), C.三元组集(归一('服务器证书还有 31 天到期')));
    assert.equal(分, 0);
  });
  检查('交集少于 3 个三元组不算命中（防偶然重合）', () => {
    assert.equal(C.包含相似度(new Set(['abc']), new Set(['abc'])), 0);
  });
}

// ② 体检：近重复用包含判据，且建议里写清判据
{
  新家([
    '官网部署铁律：先备份再部署，确认本地与线上一致后再传，否则 rsync 会静默覆盖线上内容（10-12 丢过五处）',
    '先备份再部署确认本地与线上一致',
    'iOS 打包要签名',
  ].join('\n§\n') + '\n');
  const r = M.体检();
  检查('短规则被标记近重复', () => {
    const 标记 = r.条目.map((e) => e.标记).flat();
    assert.ok(标记.includes('近重复'), '标记：' + JSON.stringify(标记));
  });
  检查('可执行建议里写明判据', () => {
    const s = (r.具体建议 || []).find((x) => x.类型 === '合并');
    assert.ok(s, '应有合并建议');
    assert.match(String(s.理由), /包含相似度|完全相同/);
  });
}

// ③ 搜索：排序按「完全相同 > 精确符号 > 子串 > 模糊」，每条带理由
{
  新家([
    'agent-preset/not-found 是旧 dsh-home 残留 preset',
    'DeepWhale 旧 bug：Windows 新建会话报 agent-preset/not-found 错误',
    '本地与线上一致再部署',
    '删前先备份，确认本地与线上一致后再传',
    'rsync 会静默覆盖线上内容',
  ].join('\n§\n') + '\n');
  检查('精确符号命中排最前，且说明理由', () => {
    const 命中 = M.搜记忆('agent-preset/not-found');
    assert.ok(命中.length >= 2);
    assert.equal(命中[0].命中, '精确符号');
    assert.ok(命中[0].分数 >= 0.7);
    assert.match(命中[0].理由, /精确符号|第 \d+ 个字符/);
  });
  检查('子串命中给出位置', () => {
    const 命中 = M.搜记忆('本地与线上一致').filter((x) => x.命中 === '字面命中');
    assert.ok(命中.length >= 1);
    assert.ok(命中[0].位置 >= 0);
  });
  检查('换措辞也能模糊命中并自我说明', () => {
    const 命中 = M.搜记忆('rsync静默覆盖线上');
    const 模糊 = 命中.filter((x) => x.命中 === '联想命中');
    assert.ok(模糊.length >= 1, '应有模糊命中：' + JSON.stringify(命中.map((x) => x.命中)));
    assert.match(模糊[0].理由, /三元组/);
  });
  检查('分数降序', () => {
    const 命中 = M.搜记忆('一致');
    for (let i = 1; i < 命中.length; i++) assert.ok(命中[i - 1].分数 >= 命中[i].分数);
  });
}

// ④ 驱逐理由（纯函数）
{
  检查('临时/进度类 → 优先级 0 + 理由', () => {
    const r = C.驱逐判定('临时：今天先把索引补到 144', { 临时: true });
    assert.equal(r.优先级, 0);
    assert.match(r.理由, /临时|进度/);
  });
  检查('已落盘指针 → 优先级 1 + 理由', () => {
    const r = C.驱逐判定('……（全文已落盘 archived/自动压缩-x/落盘/条目-1.md；sha256 abc）……');
    assert.equal(r.优先级, 1);
    assert.match(r.理由, /可重放|取回/);
  });
  检查('超长 → 优先级 2 + 理由含字节数', () => {
    const r = C.驱逐判定('事实：' + '很长'.repeat(300));
    assert.equal(r.优先级, 2);
    assert.match(r.理由, /\d+ 字节/);
  });
  检查('普通条目 → Infinity + 说明不动', () => {
    const r = C.驱逐判定('发布纪律：对外动作前先问用户');
    assert.equal(r.优先级, Infinity);
    assert.match(r.理由, /不动/);
  });
}

// ⑤ 真实压缩：理由写进谱系/逆变换/核对报告
{
  新家();
  const 条 = (前缀, n) => 前缀 + '很长说明。'.repeat(n); // 200×15 = 3000 字节/条，低于落盘线 4000
  fs.writeFileSync(path.join(process.env.MEMORY_DOCTOR_HOME, 'runtime', 'MEMORY.md'),
    ['临时：今天的进度', 条('甲：', 200), 条('乙：', 200), 条('丙：', 200)].join('\n§\n') + '\n', 'utf8');
  const r = M.自动压缩({ 文件: 'MEMORY.md' });
  检查('压缩动作带理由', () => {
    assert.ok(r.动作.length > 0);
    assert.ok(r.动作.every((a) => a.理由), '每个动作都要有理由：' + JSON.stringify(r.动作));
  });
  检查('逆变换 L3 记下理由', () => {
    const 逆 = JSON.parse(fs.readFileSync(path.join(r.存档, '逆变换.json'), 'utf8'));
    assert.ok(逆.L3 && 逆.L3.归档.length >= 1);
    assert.ok(逆.L3.归档[0].理由);
  });
  检查('核对报告抽样带理由', () => {
    const 报 = JSON.parse(fs.readFileSync(path.join(r.存档, '压缩报告.json'), 'utf8'));
    assert.ok(报.抽样.some((s) => s.理由), JSON.stringify(报.抽样.map((s) => s.理由)));
  });
  检查('报告 md 里写了「为什么动它」', () => {
    const md = fs.readFileSync(path.join(r.存档, '压缩报告.md'), 'utf8');
    assert.match(md, /为什么动它/);
  });
}


// ⑥ 合并建议去冗余（0.6.8）：同一簇只提一次，不重复用同一条
{
  新家([
    '官网部署铁律：部署前必须确认本地源码与线上一致，否则 rsync 静默覆盖（10-12 丢过五处）',
    '部署前必须确认本地源码与线上一致',
    '部署前确认本地源码和线上一致',
    '发布纪律：任何对外动作前必须先征得同意，不得先斩后奏（违反过一次）',
    '对外动作前必须先征得同意',
  ].join('\n§\n') + '\n');
  const r = M.体检();
  const 合并 = (r.具体建议 || []).filter((x) => x.类型 === '合并');
  检查('同一簇的重复不会给出多条重叠建议', () => {
    const seen = new Set();
    for (const x of 合并) {
      const k = x.文件 + '#' + x.序号;
      assert.ok(!seen.has(k), '同一条被建议了两次：' + k);
      seen.add(k);
    }
  });
  检查('折叠数被记录下来（不是悄悄少给）', () => assert.ok(typeof r.合并建议折叠 === 'number'));
  检查('命中文案是人话标签', () => {
    const 命中 = M.搜记忆('部署');
    const 标签 = new Set(命中.map((x) => x.命中));
    for (const t of 标签) assert.ok(['直接命中', '精确符号', '字面命中', '联想命中', '全部'].includes(t), '未知标签 ' + t);
  });
}

console.log(`\n  通过 ${pass} · 失败 ${fail}\n`);
process.exit(fail ? 1 : 0);
