window.__ModuleLoader__.load({
  id: 'dsh-qianchuan-workbench',
  factory: (require) => {
    var module = { exports: {} }; var exports = module.exports
    const React = require('react')
    const h = React.createElement

    const RPC = '/_dsh/dsh-qianchuan-workbench'
    const PANEL = 'qianchuan-workbench'
    const NS = 'qcw'

    const zh = {
      tabDesk: '作战台', tabQueue: '决策队列', tabPlans: '计划体检', tabLive: '直播间',
      tabMats: '素材', tabAlerts: '异常雷达', tabAI: 'AI 建议', tabSettings: '设置',
      loading: '加载中…', failed: '操作失败', retry: '重试', empty: '还没有数据',
      refresh: '刷新', force: '强制刷新', search: '搜索计划名…', noData: '暂无可展示的数据'
    }

    // ── 宿主设计令牌（自动跟随明暗主题）───────────────────────────────────
    const TOK = {
      bg: 'var(--dsw-alias-bg-base, #fff)',
      layer1: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,.05))',
      layer2: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,.08))',
      layer3: 'var(--dsw-alias-bg-layer-3, rgba(127,127,127,.12))',
      fg: 'var(--dsw-alias-label-primary, currentColor)',
      fg2: 'var(--dsw-alias-label-secondary, currentColor)',
      fg3: 'var(--dsw-alias-label-caption, currentColor)',
      bd1: 'var(--dsw-alias-border-l1, rgba(127,127,127,.18))',
      bd2: 'var(--dsw-alias-border-l2, rgba(127,127,127,.28))',
      hover: 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12))',
      active: 'var(--dsw-alias-interactive-bg-active, rgba(127,127,127,.18))',
      ok: 'var(--dsw-alias-state-success-primary, #30a46c)',
      warn: 'var(--dsw-alias-state-warn-primary, #f5a524)',
      err: 'var(--dsw-alias-state-error-primary, #e5484d)',
      biz: 'var(--dsw-alias-state-business-primary, #3b82f6)',
      brand: 'var(--dsw-alias-brand-primary, #4f46e5)',
      fill: 'var(--dsw-alias-button-primary-fill, #4f46e5)',
      onFill: 'var(--dsw-alias-label-primary-foreground, #fff)',
      fillHover: 'var(--dsw-alias-button-primary-hover, #4f46e5)'
    }

    // 宿主组件库（运行时注入；取不到则降级为纯 CSS，不影响启动）
    let PRIM = {}
    try { PRIM = require('@deepseek-ai/dsh-client-ui-primitives') || {} } catch (e) { PRIM = {} }

    const CSS = [`
      /* ★ 2026-10-12 计划树 + 素材下钻 + 调整按钮 */
      .qc-bar{display:flex;gap:8px;align-items:center;margin:0 0 12px;flex-wrap:wrap}
      .qc-mini{font:inherit;font-size:12px;line-height:1;padding:4px 8px;border-radius:6px;cursor:pointer;
        border:1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.28));background:transparent;color:inherit;opacity:.9}
      .qc-mini:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));opacity:1}
      .qc-mini:disabled{opacity:.4;cursor:default}
      .qc-treebtn{width:18px;height:18px;line-height:1;padding:0;margin-right:6px;border:none;background:transparent;
        color:inherit;cursor:pointer;font-size:11px;opacity:.7;border-radius:4px}
      .qc-treebtn:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));opacity:1}
      .qc-kidrow>td{border-top:1px dashed var(--dsw-alias-border-l1, rgba(127,127,127,.18))}
      .qc-cardhd{display:flex;align-items:center;gap:8px;padding:10px 12px;font-weight:600;font-size:13px;
        border-bottom:1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18))}
`,
      '.qc{display:flex;flex-direction:column;height:100%;min-height:0;font-family:var(--dsw-font-family,inherit);color:' + TOK.fg + '}',

      // 顶栏
      '.qc-top{display:flex;align-items:center;gap:12px;padding:14px 22px 0;flex-wrap:wrap;flex:none}',
      '.qc-title{display:flex;align-items:baseline;gap:10px;min-width:0}',
      '.qc-title h1{margin:0;font-size:17px;font-weight:650;letter-spacing:.2px}',
      '.qc-meta{font-size:11.5px;color:' + TOK.fg3 + ';white-space:nowrap}',
      '.qc-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:4px;vertical-align:middle}',

      // 页签
      '.qc-tabs{display:flex;gap:2px;padding:10px 18px 0;flex-wrap:wrap;flex:none}',
      '.qc-tab{position:relative;border:0;background:none;color:' + TOK.fg2 + ';font:inherit;font-size:12.5px;cursor:pointer;padding:7px 11px;border-radius:8px 8px 0 0;white-space:nowrap;display:flex;align-items:center;gap:5px}',
      '.qc-tab:hover{background:' + TOK.hover + ';color:' + TOK.fg + '}',
      '.qc-tab[data-on="1"]{color:' + TOK.fg + ';font-weight:600}',
      '.qc-tab[data-on="1"]::after{content:"";position:absolute;left:9px;right:9px;bottom:-1px;height:2px;border-radius:2px;background:' + TOK.biz + '}',
      '.qc-tabn{font-size:10px;min-width:16px;text-align:center;padding:1px 5px;border-radius:9px;background:' + TOK.layer3 + ';font-variant-numeric:tabular-nums}',
      '.qc-tabn[data-tone="err"]{background:color-mix(in srgb,' + TOK.err + ' 22%,transparent);color:' + TOK.err + '}',
      '.qc-tabn[data-tone="warn"]{background:color-mix(in srgb,' + TOK.warn + ' 22%,transparent);color:' + TOK.warn + '}',

      // 工具条
      '.qc-bar{display:flex;align-items:center;gap:8px;padding:8px 22px;border-bottom:1px solid ' + TOK.bd1 + ';flex:none;flex-wrap:wrap;min-height:44px;box-sizing:border-box}',

      // 内容区
      '.qc-body{flex:1;min-height:0;overflow:auto;padding:18px 22px 40px}',
      '.qc-sec{margin-bottom:20px}',
      '.qc-h{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:' + TOK.fg2 + ';text-transform:none;letter-spacing:.3px;margin:0 0 10px}',
      '.qc-h::before{content:"";width:3px;height:12px;border-radius:2px;background:' + TOK.biz + ';opacity:.9}',

      // KPI 卡
      '.qc-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px}',
      '.qc-kpi{border:1px solid ' + TOK.bd1 + ';border-radius:12px;padding:13px 15px;background:' + TOK.layer1 + ';display:flex;flex-direction:column;gap:3px;min-width:0}',
      '.qc-kpi-l{font-size:11.5px;color:' + TOK.fg3 + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.qc-kpi-v{font-size:24px;font-weight:650;line-height:1.15;font-variant-numeric:tabular-nums;letter-spacing:-.4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.qc-kpi-v small{font-size:13px;font-weight:500;opacity:.7;margin-left:2px}',
      '.qc-kpi-s{font-size:11px;color:' + TOK.fg3 + ';display:flex;align-items:center;gap:4px}',
      '.qc-kpi-spark{margin-top:2px}',

      // 徽标
      '.qc-b{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;padding:2px 8px;border-radius:999px;white-space:nowrap;border:1px solid transparent;font-weight:500}',
      '.qc-b[data-t="ok"]{background:color-mix(in srgb,' + TOK.ok + ' 16%,transparent);color:' + TOK.ok + ';border-color:color-mix(in srgb,' + TOK.ok + ' 32%,transparent)}',
      '.qc-b[data-t="warn"]{background:color-mix(in srgb,' + TOK.warn + ' 16%,transparent);color:' + TOK.warn + ';border-color:color-mix(in srgb,' + TOK.warn + ' 32%,transparent)}',
      '.qc-b[data-t="err"]{background:color-mix(in srgb,' + TOK.err + ' 16%,transparent);color:' + TOK.err + ';border-color:color-mix(in srgb,' + TOK.err + ' 32%,transparent)}',
      '.qc-b[data-t="biz"]{background:color-mix(in srgb,' + TOK.biz + ' 16%,transparent);color:' + TOK.biz + ';border-color:color-mix(in srgb,' + TOK.biz + ' 32%,transparent)}',
      '.qc-b[data-t="mut"]{background:' + TOK.layer2 + ';color:' + TOK.fg2 + ';border-color:' + TOK.bd1 + '}',

      // 卡片
      '.qc-card{border:1px solid ' + TOK.bd1 + ';border-radius:12px;background:' + TOK.layer1 + ';overflow:hidden}',
      '.qc-card+.qc-card{margin-top:10px}',
      '.qc-pad{padding:14px 16px}',

      // 表格
      '.qc-tbl{width:100%;border-collapse:collapse;font-size:12.5px}',
      '.qc-tbl th{position:sticky;top:0;z-index:1;text-align:left;font-weight:600;font-size:11px;color:' + TOK.fg3 + ';padding:9px 12px;background:' + TOK.bg + ';border-bottom:1px solid ' + TOK.bd1 + ';white-space:nowrap}',
      '.qc-tbl td{padding:9px 12px;border-bottom:1px solid ' + TOK.bd1 + ';vertical-align:middle}',
      '.qc-tbl tr:last-child td{border-bottom:0}',
      '.qc-tbl tbody tr:hover{background:' + TOK.hover + '}',
      '.qc-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.qc-name{max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}',

      // 进度条
      '.qc-prog{height:5px;border-radius:3px;background:' + TOK.layer3 + ';overflow:hidden;min-width:52px}',
      '.qc-prog i{display:block;height:100%;border-radius:3px;background:' + TOK.biz + '}',
      '.qc-prog[data-t="ok"] i{background:' + TOK.ok + '}',
      '.qc-prog[data-t="warn"] i{background:' + TOK.warn + '}',
      '.qc-prog[data-t="err"] i{background:' + TOK.err + '}',

      // 列表
      '.qc-list{display:flex;flex-direction:column;gap:8px}',
      '.qc-item{border:1px solid ' + TOK.bd1 + ';border-radius:11px;padding:12px 14px;background:' + TOK.layer1 + '}',
      '.qc-item-h{display:flex;align-items:center;gap:9px;flex-wrap:wrap}',
      '.qc-grow{flex:1;min-width:0}',
      '.qc-reasons{margin:9px 0 0;padding-left:19px;font-size:12px;color:' + TOK.fg2 + ';line-height:1.75}',
      '.qc-reasons li{margin:1px 0}',

      // 表单
      '.qc-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:11px}',
      '.qc-fld{display:flex;flex-direction:column;gap:5px;min-width:0}',
      '.qc-fld span{font-size:11.5px;color:' + TOK.fg2 + '}',
      '.qc-inp{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:9px;border:1px solid ' + TOK.bd2 + ';background:' + TOK.bg + ';color:inherit;font:inherit;font-size:12.5px;outline:none}',
      '.qc-inp:focus{border-color:' + TOK.brand + ';box-shadow:0 0 0 3px color-mix(in srgb,' + TOK.brand + ' 18%,transparent)}',
      '.qc-btn{padding:7px 14px;border-radius:9px;border:1px solid ' + TOK.bd2 + ';background:' + TOK.bg + ';color:inherit;font:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:5px}',
      '.qc-btn:hover{background:' + TOK.hover + ';border-color:' + TOK.bd2 + '}',
      '.qc-btn:disabled{opacity:.5;cursor:default}',
      '.qc-btn[data-p="1"]{background:' + TOK.fill + ';border-color:' + TOK.fill + ';color:' + TOK.onFill + '}',
      '.qc-btn[data-p="1"]:hover{background:' + TOK.fillHover + '}',

      // 提示
      '.qc-tip{border:1px solid ' + TOK.bd2 + ';border-left-width:3px;border-radius:10px;padding:11px 14px;font-size:12.5px;line-height:1.65;background:' + TOK.layer1 + '}',
      '.qc-tip[data-t="err"]{border-left-color:' + TOK.err + '}',
      '.qc-tip[data-t="warn"]{border-left-color:' + TOK.warn + '}',
      '.qc-tip[data-t="info"]{border-left-color:' + TOK.biz + '}',
      '.qc-tip[data-t="ok"]{border-left-color:' + TOK.ok + '}',
      '.qc-sub{font-size:12.5px;color:' + TOK.fg2 + ';line-height:1.7}',
      '.qc-mut{font-size:11.5px;color:' + TOK.fg3 + '}',
      '.qc-err{color:' + TOK.err + ';font-size:12.5px}',

      // 空状态
      '.qc-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:44px 20px;text-align:center;color:' + TOK.fg3 + '}',
      '.qc-empty-ico{font-size:30px;opacity:.45;line-height:1}',

      // 图表
      '.qc-chartgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}',
      '.qc-legend{display:flex;flex-direction:column;gap:7px;font-size:12px;min-width:0}',
      '.qc-legend-i{display:flex;align-items:center;gap:8px;min-width:0}',
      '.qc-legend-c{width:9px;height:9px;border-radius:3px;flex:none}',
      '.qc-legend-n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.qc-legend-v{font-variant-numeric:tabular-nums;color:' + TOK.fg2 + ';white-space:nowrap}',

      // 骨架
      '.qc-sk{border-radius:8px;background:linear-gradient(90deg,' + TOK.layer2 + ' 25%,' + TOK.layer3 + ' 37%,' + TOK.layer2 + ' 63%);background-size:400% 100%;animation:qcsk 1.3s ease infinite}',
      '@keyframes qcsk{0%{background-position:100% 50%}100%{background-position:0 50%}}',

      // 侧栏
      '.qc-box{display:flex;flex-direction:column;gap:2px;margin:4px 0 8px;padding:0 4px;box-sizing:border-box;flex:0 0 100%;width:100%;max-width:100%;min-width:0;align-self:stretch}',
      '[class*="footerActions"]{flex-wrap:wrap;row-gap:2px;align-items:center}'
    ].join('')

    function installStyles() {
      if (typeof document === 'undefined') return
      const ex = document.querySelector('style[data-qcw]')
      if (ex) { if (ex.textContent !== CSS) ex.textContent = CSS; return }
      const t = document.createElement('style')
      t.dataset.qcw = '1'; t.dataset.pluginCss = 'dsh-qianchuan-workbench/ui.css'; t.textContent = CSS
      document.head.appendChild(t)
    }

    function createStore(v) { let val = v; const ls = new Set(); return { getSnapshot: () => val, subscribe: (f) => { ls.add(f); return () => { ls.delete(f) } }, set: (n) => { val = n; for (const f of [...ls]) f() } } }

    const store = createStore({ status: 'idle', snap: null, advice: null, config: null, error: null, tab: 'desk', search: '', account: 'default',
      // ★ 2026-10-12 新增：上下级联动 + 素材下钻 + 计划调整
      treeSide: 'product', tree: null, treeStatus: 'idle', expanded: {},
      matFor: null, mats: null, matStatus: 'idle',
      opBusy: null, opMsg: null, toast: null })
    const bus = { load: null, advice: null, setTab: null, refresh: null, saveConfig: null }

    function useStore(s) {
      if (typeof React.useSyncExternalStore === 'function') return React.useSyncExternalStore(s.subscribe, s.getSnapshot, s.getSnapshot)
      const [v, setV] = React.useState(s.getSnapshot())
      React.useEffect(() => s.subscribe(() => setV(s.getSnapshot())), [s])
      return v
    }

    const fmtNum = (n, d) => (n === null || n === undefined || isNaN(n)) ? '—' : Number(n).toFixed(d === undefined ? 2 : d)
    const fmtInt = (n) => (n === null || n === undefined) ? '—' : Number(n).toLocaleString('zh-CN')
    const fmtMoney = (n, d) => (n === null || n === undefined) ? '—' : '¥' + Number(n).toFixed(d === undefined ? 2 : d)
    const fmtK = (n) => { if (n === null || n === undefined) return '—'; const v = Number(n); return v >= 10000 ? (v / 10000).toFixed(2) + '万' : v.toLocaleString('zh-CN') }
    const pct = (a, b) => (!a || !b) ? 0 : Math.max(0, Math.min(100, (a / b) * 100))

    // ── 基础组件 ─────────────────────────────────────────────────────────────
    function Badge(p) { return h('span', { className: 'qc-b', 'data-t': p.t || 'mut', title: p.title || undefined }, p.children) }

    function Kpi(p) {
      return h('div', { className: 'qc-kpi' },
        h('div', { className: 'qc-kpi-l' }, p.label),
        h('div', { className: 'qc-kpi-v', style: p.color ? { color: p.color } : undefined },
          p.value, p.unit ? h('small', null, p.unit) : null),
        p.sub ? h('div', { className: 'qc-kpi-s' }, p.sub) : null,
        p.spark ? h('div', { className: 'qc-kpi-spark' }, p.spark) : null
      )
    }

    function Prog(p) {
      const v = Math.max(0, Math.min(100, p.value || 0))
      return h('div', { className: 'qc-prog', 'data-t': p.t || 'mut', title: p.title || undefined, style: p.width ? { width: p.width } : undefined },
        h('i', { style: { width: v + '%' } }))
    }

    function Tip(p) {
      return h('div', { className: 'qc-tip', 'data-t': p.t || 'info' },
        p.title ? h('b', { style: { display: 'block', marginBottom: 3 } }, p.title) : null,
        p.children)
    }

    function Empty(p) {
      return h('div', { className: 'qc-empty' },
        h('div', { className: 'qc-empty-ico' }, p.icon || '📭'),
        h('div', { style: { fontSize: 13, fontWeight: 600, color: TOK.fg2 } }, p.title || '暂无数据'),
        p.sub ? h('div', { className: 'qc-mut', style: { maxWidth: 460 } }, p.sub) : null,
        p.action || null)
    }

    function Skel(p) { return h('div', { className: 'qc-sk', style: Object.assign({ height: 14 }, p.style || {}) }) }

    // ── SVG 图表（零依赖，颜色跟随主题令牌）────────────────────────────────
    function Donut(p) {
      const data = (p.data || []).filter((d) => Number(d.value) > 0)
      const total = data.reduce((a, b) => a + Number(b.value), 0)
      const R = 54, C = 2 * Math.PI * R, SZ = 148
      const colors = p.colors || [TOK.biz, TOK.ok, TOK.warn, TOK.err, TOK.brand, TOK.fg3]
      if (!total) return h('div', { className: 'qc-mut', style: { padding: 18 } }, '无数据')
      let acc = 0
      const arcs = data.map((d, i) => {
        const frac = Number(d.value) / total
        const dash = frac * C
        const seg = h('circle', {
          key: i, cx: SZ / 2, cy: SZ / 2, r: R, fill: 'none',
          stroke: colors[i % colors.length], strokeWidth: 15,
          strokeDasharray: dash + ' ' + (C - dash),
          strokeDashoffset: -acc,
          transform: 'rotate(-90 ' + (SZ / 2) + ' ' + (SZ / 2) + ')',
          strokeLinecap: 'butt'
        })
        acc += dash
        return seg
      })
      return h('div', { style: { display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' } },
        h('svg', { width: SZ, height: SZ, viewBox: '0 0 ' + SZ + ' ' + SZ, style: { flex: 'none' } },
          h('circle', { cx: SZ / 2, cy: SZ / 2, r: R, fill: 'none', stroke: TOK.layer3, strokeWidth: 15 }),
          arcs,
          h('text', { x: SZ / 2, y: SZ / 2 - 4, textAnchor: 'middle', fontSize: 12, fill: TOK.fg3 }, p.centerLabel || '合计'),
          h('text', { x: SZ / 2, y: SZ / 2 + 16, textAnchor: 'middle', fontSize: 16, fontWeight: 650, fill: TOK.fg },
            p.centerValue !== undefined ? String(p.centerValue) : fmtK(total))
        ),
        h('div', { className: 'qc-legend' }, data.map((d, i) => h('div', { className: 'qc-legend-i', key: i },
          h('span', { className: 'qc-legend-c', style: { background: colors[i % colors.length] } }),
          h('span', { className: 'qc-legend-n', title: d.label }, d.label),
          h('span', { className: 'qc-legend-v' }, d.text !== undefined ? d.text : fmtK(d.value)),
          p.showPct ? h('span', { className: 'qc-legend-v', style: { opacity: .6, minWidth: 42, textAlign: 'right' } }, ((Number(d.value) / total) * 100).toFixed(1) + '%') : null
        )))
      )
    }

    function Bars(p) {
      const data = p.data || []
      if (!data.length) return h('div', { className: 'qc-mut', style: { padding: 18 } }, '无数据')
      const max = Math.max.apply(null, data.map((d) => Number(d.value) || 0)) || 1
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 9 } },
        data.map((d, i) => h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 } },
          h('span', { className: 'qc-legend-n', style: { fontSize: 12, width: p.labelWidth || 92, flex: 'none' }, title: d.label }, d.label),
          h('div', { style: { flex: 1, minWidth: 40 } },
            h('div', { className: 'qc-prog', 'data-t': d.tone || 'mut', style: { height: 8, borderRadius: 4 } },
              h('i', { style: { width: pct(Number(d.value), max) + '%' } }))),
          h('span', { className: 'qc-legend-v', style: { fontSize: 12, minWidth: 68, textAlign: 'right' } }, d.text !== undefined ? d.text : fmtK(d.value))
        )))
    }

    // 迷你趋势条
    function Spark(p) {
      const vals = (p.values || []).map(Number).filter((v) => !isNaN(v))
      if (vals.length < 2) return null
      const W = 68, H = 18, mx = Math.max.apply(null, vals) || 1, mn = Math.min.apply(null, vals)
      const rng = (mx - mn) || 1
      const pts = vals.map((v, i) => [ (i / (vals.length - 1)) * W, H - ((v - mn) / rng) * (H - 3) - 1.5 ])
      const d = pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ')
      return h('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, style: { display: 'block' } },
        h('path', { d: d, fill: 'none', stroke: p.color || TOK.brand, strokeWidth: 1.6, strokeLinejoin: 'round', strokeLinecap: 'round' }))
    }

    // ── 作战台 ──────────────────────────────────────────────────────────────
    function Desk() {
      const st = useStore(store); const s = st.snap
      if (!s) return null
      const o = s.overview || {}
      const lv = s.live && s.live.ok ? s.live.raw : null
      const target = o.target || 2.2
      const roiOk = o.roi !== null && o.roi !== undefined && o.roi >= target
      const roiRatio = o.roi ? (o.roi / target) : 0
      const kinds = s.byKind || []
      const totalCost = kinds.reduce((a, k) => a + (Number(k.cost) || 0), 0) || o.cost || 0

      return h('div', null,
        h('div', { className: 'qc-sec' },
          h('div', { className: 'qc-h' }, '核心指标'),
          h('div', { className: 'qc-kpis' },
            h(Kpi, { label: '全账户消耗', value: fmtMoney(o.cost), sub: s.collectAt ? h('span', null, '采集于 ' + new Date(s.collectAt).toLocaleTimeString('zh-CN', { hour12: false })) : null }),
            h(Kpi, { label: '净成交', value: fmtMoney(o.settle), sub: h('span', null, (o.orders || 0) + ' 单') }),
            h(Kpi, {
              label: '净 ROI', value: fmtNum(o.roi, 3), color: roiOk ? TOK.ok : TOK.err,
              sub: h('span', null, h(Badge, { t: roiOk ? 'ok' : 'err' }, roiOk ? '达标' : '低于目标'), h('span', null, ' 目标 ' + target))
            }),
            h(Kpi, { label: '在跑计划', value: String(o.running === undefined ? '—' : o.running), sub: h('span', null, '共 ' + (o.planCount || 0) + ' 条') })
          )
        ),

        h('div', { className: 'qc-sec' },
          h('div', { className: 'qc-h' }, 'ROI 达成度'),
          h('div', { className: 'qc-card qc-pad' },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 } },
              h('span', { style: { fontSize: 22, fontWeight: 650, color: roiOk ? TOK.ok : TOK.err } }, fmtNum(o.roi, 3)),
              h('span', { className: 'qc-mut' }, '目标 ' + target + ' · 达成 ' + (roiRatio * 100).toFixed(0) + '%')),
            h(Prog, { value: pct(roiRatio * 100, 200), t: roiOk ? 'ok' : (roiRatio >= .6 ? 'warn' : 'err'), title: '达成度（100% = 达标）' }),
            h('div', { className: 'qc-mut', style: { marginTop: 6 } }, roiOk ? '当前 ROI 已高于目标线' : '当前 ROI 低于目标线，关注决策队列中的低效计划'))
        ),

        lv ? h('div', { className: 'qc-sec' },
          h('div', { className: 'qc-h' }, '直播间实时'),
          h('div', { className: 'qc-kpis' },
            h(Kpi, { label: '在线人数', value: fmtInt(lv.online) }),
            h(Kpi, { label: '累计场观', value: fmtInt(lv.watchers) }),
            h(Kpi, { label: '观看→成交率', value: lv.payRate === null ? '—' : String(lv.payRate), unit: lv.payRate === null ? '' : '%' }),
            h(Kpi, { label: 'GPM', value: fmtNum(lv.gpm, 1) }),
            h(Kpi, { label: '直播消耗', value: fmtMoney(lv.cost) }),
            h(Kpi, { label: '直播结算', value: fmtMoney(lv.settle) }),
            h(Kpi, { label: '订单成本', value: fmtMoney(lv.unitCost) }),
            h(Kpi, { label: '成交单数', value: fmtInt(lv.settleCnt) })
          )
        ) : null,

        h('div', { className: 'qc-sec' },
          h('div', { className: 'qc-h' }, '板块拆解'),
          kinds.length ? h('div', { className: 'qc-chartgrid' },
            h('div', { className: 'qc-card qc-pad' },
              h(Donut, {
                data: kinds.map((k) => ({ label: k.label, value: Number(k.cost) || 0, text: fmtMoney(k.cost) })),
                centerLabel: '总消耗', centerValue: fmtMoney(totalCost, 0), showPct: true
              })),
            h('div', { className: 'qc-card qc-pad' },
              h('div', { className: 'qc-mut', style: { marginBottom: 10 } }, '各板块净 ROI 对比（虚线为目标 ' + target + '）'),
              h(Bars, {
                data: kinds.map((k) => ({
                  label: k.label,
                  value: k.roi === null || k.roi === undefined ? 0 : k.roi,
                  text: k.roi === null || k.roi === undefined ? '—' : fmtNum(k.roi, 2),
                  tone: k.roi === null || k.roi === undefined ? 'mut' : (k.roi >= target ? 'ok' : 'warn')
                })),
                labelWidth: 110
              }))
          ) : h('div', { className: 'qc-card qc-pad' }, h('div', { className: 'qc-mut' }, '本轮快照未包含板块数据'))),

        h('div', { className: 'qc-sec' },
          h('div', { className: 'qc-h' }, '板块明细'),
          h('div', { className: 'qc-card' },
            h('table', { className: 'qc-tbl' },
              h('thead', null, h('tr', null,
                h('th', null, '板块'), h('th', { className: 'qc-num' }, '计划'),
                h('th', { className: 'qc-num' }, '消耗'), h('th', { className: 'qc-num' }, '净成交'),
                h('th', { className: 'qc-num' }, '订单'), h('th', { className: 'qc-num' }, '净 ROI'), h('th', null, '状态'))),
              h('tbody', null, kinds.map((k) => h('tr', { key: k.kind },
                h('td', null, h('b', { style: { fontWeight: 550 } }, k.label)),
                h('td', { className: 'qc-num' }, String(k.plans)),
                h('td', { className: 'qc-num' }, fmtMoney(k.cost)),
                h('td', { className: 'qc-num' }, fmtMoney(k.settle)),
                h('td', { className: 'qc-num' }, fmtInt(k.orders)),
                h('td', { className: 'qc-num', style: { fontWeight: 600, color: k.roi >= target ? TOK.ok : TOK.fg } }, fmtNum(k.roi, 3)),
                h('td', null, k.roi === null || k.roi === undefined ? h(Badge, { t: 'mut' }, '无成交')
                  : h(Badge, { t: k.roi >= target ? 'ok' : (k.cost > s.thresholds.minCost ? 'warn' : 'mut') }, k.roi >= target ? '达标' : '未达标'))
              )))
            )
          )
        ),

        s.report ? h('div', { className: 'qc-sec' },
          h('div', { className: 'qc-h' }, '采集报告（原始）'),
          h('details', { className: 'qc-card', style: { padding: '12px 14px' } },
            h('summary', { style: { cursor: 'pointer', fontSize: 12.5, color: TOK.fg2 } }, '展开查看 review_report.md'),
            h('pre', { style: { whiteSpace: 'pre-wrap', fontSize: 11.5, lineHeight: 1.7, marginTop: 10, color: TOK.fg2, maxHeight: 420, overflow: 'auto' } }, s.report.slice(0, 8000)))
        ) : null
      )
    }

    // ── 决策队列 ────────────────────────────────────────────────────────────
    function Queue() {
      const st = useStore(store); const s = st.snap
      if (!s) return null
      const q = s.queue || []
      const T = s.thresholds
      if (q.length === 0) return h('div', null,
        h(Tip, { t: 'ok', title: '当前没有需要动作的计划' },
          '规则：消耗 > ¥' + T.minCost + ' 且 净 ROI < ' + T.roiTarget + '，需连续 ' + T.confirmRounds + ' 轮命中才建议关闭（避免结算时滞造成误杀）。'))
      const tone = (x) => x.severity >= 3 ? 'err' : (x.severity === 2 ? 'warn' : 'biz')
      return h('div', null,
        h(Tip, { t: 'warn', title: '共 ' + q.length + ' 条待处理' }, '按严重程度排序，每条附判定依据。'),
        h('div', { className: 'qc-list', style: { marginTop: 12 } }, q.map((x) => h('div', { className: 'qc-item', key: x.planId + x.action },
          h('div', { className: 'qc-item-h' },
            h(Badge, { t: tone(x) }, x.actionLabel),
            h('span', { className: 'qc-name qc-grow', title: x.planName, style: { fontWeight: 550 } }, x.planName),
            h(Badge, { t: 'mut' }, x.kindLabel),
            h('span', { className: 'qc-mut' }, '消耗 ' + fmtMoney(x.plan.cost)),
            h('span', { className: 'qc-mut' }, '净 ROI ' + fmtNum(x.plan.roi, 3))
          ),
          x.reasons && x.reasons.length ? h('ul', { className: 'qc-reasons' }, x.reasons.map((r, i) => h('li', { key: i }, r))) : null
        )))
      )
    }

    // ── 计划体检 ────────────────────────────────────────────────────────────
    /** 计划体检：按计划类型分页。kind=null 表示全部。 */
    function Plans(props) {
      const st = useStore(store); const s = st.snap
      if (!s) return null
      const kindFilter = (props && props.kind) || null
      const kw = (st.search || '').trim().toLowerCase()
      let list = (s.plans || []).filter((p) => !kindFilter || kindFilter.indexOf(p.kind) >= 0)
      list = list.slice().sort((a, b) => (b.cost || 0) - (a.cost || 0))
      if (kw) list = list.filter((p) => String(p.name).toLowerCase().includes(kw))
      const target = s.thresholds.roiTarget
      const shown = list.slice(0, 300)
      const kindName = kindFilter ? (kindFilter.index >= 0) : false
      const label = props && props.label ? props.label : '计划'
      if (!list.length) {
        const isLive = kindFilter && kindFilter.indexOf('main_live') >= 0
        const isReg = kindFilter && kindFilter.indexOf('regulation') >= 0
        return h(Empty, {
          icon: '📋',
          title: kw ? '没有匹配的' + label : '本账号暂无' + label,
          sub: kw ? '换个关键词试试'
            : isLive ? '主全域（直播）计划当前无数据。凌晨 00:00–05:59 的采集为「仅商品」模式，不采直播计划；白天采集后这里会显示。'
            : isReg ? '本轮快照未包含调控/追投计划。'
            : '检查采集目录配置是否指向了含 qc_data_cycle15_* 的目录'
        })
      }

      // 顶部统计
      const costSum = list.reduce((a, p) => a + (Number(p.cost) || 0), 0)
      const okN = list.filter((p) => p.roi !== null && p.roi >= target).length
      const lowN = list.filter((p) => p.roi !== null && p.roi < target && p.cost > s.thresholds.minCost).length
      const runN = list.filter((p) => p.status === 'running').length

      return h('div', null,
        h('div', { className: 'qc-sec' }, h('div', { className: 'qc-kpis' },
          h(Kpi, { label: '筛选后计划', value: String(list.length), sub: h('span', null, runN + ' 在跑') }),
          h(Kpi, { label: '合计消耗', value: fmtMoney(costSum) }),
          h(Kpi, { label: '达标', value: String(okN), color: TOK.ok, sub: h('span', null, 'ROI ≥ ' + target) }),
          h(Kpi, { label: '低效', value: String(lowN), color: lowN ? TOK.warn : undefined, sub: h('span', null, 'ROI < ' + target + ' 且消耗 > ¥' + s.thresholds.minCost) })
        )),
        h('div', { className: 'qc-card' },
          h('table', { className: 'qc-tbl' },
            h('thead', null, h('tr', null,
              h('th', null, '计划'), h('th', null, '状态'), h('th', null, '类型'),
              h('th', { className: 'qc-num' }, '消耗'), h('th', { className: 'qc-num' }, '订单'),
              h('th', { className: 'qc-num' }, '净 ROI'), h('th', { style: { width: 90 } }, '达成度'),
              h('th', { className: 'qc-num' }, '预算'), h('th', null, '标记'))),
            h('tbody', null, shown.map((p) => {
              const ratio = p.roiGoal ? p.roi / p.roiGoal : (p.roi !== null ? p.roi / target : 0)
              return h('tr', { key: p.kind + p.id },
                h('td', null, h('span', { className: 'qc-name', title: p.name }, p.name)),
                h('td', null, h(Badge, { t: p.status === 'running' ? 'ok' : 'mut' }, p.statusText)),
                h('td', null, h('span', { className: 'qc-mut' }, p.kindLabel)),
                h('td', { className: 'qc-num' }, fmtMoney(p.cost)),
                h('td', { className: 'qc-num' }, String(p.orders || 0)),
                h('td', { className: 'qc-num', style: { fontWeight: 600, color: (p.roi !== null && p.roi >= target) ? TOK.ok : TOK.fg } }, fmtNum(p.roi, 3)),
                h('td', null, p.roi === null ? h('span', { className: 'qc-mut' }, '—')
                  : h(Prog, { value: pct(ratio * 100, 150), t: ratio >= 1 ? 'ok' : (ratio >= .6 ? 'warn' : 'err'), title: '相对目标达成' })),
                h('td', { className: 'qc-num' }, p.budget ? fmtMoney(p.budget) : h('span', { className: 'qc-mut' }, '—')),
                h('td', null, h('span', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
                  p.roiGoal ? h(Badge, { t: 'mut' }, '目标 ' + fmtNum(p.roiGoal, 2)) : null,
                  p.compensate ? h(Badge, { t: 'biz' }, '保障期') : null))
              )
            }))
          )
        ),
        list.length > 300 ? h('div', { className: 'qc-mut', style: { marginTop: 10, textAlign: 'center' } }, '仅显示前 300 条，共 ' + list.length + ' 条') : null
      )
    }

    // ══ 上下级联动：计划树（基础计划 → 追投 / 起量 / 调控）══════════════
    // 关联依据：子级行的 primaryAID 指向基础计划 id（实测字段）。
    const KIND_TONE = { '基础': 'biz', '追投': 'ok', '起量': 'warn', '调控': 'mut' }

    function PlanRow(props) {
      const st = useStore(store)
      const n = props.n
      const isKid = !!props.isKid
      const busy = st.opBusy && (st.opBusy.endsWith(n.id) || st.opBusy.indexOf(n.id) >= 0)
      const open = !!st.expanded[n.id]
      const stTone = n.status === '投放中' ? 'ok' : (n.deleted || n.status === '已删除') ? 'mut' : 'warn'
      const live = !isKid && n.childCount > 0
      return h('tr', { className: isKid ? 'qc-kidrow' : undefined, style: isKid ? { background: TOK.layer1 } : undefined },
        h('td', null,
          isKid ? h('span', { className: 'qc-mut', style: { marginLeft: 18 } }, '└ ')
            : (live ? h('button', { className: 'qc-treebtn', onClick: () => bus.toggle(n.id), title: open ? '收起' : '展开下级' }, open ? '▾' : '▸') : h('span', { style: { display: 'inline-block', width: 16 } })),
          h('span', { className: 'qc-name', title: n.id + '  ' + n.name }, n.name),
          isKid ? h('span', { className: 'qc-mut', style: { marginLeft: 8, fontSize: 11 } }, n.primaryName || '') : null),
        h('td', null, h(Badge, { t: KIND_TONE[n.kind] || 'mut' }, n.kind)),
        h('td', null, h(Badge, { t: stTone }, n.status || '—')),
        h('td', { className: 'qc-num' }, fmtMoney(n.cost)),
        isKid ? null : h('td', { className: 'qc-num', style: { color: n.childCost > 0 ? TOK.warn : undefined } }, n.childCost ? fmtMoney(n.childCost) : h('span', { className: 'qc-mut' }, '—')),
        isKid ? null : h('td', { className: 'qc-num', style: { fontWeight: 600 } }, fmtMoney(n.totalCost)),
        h('td', { className: 'qc-num' }, String(n.orders || 0)),
        h('td', { className: 'qc-num', style: { fontWeight: 600, color: (n.netRoi != null && n.netRoi >= 2.2) ? TOK.ok : TOK.fg } }, fmtNum(n.netRoi, 3)),
        h('td', { className: 'qc-num' }, n.budgetYuan ? fmtMoney(n.budgetYuan, 0) : h('span', { className: 'qc-mut' }, '—')),
        h('td', null, h('span', { style: { display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' } },
          // ── 操作区 ──
          isKid
            ? h('button', { className: 'qc-mini', disabled: busy, onClick: () => bus.op([n.id], n.status === '投放中' ? 2 : 1, n.name), title: n.status === '投放中' ? '暂停' : '启动' },
                busy ? '…' : (n.status === '投放中' ? '暂停' : '启动'))
            : h('button', { className: 'qc-mini', disabled: busy, onClick: () => bus.op([n.id], n.status === '投放中' ? 2 : 1, n.name), title: n.status === '投放中' ? '暂停基础计划' : '启动基础计划' },
                busy ? '…' : (n.status === '投放中' ? '暂停' : '启动')),
          !isKid && n.childCount > 0 ? h('button', { className: 'qc-mini', style: { color: TOK.warn }, disabled: busy,
            onClick: () => { const ids = n.children.filter((k) => k.status === '投放中').map((k) => k.id); if (!ids.length) return bus.toast('该基础计划下的子计划没有「投放中」的', 'warn'); bus.op(ids, 2, n.name + ' 的 ' + ids.length + ' 条子计划') },
            title: '暂停全部子计划' }, '停子级') : null,
          h('button', { className: 'qc-mini', disabled: busy, onClick: () => { const v = window.prompt('把「' + n.name + '」的日预算改为（元）：', n.budgetYuan || 100); if (v) bus.budget(n.id, v, n.name) }, title: '改预算' }, '预算'),
          h('button', { className: 'qc-mini', disabled: busy, onClick: () => { const v = window.prompt('把「' + n.name + '」的净成交 ROI 目标改为：', n.roiGoal || 2.2); if (v) bus.roi(n.id, v, n.name) }, title: '改 ROI 目标' }, 'ROI'),
          h('button', { className: 'qc-mini', disabled: busy, onClick: () => bus.mats(n.id), title: '查看素材' }, '素材'),
          h('button', { className: 'qc-mini', style: { color: TOK.err }, disabled: busy, onClick: () => bus.op([n.id], 3, n.name), title: '删除计划' }, '删'),
          n.deleted ? h(Badge, { t: 'mut' }, '已删除') : null
        ))
      )
    }

    /** 计划树主视图（三个页签共用，按 side 区分） */
    function PlanTree(props) {
      const st = useStore(store); const side = (props && props.side) || 'product'
      const t = st.tree && st.tree.side === side ? st.tree : null
      React.useEffect(() => { if (!st.tree || st.tree.side !== side) bus.tree(side, false) }, [side])
      const kw = (st.search || '').trim().toLowerCase()
      if (!t || (st.treeStatus === 'loading' && !t)) return h('div', { className: 'qc-body' }, h('div', { className: 'qc-kpis' }, [0, 1, 2, 3].map((i) => h('div', { className: 'qc-kpi', key: i }, h(Skel, { style: { height: 11, width: '55%' } }), h(Skel, { style: { height: 22, width: '75%', marginTop: 6 } })))))
      if (!t.ok) return h('div', { className: 'qc-body' }, h(Empty, { icon: '⚠️', title: '无法加载计划树', sub: String(t.error || '未知错误') }))
      let nodes = t.nodes || []
      if (kw) nodes = nodes.filter((n) => String(n.name).toLowerCase().includes(kw) || String(n.id).includes(kw) || (n.children || []).some((k) => String(k.name).toLowerCase().includes(kw)))
      const G = t.groups || {}
      const totalCost = nodes.reduce((a, n) => a + (n.totalCost || 0), 0)
      const allIds = nodes.map((n) => n.id)
      const anyOpen = allIds.some((i) => st.expanded[i])
      return h('div', { className: 'qc-body' },
        h('div', { className: 'qc-sec' }, h('div', { className: 'qc-kpis' },
          h(Kpi, { label: '基础计划', value: String(nodes.length), sub: h('span', null, '共 ' + (t.total || 0) + ' 条记录') }),
          h(Kpi, { label: '起量计划', value: String(G['起量'] || 0) }),
          h(Kpi, { label: '追投计划', value: String(G['追投'] || 0) }),
          h(Kpi, { label: '合计消耗', value: fmtMoney(totalCost), sub: h('span', null, '基础 + 子级') })
        )),
        h('div', { className: 'qc-bar' },
          h('button', { className: 'qc-btn', onClick: () => bus.expandAll(allIds, !anyOpen) }, anyOpen ? '全部收起' : '全部展开'),
          h('button', { className: 'qc-btn', onClick: () => bus.tree(side, true) }, '刷新'),
          h('button', { className: 'qc-btn', onClick: () => bus.collect() }, '跑一轮采集'),
          h('span', { className: 'qc-mut', style: { marginLeft: 'auto', alignSelf: 'center', fontSize: 12 } },
            t.ageMin != null ? '采集于 ' + t.ageMin + ' 分钟前' : ''),
          h('span', { className: 'qc-mut', style: { alignSelf: 'center', fontSize: 12 } }, t.orphanCount ? ' · 孤立子级 ' + t.orphanCount : '')
        ),
        h('div', { className: 'qc-card' },
          h('table', { className: 'qc-tbl' },
            h('thead', null, h('tr', null,
              h('th', { style: { minWidth: 240 } }, '计划 / 下级'),
              h('th', null, '层级'), h('th', null, '状态'),
              h('th', { className: 'qc-num' }, '自身消耗'),
              h('th', { className: 'qc-num' }, '子级消耗'),
              h('th', { className: 'qc-num' }, '合计'),
              h('th', { className: 'qc-num' }, '订单'),
              h('th', { className: 'qc-num' }, '净ROI'),
              h('th', { className: 'qc-num' }, '预算'),
              h('th', { style: { minWidth: 260 } }, '调整'))
            ),
            h('tbody', null, (() => {
              const rows = []
              for (const n of nodes.slice(0, 200)) {
                rows.push(h(PlanRow, { key: n.id, n }))
                if (st.expanded[n.id] && n.children) for (const k of n.children) rows.push(h(PlanRow, { key: n.id + ':' + k.id, n: k, isKid: true }))
              }
              return rows
            })())
          ),
          nodes.length > 200 ? h('div', { className: 'qc-mut', style: { marginTop: 10, textAlign: 'center' } }, '仅显示前 200 个基础计划') : null
        ),
        // ── 素材下钻抽屉（内联，不用 fixed 覆盖层）──
        st.matFor ? h(MaterialPanel, { adId: st.matFor }) : null
      )
    }

    // ══ 素材下钻面板（某计划的素材清单 + 消耗）══════════════════════════
    function MaterialPanel(props) {
      const st = useStore(store)
      const m = st.mats
      const rows = (m && m.rows) || []
      const loading = st.matStatus === 'loading'
      return h('div', { className: 'qc-card', style: { marginTop: 14, borderColor: TOK.bd2 } },
        h('div', { className: 'qc-cardhd' },
          h('span', null, '素材明细 · 计划 ' + props.adId),
          h('button', { className: 'qc-mini', style: { marginLeft: 'auto' }, onClick: () => bus.closeMats() }, '关闭')
        ),
        loading ? h('div', { className: 'qc-mut', style: { padding: 16 } }, '加载中…')
          : (!m || !m.ok) ? h('div', { className: 'qc-mut', style: { padding: 16 } }, '加载失败：' + ((m && (m.error || m.msg)) || '未知'))
          : !rows.length ? h(Empty, { icon: '🎬', title: '该计划名下暂无消耗素材', sub: '素材需要窗口内产生消耗才会出现在列表里' })
          : h('table', { className: 'qc-tbl' },
              h('thead', null, h('tr', null, h('th', null, '素材 ID'), h('th', { className: 'qc-num' }, '窗口内消耗'), h('th', null, '归属'))),
              h('tbody', null, rows.slice(0, 100).map((r, i) => {
                const mid = (r.dimensions && r.dimensions.materialId && (r.dimensions.materialId.value || r.dimensions.materialId.valueStr)) || '—'
                const cost = r.metrics && (r.metrics.statCostForRoi2 || {}).value
                return h('tr', { key: String(mid) + i },
                  h('td', null, h('span', { className: 'qc-name' }, String(mid))),
                  h('td', { className: 'qc-num' }, fmtMoney(cost)),
                  h('td', null, h('span', { className: 'qc-mut' }, '该计划')))
              }))
            ),
        m && m.ok ? h('div', { className: 'qc-mut', style: { padding: '8px 12px', fontSize: 12 } }, '共 ' + m.count + ' 条素材（显示前 100）') : null
      )
    }

    // ── 计划分页：直播间 / 商品 / 品牌竞价 ─────────────────────────────────
    // 归类依据（实测 255 个采集批次）：
    //   main_live / regulation → 直播侧（主全域 + 素材追投/一键起量等调控）
    //   product                → 商品侧
    //   brand_live_heat / brand_crowd_seed → 品牌竞价侧
    function PlansLive() { return h(PlanTree, { side: 'live' }) }
    function PlansProduct() { return h(PlanTree, { side: 'product' }) }
    function PlansBrand() { return h(PlanTree, { side: 'brand' }) }

    // ── 直播间 ──────────────────────────────────────────────────────────────
    function Live() {
      const st = useStore(store); const s = st.snap
      if (!s) return null
      const l = s.live
      if (!l || !l.ok) return h(Empty, {
        icon: '📡', title: '直播大屏不可用',
        sub: ((l && l.error) || '未知原因') + ' —— 直播数据需要该账号配置 roomId / anchorId，且需在直播时段。',
        action: h('button', { className: 'qc-btn', style: { marginTop: 6 }, onClick: () => bus.setTab('settings') }, '去设置')
      })
      const r = l.raw
      const rateOk = r.payRate !== null && r.payRate >= 2
      return h('div', null,
        h('div', { className: 'qc-sec' },
          h('div', { className: 'qc-kpis' },
            h(Kpi, { label: '在线人数', value: fmtInt(r.online) }),
            h(Kpi, { label: '累计场观', value: fmtInt(r.watchers) }),
            h(Kpi, { label: '观看→成交率', value: r.payRate === null ? '—' : String(r.payRate), unit: r.payRate === null ? '' : '%', color: rateOk ? TOK.ok : undefined }),
            h(Kpi, { label: '曝光→观看率', value: r.showToWatch === null ? '—' : String(r.showToWatch), unit: r.showToWatch === null ? '' : '%' }),
            h(Kpi, { label: 'GPM', value: fmtNum(r.gpm, 1) }),
            h(Kpi, { label: '直播消耗', value: fmtMoney(r.cost) }),
            h(Kpi, { label: '直播结算', value: fmtMoney(r.settle) }),
            h(Kpi, { label: '成交单数', value: fmtInt(r.settleCnt) }),
            h(Kpi, { label: '订单成本', value: fmtMoney(r.unitCost) })
          )),
        h('div', { className: 'qc-sec' },
          h('div', { className: 'qc-h' }, '效率对比'),
          h('div', { className: 'qc-chartgrid' },
            h('div', { className: 'qc-card qc-pad' },
              h('div', { className: 'qc-mut', style: { marginBottom: 10 } }, '消耗 vs 结算'),
              h(Bars, { data: [
                { label: '直播消耗', value: Number(r.cost) || 0, text: fmtMoney(r.cost), tone: 'warn' },
                { label: '直播结算', value: Number(r.settle) || 0, text: fmtMoney(r.settle), tone: 'ok' }
              ], labelWidth: 78 })),
            h('div', { className: 'qc-card qc-pad' },
              h('div', { className: 'qc-mut', style: { marginBottom: 10 } }, '转化漏斗'),
              h(Bars, { data: [
                { label: '场观', value: Number(r.watchers) || 0, text: fmtInt(r.watchers) },
                { label: '成交单', value: Number(r.settleCnt) || 0, text: fmtInt(r.settleCnt), tone: 'ok' }
              ], labelWidth: 78 }))
          )),
        h(Tip, { t: 'info', title: '数据来源' }, '来自直播大屏实时接口，点右上角「强制刷新」可重新拉取。')
      )
    }

    // ── 素材 ────────────────────────────────────────────────────────────────
    function Materials() {
      const st = useStore(store); const s = st.snap
      if (!s) return null
      const mats = s.materials || []
      if (mats.length === 0) return h(Empty, {
        icon: '🎬', title: '本轮快照未包含素材级明细',
        sub: '采集快照只记录了素材的汇总数量，没有逐条素材的消耗/ROI。要看到素材排行，需要在采集链路里补上平台素材清单接口，或在此接入素材级查询。'
      })
      return h('div', { className: 'qc-card' },
        h('table', { className: 'qc-tbl' },
          h('thead', null, h('tr', null,
            h('th', null, '素材'), h('th', { className: 'qc-num' }, '关联计划'),
            h('th', { className: 'qc-num' }, '消耗'), h('th', { className: 'qc-num' }, '净 ROI'))),
          h('tbody', null, mats.map((m, i) => h('tr', { key: (m.materialId || '') + i },
            h('td', null, h('span', { className: 'qc-name' }, m.label || m.materialId)),
            h('td', { className: 'qc-num' }, String(m.planCount || 0)),
            h('td', { className: 'qc-num' }, fmtMoney(m.cost)),
            h('td', { className: 'qc-num', style: { fontWeight: 600 } }, fmtNum(m.roi, 3))
          )))
        ))
    }

    // ── 异常雷达 ────────────────────────────────────────────────────────────
    function Alerts() {
      const st = useStore(store); const s = st.snap
      if (!s) return null
      const a = s.alerts || []
      if (a.length === 0) return h(Tip, { t: 'ok', title: '当前无异常' }, '所有监控项均在阈值内。')
      const cnt = { high: 0, warn: 0, info: 0 }
      a.forEach((x) => { cnt[x.level] = (cnt[x.level] || 0) + 1 })
      const toneOf = (lv) => lv === 'high' ? 'err' : lv === 'warn' ? 'warn' : 'biz'
      const labelOf = (lv) => lv === 'high' ? '严重' : lv === 'warn' ? '注意' : '提示'
      const shown = a.slice(0, 200)
      return h('div', null,
        h('div', { className: 'qc-sec' }, h('div', { className: 'qc-kpis' },
          h(Kpi, { label: '严重', value: String(cnt.high || 0), color: cnt.high ? TOK.err : undefined }),
          h(Kpi, { label: '注意', value: String(cnt.warn || 0), color: cnt.warn ? TOK.warn : undefined }),
          h(Kpi, { label: '提示', value: String(cnt.info || 0) }),
          h(Kpi, { label: '合计', value: String(a.length) })
        )),
        h('div', { className: 'qc-card' },
          h('table', { className: 'qc-tbl' },
            h('thead', null, h('tr', null, h('th', { style: { width: 64 } }, '级别'), h('th', null, '内容'), h('th', null, '说明'))),
            h('tbody', null, shown.map((x, i) => h('tr', { key: i },
              h('td', null, h(Badge, { t: toneOf(x.level) }, labelOf(x.level))),
              h('td', null, h('span', { style: { fontWeight: 500 } }, x.title)),
              h('td', null, h('span', { className: 'qc-mut' }, x.detail || ''))
            )))
          )),
        a.length > 200 ? h('div', { className: 'qc-mut', style: { marginTop: 10, textAlign: 'center' } }, '仅显示前 200 条，共 ' + a.length + ' 条') : null
      )
    }

    // ── AI 建议 ─────────────────────────────────────────────────────────────
    function Advice() {
      const st = useStore(store); const ad = st.advice
      if (!ad) return h(Empty, {
        icon: '🤖', title: '还没有生成建议',
        sub: '点击右上角「AI 建议」按钮，按当前阈值对每条计划给出操作建议与理由。',
        action: h('button', { className: 'qc-btn', 'data-p': '1', style: { marginTop: 6 }, onClick: () => bus.advice() }, '立即生成')
      })
      const items = ad.items || []
      const toneMap = { close: 'err', watch: 'warn', duplicate: 'ok', keep: 'mut', 'add-budget': 'warn', reduce: 'warn' }
      const shown = items.filter((x) => x.verdict !== 'keep')
      const need = shown.length
      const byVerdict = {}
      items.forEach((x) => { byVerdict[x.verdictLabel || x.verdict] = (byVerdict[x.verdictLabel || x.verdict] || 0) + 1 })
      const list = (need ? shown : items).slice(0, 200)
      return h('div', null,
        h('div', { className: 'qc-sec' }, h('div', { className: 'qc-kpis' },
          h(Kpi, { label: '分析计划', value: String(items.length) }),
          h(Kpi, { label: '需动作', value: String(need), color: need ? TOK.warn : TOK.ok }),
          h(Kpi, { label: '目标 ROI', value: String(ad.target) }),
          h(Kpi, { label: '生成时间', value: ad.generatedAt ? new Date(ad.generatedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '—' })
        )),
        Object.keys(byVerdict).length ? h('div', { className: 'qc-sec' },
          h('div', { className: 'qc-card qc-pad' },
            h('div', { className: 'qc-mut', style: { marginBottom: 10 } }, '建议分布'),
            h(Bars, {
              data: Object.keys(byVerdict).map((k) => ({ label: k, value: byVerdict[k], text: byVerdict[k] + ' 条' })),
              labelWidth: 92
            }))) : null,
        h('div', { className: 'qc-list' }, list.map((x, i) => h('div', { className: 'qc-item', key: x.planId + i },
          h('div', { className: 'qc-item-h' },
            h(Badge, { t: toneMap[x.verdict] || 'mut' }, x.verdictLabel),
            h('span', { className: 'qc-name qc-grow', title: x.planName, style: { fontWeight: 550 } }, x.planName),
            h(Badge, { t: 'mut' }, x.kindLabel),
            h('span', { className: 'qc-mut' }, '把握 ' + x.confidence),
            h('span', { className: 'qc-mut' }, '消耗 ' + fmtMoney(x.metrics.cost) + ' · ROI ' + fmtNum(x.metrics.roi, 3))
          ),
          x.reasons && x.reasons.length ? h('ul', { className: 'qc-reasons' }, x.reasons.map((r, j) => h('li', { key: j }, r))) : null
        ))),
        !need ? h('div', { style: { marginTop: 12 } }, h(Tip, { t: 'ok', title: '所有计划均在目标线上' }, '当前没有需要调整的计划。')) : null
      )
    }

    // ── 设置 ────────────────────────────────────────────────────────────────
    function Settings() {
      const st = useStore(store)
      const snap = st.snap
      const errs = (snap && Array.isArray(snap.errors)) ? snap.errors : []
      const noData = errs.length > 0 && !((snap && snap.plans) || []).length
      const cfg = st.config || { accounts: [] }
      const [draft, setDraft] = React.useState(null)
      const [saved, setSaved] = React.useState(false)
      const list = cfg.accounts || []
      React.useEffect(() => {
        if (draft === null && list.length) {
          const m = {}
          list.forEach((a) => { m[a.key] = Object.assign({}, a) })
          setDraft(m)
        }
      }, [cfg.accounts.length])

      if (!draft) return h('div', { className: 'qc-card qc-pad' }, h(Skel, { style: { height: 60 } }))

      const upd = (key, field, val) => setDraft(Object.assign({}, draft, { [key]: Object.assign({}, draft[key], { [field]: val }) }))
      const save = async () => {
        const r = await bus.saveConfig(draft)
        if (r && r.ok) { setSaved(true); await bus.load(true); setTimeout(() => setSaved(false), 2500) }
      }
      const addAcc = () => {
        const key = window.prompt('账号标识（英文，如 hongwei）', '')
        if (!key || !key.trim()) return
        const k = key.trim()
        setDraft(Object.assign({}, draft, { [k]: { key: k, label: k, aavid: '', port: '9222', roomId: '', anchorId: '', dataRoot: '' } }))
      }
      const Fld = (p) => h('label', { className: 'qc-fld' },
        h('span', null, p.label),
        h('input', { className: 'qc-inp', value: p.value === undefined || p.value === null ? '' : String(p.value), placeholder: p.ph || '', onChange: (e) => p.onChange(e.target.value) }))

      const accountKeys = Object.keys(draft)
      return h('div', null,
        noData ? h('div', { style: { marginBottom: 14 } }, h(Tip, { t: 'err', title: '⚠ 当前没有数据' },
          String((errs[0] && errs[0].msg) || '配置不完整'))) : null,

        h('div', { className: 'qc-sec' },
          h('div', { className: 'qc-h' }, '怎么填'),
          h('div', { className: 'qc-card qc-pad' },
            h('div', { className: 'qc-sub' },
              h('div', null, '插件不预置任何账号数据。请填写你自己的千川账号：'),
              h('div', { style: { marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 6 } },
                h('div', null, h(Badge, { t: 'biz' }, 'aavid'), ' 千川账户 ID —— 浏览器地址栏 aavid= 后面那串'),
                h('div', null, h(Badge, { t: 'biz' }, 'CDP 端口'), ' 浏览器分身调试端口，默认 9222'),
                h('div', null, h(Badge, { t: 'warn' }, '采集目录'), ' 采集脚本输出目录，需含 qc_data_cycle15_* 子目录'),
                h('div', null, h(Badge, { t: 'mut' }, 'roomId/anchorId'), ' 直播大屏需要，可留空')
              )
            ))
        ),

        accountKeys.map((key) => {
          const a = draft[key]
          return h('div', { className: 'qc-card', key, style: { marginBottom: 12 } },
            h('div', { className: 'qc-pad' },
              h('div', { className: 'qc-item-h', style: { marginBottom: 12 } },
                h('span', { style: { fontSize: 14, fontWeight: 620 } }, a.label || key),
                h(Badge, { t: 'mut' }, 'key = ' + key),
                a.aavid ? h(Badge, { t: 'ok' }, '已配置') : h(Badge, { t: 'warn' }, '未配置'),
                h('span', { className: 'qc-grow' }),
                accountKeys.length > 1 ? h('button', {
                  className: 'qc-btn', onClick: () => { if (!window.confirm('移除账号 ' + key + '？')) return; const d = Object.assign({}, draft); delete d[key]; setDraft(d) }
                }, '移除') : null),
              h('div', { className: 'qc-form' },
                h(Fld, { label: '显示名', value: a.label, ph: '红卫', onChange: (v) => upd(key, 'label', v) }),
                h(Fld, { label: 'aavid（账户 ID）', value: a.aavid, ph: '1855810750424170', onChange: (v) => upd(key, 'aavid', v) }),
                h(Fld, { label: 'CDP 端口', value: a.port, ph: '9222', onChange: (v) => upd(key, 'port', v) }),
                h(Fld, { label: '采集产物目录', value: a.dataRoot, ph: 'D:\\千川项目', onChange: (v) => upd(key, 'dataRoot', v) }),
                h(Fld, { label: 'roomId（可留空）', value: a.roomId, ph: '', onChange: (v) => upd(key, 'roomId', v) }),
                h(Fld, { label: 'anchorId（可留空）', value: a.anchorId, ph: '', onChange: (v) => upd(key, 'anchorId', v) })
              )
            ))
        }),

        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
          h('button', { className: 'qc-btn', onClick: addAcc }, '＋ 添加账号'),
          h('button', { className: 'qc-btn', 'data-p': '1', onClick: save }, '保存并刷新'),
          h('button', { className: 'qc-btn', onClick: () => bus.load(true) }, '仅刷新'),
          saved ? h(Badge, { t: 'ok' }, '✓ 已保存') : null),

        st.error ? h('div', { style: { marginTop: 12 } }, h(Tip, { t: 'err' }, st.error)) : null,

        h('div', { className: 'qc-sec', style: { marginTop: 18 } },
          h('div', { className: 'qc-h' }, '阈值'),
          h('div', { className: 'qc-card qc-pad' },
            h('div', { className: 'qc-sub' }, '净 ROI 目标 ' + (snap && snap.thresholds ? snap.thresholds.roiTarget : 2.2) +
              ' · 最小消耗 ¥' + (snap && snap.thresholds ? snap.thresholds.minCost : 30) +
              ' · 连续确认 ' + (snap && snap.thresholds ? snap.thresholds.confirmRounds : 2) + ' 轮')))
      )
    }

    // ── 主面板 ──────────────────────────────────────────────────────────────
    function QianchuanWorkbench(props) {
      const st = useStore(store)
      const s = st.snap
      const TABS = [
        ['desk', zh.tabDesk, null],
        ['queue', zh.tabQueue, s && s.queue && s.queue.length ? { n: s.queue.length, tone: 'err' } : null],
        ['plans-live', '直播间计划', (s && s.plans ? s.plans.filter((p) => p.kind === 'main_live' || p.kind === 'regulation').length : 0) || null],
        ['plans-product', '商品计划', (s && s.plans ? s.plans.filter((p) => p.kind === 'product').length : 0) || null],
        ['plans-brand', '品牌竞价', (s && s.plans ? s.plans.filter((p) => p.kind === 'brand_live_heat' || p.kind === 'brand_crowd_seed').length : 0) || null],
        ['live', zh.tabLive, null],
        ['mats', zh.tabMats, null],
        ['alerts', zh.tabAlerts, s && s.alerts && s.alerts.length ? { n: s.alerts.length, tone: 'warn' } : null],
        ['ai', zh.tabAI, st.advice && st.advice.items ? { n: st.advice.items.filter((x) => x.verdict !== 'keep').length, tone: 'warn' } : null],
        ['settings', zh.tabSettings, null]
      ]

      let bodyEl = null
      if (st.status === 'loading' && !s) {
        bodyEl = h('div', { className: 'qc-body' },
          h('div', { className: 'qc-kpis' }, [0, 1, 2, 3].map((i) => h('div', { className: 'qc-kpi', key: i },
            h(Skel, { style: { height: 11, width: '55%' } }),
            h(Skel, { style: { height: 22, width: '75%', marginTop: 6 } }),
            h(Skel, { style: { height: 10, width: '40%', marginTop: 6 } })))))
      } else if (st.error && !s) {
        bodyEl = h('div', { className: 'qc-body' },
          h(Tip, { t: 'err', title: zh.failed },
            st.error,
            h('div', { style: { marginTop: 10 } }, h('button', { className: 'qc-btn', onClick: () => bus.load(false) }, zh.retry))))
      } else if (!s) {
        bodyEl = h('div', { className: 'qc-body' }, h(Empty, {
          icon: '📊', title: zh.empty, sub: '点下方按钮拉取一次数据。若持续为空，请到「设置」检查账号与采集目录。',
          action: h('button', { className: 'qc-btn', 'data-p': '1', style: { marginTop: 6 }, onClick: () => bus.load(true) }, zh.refresh)
        }))
      } else {
        const map = { desk: Desk, queue: Queue, plans: Plans, 'plans-live': PlansLive, 'plans-product': PlansProduct, 'plans-brand': PlansBrand, live: Live, mats: Materials, alerts: Alerts, ai: Advice, settings: Settings }
        const V = map[st.tab] || Desk
        // 数据为空时，除设置页外统一给出引导
        const noData = Array.isArray(s.errors) && s.errors.length > 0 && !(s.plans || []).length
        if (noData && st.tab !== 'settings') {
          bodyEl = h('div', { className: 'qc-body' }, h(Empty, {
            icon: '⚙️', title: '还没有数据', sub: String((s.errors[0] && s.errors[0].msg) || '配置不完整'),
            action: h('button', { className: 'qc-btn', 'data-p': '1', style: { marginTop: 6 }, onClick: () => bus.setTab('settings') }, '去设置')
          }))
        } else {
          bodyEl = h('div', { className: 'qc-body' }, h(V))
        }
      }

      const credOk = s && s.credential && s.credential.ok
      return h('div', { className: 'qc', 'data-qcw': '1' },
        h('div', { className: 'qc-top' },
          h('div', { className: 'qc-title' },
            h('h1', null, '📊 千川投流工作台'),
            s ? h('span', { className: 'qc-meta' }, s.account.label) : null),
          h('span', { style: { flex: 1 } }),
          s ? h('span', { className: 'qc-meta' },
            h('span', { className: 'qc-dot', style: { background: credOk ? TOK.ok : TOK.err } }),
            credOk ? '凭证正常' : '凭证异常',
            ' · ',
            s.ageMin === null || s.ageMin === undefined ? '无快照' : (s.ageMin + ' 分钟前采集')) : null
        ),
        h('div', { className: 'qc-tabs' }, TABS.map(([id, label, n]) => h('button', {
          key: id, type: 'button', className: 'qc-tab', 'data-on': st.tab === id ? '1' : '0',
          onClick: () => bus.setTab(id)
        }, label, (n && (typeof n === 'number' ? n > 0 : true)) ? h('span', { className: 'qc-tabn', 'data-tone': (n && n.tone) || undefined }, String(typeof n === 'number' ? n : n.n)) : null))),
        h('div', { className: 'qc-bar' },
          (st.tab === 'plans' || st.tab === 'plans-live' || st.tab === 'plans-product' || st.tab === 'plans-brand') ? h('input', {
            className: 'qc-inp', style: { maxWidth: 260 }, placeholder: zh.search,
            value: st.search || '', onChange: (e) => bus.search(e.target.value)
          }) : null,
          h('span', { style: { flex: 1 } }),
          st.tab === 'ai' ? h('button', { className: 'qc-btn', onClick: () => bus.advice() }, '生成建议') : null,
          h('button', { className: 'qc-btn', 'data-p': '1', disabled: st.status === 'loading', onClick: () => bus.load(true) },
            st.status === 'loading' ? zh.loading : zh.force)
        ),
        bodyEl
      )
    }

    // ★ 只 inject 宿主 baseline 服务。框架的 workbenchConsole 是跨插件可选依赖，
    //   绝不能写进 inject —— cordis 里 inject 是激活门槛，服务未就绪时 entry 会卡在
    //   pending (waiting for service: workbenchConsole)，导致
    //   'web boot: 1 entry did not activate' 直接中止整个界面启动（2026-10-11 崩溃同因）。
    const inject = ['slots', 'locale', 'layout']

    function apply(ctx) {
      installStyles()
      // 只注册一次：同一命名空间重复 register 会抛
      // 'locale namespace "..." already has locale "..."' 并让插件卡在 loading。
      ctx.effect(() => ctx.locale.register(NS, { zh, en: zh }), 'dsh-qianchuan-workbench: dict')

      async function rpc(method, args) {
        const res = await fetch(RPC + '/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) })
        const raw = await res.text()
        let json = null
        try { json = raw ? JSON.parse(raw) : null } catch (e) { json = null }
        if (!res.ok) throw new Error((json && json.error) || ('HTTP ' + res.status))
        if (json && json.ok === false) throw new Error(json.error || 'unknown')
        return json
      }

      async function load(force) {
        store.set(Object.assign({}, store.getSnapshot(), { status: 'loading', error: null }))
        try {
          const cfg = await rpc('getConfig', {})
          const account = (cfg && cfg.activeAccount) || store.getSnapshot().account
          store.set(Object.assign({}, store.getSnapshot(), { config: cfg, account }))
          const snap = await rpc('snapshot', { account, force: !!force })
          store.set(Object.assign({}, store.getSnapshot(), { status: 'idle', snap }))
        } catch (e) {
          store.set(Object.assign({}, store.getSnapshot(), { status: 'idle', error: String(e && e.message || e) }))
        }
      }
      async function saveConfig(accounts) {
        try {
          const r = await rpc('setConfig', { accounts })
          store.set(Object.assign({}, store.getSnapshot(), { config: r }))
          return { ok: true }
        } catch (e) {
          store.set(Object.assign({}, store.getSnapshot(), { error: String(e && e.message || e) }))
          return { ok: false, error: String(e && e.message || e) }
        }
      }
      async function genAdvice() {
        try {
          const ad = await rpc('advice', { account: store.getSnapshot().account })
          store.set(Object.assign({}, store.getSnapshot(), { advice: ad, tab: 'ai' }))
        } catch (e) { store.set(Object.assign({}, store.getSnapshot(), { error: String(e && e.message || e) })) }
      }

      bus.load = load
      bus.advice = genAdvice
      bus.setTab = (t) => store.set(Object.assign({}, store.getSnapshot(), { tab: t }))
      bus.search = (v) => store.set(Object.assign({}, store.getSnapshot(), { search: v }))
      bus.refresh = () => load(true)
      bus.saveConfig = saveConfig

      // ── 上下级联动：拉取计划树（基础 → 追投/起量/调控）─────────────────
      const loadTree = async (side, force) => {
        const cur = store.getSnapshot()
        store.set(Object.assign({}, cur, { treeStatus: 'loading', treeSide: side || cur.treeSide }))
        try {
          const r = await rpc('planTree', { account: store.getSnapshot().account, side: side || store.getSnapshot().treeSide, search: store.getSnapshot().search })
          store.set(Object.assign({}, store.getSnapshot(), { tree: r, treeStatus: r && r.ok ? 'ok' : 'err', error: r && r.ok ? null : (r && r.error) || null }))
          return r
        } catch (e) { store.set(Object.assign({}, store.getSnapshot(), { treeStatus: 'err', error: String(e && e.message || e) })); return null }
      }
      bus.tree = loadTree
      bus.setTreeSide = (side) => loadTree(side, true)

      // 展开/折叠
      bus.toggle = (id) => {
        const cur = store.getSnapshot(); const ex = Object.assign({}, cur.expanded)
        if (ex[id]) delete ex[id]; else ex[id] = 1
        store.set(Object.assign({}, cur, { expanded: ex }))
      }
      bus.expandAll = (ids, on) => {
        const cur = store.getSnapshot(); const ex = Object.assign({}, cur.expanded)
        ;(ids || []).forEach((i) => { if (on) ex[i] = 1; else delete ex[i] })
        store.set(Object.assign({}, cur, { expanded: ex }))
      }

      // ── 素材下钻 ─────────────────────────────────────────────────────
      bus.mats = async (adId, force) => {
        store.set(Object.assign({}, store.getSnapshot(), { matFor: adId, matStatus: 'loading', mats: null }))
        try {
          const r = await rpc('materials', { account: store.getSnapshot().account, adId, force: !!force })
          store.set(Object.assign({}, store.getSnapshot(), { mats: r, matStatus: r && r.ok ? 'ok' : 'err' }))
          return r
        } catch (e) { store.set(Object.assign({}, store.getSnapshot(), { matStatus: 'err', mats: { ok: false, error: String(e && e.message || e) } })); return null }
      }
      bus.closeMats = () => store.set(Object.assign({}, store.getSnapshot(), { matFor: null, mats: null, matStatus: 'idle' }))

      // ── 计划调整（写操作，全部需二次确认）──────────────────────────
      const setToast = (msg, tone) => {
        store.set(Object.assign({}, store.getSnapshot(), { toast: msg ? { msg, tone: tone || 'ok', at: Date.now() } : null }))
        if (msg) setTimeout(() => store.set(Object.assign({}, store.getSnapshot(), { toast: null })), 4000)
      }
      const runOp = async (method, args, label) => {
        store.set(Object.assign({}, store.getSnapshot(), { opBusy: method + ':' + (args.ids ? args.ids.join(',') : (args.id || '')), opMsg: null }))
        try {
          const r = await rpc(method, Object.assign({ account: store.getSnapshot().account, confirm: true }, args))
          const okN = r && r.ok
          setToast(okN ? (label + ' 成功' + (r.count ? '（' + r.count + ' 条）' : '')) : (label + ' 失败：' + ((r && (r.error || r.msg)) || '未知')), okN ? 'ok' : 'err')
          return r
        } catch (e) { setToast(label + ' 失败：' + String(e && e.message || e), 'err'); return null }
        finally { store.set(Object.assign({}, store.getSnapshot(), { opBusy: null })) }
      }
      bus.op = (ids, opt, name) => {
        const act = opt === 1 ? '启动' : opt === 2 ? '暂停' : '删除'
        if (!window.confirm('确认' + act + ' ' + (Array.isArray(ids) ? ids.length : 1) + ' 条计划？\n' + (name || ''))) return Promise.resolve(null)
        return runOp('planOperate', { ids: Array.isArray(ids) ? ids : [ids], opt }, act)
      }
      bus.budget = (id, yuan, name) => {
        if (!window.confirm('把「' + (name || id) + '」的日预算改为 ¥' + yuan + '？')) return Promise.resolve(null)
        return runOp('setBudget', { id, yuan: Number(yuan) }, '改预算')
      }
      bus.roi = (id, roi, name) => {
        if (!window.confirm('把「' + (name || id) + '」的净成交 ROI 目标改为 ' + roi + '？')) return Promise.resolve(null)
        return runOp('setRoi', { id, roi: Number(roi) }, '改 ROI')
      }
      bus.collect = async () => {
        setToast('本轮采集已启动（约 30–60 秒）…', 'biz')
        try {
          const r = await rpc('collect', { account: store.getSnapshot().account })
          setToast(r && r.ok ? '采集完成' + (r.elapsedMs ? '（' + (r.elapsedMs / 1000).toFixed(1) + 's）' : '') : ('采集失败：' + ((r && r.error) || '未知')), r && r.ok ? 'ok' : 'err')
          if (r && r.ok) await load(true)
          return r
        } catch (e) { setToast('采集失败：' + String(e && e.message || e), 'err'); return null }
      }
      bus.toast = setToast

      // 探测框架服务；缺席时不算错误（用户可能只装了内容模块），
      // 但要给出可定位的日志，绝不抛错（抛错会让 entry 卡在 loading）。
      function resolveWbc() {
        // 只用 ctx.get：cordis 文档明确它是 "without the inject requirement" 的读取方式，
        // 服务未提供时返回 undefined；而 ctx.<name> 的属性访问在服务缺失时会抛
        // 'cannot get property "X" without inject'，会污染启动路径，故不使用。
        try {
          if (typeof ctx.get === 'function') {
            const svc = ctx.get('workbenchConsole', false) || ctx.get('workbenchConsole')
            if (svc && typeof svc.register === 'function') return svc
          }
        } catch (e) { /* 兜底：任何异常都不影响启动 */ }
        return null
      }

      const wbc = resolveWbc()
      if (!wbc) {
        ctx.logger ? ctx.logger.warn('[dsh-qianchuan-workbench] 未检测到工作台框架 dsh-workbench-console，本工作台暂不注册。安装并启用框架后重启即可生效。') : void 0
        return
      }
      ctx.effect(() => wbc.register({
        id: 'qianchuan',
        title: '千川投流',
        glyph: '📊',
        description: '账户 / 计划 / 素材 / 直播间数据 + 决策队列 + AI 建议',
        order: 10,
        component: QianchuanWorkbench
      }), 'dsh-qianchuan-workbench: register into workbench-console')

      void load(false)
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
