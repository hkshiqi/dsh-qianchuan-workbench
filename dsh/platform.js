// dsh-qianchuan-workbench — 平台 API 层（纯 HTTP，无浏览器）
//
// ★ 2026-10-12 实测结论（决定了整个架构）：
//   千川这套接口**不需要签名**（a_bogus / msToken / X-Bogus / __ac_signature 在采集器中出现 0 次），
//   浏览器唯一职责是「提供登录 Cookie」。拿到 Cookie 后即可纯 HTTP 读写。
//
// 接口契约（均在 qc_scripts 中实测确认）：
//   列表    POST /ad/api/pmc/v1/uni-promotion/ad/list-required
//   素材    POST /ad/api/pmc/v1/uni-promotion/material/list-required
//   启停删  POST /ad/api/pmc/v1/batch_update_operation   {objects:[{objectID,type:1}], optType}
//              optType: 1=启动(已暂停→投放中)  2=暂停(投放中→已暂停)  3=删除
//   改预算  POST /ad/api/pmc/v1/batch_update_budget      {ForceAsync:false, AdsData:[{AdId, AdBudget(微元)}]}
//              ⚠ 不要用 update-uni-prom-assist-task 改预算（返回「不支持修改」）
//              ⚠ 不要用 batch_update_operation + budget（sc=0 但静默不生效）
//   改ROI   POST /ad/api/pmc/v1/uni-promotion/ad/update_uni_promotion_roi
//   总预算  GET  /ad/api/pmc/v1/uni-promotion/ad/get-assist-task-total-budget  （必须 GET，POST 报 40002）

import http from 'node:http'
import https from 'node:https'

const PLATFORM = 'qianchuan.jinritemai.com'
const MICRO = 100000 // 元 → 微元
export const OPT = { START: 1, PAUSE: 2, DELETE: 3 }

const cookieCache = new Map()

// ── CDP 取 Cookie（只读，不导航、不抢焦点）─────────────────────────────
function cdpJson(port, p) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method: 'GET', timeout: 6000 }, (res) => {
      let b = ''; res.on('data', (c) => b += c)
      res.on('end', () => { try { resolve(JSON.parse(b)) } catch { resolve(null) } })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
    req.end()
  })
}

function cdpCookies(wsUrl) {
  return new Promise((resolve) => {
    const WS = globalThis.WebSocket
    if (!WS) return resolve('')
    let done = false
    const finish = (v) => { if (done) return; done = true; try { ws.close() } catch {}; resolve(v) }
    let ws
    try { ws = new WS(wsUrl) } catch { return resolve('') }
    const timer = setTimeout(() => finish(''), 12000)
    ws.onopen = () => { try { ws.send(JSON.stringify({ id: 1, method: 'Network.getAllCookies' })) } catch { finish('') } }
    ws.onmessage = (m) => {
      try {
        const j = JSON.parse(String(m.data))
        if (j.id === 1 && j.result && Array.isArray(j.result.cookies)) {
          clearTimeout(timer)
          const ck = j.result.cookies.filter((c) => /jinritemai|bytedance|douyin/.test(c.domain || ''))
          finish(ck.map((c) => c.name + '=' + c.value).join('; '))
        }
      } catch {}
    }
    ws.onerror = () => { clearTimeout(timer); finish('') }
  })
}

/** 取该账号的登录 Cookie。force=true 绕过 5 分钟缓存。 */
export async function getCookie(acc, force) {
  const now = Date.now()
  const hit = cookieCache.get(acc.key)
  if (!force && hit && now - hit.at < 5 * 60 * 1000) return hit
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
  if (result.cookie) cookieCache.set(acc.key, result)
  return result
}

