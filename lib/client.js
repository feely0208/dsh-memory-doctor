/**
 * 深鲸记忆 —— 客户端半边（面板 UI）
 *
 * 对标宿主自带「记忆系统」的信息架构：顶部状态、分页签、分组卡片、来源与存储分区。
 * 我们的差异是「记忆管家」：用量体检、重复合并、备份恢复、记忆包迁移、诊断报告。
 *
 * 约束：不 require 任何 Harness 客户端包；只引用 --dsw-alias-* 主题令牌；数据全走本地 HTTP。
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

    const 千分 = (n) => (n === undefined || n === null ? '0' : n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B');
    const 时分 = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      const p = (x) => String(x).padStart(2, '0');
      return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    };

    // ── 样式 ──────────────────────────────────────────────────────
    const CSS = `
.dmd-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13.5px;line-height:1.6}
.dmd-head{display:flex;align-items:center;gap:11px;padding:16px 24px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex:none;flex-wrap:wrap}
.dmd-logo{width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);flex:none}
.dmd-title{font-weight:700;font-size:17px;letter-spacing:-.01em;line-height:1.3;display:flex;align-items:center;gap:8px}
.dmd-sub{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}
.dmd-spacer{flex:1}
.dmd-scroll{flex:1;min-height:0;overflow:auto;padding:18px 24px 28px;display:flex;flex-direction:column;gap:16px}

.dmd-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:999px;font-size:10.5px;line-height:1.7;border:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-base);white-space:nowrap}
.dmd-chip-brand{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dmd-chip-warn{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}
.dmd-chip-err{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dmd-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary);flex:none;display:inline-block}
.dmd-dot-off{background:var(--dsw-alias-state-idle-primary)}

.dmd-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:32px;padding:0 14px;border-radius:9px;font-weight:550;border:.5px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap;transition:background .12s ease,opacity .12s ease}
.dmd-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2))}
.dmd-btn:disabled{opacity:.45;cursor:not-allowed}
.dmd-btn.sm{height:27px;padding:0 10px;font-size:11.5px;border-radius:8px}
.dmd-btn-primary{background:var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary));border-color:transparent;color:var(--dsw-alias-label-primary-foreground);font-weight:650}
.dmd-btn-danger{color:var(--dsw-alias-state-error-primary)}
.dmd-link{display:inline-flex;align-items:center;gap:4px;border:0;background:none;color:var(--dsw-alias-brand-primary);font:inherit;font-size:12px;cursor:pointer;padding:0}

/* 顶部提示条 */
.dmd-banner{display:flex;gap:10px;align-items:flex-start;padding:11px 14px;border-radius:10px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);font-size:12.5px;line-height:1.6}
.dmd-banner .ic{flex:none;margin-top:1px;color:var(--dsw-alias-state-warn-primary)}
.dmd-banner-t{flex:1;min-width:0}
.dmd-banner-a{display:flex;gap:8px;flex:none;flex-wrap:wrap}

/* 区块 */
.dmd-section{display:flex;flex-direction:column;gap:10px}
.dmd-sh{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;padding:2px 0}
.dmd-sh-t{font-weight:700;font-size:14px;letter-spacing:-.01em}
.dmd-sh-s{color:var(--dsw-alias-label-secondary);font-size:12px}

.dmd-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.dmd-grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
@media (max-width:980px){.dmd-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dmd-grid3{grid-template-columns:1fr}}
.dmd-stat{border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;padding:14px 16px;background:var(--dsw-alias-bg-base);display:flex;flex-direction:column;gap:6px;min-height:108px}
.dmd-stat-k{font-size:11.5px;color:var(--dsw-alias-label-secondary);display:flex;align-items:center;gap:6px}
.dmd-stat-v{font-size:21px;font-weight:700;letter-spacing:-.02em;line-height:1.15}
.dmd-stat-v small{font-size:11.5px;font-weight:400;color:var(--dsw-alias-label-secondary);margin-left:4px;letter-spacing:0}
.dmd-stat-d{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.5}
.dmd-bar{height:5px;border-radius:99px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;margin-top:2px}
.dmd-bar>i{display:block;height:100%;border-radius:99px;background:var(--dsw-alias-state-success-primary);transition:width .25s ease}
.dmd-bar>i.warn{background:var(--dsw-alias-state-warn-primary)}
.dmd-bar>i.err{background:var(--dsw-alias-state-error-primary)}

.dmd-card{border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-base);overflow:hidden}
.dmd-card-h{display:flex;align-items:center;gap:8px;padding:13px 16px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex-wrap:wrap}
.dmd-card-t{font-weight:650;font-size:13px}
.dmd-card-b{padding:14px 16px}
.dmd-muted{color:var(--dsw-alias-label-secondary);font-size:12px}
.dmd-issue{display:flex;gap:8px;align-items:flex-start;padding:9px 11px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);font-size:12.5px;line-height:1.6;margin-top:8px}
.dmd-issue:first-child{margin-top:0}
.dmd-issue .ic{flex:none;margin-top:1px;color:var(--dsw-alias-state-warn-primary)}
.dmd-issue.ok .ic{color:var(--dsw-alias-state-success-primary)}
.dmd-kv{display:flex;gap:8px;align-items:baseline;justify-content:space-between}
.dmd-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dmd-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.dmd-src{display:flex;gap:10px;align-items:center;padding:11px 13px;border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;margin-top:8px;flex-wrap:wrap}
.dmd-src:first-child{margin-top:0}
.dmd-src .nm{font-weight:600;font-size:12.8px}
.dmd-src .desc{color:var(--dsw-alias-label-secondary);font-size:11.5px}

/* 趋势 */
.dmd-trend{display:flex;flex-direction:column;gap:8px}
.dmd-spark{width:100%;height:76px;display:block}
.dmd-legend{display:flex;gap:16px;align-items:center;flex-wrap:wrap;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.dmd-legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px}

/* 页签 */
.dmd-tabs{display:flex;gap:2px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex:none;padding:0 2px;overflow:auto}
.dmd-tab{position:relative;height:36px;padding:0 14px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;cursor:pointer;border-radius:8px 8px 0 0;white-space:nowrap}
.dmd-tab:hover{color:var(--dsw-alias-label-primary)}
.dmd-tab[data-on="true"]{color:var(--dsw-alias-label-primary);font-weight:650}
.dmd-tab[data-on="true"]:after{content:'';position:absolute;left:10px;right:10px;bottom:-1px;height:2px;border-radius:2px;background:var(--dsw-alias-brand-primary)}

/* 工具条 */
.dmd-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.dmd-search{flex:1;min-width:180px;display:flex;align-items:center;gap:7px;height:34px;padding:0 11px;border:.5px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary)}
.dmd-search input{flex:1;border:0;outline:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px}
.dmd-seg{display:inline-flex;padding:2px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);gap:2px;flex-wrap:wrap}
.dmd-seg button{height:26px;padding:0 10px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer}
.dmd-seg button[data-on="true"]{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.06)}

/* 条目 */
.dmd-group{margin-top:14px}
.dmd-group:first-child{margin-top:0}
.dmd-group-h{display:flex;align-items:center;gap:8px;padding:0 2px 8px;color:var(--dsw-alias-label-secondary);font-size:11.5px;flex-wrap:wrap}
.dmd-entry{display:flex;gap:10px;align-items:flex-start;padding:11px 13px;border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base);margin-top:7px;cursor:pointer;transition:border-color .12s ease}
.dmd-entry:hover{border-color:var(--dsw-alias-border-l2)}
.dmd-entry[data-sel="true"]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
.dmd-entry input[type=checkbox]{margin:3px 0 0;flex:none;accent-color:var(--dsw-alias-brand-primary)}
.dmd-entry-main{flex:1;min-width:0}
.dmd-entry-top{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:4px}
.dmd-idx{font-size:10.5px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.dmd-txt{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12.8px;line-height:1.65}
.dmd-txt.clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.dmd-detail{position:sticky;top:0;border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-base);overflow:hidden;max-height:calc(100vh - 220px);display:flex;flex-direction:column}
.dmd-detail-h{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex-wrap:wrap}
.dmd-detail-b{padding:14px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12.8px;line-height:1.7;flex:1;min-height:0}
.dmd-detail-f{display:flex;gap:8px;padding:11px 14px;border-top:.5px solid var(--dsw-alias-border-l1);flex-wrap:wrap}
.dmd-selbar{position:sticky;bottom:0;display:flex;gap:10px;align-items:center;padding:11px 24px;border-top:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);margin:16px -24px -28px;flex-wrap:wrap}
.dmd-empty{padding:36px 16px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12.5px;display:flex;flex-direction:column;align-items:center;gap:8px}
.dmd-foot{display:flex;justify-content:flex-end;padding:4px 24px 12px}
.dmd-toast{position:fixed;right:24px;bottom:24px;z-index:30;max-width:min(420px,calc(100vw - 48px));padding:10px 14px;border-radius:10px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);box-shadow:0 10px 30px rgba(0,0,0,.18);font-size:12.5px;line-height:1.55}
.dmd-toast[data-kind="err"]{border-color:var(--dsw-alias-state-error-primary)}
.dmd-toast[data-kind="ok"]{border-color:var(--dsw-alias-state-success-primary)}
.dmd-file-row{display:flex;gap:10px;align-items:center;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;margin-top:8px;flex-wrap:wrap}
.dmd-file-row:first-child{margin-top:0}
.dmd-file-name{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;flex:1;min-width:180px;overflow-wrap:anywhere}
.dmd-input{height:32px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;min-width:200px;flex:1}
.dmd-switch{position:relative;width:40px;height:22px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);cursor:pointer;flex:none}
.dmd-switch[data-on="true"]{background:var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary));border-color:transparent}
.dmd-switch>i{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .15s ease}
.dmd-switch[data-on="true"]>i{left:20px}

