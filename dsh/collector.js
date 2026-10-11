#!/usr/bin/env node
/**
 * 千川 15 分钟采集复盘 — 单轮采集器（api-only，全只读）
 *
 * 设计原则：跑一轮就退出，不做常驻循环。调度交给 Windows 计划任务。
 *
 * 采集面（按顺序）：
 *   1. 直播大屏（正确 anchor_id）
 *   2. 主全域计划（aggregate + base 双口径）
 *   3. 调控面（追投 sc2 普通/整体、一键起量 sc1 普通/整体，按 id 去重）
 *   4. 商品面（AdlabScene=1 / AdlabScene=0 / 全店托管；每面 required→optional 成对取赔付）
 *   5. 品牌竞价（只读观察）
 *
 * 时段：--product-only 时跳过直播大屏与调控（00:00-06:00 直播未开播）
 *
 * 用法:
 *   node qc_scripts/qc_cycle_15min.mjs --out <目录> [--date YYYY-MM-DD] [--port 9222] [--product-only]
 */
import { createRequire } from "module";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * ★ 2026-10-12 由 qc_cycle_15min.mjs 整体移植进插件（2100+ 行业务逻辑逐字保留）。
 *
 * 关键发现：本采集链路**从不使用签名**（a_bogus / msToken / X-Bogus / __ac_signature 在源码中均 0 次），
 * 原实现里 7 处 page.evaluate 只做一件事——「带着登录 Cookie 发 fetch」。
 * 因此用一个 Node 侧 page 垫片顶替 playwright，浏览器只保留一个职责：提供 Cookie（O.cookie）。
 */
export function createCollector(OPTS) {
const O = OPTS || {};
const __base = "https://qianchuan.jinritemai.com";
const __ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";
const __cookie = String(O.cookie || "");
const __realFetch = globalThis.fetch;
const __nodeFetch = async (input, init) => {
  init = init || {};
  let url = typeof input === "string" ? input : String((input && input.url) || input);
  if (url.startsWith("/")) url = __base + url;
  const headers = Object.assign({}, init.headers || {});
  headers.cookie = __cookie;
  headers["user-agent"] = __ua;
  const opt = { method: init.method || "GET", headers };
  if (init.body !== undefined) { if (!headers["content-type"]) headers["content-type"] = "application/json"; opt.body = init.body; }
  const r = await __realFetch(url, opt);
  const text = await r.text();
  return { status: r.status, ok: r.status >= 200 && r.status < 300, text: async () => text };
};
const __page = {
  url: () => __base + "/uni-prom",
  evaluate: async (fn, a) => {
    const prev = globalThis.fetch; globalThis.fetch = __nodeFetch;
    try { return await fn(a); } finally { globalThis.fetch = prev; }
  },
};

function arg(name, def = "") {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def;
}
const flag = (name) => process.argv.includes(name);

const AAVID = String(O.aavid || arg("--aavid", "1855810750424170"));
const ADID = String(O.adid || arg("--adid", "1856283025550586"));
const PORT = String(O.port || arg("--port", "9222"));
/**
 * ★ 时段自动判断（2026-09-26 新增）
 *
 * 背景：新版自动化插件（@michengai/dsh-automation）的 schedule 只支持
 * hourly+单分钟，**无法表达 cron 的 「每15分钟 + 小时范围」**（如 6-23 时段）。
 * 因此改为：任务全天每 15 分钟触发一次，由脚本自身按下达时的**北京时间**决定采集范围。
 *
 * 规则（与旧的两条 cron 任务完全等价）：
 *   06:00–23:59  → 全套（直播大屏 + 主全域 + 调控 + 商品 + 品牌）
 *   00:00–05:59  → 仅商品（直播未开播，跳过直播大屏/调控/品牌）
 *
 * 覆盖开关：
 *   --product-only  强制仅商品（凌晨任务原语义，保留兼容）
 *   --full          强制全套（直播时段任务原语义，保留兼容）
 *   两者都不传      → 按北京时间自动选择（新默认）
 */
const FORCE_PRODUCT_ONLY = flag("--product-only");
const FORCE_FULL = flag("--full");
/** 北京时间小时（0-23），独立于系统时区 */
const BJ_HOUR = Number(
  new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", hour: "2-digit", hour12: false })
    .format(new Date())
);
/** 直播时段：06:00–23:59；凌晨 00:00–05:59 只采商品 */
const IS_LIVE_HOURS = BJ_HOUR >= 6;
const PRODUCT_ONLY = FORCE_PRODUCT_ONLY || (!FORCE_FULL && !IS_LIVE_HOURS);
/**
 * ★ 保障期轮换（2026-09-24 用户要求：加入复盘动作）
 *   默认**开启**：复盘时自动检查追投计划保障期（T+0/T+1），
 *   已过期（当天 > T+1）的自动「复制新的 + 删除老的」。
 *   用 --no-rotate 关闭（例如只想只读采集时）。
 */
const ROTATE = !flag("--no-rotate");
/**
 * ★ 追投加预算（2026-09-24 用户要求：加入复盘动作）
 *   规则：净成交ROI ≥ 1.85 且 日预算撑不过未来 2 小时 → 按「前2h消耗」加预算。
 *   默认**开启**；用 --no-budget 关闭。
 *   ⚠ 实测提醒：追投预算 ¥500/¥3000 而 2 小时仅花几十元，
 *     「剩余 < 前2h消耗」极难成立 → 多数轮次会报「命中 0 条」。
 *     阈值经用户 2026-09-24 确认保留，不作调整。
 */
const BUDGET = !flag("--no-budget");
/**
 * ★★ 2026-10-01 用户要求：**停止直播间与商品的一键起量计划，并移除所有关于一键起量计划的任务**。
 *
 *   ⇒ 下列 4 个「一键起量类」复盘动作**全部硬关闭**，不再随 15 分钟轮次执行：
 *      ① 一键起量低效替换（直播间）  —— 曾：消耗>¥30 且 净ROI<2 → 删旧建新
 *      ② 一键起量加预算（直播间）    —— 曾：净ROI≥2 且 预算撑不过2h → 加预算
 *      ③ 商品一键起量（建/删/重建）  —— 曾：给所有商品计划配起量，门槛 ≥2.2
 *      ④ 商品一键起量加预算          —— 曾：净ROI≥2 且 预算撑不过2h → 加预算
 *
 *   ★ **采集侧不受影响**：调控面 / 商品面的一键起量数据照常采集（含「已删除」口径），
 *     看板与复盘报告里的一键起量板块、消耗与赔付口径**全部保持原样**。
 *   ★ 追投（保障期轮换、追投加预算）与商品素材追投采集**不受影响**。
 *   ☆ 如需临时恢复（改打法后再启用），**不要改本文件**——用环境变量
 *     `QC_ENABLE_ONEKEY_ACTIONS=1` 启动即可恢复原行为；`--no-onekey` 等旧开关仍然有效。
 */
const ONEKEY_ACTIONS_ENABLED = process.env.QC_ENABLE_ONEKEY_ACTIONS === "1";
/** 停用态在产物/报告里的如实文案（避免被误读成「本轮碰巧无命中」） */
const ONEKEY_OFF_REASON = "一键起量动作已停用（2026-10-01 用户要求）";
/**
 * ★ 一键起量低效替换（2026-09-27 上线；2026-10-01 用户要求停用）
 *   规则：**消耗 > ¥30 且 净ROI < 2** → 停止该一键起量计划，并新建一条。
 *   ★ 平台硬约束：同一时刻只允许存在一条一键起量 ⇒ 必须「先停旧的、再建新的」。
 *   ★ 现状：**默认关闭**（受 ONEKEY_ACTIONS_ENABLED 总闸控制）。
 */
const ONEKEY = ONEKEY_ACTIONS_ENABLED && !flag("--no-onekey");
/**
 * ★ 一键起量加预算（2026-09-27 上线；2026-10-01 用户要求停用）
 *   规则：**净投产(净ROI) ≥ 2 且 (日预算 − 当日累计消耗) < 前 2 小时消耗** → 加预算 = 前2h消耗。
 *   三重护栏与追投加预算同套（冷却60min / 单日≤原预算×2 / 总池上限；单轮≤¥3000；06:00–24:00）。
 *   ★ 现状：**默认关闭**（受 ONEKEY_ACTIONS_ENABLED 总闸控制）。
 */
const ONEKEY_BUDGET = ONEKEY_ACTIONS_ENABLED && !flag("--no-onekey-budget");
/**
 * ★ 商品计划一键起量（2026-09-28 上线；2026-10-01 用户要求停用）
 *   曾：给所有商品计划配「直播间同款」一键起量，投产门槛 **≥ 2.2**，24 小时不分时段。
 *   ★ 现状：**默认关闭**（受 ONEKEY_ACTIONS_ENABLED 总闸控制）。
 *     ⇒ 采集脚本不再自动**新建**任何商品起量任务。
 */
const PRODUCT_ONEKEY = ONEKEY_ACTIONS_ENABLED && !flag("--no-product-onekey");
/**
 * ★ 商品一键起量加预算（2026-10-01 新增；同日用户要求停用）
 *   曾：净ROI ≥ 2 且 (预算−消耗) < 前2h消耗 → 加前2h消耗（商品侧无总池上限）。
 *   ★ 现状：**默认关闭**（受 ONEKEY_ACTIONS_ENABLED 总闸控制）。
 */
const PRODUCT_ONEKEY_BUDGET = PRODUCT_ONEKEY && !flag("--no-product-onekey-budget");
const DATE = arg("--date", new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }));
const ROOM_ID_DEFAULT = String(O.roomId || arg("--room-id", "7687369518070418226"));
const ANCHOR_ID = String(O.anchorId || arg("--anchor-id", "45525620241147")); // 内部 id，非 shortId

/**
 * 项目根定位（不依赖 cwd！）
 * ★ 踩坑：计划任务/不同 shell 的 cwd 可能是子目录（如 ...\千川项目\红卫），
 *   用 process.cwd() 会让相对路径全部解析错位。
 *   改为从本脚本位置向上找：脚本在 <root>/qc_scripts/xxx.mjs → root 是其父目录。
 */
const ROOT = O.root ? path.resolve(String(O.root)) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 输出目录：未传 --out 时按真实北京时间自动生成 <root>/qc_data_cycle15_<YYYYMMDD_HHmm>。
 * 这样 dsh-cron 的 node 类型任务可以直接调用本脚本，不必依赖 prompt 变量插值
 * （script/node 类型的 prompt 不做 {{date}} 插值）。
 */
let OUT = arg("--out", "");
if (!OUT) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  OUT = path.join(ROOT, `qc_data_cycle15_${stamp}`);
}

const T0 = `${DATE} 00:00:00`;
const T1 = `${DATE} 23:59:59`;

const startedAt = Date.now();

/* playwright 引导已移除：Cookie 由插件 host 提供 */