// ── 纯 HTTP 调平台 ────────────────────────────────────────────────────
export function api(cookie, method, pathname, body) {
  return new Promise((resolve) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body))
    const headers = {
      Cookie: cookie,
      Origin: 'https://' + PLATFORM,
      Referer: 'https://' + PLATFORM + '/uni-prom',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9'
    }
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = data.length }
    const req = https.request({ host: PLATFORM, path: pathname, method, timeout: 30000, headers }, (res) => {
      let b = ''; res.on('data', (c) => b += c)
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b) } catch {}
        resolve({ http: res.statusCode, sc: j?.status_code, msg: j?.message, data: j?.data, text: b })
      })
    })
    req.on('error', (e) => resolve({ http: 0, sc: null, msg: 'ERR ' + e.message, data: null, text: '' }))
    req.on('timeout', () => { req.destroy(); resolve({ http: 0, sc: null, msg: 'TIMEOUT', data: null, text: '' }) })
    if (data) req.write(data)
    req.end()
  })
}

const q = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')
  .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v))).join('&')

// ── 写操作 ────────────────────────────────────────────────────────────

/** 启停删。opt: 1=启动 2=暂停 3=删除（批量） */
export async function operatePlans(cookie, aavid, ids, opt) {
  const list = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean)
  if (!list.length) return { ok: false, error: '未指定计划 ID' }
  const body = { objects: list.map((id) => ({ objectID: id, type: 1 })), optType: Number(opt) }
  const r = await api(cookie, 'POST', '/ad/api/pmc/v1/batch_update_operation?' + q({ aavid }), body)
  const results = (r.data && r.data.results) || []
  const flagFail = results.filter((x) => x && x.flag === false)
  // ★ 平台会在 sc=0 的同时用 results[].flag=false 表示实际未生效（如 errorCode 3001 母计划暂停）
  const ok = r.sc === 0 && flagFail.length === 0
  return { ok, sc: r.sc, msg: r.msg, count: list.length, results: results.slice(0, 20), failed: flagFail.slice(0, 5) }
}

/** 改日预算（元）。走 batch_update_budget，微元单位。 */
export async function setBudget(cookie, aavid, entries) {
  const arr = (Array.isArray(entries) ? entries : [entries])
    .map((e) => ({ AdId: String(e.id || e.adId || ''), AdBudget: Math.round(Number(e.yuan != null ? e.yuan : e.budget) * MICRO) }))
    .filter((e) => e.AdId && Number.isFinite(e.AdBudget) && e.AdBudget > 0)
  if (!arr.length) return { ok: false, error: '无有效预算项' }
  const r = await api(cookie, 'POST', '/ad/api/pmc/v1/batch_update_budget?' + q({ aavid }), { ForceAsync: false, AdsData: arr })
  const results = (r.data && r.data.results) || []
  // status=2 表示异步排队中，也算受理成功
  const bad = results.filter((x) => x && x.status !== undefined && x.status !== 0 && x.status !== 2)
  return { ok: r.sc === 0 && bad.length === 0, sc: r.sc, msg: r.msg, count: arr.length, results: results.slice(0, 20), bad: bad.slice(0, 5) }
}

/** 改净成交 ROI 目标（商品全域/乘方）。 */
export async function setRoi(cookie, aavid, entries) {
  const arr = (Array.isArray(entries) ? entries : [entries])
    .map((e) => ({ adId: String(e.id || e.adId || ''), roi: Number(e.roi != null ? e.roi : e.roiGoal) }))
    .filter((e) => e.adId && Number.isFinite(e.roi) && e.roi > 0)
  if (!arr.length) return { ok: false, error: '无有效 ROI 项' }
  const out = []
  for (const e of arr) {
    const r = await api(cookie, 'POST', '/ad/api/pmc/v1/uni-promotion/ad/update_uni_promotion_roi?' + q({ aavid }), { adId: e.adId, ecpRoi2Goal: e.roi })
    out.push({ id: e.adId, roi: e.roi, ok: r.sc === 0, sc: r.sc, msg: r.msg })
  }
  return { ok: out.every((x) => x.ok), count: out.length, results: out }
}

