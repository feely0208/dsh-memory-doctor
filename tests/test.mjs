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

console.log(`\n  通过 ${pass} · 失败 ${fail}\n`);
process.exit(fail ? 1 : 0);