const log = (m) => console.log(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ${m}`);

/** 商品面指标：**不带 stat_cost**（带了会清空 adStatsMap 与 adDimensionsMap） */
const PRODUCT_METRICS = [
  "stat_cost_for_roi2", "stat_cost_for_roi2_primary",
  "total_prepay_and_pay_settle_overall_roi2_1h", "total_prepay_and_pay_settle_overall_roi2_1h_primary",
  "total_pay_order_gmv_include_coupon_for_roi2", "total_pay_order_gmv_include_coupon_for_roi2_primary",
  "total_order_settle_amount_for_roi2_1h", "total_order_settle_amount_for_roi2_1h_primary",
  "total_pay_order_count_for_roi2", "total_pay_order_count_for_roi2_primary",
  "total_order_settle_count_for_roi2_1h", "total_order_settle_count_for_roi2_1h_primary",
  "total_order_real_settle_amount_for_roi2_1h", "total_order_real_settle_amount_for_roi2_1h_primary",
  "total_refund_order_gmv_for_roi2_1h_rate", "total_refund_order_gmv_for_roi2_1h_rate_primary",
  "total_order_settle_amount_rate_for_roi2_1h", "total_order_settle_amount_rate_for_roi2_1h_primary",
  "total_pay_order_gmv_for_roi2", "total_pay_order_gmv_for_roi2_primary",
  "total_order_settle_amount_for_roi2_7d", "total_order_settle_amount_for_roi2_7d_primary",
  "stat_cost_for_overall_roi2", "stat_cost_for_overall_roi2_primary",
  "total_cost_per_pay_order_settle_for_overall_roi2_1h", "total_cost_per_pay_order_settle_for_overall_roi2_1h_primary",
  "total_cost_per_pay_order_for_roi2", "total_cost_per_pay_order_for_roi2_primary",
];

/** 直播/调控面指标：可带 stat_cost */
const LIVE_METRICS = [
  "stat_cost", "stat_cost_for_roi2_primary", "stat_cost_for_overall_roi2", "stat_cost_for_overall_roi2_primary",
  "total_prepay_and_pay_settle_overall_roi2_1h", "total_prepay_and_pay_settle_overall_roi2_1h_primary",
  "total_order_settle_amount_for_roi2_1h", "total_order_settle_amount_for_roi2_1h_primary",
  "total_order_settle_count_for_roi2_1h", "total_order_settle_count_for_roi2_1h_primary",
  "total_order_real_settle_amount_for_roi2_1h", "total_order_real_settle_amount_for_roi2_1h_primary",
  "total_refund_order_gmv_for_roi2_1h_rate", "total_refund_order_gmv_for_roi2_1h_rate_primary",
  "total_order_settle_amount_rate_for_roi2_1h", "total_order_settle_amount_rate_for_roi2_1h_primary",
  "total_pay_order_count_for_roi2", "total_pay_order_count_for_roi2_primary",
  "total_pay_order_gmv_include_coupon_for_roi2", "total_pay_order_gmv_include_coupon_for_roi2_primary",
  "total_pay_order_gmv_for_roi2", "total_pay_order_gmv_for_roi2_primary",
  "total_order_settle_amount_for_roi2_7d", "total_order_settle_amount_for_roi2_7d_primary",
  "total_cost_per_pay_order_settle_for_overall_roi2_1h", "total_cost_per_pay_order_settle_for_overall_roi2_1h_primary",
];

const ASSIST_METRICS_CHASE = [
  "stat_cost_for_roi2_assist", "total_prepay_and_pay_order_roi2_assist",
  "total_prepay_and_pay_settle_roi2_1h_assist", "total_pay_order_count_for_roi2_assist",
  "total_cost_per_pay_order_for_roi2_assist", "ctr_for_roi2_assist",
  "convert_rate_for_roi2_assist", "show_cnt_for_roi2_assist", "click_cnt_for_roi2_assist",
  "total_pay_order_gmv_include_coupon_for_roi2_assist", "total_pay_order_gmv_for_roi2_assist",
  "total_pay_order_coupon_amount_for_roi2_assist", "pay_convert_cost_for_roi2_assist",
  "pay_convert_cnt_for_roi2_assist", "total_order_settle_amount_for_roi2_1h_assist",
  "total_refund_order_gmv_for_roi2_1h_rate_assist",
];
const ASSIST_METRICS_ONEKEY = [
  "stat_cost_for_roi2_assist", "total_prepay_and_pay_order_roi2_assist",
  "total_prepay_and_pay_settle_roi2_1h_assist", "total_pay_order_count_for_roi2_assist",
  "total_cost_per_pay_order_for_roi2_assist", "ctr_for_roi2_assist",
  "convert_rate_for_roi2_assist", "show_cnt_for_roi2_assist", "click_cnt_for_roi2_assist",
  "total_pay_order_gmv_include_coupon_for_roi2_assist", "total_pay_order_gmv_for_roi2_assist",
  "total_pay_order_coupon_amount_for_roi2_assist", "total_order_settle_amount_for_roi2_1h_assist",
  "total_refund_order_gmv_for_roi2_1h_rate_assist",
];

/** 赔付字段所在模块（实测可返回 compensateStatusInfo） */
const OPTIONAL_MODULES = [22, 29, 34, 50, 9, 7, 8, 16, 14, 17, 25, 26, 38, 40, 42, 43, 37, 41, 55, 52, 30, 21, 36];

const num = (v) => {
  if (v == null) return null;
  const raw = typeof v === "object" ? (v.valueStr ?? v.value ?? v.ValueStr ?? v.Value) : v;
  const s = String(raw ?? "").replace(/,/g, "").replace(/%/g, "").trim();
  if (s === "" || s === "-" || s === "--") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * 素材追投 / 一键起量的赔付判定。
 *
 * ★★ 赔付触发只有两条线，分属两种出价方式，各管各的，**没有"临界带"一说**
 *    （2026-09-23 用户口径纠正，此前误设的"临界/不确定带"概念已作废）：
 *
 *   A) ROI 出价（`roiGoal` 有值，即 ecpRoi2Goal 非空）
 *      触发条件 = 实际净ROI < 目标ROI × 80%      ← 低于 80% 即达标赔付线
 *      赔付     = max(0, 消耗 − 净成交 ÷ 目标ROI)
 *
 *   B) 成交出价（无 ROI 目标，以目标出价 bid 竞价）
 *      触发条件 = 实际订单成本 > 目标出价 × 1.2  ← 超 1.2 倍即达标赔付线
 *      实际订单成本 = 消耗 ÷ 成交订单数
 *      赔付     = max(0, 消耗 − 成交单数 × 目标出价)
 *
 *   两条线是**同一层级**的触发线，只是对应不同出价方式；
 *   不存在"目标÷1.2"这种把 B 线套到 A 口径上的中间带。
 *
 *   C) 一键起量（scene=1）→ **不支持成本保障**（RTK 9.8.1 第 4 条：
 *      使用"一键起量"的预算不支持成本保障，其订单数也不计入保障门槛），
 *      故一律不计赔付，标 caliber="unsupported"，界面不得当作可获赔。
 *
 *   D) 以上都不成立（信息不足）→ 不猜，返回 caliber="unknown"。
 *
 * ★ 保障期（RTK 第5节）：素材追投固定 T+0、T+1 两个自然日。
 *   当天 > T+1 即已过期，该计划进入轮换候选（这与"赔付金额"是两件事）。
 *
 * ★ 纪律：只有当**确实触发**时，才把金额视为可能获赔；
 *   未触发时只给公式残值，标记 triggered=false，界面不得当作可获赔。
 */
function computeChaseComp(row) {
  const cost = row.cost, net = row.netSettle, orders = row.orders || 0;
  const goal = row.roiGoal, bid = row.bid;
  const out = { compCaliber: null, compTriggered: null, compLine: null,
                compensationEstimate: null, roiWithCompensation: null,
                actualUnitCost: null, guaranteeLeftDays: null, guaranteeExpired: null };

  // ★ 一键起量不支持成本保障（RTK 9.8.1 第4条）：先把保障期算出来供轮换参考，
  //   但赔付口径直接定为 unsupported，不给任何可获赔金额。
  const isOnekey = Number(row.scene) === 1;

  if (cost == null) return out;

  // 保障期剩余（T+0/T+1）
  if (row.createTime) {
    const created = new Date(Number(row.createTime) * 1000);
    const t1 = new Date(created.getTime() + 86400000);          // T+1
    const now = new Date();
    const d0 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const d1 = Date.UTC(t1.getFullYear(), t1.getMonth(), t1.getDate());
    out.guaranteeLeftDays = Math.floor((d1 - d0) / 86400000);   // 剩余自然日
    out.guaranteeExpired = out.guaranteeLeftDays < 0;
  }

  if (orders > 0) out.actualUnitCost = +(cost / orders).toFixed(2);

  // C) 一键起量：不支持成本保障（RTK 9.8.1 第4条）→ 恒不计赔付。
  //    仍保留保障期字段供「保障临期轮换」参考，但口径明确标 unsupported。
  if (isOnekey) {
    out.compCaliber = "unsupported";
    out.compTriggered = false;
    out.compensationEstimate = 0;
    out.compFormulaValue = 0;
    out.roiWithCompensation = null;
    return out;
  }

  // A) ROI 出价型：实际净ROI < 目标ROI × 80% 即触发（单一触发线，无临界带）
  if (goal && goal > 0 && net != null) {
    const comp = Math.max(0, cost - net / goal);
    const triggerLine = goal * 0.8;
    const roi = cost > 0 ? net / cost : null;
    out.compCaliber = "roi";
    out.compLine = +triggerLine.toFixed(3);
    out.compTriggered = roi != null ? roi < triggerLine : null;
    // 只在确实触发时才把金额视为「可能获赔」
    out.compensationEstimate = out.compTriggered ? +comp.toFixed(2) : 0;
    out.compFormulaValue = +comp.toFixed(2);   // 公式值（含未触发时的残值）
    out.roiWithCompensation = out.compTriggered
      ? +(net / Math.max(1, cost - comp)).toFixed(4) : null;
    return out;
  }

  // B) 成交出价型：实际订单成本 > 目标出价 × 1.2 即触发（单一触发线，无临界带）
  if (bid && bid > 0) {
    const line = bid * 1.2;
    const comp = Math.max(0, cost - orders * bid);
    out.compCaliber = "cost";
    out.compLine = +line.toFixed(2);
    out.compTriggered = out.actualUnitCost != null ? out.actualUnitCost > line : null;
    out.compensationEstimate = out.compTriggered ? +comp.toFixed(2) : 0;
    out.compFormulaValue = +comp.toFixed(2);
    out.roiWithCompensation = (out.compTriggered && cost - comp > 0 && net != null)
      ? +(net / Math.max(1, cost - comp)).toFixed(4) : null;
    return out;
  }

  out.compCaliber = "unknown";
  return out;
}

/**
 * 主全域（推直播间）赔付判定。
 *
 * ★ 口径选择（2026-09-23 用户指定）：**只按 base（基座）口径算，不按 aggregate**。
 *   理由是防止重复计入：aggregate 已把调控（追投/一键起量）消耗并入，而调控赔付
 *   由 computeChaseComp 按计划单独统计。若主全域用 aggregate 再算一次赔付，
 *   调控那部分会被算进「全局可获赔」两次，口径就脏了。
 *   base 是 aggregate 的子集（纯主计划、不含调控），与调控单列的口径天然不重叠。
 *   —— 这与 import_cycle_snapshot.py 把 base 落成独立 plan 行（metricScope="base"）
 *      的做法一致。
 *
 * ★★ 触发判定只有一条线，按**出价方式**二选一（2026-09-23 用户口径纠正：
 *    此前"目标÷1.2 临界带 + compCritical"的概念是错的，已整概念删除）：
 *      A) ROI 出价：实际净ROI < 目标ROI × 80%  → 触发
 *      B) 成交出价：实际订单成本 > 目标出价 × 1.2 → 触发
 *    两条线是同一层级的触发线，对应不同出价方式，**不存在中间"临界带"**。
 *
 * ★ 推直播间**没有**「当日转化订单 ≥10」门槛，那条只约束推商品（RTK 9.8.1），
 *   故此处触发判定只看线，不附加订单条件。
 *
 * ★ 与商品/调控同一纪律：只有当确实触发时才把金额视为「可能获赔」；
 *   未触发时只给公式残值，标 triggered=false，界面不得当作可获赔。
 *
 * @param scope { cost, netSettle } 取值口径（本项目固定传 base）
 * @param roiGoal 目标ROI（ROI 出价型时有值）
 * @param orders  成交订单数（成交出价型算订单成本用）
 * @param bid     目标出价（成交出价型时有值）
 */
function computeMainLiveComp(scope, roiGoal, orders = null, bid = null) {
  const out = {
    compCaliber: "base",      // 取值口径：固定 base（基座），供下游识别
    compBidType: null,        // 出价方式：roi | cost | unknown（与 compCaliber 是两件事）
    compTriggered: null, compLine: null,
    compensationEstimate: null, compFormulaValue: null,
    roiWithCompensation: null, roi: null, actualUnitCost: null,
  };
  if (!scope) { out.compCaliber = null; return out; }
  const cost = scope.cost, net = scope.netSettle;
  if (cost == null || cost <= 0) return out;

  const roi = net != null ? net / cost : null;
  out.roi = roi != null ? +roi.toFixed(4) : null;
  const ords = Number(orders) || 0;
  if (ords > 0) out.actualUnitCost = +(cost / ords).toFixed(2);

  // A) ROI 出价型：实际净ROI < 目标ROI × 80% 即触发（单一触发线）
  if (roiGoal && roiGoal > 0 && net != null) {
    const comp = Math.max(0, cost - net / roiGoal);
    const line = roiGoal * 0.8;
    out.compBidType = "roi";
    out.compLine = +line.toFixed(4);
    out.compTriggered = roi < line;
    out.compensationEstimate = out.compTriggered ? +comp.toFixed(2) : 0;
    out.compFormulaValue = +comp.toFixed(2);
    out.roiWithCompensation = out.compTriggered
      ? +(net / Math.max(1, cost - comp)).toFixed(4) : null;
    return out;
  }

  // B) 成交出价型：实际订单成本 > 目标出价 × 1.2 即触发（单一触发线）
  if (bid && bid > 0) {
    const line = bid * 1.2;
    const comp = Math.max(0, cost - ords * bid);
    out.compBidType = "cost";
    out.compLine = +line.toFixed(2);
    out.compTriggered = out.actualUnitCost != null ? out.actualUnitCost > line : null;
    out.compensationEstimate = out.compTriggered ? +comp.toFixed(2) : 0;
    out.compFormulaValue = +comp.toFixed(2);
    out.roiWithCompensation = (out.compTriggered && cost - comp > 0 && net != null)
      ? +(net / Math.max(1, cost - comp)).toFixed(4) : null;
    return out;
  }

  // C) 信息不足：不猜
  out.compBidType = "unknown";
  return out;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const captures = [];
  const errors = [];
  const snapshot = {
    cycleAt: new Date().toISOString(),
    date: DATE, aavid: AAVID, adId: ADID, apiOnly: true, readOnly: true,
    productOnly: PRODUCT_ONLY,
    /** ★ 模式来源（便于排查调度判断）：auto=按北京时间自动 / forced=命令行强制 */
    modeSource: FORCE_FULL ? "forced-full" : FORCE_PRODUCT_ONLY ? "forced-product-only" : "auto",
    bjHour: BJ_HOUR,
    // ★ 默认空数组：--product-only 时跳过直播大屏/调控/品牌面，
    //   这些字段不会被赋值，若保持 undefined 会在 summary 汇总处
    //   直接抛 "Cannot read properties of undefined (reading 'reduce')"。
    faces: {}, plans: [], summary: null, errors: [],
    regulation: [], brand: [], product: [],
  };

  try {
    const boardPage = O.boardPage || null;
    const page = __page;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    /** 统一 POST：内置 3 次重试（平台有间歇性 status_code=2） */
    const post = async (label, pathname, body, retries = 3) => {
      const ep = `${pathname}?aavid=${encodeURIComponent(AAVID)}`;
      let resp, parsed;
      for (let a = 1; a <= retries; a++) {
        try {
          resp = await page.evaluate(async ({ ep, b }) => {
            const r = await fetch(ep, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
            return { status: r.status, text: await r.text() };
          }, { ep, b: body });
        } catch (e) {
          resp = { status: 0, text: String(e?.message || e) };
        }
        try { parsed = JSON.parse(resp.text); } catch { parsed = null; }
        if (parsed && parsed.status_code !== 2) break;
        if (a < retries) await sleep(1200 * a);
      }
      captures.push({ label, url: pathname, method: "POST", postData: JSON.stringify(body), status: resp.status, resp: resp.text, apiOnly: true });
      if (!parsed || parsed.status_code !== 0) {
        errors.push({ label, statusCode: parsed?.status_code ?? null, message: parsed?.message ?? resp.text?.slice(0, 200), httpStatus: resp.status });
      }
      return parsed;
    };

    const listAll = async (label, bodyForPage, pathname = "/ad/api/pmc/v1/uni-promotion/ad/list-required") => {
      const first = await post(`${label}#p1`, pathname, bodyForPage(1));
      const infos = [...((first?.data?.adInfos) || [])];
      const pg = first?.data?.pagination || {};
      const totalPage = Number(pg.totalPage || 1);
      let pagesFetched = 1;
      const failedPages = [];
      const pagesData = [first?.data];
      for (let p = 2; p <= Math.min(totalPage, 50); p++) {
        const r = await post(`${label}#p${p}`, pathname, bodyForPage(p));
        const got = (r?.data?.adInfos) || [];
        if (!got.length) { failedPages.push(p); continue; }
        infos.push(...got);
        pagesData.push(r?.data);
        pagesFetched++;
      }
      const map = new Map();
      for (const i of infos) if (i?.id) map.set(String(i.id), i);
      const statsMap = {};
      for (const p of [first]) Object.assign(statsMap, p?.data?.adStatsMap || {});
      // ★ 素材归属映射也一并收上来：看板「复制」需要知道素材数，
      //   且它是判断追投任务素材是否齐全的唯一来源。
      //   注意 pagesData 里存的已经是 data 对象本身，不要再取一次 .data。
      const matMap = {};
      for (const p of pagesData) Object.assign(matMap, p?.assistTaskMaterialInfoMap || {});
      return {
        label, totalPage, totalNum: pg.totalNum != null ? Number(pg.totalNum) : null,
        pagesFetched, failedPages, complete: pagesFetched >= totalPage,
        adInfos: [...map.values()], adStatsMap: statsMap, materialInfoMap: matMap,
        sessionId: first?.data?.sessionId || null,
      };
    };

    /**
     * ★★ 并发批量请求（2026-10-10 提速，用户要求「搞成多并发缩短任务时间」）
     *
     * 为什么快：原实现是「Node 逐条 await page.evaluate(...)」——每次都有一次
     *   Node↔CDP 往返，再叠加 await sleep(300)，300 个请求就要 3 分钟以上。
     *   这里把**一整批请求塞进同一个 page.evaluate**，由浏览器内部用 Promise.all
     *   并发发出，CDP 往返从 300 次降到「批次数」次。
     *
     * 口径与安全：
     *   · 并发上限 default 6 —— 浏览器对同源连接池约 6 条，再高只是排队；
     *     同时避免过高并发触发平台限流。
     *   · 每批之间 sleep(batchGapMs)，模拟人类节奏、降低被限流概率。
     *   · 与 post() 一致的语义：status_code===2（平台间歇性）会退避后**再并发重试一轮**；
     *     最终仍失败的条目逐条回落到 post()（带 3 次退避重试）。
     *   · 结果按**入参顺序**返回，保证调用方按索引取用不会错位。
     *   · captures / errors 的记录方式与串行版完全一致（产物结构不变）。
     */
    const reqBatch = async (items, opts = {}) => {
      const concurrency = Math.max(1, Number(opts.concurrency) || 10);
      const batchGapMs = Number(opts.batchGapMs ?? 150);
      const retryPasses = Number(opts.retryPasses ?? 1);
      const method = opts.method || "POST";
      const out = new Array(items.length).fill(null);

      const runChunk = async (chunk) => {
        const res = await page.evaluate(async ({ aavid, chunk, method }) => {
          const one = async (it) => {
            const url = it.pathname + (it.pathname.includes("?") ? "&" : "?") + "aavid=" + encodeURIComponent(aavid)
              + (it.qs ? "&" + it.qs : "");
            try {
              const r = await fetch(url, method === "GET"
                ? { method: "GET", credentials: "include" }
                : { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(it.body) });
              return { status: r.status, text: await r.text() };
            } catch (e) { return { status: 0, text: String((e && e.message) || e) }; }
          };
          return await Promise.all(chunk.map(one));
        }, { aavid: AAVID, chunk, method }).catch((e) => {
          // ★ 2026-10-10：「Execution context was destroyed」= 页面正在导航/被其他
          //   进程重载（实测由并发跑轮次或人工操作页面触发）。这属**可重试**的
          //   环境抖动，不是业务失败 —— 回传特殊标记，由外层再跑一轮。
          const msg = String((e && e.message) || e);
          const nav = /Execution context was destroyed|Target closed|Navigating frame/i.test(msg);
          return chunk.map(() => ({ status: 0, text: JSON.stringify({ __retryable: nav, msg }), __nav: nav }));
        });

        for (let k = 0; k < chunk.length; k++) {
          const it = chunk[k], r = res[k];
          let parsed = null; try { parsed = JSON.parse(r.text); } catch { /* 非 JSON */ }
          // ★ 环境抖动（页面被导航）不写 errors —— 交由外层重试轮处理，
          //   避免把「别的进程抢了页面」误报成业务失败。
          if (r.__nav) { out[it.__i] = null; continue; }
          captures.push({ label: it.label, url: it.pathname, method, postData: method === "POST" ? JSON.stringify(it.body) : (it.qs || ""), status: r.status, resp: r.text, apiOnly: true });
          if (!parsed || parsed.status_code !== 0) {
            errors.push({ label: it.label, statusCode: parsed?.status_code ?? null, message: parsed?.message ?? String(r.text || "").slice(0, 200), httpStatus: r.status });
          }
          out[it.__i] = parsed;
        }
      };

      const pending = items.map((it, i) => ({ ...it, __i: i }));
      let queue = pending.slice();
      for (let pass = 0; pass <= retryPasses && queue.length; pass++) {
        if (pass > 0) await sleep(1200 * pass);   // 退避后再重试失败条目
        const failed = [];
        for (let i = 0; i < queue.length; i += concurrency) {
          const chunk = queue.slice(i, i + concurrency);
          await runChunk(chunk);
          if (batchGapMs > 0 && i + concurrency < queue.length) await sleep(batchGapMs);
        }
        // 进入下一轮重试的条目：① 平台间歇性 status_code===2；② 页面抖动导致为空
        for (const it of queue) {
          const p = out[it.__i];
          if (p && p.status_code === 2) { failed.push(it); continue; }
          if (p == null) failed.push(it);      // 环境抖动未取到 → 重试
        }
        queue = failed;
      }
      return out;
    };

    /** GET 版便捷封装（计划操作日志用） */
    const getBatch = (items, opts = {}) => reqBatch(items, { ...opts, method: "GET" });

    // ==================== 1. 直播大屏 ====================
    if (!PRODUCT_ONLY) {
      log("采集：直播大屏");
      let roomId = ROOM_ID_DEFAULT;
      if (boardPage) {
        const rid = decodeURIComponent(new URL(boardPage.url()).searchParams.get("live_room_id") || "");
        if (rid) roomId = rid;
      }
      snapshot.roomId = roomId;
      const bf = (withAnchor) => ({
        ConditionRelationshipType: 1,
        Conditions: [
          { Field: "advertiser_id", Operator: 7, Values: [AAVID] },
          { Field: "room_id", Operator: 7, Values: [roomId] },
          ...(withAnchor ? [{ Field: "anchor_id", Operator: 7, Values: [ANCHOR_ID] }] : []),
        ],
      });
      const boardOverview = await post("board_overview", "/ad/api/data/v1/common/statQuery", {
        DataSetKey: "board_roi2_overview_conf_next",
        Metrics: ["live_watch_to_pay_rate_for_roi2", "total_live_pay_order_gpm_realtime_for_roi2",
          "total_cost_per_pay_order_settle_realtime_for_roi2_1h", "total_order_settle_count_realtime_for_roi2_1h",
          "room_pack_online_user_count", "total_show_to_watch_rate_for_roi2", "live_watch_ucount_for_roi2",
          "stat_cost_for_roi2", "total_prepay_and_pay_settle_realtime_roi2_1h",
          "total_order_settle_amount_realtime_for_roi2_1h"],
        Dimensions: [], PageParams: { Offset: 0, Limit: -1 }, Filters: bf(true),
        refer: "ecp,7532804468681916467,7542810029855047726,board_roi2_overview_conf_next",
        Base: { Extra: { refer: "ecp,7532804468681916467,7542810029855047726,board_roi2_overview_conf_next" } },
      });
      const oRows = boardOverview?.data?.StatsData?.Rows || boardOverview?.data?.Rows || [];
      const om = oRows[0]?.Metrics || {};
      snapshot.faces.board = {
        cost: num(om.stat_cost_for_roi2),
        netSettleAmount: num(om.total_order_settle_amount_realtime_for_roi2_1h),
        netSettleOrders: num(om.total_order_settle_count_realtime_for_roi2_1h),
        netRoi: num(om.total_prepay_and_pay_settle_realtime_roi2_1h),
        onlineUsers: num(om.room_pack_online_user_count),
        viewers: num(om.live_watch_ucount_for_roi2),
        conversionRate: num(om.live_watch_to_pay_rate_for_roi2),
        gpm: num(om.total_live_pay_order_gpm_realtime_for_roi2),
        orderCost: num(om.total_cost_per_pay_order_settle_realtime_for_roi2_1h),
      };
      // 5 分钟趋势
      const trend = await post("board_trend_5m", "/ad/api/data/v1/common/statQuery", {
        DataSetKey: "board_roi2_total_trend_next", StartTime: `${DATE} 06:00:00`, EndTime: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).replace("T", " ").slice(0, 19),
        Metrics: ["total_order_settle_amount_realtime_for_roi2_1h", "stat_real_cost_for_roi2"],
        Dimensions: ["stat_time_5_minute"], PageParams: { Offset: 0, Limit: -1 },
        Filters: { ConditionRelationshipType: 1, Conditions: [{ Field: "advertiser_id", Operator: 7, Values: [AAVID] }, { Field: "room_id", Operator: 7, Values: [roomId] }] },
        OrderBy: [{ Field: "stat_time_5_minute", Type: 1 }],
        refer: "ecp,7532804468681916467,7542810029855047726,board_roi2_overview_conf_next",
        Base: { Extra: { refer: "ecp,7532804468681916467,7542810029855047726,board_roi2_overview_conf_next" } },
      });
      const tRows = trend?.data?.StatsData?.Rows || trend?.data?.Rows || [];
      snapshot.trend5m = tRows.map((r) => ({
        time: r.Dimensions?.stat_time_5_minute?.ValueStr || r.Dimensions?.stat_time_5_minute?.Value || "",
        netGmv: num((r.Metrics || {}).total_order_settle_amount_realtime_for_roi2_1h),
        cost: num((r.Metrics || {}).stat_real_cost_for_roi2),
      }));
      await sleep(600);

      // ==================== 2. 主全域 ====================
      log("采集：主全域计划");
      const main = await listAll("main_live", (p) => ({
        _origin_ajax_: 1, UseNewChain: true,
        Params: {
          DiscardTotalNum: false, NeedRequestOptional: true,
          SophonxDataSetKey: "overall_roi_promotion_list_for_live_v2",
          AdFilter: { MarGoal: 2, AdlabScene: 1, SmartBidType: 0, IsOverallRoi: 1, DataTimeRange: { StartTime: T0, EndTime: T1 } },
          OrderBy: { Field: "create_time", Type: 2 },
          PageParams: { Page: p, PageSize: 100 },
          Metrics: LIVE_METRICS, ListAdsModules: [10, 4, 20, 7],
          Dimensions: ["dynamic_external_action"],
        }, aavid: AAVID,
      }));
      const mInfo = main.adInfos.find((x) => String(x.id) === ADID) || main.adInfos[0] || null;
      const mStats = mInfo ? (main.adStatsMap?.[String(mInfo.id)]?.metrics || {}) : {};
      const mainPlan = mInfo ? {
        id: String(mInfo.id), name: mInfo.name, roiGoal: num(mInfo.ecpRoi2Goal),
        // 成交出价型需要目标出价（同调控：bid 单位为 1/100000 元）
        bid: num(mInfo.bid) != null ? num(mInfo.bid) / 100000 : null,
        smartBidType: mInfo.smartBidType ?? null,
        status: mInfo.adDeliveryName, hintType: mInfo.hintType, learningPhase: mInfo.learningPhase,
        adCostProtectStatus: mInfo.adCostProtectStatus,
        compensateStatus: mInfo.compensateStatusInfo?.compensateStatus ?? null,
        compensateReason: mInfo.compensateStatusInfo?.reason ?? null,
        budgetYuan: num(mInfo.budget) != null ? num(mInfo.budget) / 100000 : null,
        dynamicExternalAction: main.adInfos.find((x) => String(x.id) === String(mInfo.id))?.dynamicExternalAction ?? null,
        aggregate: {
          cost: num(mStats.statCostForOverallRoi2), costPlain: num(mStats.statCost),
          netSettle: num(mStats.totalOrderSettleAmountForRoi21H),
          netRoi: num(mStats.totalPrepayAndPaySettleOverallRoi21H),
          payGmv: num(mStats.totalPayOrderGmvIncludeCouponForRoi2),
          payOrders: num(mStats.totalPayOrderCountForRoi2),
          netSettleOrders: num(mStats.totalOrderSettleCountForRoi21H),
          refundRate: num(mStats.totalRefundOrderGmvForRoi21HRate),
        },
        base: {
          cost: num(mStats.statCostForRoi2Primary),
          netSettle: num(mStats.totalOrderSettleAmountForRoi21HPrimary),
          netRoi: num(mStats.totalPrepayAndPaySettleOverallRoi21HPrimary),
          payGmv: num(mStats.totalPayOrderGmvIncludeCouponForRoi2Primary),
          payOrders: num(mStats.totalPayOrderCountForRoi2Primary),
          netSettleOrders: num(mStats.totalOrderSettleCountForRoi21HPrimary),
        },
      } : null;
      // ★ 主全域赔付：只按 base 口径算（避免与调控重复计入，见 computeMainLiveComp 注释）
      //   触发线按出价方式二选一：ROI 出价用 目标ROI×80%；成交出价用 目标出价×1.2。
      let mainLiveComp = null;
      if (mainPlan) {
        mainLiveComp = computeMainLiveComp(
          mainPlan.base, mainPlan.roiGoal,
          mainPlan.base?.netSettleOrders ?? mainPlan.base?.payOrders ?? null,
          mainPlan.bid,
        );
        Object.assign(mainPlan, mainLiveComp);
        // 同时给出 aggregate 口径的公式值，仅供对照，不参与「全局可获赔」汇总。
        // ★ 仅 ROI 出价型适用（赔付公式含目标ROI）；成交出价型该残值无意义，置 null。
        mainPlan.aggregateCompFormulaValue =
          (mainPlan.roiGoal && mainPlan.aggregate.cost != null && mainPlan.aggregate.netSettle != null)
            ? +(Math.max(0,
                mainPlan.aggregate.cost - mainPlan.aggregate.netSettle / mainPlan.roiGoal
              )).toFixed(2)
            : null;
      }
      snapshot.mainLiveComp = mainLiveComp;
      snapshot.faces.mainLive = mainPlan;
      if (mainPlan) {
        const a = mainPlan.aggregate, b = mainPlan.base;
        snapshot.mainAttribution = {
          aggregateCost: a.cost, baseCost: b.cost,
          diffCost: (a.cost != null && b.cost != null) ? +(a.cost - b.cost).toFixed(2) : null,
          aggregateSettle: a.netSettle, baseSettle: b.netSettle,
          diffSettle: (a.netSettle != null && b.netSettle != null) ? +(a.netSettle - b.netSettle).toFixed(2) : null,
        };
      }
      await sleep(600);

      // ==================== 3. 调控面 ====================
      log("采集：调控面（追投 / 一键起量）");
      const ASSIST_SURFACES = [
        { label: "chase_scene2_video", ds: "site_promotion_live_combine_heat", scene: 2, orderField: "stat_cost_for_roi2_assist", metrics: ASSIST_METRICS_CHASE },
        { label: "chase_scene2_overall", ds: "overall_live_combine_heat", scene: 2, orderField: "stat_cost_for_roi2_assist", metrics: ASSIST_METRICS_CHASE },
        { label: "onekey_scene1_plain", ds: "live_roi2_onekeyspeed", scene: 1, orderField: "create_time", metrics: ASSIST_METRICS_ONEKEY },
        { label: "onekey_scene1_overall", ds: "overall_live_roi2_onekeyspeed", scene: 1, orderField: "create_time", metrics: ASSIST_METRICS_ONEKEY },
      ];
      const regMap = new Map();
      const faceInfo = {};
      // ★★ 2026-10-01：直播间一键起量也要含**已删除**任务（用户指出调控页
      //   「投放状态」筛选有「已删除」）。实测：live_roi2_onekeyspeed +
      //   `AdStatusFilterType:1` → 100 条已删除、消耗 ¥1681.65（未删口径仅 ¥50.39）。
      //   ⇒ 对 scene=1（一键起量）额外补一轮「已删除」采集，合并进 regulation。
      //   追投（scene=2）暂不加：其失效态由 platform 的「已终止」覆盖，且用户仅要求一键起量。
      const ASSIST_SURFACES_DELETED = [
        { label: "onekey_scene1_plain_deleted", ds: "live_roi2_onekeyspeed", scene: 1, orderField: "create_time", metrics: ASSIST_METRICS_ONEKEY },
      ];
      const ALL_SURFACES = [...ASSIST_SURFACES, ...ASSIST_SURFACES_DELETED];
      for (const s of ALL_SURFACES) {
        const isDeletedPass = /_deleted$/.test(s.label);
        try {
          const r = await listAll(s.label, (p) => ({
            _origin_ajax_: 1, UseNewChain: true,
            Params: {
              SophonxDataSetKey: s.ds,
              AdFilter: { MarGoal: 2, DataTimeRange: { StartTime: T0, EndTime: T1 },
                AssistTaskFilter: { PrimaryAID: ADID, AssistTaskScene: s.scene },
                ...(isDeletedPass ? { AdStatusFilterType: 1 } : {}) },
              OrderBy: { Type: 2, Field: s.orderField },
              PageParams: { Page: p, PageSize: 100 },
              Metrics: s.metrics, ListAdsModules: [10, 31, 9, 30, 7, 36, 44],
            }, aavid: AAVID,
          }));
          faceInfo[s.label] = { count: r.adInfos.length, totalNum: r.totalNum, complete: r.complete, ds: s.ds };
          // 素材归属：看板「复制」要用它按原素材重建；也用于判断素材是否齐全
          const matMap = r.materialInfoMap || {};
          for (const info of r.adInfos) {
            const st = r.adStatsMap?.[String(info.id)]?.metrics || {};
            const task = info.assistTaskInfoMap?.["1"] || info.assistTaskInfoMap?.["2"] || null;
            const id = String(task?.id || info.id);
            // ★ assistTaskMaterialInfoMap 的键就是「计划 id」本身
            //   （实测：map 键与 adInfos[].id 完全一致），
            //   而 assistTaskInfoMap 里只有 operation 权限、没有 id/name。
            //   早期误用 task?.id 去查表，结果永远查不到素材。
            const mats = (matMap[id] || []).map((x) => String(x.materialId || x)).filter(Boolean);
            // ★ 直播间画面直投标记（2026-09-24）：
            //   轮换脚本 rotate_chase_guarantee_dual.mjs 会主动跳过这类计划，
            //   复盘报告必须用同一判据，否则报告写「需轮换」而脚本实际跳过，口径打架。
            const roomDirect = (matMap[id] || []).some((x) => x.roomMaterial);
            const row = {
              id, adId: String(info.id), name: task?.name || info.name,
              status: task?.statusName || info.adDeliveryName,
              createTime: info.createTime ? Number(info.createTime) : null,
              budgetYuan: num(task?.budget ?? info.budget) != null ? num(task?.budget ?? info.budget) / 100000 : null,
              bid: num(task?.bid ?? info.bid) != null ? num(task?.bid ?? info.bid) / 100000 : null,
              // ★ 复制/重建所需的原素材清单与定向参数
              materials: mats, materialCount: mats.length, roomDirect,
              marGoal: info.marGoal ?? 2,
              smartBidType: info.smartBidType ?? null,
              externalAction: info.externalAction ?? 169,
              audience: info.audience || null,
              primaryAID: ADID,
              cost: num(st.statCostForRoi2Assist), netSettle: num(st.totalOrderSettleAmountForRoi21HAssist),
              netRoi: num(st.totalPrepayAndPaySettleRoi21HAssist), orders: num(st.totalPayOrderCountForRoi2Assist),
              payGmv: num(st.totalPayOrderGmvIncludeCouponForRoi2Assist),
              refundRate: num(st.totalRefundOrderGmvForRoi21HRateAssist),
              compensateStatus: info.compensateStatusInfo?.compensateStatus ?? null,
              compensateReason: info.compensateStatusInfo?.reason ?? null,
              scene: s.scene,
              // ★ 2026-10-01：标记是否来自「已删除」筛选（这些任务已不在常规列表）
              deleted: isDeletedPass,
              srcMode: isDeletedPass ? "deleted" : "live",
              // ★ 赔付所需：ROI目标（ROI型追投有）与出价（控成本型有）
              roiGoal: num(info.ecpRoi2Goal) || null,
              deepExternalAction: num(info.deepExternalAction),
              deepBidType: num(info.deepBidType),
            };
            // 判定赔付口径并算赔付（见下方 computeChaseComp）
            Object.assign(row, computeChaseComp(row));
            // ★ 合并：同一 id 若两轮都出现，保留 deleted 标记并取较大消耗
            const prev = regMap.get(id);
            if (!prev) { regMap.set(id, row); continue; }
            regMap.set(id, {
              ...prev, ...row,
              deleted: !!(prev.deleted || row.deleted),
              cost: Math.max(prev.cost || 0, row.cost || 0),
              netSettle: Math.max(prev.netSettle || 0, row.netSettle || 0),
            });
          }
        } catch (e) {
          errors.push({ label: s.label, error: String(e?.message || e) });
          faceInfo[s.label] = { error: String(e?.message || e) };
        }
        await sleep(500);
      }
      snapshot.faces.regulationFaces = faceInfo;
      snapshot.regulation = [...regMap.values()].sort((a, b) => (b.cost || 0) - (a.cost || 0));
      // ★ 2026-10-01：直播间一键起量（scene=1）汇总 —— 含已删除口径
      {
        const onekey = snapshot.regulation.filter((r) => r.scene === 1);
        const sumBy = (rows, k) => Number(rows.reduce((s, r) => s + (r[k] || 0), 0).toFixed(2));
        snapshot.regulationOnekeySummary = {
          totalCost: sumBy(onekey, "cost"),
          totalSettle: sumBy(onekey, "netSettle"),
          liveCost: sumBy(onekey.filter((r) => !r.deleted), "cost"),
          deletedCost: sumBy(onekey.filter((r) => r.deleted), "cost"),
          count: onekey.length,
          deletedCount: onekey.filter((r) => r.deleted).length,
        };
        log(`  直播间一键起量 ${onekey.length} 条（含已删除 ${snapshot.regulationOnekeySummary.deletedCount}），消耗合计 ¥${snapshot.regulationOnekeySummary.totalCost}（在跑 ¥${snapshot.regulationOnekeySummary.liveCost} + 已删除 ¥${snapshot.regulationOnekeySummary.deletedCost}）`);
      }
      await sleep(600);
    }

    // ==================== 4. 商品面 ====================
    // ★ 分段计时（2026-10-10 提速改造配套）：用于量化并发改造前后的耗时分布
    const phaseT = {};
    const markPhase = (name, t0) => { phaseT[name] = +(Date.now() - t0) / 1000; };
    let _t0 = Date.now();
    log("采集：商品面（三个面 + 赔付）");
    const PRODUCT_FACES = [
      { label: "product_adlab1", adlabScene: 1, isOverallRoi: 1, view: 1, ds: "overall_roi_promotion_list_for_product_v2" },
      { label: "product_adlab0", adlabScene: 0, isOverallRoi: null, view: 1, ds: "overall_roi_promotion_list_for_product_v2" },
      { label: "product_unishop", adlabScene: 1, isOverallRoi: 1, view: 2, ds: "overall_roi_unishop_promotion_list_for_product_v2" },
    ];
    const prodMap = new Map();
    const prodFaceInfo = {};
    for (const f of PRODUCT_FACES) {
      const adFilter = {
        MarGoal: 1, AdlabScene: f.adlabScene, SmartBidType: 0,
        DataTimeRange: { StartTime: T0, EndTime: T1 },
        UniPromShopFilter: { UniPromShopView: f.view },
      };
      if (f.isOverallRoi != null) adFilter.IsOverallRoi = f.isOverallRoi; // AdlabScene=0 必须不带
      const r = await listAll(f.label, (p) => ({
        _origin_ajax_: 1, UseNewChain: true,
        Params: {
          DiscardTotalNum: false, NeedRequestOptional: true,
          SophonxDataSetKey: f.ds, AdFilter: adFilter,
          OrderBy: { Field: "create_time", Type: 2 },
          PageParams: { Page: p, PageSize: 100 },
          Metrics: PRODUCT_METRICS, ListAdsModules: [10, 4, 20, 36, 7, 8, 53],
        }, aavid: AAVID,
      }));
      prodFaceInfo[f.label] = { count: r.adInfos.length, totalNum: r.totalNum, complete: r.complete, ds: f.ds, adlabScene: f.adlabScene, sessionId: !!r.sessionId };

      // ★ 立刻为本面取赔付（list-optional 只返回上一次 list-required 那批）
      let optionalRows = [];
      if (r.sessionId) {
        const ro = await post(`${f.label}_optional`, "/ad/api/pmc/v1/uni-promotion/ad/list-optional", {
          _origin_ajax_: 1, SessionID: r.sessionId, ListAdsModules: OPTIONAL_MODULES, aavid: AAVID,
        });
        optionalRows = ro?.data?.adInfos || [];
        prodFaceInfo[f.label].optionalOk = ro?.status_code === 0;
        prodFaceInfo[f.label].optionalCount = optionalRows.length;
      }
      const compByPid = new Map();
      for (const oi of optionalRows) compByPid.set(String(oi.id), oi.compensateStatusInfo || null);

      for (const info of r.adInfos) {
        const id = String(info.id);
        const st = r.adStatsMap?.[id]?.metrics || {};
        const cost = num(st.statCostForRoi2);
        const costOverallAlt = num(st.statCostForOverallRoi2);
        const netSettle = num(st.totalOrderSettleAmountForRoi21H);
        const netRoi = num(st.totalPrepayAndPaySettleOverallRoi21H);
        const orders = num(st.totalPayOrderCountForRoi2);
        const roiGoal = num(info.ecpRoi2Goal);
        const csi = compByPid.get(id) || info.compensateStatusInfo || null;
        const baseCost = num(st.statCostForRoi2Primary);
        const baseNetSettle = num(st.totalOrderSettleAmountForRoi21HPrimary);
        // ★ 订单门槛也须同口径：RTK 9.8.1 第4条「起量的订单数不计入保障门槛」
        const baseOrders = num(st.totalPayOrderCountForRoi2Primary);
        const baseSettleOrders = num(st.totalOrderSettleCountForRoi21HPrimary);

        /**
         * ★★ 商品赔付基数：**必须剔除一键起量**（2026-09-29 用户口径）。
         *
         * 依据（两条独立证据，互相印证）：
         *   ① 平台规则 RTK 9.8.1 第 4 条：使用「一键起量」的预算**不支持成本保障**，
         *      其订单数也不计入保障门槛 —— 起量消耗本就不该进商品计划的赔付基数。
         *   ② 实测数据自证：`_primary` 口径（stat_cost_for_roi2_primary /
         *      total_order_settle_amount_for_roi2_1h_primary）正是「主计划自身」，
         *      cost − baseCost 的差额**恰等于**该计划名下起量任务的自身消耗
         *      （如 全域商品-02：1752.19 − 1746.05 = 6.14；全域商品-01：480.65 − 462.14 = 18.51）。
         *
         * 因此赔付改用 base 口径；carry 口径（含起量）仅作对照保留，
         * 字段名 compScope 标明取值口径，避免下游把两个数混用。
         * baseCost 缺失时回退 carry 口径（老快照兼容）。
         */
        const compCost = baseCost != null ? baseCost : cost;
        const compNet = baseNetSettle != null ? baseNetSettle : netSettle;

        let compensation = null, roiWithComp = null, threshold = null, belowThreshold = null;
        if (compCost != null && compNet != null && roiGoal) {
          compensation = Math.max(0, compCost - compNet / roiGoal);
          roiWithComp = compNet / Math.max(1, compCost - compensation);
          threshold = roiGoal * 0.8;
          // 触发判定用 base 口径净ROI（不含起量），与赔付金额同源
          const compRoi = compCost > 0 ? compNet / compCost : null;
          belowThreshold = compRoi != null ? compRoi < threshold : null;
        }
        // 对照：含起量口径的赔付公式值（仅供核对口径差异，不参与可获赔汇总）
        let compCarry = null;
        if (cost != null && netSettle != null && roiGoal) {
          compCarry = Math.max(0, cost - netSettle / roiGoal);
        }
        const row = {
          id, name: info.name, status: info.adDeliveryName, face: f.label,
          adlabScene: f.adlabScene, roiGoal,
          hintType: info.hintType, learningPhase: info.learningPhase,
          adCostProtectStatus: info.adCostProtectStatus,
          compensateStatus: csi?.compensateStatus ?? null,
          compensateReason: csi?.reason ?? null,
          hasCompensateField: !!csi,
          cost, costOverallAlt,
          costFieldConflict: (cost != null && costOverallAlt != null && Math.abs(cost - costOverallAlt) > 1),
          netSettle, netRoi, orders,
          refundRate: num(st.totalRefundOrderGmvForRoi21HRate),
          netSettleOrders: num(st.totalOrderSettleCountForRoi21H),
          payGmv: num(st.totalPayOrderGmvIncludeCouponForRoi2),
          baseCost,
          baseNetSettle,
          baseNetRoi: num(st.totalPrepayAndPaySettleOverallRoi21HPrimary),
          baseOrders,
          baseSettleOrders,
          compensationEstimate: compensation != null ? +compensation.toFixed(2) : null,
          compensationEstimateCarry: compCarry != null ? +compCarry.toFixed(2) : null,
          compScope: baseCost != null ? "primary" : "carry",
          compCostUsed: compCost,
          compNetUsed: compNet,
          compExcludedCost: (cost != null && baseCost != null) ? +(cost - baseCost).toFixed(2) : null,
          compExcludedNet: (netSettle != null && baseNetSettle != null) ? +(netSettle - baseNetSettle).toFixed(2) : null,
          compRoiUsed: (compCost != null && compCost > 0 && compNet != null) ? +(compNet / compCost).toFixed(4) : null,
          roiWithCompensation: roiWithComp != null ? +roiWithComp.toFixed(4) : null,
          compensationThreshold: threshold != null ? +threshold.toFixed(3) : null,
          belowCompensationThreshold: belowThreshold,
          meetsOrderThreshold: orders != null ? orders >= 10 : null,
          // ★ 赔付口径（v6）：订单门槛与赔付金额同源，均用 primary 口径（剔除一键起量）
          compOrdersUsed: baseOrders != null ? baseOrders : orders,
          meetsOrderThresholdBase: (baseOrders != null ? baseOrders : orders) != null
            ? (baseOrders != null ? baseOrders : orders) >= 10 : null,
          createTime: info.createTime ? Number(info.createTime) : null,
          // ★ 2026-10-10 补：商品卡计划日志需要这几个原始字段做动向比对
          budgetYuan: num(info.budget) != null ? num(info.budget) / 100000 : null,
          bid: num(info.bid) != null ? num(info.bid) / 100000 : null,
          smartBidType: info.smartBidType ?? null,
          deepExternalAction: info.deepExternalAction ?? null,
          hintTypeRaw: info.hintType ?? null,
        };
        const prev = prodMap.get(id);
        if (!prev || (row.cost || 0) > (prev.cost || 0)) prodMap.set(id, row);
      }
      await sleep(600);
    }
    snapshot.faces.productFaces = prodFaceInfo;
    snapshot.product = [...prodMap.values()].sort((a, b) => (b.cost || 0) - (a.cost || 0));

    // ============ 4.4 商品卡计划日志（留存 + 动向跟踪）============
    // ★ 2026-10-10 用户要求：「把商品卡计划的日志也采集下来，关注下计划动向」。
    //   背景：商品面三视图（product_adlab1 / product_adlab0 / product_unishop）默认**只返回存活计划**，
    //   被删计划彻底消失（改成「全部（包含已删除）」筛选也返回同一批，实测 75=75）。
    //   要「关注计划动向」必须**自己留档**：每轮把存活商品计划快照落盘，
    //   再与上一轮快照做 diff，输出「新增 / 消失 / 状态变化 / 预算变化 / 消耗增量」。
    //
    //   产物（固定路径，跨轮次累积）：
    //     qc_data/_product_card_current.json   本轮存活快照（覆盖写）
    //     qc_data/_product_card_log.jsonl      每轮一行，追加不覆盖（真正的「日志」）
    //     qc_data/_product_card_events.jsonl   只在有动向时追加：新增/消失/状态变化/预算变化
    //     cycle 目录下 product_card_log.json   本轮日志与动向（随轮次归档，便于回看）
    try {
      const CARD_DIR = path.join(ROOT, "qc_data");
      const CARD_CUR = path.join(CARD_DIR, "_product_card_current.json");
      const CARD_LOG = path.join(CARD_DIR, "_product_card_log.jsonl");
      const CARD_EVT = path.join(CARD_DIR, "_product_card_events.jsonl");
      // ★ 跨天**不清零**：上一轮快照跨天仍作对比基准，
      //   否则每天 00:00 首轮会把全部计划误报成「新增计划」（实测首轮 75 条噪声）。
      const prevCard = (() => {
        try {
          const pc = JSON.parse(fs.readFileSync(CARD_CUR, "utf8"));
          if (pc && pc.plans && Object.keys(pc.plans).length) return pc;
        } catch { /* 首次运行：无基准 */ }
        return null;
      })();
      const isFirstRun = !prevCard;

      const curCards = {};
      for (const p of snapshot.product) {
        curCards[String(p.id)] = {
          id: String(p.id), name: p.name, status: p.status, face: p.face, adlabScene: p.adlabScene,
          budgetYuan: p.budgetYuan ?? null, roiGoal: p.roiGoal ?? null,
          cost: p.cost ?? null, netSettle: p.netSettle ?? null, netRoi: p.netRoi ?? null,
          orders: p.orders ?? null, payGmv: p.payGmv ?? null,
          baseCost: p.baseCost ?? null, baseNetRoi: p.baseNetRoi ?? null,
          compensationEstimate: p.compensationEstimate ?? null,
          compensateStatus: p.compensateStatus ?? null,
          learningPhase: p.learningPhase ?? null, hintType: p.hintType ?? null,
          createTime: p.createTime ?? null,
          firstSeenAt: prevCard?.plans?.[String(p.id)]?.firstSeenAt || new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        };
      }

      // ── 动向 diff（以「上一轮快照」为基准）──
      const events = [];
      const prevPlans = prevCard?.plans || {};
      const stampIso = new Date().toISOString();
      for (const [id, cur] of Object.entries(curCards)) {
        const prev = prevPlans[id];
        if (!prev) {
          // 首次运行（无基准快照）不逐条报「新增」，避免 75 条噪声；只记一条汇总。
          if (!isFirstRun) {
            events.push({ at: stampIso, date: DATE, type: "新增计划", id, name: cur.name, face: cur.face, detail: `新出现：状态=${cur.status} 预算¥${cur.budgetYuan ?? "-"} ROI目标=${cur.roiGoal ?? "-"}` });
          }
          continue;
        }
        if (prev.status !== cur.status) {
          events.push({ at: stampIso, date: DATE, type: "状态变化", id, name: cur.name, face: cur.face, detail: `${prev.status} → ${cur.status}` });
        }
        if (prev.budgetYuan != null && cur.budgetYuan != null && Math.abs(prev.budgetYuan - cur.budgetYuan) >= 1) {
          events.push({ at: stampIso, date: DATE, type: "预算变化", id, name: cur.name, face: cur.face, detail: `¥${prev.budgetYuan} → ¥${cur.budgetYuan}` });
        }
        if (prev.roiGoal != null && cur.roiGoal != null && Math.abs(prev.roiGoal - cur.roiGoal) >= 0.001) {
          events.push({ at: stampIso, date: DATE, type: "ROI目标变化", id, name: cur.name, face: cur.face, detail: `${prev.roiGoal} → ${cur.roiGoal}` });
        }
        if (prev.compensateStatus !== cur.compensateStatus) {
          events.push({ at: stampIso, date: DATE, type: "赔付状态变化", id, name: cur.name, face: cur.face, detail: `compensateStatus ${prev.compensateStatus ?? "-"} → ${cur.compensateStatus ?? "-"}` });
        }
      }
      for (const [id, prev] of Object.entries(prevPlans)) {
        if (curCards[id]) continue;
        events.push({ at: stampIso, date: DATE, type: "计划消失", id, name: prev.name, face: prev.face, detail: `上一轮还在（状态=${prev.status} 预算¥${prev.budgetYuan ?? "-"}），本轮列表已无此计划 —— 可能被删除或已结束（本轮三视图采集${Object.values(prodFaceInfo).every((f) => !f.error) ? "完整" : "不完整⚠"}）` });
      }

      const costDelta = {};
      for (const [id, cur] of Object.entries(curCards)) {
        const prev = prevPlans[id];
        if (prev && cur.cost != null && prev.cost != null) costDelta[id] = +(cur.cost - prev.cost).toFixed(2);
      }
      const moved = Object.entries(costDelta).filter(([, d]) => d > 0).sort((a, b) => b[1] - a[1]);

      const roundLog = {
        at: stampIso, date: DATE, round: path.basename(OUT),
        planCount: Object.keys(curCards).length,
        facesOk: Object.values(prodFaceInfo).every((f) => !f.error),
        faces: prodFaceInfo,
        eventCount: events.length,
        events,
        costDelta,
        movedTop: moved.slice(0, 15).map(([id, d]) => ({ id, name: curCards[id]?.name, face: curCards[id]?.face, delta: d, cost: curCards[id]?.cost })),
        plans: curCards,
      };
      fs.mkdirSync(CARD_DIR, { recursive: true });
      fs.appendFileSync(CARD_LOG, JSON.stringify(roundLog) + "\n", "utf8");
      if (events.length) fs.appendFileSync(CARD_EVT, events.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
      fs.writeFileSync(CARD_CUR, JSON.stringify({ date: DATE, at: stampIso, plans: curCards }, null, 2), "utf8");
      fs.writeFileSync(path.join(OUT, "product_card_log.json"), JSON.stringify(roundLog, null, 2), "utf8");

      snapshot.productCardLog = {
        planCount: roundLog.planCount, eventCount: events.length,
        events: events.slice(0, 50),
        movedTop: roundLog.movedTop.slice(0, 10),
        logFile: "qc_data/_product_card_log.jsonl", eventFile: "qc_data/_product_card_events.jsonl",
        roundFile: path.join(path.basename(OUT), "product_card_log.json"),
      };
      log(`商品卡计划日志：存活 ${roundLog.planCount} 条，本轮动向 ${events.length} 项`);
      for (const e of events.slice(0, 12)) log(`    [${e.type}] ${e.name} ${e.detail}`);
      if (events.length > 12) log(`    …另有 ${events.length - 12} 项，见 product_card_log.json`);
    } catch (e) {
      errors.push({ label: "product_card_log", error: String(e?.message || e) });
    }

    // ============ 4.45 计划操作日志（平台侧权威，逐计划采集）============
    // ★ 2026-10-10 用户要求：「这个接口的日志也给他采集下来，每个计划都有日志接口」。
    //   接口（在计划行「更多 → 日志」中触发，实测已确认）：
    //     GET /ad/api/pmc/v1/ad/get_opt_log
    //         ?objectID=<adId>&startTime=YYYY-MM-DD HH:MM:SS&endTime=...&currentPage=1&pageSize=20&type=1
    //     ★ type=1 才是操作日志（type=0 恒返回 0 条，勿用）。
    //     ★ 必须带时间窗；不带或时间窗不当返回空。日志按**创建时间倒序**返回。
    //   返回 data.logs[]：{contentTitle(新建/修改/删除/暂停…), objectName, createTime,
    //     contentLog[]（逐行中文变更明细，如「修改 净成交ROI目标: 2.62 -> 2.30」）,
    //     operator/operatorName(操作人), optIp, operateSource, logId}
    //   ⇒ 这是**平台侧权威的操作痕迹**，比自建 diff 更完整（能拿到人、时间、改前改后）。
    //
    // 产物（固定路径 + 轮次归档）：
    //   qc_data/_plan_opt_logs.jsonl        逐轮一行（含全部计划的操作日志）
    //   qc_data/_plan_opt_events.jsonl      只追加**新出现**的日志条目（按 logId 去重）
    //   qc_data/_plan_opt_seen.json         已见 logId 集合（跨轮去重基准）
    //   cycle 目录 plan_opt_log.json        本轮明细
    try {
      const OPT_DIR = path.join(ROOT, "qc_data");
      const OPT_LOG = path.join(OPT_DIR, "_plan_opt_logs.jsonl");
      const OPT_EVT = path.join(OPT_DIR, "_plan_opt_events.jsonl");
      const OPT_SEEN = path.join(OPT_DIR, "_plan_opt_seen.json");
      const LOOKBACK_DAYS = Number(arg("--optlog-days", "3"));
      const startDate = new Date(Date.now() + 8 * 3600e3 - LOOKBACK_DAYS * 86400e3).toISOString().slice(0, 10);
      const startTime = `${startDate} 00:00:00`;
      const endTime = `${DATE} 23:59:59`;

      let seen = {};
      try { seen = JSON.parse(fs.readFileSync(OPT_SEEN, "utf8")) || {}; } catch { /* 首次 */ }

      const planLogs = [];
      const newEvents = [];
      let ok = 0, fail = 0, logTotal = 0;
      // ★ 2026-10-10 提速：原为逐计划串行 GET（75 次 CDP 往返 + 每次 sleep 120ms），
      //   改为 getBatch 浏览器内并发（并发 6、批间 150ms），语义与产物结构不变。
      const optItems = snapshot.product.map((p) => {
        const adId = String(p.id);
        return {
          label: `optlog_${adId}`,
          pathname: "/ad/api/pmc/v1/ad/get_opt_log",
          qs: `objectID=${adId}&startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}&currentPage=1&pageSize=50&type=1`,
          __id: adId, __name: p.name, __status: p.status, __face: p.face,
        };
      });
      const optRes = await getBatch(optItems, { concurrency: 10, batchGapMs: 120 });
      for (let oi = 0; oi < optItems.length; oi++) {
        const it = optItems[oi];
        const j = optRes[oi];
        const adId = it.__id;
        // ★ reqBatch 已把非 0 结果推进 errors 并记录 captures；这里只做统计与归一化。
        if (j?.status_code !== 0) { fail++; continue; }
        const logs = (j.data?.logs || []).map((x) => ({
          logId: String(x.logId || ""), objectId: adId, planName: it.__name,
          createTime: String(x.createTime || ""), title: String(x.contentTitle || ""),
          type: String(x.objectType || ""), content: Array.isArray(x.contentLog) ? x.contentLog : [],
          operator: String(x.operatorName || x.operator || ""), source: String(x.operateSource || ""),
        }));
        ok++; logTotal += logs.length;
        planLogs.push({ id: adId, name: it.__name, status: it.__status, face: it.__face, logCount: logs.length, logs });
        for (const lg of logs) {
          if (!lg.logId || seen[lg.logId]) continue;
          seen[lg.logId] = 1;
          newEvents.push({ ...lg, at: new Date().toISOString() });
        }
      }

      const round = {
        at: new Date().toISOString(), date: DATE, round: path.basename(OUT),
        window: { startTime, endTime }, plans: planLogs.length, ok, fail, logTotal,
        newEventCount: newEvents.length, newEvents, planLogs,
      };
      fs.mkdirSync(OPT_DIR, { recursive: true });
      fs.appendFileSync(OPT_LOG, JSON.stringify(round) + "\n", "utf8");
      if (newEvents.length) fs.appendFileSync(OPT_EVT, newEvents.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
      // 只保留最近 20000 个 logId，避免文件无限增长
      const keys = Object.keys(seen);
      if (keys.length > 20000) { const keep = {}; for (const k of keys.slice(-20000)) keep[k] = 1; seen = keep; }
      fs.writeFileSync(OPT_SEEN, JSON.stringify(seen), "utf8");
      fs.writeFileSync(path.join(OUT, "plan_opt_log.json"), JSON.stringify(round, null, 2), "utf8");

      snapshot.planOptLog = {
        window: { startTime, endTime }, plans: planLogs.length, ok, fail, logTotal,
        newEventCount: newEvents.length,
        newEvents: newEvents.slice(0, 60),
        logFile: "qc_data/_plan_opt_logs.jsonl", eventFile: "qc_data/_plan_opt_events.jsonl",
        roundFile: path.join(path.basename(OUT), "plan_opt_log.json"),
      };
      log(`计划操作日志：覆盖 ${ok}/${snapshot.product.length} 条计划，取回 ${logTotal} 条，本轮新增 ${newEvents.length} 条`);
      for (const e of newEvents.slice(0, 10)) log(`    [${e.title}] ${e.planName} | ${e.content.join(" ; ").slice(0, 90)} | ${e.operator} ${e.createTime}`);
      if (newEvents.length > 10) log(`    …另有 ${newEvents.length - 10} 条，见 plan_opt_log.json`);
    } catch (e) {
      errors.push({ label: "plan_opt_log", error: String(e?.message || e) });
    }

    markPhase("商品面+卡片日志", _t0); _t0 = Date.now();
    // ============ 4.5 商品素材追投（scene=2，只读）============
    // ★ 2026-09-29 新增：商品侧除「一键起量」(scene=1) 外，还有**独立的「素材追投」**(scene=2)。
    //   判据（实测，非猜测）：同一商品计划分别查 scene=1 与 scene=2，返回的任务 id
    //   **无一条重合**（如 全域商品-02：34 条 vs 8 条；全域商品-03：11 vs 3）。
    //   scene=2 任务命名形如 `202609xx_素材追投_xx:xx:xx`，其 assistTaskInfoMap 的 key 恒为 "2"。
    //   接口与一键起量同族，仅 AssistTaskScene 不同；指标同样在 adStatsMap[<任务id>].metrics，
    //   值为 {value,valueStr} 对象，成本/净成交需 /1e5。
    //   ★ 现状：该能力当前零消耗零活跃（属历史用法，15 条全为已完成/已终止），
    //     但采集照做 —— 看板「商品（追投+一键）」卡两半都有位，日后启用即有数。
    log("采集：商品素材追投（scene=2）");
    const prodChaseRows = [];
    const prodChaseFaceInfo = { ok: 0, fail: 0, total: 0 };
    // ★★ 同时采 scene=1（商品一键起量）与 scene=2（商品素材追投）（2026-09-29 修复）
    //   此前只采了 scene=2，导致看板「商品（追投+一键）」卡的一键半永远为 0。
    //   ★ 数据源必须用 live_roi2_onekeyspeed（实测：product_roi2_onekeyspeed 的
    //     adStatsMap 键数恒为 0，完全取不到统计）。
    //   ★ 单位：assist 统计的 {value} **已是「元」**，不可再 /1e5
    //     （此前误当微元，¥22.66 被算成 ¥0.00）。
    const prodOnekeyRows = [];
    const prodSceneRows = { 1: prodOnekeyRows, 2: prodChaseRows };
    const prodSceneFace = { 1: { ok: 0, fail: 0 }, 2: { ok: 0, fail: 0 } };

    /**
     * ★★ 2026-10-10 提速（用户要求「搞成多并发缩短任务时间」）
     *
     * 【原实现】75 计划 × 2 场景 × 2 口径 = **300 次请求**，全部串行走
     *   Node → page.evaluate → fetch，每轮再叠加 await sleep(300)，
     *   实测独占约 180–200 秒，是整轮 300+ 秒的**主要耗时来源**。
     * 【现实现】先把 300 个请求体收集起来，交给 reqBatch 在**一次 page.evaluate
     *   内并发发出**（并发 6、批间 250ms、间歇性 status_code=2 会自动退避重试），
     *   CDP 往返从 300 次降到 50 批，预计这段降到 20–30 秒。
     * ★ 口径完全不变：请求体、字段、去重逻辑与原实现逐字一致，只是把「发请求」并行化。
     */
    const taskReqItems = [];
    for (const p of snapshot.product) {
      for (const scene of [1, 2]) {
        const isOnekey = scene === 1;
        // ★★ 2026-10-01 用户线索 + 扒页实证：
        //   调控页「投放状态」筛选含「已删除」，对应数据源 **product_roi2_task**
        //   配 `AdStatusFilterType: 1` → 返回该商品计划名下**全部已删除**的调控任务，
        //   且**带真实消耗/成交**（实测：混搭测试05 22 条、消耗合计 ¥1252.99；
        //   未删口径仅 ¥10.39）。这是「已删除计划消耗」的权威来源，
        //   优于自记账（C 方案只覆盖我们脚本自己删的任务）。
        //   两轮采集合并：AdStatusFilterType=1（已删除）+ 不带该字段（在跑/已终止）。
        const FILTER_MODES = [
          { tag: "deleted", extra: { AdStatusFilterType: 1 } },
          { tag: "live", extra: {} },
        ];
        for (const mode of FILTER_MODES) {
          taskReqItems.push({
            label: `product_${isOnekey ? "onekey" : "chase"}_${mode.tag}_${p.id}`,
            pathname: "/ad/api/pmc/v1/uni-promotion/ad/list-required",
            body: {
              _origin_ajax_: 1, UseNewChain: true,
              Params: {
                SophonxDataSetKey: "product_roi2_task",
                AdFilter: { MarGoal: 1, DataTimeRange: { StartTime: T0, EndTime: T1 },
                  AssistTaskFilter: { PrimaryAID: String(p.id), AssistTaskScene: scene },
                  ...mode.extra },
                OrderBy: { Field: "create_time", Type: 2 },
                PageParams: { Page: 1, PageSize: 100 },
                Metrics: ASSIST_METRICS_ONEKEY, ListAdsModules: [10, 31, 9, 30, 7, 36, 44],
              },
            },
            __scene: scene, __modeTag: mode.tag, __pid: String(p.id), __pname: p.name,
          });
        }
      }
    }
    // ★ 并发发出（浏览器内 Promise 池）；失败条目由 reqBatch 记入 errors
    const TASK_CONCURRENCY = Number(arg("--task-concurrency", "10"));
    const taskRes = await reqBatch(taskReqItems, { concurrency: TASK_CONCURRENCY, batchGapMs: 250 });
    for (let ti = 0; ti < taskReqItems.length; ti++) {
      const it = taskReqItems[ti];
      const rc = taskRes[ti];
      const scene = it.__scene;
      if (rc?.status_code === 0) {
        prodSceneFace[scene].ok++;
        const stc = rc.data?.adStatsMap || {};
        for (const a of (rc.data?.adInfos || [])) {
          const m = stc[String(a.id)]?.metrics || {};
          // ★ 已是「元」，不再 /1e5
          const cc = num(m.statCostForRoi2Assist);
          const cs = num(m.totalOrderSettleAmountForRoi21HAssist);
          const isDeleted = it.__modeTag === "deleted";
          prodSceneRows[scene].push({
            id: String(a.id), scene,
            primaryAID: it.__pid, primaryName: it.__pname,
            name: a.name, status: a.adDeliveryName || "",
            budgetYuan: num(a.budget) != null ? num(a.budget) / 100000 : null,  // budget 仍是微元
            cost: cc,
            netSettle: cs,
            netRoi: num(m.totalPrepayAndPaySettleRoi21HAssist),
            orders: num(m.totalPayOrderCountForRoi2Assist),
            payGmv: num(m.totalPayOrderGmvIncludeCouponForRoi2Assist),
            createTime: a.createTime ? Number(a.createTime) : null,
            // ★ 标记来源：deleted=来自「已删除」筛选（这些任务已不在常规列表里）
            deleted: isDeleted,
            srcMode: it.__modeTag,
          });
        }
      } else {
        prodSceneFace[scene].fail++;
      }
    }
    // ★ 去重：同一任务 id 可能在两个筛选都出现（已删除的仍带「已终止」状态）；
    //   优先保留 deleted 标记，消耗取较大值（口径更全）。
    const dedupe = (rows) => {
      const m = new Map();
      for (const r of rows) {
        const k = r.id;
        const prev = m.get(k);
        if (!prev) { m.set(k, r); continue; }
        const merged = { ...prev, ...r,
          deleted: !!(prev.deleted || r.deleted),
          cost: Math.max(prev.cost || 0, r.cost || 0),
          netSettle: Math.max(prev.netSettle || 0, r.netSettle || 0),
        };
        m.set(k, merged);
      }
      return [...m.values()];
    };
    const chaseDedup = dedupe(prodChaseRows);
    const onekeyDedup = dedupe(prodOnekeyRows);
    prodChaseRows.length = 0; prodChaseRows.push(...chaseDedup);
    prodOnekeyRows.length = 0; prodOnekeyRows.push(...onekeyDedup);

    prodChaseFaceInfo.ok = prodSceneFace[2].ok;
    prodChaseFaceInfo.fail = prodSceneFace[2].fail;
    prodChaseFaceInfo.total = prodChaseRows.length;
    prodChaseFaceInfo.deletedCount = prodChaseRows.filter((r) => r.deleted).length;
    snapshot.productChaseFace = prodChaseFaceInfo;
    snapshot.productChase = prodChaseRows.sort((a, b) => (b.cost || 0) - (a.cost || 0));

    // ★ 商品一键起量（scene=1）独立落盘，供看板「商品（追投+一键）」卡使用
    const prodOnekeyFaceInfo = { ok: prodSceneFace[1].ok, fail: prodSceneFace[1].fail, total: prodOnekeyRows.length,
      deletedCount: prodOnekeyRows.filter((r) => r.deleted).length };
    snapshot.productOnekeyFace = prodOnekeyFaceInfo;
    snapshot.productOnekeyRows = prodOnekeyRows.sort((a, b) => (b.cost || 0) - (a.cost || 0));
    // ★ 汇总（含已删除口径）—— 看板与赔付计算直接取这两个数
    const sumBy = (rows, key) => Number(rows.reduce((s, r) => s + (r[key] || 0), 0).toFixed(2));
    snapshot.productOnekeySummary = {
      totalCost: sumBy(prodOnekeyRows, "cost"),
      totalSettle: sumBy(prodOnekeyRows, "netSettle"),
      liveCost: sumBy(prodOnekeyRows.filter((r) => !r.deleted), "cost"),
      liveSettle: sumBy(prodOnekeyRows.filter((r) => !r.deleted), "netSettle"),
      deletedCost: sumBy(prodOnekeyRows.filter((r) => r.deleted), "cost"),
      deletedSettle: sumBy(prodOnekeyRows.filter((r) => r.deleted), "netSettle"),
      count: prodOnekeyRows.length,
      deletedCount: prodOnekeyRows.filter((r) => r.deleted).length,
    };
    snapshot.productChaseSummary = {
      totalCost: sumBy(prodChaseRows, "cost"),
      totalSettle: sumBy(prodChaseRows, "netSettle"),
      deletedCost: sumBy(prodChaseRows.filter((r) => r.deleted), "cost"),
      count: prodChaseRows.length,
      deletedCount: prodChaseRows.filter((r) => r.deleted).length,
    };

    log(`  商品素材追投 ${prodChaseRows.length} 条（面 ok=${prodChaseFaceInfo.ok} fail=${prodChaseFaceInfo.fail}，含已删除 ${prodChaseFaceInfo.deletedCount}）`);
    log(`  商品一键起量 ${prodOnekeyRows.length} 条（面 ok=${prodOnekeyFaceInfo.ok} fail=${prodOnekeyFaceInfo.fail}，含已删除 ${prodOnekeyFaceInfo.deletedCount}）`);
    log(`  商品一键起量消耗合计 ¥${snapshot.productOnekeySummary.totalCost}（在跑 ¥${snapshot.productOnekeySummary.liveCost} + 已删除 ¥${snapshot.productOnekeySummary.deletedCost}）`);

    markPhase("商品追投/一键+操作日志", _t0); _t0 = Date.now();
    // ==================== 5. 品牌竞价（只读）====================
    // 注意：品牌竞价走独立接口族 /ad/brand_bid/api/v1/*。
    //   - required 用 POST，adStatsMap 恒为空
    //   - optional 必须用 **GET** + 把 sid/modules 拼在 query 上；
    //     用 POST 会返回 status_code=40002「路径权限校验失败」
    //   - modules 必须是完整清单，否则 adStatsMap 静默为空
    log("采集：品牌竞价（只读观察）");
    const BRAND_OPTIONAL_MODULES = "4,12,1,2,14,13,16,9,26,37,17,10,254";
    const BRAND_LABELS = [
      { label: "直播加热", marGoal: 2, campaignScene: "8", ds: "cm_prom_room_feed_preheat_new",
        metrics: "stat_cost,prepay_and_pay_order_roi,pay_order_count,pay_order_amount,show_cnt,ctr,click_cnt,cpm_platform,all_order_prepay_and_pay_roi_7days,all_order_pay_count_7days,all_order_pay_gmv_7days" },
      { label: "人群种草", marGoal: 1, campaignScene: "7", ds: "brand_common_promotion_product_feed_grass",
        metrics: "stat_cost,show_cnt,click_cnt,cpm_platform,ctr,all_order_pay_count_7days,all_order_pay_gmv_7days,pay_order_count,pay_order_amount,prepay_and_pay_order_roi" },
    ];
    const brandRows = [];
    for (const b of BRAND_LABELS) {
      try {
        const rb = await post(`brand_required_${b.label}`, "/ad/brand_bid/api/v1/list_ads_required", {
          _origin_ajax_: 1, modules: "6,7,8,11", needRequestOptional: 1, discardTotalNum: 1,
          listAdsFromBusiness: 1, mar_goal: b.marGoal, campaign_type: 1,
          start_time: T0, end_time: T1, smart_bid_type: -1, ad_status_filter_type: 0,
          auto_manage_filter: 0, metrics: b.metrics, order_by_type: 2, page: 1, page_size: 100,
          need_diagnosis: 2, campaign_scene: b.campaignScene, need_diagnosis_all: 2,
          need_quota: 0, ad_cost_status: -1, needHeatingTool: false, external_action_config: [],
          optimize_period: -1, ad_iDs: "", dataSetKey: b.ds, aavid: AAVID,
        });
        const sid = rb?.data?.sessionId || "";
        if (sid) {
          const optPath = `/ad/brand_bid/api/v1/list_ads_optional?aavid=${encodeURIComponent(AAVID)}&sid=${encodeURIComponent(sid)}&modules=${encodeURIComponent(BRAND_OPTIONAL_MODULES)}`;
          let resp, od;
          for (let a = 1; a <= 3; a++) {
            try {
              resp = await page.evaluate(async (p) => {
                const r = await fetch(p, { method: "GET", credentials: "include" });
                return { status: r.status, text: await r.text() };
              }, optPath);
            } catch (e) { resp = { status: 0, text: String(e?.message || e) }; }
            try { od = JSON.parse(resp.text)?.data; } catch { od = null; }
            if (od) break;
            await sleep(1200 * a);
          }
          captures.push({ label: `brand_optional_${b.label}`, url: optPath.split("?")[0], method: "GET", postData: "", status: resp?.status, resp: resp?.text, apiOnly: true });
          if (!od) errors.push({ label: `brand_optional_${b.label}`, message: (resp?.text || "").slice(0, 200) });
          for (const ad of (od?.adInfos) || []) {
            const m = od?.adStatsMap?.[String(ad.id)]?.metrics || {};
            brandRows.push({
              id: String(ad.id), name: ad.name, label: b.label,
              status: ad.adDeliveryName || "", budgetYuan: num(ad.budget) != null ? num(ad.budget) / 100000 : null,
              cost: num(m.statCost), payGmv: num(m.payOrderAmount), netGmv: num(m.allOrderPayGmv7Days),
              orders: num(m.payOrderCount), payRoi: num(m.prepayAndPayOrderRoi),
              netRoi: num(m.allOrderPrepayAndPayRoi7Days),
              compensateStatus: ad.compensateStatusInfo?.compensateStatus ?? null,
              compensateReason: ad.compensateStatusInfo?.reason ?? null,
              adCostProtectStatus: ad.adCostProtectStatus ?? null,
            });
          }
        }
      } catch (e) {
        errors.push({ label: `brand_${b.label}`, error: String(e?.message || e) });
      }
      await sleep(500);
    }
    markPhase("品牌", _t0);
    snapshot.phaseSeconds = phaseT;
    log("分段耗时：" + Object.entries(phaseT).map(([k, v]) => `${k} ${v.toFixed(1)}s`).join(" / "));
    snapshot.brand = brandRows;
    snapshot.faces.brand = { count: brandRows.length, note: "只读观察，不产生动作建议（用户要求暂不动）" };

    // ==================== 5.5 计划消失账本（识别「已删除」）====================
    /*
     * 为什么需要账本：
     *   平台列表接口**不会返回被删除的计划**——已实测把时间窗口从 1 天放宽到
     *   30 天，返回条数完全不变（始终 7 条）。被删计划是**彻底消失**，而不是
     *   变成某个「已删除」状态值，接口层根本拿不到它。
     *   要区分「已删除」与「今天窗口外的正常计划」，唯一可靠依据是跨轮对比：
     *   今天早些时候出现过、之后**连续 2 轮以上**消失（且那几轮采集完整、
     *   无失败分页）=> 判定为已删除。连续 2 轮是为避免个别页请求失败造成假消失。
     * 账本落在 qc_data/_plan_ledger.json，跨轮次持久；跨天自动重置。
     * 放在所有面采集完之后执行，这样商品/主全域的行也能进账本。
     */
    try {
      const LEDGER = path.join("qc_data", "_plan_ledger.json");
      let ledger = { date: DATE, plans: {} };
      try {
        const old = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
        if (old && old.date === DATE && old.plans) ledger = old;
      } catch { /* 首次运行或文件损坏，用空账本 */ }

      const collected = new Map();
      for (const r of (snapshot.regulation || [])) {
        collected.set(String(r.id), {
          id: String(r.id), name: r.name, kind: r.scene === 1 ? "一键起量" : "素材追投",
          group: "regulation", scene: r.scene, status: r.status,
          budgetYuan: r.budgetYuan, bid: r.bid, cost: r.cost,
          // ★ 保留复制所需参数：计划被删后接口再也查不到，
          //   账本里的这份快照是「复制按钮仍可用」的唯一依据。
          materialCount: r.materialCount ?? (r.materials || []).length,
          materials: r.materials || [],
          marGoal: r.marGoal ?? 2, smartBidType: r.smartBidType ?? null,
          externalAction: r.externalAction ?? 169, audience: r.audience || null,
          primaryAID: r.primaryAID || ADID,
        });
      }
      for (const p of (snapshot.product || [])) {
        collected.set(String(p.id), {
          id: String(p.id), name: p.name, kind: "商品", group: "product",
          status: p.status, budgetYuan: p.budgetYuan, cost: p.cost,
        });
      }
      const ml = snapshot.faces?.mainLive;
      if (ml?.id) {
        collected.set(String(ml.id), {
          id: String(ml.id), name: ml.name, kind: "主全域", group: "mainLive",
          status: ml.status, budgetYuan: ml.budgetYuan, cost: ml.aggregate?.cost,
        });
      }

      // 采集不完整时不动账本计数（避免把失败轮次误判成删除）
      const facesOk = Object.values(snapshot.faces.regulationFaces || {}).every((f) => !f.error)
        && Object.values(snapshot.faces.productFaces || {}).every((f) => !f.error);
      const nowIso = new Date().toISOString();

      for (const [id, cur] of collected) {
        const prev = ledger.plans[id];
        ledger.plans[id] = Object.assign({}, prev || {}, cur, {
          firstSeenAt: prev?.firstSeenAt || nowIso,
          lastSeenAt: nowIso,
          missingRounds: 0,
          deleted: false,
          deletedAt: null,
        });
      }
      if (facesOk) {
        for (const [id, rec] of Object.entries(ledger.plans)) {
          if (collected.has(id)) continue;
          rec.missingRounds = (rec.missingRounds || 0) + 1;
          if (rec.missingRounds >= 2 && !rec.deleted) {
            rec.deleted = true;
            rec.deletedAt = nowIso;
            rec.status = "已删除";
          }
        }
      }

      const deletedRows = Object.values(ledger.plans)
        .filter((r) => r.deleted)
        .sort((a, b) => String(b.deletedAt || "").localeCompare(String(a.deletedAt || "")));
      snapshot.regulationDeleted = deletedRows.filter((r) => r.group === "regulation");
      snapshot.plansDeleted = deletedRows;
      snapshot.ledgerMeta = { date: ledger.date, alive: collected.size, deleted: deletedRows.length, facesOk };

      fs.mkdirSync("qc_data", { recursive: true });
      fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2), "utf8");
      log(`计划账本：存活 ${collected.size} 条，已删除 ${deletedRows.length} 条${facesOk ? "" : "（采集不完整，本轮不判定删除）"}`);
    } catch (e) {
      errors.push({ label: "plan_ledger", error: String(e?.message || e) });
    }

  } finally {
    /* 无浏览器可关 */
  }

  // ==================== 汇总 ====================
  //
  // ★ 口径纪律（2026-09-20 修复重复计入）：
  //   主全域 aggregate 口径**已经包含调控侧消耗** —— 这不是推断，可以用数据自证：
  //       aggregate 消耗 - base 消耗 == 调控侧差额（如 5004.47 - 2737.80 = 2266.67）
  //   所以全账户合计时**绝不能再把 regulation 加一遍**。
  //   此前按「main_live + regulation + product + brand」求和，
  //   导致每轮虚增一个 regulation 的量（实测 +2027.47，合计被抬高约 21%）。
  //
  //   因此分两类字段输出：
  //     - byKind       ：各板块**独立展示**用（含 regulation，供看板分板块呈现）
  //     - totals       ：全账户**去重合计**用（用 aggregate 口径，不加 regulation）
  const mainLive = snapshot.faces.mainLive;
  const byKind = {};
  const add = (kind, cost, net, orders, plans, payGmv) => {
    byKind[kind] = byKind[kind] || { kind, plans: 0, cost: 0, netGmv: 0, payGmv: 0, orders: 0 };
    byKind[kind].plans += plans;
    byKind[kind].cost += cost || 0;
    byKind[kind].netGmv += net || 0;
    byKind[kind].payGmv += payGmv || 0;
    byKind[kind].orders += orders || 0;
  };
  const sumBy = (arr, k) => arr.reduce((a, x) => a + (x[k] || 0), 0);

  const brandHeat = snapshot.brand.filter((x) => x.label === "直播加热");
  const brandSeed = snapshot.brand.filter((x) => x.label === "人群种草");

  // payGmv = 支付成交（整体成交），区别于 netGmv = 净成交（剔除退款后）
  if (mainLive) add("main_live", mainLive.aggregate.cost, mainLive.aggregate.netSettle,
    mainLive.aggregate.netSettleOrders, 1, mainLive.aggregate.payGmv);
  add("regulation", sumBy(snapshot.regulation, "cost"), sumBy(snapshot.regulation, "netSettle"),
    sumBy(snapshot.regulation, "orders"), snapshot.regulation.length, sumBy(snapshot.regulation, "payGmv"));
  add("product", sumBy(snapshot.product, "cost"), sumBy(snapshot.product, "netSettle"),
    sumBy(snapshot.product, "orders"), snapshot.product.length, sumBy(snapshot.product, "payGmv"));
  add("brand_live_heat", sumBy(brandHeat, "cost"), 0, 0, brandHeat.length, sumBy(brandHeat, "payGmv"));
  add("brand_crowd_seed", sumBy(brandSeed, "cost"), sumBy(brandSeed, "netGmv"), 0, brandSeed.length, sumBy(brandSeed, "payGmv"));
  // 主全域基座口径：只作展示，不参与合计（它是 aggregate 的子集）
  if (mainLive) add("main_live_base", mainLive.base.cost, mainLive.base.netSettle,
    mainLive.base.netSettleOrders, 1, mainLive.base.payGmv);

  for (const v of Object.values(byKind)) {
    v.cost = +v.cost.toFixed(2); v.netGmv = +v.netGmv.toFixed(2); v.payGmv = +v.payGmv.toFixed(2);
    v.netRoi = v.cost ? +(v.netGmv / v.cost).toFixed(4) : null;
    v.payRoi = v.cost ? +(v.payGmv / v.cost).toFixed(4) : null;
  }

  const prodCost = sumBy(snapshot.product, "cost");
  const prodNet = sumBy(snapshot.product, "netSettle");
  const prodComp = sumBy(snapshot.product, "compensationEstimate");

  /* ★ 商品赔付基数（2026-09-29 用户口径）：剔除一键起量。
     - compCost = Σ baseCost（_primary 口径 = 主计划自身，不含起量）
     - compNet  = Σ baseNetSettle
     起量消耗经实测确认落在 cost 与 baseCost 的差额里（见商品行 compExcludedCost），
     且平台规则 RTK 9.8.1 第4条明确一键起量预算不支持成本保障 ⇒ 不进赔付基数。
     prodCost/prodNet 仍是**含起量的实际消耗/成交**，继续用于全账户合计与经营净ROI。 */
  const prodCompCost = sumBy(snapshot.product, "compCostUsed");
  const prodCompNet = sumBy(snapshot.product, "compNetUsed");
  const prodExcludedCost = +(prodCost - prodCompCost).toFixed(2);
  const prodExcludedNet = +(prodNet - prodCompNet).toFixed(2);
  const prodCompOnBase = (() => {
    let s = 0;
    for (const p of snapshot.product) {
      if (p.compTriggered === true || (p.compTriggered == null && p.belowCompensationThreshold === true)) {
        s += p.compensationEstimate || 0;
      }
    }
    return +s.toFixed(2);
  })();

  // ---- 全账户去重合计 ----
  // 参与合计的板块：主全域 aggregate（已含调控）+ 商品 + 品牌两个标签
  // 不参与：regulation（已含在主全域 aggregate）、main_live_base（子集）
  const COUNTED = ["main_live", "product", "brand_live_heat", "brand_crowd_seed"];
  const counted = COUNTED.map((k) => byKind[k]).filter(Boolean);
  const totalCost = +counted.reduce((a, v) => a + v.cost, 0).toFixed(2);
  const totalNet = +counted.reduce((a, v) => a + v.netGmv, 0).toFixed(2);
  const totalPay = +counted.reduce((a, v) => a + v.payGmv, 0).toFixed(2);
  const totalOrders = counted.reduce((a, v) => a + v.orders, 0);

  snapshot.summary = {
    byKind,
    // 口径版本：跨轮比较时用于识别算法变更点。
    // v1 = 修复前（调控被重复计入全账户合计，虚高约 21%）
    // v2 = 修复后（调控单列，不重复计入）
    // v3 = 增加调控（追投/一键起量）赔付判定
    // v4 = 增加主全域赔付（按 base 基座口径，避免与调控重复计入）
    // v5 = 赔付口径纠正（2026-09-23 用户指出）：删除错误的"临界带/目标÷1.2"概念，
    //      触发线按出价方式二选一（ROI 出价→目标ROI×80%；成交出价→目标出价×1.2）；
    //      一键起量不支持成本保障（RTK 9.8.1 第4条），不再参与赔付判定。
    // v6 = 赔付基数剔除一键起量（2026-09-29 用户口径）：商品与直播间赔付一律改用
    //      _primary（主计划自身）口径，起量那部分消耗/成交不进赔付基数。
    caliberVersion: 6,
    caliberNote: "v6：全账户合计 = 主全域 aggregate + 商品 + 品牌（调控与基座单列）；赔付触发按出价方式二选一，无临界带；★赔付基数一律剔除一键起量（用 primary 口径）",
    countedKinds: COUNTED,
    // 调控赔付汇总（按口径分流；仅统计确实触发的）
    regulationComp: (() => {
      const rs = snapshot.regulation || [];
      const trig = rs.filter((r) => r.compTriggered === true);
      const byCal = {};
      for (const r of rs) {
        const k = r.compCaliber || "unknown";
        byCal[k] = byCal[k] || { count: 0, triggered: 0, claimable: 0 };
        byCal[k].count++;
        if (r.compTriggered) { byCal[k].triggered++; byCal[k].claimable += r.compensationEstimate || 0; }
      }
      for (const v of Object.values(byCal)) v.claimable = +v.claimable.toFixed(2);
      return {
        total: rs.length,
        triggeredCount: trig.length,
        claimable: +trig.reduce((a, r) => a + (r.compensationEstimate || 0), 0).toFixed(2),
        byCaliber: byCal,
        expiringSoon: rs.filter((r) => r.guaranteeLeftDays != null && r.guaranteeLeftDays >= 0 && r.guaranteeLeftDays <= 1).length,
        expired: rs.filter((r) => r.guaranteeExpired === true).length,
      };
    })(),
    excludedKinds: {
      regulation: "调控消耗已包含在主全域 aggregate 内，单列展示但不计入合计",
      main_live_base: "基座口径是 aggregate 的子集，仅作展示",
    },
    // 主全域赔付（base 口径）。★ 单列，不计入 aggregate 口径的 byKind，
    //   否则调控消耗会被重复纳入赔付分母。
    // ★ 注意：此处不能用函数内局部变量 mainPlan（它在主全域采集分支内声明，
    //   到 summary 组装时已出作用域）。统一从 snapshot 取。
    //
    // ★★ v6 口径（2026-09-29 用户要求「直播间的同理：赔付不含一键起量」）：
    //   主全域赔付本就取 **base（基座）口径**，而 base 是 aggregate 的纯主计划子集 ——
    //   调控（素材追投 + 一键起量）全部落在 aggregate − base 的差额里，天然被排除。
    //   实测自证：aggregate 7319.20 − base 1134.88 = 6184.32，
    //   其中素材追投 5604.98 + 一键起量 24.22 = 5629.20（差额其余为其他调控维度）。
    //   ⇒ 无需改算法，但必须把「已剔除多少」显式回传，供界面与报告标注，避免读者误以为含起量。
    mainLiveComp: snapshot.mainLiveComp ? (() => {
      const mlPlan = snapshot.faces.mainLive || {};
      const mlc = snapshot.mainLiveComp;
      const aggCost = mlPlan.aggregate?.cost ?? null;
      const baseCostV = mlPlan.base?.cost ?? null;
      const aggNet = mlPlan.aggregate?.netSettle ?? null;
      const baseNet = mlPlan.base?.netSettle ?? null;
      // 调控侧（含一键起量）被排除的量
      const onekeyCost = (snapshot.regulation || [])
        .filter((r) => Number(r.scene) === 1)
        .reduce((a, r) => a + (r.cost || 0), 0);
      return {
        planId: mlPlan.id ?? null,
        planName: mlPlan.name ?? null,
        scope: "base",
        compCaliber: mlc.compCaliber ?? "base",
        compBidType: mlc.compBidType ?? null,
        cost: baseCostV,
        netSettle: baseNet,
        roi: mlc.roi ?? null,
        roiGoal: mlPlan.roiGoal ?? null,
        bid: mlPlan.bid ?? null,
        actualUnitCost: mlc.actualUnitCost ?? null,
        compLine: mlc.compLine ?? null,
        compTriggered: mlc.compTriggered ?? null,
        compensationEstimate: mlc.compensationEstimate ?? null,
        compFormulaValue: mlc.compFormulaValue ?? null,
        roiWithCompensation: mlc.roiWithCompensation ?? null,
        aggregateCompFormulaValue: mlPlan.aggregateCompFormulaValue ?? null,
        // ★ 剔除量（供界面显式标注「赔付基数不含一键起量/调控」）
        compExcludedCost: (aggCost != null && baseCostV != null) ? +(aggCost - baseCostV).toFixed(2) : null,
        compExcludedNet: (aggNet != null && baseNet != null) ? +(aggNet - baseNet).toFixed(2) : null,
        compExcludedOnekeyCost: +onekeyCost.toFixed(2),
        aggregateCost: aggCost,
        note: "按基座(base)口径计算（已剔除调控/一键起量）；推直播间无订单门槛",
      };
    })() : null,
    totalCost, totalNetGmv: totalNet, totalOrders,
    // 整体成交（支付GMV）：与净成交同源同口径，区别是未剔除退款
    totalPayGmv: totalPay,
    totalNetRoi: totalCost ? +(totalNet / totalCost).toFixed(4) : null,
    totalPayRoi: totalCost ? +(totalPay / totalCost).toFixed(4) : null,
    // 退款摊损系数 = 净成交 / 整体成交，越接近 1 说明退款越少
    netToPayRatio: totalPay ? +(totalNet / totalPay).toFixed(4) : null,
    // 口径自证：aggregate - base 应等于调控侧差额
    reconciliation: mainLive ? {
      aggregateCost: mainLive.aggregate.cost,
      baseCost: mainLive.base.cost,
      regulationDelta: +(mainLive.aggregate.cost - mainLive.base.cost).toFixed(2),
      regulationListed: +sumBy(snapshot.regulation, "cost").toFixed(2),
    } : null,
    product: {
      cost: +prodCost.toFixed(2), netSettle: +prodNet.toFixed(2),
      netRoiRaw: prodCost ? +(prodNet / prodCost).toFixed(4) : null,
      // ★ 赔付口径（v6）：基数剔除一键起量，用主计划自身（primary）口径
      compScope: "primary",
      compBaseCost: +prodCompCost.toFixed(2),
      compBaseNetSettle: +prodCompNet.toFixed(2),
      compExcludedCost: prodExcludedCost,
      compExcludedNet: prodExcludedNet,
      compBaseRoi: prodCompCost ? +(prodCompNet / prodCompCost).toFixed(4) : null,
      compensationEstimate: +prodComp.toFixed(2),
      compensationEstimateClaimable: prodCompOnBase,
      netRoiWithCompensation: (prodCompCost && prodCompCost - prodCompOnBase > 0)
        ? +(prodCompNet / (prodCompCost - prodCompOnBase)).toFixed(4) : null,
      // 对照：含起量口径的含赔付净ROI（仅供核对，不用于决策）
      netRoiWithCompensationCarry: prodCost ? +(prodNet / Math.max(1, prodCost - prodComp)).toFixed(4) : null,
      withCompensateField: snapshot.product.filter((x) => x.hasCompensateField).length,
      meetsOrderThreshold: snapshot.product.filter((x) => x.meetsOrderThreshold).length,
    },
  };
  snapshot.errors = errors;
  snapshot.elapsedMs = Date.now() - startedAt;

  fs.writeFileSync(path.join(OUT, "cycle_snapshot.json"), JSON.stringify(snapshot, null, 2), "utf8");
  fs.writeFileSync(path.join(OUT, "cycle_captures.json"), JSON.stringify(captures, null, 2), "utf8");

  log(`采集完成，耗时 ${(snapshot.elapsedMs / 1000).toFixed(1)}s，错误 ${errors.length} 项`);

  /**
   * 调用 Python 脚本。
   * ★ 踩坑 1：Windows 下 spawnSync 把中文路径作为参数传给 python 时，
   *   路径中的中文会因控制台代码页(mbcs)丢失 → "No such file or directory"。
   *   解决：cwd 切到项目根，只传**相对路径**（全 ASCII），并加 -X utf8。
   * ★ 踩坑 2：计划任务环境下 `python` 可能不在 PATH（spawnSync 直接 status=null/errno）。
   *   解决：启动时探测绝对路径作为候选。
   */
  const PY_CANDIDATES = [
    process.env.QC_PYTHON || '',
    'C:/Users/Administrator/AppData/Local/Programs/Python/Python313/python.exe',
    'python',
  ].filter(Boolean);
  let PY = null;
  for (const cand of PY_CANDIDATES) {
    const t = spawnSync(cand, ['-X', 'utf8', '-c', 'print(1)'], { cwd: ROOT, windowsHide: true, encoding: 'utf8', timeout: 15000 });
    if (t.status === 0 && String(t.stdout).trim() === '1') { PY = cand; break; }
  }
  log(`Python 解释器: ${PY || '未找到'}`);

  const runPy = (relScript, extraArgs, timeoutMs) => {
    if (!PY) return { ok: false, status: -1, output: '未找到可用的 python 解释器（已尝试 QC_PYTHON 环境变量、绝对路径、PATH）' };
    const args = ['-X', 'utf8', relScript, ...extraArgs];
    const r = spawnSync(PY, args, {
      cwd: ROOT, windowsHide: true, encoding: 'utf8', timeout: timeoutMs,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    const errMsg = r.error ? `spawnError=${r.error.message}` : '';
    return { ok: r.status === 0, status: r.status, output: `${errMsg}${errMsg && out ? ' | ' : ''}${out}`, err: r.error ? String(r.error.message) : null };
  };

  // 输出目录若在项目根下，转成相对路径（避免中文绝对路径传给 python）
  const relOut = path.relative(ROOT, OUT);
  const outArg = (!relOut.startsWith('..') && !path.isAbsolute(relOut)) ? relOut : OUT;

  // ==================== 6. 入库 ====================
  let imp = { ok: false, output: '' };
  try {
    imp = runPy(path.join('qc_scripts', 'import_cycle_snapshot.py'), ['--dir', outArg, '--apply'], 120000);
    if (!imp.ok && imp.err) imp.output = `${imp.err}\n${imp.output}`;
    log(`入库${imp.ok ? '成功' : `失败(status=${imp.status})`}`);
    if (!imp.ok) log(`  原因: ${String(imp.output).split('\n').slice(-4).join(' | ')}`);
  } catch (e) {
    imp = { ok: false, output: String(e?.message || e) };
    log(`入库异常：${imp.output}`);
  }
  snapshot.import = { ok: imp.ok, output: String(imp.output).slice(-2000) };

  // ==================== 6.5 保障期轮换（★复盘动作，2026-09-24 用户要求）====================
  //   在「入库之后、生成报告之前」执行，这样报告能反映轮换后的真实状态。
  //   只在直播时段跑（凌晨仅商品模式下没有追投计划可轮换）。
  //   脚本自带 dry-run 与三重安全（逐计划独立 / 删前备份 / 删后回查），
  //   失败不阻断复盘：轮换出错仍要出报告。
  let rot = { ok: false, output: "", skipped: false };
  if (ROTATE && !PRODUCT_ONLY) {
    try {
      const rotOut = path.join(OUT, "rotation");
      fs.mkdirSync(rotOut, { recursive: true });
      const r = spawnSync(process.execPath, [
        path.join(ROOT, "qc_scripts", "rotate_chase_guarantee_headless.mjs"),
        "--execute",
        "--out-dir", rotOut,
      ], { cwd: ROOT, windowsHide: true, encoding: "utf8", timeout: 600000 });
      const outTxt = `${r.stdout || ""}${r.stderr || ""}`;
      rot = { ok: r.status === 0, status: r.status, output: outTxt };
      // 摘要一行：命中/成功/失败
      const m = outTxt.match(/成功 (\d+) \/ 失败 (\d+) \/ 跳过 (\d+)/);
      if (m) {
        rot.summary = { verified: Number(m[1]), failed: Number(m[2]), skipped: Number(m[3]) };
        log(`保障期轮换：成功 ${m[1]} / 失败 ${m[2]} / 跳过 ${m[3]}`);
      } else if (/无可轮换计划/.test(outTxt)) {
        rot.summary = { verified: 0, failed: 0, skipped: 0, none: true };
        log("保障期轮换：无可轮换计划");
      } else if (/凭证/.test(outTxt) && /中止/.test(outTxt)) {
        log("保障期轮换：凭证失效，已跳过（不影响复盘）");
        rot.credentialInvalid = true;
      } else {
        log(`保障期轮换：结束 status=${r.status}`);
      }
      if (!rot.ok) log(`  输出: ${outTxt.split("\n").filter(Boolean).slice(-3).join(" | ")}`);
    } catch (e) {
      rot = { ok: false, output: String(e?.message || e) };
      log(`保障期轮换异常：${rot.output}`);
    }
  } else if (ROTATE === false) {
    rot.skipped = true; rot.reason = "--no-rotate";
  } else {
    rot.skipped = true; rot.reason = "product-only 模式";
  }
  snapshot.rotation = {
    ok: rot.ok, skipped: !!rot.skipped, reason: rot.reason,
    summary: rot.summary, credentialInvalid: !!rot.credentialInvalid,
    output: String(rot.output || "").slice(-3000),
  };

  // ==================== 6.6 追投加预算（★复盘动作，2026-09-24 用户要求）====================
  //   规则：净成交ROI ≥ 1.85 且 日预算撑不过未来 2h → 按「前2h消耗」加预算。
  //   纯 HTTP 无浏览器，自带三重护栏（冷却60min / 单日≤原预算×2 / 总池上限）。
  //   失败不阻断复盘。
  let bud = { ok: false, output: "", skipped: false };
  if (BUDGET && !PRODUCT_ONLY) {
    try {
      const r = spawnSync(process.execPath, [
        path.join(ROOT, "qc_scripts", "chase_budget_headless.mjs"),
        "--execute",
        "--out", path.join(OUT, "chase_budget.json"),
      ], { cwd: ROOT, windowsHide: true, encoding: "utf8", timeout: 300000 });
      const outTxt = `${r.stdout || ""}${r.stderr || ""}`;
      bud = { ok: r.status === 0, status: r.status, output: outTxt };
      // ★ 摘要以 JSON 产物为准（解析 stdout 文案易被「1.85」这类数字破坏正则）
      const budJson = path.join(OUT, "chase_budget.json");
      let bj = null;
      try { bj = JSON.parse(fs.readFileSync(budJson, "utf8")); } catch {}
      if (bj) {
        bud.hits = (bj.decisions || []).length;
        bud.applied = (bj.results || []).filter((x) => x.ok).length;
        bud.addedYuan = (bj.results || []).filter((x) => x.ok).reduce((s, x) => s + (x.allow || 0), 0);
        if (bud.hits === 0) log("追投加预算：命中 0 条（无计划满足「净ROI≥1.85 且 预算撑不过2h」）");
        else log(`追投加预算：命中 ${bud.hits} 条，成功 ${bud.applied} 条，合计 +¥${bud.addedYuan}`);
      } else if (/不在执行时段/.test(outTxt)) {
        bud.skippedReason = "非执行时段"; log("追投加预算：非执行时段，跳过");
      } else if (/凭证可能已失效/.test(outTxt)) {
        bud.credentialInvalid = true; log("追投加预算：凭证失效，已跳过（不影响复盘）");
      } else {
        log(`追投加预算：结束 status=${r.status}`);
      }
    } catch (e) {
      bud = { ok: false, output: String(e?.message || e) };
      log(`追投加预算异常：${bud.output}`);
    }
  } else {
    bud.skipped = true; bud.reason = BUDGET ? "product-only 模式" : "--no-budget";
  }
  snapshot.budgetAdd = {
    ok: bud.ok, skipped: !!bud.skipped, reason: bud.reason || bud.skippedReason,
    hits: bud.hits, applied: bud.applied, addedYuan: bud.addedYuan,
    credentialInvalid: !!bud.credentialInvalid,
    output: String(bud.output || "").slice(-3000),
  };

  // ==================== 6.7 一键起量低效替换（★复盘动作，2026-09-27 用户要求）====================
  //   规则：**消耗 > ¥30 且 净ROI < 2** → 删除该一键起量计划，并新建一条。
  //   ★ 平台硬约束：同一时刻只允许存在一条（「已暂停」也算占用）⇒ 必须「先删旧的、再建新的」。
  //   ★ 数据源：**本轮内存里刚采集的 snapshot.regulation（scene=1）**，含真实消耗/成交；
  //     列表接口不返回统计字段，故不能作为数据源（2026-09-27 实测）。
  //   纯 HTTP 无浏览器；自带冷却（8min）。失败不阻断复盘。
  let ok1 = { ok: false, output: "", skipped: false };
  if (ONEKEY && !PRODUCT_ONLY) {
    try {
      // 把本轮采集到的一键起量数据写临时文件，供替换脚本读取（避免时序差）
      const onekeyRows = (snapshot.regulation || []).filter((r) => Number(r.scene) === 1);
      const feedFile = path.join(OUT, "onekey_feed.json");
      fs.writeFileSync(feedFile, JSON.stringify({
        at: new Date().toISOString(),
        items: onekeyRows.map((r) => ({
          id: String(r.id), name: r.name, status: r.status,
          budgetYuan: r.budgetYuan, cost: r.cost, netSettle: r.netSettle,
          netRoi: r.netRoi, orders: r.orders, createTime: r.createTime,
          smartBidType: r.smartBidType ?? 7, externalAction: r.externalAction ?? 169,
        })),
      }, null, 2), "utf8");

      const r = spawnSync(process.execPath, [
        path.join(ROOT, "qc_scripts", "onekey_replace_low_roi.mjs"),
        "--execute",
        "--feed", feedFile,
        "--out-dir", OUT,
      ], { cwd: ROOT, windowsHide: true, encoding: "utf8", timeout: 300000 });
      const outTxt = `${r.stdout || ""}${r.stderr || ""}`;
      ok1 = { ok: r.status === 0, status: r.status, output: outTxt };
      const okJson = path.join(OUT, "onekey_replace.json");
      let oj = null;
      try { oj = JSON.parse(fs.readFileSync(okJson, "utf8")); } catch {}
      if (oj) {
        ok1.hits = oj.hits ?? (oj.target ? 1 : 0);
        ok1.replaced = oj.ok ? 1 : 0;
        ok1.oldName = oj.target?.name;
        ok1.newId = oj.newId || null;
        ok1.cooldown = !!oj.cooldown;
        if (oj.error) ok1.error = oj.error;
        if (oj.recoverHint) ok1.recoverHint = oj.recoverHint;
        if (oj.cooldown) log(`一键起量替换：命中但冷却中（${oj.cooldownGapMin}m < ${oj.cooldownLimitMin}m），本轮不变更`);
        else if (!ok1.hits) log("一键起量替换：无命中（消耗≤¥30 或 ROI≥2）");
        else if (oj.ok) log(`一键起量替换：已替换「${oj.target?.name}」→ 新计划 ${oj.newId}`);
        else log(`一键起量替换：命中但未完成 — ${oj.error || "未知"}`);
      } else {
        log(`一键起量替换：结束 status=${r.status}`);
      }
    } catch (e) {
      ok1 = { ok: false, output: String(e?.message || e) };
      log(`一键起量替换异常：${ok1.output}`);
    }
  } else {
    ok1.skipped = true; ok1.reason = ONEKEY === false ? (ONEKEY_ACTIONS_ENABLED ? "--no-onekey" : ONEKEY_OFF_REASON) : "product-only 模式";
  }
  snapshot.onekeyReplace = {
    ok: ok1.ok, skipped: !!ok1.skipped, reason: ok1.reason,
    hits: ok1.hits, replaced: ok1.replaced, cooldown: !!ok1.cooldown,
    oldName: ok1.oldName, newId: ok1.newId, error: ok1.error, recoverHint: ok1.recoverHint,
    output: String(ok1.output || "").slice(-3000),
  };

  // ==================== 6.8 一键起量加预算（★复盘动作，2026-09-27 用户要求）====================
  //   规则：**净投产(净ROI) ≥ 2 且 (日预算 − 当日累计消耗) < 前 2 小时消耗** → 加预算 = 前 2h消耗。
  //   三重护栏与追投加预算同套（冷却60min / 单日≤原预算×2 / 总池上限；单轮≤¥3000；06:00–24:00）。
  //   ★ 改预算接口：batch_update_budget {ForceAsync:false, AdsData:[{AdId,AdBudget}]}
  //     （update-uni-prom-assist-task 不支持；batch_update_operation 会静默失败）
  //   纯 HTTP 无浏览器；失败不阻断复盘。
  let okb = { ok: false, output: "", skipped: false };
  if (ONEKEY_BUDGET && !PRODUCT_ONLY) {
    try {
      const r = spawnSync(process.execPath, [
        path.join(ROOT, "qc_scripts", "onekey_budget_topup.mjs"),
        "--execute",
        "--out", path.join(OUT, "onekey_budget.json"),
      ], { cwd: ROOT, windowsHide: true, encoding: "utf8", timeout: 300000 });
      const outTxt = `${r.stdout || ""}${r.stderr || ""}`;
      okb = { ok: r.status === 0, status: r.status, output: outTxt };
      const okbJson = path.join(OUT, "onekey_budget.json");
      let bj2 = null;
      try { bj2 = JSON.parse(fs.readFileSync(okbJson, "utf8")); } catch {}
      if (bj2) {
        okb.need = bj2.need ?? 0;
        okb.applied = bj2.applied ?? 0;
        okb.addedYuan = bj2.addedYuan ?? 0;
        okb.cap = bj2.cap; okb.headroom = bj2.headroom;
        if (!okb.need) log("一键起量加预算：命中 0 条（无计划满足「净ROI≥2 且 预算撑不过2h」）");
        else log(`一键起量加预算：命中 ${okb.need} 条，成功 ${okb.applied} 条，合计 +¥${okb.addedYuan}`);
      } else {
        log(`一键起量加预算：结束 status=${r.status}`);
      }
    } catch (e) {
      okb = { ok: false, output: String(e?.message || e) };
      log(`一键起量加预算异常：${okb.output}`);
    }
  } else {
    okb.skipped = true; okb.reason = ONEKEY_BUDGET === false ? (ONEKEY_ACTIONS_ENABLED ? "--no-onekey-budget" : ONEKEY_OFF_REASON) : "product-only 模式";
  }
  snapshot.onekeyBudget = {
    ok: okb.ok, skipped: !!okb.skipped, reason: okb.reason,
    need: okb.need, applied: okb.applied, addedYuan: okb.addedYuan,
    cap: okb.cap, headroom: okb.headroom,
    output: String(okb.output || "").slice(-3000),
  };

  // ==================== 6.9 商品一键起量（★复盘动作，2026-09-28 用户要求）====================
  //   需求：给**所有商品计划**配上「直播间同款」一键起量方案，投产门槛 **≥ 2.2**，
  //         且 **24 小时监控**（不分时段 —— 商品卡全天跑）。
  //   ★ 与直播间版差异：MarGoal=1、PrimaryAID 传商品计划 id、数据源 product_roi2_onekeyspeed，
  //     且**不受 PRODUCT_ONLY 限制**（凌晨也要跑）。
  //   规则：商品计划自身净ROI ≥ 2.2 才配起量；起量后 消耗>¥30 且 净ROI<2.2 → 删旧建新。
  //   纯 HTTP 无浏览器；失败不阻断复盘。
  let pok = { ok: false, output: "", skipped: false };
  if (PRODUCT_ONEKEY) {
    try {
      // 把本轮采集到的商品面数据喂给它（含真实消耗/成交）
      const prodfeed = path.join(OUT, "product_feed.json");
      fs.writeFileSync(prodfeed, JSON.stringify({
        at: new Date().toISOString(),
        items: (snapshot.product || []).map((r) => ({
          id: String(r.id), name: r.name, status: r.status,
          cost: r.cost, netSettle: r.netSettle, netRoi: r.netRoi, orders: r.orders,
        })),
      }, null, 2), "utf8");

      const r = spawnSync(process.execPath, [
        path.join(ROOT, "qc_scripts", "product_onekey_manage.mjs"),
        "--execute",
        "--feed", prodfeed,
        "--out-dir", OUT,
      ], { cwd: ROOT, windowsHide: true, encoding: "utf8", timeout: 600000 });
      const outTxt = `${r.stdout || ""}${r.stderr || ""}`;
      pok = { ok: r.status === 0, status: r.status, output: outTxt };
      const pokJson = path.join(OUT, "product_onekey.json");
      let pj = null;
      try { pj = JSON.parse(fs.readFileSync(pokJson, "utf8")); } catch {}
      if (pj) {
        pok.total = pj.total ?? 0;
        // ★ 修正版（用户 2026-09-28）：所有商品计划都要建起量 → 产物用 byAction 汇总
        const ba = pj.byAction || {};
        pok.todo = (ba.create || 0) + (ba.replace || 0) + (ba.delete_recreate || 0);
        pok.pending = ba.pending || 0;
        pok.keep = ba.keep || 0;
        pok.failed = (pj.results || []).filter((x) => !x.ok).length;
        pok.created = (pj.results || []).filter((x) => x.ok).length;
        if (!pok.total) log("商品一键起量：本轮无商品计划数据");
        else if (pok.todo) log(`商品一键起量：待处置 ${pok.todo} 条，成功 ${pok.created} 条${pok.failed ? `、失败 ${pok.failed} 条` : ""}${pok.pending ? `（${pok.pending} 条待下轮确认）` : ""}`);
        else if (pok.pending) log(`商品一键起量：${pok.pending} 条首轮命中，待下轮确认（本轮不动作）`);
        else log(`商品一键起量：${pok.total} 条商品计划均已在跑（保留 ${pok.keep} 条）`);
      } else {
        log(`商品一键起量：结束 status=${r.status}`);
      }
    } catch (e) {
      pok = { ok: false, output: String(e?.message || e) };
      log(`商品一键起量异常：${pok.output}`);
    }
  } else {
    pok.skipped = true; pok.reason = ONEKEY_ACTIONS_ENABLED ? "--no-product-onekey" : ONEKEY_OFF_REASON;
  }
  snapshot.productOnekey = {
    ok: pok.ok, skipped: !!pok.skipped, reason: pok.reason,
    total: pok.total, todo: pok.todo, created: pok.created,
    keep: pok.keep, pending: pok.pending, failed: pok.failed,
    output: String(pok.output || "").slice(-3000),
  };

  // ==================== 6.10 商品一键起量 · 加预算（★2026-10-01 新增）====================
  //   用户发现商品起量计划净ROI 达标却没加预算 → 排查确认商品侧**从未实现**加预算
  //   （onekey_budget_topup.mjs 只服务直播间）。故新增 product_onekey_budget.mjs。
  //   规则与直播间同口径：净ROI ≥ 2 且 (预算 − 当日消耗) < 前 2h 消耗 → 加前 2h 消耗；
  //   护栏：冷却60min / 单日≤原预算×2 / 单轮≤¥3000 / 06:00–24:00 / 最低¥300。
  //   ★ 用户 2026-10-01 明确：**商品侧没有总池上限，不设 L3**。
  //   也**不受 PRODUCT_ONLY 限制**（商品卡全天跑）。
  //   纯 HTTP 无浏览器；失败不阻断复盘。
  let pkb = { ok: false, output: "", skipped: false };
  if (PRODUCT_ONEKEY && PRODUCT_ONEKEY_BUDGET) {
    try {
      const outF = path.join(OUT, "product_onekey_budget.json");
      const r = spawnSync(process.execPath, [
        path.join(ROOT, "qc_scripts", "product_onekey_budget.mjs"),
        "--execute",
        "--out", outF,
      ], { cwd: ROOT, windowsHide: true, encoding: "utf8", timeout: 600000 });
      const outTxt = `${r.stdout || ""}${r.stderr || ""}`;
      pkb = { ok: r.status === 0, status: r.status, output: outTxt };
      let bj2 = null;
      try { bj2 = JSON.parse(fs.readFileSync(outF, "utf8")); } catch {}
      if (bj2) {
        pkb.candidates = bj2.candidates ?? 0;
        pkb.need = bj2.need ?? 0;
        pkb.applied = bj2.applied ?? 0;
        pkb.addedYuan = bj2.addedYuan ?? 0;
        if (!pkb.candidates) log("商品一键起量加预算：无在跑起量任务");
        else if (!pkb.need) log(`商品一键起量加预算：命中 0 条（${pkb.candidates} 条在跑，净ROI≥2 且预算撑不过 2h 的为空）`);
        else log(`商品一键起量加预算：命中 ${pkb.need} 条，成功 ${pkb.applied} 条，+¥${pkb.addedYuan}`);
      } else {
        log(`商品一键起量加预算：结束 status=${r.status}`);
      }
    } catch (e) {
      pkb = { ok: false, output: String(e?.message || e) };
      log(`商品一键起量加预算异常：${pkb.output}`);
    }
  } else {
    pkb.skipped = true;
    pkb.reason = PRODUCT_ONEKEY_BUDGET === false ? (ONEKEY_ACTIONS_ENABLED ? "--no-product-onekey-budget" : ONEKEY_OFF_REASON) : "--no-product-onekey";
  }
  snapshot.productOnekeyBudget = {
    ok: pkb.ok, skipped: !!pkb.skipped, reason: pkb.reason,
    candidates: pkb.candidates, need: pkb.need, applied: pkb.applied, addedYuan: pkb.addedYuan,
    output: String(pkb.output || "").slice(-3000),
  };

  // ★ 先生成报告所需的数据落地（2026-09-24 修复）：
  //   复盘脚本要读 cycle_snapshot.json 里的 rotation / budgetAdd 才能写出
  //   「本轮已执行动作」章节。此前快照在报告之后才写，导致报告永远读到旧数据、
  //   把已执行的轮换/加预算误报成「只读」。
  fs.writeFileSync(path.join(OUT, "cycle_snapshot.json"), JSON.stringify(snapshot, null, 2), "utf8");

  // ==================== 7. 复盘报告 ====================
  let rev = { ok: false, output: '' };
  try {
    rev = runPy(path.join('qc_scripts', 'qc_cycle_review.py'), ['--dir', outArg], 60000);
    if (!rev.ok && rev.err) rev.output = `${rev.err}\n${rev.output}`;
    log(`复盘${rev.ok ? '报告已生成' : `失败(status=${rev.status})`}`);
    if (!rev.ok) log(`  原因: ${String(rev.output).split('\n').slice(-4).join(' | ')}`);
    else log(`  ${String(rev.output).trim().split('\n').pop()}`);
  } catch (e) {
    rev = { ok: false, output: String(e?.message || e) };
    log(`复盘异常：${rev.output}`);
  }
  snapshot.review = { ok: rev.ok, output: String(rev.output).slice(-1000) };

  // 回写快照（含入库与复盘结果）
  fs.writeFileSync(path.join(OUT, "cycle_snapshot.json"), JSON.stringify(snapshot, null, 2), "utf8");

  console.log(JSON.stringify({
    ok: true, out: OUT, date: DATE, productOnly: PRODUCT_ONLY,
    elapsedMs: snapshot.elapsedMs,
    faces: snapshot.faces,
    summary: snapshot.summary,
    regulationCount: snapshot.regulation.length,
    productCount: snapshot.product.length,
    brandCount: snapshot.brand.length,
    importOk: imp.ok, reviewOk: rev.ok,
    rotation: {
      enabled: ROTATE && !PRODUCT_ONLY,
      skipped: !!rot.skipped, reason: rot.reason,
      summary: rot.summary, credentialInvalid: !!rot.credentialInvalid,
    },
    budgetAdd: {
      enabled: BUDGET && !PRODUCT_ONLY,
      skipped: !!bud.skipped, reason: bud.reason || bud.skippedReason,
      hits: bud.hits, applied: bud.applied, addedYuan: bud.addedYuan,
      credentialInvalid: !!bud.credentialInvalid,
    },
    errors: errors.slice(0, 5),
  }, null, 2));
}

return { run: main };
}