/** 追投/起量任务改预算（走 update-uni-prom-assist-task 的完整回填）。 */
export async function setAssistBudget(cookie, aavid, entries) {
  const out = []
  for (const e of (Array.isArray(entries) ? entries : [entries])) {
    const id = String(e.id || '')
    if (!id) continue
    const budget = Math.round(Number(e.yuan || 0) * MICRO)
    const body = {
      adId: id, Budget: budget,
      ...(e.name ? { Name: e.name } : {}),
      ...(e.externalAction != null ? { ExternalAction: Number(e.externalAction) } : {}),
      ...(e.deepExternalAction != null ? { DeepExternalAction: Number(e.deepExternalAction) } : {}),
      ...(e.bid != null ? { Bid: Number(e.bid) } : {}),
      ...(e.ecpRoi2Goal != null ? { EcpRoi2Goal: Number(e.ecpRoi2Goal) } : {})
    }
    const r = await api(cookie, 'POST', '/ad/api/pmc/v1/uni-promotion/ad/update-uni-prom-assist-task?' + q({ aavid }), body)
    out.push({ id, yuan: e.yuan, ok: r.sc === 0, sc: r.sc, msg: r.msg })
  }
  return { ok: out.every((x) => x.ok), count: out.length, results: out }
}

// ── 读操作 ────────────────────────────────────────────────────────────

/** 素材列表（按计划）。返回每条素材的 id / 消耗 / 状态。 */
export async function listMaterials(cookie, aavid, adId, opts) {
  const o = opts || {}
  const bj = new Date(Date.now() + 8 * 3600e3)
  const today = bj.toISOString().slice(0, 10)
  const start = new Date(bj.getTime() - (o.days || 7) * 86400e3).toISOString().slice(0, 10)
  const body = {
    DataSetKey: o.ds || 'overall_roi_promotion_matrial_tab_video_product',
    Metrics: ['stat_cost_for_roi2'],
    Filters: {
      ConditionRelationshipType: 1,
      Conditions: [
        { Field: 'query_type', Operator: 7, Values: ['all'] },
        { Field: 'roi2_material_type_v3', Operator: 7, Values: [String(o.materialType || '1001')] },
        { Field: 'marketing_goal', Operator: 7, Values: [String(o.marGoal || '1')] },
        { Field: 'roi2_material_status', Operator: 7, Values: [String(o.status || '1')] },
        ...(adId ? [{ Field: 'ad_id', Operator: 7, Values: [String(adId)] }] : []),
        { Field: 'roi2_material_video_type', Operator: 7, Values: [String(o.videoType || '11')] }
      ]
    },
    StartTime: start + ' 00:00:00',
    EndTime: today + ' 23:59:59',
    PageParams: { Limit: Number(o.limit || 50), Offset: Number(o.offset || 0) },
    OrderBy: [{ Type: 2, Field: 'stat_cost_for_roi2' }],
    Dimensions: ['material_id'],
    reqFrom: 'uni-prom-creative-tab-list'
  }
  const r = await api(cookie, 'POST', '/ad/api/pmc/v1/uni-promotion/material/list-required?' + q({ reqFrom: 'uni-prom-creative-tab-list', aavid }), body)
  const rows = (r.data && r.data.statsData && r.data.statsData.rows) || []
  const mids = rows.map((x) => String((x.dimensions && x.dimensions.materialId && (x.dimensions.materialId.value || x.dimensions.materialId.ValueStr)) || ''))
  // 可选模块（素材标题/封面）需二次请求
  let meta = []
  const sid = r.data && r.data.sessionId
  if (sid) {
    const ro = await api(cookie, 'POST', '/ad/api/pmc/v1/uni-promotion/material/list-optional?' + q({ aavid }), {
      _origin_ajax_: 1, SessionID: sid,
      ListAdsModules: [10, 4, 20, 36, 7, 8, 53],
      aavid
    })
    meta = (ro.data && ro.data.materialInfos) || (ro.data && ro.data.adInfos) || []
  }
  return { ok: r.sc === 0, sc: r.sc, msg: r.msg, count: mids.length, ids: mids, rows, meta, sessionId: sid || null }
}

