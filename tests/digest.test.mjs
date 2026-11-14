#!/usr/bin/env node
/**
 * digest 子命令验证：造两个纯文本会话（不压缩，避免依赖 zstd），
 * 检查统计正确、注入样板被剔除、未完成待办与候选条目都在。
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
const ok = (m) => { console.log(`  ✅ ${m}`); pass += 1; };
const bad = (m) => { console.log(`  ❌ ${m}`); fail += 1; };

const tmp = mkdtempSync(join(tmpdir(), 'dsh-digest-'));
const wsDir = join(tmp, 'sessions', '--Users-mac-Demo~0020App--', 'session-aaa');
mkdirSync(wsDir, { recursive: true });

const ev = (o) => JSON.stringify(o);
const lines = [
  ev({ type: 'session', version: 4, id: 'session-aaa', createdAt: Date.parse('2026-11-01T08:00:00Z'), cwd: '/Users/mac/Demo App' }),
  ev({ type: 'user/message', seq: 1, time: 1, data: { role: 'user', content: [{ type: 'text', text: '把官网的插件页补上 pdf-kit 的 OCR 说明' }] } }),
  ev({ type: 'user/message', seq: 2, time: 2, data: { role: 'user', content: [{ type: 'text', text: '把官网的插件页补上 pdf-kit 的 OCR 说明\n\nTime sampled while preparing turn 1\nCurrent runtime context. blah' }] } }),
  ev({ type: 'todo/write', seq: 3, time: 3, data: { todos: [{ content: '发布 pdf-kit 0.1.3', status: 'pending' }, { content: '已经做完的事', status: 'completed' }] } }),
  ev({ type: 'tool/call', seq: 4, time: 4, data: { name: 'bash', arguments: '{}' } }),
];
writeFileSync(join(wsDir, 'session.jsonl'), lines.join('\n') + '\n');

const run = (args) => spawnSync(process.execPath, [join(ROOT, 'scripts/cli.mjs'), 'digest', '--root', join(tmp, 'sessions'), ...args], { encoding: 'utf8' });

const r1 = run(['--json']);
let j = null;
try { j = JSON.parse(r1.stdout); } catch {}
r1.status === 0 ? ok('digest 退出 0') : bad(`退出 ${r1.status}: ${r1.stderr.slice(0, 200)}`);
j?.汇总?.会话数 === 1 ? ok('会话数统计正确') : bad(`会话数不对：${r1.stdout.slice(0, 200)}`);
j?.汇总?.消息数 === 2 ? ok('用户消息数正确') : bad(`消息数不对：${j?.汇总?.消息数}`);
j?.汇总?.未完成?.length === 1 ? ok('只保留未完成待办') : bad(`待办筛选不对：${JSON.stringify(j?.汇总?.未完成)}`);

const r2 = run([]);
const 文本 = r2.stdout;
文本.includes('Time sampled') ? bad('注入样板没被剔除') : ok('注入样板已剔除');
文本.includes('会话提炼草稿') && 文本.includes('[候选]') ? ok('草稿结构与候选条目齐全') : bad('草稿结构缺失');
文本.includes('反复出现的问题') && /把官网的插件页.*（2 次）/.test(文本) ? ok('重复提问被合并计数') : bad('重复提问统计不对');

const 输出 = join(tmp, 'draft.md');
const r3 = run(['--out', 输出]);
existsSync(输出) && readFileSync(输出, 'utf8').includes('会话提炼草稿') ? ok('--out 落盘') : bad('--out 没写出文件');

rmSync(tmp, { recursive: true, force: true });
console.log(`  digest：通过 ${pass} · 失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
