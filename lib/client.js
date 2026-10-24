/**
 * 深鲸记忆 —— 客户端半边（面板 UI）
 *
 * 设计对标：宿主自带「记忆系统」（dsh-mnemon 的面板）。
 * 信息架构学它的「状态卡片 + 分页签 + 清晰分组」，但不复刻它的 provider/记忆空间生态；
 * 我们的差异是「记忆管家」：用量、重复、可归档项、备份与恢复、记忆包迁移。
 *
 * 约束：
 *   · 不 require 任何 Harness 客户端包（官方插件规范），纯 React.createElement；
 *   · 只引用主题令牌 --dsw-alias-*（全部带 fallback，令牌改版最多外观退化）；
 *   · 数据全部走本地 HTTP（见 lib/index.js），不联网、不上传。
 */
window.__ModuleLoader__.load({
  id: 'dsh-memory-doctor',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const react = require('react');
    const h = react.createElement;

    const SLOT_ICON = 'sidebar.panellist';
    const SLOT_MAIN = 'main';
    const PANEL_ID = 'memory-doctor';
    const API = '/dsh-memory-doctor/api';
    const BADGE = API + '/badge';

    // ── HTTP ──────────────────────────────────────────────────────
    async function api(path, options) {
      const res = await fetch(`${API}${path}`, {
        headers: { 'content-type': 'application/json' },
        ...options,
        body: options && options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { 错误: text }; }
      if (!res.ok) throw new Error((data && (data.错误 || data.error)) || `HTTP ${res.status}`);
      return data;
    }

    const 千分 = (n) => (n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B');
    const 时间 = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      const p = (x) => String(x).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    };

    // ── 样式（宿主令牌 + 克制版式：白卡片、细描边、12px 圆角、不堆阴影）──
    const CSS = `
.dmd-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13.5px;line-height:1.6}
.dmd-head{display:flex;align-items:center;gap:11px;padding:16px 24px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex:none;flex-wrap:wrap}
.dmd-logo{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);flex:none}
.dmd-title{font-weight:700;font-size:17px;letter-spacing:-.01em;line-height:1.3}
.dmd-sub{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}
.dmd-spacer{flex:1}
.dmd-scroll{flex:1;min-height:0;overflow:auto;padding:18px 24px 28px;display:flex;flex-direction:column;gap:16px}

.dmd-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:999px;font-size:10.5px;line-height:1.7;border:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-base);white-space:nowrap}
.dmd-chip-brand{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dmd-chip-warn{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}
.dmd-chip-err{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dmd-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary);flex:none}

.dmd-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:32px;padding:0 14px;border-radius:9px;font-weight:550;border:.5px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap;transition:background .12s ease,opacity .12s ease}
.dmd-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2))}
.dmd-btn:disabled{opacity:.45;cursor:not-allowed}
.dmd-btn.sm{height:27px;padding:0 10px;font-size:11.5px;border-radius:8px}
.dmd-btn-primary{background:var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary));border-color:transparent;color:var(--dsw-alias-label-primary-foreground);font-weight:650}
.dmd-btn-danger{color:var(--dsw-alias-state-error-primary)}

.dmd-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
@media (max-width:900px){.dmd-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.dmd-stat{border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;padding:14px 16px;background:var(--dsw-alias-bg-base);display:flex;flex-direction:column;gap:6px;min-height:104px}
.dmd-stat-k{font-size:11.5px;color:var(--dsw-alias-label-secondary);display:flex;align-items:center;gap:6px}
.dmd-stat-v{font-size:21px;font-weight:700;letter-spacing:-.02em;line-height:1.15}
.dmd-stat-v small{font-size:11.5px;font-weight:400;color:var(--dsw-alias-label-secondary);margin-left:4px;letter-spacing:0}
.dmd-bar{height:5px;border-radius:99px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;margin-top:2px}
.dmd-bar>i{display:block;height:100%;border-radius:99px;background:var(--dsw-alias-brand-primary);transition:width .25s ease}
.dmd-bar>i.warn{background:var(--dsw-alias-state-warn-primary)}
.dmd-bar>i.err{background:var(--dsw-alias-state-error-primary)}

.dmd-card{border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-base);overflow:hidden}
.dmd-card-h{display:flex;align-items:center;gap:8px;padding:13px 16px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.dmd-card-t{font-weight:650;font-size:13px}
.dmd-card-b{padding:14px 16px}
.dmd-muted{color:var(--dsw-alias-label-secondary);font-size:12px}
.dmd-issue{display:flex;gap:8px;align-items:flex-start;padding:9px 11px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);font-size:12.5px;line-height:1.6;margin-top:8px}
.dmd-issue:first-child{margin-top:0}
.dmd-issue .ic{flex:none;margin-top:1px;color:var(--dsw-alias-state-warn-primary)}
.dmd-issue.ok .ic{color:var(--dsw-alias-state-success-primary)}

.dmd-tabs{display:flex;gap:2px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex:none;padding:0 2px}
.dmd-tab{position:relative;height:36px;padding:0 14px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;cursor:pointer;border-radius:8px 8px 0 0}
.dmd-tab:hover{color:var(--dsw-alias-label-primary)}
.dmd-tab[data-on="true"]{color:var(--dsw-alias-label-primary);font-weight:650}
.dmd-tab[data-on="true"]:after{content:'';position:absolute;left:10px;right:10px;bottom:-1px;height:2px;border-radius:2px;background:var(--dsw-alias-brand-primary)}

.dmd-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.dmd-search{flex:1;min-width:180px;display:flex;align-items:center;gap:7px;height:34px;padding:0 11px;border:.5px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary)}
.dmd-search input{flex:1;border:0;outline:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px}
.dmd-seg{display:inline-flex;padding:2px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);gap:2px;flex-wrap:wrap}
.dmd-seg button{height:26px;padding:0 10px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer}
.dmd-seg button[data-on="true"]{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.06)}

.dmd-group{margin-top:14px}
.dmd-group:first-child{margin-top:0}
.dmd-group-h{display:flex;align-items:center;gap:8px;padding:0 2px 8px;color:var(--dsw-alias-label-secondary);font-size:11.5px;letter-spacing:.02em}
.dmd-entry{display:flex;gap:10px;align-items:flex-start;padding:11px 13px;border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base);margin-top:7px;transition:border-color .12s ease}
.dmd-entry:hover{border-color:var(--dsw-alias-border-l2)}
.dmd-entry[data-sel="true"]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
.dmd-entry input[type=checkbox]{margin:3px 0 0;flex:none;accent-color:var(--dsw-alias-brand-primary)}
.dmd-entry-main{flex:1;min-width:0}
.dmd-entry-top{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:4px}
.dmd-idx{font-size:10.5px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.dmd-txt{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12.8px;line-height:1.65}
.dmd-txt.clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.dmd-more{background:none;border:0;color:var(--dsw-alias-brand-primary);font:inherit;font-size:11.5px;cursor:pointer;padding:2px 0;margin-top:2px}
.dmd-selbar{position:sticky;bottom:0;display:flex;gap:10px;align-items:center;padding:11px 16px;border-top:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);margin:16px -24px -28px;padding-left:24px;padding-right:24px;flex-wrap:wrap}
.dmd-empty{padding:36px 16px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12.5px;display:flex;flex-direction:column;align-items:center;gap:8px}
.dmd-foot{display:flex;justify-content:flex-end;padding-top:4px}
.dmd-toast{position:fixed;right:24px;bottom:24px;z-index:30;max-width:min(420px,calc(100vw - 48px));padding:10px 14px;border-radius:10px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);box-shadow:0 10px 30px rgba(0,0,0,.18);font-size:12.5px;line-height:1.55}
.dmd-toast[data-kind="err"]{border-color:var(--dsw-alias-state-error-primary)}
.dmd-toast[data-kind="ok"]{border-color:var(--dsw-alias-state-success-primary)}
.dmd-kv{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.dmd-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dmd-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.dmd-file-row{display:flex;gap:10px;align-items:center;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;margin-top:8px;flex-wrap:wrap}
.dmd-file-row:first-child{margin-top:0}
.dmd-file-name{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;flex:1;min-width:180px;overflow-wrap:anywhere}
.dmd-input{height:32px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;min-width:200px}
`;

    // ── 小组件 ────────────────────────────────────────────────────
    const Icon = (p) => h('svg', { width: p.size || 16, height: p.size || 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', ...(p.style || {}) }, p.children);
    /** 大脑图标：和「记忆」直接相关，替换掉之前那个像摄像头/蛋的鲸鱼轮廓。 */
    const IcoBrain = (p) => Icon({ ...p, children: [
      h('path', { key: 'l', d: 'M12 5.2a3 3 0 0 0-5.8-1A3 3 0 0 0 4.1 8a3 3 0 0 0 .4 5 3 3 0 0 0 2.8 3.9A3 3 0 0 0 12 19Z' }),
      h('path', { key: 'r', d: 'M12 5.2a3 3 0 0 1 5.8-1A3 3 0 0 1 19.9 8a3 3 0 0 1-.4 5 3 3 0 0 1-2.8 3.9A3 3 0 0 1 12 19Z' }),
      h('path', { key: 'm', d: 'M12 5v14' }),
      h('path', { key: 'f1', d: 'M8.2 9.2c.7.1 1.2.6 1.3 1.3' }),
      h('path', { key: 'f2', d: 'M15.8 9.2c-.7.1-1.2.6-1.3 1.3' }),
      h('path', { key: 'f3', d: 'M8.3 14.3c.7-.1 1.2-.5 1.4-1.2' }),
      h('path', { key: 'f4', d: 'M15.7 14.3c-.7-.1-1.2-.5-1.4-1.2' }),
    ] });
    const IcoRefresh = () => Icon({ children: [h('path', { key: 'a', d: 'M20 11a8 8 0 1 0-2.3 5.7' }), h('path', { key: 'b', d: 'M20 5v6h-6' })] });
    const IcoExport = () => Icon({ children: [h('path', { key: 'a', d: 'M12 3v11' }), h('path', { key: 'b', d: 'm8 10 4 4 4-4' }), h('path', { key: 'c', d: 'M5 19h14' })] });
    const IcoAlert = () => Icon({ children: [h('path', { key: 'a', d: 'M12 4 3 20h18L12 4Z' }), h('path', { key: 'b', d: 'M12 9v5' }), h('circle', { key: 'c', cx: '12', cy: '17', r: '.6', fill: 'currentColor' })] });
    const IcoCheck = () => Icon({ children: [h('path', { key: 'a', d: 'm5 12 4 4L19 6' })] });
    const IcoSearch = () => Icon({ children: [h('circle', { key: 'a', cx: '11', cy: '11', r: '6' }), h('path', { key: 'b', d: 'm16 16 4 4' })] });
    const IcoArchive = () => Icon({ children: [h('path', { key: 'a', d: 'M4 8h16v11H4z' }), h('path', { key: 'b', d: 'M3 4h18v4H3z' }), h('path', { key: 'c', d: 'M10 12h4' })] });
    const IcoPackage = () => Icon({ children: [h('path', { key: 'a', d: 'M12 3 4 7v10l8 4 8-4V7l-8-4Z' }), h('path', { key: 'b', d: 'm4 7 8 4 8-4' }), h('path', { key: 'c', d: 'M12 11v10' })] });

    const Chip = (p) => h('span', { className: 'dmd-chip' + (p.tone ? ' dmd-chip-' + p.tone : '') }, p.children);
    const Bar = ({ 百分比, size }) => {
      const tone = 百分比 >= 90 ? 'err' : 百分比 >= 75 ? 'warn' : '';
      return h('div', { className: 'dmd-bar', style: { height: size || 5 } }, h('i', { className: tone, style: { width: Math.min(100, 百分比) + '%' } }));
    };
    const Stat = ({ 标题, 值, 备注, 百分比, 颜色 }) => h('div', { className: 'dmd-stat' }, [
      h('div', { key: 'k', className: 'dmd-stat-k' }, 标题),
      h('div', { key: 'v', className: 'dmd-stat-v' }, 值, 备注 ? h('small', null, 备注) : null),
      百分比 !== undefined ? h(Bar, { key: 'b', 百分比 }) : null,
    ]);

    function 标记Tone(标记) {
      if (标记.includes('重复') || 标记.includes('近重复')) return 'warn';
      if (标记.includes('可归档')) return 'warn';
      return '';
    }

    function 条目行({ e, 选中, onToggle }) {
      const [展开, 设展开] = react.useState(false);
      const key = e.文件 + '#' + e.序号;
      return h('div', { className: 'dmd-entry', 'data-sel': 选中 ? 'true' : 'false' }, [
        h('input', { key: 'c', type: 'checkbox', checked: !!选中, onChange: (ev) => onToggle(key, ev.target.checked) }),
        h('div', { key: 'm', className: 'dmd-entry-main' }, [
          h('div', { key: 'top', className: 'dmd-entry-top' }, [
            h('span', { key: 'f', className: 'dmd-chip dmd-chip-brand' }, e.文件),
            h('span', { key: 'i', className: 'dmd-idx' }, '#' + e.序号),
            ...e.标记.map((m) => h(Chip, { key: 'm' + m, tone: 标记Tone(m) }, m)),
            h('span', { key: 'b', className: 'dmd-muted', style: { marginLeft: 'auto' } }, e.字节 + ' B'),
          ]),
          h('div', { key: 't', className: 'dmd-txt' + (展开 ? '' : ' clamp') }, e.全文 || e.摘要),
          (e.全文 && e.全文.length > 160)
            ? h('button', { key: 'x', className: 'dmd-more', onClick: () => 设展开(!展开) }, 展开 ? '收起' : '展开全文')
            : null,
        ]),
      ]);
    }

    // ── 主面板 ────────────────────────────────────────────────────
    function 面板() {
      const [数据, 设数据] = react.useState(null);
      const [归档数据, 设归档数据] = react.useState(null);
      const [载入, 设载入] = react.useState(true);
      const [忙碌, 设忙碌] = react.useState(false);
      const [错误, 设错误] = react.useState('');
      const [提示, 设提示] = react.useState(null);
      const [页, 设页] = react.useState('overview');
      const [筛选, 设筛选] = react.useState('all');
      const [搜索, 设搜索] = react.useState('');
      const [选中, 设选中] = react.useState({});
      const [导入路径, 设导入路径] = react.useState('');
      const [导入确认, 设导入确认] = react.useState(false);
      const [导出结果, 设导出结果] = react.useState('');
      const [恢复确认, 设恢复确认] = react.useState(null);

      const 说 = (文本, kind) => { 设提示({ 文本, kind: kind || 'ok' }); setTimeout(() => 设提示(null), 4200); };

      async function 刷新(静默) {
        if (!静默) 设载入(true);
        设错误('');
        try {
          const [d, a] = await Promise.all([api('/audit'), api('/archive')]);
          设数据(d); 设归档数据(a); 设选中({});
        } catch (e) { 设错误(String(e && e.message || e)); }
        finally { 设载入(false); }
      }
      react.useEffect(() => { 刷新(); }, []);

      async function 执行(fn, 成功文案) {
        设忙碌(true);
        try { const r = await fn(); await 刷新(true); 说(typeof 成功文案 === 'function' ? 成功文案(r) : 成功文案, 'ok'); return r; }
        catch (e) { 说('操作失败：' + String(e && e.message || e), 'err'); }
        finally { 设忙碌(false); }
      }

      function 勾选(key, on) {
        设选中((prev) => { const n = { ...prev }; if (on) n[key] = true; else delete n[key]; return n; });
      }
      function 全选(entries, on) {
        设选中((prev) => {
          const n = { ...prev };
          for (const e of entries) { const k = e.文件 + '#' + e.序号; if (on) n[k] = true; else delete n[k]; }
          return n;
        });
      }

      const 体检 = 数据 && 数据.体检;
      const 条目 = (体检 && 体检.条目) || [];
      const 选中的条目 = 条目.filter((e) => 选中[e.文件 + '#' + e.序号]);
      const 归档文件 = (归档数据 && 归档数据.文件) || [];

      const 过滤 = 条目.filter((e) => {
        if (筛选 === 'MEMORY' && e.文件 !== 'MEMORY.md') return false;
        if (筛选 === 'USER' && e.文件 !== 'USER.md') return false;
        if (筛选 === 'archive' && !e.标记.some((m) => m.includes('可归档'))) return false;
        if (筛选 === 'dup' && !e.标记.some((m) => m.includes('重复'))) return false;
        if (搜索 && !(e.全文 || e.摘要 || '').toLowerCase().includes(搜索.toLowerCase())) return false;
        return true;
      });

      async function 归档选中() {
        const 组 = {};
        for (const e of 选中的条目) (组[e.文件] = 组[e.文件] || []).push(e.序号);
        const 结果 = [];
        for (const [文件, 序号们] of Object.entries(组)) {
          const r = await api('/slim', { method: 'POST', body: { 文件, 序号们, 确认: true } });
          if (!r.ok) throw new Error(r.错误 || '归档失败');
          结果.push(`${文件} 归档 ${r.归档条数} 条（省 ${r.省下字节} 字节）`);
        }
        return 结果.join('；');
      }

      // 概览数据
      const mem = 体检 && 体检.文件 && 体检.文件['MEMORY.md'];
      const usr = 体检 && 体检.文件 && 体检.文件['USER.md'];
      const 标记 = (体检 && 体检.摘要 && 体检.摘要.标记计数) || {};
      const 需关注 = (体检 && 体检.建议) || [];
      const 健康 = !需关注.length || 需关注.every((s) => /状态健康/.test(s));

      const 头 = h('div', { className: 'dmd-head' }, [
        h('div', { key: 'l', className: 'dmd-logo' }, h(IcoBrain, { size: 18 })),
        h('div', { key: 't' }, [
          h('div', { key: 'a', className: 'dmd-title' }, '深鲸记忆'),
          h('div', { key: 'b', className: 'dmd-sub' }, '记忆管家 · 用量体检、重复合并、备份恢复、记忆包迁移'),
        ]),
        h('div', { key: 's', className: 'dmd-spacer' }),
        h(Chip, { key: 'c' }, '本地明文 · 不上传'),
        h('button', { key: 'r', className: 'dmd-btn', disabled: 载入 || 忙碌, onClick: () => 刷新(false) }, h(IcoRefresh), '重新体检'),
        h('button', {
          key: 'e', className: 'dmd-btn dmd-btn-primary', disabled: 忙碌,
          onClick: () => 执行(async () => {
            const r = await api('/pack', { method: 'POST' });
            设导出结果(r.目录 || '');
            return r;
          }, (r) => `记忆包已导出：${r.目录}`),
        }, h(IcoExport), '导出记忆包'),
      ]);

      if (载入 && !数据) {
        return h('div', { className: 'dmd-root' }, [头, h('div', { className: 'dmd-scroll' }, h('div', { className: 'dmd-empty' }, '正在读取记忆…'))]);
      }
      if (错误) {
        return h('div', { className: 'dmd-root' }, [头, h('div', { className: 'dmd-scroll' }, h('div', { className: 'dmd-card' }, h('div', { className: 'dmd-card-b' }, [
          h('div', { key: 'e', className: 'dmd-muted' }, '读取失败：' + 错误),
          h('div', { key: 'b', className: 'dmd-row', style: { marginTop: 10 } }, h('button', { className: 'dmd-btn', onClick: () => 刷新(false) }, '重试')),
        ])))]);
      }

      const 概览页 = h('div', { key: 'ov' }, [
        h('div', { key: 'cards', className: 'dmd-grid' }, [
          h(Stat, { key: 'a', 标题: '运行时记忆', 值: (体检.摘要.总条目 || 0), 备注: '项', 百分比: mem ? mem.百分比 : 0 }),
          h(Stat, { key: 'b', 标题: '工作记忆 MEMORY.md', 值: mem ? mem.条目数 : 0, 备注: '项', 百分比: mem ? mem.百分比 : 0 }),
          h(Stat, { key: 'c', 标题: '用户画像 USER.md', 值: usr ? usr.条目数 : 0, 备注: '项', 百分比: usr ? usr.百分比 : 0 }),
          h(Stat, { key: 'd', 标题: '归档与备份', 值: 归档文件.length, 备注: '份', 百分比: 0 }),
        ]),
        h('div', { key: 'two', className: 'dmd-grid', style: { gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)' } }, [
          h('div', { key: 'health', className: 'dmd-card' }, [
            h('div', { key: 'h', className: 'dmd-card-h' }, [
              h('div', { key: 't', className: 'dmd-card-t' }, '记忆健康'),
              h('div', { key: 's', className: 'dmd-spacer' }),
              h(Chip, { key: 'c', tone: 健康 ? '' : 'warn' }, 健康 ? '状态健康' : '需要处理'),
            ]),
            h('div', { key: 'b', className: 'dmd-card-b' }, [
              mem ? h('div', { key: 'm', style: { marginBottom: 12 } }, [
                h('div', { key: 'r', className: 'dmd-kv', style: { justifyContent: 'space-between' } }, [
                  h('span', { key: 'a' }, 'MEMORY.md'),
                  h('span', { key: 'b', className: 'dmd-muted' }, `${mem.大小}/${mem.上限} 字节 · ${mem.百分比}%`),
                ]),
                h(Bar, { key: 'b', 百分比: mem.百分比 }),
              ]) : null,
              usr ? h('div', { key: 'u', style: { marginBottom: 12 } }, [
                h('div', { key: 'r', className: 'dmd-kv', style: { justifyContent: 'space-between' } }, [
                  h('span', { key: 'a' }, 'USER.md'),
                  h('span', { key: 'b', className: 'dmd-muted' }, `${usr.大小}/${usr.上限} 字节 · ${usr.百分比}%`),
                ]),
                h(Bar, { key: 'b', 百分比: usr.百分比 }),
              ]) : null,
              ...需关注.map((s, i) => h('div', { key: 's' + i, className: 'dmd-issue' + (健康 ? ' ok' : '') }, [
                h('span', { key: 'i', className: 'ic' }, 健康 ? h(IcoCheck) : h(IcoAlert)),
                h('span', { key: 't' }, s),
              ])),
            ]),
          ]),
          h('div', { key: 'mix', className: 'dmd-card' }, [
            h('div', { key: 'h', className: 'dmd-card-h' }, h('div', { key: 't', className: 'dmd-card-t' }, '构成')),
            h('div', { key: 'b', className: 'dmd-card-b' }, [
              h('div', { key: 'r1', className: 'dmd-row', style: { justifyContent: 'space-between' } }, [h('span', null, '条目总数'), h('strong', null, (体检.摘要.总条目 || 0) + ' 条')]),
              h('div', { key: 'r2', className: 'dmd-row', style: { justifyContent: 'space-between', marginTop: 6 } }, [h('span', null, '重复 / 近重复'), h('strong', null, ((标记['重复'] || 0) + (标记['近重复'] || 0)) + ' 条')]),
              h('div', { key: 'r3', className: 'dmd-row', style: { justifyContent: 'space-between', marginTop: 6 } }, [h('span', null, '可归档（临时/进度）'), h('strong', null, (标记['可归档(临时/进度类)'] || 0) + ' 条')]),
              h('div', { key: 'r4', className: 'dmd-row', style: { justifyContent: 'space-between', marginTop: 6 } }, [h('span', null, '低信息量（<40 B）'), h('strong', null, (标记['低信息量'] || 0) + ' 条')]),
              h('div', { key: 'r5', className: 'dmd-row', style: { justifyContent: 'space-between', marginTop: 6 } }, [h('span', null, '归档备份'), h('strong', null, 归档文件.length + ' 份')]),
            ]),
          ]),
        ]),
        h('div', { key: 'recent', className: 'dmd-card' }, [
          h('div', { key: 'h', className: 'dmd-card-h' }, [
            h('div', { key: 't', className: 'dmd-card-t' }, '最近写入'),
            h('div', { key: 's', className: 'dmd-spacer' }),
            h('button', { key: 'b', className: 'dmd-btn sm', onClick: () => 设页('runtime') }, '全部条目'),
          ]),
          h('div', { key: 'b', className: 'dmd-card-b' }, 条目.slice(-4).reverse().map((e) => h('div', { key: e.文件 + e.序号, className: 'dmd-entry' }, [
            h('div', { key: 'm', className: 'dmd-entry-main' }, [
              h('div', { key: 'top', className: 'dmd-entry-top' }, [
                h('span', { key: 'f', className: 'dmd-chip dmd-chip-brand' }, e.文件),
                h('span', { key: 'i', className: 'dmd-idx' }, '#' + e.序号),
                ...e.标记.map((m) => h(Chip, { key: m, tone: 标记Tone(m) }, m)),
              ]),
              h('div', { key: 't', className: 'dmd-txt clamp' }, e.全文 || e.摘要),
            ]),
          ]))),
        ]),
      ]);

      const 运行时页 = h('div', { key: 'rt' }, [
        h('div', { key: 'tb', className: 'dmd-toolbar' }, [
          h('label', { key: 's', className: 'dmd-search' }, [h(IcoSearch, { key: 'i' }), h('input', { key: 'in', value: 搜索, placeholder: '按内容筛选…', onChange: (ev) => 设搜索(ev.target.value) })]),
          h('div', { key: 'seg', className: 'dmd-seg' }, [
            ['all', '全部 ' + 条目.length], ['MEMORY', '工作记忆 ' + (mem ? mem.条目数 : 0)], ['USER', '用户画像 ' + (usr ? usr.条目数 : 0)], ['archive', '可归档 ' + (标记['可归档(临时/进度类)'] || 0)], ['dup', '重复 ' + ((标记['重复'] || 0) + (标记['近重复'] || 0))],
          ].map(([k, t]) => h('button', { key: k, 'data-on': 筛选 === k ? 'true' : 'false', onClick: () => 设筛选(k) }, t))),
        ]),
        ...['MEMORY.md', 'USER.md'].map((文件) => {
          const 组 = 过滤.filter((e) => e.文件 === 文件);
          if (!组.length) return null;
          return h('div', { key: 文件, className: 'dmd-group' }, [
            h('div', { key: 'h', className: 'dmd-group-h' }, [
              h('span', { key: 't' }, 文件 === 'MEMORY.md' ? '工作记忆 · MEMORY.md' : '用户画像 · USER.md'),
              h('span', { key: 'n', className: 'dmd-muted' }, 组.length + ' 条'),
              h('button', { key: 'a', className: 'dmd-btn sm', style: { marginLeft: 'auto' }, onClick: () => 全选(组, true) }, '全选'),
              h('button', { key: 'c', className: 'dmd-btn sm', onClick: () => 全选(组, false) }, '清除'),
            ]),
            ...组.map((e) => h(条目行, { key: e.文件 + e.序号, e, 选中: !!选中[e.文件 + '#' + e.序号], onToggle: 勾选 })),
          ]);
        }),
        !过滤.length ? h('div', { key: 'empty', className: 'dmd-empty' }, [h(IcoArchive, { key: 'i', size: 22 }), h('div', { key: 't' }, 搜索 ? '没有匹配的条目' : '这个筛选下没有条目')]) : null,
        h('div', { key: 'bar', className: 'dmd-selbar' }, [
          h('div', { key: 'n', className: 'dmd-muted' }, 选中的条目.length ? `已选 ${选中的条目.length} 条` : '勾选后可批量归档（先备份，可恢复）'),
          h('div', { key: 's', className: 'dmd-spacer' }),
          h('button', { key: 'c', className: 'dmd-btn sm', disabled: !选中的条目.length, onClick: () => 设选中({}) }, '清除选择'),
          h('button', {
            key: 'a', className: 'dmd-btn dmd-btn-primary sm', disabled: 忙碌 || !选中的条目.length,
            onClick: () => 执行(归档选中, (s) => '已归档：' + s),
          }, '归档选中'),
        ]),
      ]);

      const 记忆包页 = h('div', { key: 'pk' }, [
        h('div', { key: 'c1', className: 'dmd-card' }, [
          h('div', { key: 'h', className: 'dmd-card-h' }, [h('div', { key: 't', className: 'dmd-card-t' }, '导出记忆包'), h('div', { key: 's', className: 'dmd-spacer' }), h(Chip, { key: 'c' }, '换机 / 团队共享 / 留档')]),
          h('div', { key: 'b', className: 'dmd-card-b' }, [
            h('div', { key: 'd', className: 'dmd-muted' }, '把当前 MEMORY.md、USER.md、memories.json 与文档目录打成一个带 manifest 的文件夹，放在 ~/.mnemon/ 下。'),
            h('div', { key: 'r', className: 'dmd-row', style: { marginTop: 12 } }, [
              h('button', { key: 'b', className: 'dmd-btn dmd-btn-primary', disabled: 忙碌, onClick: () => 执行(async () => { const r = await api('/pack', { method: 'POST' }); 设导出结果(r.目录 || ''); return r; }, (r) => '已导出：' + r.目录) }, h(IcoExport), '导出记忆包'),
            ]),
            导出结果 ? h('div', { key: 'p', className: 'dmd-mono', style: { marginTop: 10 } }, 导出结果) : null,
          ]),
        ]),
        h('div', { key: 'c2', className: 'dmd-card' }, [
          h('div', { key: 'h', className: 'dmd-card-h' }, h('div', { key: 't', className: 'dmd-card-t' }, '导入记忆包')),
          h('div', { key: 'b', className: 'dmd-card-b' }, [
            h('div', { key: 'd', className: 'dmd-muted' }, '输入记忆包目录的绝对路径；导入是追加合并，不会覆盖现有条目（重复条目自动跳过）。'),
            h('div', { key: 'r', className: 'dmd-row', style: { marginTop: 12 } }, [
              h('input', { key: 'i', className: 'dmd-input', placeholder: '/Users/you/.mnemon/记忆包-…', value: 导入路径, onChange: (ev) => 设导入路径(ev.target.value) }),
              h('label', { key: 'c', className: 'dmd-muted', style: { display: 'flex', gap: 6, alignItems: 'center' } }, h('input', { type: 'checkbox', checked: 导入确认, onChange: (ev) => 设导入确认(ev.target.checked) }), '确认追加合并'),
              h('button', {
                key: 'b', className: 'dmd-btn', disabled: 忙碌 || !导入路径 || !导入确认,
                onClick: () => 执行(async () => { const r = await api('/import', { method: 'POST', body: { 目录: 导入路径, 确认: true } }); 设导入路径(''); 设导入确认(false); return r; }, (r) => '导入完成：' + Object.entries(r.合并 || {}).map(([k, v]) => `${k} +${v.新增}`).join('，')),
              }, '导入'),
            ]),
          ]),
        ]),
        h('div', { key: 'c3', className: 'dmd-card' }, [
          h('div', { key: 'h', className: 'dmd-card-h' }, h('div', { key: 't', className: 'dmd-card-t' }, '迁移说明')),
          h('div', { key: 'b', className: 'dmd-card-b' }, h('div', { key: 't', className: 'dmd-muted' }, '记忆文件是明文 Markdown（~/.mnemon/runtime/），换机时把记忆包拷过去，导入即可；不需要任何账号，也不经过服务器。')),
        ]),
      ]);

      const 归档内容 = 归档文件.length ? 归档文件.map((f) => h('div', { key: f.名, className: 'dmd-file-row' }, [
        h(Chip, { key: 't', tone: f.类型 === '备份' ? '' : 'brand' }, f.类型),
        h('div', { key: 'n', className: 'dmd-file-name' }, f.名),
        h('div', { key: 'm', className: 'dmd-muted' }, 千分(f.字节) + ' · ' + 时间(f.修改时间)),
        f.类型 === '备份'
          ? (恢复确认 === f.名
            ? h('div', { key: 'c', className: 'dmd-row' }, [
              h('button', { key: 'y', className: 'dmd-btn sm dmd-btn-danger', disabled: 忙碌, onClick: () => 执行(async () => { const r = await api('/restore', { method: 'POST', body: { 归档文件名: f.名, 文件: f.名.startsWith('USER.md') ? 'USER.md' : 'MEMORY.md', 确认: true } }); 设恢复确认(null); return r; }, (r) => '已恢复：' + r.文件) }, '确认恢复'),
              h('button', { key: 'n', className: 'dmd-btn sm', onClick: () => 设恢复确认(null) }, '取消'),
            ])
            : h('button', { key: 'r', className: 'dmd-btn sm', onClick: () => 设恢复确认(f.名) }, '恢复'))
          : null,
      ])) : h('div', { key: 'e', className: 'dmd-empty' }, [
        h(IcoArchive, { key: 'i', size: 22 }),
        h('div', { key: 't' }, '还没有归档。在「运行时记忆」里勾选条目归档后会出现在这里。'),
      ]);

      const 归档页 = h('div', { key: 'ar' }, [
        h('div', { key: 'c', className: 'dmd-card' }, [
          h('div', { key: 'h', className: 'dmd-card-h' }, [
            h('div', { key: 't', className: 'dmd-card-t' }, '归档与备份'),
            h('div', { key: 's', className: 'dmd-spacer' }),
            h(Chip, { key: 'c' }, 归档文件.length + ' 份'),
          ]),
          h('div', { key: 'b', className: 'dmd-card-b' }, 归档内容),
        ]),
      ]);

      const 页签 = h('div', { key: 'tabs', className: 'dmd-tabs' }, [
        ['overview', '概览'], ['runtime', '运行时记忆'], ['packs', '记忆包'], ['archive', '归档'],
      ].map(([k, t]) => h('button', { key: k, className: 'dmd-tab', 'data-on': 页 === k ? 'true' : 'false', onClick: () => 设页(k) }, t)));

      return h('div', { className: 'dmd-root' }, [
        h('style', { key: 'css' }, CSS),
        头,
        页签,
        h('div', { key: 'body', className: 'dmd-scroll' }, [页 === 'overview' ? 概览页 : 页 === 'runtime' ? 运行时页 : 页 === 'packs' ? 记忆包页 : 归档页]),
        h('div', { key: 'foot', className: 'dmd-foot', style: { padding: '8px 24px 12px' } }, h('a', { href: 'https://deepwhale.org.cn', target: '_blank', rel: 'noopener' }, h('img', { src: BADGE, alt: 'powered by dwh', style: { height: 20, width: 121, display: 'block' } }))),
        提示 ? h('div', { key: 'toast', className: 'dmd-toast', 'data-kind': 提示.kind }, 提示.文本) : null,
      ]);
    }

    function 兜底({ children }) { return h('div', { style: { padding: 16, color: 'inherit' } }, children); }
    function 安全面板() {
      try { return h(面板); } catch (e) { return h(兜底, null, '深鲸记忆面板出错：' + String(e && e.message || e)); }
    }

    function 图标() {
      return h('span', { style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18 } }, h(IcoBrain, { size: 18 }));
    }

    const inject = ['slots'];
    function apply(ctx) {
      ctx.slots.inject(SLOT_MAIN, function* () {
        yield ctx.slots.register({ name: SLOT_MAIN, key: PANEL_ID }, 安全面板);
      });
      ctx.slots.inject(SLOT_ICON, function* () {
        yield ctx.slots.register({ name: SLOT_ICON, id: PANEL_ID, order: 22, label: '深鲸记忆' }, 图标);
      });
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