/** 计划操作日志（平台侧权威痕迹）。 */
export async function planOptLog(cookie, aavid, adId, opts) {
  const o = opts || {}
  const bj = new Date(Date.now() + 8 * 3600e3)
  const today = bj.toISOString().slice(0, 10)
  const start = new Date(bj.getTime() - (o.days || 3) * 86400e3).toISOString().slice(0, 10)
  const r = await api(cookie, 'GET', '/ad/api/pmc/v1/ad/get_opt_log?' + q({
    objectID: adId, startTime: start + ' 00:00:00', endTime: today + ' 23:59:59',
    currentPage: 1, pageSize: Number(o.limit || 50), type: 1, aavid
  }))
  const logs = (r.data && r.data.logs) || []
  return { ok: r.sc === 0, sc: r.sc, count: logs.length, logs }
}

// ── 上下级联动：把扁平计划组装成树 ────────────────────────────────────
/**
 * 层级来源（实测字段）：
 *   基础计划  = snapshot.product / plans（无 primaryAID）
 *   子级      = primaryAID 指向某个基础计划的 id
 *      · scene=1 → 一键起量
 *      · scene=2 → 素材追投
 * 直播间侧同理（regulation / plansDeleted 里的行带 primaryAID）。
 */
export function buildTree(snap, kindGroup) {
  const rows = []
  const push = (arr, side) => {
    for (const r of (arr || [])) {
      if (!r || !r.id) continue
      rows.push({
        id: String(r.id), name: r.name, status: r.status, cost: r.cost, netRoi: r.netRoi,
        netSettle: r.netSettle, orders: r.orders, payGmv: r.payGmv, budgetYuan: r.budgetYuan,
        roiGoal: r.roiGoal, scene: r.scene, primaryAID: r.primaryAID ? String(r.primaryAID) : null,
        primaryName: r.primaryName || null, deleted: !!r.deleted, srcMode: r.srcMode, side,
        face: r.face, adlabScene: r.adlabScene, bid: r.bid, smartBidType: r.smartBidType,
        deepExternalAction: r.deepExternalAction, createTime: r.createTime
      })
    }
  }
  // 基础层
  for (const k of (kindGroup && kindGroup.base) || ['product', 'plans']) push(snap[k], 'base')
  // 子层
  for (const k of (kindGroup && kindGroup.child) || ['productChase', 'productOnekeyRows', 'regulation', 'regulationDeleted', 'plansDeleted']) push(snap[k], 'child')

  const byId = new Map()
  for (const r of rows) if (!byId.has(r.id)) byId.set(r.id, r)

  const CHILD_LABEL = (r) => {
    if (r.side === 'base') return '基础'
    if (Number(r.scene) === 1) return '起量'
    if (Number(r.scene) === 2) return '追投'
    return '调控'
  }

  const children = new Map()
  for (const r of rows) {
    if (r.side === 'base') continue
    const pid = r.primaryAID
    if (!pid) continue
    if (!children.has(pid)) children.set(pid, [])
    children.get(pid).push(r)
  }

  const nodes = []
  for (const r of rows) {
    if (r.side !== 'base') continue
    const kids = children.get(r.id) || []
    const cost = Number(r.cost || 0)
    const childCost = kids.reduce((s, k) => s + Number(k.cost || 0), 0)
    nodes.push({
      ...r, kind: CHILD_LABEL(r),
      childCount: kids.length,
      childCost: +childCost.toFixed(2),
      // 汇总消耗 = 基础自身 + 全部子级（子级消耗是独立投放，不是基础的一部分）
      totalCost: +(cost + childCost).toFixed(2),
      children: kids.map((k) => ({ ...k, kind: CHILD_LABEL(k) }))
    })
  }
  // 无父级的子计划（父已消失）单独列出，避免丢数据
  const orphans = rows.filter((r) => r.side === 'child' && (!r.primaryAID || !byId.has(r.primaryAID)))
  const groups = { base: 0, 起量: 0, 追投: 0, 调控: 0 }
  for (const r of rows) { const k = CHILD_LABEL(r); if (k in groups) groups[k]++; }
  return { nodes, orphans, groups, total: rows.length }
}

export { PLATFORM, MICRO }
