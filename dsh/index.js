// dsh-qianchuan-workbench — 服务端数据引擎
// 数据源：① 既定采集链路产物 cycle_snapshot.json（全量、已归一化）
//         ② 分身浏览器 CDP 取凭证 → 纯 HTTP 调平台接口（实时大屏）
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import http from 'node:http'
import https from 'node:https'

export const name = 'dsh-qianchuan-workbench'
export const inject = ['connection']

const ROUTE = '/_dsh/dsh-qianchuan-workbench'
const PLATFORM = 'qianchuan.jinritemai.com'

/**  
 * 账号档案默认值。**任何字段都可被用户配置覆盖**（state.settings.accounts）。
 * dataRoot 留空 = 该账号不读本地采集产物，仅用平台实时接口；用户可在工作台「设置」里填写。
 * 这样插件不依赖任何人的私有目录结构，装上即可用。
 */
const ACCOUNTS = {
  default: {
    key: 'default', label: '默认账号', aavid: '', port: 9222, roomId: '', anchorId: '', dataRoot: ''
  }
}

/** 直播大屏指标（board 数据集专用，已验证可返数据） */
const BOARD_METRICS = ['live_watch_to_pay_rate_for_roi2', 'total_live_pay_order_gpm_realtime_for_roi2',
  'total_cost_per_pay_order_settle_realtime_for_roi2_1h', 'total_order_settle_count_realtime_for_roi2_1h',
  'room_pack_online_user_count', 'total_show_to_watch_rate_for_roi2', 'live_watch_ucount_for_roi2',
  'stat_cost_for_roi2', 'total_prepay_and_pay_settle_realtime_roi2_1h', 'total_order_settle_amount_realtime_for_roi2_1h']

function dshHomeDir() {
  const c = typeof process.env.DSH_HOME === 'string' ? process.env.DSH_HOME.trim() : ''
  return c.length > 0 ? c : join(homedir(), '.dsh')
}