/* 会话回复上的「存入记忆」 */
.dmd-save-wrap{position:relative;display:inline-flex}
.dmd-save-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;border:0!important;padding:0!important;background:transparent!important;box-shadow:none!important;-webkit-appearance:none;appearance:none;color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:.85}
.dmd-save-tip{position:absolute;bottom:30px;left:50%;transform:translateX(-50%);white-space:nowrap;padding:5px 9px;border-radius:7px;background:var(--dsw-alias-bg-base);border:.5px solid var(--dsw-alias-border-l1);box-shadow:0 6px 18px rgba(0,0,0,.2);font-size:11.5px;color:var(--dsw-alias-label-primary);display:none;z-index:90}
.dmd-save-wrap:hover .dmd-save-tip{display:block}
.dmd-save-btn:hover,.dmd-save-btn:focus,.dmd-save-btn:active{background:transparent!important;box-shadow:none!important;outline:none;color:var(--dsw-alias-brand-primary);opacity:1}
.dmd-save-pop{position:absolute;left:0;bottom:30px;z-index:60;width:min(360px,90vw);border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-base);box-shadow:0 12px 36px rgba(0,0,0,.2);padding:12px 14px;display:flex;flex-direction:column;gap:9px}
.dmd-save-h{display:flex;align-items:center;gap:7px;font-weight:650;font-size:12.5px}
.dmd-save-preview{max-height:180px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:1.65;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:8px 10px}
.dmd-save-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.dmd-save-row select{height:28px;border:.5px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;color:inherit;font:inherit;font-size:12px;padding:0 6px}
.dmd-save-msg{font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.dmd-save-msg.err{color:var(--dsw-alias-state-error-primary)}
.dmd-save-msg.ok{color:var(--dsw-alias-state-success-primary)}

.dmd-runtime{display:flex;gap:14px;align-items:flex-start}
.dmd-runtime-list{flex:1;min-width:0}
.dmd-runtime-side{width:360px;flex:none}
@media (max-width:1100px){.dmd-runtime{flex-direction:column}.dmd-runtime-side{width:100%}}
`;

    // ── 图标 ──────────────────────────────────────────────────────
    const Icon = (p) => h('svg', { width: p.size || 16, height: p.size || 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }, p.children);
    const IcoBrain = (p) => Icon({ ...p, children: [
      h('path', { key: 'l', d: 'M12 5.2a3 3 0 0 0-5.8-1A3 3 0 0 0 4.1 8a3 3 0 0 0 .4 5 3 3 0 0 0 2.8 3.9A3 3 0 0 0 12 19Z' }),
      h('path', { key: 'r', d: 'M12 5.2a3 3 0 0 1 5.8-1A3 3 0 0 1 19.9 8a3 3 0 0 1-.4 5 3 3 0 0 1-2.8 3.9A3 3 0 0 1 12 19Z' }),
      h('path', { key: 'm', d: 'M12 5v14' }),
      h('path', { key: 'f1', d: 'M8.2 9.2c.7.1 1.2.6 1.3 1.3' }),
      h('path', { key: 'f2', d: 'M15.8 9.2c-.7.1-1.2.6-1.3 1.3' }),
    ] });
    const IcoRefresh = () => Icon({ children: [h('path', { key: 'a', d: 'M20 11a8 8 0 1 0-2.3 5.7' }), h('path', { key: 'b', d: 'M20 5v6h-6' })] });
    const IcoExport = () => Icon({ children: [h('path', { key: 'a', d: 'M12 3v11' }), h('path', { key: 'b', d: 'm8 10 4 4 4-4' }), h('path', { key: 'c', d: 'M5 19h14' })] });
    const IcoAlert = () => Icon({ children: [h('path', { key: 'a', d: 'M12 4 3 20h18L12 4Z' }), h('path', { key: 'b', d: 'M12 9v5' }), h('circle', { key: 'c', cx: '12', cy: '17', r: '.6', fill: 'currentColor' })] });
    const IcoCheck = () => Icon({ children: [h('path', { key: 'a', d: 'm5 12 4 4L19 6' })] });
    const IcoSearch = () => Icon({ children: [h('circle', { key: 'a', cx: '11', cy: '11', r: '6' }), h('path', { key: 'b', d: 'm16 16 4 4' })] });
    const IcoArchive = () => Icon({ children: [h('path', { key: 'a', d: 'M4 8h16v11H4z' }), h('path', { key: 'b', d: 'M3 4h18v4H3z' }), h('path', { key: 'c', d: 'M10 12h4' })] });
    const IcoPackage = () => Icon({ children: [h('path', { key: 'a', d: 'M12 3 4 7v10l8 4 8-4V7l-8-4Z' }), h('path', { key: 'b', d: 'm4 7 8 4 8-4' }), h('path', { key: 'c', d: 'M12 11v10' })] });
    const IcoGear = () => Icon({ children: [h('circle', { key: 'a', cx: '12', cy: '12', r: '3' }), h('path', { key: 'b', d: 'M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4' })] });
    const IcoDb = () => Icon({ children: [h('ellipse', { key: 'a', cx: '12', cy: '5.5', rx: '7', ry: '2.5' }), h('path', { key: 'b', d: 'M5 5.5v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6' }), h('path', { key: 'c', d: 'M5 11.5v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6' })] });
    const IcoCopy = () => Icon({ children: [h('rect', { key: 'a', x: '9', y: '9', width: '11', height: '11', rx: '2' }), h('path', { key: 'b', d: 'M5 15V5a2 2 0 0 1 2-2h10' })] });
    const IcoDoc = () => Icon({ children: [h('path', { key: 'a', d: 'M6 3h8l4 4v14H6z' }), h('path', { key: 'b', d: 'M14 3v4h4' }), h('path', { key: 'c', d: 'M9 12h6M9 16h4' })] });
    const IcoChart = () => Icon({ children: [h('path', { key: 'a', d: 'M4 19V5' }), h('path', { key: 'b', d: 'M4 19h16' }), h('path', { key: 'c', d: 'm7 15 4-5 3 3 4-6' })] });

    // ── 小部件 ────────────────────────────────────────────────────
    const Chip = (p) => h('span', { className: 'dmd-chip' + (p.tone ? ' dmd-chip-' + p.tone : '') }, p.children);
    const Bar = ({ 百分比, size }) => {
      const tone = 百分比 >= 90 ? 'err' : 百分比 >= 75 ? 'warn' : '';
      return h('div', { className: 'dmd-bar', style: { height: size || 5 } }, h('i', { className: tone, style: { width: Math.min(100, 百分比) + '%' } }));
    };
    const Stat = ({ 标题, 值, 备注, 说明, 百分比 }) => h('div', { className: 'dmd-stat' }, [
      h('div', { key: 'k', className: 'dmd-stat-k' }, 标题),
      h('div', { key: 'v', className: 'dmd-stat-v' }, 值, 备注 ? h('small', null, 备注) : null),
      说明 ? h('div', { key: 'd', className: 'dmd-stat-d' }, 说明) : null,
      百分比 !== undefined ? h(Bar, { key: 'b', 百分比 }) : null,
    ]);
    const Section = ({ 标题, 说明, extra, children }) => h('div', { className: 'dmd-section' }, [
      h('div', { key: 'h', className: 'dmd-sh' }, [
        h('div', { key: 't', className: 'dmd-sh-t' }, 标题),
        说明 ? h('div', { key: 's', className: 'dmd-sh-s' }, 说明) : null,
        h('div', { key: 'x', className: 'dmd-spacer' }),
        extra || null,
      ]),
      ...children,
    ]);

    function 标记Tone(标记) {
      if (标记.includes('重复') || 标记.includes('可归档')) return 'warn';
      return '';
    }

    // 各记忆文件的上限（与运行时记忆协议一致）
    const 上限 = { 'MEMORY.md': 10240, 'USER.md': 4096 };
    const 百分比 = (字节数, 文件) => Math.min(100, Math.round(((字节数 || 0) / 上限[文件]) * 1000) / 10);

    const CHART = { W: 640, H: 172, l: 40, r: 12, t: 12, b: 22 };
    function 折线点(历史, 文件) {
      const n = 历史.length;
      const x = (i) => CHART.l + (n <= 1 ? 0 : (i / (n - 1)) * (CHART.W - CHART.l - CHART.r));
      const y = (p) => CHART.t + (1 - p / 100) * (CHART.H - CHART.t - CHART.b);
      return 历史.map((h, i) => [x(i), y(百分比(h[文件], 文件))]);
    }
    const 点串 = (pts) => pts.map(([x, y]) => `${x},${y}`).join(' ');

    /** 主趋势：两条线都换算成「各自上限的百分比」，可公平比较谁更接近上限 */
    function 趋势图({ 历史, 提示说 }) {
      const [悬停, 设悬停] = react.useState(null);
      if (!历史 || 历史.length < 2) return h('div', { className: 'dmd-muted', style: { padding: '10px 0' } }, '数据还不够：再体检几次就能画出趋势。');
      const n = 历史.length;
      const mem点 = 折线点(历史, 'MEMORY.md');
      const usr点 = 折线点(历史, 'USER.md');
      const x = (i) => CHART.l + (i / (n - 1)) * (CHART.W - CHART.l - CHART.r);
      const y = (p) => CHART.t + (1 - p / 100) * (CHART.H - CHART.t - CHART.b);
      const 网格 = [0, 25, 50, 75, 85, 100];
      const 取点 = (ev) => {
        const svg = ev.currentTarget;
        const r = svg.getBoundingClientRect();
        const px = ((ev.clientX - r.left) / r.width) * CHART.W;
        const i = Math.max(0, Math.min(n - 1, Math.round(((px - CHART.l) / (CHART.W - CHART.l - CHART.r)) * (n - 1))));
        设悬停(i);
      };
      const 当前 = 悬停 === null ? 历史[n - 1] : 历史[悬停];
      return h('div', { className: 'dmd-trend', style: { position: 'relative' } }, [
        h('svg', {
          key: 'svg', className: 'dmd-spark', viewBox: `0 0 ${CHART.W} ${CHART.H}`, preserveAspectRatio: 'xMidYMid meet',
          style: { height: 190 }, onMouseMove: 取点, onMouseLeave: () => 设悬停(null),
        }, [
          ...网格.map((p) => h('line', { key: 'g' + p, x1: CHART.l, x2: CHART.W - CHART.r, y1: y(p), y2: y(p), stroke: 'var(--dsw-alias-border-l1)', strokeWidth: p === 85 ? 1 : 0.5, strokeDasharray: p === 85 ? '4 3' : undefined })),
          ...网格.map((p) => h('text', { key: 't' + p, x: CHART.l - 6, y: y(p) + 3, textAnchor: 'end', fontSize: 9, fill: 'var(--dsw-alias-label-secondary)' }, p + '%')),
          h('text', { key: 'warn', x: CHART.W - CHART.r, y: y(85) - 5, textAnchor: 'end', fontSize: 9, fill: 'var(--dsw-alias-state-warn-primary)' }, '85% 警戒线'),
          h('polyline', { key: 'mem', points: 点串(mem点), fill: 'none', stroke: 'var(--dsw-alias-brand-primary)', strokeWidth: 2.2, strokeLinejoin: 'round' }),
          h('polyline', { key: 'usr', points: 点串(usr点), fill: 'none', stroke: 'var(--dsw-alias-state-warn-primary)', strokeWidth: 2, strokeLinejoin: 'round', strokeDasharray: '5 3' }),
          ...mem点.map(([cx, cy], i) => h('circle', { key: 'mc' + i, cx, cy, r: 悬停 === i ? 3.4 : 2, fill: 'var(--dsw-alias-brand-primary)' })),
          ...usr点.map(([cx, cy], i) => h('circle', { key: 'uc' + i, cx, cy, r: 悬停 === i ? 3.4 : 2, fill: 'var(--dsw-alias-state-warn-primary)' })),
          ...(悬停 === null ? [] : [h('line', { key: 'hv', x1: x(悬停), x2: x(悬停), y1: CHART.t, y2: CHART.H - CHART.b, stroke: 'var(--dsw-alias-label-secondary)', strokeWidth: 0.8, strokeDasharray: '2 3' })]),
          h('text', { key: 'x1', x: CHART.l, y: CHART.H - 5, fontSize: 9, fill: 'var(--dsw-alias-label-secondary)' }, 时分(历史[0].时间)),
          h('text', { key: 'x2', x: CHART.W - CHART.r, y: CHART.H - 5, textAnchor: 'end', fontSize: 9, fill: 'var(--dsw-alias-label-secondary)' }, 时分(历史[n - 1].时间)),
        ]),
        h('div', { key: 'tip', className: 'dmd-legend', style: { marginTop: 4 } }, [
          h('span', { key: 'a' }, h('i', { style: { background: 'var(--dsw-alias-brand-primary)' } }), 'MEMORY.md'),
          h('span', { key: 'b' }, h('i', { style: { background: 'var(--dsw-alias-state-warn-primary)' } }), 'USER.md'),
          h('span', { key: 'c' }, 悬停 === null ? '悬停看某一次体检' : 时分(当前.时间)),
          h('span', { key: 'mv', className: 'dmd-mono' }, (() => {
            const ms = 历史.map((h) => 百分比(h['MEMORY字节'], 'MEMORY.md'));
            const us = 历史.map((h) => 百分比(h['USER字节'], 'USER.md'));
            const mr = Math.max(...ms) - Math.min(...ms), ur = Math.max(...us) - Math.min(...us);
            return (mr < 0.5 && ur < 0.5) ? '近期基本持平（这段时间没有写入/删除）' : `MEMORY ${Math.min(...ms).toFixed(1)}~${Math.max(...ms).toFixed(1)}% · USER ${Math.min(...us).toFixed(1)}~${Math.max(...us).toFixed(1)}%`;
          })()),
        ]),
      ]);
    }

    /** 单文件迷你图：各自纵轴 0~100%，避免两条上限不同的线共用刻度产生误导 */
    function 迷你趋势({ 历史, 文件 }) {
      if (!历史 || 历史.length < 2) return h('div', { className: 'dmd-muted' }, '再体检一次');
      const pts = 折线点(历史, 文件).map(([x, y]) => [((x - CHART.l) / (CHART.W - CHART.l - CHART.r)) * 260 + 2, ((y - CHART.t) / (CHART.H - CHART.t - CHART.b)) * 46 + 2]);
      const 最后 = 历史[历史.length - 1];
      const p = 百分比(最后[文件], 文件);
      const tone = p >= 90 ? 'dmd-chip-err' : p >= 75 ? 'dmd-chip-warn' : 'dmd-chip-brand';
      return h('div', { style: { flex: 1, minWidth: 0 } }, [
        h('div', { key: 'h', className: 'dmd-row', style: { justifyContent: 'space-between', marginBottom: 2 } }, [
          h('span', { key: 'n', className: 'dmd-muted' }, 文件),
          h('span', { key: 'p', className: 'dmd-chip ' + tone }, p.toFixed(1) + '%'),
        ]),
        h('svg', { key: 's', viewBox: '0 0 264 50', style: { width: '100%', height: 54, display: 'block' } }, [
          h('line', { key: 'g', x1: 0, x2: 264, y1: 48, y2: 48, stroke: 'var(--dsw-alias-border-l1)', strokeWidth: 0.5 }),
          h('polyline', { key: 'l', points: pts.map(([x, y]) => `${x},${y}`).join(' '), fill: 'none', stroke: 文件 === 'MEMORY.md' ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-state-warn-primary)', strokeWidth: 1.8, strokeLinejoin: 'round' }),
        ]),
        h('div', { key: 'd', className: 'dmd-mono', style: { marginTop: 2 } }, `${千分(最后[文件])} / ${千分(上限[文件])}`),
      ]);
    }

    function 条目行({ e, 选中, onToggle, onOpen, 打开中, onIgnore }) {
      const key = e.文件 + '#' + e.序号;
      return h('div', { className: 'dmd-entry', 'data-sel': (选中 || 打开中) ? 'true' : 'false', onClick: () => onOpen(e) }, [
        h('input', { key: 'c', type: 'checkbox', checked: !!选中, onClick: (ev) => ev.stopPropagation(), onChange: (ev) => onToggle(key, ev.target.checked) }),
        h('div', { key: 'm', className: 'dmd-entry-main' }, [
          h('div', { key: 'top', className: 'dmd-entry-top' }, [
            h('span', { key: 'f', className: 'dmd-chip dmd-chip-brand' }, e.文件),
            h('span', { key: 'i', className: 'dmd-idx' }, '#' + e.序号),
            ...(e.标记 || []).map((m) => h(Chip, { key: 'm' + m, tone: 标记Tone(m) }, m)),
            e.已忽略 ? h(Chip, { key: 'ig' }, '已忽略') : null,
            h('span', { key: 'b', className: 'dmd-muted', style: { marginLeft: 'auto' } }, e.字节 + ' B'),
            (e.标记 || []).length && !e.已忽略 && onIgnore ? h('button', { key: 'igb', className: 'dmd-btn sm', onClick: (ev) => { ev.stopPropagation(); onIgnore(e); } }, '忽略') : null,
          ]),
          h('div', { key: 't', className: 'dmd-txt clamp' }, e.全文 || e.摘要),
        ]),
      ]);
    }

    function 面板() {
      const [数据, 设数据] = react.useState(null);
      const [归档数据, 设归档数据] = react.useState(null);
      const [文档数据, 设文档数据] = react.useState(null);
      const [文档详情, 设文档详情] = react.useState(null);
      const [配置, 设配置] = react.useState(null);
      const [载入, 设载入] = react.useState(true);
      const [忙碌, 设忙碌] = react.useState(false);
      const [错误, 设错误] = react.useState('');
      const [提示, 设提示] = react.useState(null);
      const [页, 设页] = react.useState('overview');
      const [筛选, 设筛选] = react.useState('all');
      const [搜索, 设搜索] = react.useState('');
      const [选中, 设选中] = react.useState({});
      const [详情, 设详情] = react.useState(null);
      const [导入路径, 设导入路径] = react.useState('');
      const [导入确认, 设导入确认] = react.useState(false);
      const [恢复确认, 设恢复确认] = react.useState(null);
      const [导出结果, 设导出结果] = react.useState('');
      const [报告路径, 设报告路径] = react.useState('');

      const 说 = (文本, kind) => { 设提示({ 文本, kind: kind || 'ok' }); setTimeout(() => 设提示(null), 4200); };
      const 复制 = async (文本, 名) => {
        try { await navigator.clipboard.writeText(文本); 说((名 || '路径') + ' 已复制'); }
        catch { 说('复制失败，请手动选择文本', 'err'); }
      };

      async function 忽略条目条(e) {
        try {
          await api('/ignore', { method: 'POST', body: { 指纹: e.指纹 } });
          设详情(null);
          await 刷新(false);
          说('已忽略该条，不再提示（设置里可全部恢复）');
        } catch (err) { 说('忽略失败：' + (err && err.message ? err.message : err), 'err'); }
      }

      async function 刷新(静默) {
        if (!静默) 设载入(true);
        设错误('');
        try {
          const [d, a, c, docs] = await Promise.all([api('/audit'), api('/archive'), api('/config'), api('/docs')]);
          设数据(d); 设归档数据(a); 设配置(c); 设文档数据(docs); 设选中({});
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

      function 勾选(key, on) { 设选中((prev) => { const n = { ...prev }; if (on) n[key] = true; else delete n[key]; return n; }); }
      function 全选(entries, on) {
        设选中((prev) => { const n = { ...prev }; for (const e of entries) { const k = e.文件 + '#' + e.序号; if (on) n[k] = true; else delete n[k]; } return n; });
      }

      const 体检 = 数据 && 数据.体检;
      const 诊断 = (数据 && 数据.诊断) || {};
      const 条目 = (体检 && 体检.条目) || [];
      const 选中的条目 = 条目.filter((e) => 选中[e.文件 + '#' + e.序号]);
      const 归档文件 = (归档数据 && 归档数据.文件) || [];
      const 文档文件 = (文档数据 && 文档数据.文件) || [];

      const 过滤 = 条目.filter((e) => {
        if (筛选 === 'MEMORY' && e.文件 !== 'MEMORY.md') return false;
        if (筛选 === 'USER' && e.文件 !== 'USER.md') return false;
        if (筛选 === 'archive' && !(e.标记 || []).some((m) => m.includes('可归档'))) return false;
        if (筛选 === 'dup' && !(e.标记 || []).some((m) => m.includes('重复'))) return false;
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

      if (载入 && !数据) {
        return h('div', { className: 'dmd-root' }, h('style', null, CSS), h('div', { className: 'dmd-scroll' }, h('div', { className: 'dmd-empty' }, '正在读取记忆…')));
      }
      if (错误) {
        return h('div', { className: 'dmd-root' }, h('style', null, CSS), h('div', { className: 'dmd-scroll' }, h('div', { className: 'dmd-card' }, h('div', { className: 'dmd-card-b' }, [
          h('div', { key: 'e', className: 'dmd-muted' }, '读取失败：' + 错误),
          h('div', { key: 'b', className: 'dmd-row', style: { marginTop: 10 } }, h('button', { className: 'dmd-btn', onClick: () => 刷新(false) }, '重试')),
        ]))));
      }

      const mem = 体检.文件['MEMORY.md'];
      const usr = 体检.文件['USER.md'];
      const 标记计数 = 体检.摘要.标记计数 || {};
      const 建议 = 体检.建议 || [];
      // 0.5.8 分级：只有 警告（真需要动作）才弹黄条；提示只做一行灰字
      const 警告 = 体检.警告 || [];
      const 建议项 = 体检.提示 || [];
      const 健康 = 警告.length === 0;
      const 其他记忆 = 诊断.其他记忆插件 || [];
      const 存储 = 诊断.存储 || { 运行时: {}, 归档: {}, 文档: {}, 记忆包: {} };
      const 注入 = !!(配置 && 配置.注入 !== undefined ? 配置.注入 : 诊断.注入);
      const 历史 = 诊断.历史 || [];
      const 记忆引擎版本 = (诊断.插件 && 诊断.插件.版本) || '0.3.0';

      const 头 = h('div', { className: 'dmd-head' }, [
        h('div', { key: 'l', className: 'dmd-logo' }, h(IcoBrain, { size: 19 })),
        h('div', { key: 't' }, [
          h('div', { key: 'a', className: 'dmd-title' }, ['深鲸记忆', h('span', { key: 'p', className: 'dmd-chip dmd-chip-brand' }, '记忆管家'), h('span', { key: 'v', className: 'dmd-chip' }, 'v' + 记忆引擎版本)]),
          h('div', { key: 'b', className: 'dmd-sub' }, '跨会话热记忆 · 用量体检 · 备份恢复 · 记忆包迁移'),
        ]),
        h('div', { key: 's', className: 'dmd-spacer' }),
        h('span', { key: 'st', className: 'dmd-chip' }, [h('span', { key: 'd', className: 'dmd-dot' }), ' 运行正常']),
        h('button', { key: 'r', className: 'dmd-btn', disabled: 载入 || 忙碌, onClick: () => 刷新(false) }, h(IcoRefresh), '重新体检'),
        h('button', { key: 'g', className: 'dmd-btn', onClick: () => 设页('settings') }, h(IcoGear), '设置'),
      ]);

      const 问题数 = 警告.length;
      const 提示条 = 问题数 ? h('div', { key: 'b', className: 'dmd-banner' }, [
        h('span', { key: 'i', className: 'ic' }, h(IcoAlert)),
        h('div', { key: 't', className: 'dmd-banner-t' }, 警告[0]),
        h('div', { key: 'a', className: 'dmd-banner-a' }, h('button', { key: 'x', className: 'dmd-btn sm', onClick: () => { 设页('runtime'); 设筛选('archive'); } }, '去处理')),
      ]) : null;
      const 建议条 = 建议项.length ? h('div', { key: 'tip', className: 'dmd-muted', style: { display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px', fontSize: 12, flexWrap: 'wrap' } }, [
        h('span', { key: 't' }, `体检建议 ${建议项.length} 条：${建议项.slice(0, 2).join('；')}${建议项.length > 2 ? ' …' : ''}`),
        h('button', { key: 'b', className: 'dmd-btn sm', onClick: () => { 设页('runtime'); 设筛选('archive'); } }, '去体检'),
      ]) : null;

      // ── 概览 ────────────────────────────────────────────────────
      const 概览页 = h('div', { key: 'ov', style: { display: 'flex', flexDirection: 'column', gap: 16 } }, [
        提示条,
        建议条,
        h(Section, { key: 's1', 标题: '系统状态', 说明: '记忆引擎与各层存储的运行状态', extra: h(Chip, { key: 'c', tone: 健康 ? '' : 'warn' }, 健康 ? '状态正常' : '需要处理') }, [
          h('div', { key: 'cards', className: 'dmd-grid' }, [
            h(Stat, { key: 'a', 标题: h('span', { className: 'dmd-stat-k' }, [h('span', { key: 'd', className: 'dmd-dot' }), ' 记忆引擎']), 值: '运行正常', 说明: `dsh-memory-doctor ${记忆引擎版本} · ${注入 ? '已接管注入' : '自动让位（只做体检）'}` }),
            h(Stat, { key: 'b', 标题: '运行时记忆', 值: 体检.摘要.总条目, 备注: '项', 说明: `${千分(mem.大小)} 已用 · MEMORY ${mem.条目数} / USER ${usr.条目数}`, 百分比: Math.max(mem.百分比, usr.百分比) }),
            h(Stat, { key: 'c', 标题: '归档与备份', 值: 存储.归档 ? 存储.归档.文件数 : 归档文件.length, 备注: '份', 说明: `${千分(存储.归档 ? 存储.归档.字节 : 0)} · 可随时恢复` }),
            h(Stat, { key: 'd', 标题: '记忆包', 值: 存储.记忆包 ? 存储.记忆包.数量 : 0, 备注: '份', 说明: 存储.记忆包 && 存储.记忆包.最近 ? '最近：' + 存储.记忆包.最近 : '换机 / 团队共享 / 留档' }),
          ]),
          h('div', { key: 'store', className: 'dmd-card' }, [
            h('div', { key: 'h', className: 'dmd-card-h' }, [
              h('span', { key: 'i' }, h(IcoDb)),
              h('div', { key: 't', className: 'dmd-card-t' }, '存储域'),
              h('div', { key: 's', className: 'dmd-spacer' }),
              h('span', { key: 'v', className: 'dmd-muted' }, `当前读写根：${千分((存储.运行时 ? 存储.运行时.字节 : 0) + (存储.归档 ? 存储.归档.字节 : 0))}`),
              h(Chip, { key: 'c' }, '全局'),
            ]),
            h('div', { key: 'b', className: 'dmd-card-b' }, [
              h('div', { key: 'root', className: 'dmd-row', style: { marginBottom: 12, justifyContent: 'space-between' } }, [
                h('span', { key: 'k', className: 'dmd-mono' }, 存储.根 || ''),
                h('button', { key: 'c', className: 'dmd-btn sm', onClick: () => 复制(存储.根 || '', '记忆根路径') }, h(IcoCopy, { size: 13 }), '复制'),
              ]),
              h('div', { key: 'g', className: 'dmd-grid3' }, [
                h('div', { key: 'rt', className: 'dmd-stat' }, [
                  h('div', { key: 'k', className: 'dmd-stat-k' }, [h('span', { key: 'd', className: 'dmd-dot' }), ' 运行时记忆']),
                  h('div', { key: 'v', className: 'dmd-stat-v' }, 体检.摘要.总条目, h('small', null, '项')),
                  h('div', { key: 'd', className: 'dmd-stat-d' }, `${千分(存储.运行时 ? 存储.运行时.字节 : 0)} · ${存储.运行时 ? 存储.运行时.文件数 : 0} 个文件`),
                  h('div', { key: 'p', className: 'dmd-mono' }, 存储.运行时 ? 存储.运行时.路径 : ''),
                ]),
                h('div', { key: 'ar', className: 'dmd-stat' }, [
                  h('div', { key: 'k', className: 'dmd-stat-k' }, [h('span', { key: 'd', className: 'dmd-dot' }), ' 归档与备份']),
                  h('div', { key: 'v', className: 'dmd-stat-v' }, 存储.归档 ? 存储.归档.文件数 : 0, h('small', null, '份')),
                  h('div', { key: 'd', className: 'dmd-stat-d' }, `${千分(存储.归档 ? 存储.归档.字节 : 0)} · 先备份可回滚`),
                  h('div', { key: 'p', className: 'dmd-mono' }, 存储.归档 ? 存储.归档.路径 : ''),
                ]),
                h('div', { key: 'dc', className: 'dmd-stat' }, [
                  h('div', { key: 'k', className: 'dmd-stat-k' }, [h('span', { key: 'd', className: 'dmd-dot' + (存储.文档 && 存储.文档.存在 ? '' : ' dmd-dot-off') }), ' 项目档案 / 文档']),
                  h('div', { key: 'v', className: 'dmd-stat-v' }, 存储.文档 ? 存储.文档.文件数 : 0, h('small', null, '个文件')),
                  h('div', { key: 'd', className: 'dmd-stat-d' }, 存储.文档 && 存储.文档.存在 ? `${千分(存储.文档.字节)} · 与记忆分开存放` : '未创建（不使用文档库时可忽略）'),
                  h('div', { key: 'p', className: 'dmd-mono' }, 存储.文档 ? 存储.文档.路径 : ''),
                ]),
              ]),
            ]),
          ]),
        ]),
        h(Section, { key: 's2', 标题: '记忆来源', 说明: '谁在提供记忆、是否重复注入' }, [
          h('div', { key: 'card', className: 'dmd-card' }, h('div', { key: 'b', className: 'dmd-card-b' }, [
            h('div', { key: 'self', className: 'dmd-src' }, [
              h('span', { key: 'dot', className: 'dmd-dot' }),
              h('div', { key: 'm', style: { flex: 1, minWidth: 180 } }, [
                h('div', { key: 'n', className: 'nm' }, '深鲸记忆'),
                h('div', { key: 'd', className: 'desc' }, `热记忆注入 ${注入 ? '已开启' : '已让位'} · 体检 / 归档 / 记忆包`),
              ]),
              h(Chip, { key: 'c', tone: 注入 ? 'brand' : '' }, 注入 ? '接管注入' : '只做体检'),
            ]),
            ...其他记忆记忆源(其他记忆).map((x, i) => h('div', { key: 'other' + i, className: 'dmd-src' }, [
              h('span', { key: 'dot', className: 'dmd-dot' + (x.启用 ? '' : ' dmd-dot-off') }),
              h('div', { key: 'm', style: { flex: 1, minWidth: 180 } }, [
                h('div', { key: 'n', className: 'nm' }, '其他记忆插件'),
                h('div', { key: 'd', className: 'desc' }, x.启用 ? '运行中 · 只读观察，不重复注入' : '已停用 · 不影响当前注入'),
              ]),
              h(Chip, { key: 'c' }, x.启用 ? '运行中' : '已停用'),
            ])),
            !其他记忆.length ? h('div', { key: 'none', className: 'dmd-muted', style: { marginTop: 10 } }, '没有检测到其他记忆插件；当前由深鲸记忆接管。') : null,
          ])),
        ]),
        h(Section, { key: 's3', 标题: '与上次体检对比', 说明: '新增 / 移除的记忆条目' }, [
          h('div', { key: 'card', className: 'dmd-card' }, h('div', { key: 'b', className: 'dmd-card-b' }, (数据.对比 && 数据.对比.可用)
            ? h('div', null, [
              h('div', { key: 'r', className: 'dmd-row', style: { marginBottom: 8 } }, [
                h(Chip, { key: 'a', tone: 'brand' }, '新增 ' + (数据.对比.新增 || []).length),
                h(Chip, { key: 'd', tone: (数据.对比.移除 || []).length ? 'warn' : '' }, '移除 ' + (数据.对比.移除 || []).length),
                h('span', { key: 't', className: 'dmd-muted' }, '对比基线：' + 时分(数据.对比.上次时间)),
              ]),
              ...(数据.对比.新增 || []).slice(0, 5).map((x, i) => h('div', { key: 'a' + i, className: 'dmd-issue' }, [h('span', { key: 'i', className: 'ic' }, h(IcoCheck)), h('span', { key: 't' }, '新增 · ' + x.文件 + '：' + x.摘要)])),
              ...(数据.对比.移除 || []).slice(0, 5).map((x, i) => h('div', { key: 'd' + i, className: 'dmd-issue' }, [h('span', { key: 'i', className: 'ic' }, h(IcoAlert)), h('span', { key: 't' }, '移除 · ' + x.文件 + '：' + x.摘要)])),
              !(数据.对比.新增 || []).length && !(数据.对比.移除 || []).length ? h('div', { key: 'n', className: 'dmd-muted' }, '与上次相比没有变化') : null,
            ])
            : h('div', { key: 'e', className: 'dmd-muted' }, '再体检一次就能和上一次对比（历史快照自动保存）。'))),
        ]),
        h(Section, { key: 's4', 标题: '趋势与最近写入' , 说明: '用量变化与最近记忆条目' }, [
          h('div', { key: 'two', className: 'dmd-grid', style: { gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)' } }, [
            h('div', { key: 'trend', className: 'dmd-card' }, [
              h('div', { key: 'h', className: 'dmd-card-h' }, [h('span', { key: 'i' }, h(IcoChart)), h('div', { key: 't', className: 'dmd-card-t' }, '用量趋势'), h('div', { key: 's', className: 'dmd-spacer' }), h(Chip, { key: 'c' }, `最近 ${历史.length} 次体检`)]),
              h('div', { key: 'b', className: 'dmd-card-b' }, [
                h(趋势图, { key: 'main', 历史 }),
                h('div', { key: 'mini', style: { display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' } }, [
                  h(迷你趋势, { key: 'm', 历史, 文件: 'MEMORY.md' }),
                  h(迷你趋势, { key: 'u', 历史, 文件: 'USER.md' }),
                ]),
              ]),
            ]),
            h('div', { key: 'recent', className: 'dmd-card' }, [
              h('div', { key: 'h', className: 'dmd-card-h' }, [
                h('div', { key: 't', className: 'dmd-card-t' }, '最近写入'),
                h('div', { key: 's', className: 'dmd-spacer' }),
                h('button', { key: 'b', className: 'dmd-btn sm', onClick: () => 设页('runtime') }, '全部条目'),
              ]),
              h('div', { key: 'b', className: 'dmd-card-b' }, 条目.slice(-4).reverse().map((e) => h('div', { key: e.文件 + e.序号, className: 'dmd-entry', onClick: () => { 设页('runtime'); 设详情(e); } }, [
                h('div', { key: 'm', className: 'dmd-entry-main' }, [
                  h('div', { key: 'top', className: 'dmd-entry-top' }, [h('span', { key: 'f', className: 'dmd-chip dmd-chip-brand' }, e.文件), h('span', { key: 'i', className: 'dmd-idx' }, '#' + e.序号)]),
                  h('div', { key: 't', className: 'dmd-txt clamp' }, e.全文 || e.摘要),
                ]),
              ]))),
            ]),
          ]),
        ]),
      ]);

      // ── 运行时记忆 ──────────────────────────────────────────────
      const 运行时页 = h('div', { key: 'rt' }, [
        h('div', { key: 'tb', className: 'dmd-toolbar', style: { marginBottom: 12 } }, [
          h('label', { key: 's', className: 'dmd-search' }, [h(IcoSearch, { key: 'i' }), h('input', { key: 'in', value: 搜索, placeholder: '按内容筛选…', onChange: (ev) => 设搜索(ev.target.value) })]),
          h('div', { key: 'seg', className: 'dmd-seg' }, [
            ['all', '全部 ' + 条目.length], ['MEMORY', '工作记忆 ' + mem.条目数], ['USER', '用户画像 ' + usr.条目数], ['archive', '可归档 ' + (标记计数['可归档(临时/进度类)'] || 0)], ['dup', '重复 ' + ((标记计数['重复'] || 0) + (标记计数['近重复'] || 0))],
          ].map(([k, t]) => h('button', { key: k, 'data-on': 筛选 === k ? 'true' : 'false', onClick: () => 设筛选(k) }, t))),
        ]),
        h('div', { key: 'body', className: 'dmd-runtime' }, [
          h('div', { key: 'list', className: 'dmd-runtime-list' }, [
            ...['MEMORY.md', 'USER.md'].map((文件) => {
              const 组 = 过滤.filter((e) => e.文件 === 文件);
              if (!组.length) return null;
              const 档 = 体检.文件[文件];
              return h('div', { key: 文件, className: 'dmd-card', style: { marginBottom: 14 } }, [
                h('div', { key: 'h', className: 'dmd-card-h' }, [
                  h('div', { key: 't', className: 'dmd-card-t' }, 文件 === 'MEMORY.md' ? '工作记忆' : '用户画像'),
                  h('span', { key: 'f', className: 'dmd-mono' }, 文件),
                  h('div', { key: 's', className: 'dmd-spacer' }),
                  h('span', { key: 'n', className: 'dmd-muted' }, `${组.length} 条 · ${千分(档.大小)}/${千分(档.上限)}`),
                  h('button', { key: 'a', className: 'dmd-btn sm', onClick: () => 全选(组, true) }, '全选'),
                  h('button', { key: 'c', className: 'dmd-btn sm', onClick: () => 全选(组, false) }, '清除'),
                ]),
                h('div', { key: 'bar', style: { padding: '10px 16px 0' } }, h(Bar, { 百分比: 档.百分比 })),
                h('div', { key: 'b', className: 'dmd-card-b' }, 组.map((e) => h(条目行, { key: e.文件 + e.序号, e, 选中: !!选中[e.文件 + '#' + e.序号], onToggle: 勾选, onOpen: (x) => 设详情(x), onIgnore: 忽略条目条, 打开中: 详情 && 详情.文件 === e.文件 && 详情.序号 === e.序号 }))),
              ]);
            }),
            !过滤.length ? h('div', { key: 'empty', className: 'dmd-empty' }, [h(IcoArchive, { key: 'i', size: 22 }), h('div', { key: 't' }, 搜索 ? '没有匹配的条目' : '这个筛选下没有条目')]) : null,
          ]),
          详情 ? h('div', { key: 'side', className: 'dmd-runtime-side' }, h('div', { className: 'dmd-detail' }, [
            h('div', { key: 'h', className: 'dmd-detail-h' }, [
              h('span', { key: 'f', className: 'dmd-chip dmd-chip-brand' }, 详情.文件),
              h('span', { key: 'i', className: 'dmd-idx' }, '#' + 详情.序号),
              ...(详情.标记 || []).map((m) => h(Chip, { key: m, tone: 标记Tone(m) }, m)),
              h('div', { key: 's', className: 'dmd-spacer' }),
              h('button', { key: 'x', className: 'dmd-btn sm', onClick: () => 设详情(null) }, '关闭'),
            ]),
            h('div', { key: 'b', className: 'dmd-detail-b' }, 详情.全文 || 详情.摘要),
            h('div', { key: 'f', className: 'dmd-detail-f' }, [
              h('span', { key: 'c', className: 'dmd-muted' }, 详情.字节 + ' 字节'),
              h('div', { key: 's', className: 'dmd-spacer' }),
              h('button', { key: 'cp', className: 'dmd-btn sm', onClick: () => 复制(详情.全文 || 详情.摘要, '条目') }, h(IcoCopy, { size: 13 }), '复制'),
              h('button', { key: 'ar', className: 'dmd-btn sm dmd-btn-danger', disabled: 忙碌, onClick: () => 执行(async () => {
                const r = await api('/slim', { method: 'POST', body: { 文件: 详情.文件, 序号们: [详情.序号], 确认: true } });
                if (!r.ok) throw new Error(r.错误 || '归档失败');
                设详情(null); return r;
              }, (r) => `已归档 1 条（省 ${r.省下字节} 字节）`) }, '归档这条'),
            ]),
          ])) : null,
        ]),
        h('div', { key: 'bar', className: 'dmd-selbar' }, [
          h('div', { key: 'n', className: 'dmd-muted' }, 选中的条目.length ? `已选 ${选中的条目.length} 条` : '勾选后可批量归档（先备份，可恢复）'),
          h('div', { key: 's', className: 'dmd-spacer' }),
          h('button', { key: 'c', className: 'dmd-btn sm', disabled: !选中的条目.length, onClick: () => 设选中({}) }, '清除选择'),
          h('button', { key: 'a', className: 'dmd-btn dmd-btn-primary sm', disabled: 忙碌 || !选中的条目.length, onClick: () => 执行(归档选中, (s) => '已归档：' + s) }, '归档选中'),
        ]),
      ]);

      // ── 文档（只读，来自记忆库 documents/）──────────────────────
      const 文档详情内容 = 文档详情 && (文档详情.内容 || '');
      const 文档页 = h('div', { key: 'docs', style: { display: 'flex', flexDirection: 'column', gap: 14 } }, [
        h('div', { key: 'list', className: 'dmd-card' }, [
          h('div', { key: 'h', className: 'dmd-card-h' }, [
            h('span', null, h(IcoDoc)),
            h('div', { key: 't', className: 'dmd-card-t' }, '项目文档'),
            h('div', { key: 's', className: 'dmd-spacer' }),
            h(Chip, { key: 'c' }, '只读 · 来自记忆库'),
            h(Chip, { key: 'n' }, 文档文件.length + ' 篇'),
          ]),
          h('div', { key: 'b', className: 'dmd-card-b' }, 文档文件.length
            ? 文档文件.map((f) => h('div', { key: f.路径, className: 'dmd-file-row', style: { cursor: 'pointer', borderColor: 文档详情 && 文档详情.路径 === f.路径 ? 'var(--dsw-alias-brand-primary)' : undefined }, onClick: () => 执行(async () => { const r = await api('/doc?path=' + encodeURIComponent(f.路径)); if (!r.ok) throw new Error(r.错误 || '读取失败'); 设文档详情(r); return r; }, '已读取 ' + f.路径) }, [
              h('div', { key: 'n', className: 'dmd-file-name' }, f.路径),
              h('div', { key: 'm', className: 'dmd-muted' }, 千分(f.字节) + ' · ' + 时分(f.修改时间)),
            ]))
            : h('div', { key: 'e', className: 'dmd-empty' }, [h(IcoDoc, { key: 'i', size: 22 }), h('div', { key: 't' }, (文档数据 && 文档数据.存在) ? '文档目录是空的' : '没有文档目录（项目文档库为空；未安装或未使用时就为空）'), h('div', { key: 'p', className: 'dmd-mono' }, (文档数据 && 文档数据.根) || '')])),
        ]),
        文档详情 ? h('div', { key: 'doc', className: 'dmd-card' }, [
          h('div', { key: 'h', className: 'dmd-card-h' }, [
            h('div', { key: 't', className: 'dmd-card-t' }, 文档详情.路径),
            h('div', { key: 's', className: 'dmd-spacer' }),
            h(Chip, { key: 'c' }, 千分(文档详情.字节)),
            h('button', { key: 'x', className: 'dmd-btn sm', onClick: () => 设文档详情(null) }, '关闭'),
          ]),
          h('div', { key: 'b', className: 'dmd-card-b' }, h('div', { className: 'dmd-txt' }, 文档详情内容)),
        ]) : null,
      ]);

      // ── 记忆包 ──────────────────────────────────────────────────
      const 记忆包页 = h('div', { key: 'pk', style: { display: 'flex', flexDirection: 'column', gap: 14 } }, [
        h('div', { key: 'c1', className: 'dmd-grid', style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' } }, [
          h('div', { key: 'ex', className: 'dmd-card' }, [
            h('div', { key: 'h', className: 'dmd-card-h' }, [h('span', null, h(IcoPackage)), h('div', { key: 't', className: 'dmd-card-t' }, '导出记忆包'), h('div', { key: 's', className: 'dmd-spacer' }), h(Chip, { key: 'c' }, '换机 / 共享 / 留档')]),
            h('div', { key: 'b', className: 'dmd-card-b' }, [
              h('div', { key: 'd', className: 'dmd-muted' }, '把 MEMORY.md、USER.md、memories.json 与文档目录打成一个带 manifest 的文件夹（默认放在 ~/.mnemon/ 下）。'),
              h('div', { key: 'r', className: 'dmd-row', style: { marginTop: 12 } }, h('button', { key: 'b', className: 'dmd-btn dmd-btn-primary', disabled: 忙碌, onClick: () => 执行(async () => { const r = await api('/pack', { method: 'POST' }); 设导出结果(r.目录 || ''); return r; }, (r) => '已导出：' + r.目录) }, h(IcoExport), '导出记忆包')),
              导出结果 ? h('div', { key: 'p', className: 'dmd-mono', style: { marginTop: 10 } }, 导出结果) : null,
            ]),
          ]),
          h('div', { key: 'im', className: 'dmd-card' }, [
            h('div', { key: 'h', className: 'dmd-card-h' }, [h('div', { key: 't', className: 'dmd-card-t' }, '导入记忆包')]),
            h('div', { key: 'b', className: 'dmd-card-b' }, [
              h('div', { key: 'd', className: 'dmd-muted' }, '输入记忆包目录的绝对路径；导入是追加合并，不会覆盖现有条目（重复自动跳过）。'),
              h('div', { key: 'r', className: 'dmd-row', style: { marginTop: 12 } }, [
                h('input', { key: 'i', className: 'dmd-input', placeholder: '~/.mnemon/记忆包-…（可粘贴绝对路径）', value: 导入路径, onChange: (ev) => 设导入路径(ev.target.value) }),
                h('label', { key: 'c', className: 'dmd-muted', style: { display: 'flex', gap: 6, alignItems: 'center' } }, h('input', { type: 'checkbox', checked: 导入确认, onChange: (ev) => 设导入确认(ev.target.checked) }), '确认追加'),
                h('button', { key: 'b', className: 'dmd-btn', disabled: 忙碌 || !导入路径 || !导入确认, onClick: () => 执行(async () => { const r = await api('/import', { method: 'POST', body: { 目录: 导入路径, 确认: true } }); 设导入路径(''); 设导入确认(false); return r; }, (r) => '导入完成：' + Object.entries(r.合并 || {}).map(([k, v]) => `${k} +${v.新增}`).join('，')) }, '导入'),
              ]),
            ]),
          ]),
        ]),
        h('div', { key: 'c2', className: 'dmd-card' }, [
          h('div', { key: 'h', className: 'dmd-card-h' }, [h('div', { key: 't', className: 'dmd-card-t' }, '已有记忆包'), h('div', { key: 's', className: 'dmd-spacer' }), h(Chip, { key: 'c' }, (存储.记忆包 ? 存储.记忆包.数量 : 0) + ' 份')]),
          h('div', { key: 'b', className: 'dmd-card-b' }, (存储.记忆包 && 存储.记忆包.数量)
            ? h('div', null, [
              h('div', { key: 'p', className: 'dmd-mono' }, '最近：' + (存储.记忆包.最近 || '')),
              h('div', { key: 'r', className: 'dmd-row', style: { marginTop: 10 } }, h('button', { key: 'c', className: 'dmd-btn sm', onClick: () => 复制(存储.记忆包.最近 || '', '记忆包路径') }, h(IcoCopy, { size: 13 }), '复制最近路径')),
            ])
            : h('div', { key: 'e', className: 'dmd-empty' }, [h(IcoPackage, { key: 'i', size: 22 }), h('div', { key: 't' }, '还没有导出过记忆包')])),
        ]),
      ]);

      // ── 归档 ────────────────────────────────────────────────────
      const 归档内容 = 归档文件.length ? 归档文件.map((f) => h('div', { key: f.名, className: 'dmd-file-row' }, [
        h(Chip, { key: 't', tone: f.类型 === '备份' ? '' : 'brand' }, f.类型),
        h('div', { key: 'n', className: 'dmd-file-name' }, f.名),
        h('div', { key: 'm', className: 'dmd-muted' }, 千分(f.字节) + ' · ' + 时分(f.修改时间)),
        f.类型 === '备份'
          ? (恢复确认 === f.名
            ? h('div', { key: 'c', className: 'dmd-row' }, [
              h('button', { key: 'y', className: 'dmd-btn sm dmd-btn-danger', disabled: 忙碌, onClick: () => 执行(async () => { const r = await api('/restore', { method: 'POST', body: { 归档文件名: f.名, 文件: f.名.startsWith('USER.md') ? 'USER.md' : 'MEMORY.md', 确认: true } }); 设恢复确认(null); return r; }, (r) => '已恢复：' + r.文件) }, '确认恢复'),
              h('button', { key: 'n', className: 'dmd-btn sm', onClick: () => 设恢复确认(null) }, '取消'),
            ])
            : h('button', { key: 'r', className: 'dmd-btn sm', onClick: () => 设恢复确认(f.名) }, '恢复'))
          : null,
      ])) : h('div', { key: 'e', className: 'dmd-empty' }, [h(IcoArchive, { key: 'i', size: 22 }), h('div', { key: 't' }, '还没有归档。在「运行时记忆」里勾选条目归档后会出现在这里。')]);
      const 归档页 = h('div', { key: 'ar' }, h('div', { key: 'c', className: 'dmd-card' }, [
        h('div', { key: 'h', className: 'dmd-card-h' }, [h('div', { key: 't', className: 'dmd-card-t' }, '归档与备份'), h('div', { key: 's', className: 'dmd-spacer' }), h(Chip, { key: 'c' }, 归档文件.length + ' 份')]),
        h('div', { key: 'b', className: 'dmd-card-b' }, 归档内容),
      ]));

      // ── 设置 ────────────────────────────────────────────────────
      const 设置页 = h('div', { key: 'st', style: { display: 'flex', flexDirection: 'column', gap: 14 } }, [
        h('div', { key: 'inject', className: 'dmd-card' }, [
          h('div', { key: 'h', className: 'dmd-card-h' }, [h('div', { key: 't', className: 'dmd-card-t' }, '热记忆注入'), h('div', { key: 's', className: 'dmd-spacer' }), h(Chip, { key: 'c', tone: 注入 ? 'brand' : '' }, 注入 ? '已开启' : '已关闭')]),
          h('div', { key: 'b', className: 'dmd-card-b' }, [
            h('div', { key: 'd', className: 'dmd-muted' }, '开启后每轮对话都会带上 MEMORY.md 与 USER.md；检测到其他记忆插件时默认让位，避免重复注入。'),
            h('div', { key: 'r', className: 'dmd-row', style: { marginTop: 12, justifyContent: 'space-between' } }, [
              h('span', { key: 't' }, '每轮注入热记忆'),
              h('div', { key: 's', className: 'dmd-row' }, [
                h('div', { key: 'sw', className: 'dmd-switch', 'data-on': 注入 ? 'true' : 'false', onClick: () => 执行(async () => { const r = await api('/config', { method: 'POST', body: { inject: !注入 } }); 设配置(r); return r; }, (r) => '注入已' + (r.注入 ? '开启' : '关闭')) }, h('i')),
              ]),
            ]),
          ]),
        ]),
        h('div', { key: 'paths', className: 'dmd-card' }, [
          h('div', { key: 'h', className: 'dmd-card-h' }, [h('div', { key: 't', className: 'dmd-card-t' }, '存储路径')]),
          h('div', { key: 'b', className: 'dmd-card-b' }, [
            [['记忆根', 存储.根], ['运行时记忆', 存储.运行时 && 存储.运行时.路径], ['归档与备份', 存储.归档 && 存储.归档.路径], ['文档目录', 存储.文档 && 存储.文档.路径]].map(([k, p]) => h('div', { key: k, className: 'dmd-row', style: { justifyContent: 'space-between', marginTop: 8 } }, [
              h('span', { key: 'k', className: 'dmd-muted', style: { width: 92, flex: 'none' } }, k),
              h('span', { key: 'p', className: 'dmd-mono', style: { flex: 1 } }, p || '（不存在）'),
              h('button', { key: 'c', className: 'dmd-btn sm', disabled: !p, onClick: () => 复制(p || '', k) }, h(IcoCopy, { size: 13 })),
            ])),
          ]),
        ]),
        h('div', { key: 'ignored', className: 'dmd-card' }, [
          h('div', { key: 'h', className: 'dmd-card-h' }, [h('div', { key: 't', className: 'dmd-card-t' }, '已忽略的体检项'), h('div', { key: 's', className: 'dmd-spacer' }), h(Chip, { key: 'c' }, String(体检.摘要.已忽略 || 0) + ' 条')]),
          h('div', { key: 'b', className: 'dmd-card-b' }, [
            h('div', { key: 'd', className: 'dmd-muted' }, '在「运行时记忆」里点过「忽略」的条目，不再出现在体检建议里（误报可以这样一次性消掉）。恢复后重新参与体检。'),
            体检.摘要.已忽略 ? h('div', { key: 'r', className: 'dmd-row', style: { marginTop: 12 } }, h('button', { key: 'rs', className: 'dmd-btn', disabled: 忙碌, onClick: () => 执行(async () => { const g = await api('/ignored'); let n = 0; for (const k of (g.忽略 || [])) { await api('/ignore', { method: 'POST', body: { 指纹: k, 恢复: true } }); n++; } return { 恢复: n }; }, (r) => '已恢复 ' + r.恢复 + ' 条') }, '全部恢复')) : null,
          ]),
        ]),
        h('div', { key: 'tools', className: 'dmd-card' }, [
          h('div', { key: 'h', className: 'dmd-card-h' }, [h('div', { key: 't', className: 'dmd-card-t' }, '诊断与版本')]),
          h('div', { key: 'b', className: 'dmd-card-b' }, [
            h('div', { key: 'v', className: 'dmd-row', style: { justifyContent: 'space-between' } }, [
              h('span', null, '当前版本'),
              h('span', { className: 'dmd-mono' }, `dsh-memory-doctor ${记忆引擎版本}`),
            ]),
            h('div', { key: 'r', className: 'dmd-row', style: { marginTop: 12 } }, [
              h('button', { key: 'rep', className: 'dmd-btn', disabled: 忙碌, onClick: () => 执行(async () => { const r = await api('/report', { method: 'POST' }); 设报告路径(r.路径 || ''); return r; }, (r) => '诊断报告已生成：' + r.路径) }, '导出诊断报告'),
              h('a', { key: 'npm', className: 'dmd-btn', href: 'https://www.npmjs.com/package/dsh-memory-doctor', target: '_blank', rel: 'noopener' }, '查看 npm'),
              h('a', { key: 'gh', className: 'dmd-btn', href: 'https://github.com/feely0208/dsh-memory-doctor', target: '_blank', rel: 'noopener' }, 'GitHub'),
            ]),
            报告路径 ? h('div', { key: 'p', className: 'dmd-mono', style: { marginTop: 10 } }, 报告路径) : null,
          ]),
        ]),
        h('div', { key: 'about', className: 'dmd-card' }, [
          h('div', { key: 'h', className: 'dmd-card-h' }, h('div', { key: 't', className: 'dmd-card-t' }, '与其他记忆插件共存')),
          h('div', { key: 'b', className: 'dmd-card-b' }, h('div', { key: 't', className: 'dmd-muted' }, '检测到其他记忆插件时，双方读写同一份明文记忆，不会重复写；默认由对方负责每轮注入，深鲸记忆只做体检、归档与记忆包。要替换时，在插件面板停用对方即可，深鲸记忆会自动接管注入。')),
        ]),
      ]);

      const 页签 = h('div', { key: 'tabs', className: 'dmd-tabs' }, [
        ['overview', '概览'], ['runtime', '运行时记忆'], ['docs', '文档'], ['packs', '记忆包'], ['archive', '归档'], ['settings', '设置'],
      ].map(([k, t]) => h('button', { key: k, className: 'dmd-tab', 'data-on': 页 === k ? 'true' : 'false', onClick: () => 设页(k) }, t)));

      return h('div', { className: 'dmd-root' }, [
        头,
        页签,
        h('div', { key: 'body', className: 'dmd-scroll' }, [页 === 'overview' ? 概览页 : 页 === 'runtime' ? 运行时页 : 页 === 'docs' ? 文档页 : 页 === 'packs' ? 记忆包页 : 页 === 'archive' ? 归档页 : 设置页]),
        h('div', { key: 'foot', className: 'dmd-foot' }, h('a', { href: 'https://deepwhale.org.cn', target: '_blank', rel: 'noopener' }, h('img', { src: BADGE, alt: 'powered by dwh', style: { height: 20, width: 121, display: 'block' } }))),
        提示 ? h('div', { key: 'toast', className: 'dmd-toast', 'data-kind': 提示.kind }, 提示.文本) : null,
      ]);
    }

    function 其他记忆记忆源(list) { return list || []; }

    /** 会话回复旁的大脑按钮：把这条回复存进 MEMORY.md / USER.md */
    function SaveReplyAction({ messageId, sessionId }) {
      const [开, 设开] = react.useState(false);
      const [锚点, 设锚点] = react.useState(null);
      const [文本, 设文本] = react.useState(null);
      const [错, 设错] = react.useState('');
      const [目标, 设目标] = react.useState('MEMORY.md');
      const [忙, 设忙] = react.useState(false);
      const [结果, 设结果] = react.useState(null);
      const 取 = react.useCallback(async () => {
        if (!messageId) return;
        设错(''); 设结果(null);
        try {
          const q = new URLSearchParams({ sessionId: sessionId || '', messageId });
          const r = await api('/message?' + q.toString());
          设文本(r.文本 || '');
        } catch (e) { 设错(String(e && e.message || e)); 设文本(''); }
      }, [messageId, sessionId]);
      react.useEffect(() => { if (开) 取(); }, [开, 取]);
      react.useEffect(() => {
        if (!开) return;
        const onDoc = (ev) => { if (!ev.target.closest || !ev.target.closest('.dmd-save-wrap')) 设开(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
      }, [开]);
      async function 保存() {
        设忙(true); 设错(''); 设结果(null);
        try {
          const r = await api('/save-message', { method: 'POST', body: { sessionId, messageId, target: 目标 === 'USER.md' ? 'user' : 'memory', text: 文本 } });
          设结果(r.说明 || '已存入记忆');
        } catch (e) { 设错(String(e && e.message || e)); }
        finally { 设忙(false); }
      }
      if (!messageId) return null;
      return h('span', { className: 'dmd-save-wrap' }, [
        h('style', { key: 'css' }, CSS),
        h('button', {
          key: 'b', type: 'button', className: 'dmd-save-btn', 'aria-label': '将这条回复存入记忆',
          onClick: (ev) => {
            const r = ev.currentTarget.getBoundingClientRect();
            设锚点({ left: Math.max(8, Math.min(r.left, (window.innerWidth || 800) - 372)), top: r.top });
            设开(!开);
          },
        }, [h(IcoBrain, { key: 'i', size: 15 }), h('span', { key: 'tip', className: 'dmd-save-tip' }, '将这条回复存入记忆')]),
        开 ? h('div', { key: 'p', className: 'dmd-save-pop', style: {
          position: 'fixed',
          left: 锚点 ? 锚点.left : 8,
          top: 锚点 ? Math.max(8, 锚点.top - 320) : 'auto',
          bottom: 'auto',
          width: 'min(360px, calc(100vw - 24px))',
          background: 'var(--dsw-alias-bg-base)', border: '.5px solid var(--dsw-alias-border-l1)',
          borderRadius: 12, boxShadow: '0 12px 36px rgba(0,0,0,.28)', padding: '12px 14px',
          zIndex: 80,
        } }, [
          h('div', { key: 'h', className: 'dmd-save-h' }, [h(IcoBrain, { key: 'i', size: 14 }), '将这条回复存入记忆']),
          h('div', { key: 'pv', className: 'dmd-save-preview', style: { maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, lineHeight: 1.65, color: 'var(--dsw-alias-label-secondary)', background: 'var(--dsw-alias-bg-layer-2)', borderRadius: 8, padding: '8px 10px' } }, 文本 === null ? '读取中…' : (文本 || '（这条回复没有可保存的纯文本）')),
          h('div', { key: 'r', className: 'dmd-save-row' }, [
            h('select', { key: 's', value: 目标, onChange: (ev) => 设目标(ev.target.value) }, [h('option', { key: 'm', value: 'MEMORY.md' }, '存入工作记忆 MEMORY.md'), h('option', { key: 'u', value: 'USER.md' }, '存入用户画像 USER.md')]),
            h('button', { key: 'x', type: 'button', className: 'dmd-btn sm', onClick: () => 设开(false) }, '取消'),
            h('button', { key: 'y', type: 'button', className: 'dmd-btn sm dmd-btn-primary', disabled: 忙 || 文本 === null || !文本, onClick: 保存 }, 忙 ? '保存中…' : '保存'),
          ]),
          h('div', { key: 'm', className: 'dmd-save-msg' + (结果 ? ' ok' : 错 ? ' err' : '') }, 结果 || 错 || '保存前会自动去重、备份；超过上限会提示先归档'),
        ]) : null,
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
      // 样式全局注入一次：存入记忆按钮在聊天区，不依赖面板是否打开
      if (typeof document !== 'undefined' && !document.getElementById('dsh-memory-doctor-style')) {
        const el = document.createElement('style');
        el.id = 'dsh-memory-doctor-style';
        el.textContent = CSS;
        document.head.appendChild(el);
      }
      ctx.slots.inject(SLOT_MAIN, function* () { yield ctx.slots.register({ name: SLOT_MAIN, key: PANEL_ID }, 安全面板); });
      ctx.slots.inject(SLOT_ICON, function* () { yield ctx.slots.register({ name: SLOT_ICON, id: PANEL_ID, order: 22, label: '深鲸记忆' }, 图标); });
      // 每条助手回复旁的大脑按钮：一键存入记忆（与 mnemon 的「存入记忆」同位置）
      ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
        name: 'conversation.chat.assistant-actions',
        id: 'dsh-memory-doctor/save',
        order: 95,
        inject: (sessionId) => ({ sessionId: typeof sessionId === 'string' ? sessionId : '' }),
      }, SaveReplyAction));
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
