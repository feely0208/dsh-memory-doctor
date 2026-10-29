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
  检查('对比：有历史时可对比', () => { assert.equal(对比.可用, true); assert.ok(Array.isArray(对比.新增)); });
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

// ⑨ memories.json 为源：写入/替换/归档都要同步库并重新投影
{
  const 家 = 新家();
  const 库 = { version: 1, entries: [
    { content: '用户偏好 A', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', target: 'user', importance: 'normal' },
    { content: '项目事实 B', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', target: 'memory', importance: 'normal' },
  ]};
  fs.writeFileSync(path.join(家, 'runtime', 'memories.json'), JSON.stringify(库, null, 2));
  fs.writeFileSync(path.join(家, 'runtime', 'USER.md'), '用户偏好 A\n');
  fs.writeFileSync(path.join(家, 'runtime', 'MEMORY.md'), '项目事实 B\n');
  写('MEMORY.md', '');
  const r1 = M.写记忆({ 内容: '项目事实 C' });
  检查('库：append 写入 memories.json', () => {
    assert.equal(r1.ok, true);
    const 新库 = JSON.parse(fs.readFileSync(path.join(家, 'runtime', 'memories.json'), 'utf8'));
    assert.equal(新库.entries.length, 3);
    assert.ok(新库.entries.some((e) => e.content.includes('项目事实 C')));
  });
  检查('库：append 后 md 被重新投影', () => assert.match(M.读文件('MEMORY.md'), /项目事实 C/));
  检查('库：改记忆同步更新库', () => {
    assert.equal(M.改记忆({ 旧文本: '项目事实 C', 内容: '项目事实 C（修订）' }).ok, true);
    const 新库 = JSON.parse(fs.readFileSync(path.join(家, 'runtime', 'memories.json'), 'utf8'));
    assert.ok(新库.entries.some((e) => e.content.includes('修订')));
    assert.match(M.读文件('MEMORY.md'), /修订/);
  });
  检查('库：归档一条从库中移除', () => {
    assert.equal(M.归档一条({ 旧文本: '项目事实 C（修订）' }).ok, true);
    const 新库 = JSON.parse(fs.readFileSync(path.join(家, 'runtime', 'memories.json'), 'utf8'));
    assert.equal(新库.entries.some((e) => e.content.includes('项目事实 C')), false);
  });
  检查('库：同步记忆库补缺失条目', () => {
    写('USER.md', '用户偏好 A\n§\n用户偏好 D\n');
    const r = M.同步记忆库();
    assert.equal(r.ok, true);
    assert.ok(r.新增 >= 1);
    assert.match(M.读文件('USER.md'), /用户偏好 D/);
  });
}


// ⑦ 自动压缩（0.5.7）：到阈值自己动手，可回滚
{
  const 家 = 新家();
  const 字节数 = (x) => Buffer.byteLength(String(x), 'utf8');
  const 造条 = (i) => `第${i}条项目事实：${'细节'.repeat(75)}。`;
  const 造满 = (n) => Array.from({ length: n }, (_, i) => 造条(i + 1));

  // 未到阈值：不触发
  {
    写('MEMORY.md', 造满(2).join('\n§\n') + '\n');
    const r = M.自动压缩({});
    检查('自动压缩：未到阈值不触发', () => {
      assert.equal(r.触发, false);
      assert.equal(字节数(M.读文件('MEMORY.md')), r.之前字节);
    });
  }

  // 到阈值：触发，归档临时条目 + 长条压成首句
  {
    写('MEMORY.md', [...造满(18), '临时：正在调试自动压缩，稍后删掉'].join('\n§\n') + '\n');
    const 前 = 字节数(M.读文件('MEMORY.md'));
    const r = M.自动压缩({});
    检查('自动压缩：到阈值触发', () => {
      assert.equal(r.触发, true);
      assert.ok(r.动作.length > 0);
      assert.ok(r.之后字节 < 前);
      assert.ok(r.之后字节 <= 10240 * 0.8, `压后仍 ${r.之后字节} 字节`);
    });
    检查('自动压缩：临时条目被归档、正文里不再出现', () => {
      assert.equal(M.读文件('MEMORY.md').includes('稍后删掉'), false);
      const 归档 = fs.readFileSync(path.join(家, 'runtime', 'archived', path.basename(r.存档), '归档条目.md'), 'utf8');
      assert.match(归档, /稍后删掉/);
    });
    检查('自动压缩：压缩前整份存档（可回滚）', () => {
      const 存 = path.join(家, 'runtime', 'archived', path.basename(r.存档), 'MEMORY.md');
      assert.equal(字节数(fs.readFileSync(存, 'utf8')), 前);
    });
    检查('自动压缩：关键事实仍在（长条压成首句而非删除）', () => {
      assert.match(M.读文件('MEMORY.md'), /第1条项目事实/);
      assert.ok(M.拆条目(M.读文件('MEMORY.md')).length >= 3);
    });
  }

  // 写入路径自动触发：写之前就发现到阈值
  {
    新家();
    写('MEMORY.md', 造满(18).join('\n§\n') + '\n');
    const r = M.写记忆({ 目标: 'MEMORY.md', 内容: '新增：写入时的自动压缩触发验证' });
    检查('自动压缩：写记忆时自动触发并成功写入', () => {
      assert.equal(r.ok, true);
      assert.ok(r.自动压缩 && r.自动压缩.触发, '写记忆返回值应带自动压缩报告');
      assert.match(M.读文件('MEMORY.md'), /写入时的自动压缩触发验证/);
    });
  }

  // 库是源：压缩后 md 与 memories.json 条数一致
  {
    新家();
    写('MEMORY.md', 造满(18).join('\n§\n') + '\n');
    const 条 = M.拆条目(M.读文件('MEMORY.md'));
    fs.writeFileSync(
      path.join(家, 'runtime', 'memories.json'),
      JSON.stringify({ version: 1, entries: 条.map((c) => ({ content: c, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z', target: 'memory', importance: 'normal' })) }, null, 2),
      'utf8',
    );
    const r = M.自动压缩({});
    const 库 = JSON.parse(fs.readFileSync(path.join(家, 'runtime', 'memories.json'), 'utf8'));
    检查('自动压缩：库与投影同步（条数一致）', () => {
      assert.equal(r.触发, true);
      assert.equal(库.entries.filter((e) => e.target === 'memory').length, M.拆条目(M.读文件('MEMORY.md')).length);
      assert.equal(M.拆条目(M.读文件('MEMORY.md')).length, 库.entries.length);
    });
  }
}


// ⑧ 临时条目判定精度：只看开头 40 字（2026-10-26 误报修复）
{
  新家();
  const 规则 = '记忆预算规则：MEMORY.md 每轮全文注入且上限 10KB，到 80% 会自动归档临时/阶段性条目，别误判';
  写('MEMORY.md', ['临时：正在调试，回头删', 规则].join('\n§\n') + '\n');
  const r = M.体检();
  检查('体检：规则说明里靠后的「临时」不算临时条目（只看开头 40 字）', () => {
    assert.equal(r.摘要.标记计数['可归档(临时/进度类)'], 1);
  });
  检查('自动压缩：只归档开头就是临时/进度类的条目', () => {
    const 满 = [规则];
    for (let i = 0; i < 17; i++) 满.push('第' + i + '条项目事实：' + '细节'.repeat(75) + '。');
    写('MEMORY.md', 满.join('\n§\n') + '\n');
    const c = M.自动压缩({});
    assert.equal(c.触发, true);
    assert.match(M.读文件('MEMORY.md'), /记忆预算规则/);
    assert.equal(M.读文件('MEMORY.md').includes('回头删'), false);
  });
}


// ⑨ 建议分级 + 忽略（0.5.8）
{
  新家();
  const 长条 = '项目事实：' + '细节'.repeat(1000) + '。'; // ~3000 字节？

  // 88% 用量：只进提示，不进警告
  // 注意：中文字符 3 字节，1000 字≈3000 字节 → 3000+3000+2790≈8790/10240≈86%
  写('MEMORY.md', ['甲'.repeat(1000), '乙'.repeat(1000), '丙'.repeat(930)].join('\n§\n') + '\n');
  const r1 = M.体检();
  检查('分级：>85% 只进提示，不进警告', () => {
    assert.equal(r1.警告.length, 0);
    assert.ok(r1.提示.some((s) => /已用/.test(s)), '提示里应有用量提醒');
  });

  // 完全重复：进警告
  新家();
  写('MEMORY.md', ['重复条目：这是一段超过四十字节的完全相同内容，用来验证重复判定。', '重复条目：这是一段超过四十字节的完全相同内容，用来验证重复判定。'].join('\n§\n') + '\n');
  const r2 = M.体检();
  检查('分级：完全重复进警告', () => {
    assert.ok(r2.警告.some((s) => /完全重复/.test(s)));
    assert.equal(r2.提示.length, 0);
  });

  // 超上限：进警告
  新家();
  写('MEMORY.md', '超'.repeat(11000));
  const r3 = M.体检();
  检查('分级：超过上限进警告（写入会被拒）', () => {
    assert.ok(r3.警告.some((s) => /超上限/.test(s)));
  });

  // 忽略：完全重复 2 条 → 忽略一条后不再报
  新家();
  写('MEMORY.md', ['重复条目：这是一段超过四十字节的完全相同内容，用来验证重复判定。', '重复条目：这是一段超过四十字节的完全相同内容，用来验证重复判定。'].join('\n§\n') + '\n');
  const before = M.体检();
  const 指纹 = before.条目[0].指纹;
  const ig = M.设忽略({ 指纹 });
  检查('忽略：写入忽略列表', () => {
    assert.equal(ig.ok, true);
    assert.ok(M.读忽略().includes(指纹));
  });
  检查('忽略：忽略后重复不再进警告', () => {
    const after = M.体检();
    assert.equal(after.警告.length, 0);
    // 两条内容完全相同的条目共用一个指纹，忽略一条即同时忽略（去重的语义就是"这段内容别再提"）
    assert.equal(after.摘要.已忽略, 2);
    assert.equal(after.条目[0].已忽略, true);
  });
  检查('忽略：恢复后重新参与体检', () => {
    M.设忽略({ 指纹, 恢复: true });
    const again = M.体检();
    assert.ok(again.警告.some((s) => /完全重复/.test(s)));
    assert.equal(again.摘要.已忽略, 0);
  });
}

// ⑩ 四层压缩管线（0.5.11）：L1 无损折叠 / L2 落盘 / L3 软压力 / L4 摘要 + 谱系/恢复
// 全部离线：不调 LLM、不联网、不依赖宿主（L4 用注入的假摘要器）
{
  const 字节数 = (x) => Buffer.byteLength(String(x), 'utf8');

  // L1 纯函数：折叠可逆
  {
    新家();
    const 行 = '同一行重复内容：' + '配置'.repeat(60);
    const 原 = ['开头', 行, 行, 行, 行, '结尾'].join('\n');
    const r = M.折叠重复行(原);
    检查('L1 折叠：连续重复行 ≥3 折叠成一行标记', () => {
      assert.equal(r.逆变换.length, 1);
      assert.equal(r.逆变换[0].次数, 4);
      assert.ok(r.省下 > 0);
    });
    检查('L1 折叠：逆变换逐字节还原原文', () => assert.equal(M.还原折叠(r.文本, r.逆变换), 原));
    检查('L1 折叠：省不下字节（短行/只重复 2 次）时不折', () => {
      assert.equal(M.折叠重复行('短行\n短行\n短行').逆变换.length, 0);
      assert.equal(M.折叠重复行('这是比较长的一行内容\n这是比较长的一行内容').逆变换.length, 0);
    });
    检查('L1 折叠：多条记录的标记互不串（同前缀不同行也能各自还原）', () => {
      const 前缀 = '超长前缀相同的一行：';
      const 甲 = 前缀 + 'A'.repeat(100), 乙 = 前缀 + 'B'.repeat(100);
      const 甲文 = Array.from({ length: 4 }, () => 甲).join('\n');
      const 乙文 = Array.from({ length: 5 }, () => 乙).join('\n');
      const ra = M.折叠重复行(甲文), rb = M.折叠重复行(乙文);
      const 全部 = [...ra.逆变换, ...rb.逆变换];
      assert.equal(M.还原折叠(ra.文本, 全部), 甲文);
      assert.equal(M.还原折叠(rb.文本, 全部), 乙文);
    });
  }

  // L2 纯函数：超大内容落盘（头 + 尾 + 路径 + SHA256）
  {
    新家();
    const 大 = '开头摘要' + '内容'.repeat(1000) + '结尾收束';
    const r = M.落盘超大(大, { 路径: 'archived/自动压缩-x/落盘/条目-1.md' });
    检查('L2 落盘：超过阈值触发且变短', () => {
      assert.equal(r.触发, true);
      assert.ok(r.省下 > 0);
      assert.ok(字节数(r.文本) < 字节数(大));
      assert.ok(r.文本.startsWith('开头摘要'));
      assert.ok(r.文本.endsWith('结尾收束'));
      assert.match(r.文本, /全文已落盘 archived\/自动压缩-x\/落盘\/条目-1\.md/);
      assert.match(r.文本, /sha256 [0-9a-f]{64}/);
    });
    检查('L2 落盘：SHA256 可校验，篡改即失败', () => {
      assert.equal(M.校验落盘(大, r.sha256), true);
      assert.equal(M.校验落盘(大 + 'x', r.sha256), false);
    });
    检查('L2 落盘：短内容不落盘', () => assert.equal(M.落盘超大('短内容', { 路径: 'x' }).触发, false));
  }

  // L3 软压力：70% 只提醒不改内容 / 80% 才驱逐
  {
    新家();
    检查('L3 软压力：70% 提醒、80% 驱逐、以下不打扰', () => {
      assert.equal(M.软压力量级(5000, 10240).级别, 'ok');
      assert.equal(M.软压力量级(7200, 10240).级别, '提醒');
      assert.equal(M.软压力量级(8500, 10240).级别, '驱逐');
      assert.match(M.软压力量级(7200, 10240).提示, /软压力线/);
    });
    写('MEMORY.md', '甲'.repeat(2400)); // 72%
    const 原 = M.读文件('MEMORY.md');
    const r = M.自动压缩({});
    检查('L3 软压力：70%~80% 不触发、只给提醒，文件未动', () => {
      assert.equal(r.触发, false);
      assert.match(r.说明, /软压力线/);
      assert.equal(M.读文件('MEMORY.md'), 原);
    });
    检查('L3 软压力：体检在 70% 起给提示（不升警告）', () => {
      const t = M.体检();
      assert.ok(t.提示.some((s) => /软压力线/.test(s)));
      assert.equal(t.警告.length, 0);
    });
  }

  // L3 驱逐：临时/进度类 → 可重放指针 → 超长首句化
  {
    const 家 = 新家();
    const 造条 = (i) => `第${i}条项目事实：${'细节'.repeat(75)}。`;
    const 条目 = [
      '临时：正在调试四层压缩，回头删',
      '旧条目（全文见 archived/自动压缩-2026-01-01/条目.md）',
      ...Array.from({ length: 18 }, (_, i) => 造条(i + 1)),
    ];
    写('MEMORY.md', 条目.join('\n§\n') + '\n');
    const 前 = 字节数(M.读文件('MEMORY.md'));
    const r = M.自动压缩({});
    检查('L3 驱逐：到 80% 触发，归档临时类与可重放指针', () => {
      assert.equal(r.触发, true);
      const 归档动作 = r.动作.filter((a) => a.类型 === '归档');
      assert.ok(归档动作.some((a) => a.优先级 === 0), '应归档临时条目');
      assert.ok(归档动作.some((a) => a.优先级 === 1), '应归档可重放指针');
    });
    检查('L3 驱逐：归档内容可从 归档条目.md 取回', () => {
      const 文 = fs.readFileSync(path.join(家, 'runtime', 'archived', path.basename(r.存档), '归档条目.md'), 'utf8');
      assert.match(文, /正在调试四层压缩/);
      assert.match(文, /全文见 archived/);
    });
    检查('L3 驱逐：压回 80% 以下，原文仍在存档', () => {
      assert.ok(r.之后字节 < 前);
      assert.ok(r.之后字节 <= 10240 * 0.8);
    });
  }

  // L1+L2 管线内生效：逆变换/落盘文件/层快照/谱系齐全
  {
    const 家 = 新家();
    const 行 = '同一行重复内容：' + '配置'.repeat(60);
    const 折叠条 = Array.from({ length: 6 }, () => 行).join('\n');
    const 造条 = (i) => `第${i}条项目事实：${'细节'.repeat(75)}。`;
    写('MEMORY.md', [折叠条, ...Array.from({ length: 18 }, (_, i) => 造条(i + 1))].join('\n§\n') + '\n');
    const r = M.自动压缩({});
    const 存档 = path.join(家, 'runtime', 'archived', path.basename(r.存档));
    检查('管线 L1：折叠动作进报告与逆变换.json', () => {
      assert.equal(r.动作.some((a) => a.类型 === '无损折叠'), true);
      const 逆 = JSON.parse(fs.readFileSync(path.join(存档, '逆变换.json'), 'utf8'));
      assert.ok(逆.L1.length >= 1);
      assert.equal(M.还原折叠(逆.L1[0].标记, 逆.L1), Array.from({ length: 6 }, () => 行).join('\n')); // 单个标记还原成原 6 行
      // 折叠后的条目仍含独有信息，L3 不能把它当「可重放指针」整条驱逐
      assert.match(M.读文件('MEMORY.md'), /⟦dsh-fold-/);
    });
    检查('管线：谱系.json 记录四层状态 + 逐层快照', () => {
      const 谱系 = JSON.parse(fs.readFileSync(path.join(存档, '谱系.json'), 'utf8'));
      assert.deepEqual(谱系.层.map((x) => x.层), ['L1 无损折叠', 'L2 落盘', 'L3 软压力', 'L4 LLM 摘要']);
      assert.equal(谱系.层[0].状态, 'ok');
      const 快照 = fs.readdirSync(path.join(存档, '层快照'));
      assert.ok(快照.length >= 3);
      assert.equal(fs.existsSync(path.join(存档, '层快照', '0-原始.md')), true);
    });
    检查('管线：压缩谱系可列出本次存档', () => {
      const 谱 = M.压缩谱系();
      assert.equal(谱.ok, true);
      assert.ok(谱.存档.some((x) => x.存档 === path.basename(r.存档)));
    });
  }

  // L2 管线内生效：两条超大条目落盘 + SHA256 校验
  {
    const 家 = 新家();
    const 大1 = '条目甲：' + '甲'.repeat(1660) + '。';
    const 大2 = '条目乙：' + '乙'.repeat(1425) + '。';
    写('MEMORY.md', [大1, 大2].join('\n§\n') + '\n');
    const r = M.自动压缩({});
    const 存档 = path.join(家, 'runtime', 'archived', path.basename(r.存档));
    检查('管线 L2：超大条目落盘，上下文留头尾+路径+SHA256', () => {
      assert.equal(r.动作.filter((a) => a.类型 === '落盘').length, 2);
      assert.equal(fs.existsSync(path.join(存档, '落盘', '条目-1.md')), true);
      assert.equal(fs.readFileSync(path.join(存档, '落盘', '条目-1.md'), 'utf8'), 大1);
      assert.match(M.读文件('MEMORY.md'), /全文已落盘 archived\/自动压缩-.*\/落盘\/条目-1\.md/);
    });
    检查('管线 L2：校验压缩报告完整可恢复', () => {
      const v = M.校验压缩({ 存档文件名: path.basename(r.存档) });
      assert.equal(v.ok, true);
      assert.equal(v.可恢复, true);
    });
    检查('管线 L2：落盘文件被篡改 → 校验失败', () => {
      const p = path.join(存档, '落盘', '条目-1.md');
      fs.appendFileSync(p, 'x');
      const v = M.校验压缩({ 存档文件名: path.basename(r.存档) });
      assert.equal(v.可恢复, false);
      assert.ok(v.检查.some((x) => x.ok === false && /SHA256/.test(x.说明)));
    });
  }

  // L4：到摘要线才跑；未注入/抛错/返回空 → 降级不阻断、原文不动
  {
    const 造大条 = (i) => `第${i}条项目事实：${'甲'.repeat(1080)}。`;
    const 造满3 = () => [造大条(1), 造大条(2), 造大条(3)].join('\n§\n') + '\n';

    新家();
    写('MEMORY.md', 造满3());
    const 前 = 字节数(M.读文件('MEMORY.md'));
    const 无 = M.自动压缩({});
    检查('L4 摘要：未注入摘要器 → 跳过（不调 LLM），文件不动', () => {
      assert.equal(无.触发, true);
      assert.equal(无.动作.length, 0);
      assert.match(无.说明, /未注入摘要器/);
      assert.equal(字节数(M.读文件('MEMORY.md')), 前);
      const 谱系 = JSON.parse(fs.readFileSync(path.join(无.存档, '谱系.json'), 'utf8'));
      assert.equal(谱系.层.find((x) => x.层.startsWith('L4')).状态, '跳过');
    });

    新家();
    写('MEMORY.md', 造满3());
    const 抛 = M.自动压缩({ 摘要器: () => { throw new Error('模型超时'); } });
    检查('L4 摘要：摘要器抛错 → 本层降级，不阻断、原文不动', () => {
      assert.equal(抛.动作.length, 0);
      assert.equal(字节数(M.读文件('MEMORY.md')), 前);
      const 谱系 = JSON.parse(fs.readFileSync(path.join(抛.存档, '谱系.json'), 'utf8'));
      assert.equal(谱系.层.find((x) => x.层.startsWith('L4')).状态, '降级');
    });

    新家();
    写('MEMORY.md', 造满3());
    const 空 = M.自动压缩({ 摘要器: () => '' });
    检查('L4 摘要：返回空 → 降级，不写空摘要', () => {
      assert.equal(空.动作.length, 0);
      assert.equal(字节数(M.读文件('MEMORY.md')), 前);
    });
  }

  // L4：注入假摘要器 → 预算内摘要 + 摘要前全量存档 + 可整份恢复
  {
    const 家 = 新家();
    const 造大条 = (i) => `第${i}条项目事实：${'甲'.repeat(1080)}。`;
    const 原文 = [造大条(1), 造大条(2), 造大条(3)].join('\n§\n') + '\n';
    写('MEMORY.md', 原文);
    const 前 = 字节数(M.读文件('MEMORY.md'));
    let 收到预算 = 0;
    const r = M.自动压缩({
      摘要器: (候选, { 预算 }) => { 收到预算 = 预算; return `合并 ${候选.length} 条：` + '要点。'.repeat(40); },
    });
    const 存档 = path.join(家, 'runtime', 'archived', path.basename(r.存档));
    检查('L4 摘要：到 90% 且注入摘要器才执行', () => {
      assert.equal(r.触发, true);
      assert.ok(r.动作.some((a) => a.类型 === '摘要'));
      assert.match(M.读文件('MEMORY.md'), /【摘要】/);
      assert.ok(字节数(M.读文件('MEMORY.md')) < 前);
    });
    检查('L4 摘要：预算预留生效（摘要上限 = 15% 上限）', () => {
      assert.equal(收到预算, 1536);
      const 摘要条 = M.拆条目(M.读文件('MEMORY.md')).find((t) => t.startsWith('【摘要】'));
      assert.ok(字节数(摘要条) <= 1536);
    });
    检查('L4 摘要：摘要前全量存档 + 最新条目保留', () => {
      assert.equal(fs.readFileSync(path.join(存档, '摘要前-MEMORY.md'), 'utf8'), 原文);
      assert.match(M.读文件('MEMORY.md'), /第3条项目事实/);
    });
    检查('L4 摘要：校验压缩 OK，可整份回滚', () => {
      const v = M.校验压缩({ 存档文件名: path.basename(r.存档) });
      assert.equal(v.可恢复, true);
      const 未确认 = M.恢复压缩({ 存档文件名: path.basename(r.存档) });
      assert.equal(未确认.ok, false);
      const 恢复 = M.恢复压缩({ 存档文件名: path.basename(r.存档), 确认: true });
      assert.equal(恢复.ok, true);
      assert.equal(字节数(M.读文件('MEMORY.md')), 前);
      assert.equal(fs.readFileSync(path.join(家, 'runtime', 'MEMORY.md'), 'utf8'), 原文);
      assert.equal(fs.existsSync(恢复.备份), true);
    });
  }
}

// ⑦ 趋势图 / 实时曲线（2026-10-28：历史字节键写错导致曲线恒 0）
{
  const 客户端 = fs.readFileSync(path.join(包根, 'lib/client.js'), 'utf8');
  const 宿主 = fs.readFileSync(path.join(包根, 'lib/index.js'), 'utf8');
  检查('历史字节键已定义（MEMORY字节 / USER字节）', () => {
    assert.match(客户端, /const 字节键 =/);
  });
  检查('折线点按字节键取数（不再按文件名取，避免恒 0）', () => {
    assert.match(客户端, /百分比\(h\[字节键\(文件\)\]/);
  });
  检查('迷你趋势取最后一条的字节字段', () => {
    assert.match(客户端, /const 最后字节 = 最后\[字节键\(文件\)\]/);
  });
  检查('实时曲线组件已接入面板', () => {
    assert.match(客户端, /dmd-live/);
    assert.match(客户端, /\/live/);
  });
  检查('宿主提供 /api/live 实时采样', () => {
    assert.match(宿主, /api\/live/);
    assert.match(宿主, /statSync\(join\(运行时目录\(\), 名\)\)/);
  });
}

console.log(`\n  通过 ${pass} · 失败 ${fail}\n`);
process.exit(fail ? 1 : 0);