export function apply(ctx, config) {
  const root = (config && typeof config.root === 'string' && config.root.length > 0)
    ? config.root : join(dshHomeDir(), 'dsh-qianchuan-workbench')
  const stateFile = join(root, 'state.json')

  const defaultState = {
    version: 1, activeAccount: 'default',
    thresholds: { roiTarget: 2.2, minCost: 30, confirmRounds: 2 },
    /** 用户可配置：账号列表 + 每个账号的 aavid / CDP 端口 / roomId / anchorId / 本地采集目录 */
    settings: { accountList: [], accounts: {} },
    pendingHits: {}, verdicts: {}, actions: []
  }
  function readState() {
    try {
      if (!existsSync(stateFile)) return JSON.parse(JSON.stringify(defaultState))
      return Object.assign(JSON.parse(JSON.stringify(defaultState)), JSON.parse(readFileSync(stateFile, 'utf8')))
    } catch { return JSON.parse(JSON.stringify(defaultState)) }
  }
  function writeState(s) {
    try { mkdirSync(root, { recursive: true }); writeFileSync(stateFile, JSON.stringify(s, null, 2), 'utf8'); return null }
    catch (e) { return String(e && e.message || e) }
  }

  /** 合并「内置默认 + 用户配置」得到实际账号档案。 */
  function resolveAccounts(state) {
    const custom = (state.settings && state.settings.accounts) || {}
    const list = (state.settings && Array.isArray(state.settings.accountList) && state.settings.accountList.length)
      ? state.settings.accountList
      : Object.keys(custom).length ? Object.keys(custom) : Object.keys(ACCOUNTS)
    const merged = {}
    for (const key of list) {
      merged[key] = Object.assign({}, ACCOUNTS[key] || ACCOUNTS.default, custom[key] || {}, { key })
    }
    return merged
  }

  // ── CDP 取凭证（唯一浏览器接触点，只读 cookie，不抢焦点）─────────────────
  function cdpJson(port, pathname, ms) {
    return new Promise((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: pathname, timeout: ms || 3000 }, (res) => {
        let b = ''; res.on('data', (c) => b += c); res.on('end', () => { try { resolve(JSON.parse(b)) } catch { resolve(null) } })
      })
      req.on('error', () => resolve(null))
      req.on('timeout', () => { req.destroy(); resolve(null) })
    })
  }
  function cdpCookies(wsUrl) {
    return new Promise((resolve) => {
      const WS = globalThis.WebSocket
      if (typeof WS !== 'function' || !wsUrl) { resolve(''); return }
      const ws = new WS(wsUrl)
      const timer = setTimeout(() => { try { ws.close() } catch {} resolve('') }, 8000)
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Network.getAllCookies' }))
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(String(ev.data))
          if (m.id === 1) {
            clearTimeout(timer); ws.close()
            const jr = (m.result && m.result.cookies || []).filter((c) => /jinritemai|qianchuan/i.test(c.domain))
            resolve(jr.map((c) => c.name + '=' + c.value).join('; '))
          }
        } catch {}
      }
      ws.onerror = () => { clearTimeout(timer); resolve('') }
    })
  }
  const cookieCache = {}
  async function getCookie(acc, force) {
    const now = Date.now()
    if (!force && cookieCache[acc.key] && now - cookieCache[acc.key].at < 5 * 60 * 1000) return cookieCache[acc.key]
    let result = { cookie: '', via: 'none', at: now }
    const list = await cdpJson(acc.port, '/json/list')
    const page = (list || []).find((t) => t.type === 'page' && /qianchuan\.jinritemai|uni-prom|board-next|overall-prom/.test(t.url || ''))
    if (page && page.webSocketDebuggerUrl) {
      const c = await cdpCookies(page.webSocketDebuggerUrl)
      if (c) result = { cookie: c, via: 'page:' + acc.port, at: now }
    }
    if (!result.cookie) {
      const ver = await cdpJson(acc.port, '/json/version')
      if (ver && ver.webSocketDebuggerUrl) {
        const c = await cdpCookies(ver.webSocketDebuggerUrl)
        if (c) result = { cookie: c, via: 'browser:' + acc.port, at: now }
      }
    }
    cookieCache[acc.key] = result
    return result
  }

  // ── 纯 HTTP 调平台 ──────────────────────────────────────────────────────
  function api(cookie, pathname, body) {
    return new Promise((resolve) => {
      const data = body === undefined ? null : Buffer.from(JSON.stringify(body))
      const headers = {
        Cookie: cookie, Origin: 'https://' + PLATFORM, Referer: 'https://' + PLATFORM + '/uni-prom',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*', 'Accept-Language': 'zh-CN,zh;q=0.9'
      }
      if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = data.length }
      const req = https.request({ host: PLATFORM, path: pathname, method: body === undefined ? 'GET' : 'POST', timeout: 25000, headers }, (res) => {
        let b = ''; res.on('data', (c) => b += c)
        res.on('end', () => { let j = null; try { j = JSON.parse(b) } catch {} resolve({ http: res.statusCode, json: j, text: b }) })
      })
      req.on('error', (e) => resolve({ http: 0, json: null, text: 'ERR ' + e.message }))
      req.on('timeout', () => { req.destroy(); resolve({ http: 0, json: null, text: 'TIMEOUT' }) })
      if (data) req.write(data)
      req.end()
    })
  }

  const num = (v) => {
    if (v == null) return null
    const raw = typeof v === 'object' ? (v.Value ?? v.value ?? v.ValueStr) : v
    const s = String(raw ?? '').replace(/,/g, '').replace(/%/g, '').trim()
    if (s === '' || s === '-') return null
    const n = Number(s); return Number.isFinite(n) ? n : null
  }

  /** 实时直播大屏（已验证可用） */
  async function liveBoard(acc, cookie) {
    if (!acc.roomId || !acc.anchorId) return { ok: false, error: '该账号未配置 roomId/anchorId' }
    const key = 'board_roi2_overview_conf_next'
    const refer = 'ecp,7532804468681916467,7542810029855047726,' + key
    const r = await api(cookie, '/ad/api/data/v1/common/statQuery?aavid=' + encodeURIComponent(acc.aavid), {
      DataSetKey: key, Metrics: BOARD_METRICS, Dimensions: [], PageParams: { Offset: 0, Limit: -1 },
      Filters: { ConditionRelationshipType: 1, Conditions: [
        { Field: 'advertiser_id', Operator: 7, Values: [acc.aavid] },
        { Field: 'room_id', Operator: 7, Values: [acc.roomId] },
        { Field: 'anchor_id', Operator: 7, Values: [acc.anchorId] }] },
      refer, Base: { Extra: { refer } }
    })
    if (!r.json || r.json.status_code !== 0) return { ok: false, error: (r.json && r.json.message) || r.text.slice(0, 160) }
    const row = ((r.json.data.StatsData && r.json.data.StatsData.Rows) || r.json.data.Rows || [])[0] || {}
    const m = row.Metrics || {}
    return { ok: true, raw: {
      online: num(m.room_pack_online_user_count), watchers: num(m.live_watch_ucount_for_roi2),
      payRate: num(m.live_watch_to_pay_rate_for_roi2), showToWatch: num(m.total_show_to_watch_rate_for_roi2),
      gpm: num(m.total_live_pay_order_gpm_realtime_for_roi2),
      cost: num(m.stat_cost_for_roi2),
      settle: num(m.total_order_settle_amount_realtime_for_roi2_1h),
      settleCnt: num(m.total_order_settle_count_realtime_for_roi2_1h),
      prepay: num(m.total_prepay_and_pay_settle_realtime_roi2_1h),
      unitCost: num(m.total_cost_per_pay_order_settle_realtime_for_roi2_1h)
    } }
  }

  /** 读既定采集链路的最新产物（全量、已归一化） */
  function latestSnapshot(acc) {
    if (!acc.dataRoot || !existsSync(acc.dataRoot)) return { ok: false, error: '未配置采集目录：' + acc.dataRoot }
    let files = []
    try {
      files = readdirSync(acc.dataRoot)
        .filter((d) => /^qc_data_cycle15_\d{8}_\d{4}$/.test(d))
        .map((d) => ({ d, p: join(acc.dataRoot, d, 'cycle_snapshot.json') }))
        .filter((x) => existsSync(x.p))
        .map((x) => ({ d: x.d, p: x.p, m: statSync(x.p).mtimeMs }))
        .sort((a, b) => b.m - a.m)
    } catch { return { ok: false, error: '读取采集目录失败' } }
    if (files.length === 0) return { ok: false, error: '未找到 cycle_snapshot.json 产物' }
    try {
      const snap = JSON.parse(readFileSync(files[0].p, 'utf8'))
      const rp = join(acc.dataRoot, files[0].d, 'review_report.md')
      return { ok: true, dir: files[0].d, mtime: files[0].m, snapshot: snap,
        report: existsSync(rp) ? readFileSync(rp, 'utf8').slice(0, 20000) : null,
        ageMin: Math.round((Date.now() - files[0].m) / 60000) }
    } catch (e) { return { ok: false, error: '解析快照失败：' + String(e && e.message) } }
  }

  // ── 归一化 ──────────────────────────────────────────────────────────────
  const KINDS = { main_live: '主全域(直播)', main_live_base: '主全域(基座)', regulation: '调控(追投/一键)', product: '商品', brand_live_heat: '品牌-直播加热', brand_crowd_seed: '品牌-人群种草' }

  function normPlans(snap) {
    const out = []
    const push = (arr, kind) => {
      for (const r of arr || []) {
        const cost = num(r.cost) ?? 0
        const net = num(r.netSettle) ?? 0
        const roi = num(r.netRoi) ?? (num(r.compRoiUsed)) ?? (cost > 0 ? net / cost : null)
        out.push({
          id: String(r.id), name: r.name || '(未命名)', kind, kindLabel: KINDS[kind] || kind,
          status: r.status === '投放中' || r.status === 1 ? 'running' : 'paused',
          statusText: typeof r.status === 'string' ? r.status : String(r.status),
          cost, settle: net, orders: num(r.orders) ?? 0,
          gmv: num(r.payGmv) ?? 0,
          roi: roi === null ? null : Number(roi.toFixed(4)),
          roiGoal: num(r.roiGoal), budget: num(r.budgetYuan), bid: num(r.bid),
          smartBidType: r.smartBidType, face: r.face, adlabScene: r.adlabScene,
          compensate: r.compensateStatus === 2, roiWithComp: num(r.roiWithCompensation),
          belowThreshold: r.belowCompensationThreshold === true, learning: r.learningPhase,
          materialCount: num(r.materialCount) ?? null
        })
      }
    }
    push(snap.plans, 'main_live')
    push(snap.regulation, 'regulation')
    push(snap.product, 'product')
    push(snap.brand, 'brand_live_heat')
    for (const f of Object.values((snap.faces && snap.faces.productFaces) || {})) push((f && f.rows) || [], 'product')
    return out
  }

  const ACTIONS = {
    close: { label: '建议关闭', why: '持续低效' },
    'add-budget': { label: '建议加预算', why: '达标且预算将尽' },
    duplicate: { label: '建议复制放量', why: '显著超标' },
    'fix-material': { label: '建议换素材', why: '审核/素材问题' },
    watch: { label: '重点观察', why: '消耗无转化' },
    keep: { label: '维持', why: '表现正常' }
  }

  /** 第 1/2/5 期核心：决策队列 —— 每条计划给一句可执行的话 + 证据 + 推演 */
  function decide(plans, T, state) {
    const queue = []
    const pending = state.pendingHits
    for (const p of plans) {
      const reasons = []
      let action = null, sev = 0
      const lowKey = 'low:' + p.id
      const isRunning = p.status === 'running'

      // 规则 1：低效（两轮确认 —— 成交回传有滞后，单轮不杀）
      if (isRunning && p.cost > T.minCost && p.roi !== null && p.roi < T.roiTarget) {
        const prev = pending[lowKey]
        const rounds = prev ? (prev.rounds || 1) + 1 : 1
        pending[lowKey] = { rounds, at: new Date().toISOString(), cost: p.cost, roi: p.roi }
        if (rounds >= T.confirmRounds) {
          action = 'close'; sev = 3
          reasons.push('消耗 ¥' + p.cost.toFixed(2) + '、净ROI ' + p.roi + '，已连续 ' + rounds + ' 轮低于目标 ' + T.roiTarget)
          reasons.push('推演：按当前速度日损约 ¥' + (p.cost * 24).toFixed(0) + '，且无好转迹象')
        } else {
          reasons.push('首轮命中（消耗 ¥' + p.cost.toFixed(2) + '、净ROI ' + p.roi + '），记待定 ' + rounds + '/' + T.confirmRounds + ' 轮')
          reasons.push('为什么不一刀切：消耗实时、成交滞后回传，这个窗口里净ROI 会虚假偏低')
        }
      } else {
        delete pending[lowKey]
      }

      // 规则 2：加预算
      if (!action && isRunning && p.cost > T.minCost && p.roi !== null && p.roi >= T.roiTarget * 1.2 && p.budget !== null) {
        const left = p.budget - p.cost
        if (left < p.cost * 0.5) {
          action = 'add-budget'; sev = 2
          reasons.push('净ROI ' + p.roi + ' 达标（目标 ' + T.roiTarget + '），预算仅剩 ¥' + left.toFixed(2))
          reasons.push('口径提醒：加预算按「当天已消耗 + 增量」计算，不是设绝对值')
        }
      }

      // 规则 3：复制放量
      if (!action && isRunning && p.roi !== null && p.roi >= T.roiTarget * 1.5 && p.cost > T.minCost) {
        action = 'duplicate'; sev = 1
        reasons.push('净ROI ' + p.roi + ' 显著超标（' + (p.roi / T.roiTarget).toFixed(1) + '× 目标），可复制放量')
      }

      // 规则 4：烧钱无转化
      if (!action && p.cost > T.minCost * 3 && p.orders === 0) {
        action = 'watch'; sev = 3
        reasons.push('已消耗 ¥' + p.cost.toFixed(2) + ' 但零成交订单')
        reasons.push('优先检查素材与定向，而不是先降预算')
      }

      if (action) queue.push({ planId: p.id, planName: p.name, kind: p.kind, kindLabel: p.kindLabel, action, actionLabel: ACTIONS[action].label, severity: sev, reasons, plan: p })
    }
    queue.sort((a, b) => b.severity - a.severity || (b.plan.cost || 0) - (a.plan.cost || 0))
    writeState(state)
    return queue
  }

  /** 第 3 期：异常雷达 */
  function anomalyRadar(plans, snap, staleMin) {
    const alerts = []
    for (const p of plans) {
      if (p.cost > 300 && p.orders === 0) alerts.push({ level: 'high', kind: 'burn', title: '烧钱无转化：' + p.name, detail: '消耗 ¥' + p.cost.toFixed(2) + '，0 单' })
      if (p.budget !== null && p.cost >= p.budget * 0.95) alerts.push({ level: 'warn', kind: 'budget', title: '预算将尽：' + p.name, detail: '已花 ¥' + p.cost.toFixed(2) + ' / 预算 ¥' + p.budget })
      if (p.status === 'paused' && p.cost === 0 && p.roiGoal && p.roiGoal > 0) alerts.push({ level: 'info', kind: 'idle', title: '计划停着不动：' + p.name, detail: '状态暂停' })
      if (p.belowThreshold) alerts.push({ level: 'info', kind: 'comp', title: '已达赔付线：' + p.name, detail: '可关注成本保障' })
    }
    if (staleMin !== null && staleMin > 30) alerts.push({ level: 'warn', kind: 'stale', title: '数据已过期', detail: '最近采集距今 ' + staleMin + ' 分钟，建议先跑一轮采集' })
    if (snap && snap.errors && snap.errors.length) alerts.push({ level: 'warn', kind: 'collect', title: '上轮采集有错误', detail: JSON.stringify(snap.errors).slice(0, 200) })
    const order = { high: 0, warn: 1, info: 2 }
    alerts.sort((a, b) => order[a.level] - order[b.level])
    return alerts
  }

  // ── 汇总采集 ────────────────────────────────────────────────────────────
  async function snapshot(accKey, force) {
    const state = readState()
    const accounts = resolveAccounts(state)
    const acc = accounts[accKey] || accounts[state.activeAccount] || Object.values(accounts)[0]
    const T = state.thresholds
    const errors = []

    const cred = await getCookie(acc, !!force)
    const live = cred.cookie ? await liveBoard(acc, cred.cookie).catch((e) => ({ ok: false, error: String(e && e.message) })) : { ok: false, error: '无凭证' }

    const snapRes = latestSnapshot(acc)
    let plans = [], summary = null, report = null, snap = null, ageMin = null, collectAt = null
    if (snapRes.ok) {
      snap = snapRes.snapshot; summary = snap.summary; report = snapRes.report
      ageMin = snapRes.ageMin; collectAt = snap.cycleAt
      plans = normPlans(snap)
    } else errors.push({ stage: 'snapshot', msg: snapRes.error })

    const queue = decide(plans, T, state)
    const alerts = anomalyRadar(plans, snap, ageMin)

    const running = plans.filter((p) => p.status === 'running')
    const totalCost = plans.reduce((a, p) => a + (p.cost || 0), 0)
    const totalSettle = plans.reduce((a, p) => a + (p.settle || 0), 0)
    const byKind = {}
    for (const p of plans) {
      const k = p.kind
      if (!byKind[k]) byKind[k] = { kind: k, label: p.kindLabel, plans: 0, cost: 0, settle: 0, orders: 0 }
      byKind[k].plans++; byKind[k].cost += p.cost || 0; byKind[k].settle += p.settle || 0; byKind[k].orders += p.orders || 0
    }
    for (const v of Object.values(byKind)) { v.cost = Number(v.cost.toFixed(2)); v.settle = Number(v.settle.toFixed(2)); v.roi = v.cost > 0 ? Number((v.settle / v.cost).toFixed(4)) : null }

    // 素材聚合（按计划关联；快照若带素材清单则更精确）
    const matMap = new Map()
    for (const p of plans) {
      const ids = (p.materialIds && p.materialIds.length) ? p.materialIds : (p.materialCount ? ['(计划 ' + p.name + ' 的 ' + p.materialCount + ' 条素材)'] : [])
      if (p.materialCount && !p.materialIds) {
        matMap.set('agg:' + p.id, { materialId: '—', label: p.name + ' 共 ' + p.materialCount + ' 条素材', planIds: [p.id], cost: p.cost, settle: p.settle, orders: p.orders, roi: p.roi, planCount: 1, aggregate: true })
      }
    }

    return {
      ok: true, account: { key: acc.key, label: acc.label, aavid: acc.aavid, port: acc.port }, date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }),
      at: Date.now(), credential: { ok: !!cred.cookie, via: cred.via, len: cred.cookie.length },
      collectAt, ageMin, live, report: report ? report.slice(0, 8000) : null,
      overview: {
        planCount: plans.length, running: running.length,
        cost: Number(totalCost.toFixed(2)), settle: Number(totalSettle.toFixed(2)),
        roi: totalCost > 0 ? Number((totalSettle / totalCost).toFixed(4)) : null,
        orders: plans.reduce((a, p) => a + (p.orders || 0), 0),
        target: T.roiTarget, onTarget: totalCost > 0 ? totalSettle / totalCost >= T.roiTarget : null
      },
      byKind: Object.values(byKind),
      plans, queue, alerts, thresholds: T, state: { pendingHits: state.pendingHits, actions: state.actions.slice(-50) },
      summary, errors
    }
  }

  // ── 路由 ────────────────────────────────────────────────────────────────
  const ROUTES = {
    ping: async () => ({ ok: true, at: Date.now(), accounts: Object.values(resolveAccounts(readState())).map((a) => ({ key: a.key, label: a.label, aavid: a.aavid, port: a.port })) }),
    credentials: async () => {
      const out = {}
      for (const acc of Object.values(resolveAccounts(readState()))) {
        const c = await getCookie(acc, true)
        out[acc.key] = { label: acc.label, port: acc.port, ok: !!c.cookie, via: c.via, len: c.cookie.length }
      }
      return { ok: true, accounts: out }
    },
    snapshot: async (args) => {
      const acc = String((args && args.account) || readState().activeAccount || 'hongwei')
      return await snapshot(acc, !!(args && args.force))
    },
    setAccount: async (args) => {
      const s = readState(); const k = String((args && args.account) || '')
      if (!resolveAccounts(s)[k]) return { ok: false, error: '未知账号：' + k }
      s.activeAccount = k; writeState(s); return { ok: true, state: s }
    },
    setThresholds: async (args) => {
      const s = readState(); const p = (args && args.patch) || {}
      if (typeof p.roiTarget === 'number') s.thresholds.roiTarget = p.roiTarget
      if (typeof p.minCost === 'number') s.thresholds.minCost = p.minCost
      if (typeof p.confirmRounds === 'number') s.thresholds.confirmRounds = Math.max(1, Math.min(5, p.confirmRounds))
      writeState(s); return { ok: true, state: s }
    },

    /** 读当前有效配置（内置默认 + 用户配置合并后的结果），供工作台「设置」页展示。 */
    getConfig: async () => {
      const st = readState()
      return {
        ok: true,
        activeAccount: st.activeAccount,
        thresholds: st.thresholds,
        accounts: Object.values(resolveAccounts(st)).map((a) => ({
          key: a.key, label: a.label, aavid: a.aavid, port: a.port,
          roomId: a.roomId, anchorId: a.anchorId, dataRoot: a.dataRoot,
          configured: !!(st.settings && st.settings.accounts && st.settings.accounts[a.key])
        }))
      }
    },

    /** 保存账号配置。args = { accounts: { <key>: { label/aavid/port/roomId/anchorId/dataRoot } }, activeAccount? }
     *  这是插件能给别人用的关键：不同人的账号 aavid / CDP 端口 / 采集目录都不同。 */
    setConfig: async (args) => {
      const st = readState()
      const incoming = (args && args.accounts) || {}
      st.settings = st.settings || { accountList: [], accounts: {} }
      for (const [key, patch] of Object.entries(incoming)) {
        if (!patch || typeof patch !== 'object') continue
        const next = Object.assign({}, st.settings.accounts[key] || {})
        for (const field of ['label', 'aavid', 'roomId', 'anchorId', 'dataRoot']) {
          if (typeof patch[field] === 'string') next[field] = patch[field].trim()
        }
        if (patch.port !== undefined) {
          const p = Number(patch.port)
          if (Number.isFinite(p) && p > 0 && p < 65536) next.port = p
        }
        st.settings.accounts[key] = next
      }
      st.settings.accountList = Object.keys(st.settings.accounts)
      if (typeof (args && args.activeAccount) === 'string' && st.settings.accounts[args.activeAccount]) {
        st.activeAccount = args.activeAccount
      }
      const failure = writeState(st)
      if (failure) return { ok: false, error: failure }
      return { ok: true, activeAccount: st.activeAccount, accounts: st.settings.accounts }
    },
    /** 第 5 期：AI 操作建议（本地规则引擎，逐条给建议 + 理由 + 风险） */
    advice: async (args) => {
      const _st = readState()
      const acc = resolveAccounts(_st)[String((args && args.account) || _st.activeAccount)] 
      if (!acc) return { ok: false, error: '未知账号' }
      const snapRes = latestSnapshot(acc)
      if (!snapRes.ok) return { ok: false, error: snapRes.error }
      const st = readState(); const T = st.thresholds
      const plans = normPlans(snapRes.snapshot)
      return { ok: true, generatedAt: Date.now(), target: T.roiTarget, items: plans.map((p) => {
        const r = []
        let verdict = 'keep', conf = 'medium'
        if (p.status === 'running' && p.cost > T.minCost && p.roi !== null && p.roi < T.roiTarget) { verdict = 'close'; conf = 'medium'; r.push('净ROI ' + p.roi + ' < 目标 ' + T.roiTarget + '，且已花 ¥' + p.cost.toFixed(2)) }
        else if (p.roi !== null && p.roi >= T.roiTarget * 1.5) { verdict = 'duplicate'; conf = 'high'; r.push('净ROI ' + p.roi + '，超过目标 ' + (p.roi / T.roiTarget).toFixed(1) + ' 倍') }
        else if (p.roi !== null && p.roi >= T.roiTarget) { verdict = 'keep'; conf = 'high'; r.push('净ROI ' + p.roi + ' 达标') }
        else if (p.orders === 0 && p.cost > 0) { verdict = 'watch'; conf = 'low'; r.push('有消耗无成交，样本不足') }
        if (p.budget !== null && p.budget > 0 && p.cost / p.budget > 0.9) r.push('预算即将耗尽（' + Math.round(p.cost / p.budget * 100) + '%）')
        if (p.belowThreshold) r.push('已进入成本保障区')
        return { planId: p.id, planName: p.name, kindLabel: p.kindLabel, verdict, verdictLabel: (ACTIONS[verdict] || ACTIONS.keep).label, confidence: conf, reasons: r, metrics: { cost: p.cost, roi: p.roi, orders: p.orders, budget: p.budget } }
      }) }
    }
  }

  function respond(res, status, payload) {
    const body = JSON.stringify(payload)
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' })
    res.end(body)
  }
  function readBody(req, limit) {
    return new Promise((resolve) => {
      let size = 0; const chunks = []
      req.on('data', (c) => { size += c.length; if (size > limit) { req.destroy(); resolve(''); return } chunks.push(c) })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', () => resolve(''))
    })
  }

  ctx.inject(['connection', 'webServer'], function (webCtx) {
    webCtx.effect(function () {
      return webCtx.webServer.register({
        kind: 'prefix', path: ROUTE,
        handler: async function (req, res) {
          try {
            const rejection = webCtx.connection.requestRejection(req)
            if (rejection !== undefined) { respond(res, rejection, { ok: false, error: '请求被拒绝' }); return }
            const url = new URL(req.url || '/', 'http://localhost')
            if (!url.pathname.startsWith(ROUTE + '/')) { respond(res, 404, { ok: false, error: 'not found' }); return }
            const method = decodeURIComponent(url.pathname.slice(ROUTE.length + 1))
            const fn = Object.hasOwn(ROUTES, method) ? ROUTES[method] : null
            if (typeof fn !== 'function') { respond(res, 404, { ok: false, error: 'unknown method: ' + method }); return }
            let args = {}
            if (req.method === 'POST' || req.method === 'PUT') {
              const raw = await readBody(req, 512 * 1024)
              if (raw.length > 0) { try { args = JSON.parse(raw) } catch { respond(res, 400, { ok: false, error: 'invalid JSON' }); return } }
            }
            respond(res, 200, await fn(args))
          } catch (e) { respond(res, 500, { ok: false, error: String(e && e.message || e) }) }
        }
      })
    }, 'dsh-qianchuan-workbench: Web routes')
  })

  if (!existsSync(stateFile)) writeState(readState())
}
