#!/usr/bin/env node
/**
 * 深鲸记忆 · 命令行入口（零依赖）
 *
 * 面板里能做的事，换机/异地/自动化时也能在终端做完：
 *   pack export                 导出记忆包（含 MANIFEST 校验清单）
 *   pack verify <包目录>        只校验，不写任何东西
 *   pack import <包目录>        预览会导入什么（dry-run）
 *   pack import <包目录> --apply 校验通过才写入（落盘前自动备份）
 *   report [--存档 名称|--last] 看最近一次压缩的前后对比
 *   plan                        生成清理预案（写到待审文件，不自动删）
 *   check                       看体检结论
 *   digest                      把会话日志提炼成记忆草稿（只读，不写记忆）
 *   compress preview            预览四层压缩会做什么（不写任何东西）
 *   compress undo --yes         撤销上一次压缩（整份放回压缩前状态）
 *   compress auto|manual        压缩模式：自动 / 手动（到 80% 拦截）
 *   audit [关键词]              看审计账本（哈希链是否完整）或某条记忆的来龙去脉
 *
 * 记忆根默认 ~/.mnemon，可用 MEMORY_DOCTOR_HOME 指定（测试/多环境用）。
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const 包根 = join(dirname(fileURLToPath(import.meta.url)), '..');
const M = await import(join(包根, 'lib/index.js'));
const D = await import(join(包根, 'lib/digest.js'));

const 参 = process.argv.slice(2);
const 子 = (参[0] || '').toLowerCase();
const 余 = 参.slice(1).filter((x) => !x.startsWith('--'));
const 旗标 = new Set(参.filter((x) => x.startsWith('--')));

function 打印(t) { process.stdout.write(t + '\n'); }
function 失败(信息, 附加) {
  console.error('✗ ' + 信息);
  if (附加) console.error(JSON.stringify(附加, null, 2));
  process.exit(1);
}

function 校验行(查) {
  打印(`记忆包：${查.版本 >= 2 ? 'v2（带 sha256）' : 'v1（旧格式，无校验和）'}`);
  const 统 = 查.统计 || {};
  if (统.文件数 != null) 打印(`文件 ${统.文件数} 个 · ${统.总字节} 字节 · MEMORY ${统.MEMORY条目 || 0} 条 · USER ${统.USER条目 || 0} 条 · 归档 ${统.归档文件数 || 0} 个`);
  const 坏 = 查.校验.filter((x) => !x.ok);
  打印(查.可导入 ? '校验：通过 ✓' : '校验：未通过 ✗');
  for (const x of 坏.slice(0, 20)) 打印(`  - ${x.路径}：${x.说明}`);
  if (查.未列出 && 查.未列出.length) 打印(`未列入清单、导入会跳过的文件：${查.未列出.length} 个`);
}

function 预览行(预览) {
  for (const [名, v] of Object.entries(预览.合并 || {})) 打印(`  ${名}：新增 ${v.新增} 条，重复跳过 ${v.跳过重复} 条`);
  for (const [名, v] of Object.entries(预览.文件类 || {})) 打印(`  ${名}/：新增 ${v.新增}，相同跳过 ${v.跳过相同}，同名不同内容 ${v.同名不同内容}`);
  if (预览.配置) 打印(`  配置 doctor.json：${预览.配置.会导入 ? '会导入' : '不导入（本机已有配置或包里没有）'}`);
}

if (子 === 'pack') {
  const 动作 = (余[0] || '').toLowerCase();
  if (动作 === 'export') {
    const r = M.导出记忆包();
    打印(r.说明);
    打印('目录：' + r.目录);
    打印(`MEMORY ${r.统计.MEMORY条目} 条 · USER ${r.统计.USER条目} 条 · 归档 ${r.统计.归档文件数} 个 · 共 ${r.统计.总字节} 字节`);
  } else if (动作 === 'verify' || 动作 === 'check') {
    const 目录 = 余[1];
    if (!目录) 失败('用法：pack verify <包目录>');
    const 查 = M.检查记忆包({ 目录 });
    if (!查.ok) 失败(查.错误);
    校验行(查);
    process.exit(查.可导入 ? 0 : 2);
  } else if (动作 === 'import') {
    const 目录 = 余[1];
    if (!目录) 失败('用法：pack import <包目录> [--apply]');
    const r = M.导入记忆包({ 目录, 确认: 旗标.has('--apply') });
    if (!r.ok && !r.需要确认) 失败(r.错误 || '导入失败', r.校验);
    if (r.需要确认) {
      打印('预览（还没有写入任何东西）：');
      校验行(r.校验);
      预览行(r.预览);
      打印('');
      打印('核对无误后执行：pack import ' + 目录 + ' --apply');
      process.exit(0);
    }
    校验行(r.校验);
    预览行({ 合并: r.合并, 文件类: r.导入, 配置: r.配置 });
    打印(`备份：${r.备份}`);
    打印(r.说明);
  } else {
    失败('可用：pack export | pack verify <目录> | pack import <目录> [--apply]');
  }
} else if (子 === 'report') {
  const 存档 = 余[1] || '';
  const r = 存档 || 旗标.has('--last') ? M.压缩报告({ 存档文件名: 存档, 最近: !存档 }) : M.压缩报告({ 最近: true });
  if (!r.ok) 失败(r.错误 || '还没有压缩报告（记忆到 80% 自动压缩后才会生成）');
  if (旗标.has('--json')) { 打印(JSON.stringify(r.报告, null, 2)); }
  else {
    const 报 = r.报告;
    打印(`压缩核对 · ${报.文件} · ${报.时间}`);
    打印(`前后：${报.前.条目数} 条 / ${报.前.字节} 字节（${报.前.百分比}%）→ ${报.后.条目数} 条 / ${报.后.字节} 字节（${报.后.百分比}%）`);
    打印(`各层：折叠 ${报.层计数.折叠} 处 · 落盘 ${报.层计数.落盘} 条 · 归档 ${报.层计数.归档} 条 · 首句化 ${报.层计数.首句化} 条 · 摘要 ${报.层计数.摘要} 条`);
    打印('结论：' + 报.结论);
    打印('');
    for (const [i, s] of (报.抽样 || []).entries()) {
      打印(`[${i + 1}] ${s.层} · 条目 #${s.条目 ?? '-'}`);
      打印('  原文：' + s.原文);
      打印('  之后：' + s.折叠后);
    }
    打印('');
    打印('报告文件：' + (r.路径 || ''));
  }
} else if (子 === 'compress') {
  const 动作 = (余[0] || '').toLowerCase();
  const 文件 = (参.find((x) => x.startsWith('--file=')) || '').split('=')[1] === 'USER.md' ? 'USER.md' : 'MEMORY.md';
  if (动作 === 'preview') {
    const r = M.预览压缩({ 文件 });
    if (!r.触发) { 打印(r.说明 || `未到压缩线（${r.之前字节}/${r.限} 字节），无需压缩`); process.exit(0); }
    打印(r.说明);
    打印(`预览：${r.之前字节} → ${r.之后字节} 字节（${r.百分比}%）；预计 ${r.动作.length} 个动作`);
    for (const a of r.动作) 打印(`  - ${a.类型} · 条目 #${a.序号 ?? '-'}${a.摘要 ? ' · ' + a.摘要 : ''}`);
  } else if (动作 === 'undo') {
    const r = M.撤销压缩({ 确认: 旗标.has('--yes') });
    if (!r.ok) {
      打印(r.需要确认 ? r.错误 : '撤销失败：' + (r.错误 || ''));
      if (r.需要确认) 打印('确认后执行：compress undo --yes');
      process.exit(r.需要确认 ? 0 : 1);
    }
    打印(r.说明);
  } else if (动作 === 'auto' || 动作 === 'manual') {
    打印(M.设自动压缩模式(动作).说明);
  } else {
    失败('可用：compress preview [--file=USER.md] | compress undo --yes | compress auto | compress manual');
  }
} else if (子 === 'audit') {
  const 查 = 余[0] || '';
  const 概要 = M.审计概要();
  打印(概要.说明);
  if (查) {
    const r = M.记忆溯源(查);
    for (const x of r.命中.slice(-20)) {
      打印(`${x.时间} · ${x.动作} · ${x.目标}${x.会话 ? ' · ' + x.会话 : ''}`);
      if (x.备注) 打印('    ' + x.备注);
    }
    if (!r.命中.length) 打印('没有相关记录');
  } else {
    const 记录们 = M.读审计();
    打印(`动作：${Object.entries(概要.动作计数).map(([k, v]) => k + ' ' + v).join(' · ') || '无'}`);
    for (const x of 记录们.slice(-15).reverse()) 打印(`- ${x.时间.slice(0, 19).replace('T', ' ')} ［${x.动作}］${x.目标 || ''}${x.摘要 !== undefined ? '' : ''}${x.条目摘要 ? ' · ' + x.条目摘要.slice(0, 40) : ''}${x.会话 ? '（' + x.会话 + '）' : ''}`);
    const 模 = M.自动压缩模式();
    打印(`压缩模式：${模 === 'manual' ? '手动（到 80% 拦截）' : '自动'}`);
  }
} else if (子 === 'plan') {
  const r = M.生成清理预案();
  if (!r.ok) 失败(r.错误 || '生成失败');
  打印(`已生成清理预案（不会自动删除任何东西）：${r.路径}`);
  打印(`可处理 ${r.条目数} 条，预计腾出 ${r.腾出字节} 字节`);
  for (const x of r.明细.slice(0, 12)) 打印(`  - ${x.文件} #${x.序号} ${x.动作}：${x.摘要}`);
} else if (子 === 'check') {
  const 目标参 = 参.find((x) => x.startsWith('--目标='));
  const 目标 = 目标参 ? Number(目标参.split('=')[1]) : undefined;
  const r = M.体检(目标 ? { 目标百分比: 目标 } : {});
  for (const [名, 档] of Object.entries(r.文件)) 打印(`${名}：${档.大小}/${档.上限} 字节（${档.百分比}%），${档.条目数} 条`);
  打印('');
  打印('结论：' + (r.缺口 ? r.缺口.一句话 : '（无）'));
  打印('');
  for (const s of r.建议) 打印('- ' + s);
  if (r.具体建议 && r.具体建议.length) {
    打印('');
    打印('可执行建议：');
    for (const x of r.具体建议.slice(0, 10)) 打印('  - ' + x.文本);
  }
} else if (子 === 'digest') {
  const 取 = (名, 默认) => {
    const 项 = 参.find((x) => x.startsWith(`--${名}=`));
    if (项) return 项.split('=').slice(1).join('=');
    const i = 参.indexOf(`--${名}`);
    return i >= 0 && 参[i + 1] && !参[i + 1].startsWith('--') ? 参[i + 1] : 默认;
  };
  const 选项 = {
    工作区: 取('workspace', ''),
    根: 取('root', undefined),
    上限: Number(取('limit', 200)) || 200,
    起始: 取('since', '') ? new Date(取('since', '')).getTime() : null,
  };
  if (选项.根 == null) delete 选项.根;
  const r = D.提炼(选项);
  if (!r.ok) 失败(r.错误);
  if (旗标.has('--json')) {
    打印(JSON.stringify({ ok: true, 汇总: r.汇总 }, null, 2));
  } else {
    打印(r.草稿);
  }
  const 输出 = 取('out', '');
  if (输出) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(输出, r.草稿, 'utf8');
    if (!旗标.has('--json')) { 打印(''); 打印('草稿已写到：' + 输出); }
  }
} else {
  打印('深鲸记忆 · 命令行');
  打印('  pack export | pack verify <目录> | pack import <目录> [--apply]');
  打印('  report [--last | --存档 名称] [--json]');
  打印('  plan | check');
  打印('  compress preview | compress undo --yes | compress auto | compress manual');
  打印('  audit [关键词]');
  打印('  digest [--workspace <关键词>] [--limit N] [--since YYYY-MM-DD] [--out 文件] [--json]');
  process.exit(子 ? 2 : 0);
}
