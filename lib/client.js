/**
 * 深鲸记忆体检 —— 客户端半边（面板 UI）
 * 槽位照官方写法：sidebar.panellist 出图标，main 渲染面板；数据走本地 HTTP 出口。
 */
window.__ModuleLoader__.load({
  id: 'dsh-memory-doctor',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    let react = require('react');
    const h = react.createElement;

    const SLOT_ICON = 'sidebar.panellist';
    const SLOT_MAIN = 'main';
    const PANEL_ID = 'memory-doctor';
    const API = '/dsh-memory-doctor/api';
    const BADGE = API + '/badge';

    const 小字 = { fontSize: 12, color: 'inherit', opacity: 0.75 };
    const 卡 = { border: '1px solid rgba(127,127,127,.28)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 };
    const 按钮 = (主) => ({
      height: 30, padding: '0 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5,
      border: '1px solid ' + (主 ? 'rgba(10,110,189,.6)' : 'rgba(127,127,127,.45)'),
      background: 主 ? 'rgba(10,110,189,.14)' : 'transparent',
      color: 'inherit', fontWeight: 主 ? 600 : 400,
    });

    function 图标() {
      return h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 },
        h('path', { d: 'M12 3c3 0 5 2 5 5v3c0 3-2 5-5 5s-5-2-5-5V8c0-3 2-5 5-5z' }),
        h('path', { d: 'M8 13c-1.6 1.2-2.4 2.8-2.4 4.6 0 1.9 2.9 3.4 6.4 3.4s6.4-1.5 6.4-3.4c0-1.8-.8-3.4-2.4-4.6' }));
    }

    function 进度(标签, 档) {
      const 色 = 档.百分比 >= 90 ? '#d95c5c' : 档.百分比 >= 75 ? '#d9a13b' : '#3fa66a';
      return h('div', { style: { marginBottom: 10 } }, [
        h('div', { key: 'l', style: { display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 } }, [
          h('span', { key: 'a' }, 标签),
          h('span', { key: 'b', style: { opacity: 0.8 } }, `${档.大小} / ${档.上限} 字节 · ${档.条目数} 条`),
        ]),
        h('div', { key: 't', style: { height: 8, borderRadius: 4, background: 'rgba(127,127,127,.22)', overflow: 'hidden' } },
          h('div', { style: { width: Math.min(100, 档.百分比) + '%', height: '100%', background: 色 } })),
      ]);
    }

    function 面板() {
      const [体检, 设体检] = react.useState(null);
      const [选中, 设选中] = react.useState({});
      const [消息, 设消息] = react.useState('');
      const [忙, 设忙] = react.useState(false);

      const 拉 = async () => {
        设忙(true); 设消息('');
        try {
          const r = await (await fetch(API + '/audit')).json();
          if (r.ok) 设体检(r.体检); else 设消息(r.错误 || '体检失败');
        } catch (e) { 设消息('连不上本地接口：' + e.message); }
        设忙(false);
      };
      react.useEffect(() => { 拉(); }, []);

      const 归档 = async () => {
        const 名单 = Object.entries(选中).filter(([, v]) => v).map(([k]) => Number(k));
        if (!名单.length) { 设消息('先勾选要归档的条目'); return; }
        设忙(true);
        try {
          const r = await (await fetch(API + '/slim', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 文件: 'MEMORY.md', 序号们: 名单, 确认: true }),
          })).json();
          设消息(r.ok ? `已归档 ${r.归档条数} 条，省 ${r.省下字节} 字节 → ${r.归档文件}` : (r.错误 || '失败'));
          if (r.ok) { 设选中({}); await 拉(); }
        } catch (e) { 设消息('操作失败：' + e.message); }
        设忙(false);
      };

      const 导出 = async () => {
        设忙(true);
        try {
          const r = await (await fetch(API + '/pack', { method: 'POST' })).json();
          设消息(r.ok ? `记忆包已导出：${r.目录}` : (r.错误 || '导出失败'));
        } catch (e) { 设消息('导出失败：' + e.message); }
        设忙(false);
      };

      const 条目 = 体检 ? 体检.条目 : [];
      return h('div', { style: { padding: '14px 16px', display: 'flex', flexDirection: 'column', minHeight: 0 } }, [
        h('div', { key: 'hd', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 } }, [
          h('div', { key: 't', style: { fontSize: 14, fontWeight: 700 } }, '深鲸 · 记忆体检'),
          h('div', { key: 'b', style: { display: 'flex', gap: 8 } }, [
            h('button', { key: 'r', style: 按钮(false), disabled: 忙, onClick: 拉 }, 忙 ? '…' : '重新体检'),
            h('button', { key: 'p', style: 按钮(false), disabled: 忙, onClick: 导出 }, '导出记忆包'),
          ]),
        ]),
        h('div', { key: 'st', style: 卡 }, 体检 ? [
          h('div', { key: 's', style: { ...小字, marginBottom: 8 } }, 体检.家目录),
          进度('MEMORY.md（项目/环境记忆）', 体检.文件['MEMORY.md']),
          进度('USER.md（用户画像）', 体检.文件['USER.md']),
          (体检.建议 || []).map((s, i) => h('div', { key: 'a' + i, style: { fontSize: 12.5, marginTop: 4 } }, '→ ' + s)),
        ] : h('div', { style: 小字 }, 忙 ? '正在体检…' : '还没有数据')),
        h('div', { key: 'list', style: { ...卡, flex: 1, minHeight: 120, overflow: 'auto' } }, [
          h('div', { key: 'h', style: { ...小字, marginBottom: 8 } }, `条目（勾选后可归档；归档=移到 archived/，不是删除）`),
          ...条目.map((e) => h('label', { key: e.文件 + '-' + e.序号, style: { display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0', fontSize: 12.5, borderBottom: '1px solid rgba(127,127,127,.12)' } }, [
            h('input', {
              type: 'checkbox', checked: !!选中[e.序号], disabled: e.文件 !== 'MEMORY.md',
              onChange: (ev) => 设选中({ ...选中, [e.序号]: ev.target.checked }),
              style: { marginTop: 2 },
            }),
            h('span', { key: 'm', style: { flex: '0 0 auto', opacity: 0.7 } }, `${e.文件} #${e.序号}`),
            h('span', { key: 't', style: { flex: 1 } }, e.摘要),
            h('span', { key: 'b', style: { flex: '0 0 auto', ...小字 } }, e.标记.join(' · ')),
          ])),
          !条目.length && h('div', { style: 小字 }, '没有条目'),
        ]),
        h('div', { key: 'act', style: { display: 'flex', gap: 8, alignItems: 'center' } }, [
          h('button', { key: 's', style: 按钮(true), disabled: 忙, onClick: 归档 }, '归档勾选的 MEMORY.md 条目'),
          h('div', { key: 'msg', style: { ...小字, flex: 1 } }, 消息),
        ]),
        h('a', { key: 'bd', href: 'https://deepwhale.org.cn', target: '_blank', rel: 'noopener',
          style: { display: 'flex', justifyContent: 'flex-end', paddingTop: 8 } },
          h('img', { src: BADGE, alt: 'powered by dwh', style: { height: 20, width: 121, display: 'block' } })),
      ]);
    }

    function 兜底({ children }) { return h('div', { style: { padding: 12 } }, children); }
    function 安全面板(props) {
      try { return 面板(props); } catch (e) { return h(兜底, null, '深鲸记忆体检面板出错：' + String(e && e.message || e)); }
    }

    const inject = ['slots'];
    function apply(ctx) {
      ctx.slots.inject(SLOT_MAIN, function* () {
        yield ctx.slots.register({ name: SLOT_MAIN, key: PANEL_ID }, 安全面板);
      });
      ctx.slots.inject(SLOT_ICON, function* () {
        yield ctx.slots.register({ name: SLOT_ICON, id: PANEL_ID, order: 22, label: '记忆体检' }, 图标);
      });
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
