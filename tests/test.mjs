#!/usr/bin/env node
/** dsh-memory-doctor 回归：拆条目 / 体检 / 瘦身（备份可回滚）/ 记忆包导出导入 / 注入开关 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const 包根 = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = await import(path.join(包根, 'lib/index.js'));

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅ ' + m); };
const bad = (m, e) => { fail++; console.log('  ❌ ' + m + (e ? '：' + e : '')); };
function 检查(name, fn) { try { fn(); ok(name); } catch (e) { bad(name, e.message); } }

function 新家() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-doctor-'));
  process.env.MEMORY_DOCTOR_HOME = d;
  fs.mkdirSync(path.join(d, 'runtime'), { recursive: true });
  return d;
}
function 写(名, 文本) { fs.writeFileSync(path.join(process.env.MEMORY_DOCTOR_HOME, 'runtime', 名), 文本, 'utf8'); }

console.log('\n  dsh-memory-doctor · 回归');

// ① 拆条目
{
  新家();
  写('MEMORY.md', '条目一\n内容\n§\n条目二\n§\n\n条目三\n');
  const 条 = M.拆条目(M.读文件('MEMORY.md'));
  检查('拆条目：3 条且去空段', () => assert.equal(条.length, 3));
}

// ② 体检：重复 / 临时 / 低信息量 / 用量
{
  新家();
  写('MEMORY.md', [
    '用户偏好：所有输出必须带「powered by dwh」徽章',
    '用户偏好：所有输出必须带「powered by dwh」徽章', // 完全重复
    '临时：今天先跑一遍测试，明天再说',
    '短',
    '项目事实：官网部署前必须先备份线上，再 rsync，否则会静默覆盖',
  ].join('\n§\n'));
  写('USER.md', '用户是产品负责人，偏好小而强、自己可控。');
  const r = M.体检();
  检查('体检：统计两个文件', () => assert.deepEqual(Object.keys(r.文件).sort(), ['MEMORY.md', 'USER.md']));
  检查('体检：MEMORY 条目数为 5', () => assert.equal(r.文件['MEMORY.md'].条目数, 5));
  检查('体检：识别重复', () => assert.ok((r.摘要.标记计数['重复'] || 0) >= 2));
  检查('体检：识别临时/进度类', () => assert.ok((r.摘要.标记计数['可归档(临时/进度类)'] || 0) >= 1));
  检查('体检：识别低信息量', () => assert.ok((r.摘要.标记计数['低信息量'] || 0) >= 1));
  检查('体检：摘要可读', () => assert.match(M.摘要文本(r), /深鲸记忆体检/));
}

// ③ 瘦身：未确认不动；确认后归档 + 备份 + 回滚素材齐全
{
  const d = 新家();
  const 原文本 = ['要保留的稳定事实一', '临时：这条该归档', '要保留的稳定事实二'].join('\n§\n');
  写('MEMORY.md', 原文本);
  const 未确认 = M.瘦身({ 文件: 'MEMORY.md', 序号们: [2] });
  检查('瘦身：未确认时拒绝', () => assert.equal(未确认.ok, false));
  检查('瘦身：拒绝时文件未变', () => assert.equal(M.读文件('MEMORY.md'), 原文本));
  const r = M.瘦身({ 文件: 'MEMORY.md', 序号们: [2], 确认: true });
  检查('瘦身：确认后 ok', () => assert.equal(r.ok, true));
  检查('瘦身：归档 1 条', () => assert.equal(r.归档条数, 1));
  检查('瘦身：正文减少', () => assert.ok(r.之后字节 < r.之前字节));
  检查('瘦身：仍保留两条', () => assert.equal(M.拆条目(M.读文件('MEMORY.md')).length, 2));
  检查('瘦身：备份文件存在且含原文', () => assert.equal(fs.readFileSync(r.备份, 'utf8'), 原文本));
  检查('瘦身：归档文件含被移出条目', () => assert.match(fs.readFileSync(r.归档文件, 'utf8'), /临时：这条该归档/));
  检查('瘦身：越界序号拒绝', () => assert.equal(M.瘦身({ 文件: 'MEMORY.md', 序号们: [99], 确认: true }).ok, false));
  assert.ok(d);
}

// ④ 归档列表 + 恢复（备份可回滚）
{
  新家();
  写('MEMORY.md', '稳定事实 A\n§\n临时：该归档\n§\n稳定事实 B');
  const r = M.瘦身({ 文件: 'MEMORY.md', 序号们: [2], 确认: true });
  const 列表 = M.归档列表();
  检查('归档：列表包含刚生成的备份与归档文件', () => {
    assert.ok(列表.文件.length >= 2);
    assert.ok(列表.文件.some((f) => f.类型 === '备份'));
    assert.ok(列表.文件.some((f) => f.类型 === '归档条目'));
  });
  检查('恢复：未确认时拒绝', () => assert.equal(M.恢复归档({ 归档文件名: path.basename(r.备份), 文件: 'MEMORY.md' }).ok, false));
  const 恢复 = M.恢复归档({ 归档文件名: path.basename(r.备份), 文件: 'MEMORY.md', 确认: true });
  检查('恢复：确认后 ok', () => assert.equal(恢复.ok, true));
  检查('恢复：内容回到瘦身前', () => assert.match(M.读文件('MEMORY.md'), /临时：该归档/));
  检查('恢复：恢复前自动另存', () => assert.ok(M.归档列表().文件.some((f) => f.类型 === '备份' && f.名.includes('恢复前'))));
}

// ④ 记忆包：导出 → 新环境导入（去重、不覆盖）
{
  const 老家 = 新家();
  写('MEMORY.md', '稳定事实 A\n§\n稳定事实 B');
  写('USER.md', '用户画像条目');
  const 导出 = M.导出记忆包();
  检查('记忆包：导出目录有 manifest', () => assert.ok(fs.existsSync(path.join(导出.目录, 'manifest.json'))));
  检查('记忆包：含 MEMORY.md', () => assert.ok(fs.existsSync(path.join(导出.目录, 'MEMORY.md'))));
  const 旧包 = 导出.目录;

  新家(); // 换一个空环境
  const 导入1 = M.导入记忆包({ 目录: 旧包 });
  检查('记忆包：未确认时拒绝导入', () => assert.equal(导入1.ok, false));
  const 导入2 = M.导入记忆包({ 目录: 旧包, 确认: true });
  检查('记忆包：导入 2 条', () => assert.equal(导入2.合并['MEMORY.md'].新增, 2));
  const 导入3 = M.导入记忆包({ 目录: 旧包, 确认: true });
  检查('记忆包：二次导入全去重', () => {
    assert.equal(导入3.合并['MEMORY.md'].新增, 0);
    assert.equal(导入3.合并['MEMORY.md'].跳过重复, 2);
  });
  检查('记忆包：导入后内容正确', () => assert.match(M.读文件('MEMORY.md'), /稳定事实 A/));
  assert.ok(老家);
}

// ⑤ 注入开关：env / doctor.json
{
  新家();
  fs.writeFileSync(path.join(process.env.MEMORY_DOCTOR_HOME, 'doctor.json'), JSON.stringify({ inject: false }));
  delete process.env.MEMORY_DOCTOR_INJECT;
  检查('开关：doctor.json 可关闭注入', () => assert.equal(M.注入是否开启(), false));
  process.env.MEMORY_DOCTOR_INJECT = '1';
  检查('开关：env=1 强制开启（优先于文件）', () => assert.equal(M.注入是否开启(), true));
  process.env.MEMORY_DOCTOR_INJECT = '0';
  检查('开关：env=0 强制关闭', () => assert.equal(M.注入是否开启(), false));
  delete process.env.MEMORY_DOCTOR_INJECT;
  fs.writeFileSync(path.join(process.env.MEMORY_DOCTOR_HOME, 'doctor.json'), JSON.stringify({ inject: true }));
  检查('开关：doctor.json 可开启注入', () => assert.equal(M.注入是否开启(), true));
  检查('热记忆：无记忆时文本为空', () => {
    fs.writeFileSync(path.join(process.env.MEMORY_DOCTOR_HOME, 'runtime', 'MEMORY.md'), '');
    fs.writeFileSync(path.join(process.env.MEMORY_DOCTOR_HOME, 'runtime', 'USER.md'), '');
    assert.equal(M.热记忆文本().trim(), '');
  });
  检查('热记忆：有记忆时带维护协议', () => {
    写('MEMORY.md', '一条稳定事实');
    const t = M.热记忆文本();
    assert.match(t, /一条稳定事实/);
    assert.match(t, /记忆维护协议/);
  });
}

// ⑥ 诊断 / 配置 / 诊断报告
{
  新家();
  写('MEMORY.md', '一条稳定事实\n§\n临时：可归档');
  写('USER.md', '用户画像');
  const d = M.诊断();
  检查('诊断：返回插件版本与存储路径', () => {
    assert.equal(d.插件.名称, 'dsh-memory-doctor');
    assert.match(d.插件.版本, /^0\./);
    assert.ok(d.存储.根);
    assert.ok(d.存储.运行时.路径);
    assert.equal(typeof d.存储.运行时.文件数, 'number');
  });
  检查('诊断：返回注入状态与历史数组', () => {
    assert.equal(typeof d.注入, 'boolean');
    assert.ok(Array.isArray(d.历史));
  });
  delete process.env.MEMORY_DOCTOR_INJECT;
  M.写配置({ inject: false });
  检查('配置：写 false 后读回 false', () => assert.equal(M.读配置().inject, false));
  检查('配置：注入开关跟随配置', () => assert.equal(M.注入是否开启(), false));
  M.写配置({ inject: true });
  检查('配置：写 true 后读回 true', () => assert.equal(M.读配置().inject, true));
  const 报告 = M.导出诊断报告();
  检查('报告：生成 Markdown 且含用量/建议', () => {
    assert.ok(fs.existsSync(报告.路径));
    const 文 = fs.readFileSync(报告.路径, 'utf8');
    assert.match(文, /深鲸记忆 · 诊断报告/);
    assert.match(文, /MEMORY\.md/);
  });
}

// ⑦ 写记忆 / 改 / 归档 / 搜 / 文档 / 对比
{
  新家();
  写('MEMORY.md', '已有条目：初始');
  const a = M.写记忆({ 目标: 'MEMORY.md', 内容: '稳定事实：项目用 Node 24' });
  检查('写记忆：append ok', () => assert.equal(a.ok, true));
  检查('写记忆：写入文件', () => assert.match(M.读文件('MEMORY.md'), /Node 24/));
  检查('写记忆：自动去重', () => assert.equal(M.写记忆({ 内容: '稳定事实：项目用 Node 24' }).说明.includes('已存在'), true));
  检查('写记忆：先备份', () => assert.ok(M.归档列表().文件.some((f) => f.类型 === '备份')));
  const b = M.写记忆({ 目标: 'USER.md', 内容: '用户偏好：输出先给结论' });
  检查('写记忆：USER 目标', () => assert.equal(b.ok, true) && assert.match(M.读文件('USER.md'), /先给结论/));
  const c = M.改记忆({ 目标: 'MEMORY.md', 旧文本: 'Node 24', 内容: '稳定事实：项目用 Node 24（2026-10）' });
  检查('改记忆：替换成功', () => assert.equal(c.ok, true) && assert.match(M.读文件('MEMORY.md'), /2026-10/));
  检查('改记忆：old_text 不唯一时拒绝', () => {
    M.写记忆({ 内容: '重复定位词 A' }); M.写记忆({ 内容: '重复定位词 B' });
    assert.equal(M.改记忆({ 旧文本: '重复定位词', 内容: 'x' }).ok, false);
  });
  const d = M.归档一条({ 目标: 'MEMORY.md', 旧文本: '重复定位词 A' });
  检查('归档一条：成功且保留备份', () => assert.equal(d.ok, true) && assert.equal(M.拆条目(M.读文件('MEMORY.md')).some((t) => t.includes('重复定位词 A')), false));
  检查('搜索：能命中 MEMORY/USER', () => {
    const r = M.搜记忆('稳定事实');
    assert.ok(r.length >= 1 && r.some((x) => x.文件 === 'MEMORY.md'));
  });
  fs.mkdirSync(path.join(process.env.MEMORY_DOCTOR_HOME, 'documents'), { recursive: true });
  fs.writeFileSync(path.join(process.env.MEMORY_DOCTOR_HOME, 'documents', '项目.md'), '# 项目文档\n内容', 'utf8');
  const 文档 = M.文档列表();
  检查('文档：列出并读取', () => {
    assert.equal(文档.文件.length, 1);
    const r = M.读文档('项目.md');
    assert.match(r.内容, /项目文档/);
  });
  检查('文档：目录穿越被拒', () => assert.equal(M.读文档('../MEMORY.md').ok, false));
  const 对比 = M.对比上次();
  检查('对比：历史不足时可用=false', () => assert.equal(对比.可用, false));
}

// ⑧ 会话回复存入记忆（提取文本）
{
  const events = [
    { type: 'assistant/message', data: { message: { id: 'm1', content: [{ type: 'reasoning', text: '想' }, { type: 'text', text: '第一段' }, { type: 'text', text: '第二段' }] } } },
    { type: 'assistant/message', data: { message: { id: 'm2', content: [{ type: 'reasoning', text: '只有推理' }] } } },
  ];
  检查('回复提取：拼接 text 块', () => assert.equal(M.提取回复文本(events, 'm1'), '第一段\n\n第二段'));
  检查('回复提取：只有 reasoning 返回 null', () => assert.equal(M.提取回复文本(events, 'm2'), null));
  检查('回复提取：未知 id 返回 null', () => assert.equal(M.提取回复文本(events, 'nope'), null));
  新家();
  写('MEMORY.md', '已有条目');
  const r = M.写记忆({ 内容: '会话回复（2026-10-24）：把这段回复存进记忆' });
  检查('回复入库：写入并去重', () => assert.equal(r.ok, true) && assert.match(M.读文件('MEMORY.md'), /会话回复/));
}

console.log(`\n  通过 ${pass} · 失败 ${fail}\n`);
process.exit(fail ? 1 : 0);
