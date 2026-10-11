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
      title: '千川投流工作台', tabDesk: '作战台', tabQueue: '决策队列', tabPlans: '计划体检',
      tabLive: '直播间', tabMats: '素材', tabAlerts: '异常雷达', tabAI: 'AI 建议',
      refresh: '刷新', force: '强制刷新', loading: '加载中…', failed: '失败', retry: '重试',
      account: '账号', target: '目标ROI', noData: '暂无数据', stale: '数据已过期',
      cost: '消耗', settle: '净成交', roi: '净ROI', orders: '订单', budget: '预算',
      onTarget: '达标', below: '未达标', running: '在跑', paused: '暂停',
      exec: '执行', ignore: '忽略', evidence: '证据', suggest: '建议', confidence: '把握',
      liveOnline: '在线', liveWatch: '场观', livePayRate: '成交率', liveGpm: 'GPM',
      liveUnitCost: '订单成本', liveSettle: '直播结算', search: '搜索计划名…',
      onlyAction: '只看有建议的', collectAt: '采集于', minAgo: '分钟前',
      empty: '这个工作台还没有数据。点「刷新」从分身浏览器取一次。', credFail: '取不到登录凭证',
      matPlanCount: '关联计划', verdict: '建议', planCount: '计划数', actions: '条建议',
      ok: '正常', warn: '注意', high: '严重'
    }

    const CSS = [
      '.qcw{display:flex;flex-direction:column;height:100%;box-sizing:border-box;overflow:hidden}',
      '.qcw-tabs{display:flex;gap:2px;padding:10px 20px 0;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.2));flex:none;flex-wrap:wrap}',
      '.qcw-tab{padding:7px 13px;border:0;background:none;color:inherit;font:inherit;font-size:13px;cursor:pointer;border-bottom:2px solid transparent;opacity:.62;white-space:nowrap}',
      '.qcw-tab:hover{opacity:.9}',
      '.qcw-tab[data-on="1"]{opacity:1;border-bottom-color:var(--dsw-alias-state-business-primary,#3b82f6);font-weight:600}',
      '.qcw-bar{display:flex;align-items:center;gap:10px;padding:10px 20px;flex:none;flex-wrap:wrap;font-size:12.5px}',
      '.qcw-body{flex:1;min-height:0;overflow:auto;padding:4px 20px 24px}',
      '.qcw-card{border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.22));border-radius:10px;padding:12px 14px;margin-bottom:10px}',
      '.qcw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}',
      '.qcw-stat{border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.22));border-radius:10px;padding:11px 13px;min-width:0}',
      '.qcw-stat b{display:block;font-size:19px;font-weight:650;margin-top:3px;font-variant-numeric:tabular-nums}',
      '.qcw-stat span{font-size:11.5px;opacity:.66}',
      '.qcw-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;flex-wrap:wrap}',
      '.qcw-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.09))}',
      '.qcw-name{flex:1;min-width:150px;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.qcw-num{font-variant-numeric:tabular-nums;font-size:12.5px;white-space:nowrap}',
      '.qcw-pill{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid currentColor;opacity:.75;white-space:nowrap}',
      '.qcw-pill[data-lv="high"]{color:#e5484d;opacity:1}',
      '.qcw-pill[data-lv="warn"]{color:#f5a524;opacity:1}',
      '.qcw-pill[data-lv="info"]{opacity:.6}',
      '.qcw-pill[data-lv="good"]{color:#30a46c;opacity:1}',
      '.qcw-btn{padding:5px 11px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));background:none;color:inherit;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.qcw-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.13))}',
      '.qcw-btn:disabled{opacity:.45;cursor:default}',
      '.qcw-inp{padding:5px 9px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.32));background:transparent;color:inherit;font:inherit;font-size:12.5px;min-width:120px}',
      '.qcw-ul{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:3px}',
      '.qcw-ul li{font-size:12.5px;line-height:1.55;opacity:.84;padding-left:12px;position:relative}',
      '.qcw-ul li:before{content:"·";position:absolute;left:2px;opacity:.6}',
      '.qcw-err{color:#e5484d;font-size:12.5px;padding:8px 0}',
      '.qcw-sub{font-size:12px;opacity:.62;line-height:1.6}',
      '.qcw-bar-inner{height:5px;border-radius:3px;background:var(--dsw-alias-border-l2,rgba(127,127,127,.25));overflow:hidden;margin-top:5px}',
      '.qcw-bar-fill{height:100%;background:#3b82f6}',
      '.qcw-h{font-size:13.5px;font-weight:600;margin:14px 0 4px}',
      '.qcw-pre{font-size:11.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;opacity:.8;max-height:320px;overflow:auto;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.2));border-radius:8px;padding:10px}'
    ].join('')

    function installStyles() {
      if (typeof document === 'undefined') return
      const ex = document.querySelector('style[data-qcw]')
      if (ex) { if (ex.textContent !== CSS) ex.textContent = CSS; return }
      const t = document.createElement('style')
      t.dataset.qcw = '1'; t.dataset.pluginCss = 'dsh-qianchuan-workbench/ui.css'; t.textContent = CSS
      document.head.appendChild(t)
    }

    // ── 模块级单例（组件与 apply 共用闭包，不走 props 转发）──
    function createStore(v) {
      let val = v; const ls = new Set()
      return { getSnapshot: () => val, subscribe: (f) => { ls.add(f); return () => { ls.delete(f) } }, set: (n) => { val = n; for (const f of [...ls]) f() } }
    }
    const store = createStore({ status: 'idle', snap: null, advice: null, config: null, error: null, tab: 'desk', search: '', onlyAction: false, account: 'default' })
    const bus = { load: null, advice: null, setTab: null, refresh: null, saveConfig: null }

    function useStore(s) {
      if (typeof React.useSyncExternalStore === 'function') return React.useSyncExternalStore(s.subscribe, s.getSnapshot, s.getSnapshot)
      const [v, setV] = React.useState(s.getSnapshot())
      React.useEffect(() => s.subscribe(() => setV(s.getSnapshot())), [s])
      return v
    }

    const fmtMoney = (n) => (n === null || n === undefined) ? '—' : '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const fmtNum = (n, d) => (n === null || n === undefined) ? '—' : Number(n).toFixed(d === undefined ? 2 : d)
    const fmtInt = (n) => (n === null || n === undefined) ? '—' : Number(n).toLocaleString('zh-CN')

    function Stat(props) { return h('div', { className: 'qcw-stat' }, h('span', null, props.label), h('b', { style: props.color ? { color: props.color } : undefined }, props.value), props.sub ? h('span', { style: { marginTop: 2, display: 'block' } }, props.sub) : null) }

    // ── 作战台 ──────────────────────────────────────────────────────────────
    function Desk() {
      const st = useStore(store); const s = st.snap
      if (!s) return null
      const o = s.overview || {}
      const lv = s.live && s.live.ok ? s.live.raw : null
      const target = o.target || 2.2
      const roiOk = o.roi !== null && o.roi >= target
      return h('div', null,
        h('div', { className: 'qcw-grid' },
          h(Stat, { label: '全账户消耗', value: fmtMoney(o.cost), sub: s.collectAt ? (h('span', null, '采集于 ' + new Date(s.collectAt).toLocaleTimeString('zh-CN', { hour12: false }))) : null }),
          h(Stat, { label: '净成交', value: fmtMoney(o.settle) }),
          h(Stat, { label: '净ROI', value: fmtNum(o.roi, 3), color: roiOk ? '#30a46c' : '#e5484d', sub: (roiOk ? '✅ ' : '⚠️ ') + '目标 ' + target }),
          h(Stat, { label: '订单', value: fmtInt(o.orders), sub: o.planCount + ' 条计划 / ' + o.running + ' 在跑' })
        ),
        lv ? h('div', null,
          h('div', { className: 'qcw-h' }, '直播间实时'),
          h('div', { className: 'qcw-grid' },
            h(Stat, { label: '在线人数', value: fmtInt(lv.online) }),
            h(Stat, { label: '累计场观', value: fmtInt(lv.watchers) }),
            h(Stat, { label: '观看→成交率', value: (lv.payRate === null ? '—' : lv.payRate + '%') }),
            h(Stat, { label: 'GPM', value: fmtNum(lv.gpm, 1) }),
            h(Stat, { label: '直播消耗', value: fmtMoney(lv.cost) }),
            h(Stat, { label: '订单成本', value: fmtMoney(lv.unitCost) })
          )
        ) : null,
        h('div', { className: 'qcw-h' }, '板块拆解'),
        h('div', { className: 'qcw-card' },
          (s.byKind || []).map((k) => h('div', { className: 'qcw-row', key: k.kind },
            h('span', { className: 'qcw-pill' }, k.label),
            h('span', { className: 'qcw-num' }, k.plans + ' 条'),
            h('span', { className: 'qcw-num' }, '消耗 ' + fmtMoney(k.cost)),
            h('span', { className: 'qcw-num' }, '净成交 ' + fmtMoney(k.settle)),
            h('span', { className: 'qcw-num', style: { fontWeight: 600 } }, 'ROI ' + (k.roi === null ? '—' : fmtNum(k.roi, 3))),
            k.roi !== null ? h('span', { className: 'qcw-pill', 'data-lv': k.roi >= target ? 'good' : 'warn' }, k.roi >= target ? '达标' : '未达标') : null
          ))
        ),
        s.report ? h('div', null, h('div', { className: 'qcw-h' }, '采集报告（原始）'), h('div', { className: 'qcw-pre' }, s.report.slice(0, 4000))) : null
      )
    }

    // ── 决策队列（核心）────────────────────────────────────────────────────
    function Queue() {
      const st = useStore(store); const s = st.snap
      if (!s) return null
      const q = s.queue || []
      if (q.length === 0) return h('div', { className: 'qcw-card' }, h('div', { className: 'qcw-sub' }, '当前没有需要动作的计划。规则：消耗 > ¥' + s.thresholds.minCost + ' 且 净ROI < ' + s.thresholds.roiTarget + '，连续 ' + s.thresholds.confirmRounds + ' 轮才建议关闭。'))
      const lvOf = (x) => x.severity >= 3 ? 'high' : (x.severity === 2 ? 'warn' : 'info')
      return h('div', null, q.map((x) => h('div', { className: 'qcw-card', key: x.planId + x.action },
        h('div', { className: 'qcw-row' },
          h('span', { className: 'qcw-pill', 'data-lv': lvOf(x) }, x.actionLabel),
          h('span', { className: 'qcw-name', title: x.planName }, x.planName),
          h('span', { className: 'qcw-pill' }, x.kindLabel),
          h('span', { className: 'qcw-num' }, '消耗 ' + fmtMoney(x.plan.cost)),
          h('span', { className: 'qcw-num' }, '净ROI ' + (x.plan.roi === null ? '—' : fmtNum(x.plan.roi, 3))),
          h('span', { style: { flex: 1 } })
        ),
        h('ul', { className: 'qcw-ul' }, x.reasons.map((r, i) => h('li', { key: i }, r)))
      )))
    }

    // ── 计划体检 ────────────────────────────────────────────────────────────
    function Plans() {
      const st = useStore(store); const s = st.snap
      if (!s) return null
      const kw = (st.search || '').trim().toLowerCase()
      let list = (s.plans || []).slice().sort((a, b) => (b.cost || 0) - (a.cost || 0))
      if (kw) list = list.filter((p) => String(p.name).toLowerCase().includes(kw))
      const target = s.thresholds.roiTarget
      return h('div', null,
        list.slice(0, 300).map((p) => h('div', { className: 'qcw-row', key: p.kind + p.id },
          h('span', { className: 'qcw-name', title: p.name }, p.name),
          h('span', { className: 'qcw-pill', 'data-lv': p.status === 'running' ? 'good' : 'info' }, p.statusText),
          h('span', { className: 'qcw-pill' }, p.kindLabel),
          h('span', { className: 'qcw-num' }, fmtMoney(p.cost)),
          h('span', { className: 'qcw-num', style: { fontWeight: 600 } }, 'ROI ' + (p.roi === null ? '—' : fmtNum(p.roi, 3))),
          p.roiGoal ? h('span', { className: 'qcw-num' }, '目标 ' + fmtNum(p.roiGoal, 2)) : null,
          p.roi !== null ? h('span', { className: 'qcw-pill', 'data-lv': p.roi >= target ? 'good' : (p.cost > s.thresholds.minCost ? 'warn' : 'info') }, p.roi >= target ? '达标' : '低效') : null,
          p.budget ? h('span', { className: 'qcw-num' }, '预算 ' + fmtMoney(p.budget)) : null,
          p.compensate ? h('span', { className: 'qcw-pill', 'data-lv': 'info' }, '保障期') : null,
          h('span', { className: 'qcw-num' }, p.orders + ' 单')
        )),
        list.length > 300 ? h('div', { className: 'qcw-sub' }, '（仅显示前 300 条，共 ' + list.length + ' 条）') : null
      )
    }

    // ── 直播间 ──────────────────────────────────────────────────────────────
    function Live() {
      const st = useStore(store); const s = st.snap
      if (!s) return null
      const l = s.live
      if (!l || !l.ok) return h('div', { className: 'qcw-card' }, h('div', { className: 'qcw-sub' }, '直播大屏不可用：' + ((l && l.error) || '未知')), h('div', { className: 'qcw-sub', style: { marginTop: 6 } }, '提示：直播数据需要该账号配置 roomId / anchorId，且直播时段才有效。'))
      const r = l.raw
      return h('div', null,
        h('div', { className: 'qcw-grid' },
          h(Stat, { label: '在线人数', value: fmtInt(r.online) }),
          h(Stat, { label: '累计场观', value: fmtInt(r.watchers) }),
          h(Stat, { label: '观看→成交率', value: r.payRate === null ? '—' : r.payRate + '%' }),
          h(Stat, { label: '曝光→观看率', value: r.showToWatch === null ? '—' : r.showToWatch + '%' }),
          h(Stat, { label: 'GPM', value: fmtNum(r.gpm, 1) }),
          h(Stat, { label: '直播消耗', value: fmtMoney(r.cost) }),
          h(Stat, { label: '直播结算', value: fmtMoney(r.settle) }),
          h(Stat, { label: '成交单数', value: fmtInt(r.settleCnt) }),
          h(Stat, { label: '订单成本', value: fmtMoney(r.unitCost) })
        ),
        h('div', { className: 'qcw-card' }, h('div', { className: 'qcw-sub' }, '数据来自直播大屏接口（实时，每 60 秒可刷新）。'))
      )
    }

    // ── 素材 ────────────────────────────────────────────────────────────────
    function Materials() {
      const st = useStore(store); const s = st.snap
      if (!s) return null
      const mats = s.materials || []
      if (mats.length === 0) return h('div', { className: 'qcw-card' }, h('div', { className: 'qcw-sub' }, '本轮快照未包含素材级明细。素材级数据由采集链路的素材清单提供，接入后这里会按素材列出消耗 / 净成交 / ROI。'))
      return h('div', null, mats.map((m, i) => h('div', { className: 'qcw-row', key: (m.materialId || '') + i },
        h('span', { className: 'qcw-name' }, m.label || m.materialId),
        h('span', { className: 'qcw-num' }, '关联 ' + (m.planCount || 0) + ' 计划'),
        h('span', { className: 'qcw-num' }, fmtMoney(m.cost)),
        h('span', { className: 'qcw-num' }, 'ROI ' + (m.roi === null ? '—' : fmtNum(m.roi, 3)))
      )))
    }

    // ── 异常雷达 ────────────────────────────────────────────────────────────
    function Alerts() {
      const st = useStore(store); const s = st.snap
      if (!s) return null
      const a = s.alerts || []
      if (a.length === 0) return h('div', { className: 'qcw-card' }, h('div', { className: 'qcw-sub' }, '当前无异常。'))
      return h('div', null, a.slice(0, 200).map((x, i) => h('div', { className: 'qcw-row', key: i },
        h('span', { className: 'qcw-pill', 'data-lv': x.level }, x.level === 'high' ? '严重' : x.level === 'warn' ? '注意' : '提示'),
        h('span', { className: 'qcw-name', title: x.title }, x.title),
        h('span', { className: 'qcw-num', style: { opacity: .7 } }, x.detail)
      )))
    }

    // ── AI 建议（第 5 期）───────────────────────────────────────────────────
    function Advice() {
      const st = useStore(store); const s = st.snap; const ad = st.advice
      if (!ad) return h('div', { className: 'qcw-card' }, h('div', { className: 'qcw-sub' }, '点右上角「AI 建议」生成对每条计划的操作建议。'))
      const items = ad.items || []
      const map = { close: 'high', watch: 'warn', duplicate: 'good', keep: 'info', 'add-budget': 'warn' }
      const shown = items.filter((x) => x.verdict !== 'keep')
      return h('div', null,
        h('div', { className: 'qcw-card' },
          h('div', { className: 'qcw-sub' }, '共 ' + items.length + ' 条计划，其中 ' + shown.length + ' 条需要动作。目标 ROI ' + ad.target + '。')),
        (shown.length ? shown : items).slice(0, 200).map((x, i) => h('div', { className: 'qcw-card', key: x.planId + i },
          h('div', { className: 'qcw-row' },
            h('span', { className: 'qcw-pill', 'data-lv': map[x.verdict] || 'info' }, x.verdictLabel),
            h('span', { className: 'qcw-name', title: x.planName }, x.planName),
            h('span', { className: 'qcw-pill' }, x.kindLabel),
            h('span', { className: 'qcw-num' }, '把握：' + x.confidence),
            h('span', { className: 'qcw-num' }, '消耗 ' + fmtMoney(x.metrics.cost) + ' · ROI ' + (x.metrics.roi === null ? '—' : fmtNum(x.metrics.roi, 3)))
          ),
          x.reasons.length ? h('ul', { className: 'qcw-ul' }, x.reasons.map((r, j) => h('li', { key: j }, r))) : null
        ))
      )
    }


    // ── 设置（账号配置）──────────────────────────────────────────────────────
    function Settings() {
      const st = useStore(store)
      const cfg = st.config || { accounts: [] }
      const [draft, setDraft] = React.useState(null)
      const list = cfg.accounts || []
      React.useEffect(() => {
        if (draft === null && list.length) {
          const m = {}
          list.forEach(a => { m[a.key] = Object.assign({}, a) })
          setDraft(m)
        }
      }, [cfg.accounts.length])
      if (!draft) return h('div', { className: 'qcw-card' }, h('div', { className: 'qcw-sub' }, '正在读取配置…'))

      const upd = (key, field, val) => setDraft(Object.assign({}, draft, { [key]: Object.assign({}, draft[key], { [field]: val }) }))
      const save = async () => {
        const r = await bus.saveConfig(draft)
        if (r && r.ok) await bus.load(true)
      }
      const addAcc = () => {
        const key = window.prompt('账号标识（英文，如 hongwei / haiwai）', '')
        if (!key || !key.trim()) return
        const k = key.trim()
        setDraft(Object.assign({}, draft, { [k]: { key: k, label: k, aavid: '', port: '9222', roomId: '', anchorId: '', dataRoot: '' } }))
      }
      return h('div', null,
        h('div', { className: 'qcw-card' },
          h('div', { className: 'qcw-sub' },
            '插件不预置任何账号数据。请填写你自己的千川账号：',
            h('br'),
            '· aavid：千川账户 ID（浏览器地址栏 aavid= 后面那串）',
            h('br'),
            '· CDP 端口：你的浏览器分身调试端口（默认 9222）',
            h('br'),
            '· 采集目录：本机已有的采集产物目录（可留空，留空则只用实时接口）',
            h('br'),
            '· roomId / anchorId：直播大屏需要（可留空）'),
          h('div', { style: { marginTop: 10 } },
            h('button', { type: 'button', className: 'qcw-btn', onClick: addAcc }, '＋ 添加账号'))),
        Object.keys(draft).map(key => {
          const a = draft[key]
          const field = (label, k, ph) => h('label', { className: 'qcw-sub', style: { display: 'block', marginTop: 6 } }, label,
            h('input', { className: 'qcw-inp', style: { width: '100%', boxSizing: 'border-box' }, value: a[k] === undefined || a[k] === null ? '' : String(a[k]), placeholder: ph || '', onChange: (e) => upd(key, k, e.target.value) }))
          return h('div', { className: 'qcw-card', key },
            h('div', { className: 'qcw-row' }, h('b', null, a.label || key), h('span', { className: 'qcw-sub' }, 'key=' + key)),
            field('显示名', 'label', '红卫'),
            field('aavid（账户ID）', 'aavid', '1855810750424170'),
            field('CDP 端口', 'port', '9222'),
            field('采集产物目录（可留空）', 'dataRoot', 'D:\\...\\千川项目'),
            field('roomId（可留空）', 'roomId', ''),
            field('anchorId（可留空）', 'anchorId', '')
          )
        }),
        h('div', { style: { marginTop: 12, display: 'flex', gap: 8 } },
          h('button', { type: 'button', className: 'qcw-btn', onClick: save }, '保存并刷新'),
          h('button', { type: 'button', className: 'qcw-btn', onClick: () => bus.load(true) }, '仅刷新')),
        st.error ? h('div', { className: 'qcw-err' }, st.error) : null
      )
    }

    // ── 主面板 ──────────────────────────────────────────────────────────────
    function QianchuanWorkbench(props) {
      const st = useStore(store)
      const tabs = [['desk', zh.tabDesk], ['queue', zh.tabQueue], ['plans', zh.tabPlans], ['live', zh.tabLive], ['mats', zh.tabMats], ['alerts', zh.tabAlerts], ['ai', zh.tabAI], ['settings', '设置']]
      const s = st.snap
      const queueN = s && s.queue ? s.queue.length : 0
      const alertN = s && s.alerts ? s.alerts.length : 0

      let bodyEl = null
      if (st.status === 'loading' && !s) bodyEl = h('div', { className: 'qcw-body' }, h('div', { className: 'qcw-sub' }, zh.loading))
      else if (st.error && !s) bodyEl = h('div', { className: 'qcw-body' }, h('div', { className: 'qcw-err' }, zh.failed + '：' + st.error),
        h('button', { className: 'qcw-btn', onClick: () => bus.load(false) }, zh.retry))
      else if (!s) bodyEl = h('div', { className: 'qcw-body' }, h('div', { className: 'qcw-sub' }, zh.empty),
        h('div', { style: { marginTop: 10 } }, h('button', { className: 'qcw-btn', onClick: () => bus.load(true) }, zh.refresh)))
      else {
        const view = st.tab === 'queue' ? Queue : st.tab === 'plans' ? Plans : st.tab === 'live' ? Live : st.tab === 'mats' ? Materials : st.tab === 'alerts' ? Alerts : st.tab === 'ai' ? Advice : st.tab === 'settings' ? Settings : Desk
        bodyEl = h('div', { className: 'qcw-body' }, h(view))
      }

      return h('div', { className: 'qcw', 'data-qcw': '1', style: { height: '100%', minHeight: 0 } },
        h('div', { className: 'qcw-tabs' },
          tabs.map(([id, label]) => h('button', {
            key: id, type: 'button', className: 'qcw-tab', 'data-on': st.tab === id ? '1' : '0',
            onClick: () => bus.setTab(id)
          }, label + (id === 'queue' && queueN ? ' ' + queueN : '') + (id === 'alerts' && alertN ? ' ' + alertN : '')))
        ),
        h('div', { className: 'qcw-bar' },
          h('span', { className: 'qcw-sub' }, s ? (s.account.label + ' · 采集于 ' + (s.ageMin === null ? '—' : s.ageMin + ' 分钟前') + ' · 凭证 ' + (s.credential.ok ? '✅' : '❌')) : ''),
          h('span', { style: { flex: 1 } }),
          st.tab === 'plans' ? h('input', { className: 'qcw-inp', placeholder: zh.search, value: st.search, onChange: (e) => bus.search(e.target.value) }) : null,
          st.tab === 'ai' ? h('button', { className: 'qcw-btn', onClick: () => bus.advice() }, zh.tabAI) : null,
          h('button', { className: 'qcw-btn', disabled: st.status === 'loading', onClick: () => bus.load(true) }, st.status === 'loading' ? zh.loading : zh.force)
        ),
        bodyEl
      )
    }

    // ★ 只 inject 宿主 baseline 服务。框架的 workbenchConsole 是「跨插件可选依赖」，
    //   绝不能写进 inject —— cordis 里 inject 是激活门槛，服务未就绪时 entry 会卡在
    //   pending (waiting for service: workbenchConsole)，导致
    //   'web boot: 1 entry did not activate' 直接中止整个界面启动（2026-10-11 崩溃同因）。
    //   正确做法：用 ctx.get() 运行时探测（与 dsh-better-sidebar 取 betterSidebar 同法）。
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
        try { json = raw ? JSON.parse(raw) : null } catch { json = null }
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

      // ★ 向工作台框架注册本工作台（不再自己占 main / sidebar.panellist 席位）
      // cordis: ctx.provide(name, svc) 后服务可直接以 ctx.<name> 访问，也可用 ctx.get(name)
      // 探测框架服务；缺席时不算错误（用户可能只装了内容模块），
      // 但要给出可定位的日志，绝不抛错（抛错会让 entry 卡在 loading）。
      function resolveWbc() {
        // 只用 ctx.get：cordis 文档明确它是 "without the inject requirement" 的读取方式，
        // 服务未提供时返回 undefined；而 ctx.<name> 的属性访问在服务缺失时会抛
        // 'cannot get property "X" without inject'，会污染启动路径，故不使用。
        try {
          if (typeof ctx.get === 'function') {
            // strict=false：即便框架 fiber 尚未激活也返回已注册的实现
            const s = ctx.get('workbenchConsole', false) || ctx.get('workbenchConsole')
            if (s && typeof s.register === 'function') return s
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
