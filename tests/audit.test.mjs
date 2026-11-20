#!/usr/bin/env node
/**
 * 0.6.7 回归：审计账本（哈希链 / 溯源）+ 压缩三件套（可拦截 / 可预览 / 可撤销）。
 * 全部在临时 MEMORY_DOCTOR_HOME 里跑，不碰真实记忆。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const 包根 = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = await import(path.join(包根, 'lib/index.js'));
const A = await import(path.join(包根, 'lib/audit.js'));

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅ ' + m); };
const bad = (m, e) => { fail++; console.log('  ❌ ' + m + (e ? '：' + e : '')); };
function 检查(name, fn) { try { fn(); ok(name); } catch (e) { bad(name, e.message); } }

function 新家() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-doctor-audit-'));
  process.env.MEMORY_DOCTOR_HOME = d;
  fs.mkdirSync(path.join(d, 'runtime'), { recursive: true });
  return d;
}
const 家 = () => process.env.MEMORY_DOCTOR_HOME;
const 运行时 = () => path.join(家(), 'runtime');
const 归档 = () => path.join(运行时(), 'archived');
const 读 = (名) => fs.readFileSync(path.join(运行时(), 名), 'utf8');
const 写 = (名, 文本) => fs.writeFileSync(path.join(运行时(), 名), 文本, 'utf8');
const 目录快照 = (d) => (fs.existsSync(d) ? fs.readdirSync(d).sort() : []);

console.log('\n  dsh-memory-doctor · 0.6.7 审计 / 压缩三件套');

// ① 纯函数：哈希链
{
  const b1 = A.审计体({ 动作: 'append', 目标: 'MEMORY.md', 条目: A.条目指纹('甲'), 备注: '第一条' });
  let 账 = A.追加记录([], b1);
  检查('首条 prev = genesis', () => assert.equal(账[0].prev, A.链头));
  const b2 = A.审计体({ 动作: 'replace', 目标: 'MEMORY.md', 条目: A.条目指纹('乙') });
  账 = A.追加记录(账, b2);
  检查('第二条 prev 接上第一条 hash', () => assert.equal(账[1].prev, 账[0].hash));
  检查('完整链校验通过', () => assert.equal(A.校验链(账).ok, true));

  检查('改一条 → 链断在该条', () => {
    const 改 = JSON.parse(JSON.stringify(账));
    改[0].备注 = '偷偷改一下';
    const r = A.校验链(改);
    assert.equal(r.ok, false);
    assert.equal(r.断点, 1);
  });
  检查('删中间一条 → 链断', () => {
    const 删 = [账[0], { ...账[1], 序: 2 }];
    删.pop();
    const r = A.校验链([账[0], { ...账[1], 序: 2, prev: '乱写' }]);
    assert.equal(r.ok, false);
  });
  检查('指纹同内容稳定、不同内容不同', () => {
    assert.equal(A.条目指纹('同一 段内容'), A.条目指纹('同一段内容'));
    assert.notEqual(A.条目指纹('甲'), A.条目指纹('乙'));
  });
}

// ② 端到端：写 / 改 / 归档都记账，且能凭原文溯源
{
  新家();
  M.写记忆({ 目标: 'MEMORY.md', 内容: '偏好：输出要克制', 会话: 'session-aaa' });
  M.写记忆({ 目标: 'MEMORY.md', 内容: '事实：服务器已换新机', 会话: 'session-aaa' });
  M.改记忆({ 目标: 'MEMORY.md', 旧文本: '输出要克制', 内容: '偏好：输出要克制、不要刷屏', 会话: 'session-bbb' });
  M.归档一条({ 目标: 'MEMORY.md', 旧文本: '服务器已换新机', 会话: 'session-ccc' });
  const 账 = M.读审计();
  检查('4 次操作 → 4 条账', () => assert.equal(账.length, 4));
  检查('账本链完整', () => assert.equal(M.校验链(账).ok, true));
  检查('动作顺序 append×2 / replace / remove', () => assert.deepEqual(账.map((x) => x.动作), ['append', 'append', 'replace', 'remove']));
  检查('记下了会话出处', () => {
    assert.equal(账[0].会话, 'session-aaa');
    assert.equal(账[2].会话, 'session-bbb');
  });
  检查('凭原文能查到这条的来龙去脉', () => {
    const r = M.记忆溯源('输出要克制、不要刷屏');
    assert.ok(r.命中.length >= 2, '应同时命中 append 与 replace');
  });
  检查('审计概要说明是可读的一句话', () => {
    const s = M.审计概要();
    assert.match(s.说明, /链完整/);
    assert.equal(s.条数, 4);
  });
}

// ③ 预览：只算不写
{
  新家();
  // 造 85% 的内容：一条超长 + 大量重复行
  const 大条 = '事实：' + '这是一段很长的事实说明，用来把记忆顶到压缩线。'.repeat(120) + '\n' + '重复行\n'.repeat(40);
  写('MEMORY.md', ['条目一', 大条, '条目三'].join('\n§\n') + '\n');
  const 前 = 读('MEMORY.md');
  const 前目录 = 目录快照(归档());
  const r = M.预览压缩({ 文件: 'MEMORY.md' });
  检查('预览声称触发了压缩', () => assert.equal(r.触发, true));
  检查('预览给出预计动作', () => assert.ok(r.动作.length > 0, '应有动作'));
  检查('预览没写文件（字节不变）', () => assert.equal(读('MEMORY.md'), 前));
  检查('预览没建存档目录', () => assert.deepEqual(目录快照(归档()), 前目录));
  检查('预览不产生账本记录', () => assert.equal(M.读审计().length, 0));
}

// ④ 拦截：manual 模式不自动压
{
  新家();
  写('MEMORY.md', ['条目一', '事实：' + '很长的说明。'.repeat(460), '条目三'].join('\n§\n') + '\n');
  M.设自动压缩模式('manual');
  const r = M.写记忆({ 目标: 'MEMORY.md', 内容: '新加一条', 会话: 's1' });
  检查('manual 模式下写入仍成功（没被压缩挡住）', () => assert.equal(r.ok, true));
  检查('说明里明确写了「已拦截」', () => assert.match(r.说明, /拦截/));
  检查('记忆文件没有被压缩（原文还在）', () => assert.ok(读('MEMORY.md').includes('很长的说明。')));
  M.设自动压缩模式('auto');
  检查('切回 auto 后模式生效', () => assert.equal(M.自动压缩模式(), 'auto'));
}

// ⑤ 撤销：整份放回，且不能撤销两次
{
  新家();
  写('MEMORY.md', ['条目一', '事实：' + '很长的说明。'.repeat(500), '条目三'].join('\n§\n') + '\n');
  const 压缩前 = 读('MEMORY.md');
  const r1 = M.自动压缩({ 文件: 'MEMORY.md' });
  检查('真实压缩确实改了文件', () => { assert.equal(r1.触发, true); assert.notEqual(读('MEMORY.md'), 压缩前); });
  检查('压缩也进了账本', () => assert.ok(M.读审计().some((x) => x.动作 === 'compact')));
  const 待 = M.最近可撤销存档();
  检查('能找最近可撤销存档', () => assert.ok(待 && 待.名));
  const 试探 = M.撤销压缩({});
  检查('不带确认时只要确认、不动手', () => {
    assert.equal(试探.ok, false);
    assert.equal(试探.需要确认, true);
    assert.notEqual(读('MEMORY.md'), 压缩前);
  });
  const r2 = M.撤销压缩({ 确认: true });
  检查('撤销后逐字节回到压缩前', () => { assert.equal(r2.ok, true); assert.equal(读('MEMORY.md'), 压缩前); });
  检查('存档里留下撤销标记', () => assert.ok(fs.existsSync(path.join(归档(), 待.名, '撤销.json'))));
  检查('同一存档不会被撤销两次', () => assert.equal(M.撤销压缩({ 确认: true }).ok, false));
  检查('撤销也记账（可核对）', () => assert.ok(M.读审计().some((x) => x.动作 === 'undo-compact')));
}

// ⑥ 账本滚动：超单卷上限后自动分卷，链跨卷仍然完整
{
  新家();
  for (let i = 0; i < 805; i++) M.追加审计(A.审计体({ 动作: 'append', 目标: 'MEMORY.md', 条目摘要: '条目 ' + i }));
  const 账 = M.读审计();
  检查('805 条全部读得回来', () => assert.equal(账.length, 805));
  检查('分卷了（审计-0001.jsonl 出现）', () => assert.ok(目录快照(归档()).some((n) => /^审计-\d{4}\.jsonl$/.test(n))));
  检查('跨卷链校验仍通过', () => assert.equal(M.校验链(账).ok, true));
  检查('分卷后仍能按关键词查到早先记录', () => assert.ok(M.记忆溯源('条目 3').命中.length > 0));
}

console.log(`\n  通过 ${pass} · 失败 ${fail}\n`);
process.exit(fail ? 1 : 0);
