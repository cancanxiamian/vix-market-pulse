/* ============================================================
   Market Pulse — app.js (Multi-Market Architecture)
   Supports US Stocks, A-Shares, and Gold Markets
   ============================================================ */

'use strict';

// ── Market Configurations ────────────────────────────────────
//
// 【新增板块或指数只需改这里，渲染代码无需改动】
//
// 每个板块的结构：
//   indices[]  股指序列，条数任意（N 条）。字段：
//                key        唯一标识，用作数据管线的键，不可重复
//                volWeight  该品种的典型波动量级，**静态常量**，人工填写。
//                           板块内按 volWeight 升序排出图上的垂直层级
//                           （小的在下），不随行情或时间窗口变化——
//                           若实时计算，切换时间范围时曲线会互相跳位置。
//   fear       恐慌指数（唯一），isFearIndex 标记它不参与起始点标注、
//              不参与最大回撤、单独挂第二根纵轴。
//              low / high 是阈值，**只在此处定义一份**，
//              纵轴范围与底部说明卡片文案都由它派生。
//   cards[]    底部说明卡片。band 为 'high'/'low' 时标题由阈值自动生成，
//              显式给 title 则用于非阈值类卡片。
const MARKETS = {
  us: {
    id: 'us',
    title: 'Market Pulse — 美股',
    sub: '美股三大核心指数、标普500与 VIX 恐慌指数叠加对比',
    chartHint: '左轴: 纳斯达克100 & 标普500 · 右轴: 费城半导体 & VIX（独立刻度）',
    themeClass: 'theme-us',
    indices: [
      { key: 'ndx',  name: '纳斯达克 100', symbol: '^NDX',  desc: '^NDX · 科技龙头指数',  color: '#22d3ee', volWeight: 1.5 },
      { key: 'sox',  name: '费城半导体',   symbol: '^SOX',  desc: '^SOX · 芯片产业指数',  color: '#c084fc', volWeight: 2.5 },
      { key: 'gspc', name: '标普 500',     symbol: '^GSPC', desc: '^GSPC · 标普500大盘',  color: '#F59E0B', volWeight: 1.0 },
    ],
    // 恐慌指数数组（N 个）：同一板块共用第二根纵轴；isPrimary 决定底部说明卡片阈值来源
    fears: [
      {
        key: 'vix', name: 'VIX 恐慌指数', short: 'VIX', symbol: '^VIX',
        desc: 'CBOE 波动率 / 恐慌指标', color: '#7e8fa5',
        isFearIndex: true, isPrimary: true, low: 18, high: 30,
        // colorStops 按历史分位数标定（5/25/50/70/87/93/97/99.5%），中位数 17.6
        colorStops: [
          { v: 11, c: '#3B82F6' },   // 5%    亮蓝（极度自满）
          { v: 14, c: '#14B8A6' },   // 25%   青绿（平静）
          { v: 17.5, c: '#10B981' }, // 50%   绿（中位数）
          { v: 20, c: '#EAB308' },   // 70%   黄（警戒）
          { v: 24, c: '#F97316' },   // 87%   橙（不安）
          { v: 28, c: '#EF4444' },   // 93%   鲜红（恐慌）
          { v: 35, c: '#B91C1C' },   // 97%   深红（危机）
          { v: 50, c: '#DB2777' },   // 99.5% 品红（极端）
        ],
      },
      {
        key: 'vxn', name: 'VXN 恐慌指数', short: 'VXN', symbol: '^VXN',
        desc: '^VXN · CBOE 纳斯达克100 波动率', color: '#8fa3c2',
        isFearIndex: true, isPrimary: false, low: 20, high: 32,
        lineDash: [4, 3], // 线型区分：VIX 实线、VXN 虚线（图例同时体现颜色与线型）
        // 锚点由 .workbuddy/calibrate_fear_stops.js 校准（真实 2514 点分位数）
        colorStops: [
          { v: 13.82, c: '#3B82F6' },  // 5%
          { v: 17.31, c: '#14B8A6' },  // 25%
          { v: 21.09, c: '#10B981' },  // 50%
          { v: 25.64, c: '#EAB308' },  // 70%
          { v: 30.75, c: '#F97316' },  // 87%
          { v: 34.33, c: '#EF4444' },  // 93%
          { v: 37.63, c: '#B91C1C' },  // 97%
          { v: 53.95, c: '#DB2777' },  // 99.5%
        ],
      },
    ],
    cards: [
      { icon: '📌', band: 'high', desc: '情绪高压 / 剧烈洗盘 — 市场波动率急剧飙升，多空剧烈分歧或大波幅震荡' },
      { icon: '📊', band: 'mid',  desc: '温和波动 / 避险升温 — 市场不确定性上升，防守与加仓博弈并存' },
      { icon: '✅', band: 'low',  desc: '低波平稳 / 偏好维持 — 情绪稳定乐观，多头趋势顺畅运行' },
    ],
  },
  cn: {
    id: 'cn',
    title: 'Market Pulse — A股',
    sub: 'A股核心大盘、上证综指、科创50与中国概念恐慌指数叠加对比',
    chartHint: '左轴: 沪深300 & 科创50 · 右轴: 上证指数 & 中国概念恐慌（独立刻度）',
    themeClass: 'theme-cn',
    indices: [
      { key: 'hs300', name: '沪深 300 指数', symbol: '000300.SS', desc: '000300.SS · A股核心大盘', color: '#F59E0B', volWeight: 1.1 },
      { key: 'sse',   name: '上证综合指数',  symbol: '000001.SS', desc: '000001.SS · 上证综指',   color: '#06B6D4', volWeight: 1.0 },
      { key: 'kc50',  name: '科创 50 指数',  symbol: '000688.SS', desc: '000688.SS · 硬科技龙头', color: '#EC4899', volWeight: 1.8 },
    ],
    fears: [
      {
        key: 'vxfxi', name: '中国概念恐慌 (VXFXI)', short: 'VXFXI', symbol: '^VXFXI',
        desc: '^VXFXI · CBOE 中国股票波动率', color: '#7e8fa5',
        isFearIndex: true, isPrimary: true, low: 20, high: 35,
        // 锚点由校准脚本基于 HV 顶替段分位数（^VXFXI 在 Yahoo 仅 1 个真实快照）
        colorStops: [
          { v: 7.59, c: '#3B82F6' },   // 5%
          { v: 10.41, c: '#14B8A6' },  // 25%
          { v: 12.77, c: '#10B981' },  // 50%
          { v: 15.42, c: '#EAB308' },  // 70%
          { v: 21.36, c: '#F97316' },  // 87%
          { v: 27.09, c: '#EF4444' },  // 93%
          { v: 30.14, c: '#B91C1C' },  // 97%
          { v: 46.44, c: '#DB2777' },  // 99.5%
        ],
      },
    ],
    cards: [
      { icon: '🇨🇳', band: 'high', desc: '情绪极端剧烈 / 波动爆表 — 市场处于暴涨狂热或剧烈杀跌期，多空博弈白热化' },
      { icon: '📈', title: '沪深300 / 上证 / 科创50', desc: '蓝筹核心、上证综指与硬科技对照，观察大盘风格切换与板块轮动' },
      { icon: '🛡️', band: 'low',  desc: '波幅回落 / 低波动盘整 — 市场情绪平淡，大盘处于窄幅筑底或休养期' },
    ],
  },
  gold: {
    id: 'gold',
    title: 'Market Pulse — 黄金避险',
    sub: 'COMEX 金银期货价格与黄金恐慌指数 (GVZ) 叠加对比',
    chartHint: '左轴: 黄金期货 · 右轴: 白银期货 & 黄金恐慌（独立刻度）',
    themeClass: 'theme-gold',
    indices: [
      { key: 'gc', name: 'COMEX 黄金期货', symbol: 'GC=F', desc: 'GC=F · 黄金期货 ($/盎司)', color: '#FBBF24', volWeight: 1.0 },
      { key: 'si', name: 'COMEX 白银期货', symbol: 'SI=F', desc: 'SI=F · 白银期货 ($/盎司)', color: '#94A3B8', volWeight: 1.6 },
    ],
    fears: [
      {
        key: 'gvz', name: '黄金恐慌指数 (GVZ)', short: 'GVZ', symbol: '^GVZ',
        desc: '^GVZ · CBOE 黄金波动率', color: '#7e8fa5',
        isFearIndex: true, isPrimary: true, low: 15, high: 25,
        // 锚点由校准脚本基于真实历史 2514 点分位数
        colorStops: [
          { v: 10.67, c: '#3B82F6' },  // 5%
          { v: 12.66, c: '#14B8A6' },  // 25%
          { v: 15.88, c: '#10B981' },  // 50%
          { v: 17.99, c: '#EAB308' },  // 70%
          { v: 22, c: '#F97316' },     // 87%
          { v: 25.53, c: '#EF4444' },  // 93%
          { v: 30.24, c: '#B91C1C' },  // 97%
          { v: 40.48, c: '#DB2777' },  // 99.5%
        ],
      },
    ],
    cards: [
      { icon: '🪙', band: 'high', desc: '避险情绪爆发 / 波动剧烈 — 地缘政治或宏观事件触发金价大波幅博弈' },
      { icon: '⚡', title: '金银比率观照', desc: '黄金与白银走势对照，反映贵金属避险与工业属性异同' },
      { icon: '✨', band: 'low',  desc: '低波盘整 / 情绪平缓 — 避险需求平缓，金价处于平稳休养期' },
    ],
  }
};

// ── 配置派生工具（全部按 N 计算，无任何板块名/指数名硬编码）──────────

// 所有序列（股指 + 恐慌指数），顺序即数据集顺序（恐慌指数支持 N 个）
const seriesOf = (m) => [...m.indices, ...m.fears];

/** 板块主恐慌指数（isPrimary），底部说明卡片与档位阈值只读它 */
const primaryFear = (m) => m.fears.find(f => f.isPrimary) || m.fears[0];

/**
 * 垂直错位系数。
 * SPREAD 是唯一旋钮：无论几条线，最下与最上的总错位跨度恒为 SPREAD。
 * 线越多错位越密，留给曲线自身振幅的空间不变，各时间尺度下画面密度均衡。
 *   step = SPREAD^(1/(N-1))，系数 = step^layer
 * layer 由 volWeight 升序决定（波动小的在下），volWeight 是静态常量，
 * 切换时间范围不会让曲线互相跳位置。
 */
const SPREAD = 1.8;
function layerFactors(m) {
  // N 只计股指条数，恐慌指数绝不参与错位分层（isFearIndex 数据走原始点位管线）
  const n = m.indices.length;
  const step = n > 1 ? Math.pow(SPREAD, 1 / (n - 1)) : 1;
  const order = [...m.indices].sort((a, b) => a.volWeight - b.volWeight);
  const out = {};
  order.forEach((idx, layer) => { out[idx.key] = Math.pow(step, layer); });
  return out;
}

/**
 * 开发模式断言：多恐慌指数板块（如美股 VXN − VIX）若 secondary − primary 价差
 * 持续 3+ 个交易日 < -2，console 警告。正常 secondary（VXN）中枢高于 primary（VIX），
 * 持续负价差通常是数据管线污染（错位系数误乘 / 数据源异常），越早暴露越好。
 */
function checkFearSpreadWarning(aligned, market) {
  if (market.fears.length < 2 || !aligned?.series) return;
  const primary = primaryFear(market);
  const secondary = market.fears.find(f => !f.isPrimary);
  if (!secondary) return;
  const p = aligned.series[primary.key] || [];
  const s = aligned.series[secondary.key] || [];
  let streak = 0;
  for (let i = p.length - 1; i >= 0; i--) {
    if (p[i] == null || s[i] == null || isNaN(p[i]) || isNaN(s[i])) break;
    if (s[i] - p[i] < -2) streak++;
    else break;
  }
  if (streak > 3) {
    console.warn(`[WARN] [开发断言] ${secondary.key} − ${primary.key} 价差连续 ${streak} 个交易日低于 -2（最新 ${fmt(s[s.length-1])}−${fmt(p[p.length-1])}），疑似错位系数/数据源污染`);
  }
}

/**
 * 恐慌指数纵轴范围：按数据来源自适应。
 * - 真实历史点 ≥ THRESHOLD：min=low/1.5, max=high*2.5 —— 常态区间在画布占比更大，
 *   曲线更陡更突出（用户要求，不再兼顾旧验收 5「60 ≤ 70%」；60 约占画布 88%）。
 * - 真实历史点 < THRESHOLD：loadMarketData 已用 20 日滚动波动率顶替，
 *   顶替段值范围约 3~80%，故轴放宽到 min=3, max=120，确保低值不被对数轴截断。
 *   （批次 C 优化点：用户反馈 CN VXFXI 顶替段在原 min=13.3 下不可见。）
 * 该函数即「VIX 陡峭度旋钮」：调 min/max 公式即可放大/压缩常态区间占比。
 */
const FEAR_HV_FALLBACK_THRESHOLD = 10;
/**
 * 恐慌指数共用第二根纵轴，范围取所有恐慌指数并集：
 *   min = min(各自 low) ÷ 1.5，max = max(各自 high) × 4
 * 单个恐慌指数真实点 < THRESHOLD 时走 HV 顶替分支（min 3 / max 120，兼容顶替段范围）。
 * realFearCts 形如 { [fearKey]: 真实点数 }（loadMarketData 在顶替前统计）。
 */
const fearAxisRange = (m, realFearCts = {}) => {
  let min = Infinity, max = -Infinity;
  for (const f of m.fears) {
    const ct = realFearCts[f.key] ?? Infinity;
    if (ct < FEAR_HV_FALLBACK_THRESHOLD) {
      min = Math.min(min, 3);
      max = Math.max(max, 120);
    } else {
      min = Math.min(min, f.low / 1.5);
      max = Math.max(max, f.high * 4);
    }
  }
  if (min === Infinity) return { min: 1, max: 100 };
  return { min, max };
};

/**
 * 恐慌指数曲线情绪色阶：按当前段两端均值用该指数自己的 colorStops 锚点插值。
 * 曲线风格已与股指统一（线宽 2.2 / 无填充 / 最上层）；VXN 等 secondary 用 lineDash 区分。
 */
function makeFearSegment(fearDataArr, stops) {
  return {
    borderColor: (ctx) => {
      const v0 = fearDataArr[ctx.p0DataIndex];
      const v1 = fearDataArr[ctx.p1DataIndex];
      if (v0 == null || v1 == null) return 'rgba(148, 163, 184, 0.45)';
      return getVixColor((v0 + v1) / 2, stops);
    },
    borderDash: (ctx) => {
      const v0 = fearDataArr[ctx.p0DataIndex];
      const v1 = fearDataArr[ctx.p1DataIndex];
      if (v0 == null || v1 == null) return [4, 4];
      return undefined;
    },
  };
}

/** 批次C·需求7：副标题统一文案（替换各板块原有 chartHint） */
const CHART_HINT = '统一基准 = 区间首日 · 对数刻度 · 多线垂直错开 · 恐慌指数为背景情绪层';

const LOCAL_PROXY = '/api/merged?symbol=';

// ── App State ───────────────────────────────────────────────
let currentMarket = 'us';     // 'us' | 'cn' | 'gold'
let currentRange = '1y';     // '1m' | '3m' | '6m' | '1y' | '2y' | '5y'
let chartMode = 'absolute';// 'absolute' | 'pct'（批次C 删除切换按钮后恒为 absolute，pct 分支保留但不可达）
let chartInstance = null;
let currentAligned = null;
let currentSliced = null;
let viewportState = { start: null, end: null };

// 批次B：全量绘图数据（窗口首日归一化=100 × 错位系数）与各序列在基准日的原始值。
// 基准锁定在时间范围按钮对应的起始日（getRangeIndices 的 start），拖拽平移不重算，
// 只有点击时间范围按钮重建 Chart 时才更新（需求文档「冲突 1」推荐方案）。
let currentPlotData = null;   // { [seriesKey]: [归一化×错位值, ...] }，与 aligned 同长
let currentPlotBase = null;   // { [seriesKey]: 基准日原始值 }

/**
 * 批次B·需求1 绘图坐标变换：窗口首日归一化 = 100，再乘错位系数。
 * 只作用于绘图坐标，显示给用户的数值一律回查 aligned.series 原始值（需求3）。
 * 对数轴上整条序列乘常数 = 垂直平移固定像素，曲线形状与斜率完全不变，
 * 因此错位不会破坏陡峭度可比性（需求文档「为什么必须是对数轴」）。
 */
function computePlotData(aligned, market, baseIdx) {
  const factors = layerFactors(market);
  const plot = {}, base = {};
  for (const def of seriesOf(market)) {
    const raw = aligned.series?.[def.key] || [];
    // 基准：baseIdx 处该序列第一个非空值（基准日缺失则向后顺延）
    let b = null;
    for (let i = baseIdx; i < raw.length; i++) {
      if (raw[i] != null && !isNaN(raw[i])) { b = raw[i]; break; }
    }
    base[def.key] = b;
    if (def.isFearIndex === true) {
      // 恐慌指数不归一化、不错位（需求2：用原始点位挂独立轴）
      plot[def.key] = raw.slice();
    } else {
      const f = factors[def.key] || 1;
      plot[def.key] = raw.map(v =>
        (v == null || isNaN(v) || b == null || b === 0) ? null : v / b * 100 * f);
    }
  }
  return { plot, base };
}

/**
 * 批次B·需求1 股指对数轴范围（显式写死，不交给自动缩放）。
 * 对数轴上用比例余量：上下各约 2% 视觉留白（min/max 恒 >0）。
 */
function computeLogRange(plotSeries, market) {
  let min = Infinity, max = -Infinity;
  for (const idx of market.indices) {
    const vals = plotSeries?.[idx.key] || [];
    for (const v of vals) {
      if (v == null || isNaN(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (min === Infinity || max <= 0) return { min: 1, max: 100 };
  const pad = Math.pow(max / min, 0.02);
  return { min: min / pad, max: max * pad };
}

// 按 series 键遍历切片，与序列条数无关
function getSlicedAligned(aligned, start, end) {
  if (!aligned || !aligned.labels || aligned.labels.length === 0) return aligned;
  const total = aligned.labels.length;
  const s = Math.max(0, Math.min(total - 1, start ?? 0));
  const e = Math.max(s, Math.min(total - 1, end ?? (total - 1)));
  const series = {}, pct = {};
  for (const k of Object.keys(aligned.series || {})) series[k] = aligned.series[k].slice(s, e + 1);
  for (const k of Object.keys(aligned.pct || {}))    pct[k]    = aligned.pct[k].slice(s, e + 1);
  return {
    labels: aligned.labels.slice(s, e + 1),
    timestamps: aligned.timestamps.slice(s, e + 1),
    series,
    pct,
    missingFlags: aligned.missingFlags.slice(s, e + 1),
    startIndex: s,
    endIndex: e,
  };
}

// Cache fetched market raw data in memory
const marketDataStore = { us: null, cn: null, gold: null };

// ── LocalCache — localStorage 增量与历史数据缓存模块 ────────────────
const LocalCache = {
  VERSION: 2,
  PREFIX:  'vmp_cache_',
  MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000, // 7 天

  _key(symbol) {
    return this.PREFIX + symbol;
  },

  get(symbol) {
    try {
      const raw = localStorage.getItem(this._key(symbol));
      if (!raw) return null;
      const cache = JSON.parse(raw);
      if (cache.v !== this.VERSION) return null;
      const ageMs = Date.now() - (cache.savedAt * 1000);
      if (ageMs > this.MAX_AGE_MS) {
        localStorage.removeItem(this._key(symbol));
        return null;
      }
      return cache.series; // 返回 [{t, v, source, date}, ...] 数组
    } catch (e) {
      return null;
    }
  },

  set(symbol, series) {
    try {
      const entry = {
        v: this.VERSION,
        savedAt: Math.floor(Date.now() / 1000),
        symbol,
        series,
      };
      localStorage.setItem(this._key(symbol), JSON.stringify(entry));
    } catch (e) {
      console.warn('[WARN] [LocalCache] 写入失败:', e.message);
    }
  },

  clearAll() {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(this.PREFIX)) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  }
};

window.__clearVmpCache = () => LocalCache.clearAll();

// ── Toast 通知与消息提醒 ──────────────────────────────────────────
function showNotice(msg, isWarning = true, duration = 6000) {
  let toast = $('appNoticeToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appNoticeToast';
    toast.className = 'notice-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `${isWarning ? '⚠️' : 'ℹ️'} ${msg}`;
  toast.classList.add('show');
  clearTimeout(showNotice._timer);
  showNotice._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// ── UserSettings — 用户 UI 偏好持久化（localStorage）────────────────
const UserSettings = {
  KEY: 'vmp_user_settings_v1',

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },

  save() {
    try {
      const payload = {
        market: currentMarket,
        range: currentRange,
        chartMode,
        mddEnabled,
        hiddenSeries: JSON.parse(JSON.stringify(hiddenSeries)),
      };
      localStorage.setItem(this.KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('[WARN] [UserSettings] save failed:', e.message);
    }
  },
};

// 图例隐藏状态，按板块分别记忆：{ us: { sox: true }, ... }
// 键与配置里的 series key（indices[].key / fear.key）一致，N 条序列天然适配。
// 切换时间跨度 / 涨跌幅模式都会重建 Chart 实例，若不在此留档，
// 用户手动隐藏的曲线会被数据集默认值重新点亮。
const hiddenSeries = {
  us:   { sox: true, gspc: true }, // 默认隐藏：费城半导体 (sox)、标普 500 (gspc)
  cn:   { sse: true, kc50: true }, // 默认隐藏：上证综合指数 (sse)、科创 50 (kc50)
  gold: { si: true },              // 默认隐藏：COMEX 白银期货 (si)
};

// 旧版（批次A 之前）的隐藏状态键是位置命名（idx1/idx2/idx3/vix/vix2），
// 迁移到新配置 key：idx1→首个股指、idx2→次个、idx3→第三个、vix→fear。
const LEGACY_HIDDEN_KEY_MAP = { idx1: 0, idx2: 1, idx3: 2, vix: 'fear' };
function migrateLegacyHiddenKeys(mktId, legacyKeys, target) {
  const m = MARKETS[mktId];
  if (!m || !legacyKeys) return;
  Object.entries(legacyKeys).forEach(([k, hidden]) => {
    if (hidden !== true) return;
    const pos = LEGACY_HIDDEN_KEY_MAP[k];
    if (pos === 'fear') target[primaryFear(m).key] = true;
    else if (typeof pos === 'number' && m.indices[pos]) target[m.indices[pos].key] = true;
  });
}

// 当前图表数据集下标 → 序列键（配置里的 key，如 ndx/sox/gspc/vix），供图例回写隐藏状态
let currentSeriesKeys = [];

// Crosshair state
const crosshairState = { active: false, x: null, idx: null };

// ── DOM refs ────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const loadingOverlay = $('loadingOverlay');
const errorOverlay = $('errorOverlay');
const errorText = $('errorText');
const retryBtn = $('retryBtn');
const statusBadge = $('statusBadge');
const updateTime = $('updateTime');
const tooltip = $('crosshairTooltip');

// ── Formatting Helpers ──────────────────────────────────────
function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtDate(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function fmtDateDot(ts) {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function fmtDateFull(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

function nowStr() {
  return new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// 涨跌配色遵循 A 股习惯：涨红跌绿（与 .kpi-chg / .tt-chg 一致）
const UP_COLOR = '#f43f5e';
const DOWN_COLOR = '#10b981';
const FLAT_COLOR = '#94a3b8';
const chgColor = (pct) => (pct > 0 ? UP_COLOR : pct < 0 ? DOWN_COLOR : FLAT_COLOR);

// 给颜色加透明度，兼容 '#rrggbb' 与 getVixColor 返回的 'rgb(r,g,b)'
function withAlpha(color, a) {
  if (typeof color !== 'string') return color;
  if (color[0] === '#') {
    return `rgba(${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},${a})`;
  }
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  return m ? `rgba(${m[1]},${m[2]},${m[3]},${a})` : color;
}

// hex(#rrggbb) → {r,g,b}
function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * getVixColor(val, stops)
 * 恐慌指数情绪色：对传入的 colorStops（N 锚点，按 v 升序）做「相邻锚点间 RGB 线性插值」。
 * - 低于首锚点钳到首色，高于末锚点钳到末色
 * - 必须在相邻锚点之间逐段插值（禁止首尾两色直接插值，绿到红的 RGB 中点是脏橄榄色）
 * 取色逻辑一律读配置传入的锚点，不判断指数名称。low/high 阈值不参与取色。
 */
function getVixColor(val, stops) {
  if (val == null || isNaN(val)) return 'rgba(148,163,184,0.5)';
  if (!stops || stops.length === 0) return 'rgba(148,163,184,0.5)';

  if (val <= stops[0].v) return stops[0].c;
  const last = stops[stops.length - 1];
  if (val >= last.v) return last.c;

  // 定位所在区间 [stops[i], stops[i+1]]（stops 保证按 v 升序）
  let i = 0;
  while (i < stops.length - 2 && val > stops[i + 1].v) i++;
  const a = stops[i], b = stops[i + 1];
  const t = (b.v === a.v) ? 0 : (val - a.v) / (b.v - a.v);
  const ca = hexToRgb(a.c), cb = hexToRgb(b.c);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bl = Math.round(ca.b + (cb.b - ca.b) * t);
  return `rgb(${r},${g},${bl})`;
}

// ── Data Fetching Logic ──────────────────────────────────────
function createTimeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    try { return AbortSignal.timeout(ms); } catch (_) {}
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function _backgroundLatestUpdate(symbol) {
  try {
    const isLocalServer = window.location.protocol !== 'file:';
    if (!isLocalServer) return;
    const res = await fetch(LOCAL_PROXY + encodeURIComponent(symbol), {
      signal: createTimeoutSignal(6000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const parsed = parseMergedData(json, symbol);
    if (parsed && parsed.length) {
      LocalCache.set(symbol, parsed);
    }
  } catch (e) {
    console.warn(`[WARN] [_backgroundLatestUpdate failed for ${symbol}]:`, e.message);
    setStatus('最新数据更新受阻（已使用本地数据）', true, true);
    showNotice(`无法连接网络/获取 ${symbol} 最新数据，当前展示本地已缓存历史数据`, true, 6000);
  }
}

async function fetchSymbol(symbol) {
  // ① 优先读取 localStorage 本地历史缓存，极速秒开 (< 10ms)
  const cachedSeries = LocalCache.get(symbol);
  if (cachedSeries && Array.isArray(cachedSeries) && cachedSeries.length > 10) {
    _backgroundLatestUpdate(symbol);
    return cachedSeries.map(d => ({
      t: d.t,
      v: (d.v != null && !isNaN(d.v)) ? d.v : null,
      missing: d.source === 'missing',
      source: d.source || 'yahoo',
    }));
  }

  // ② 无本地缓存时走代理抓取
  const isLocalServer = window.location.protocol !== 'file:';
  if (isLocalServer) {
    try {
      const res = await fetch(LOCAL_PROXY + encodeURIComponent(symbol), {
        signal: createTimeoutSignal(4500)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const parsed = parseMergedData(json, symbol);
      if (parsed && parsed.length) LocalCache.set(symbol, parsed);
      return parsed;
    } catch (e) {
      console.warn(`[WARN] [local proxy fetch failed for ${symbol}]:`, e.message);
      showNotice(`抓取 ${symbol} 最新行情失败: ${e.message}`, true, 6000);
      setStatus(`抓取 ${symbol} 数据失败`, false);
      return [];
    }
  }

  // Fallback CORS proxies for file:// access
  const YAHOO_DIRECT = 'https://query1.finance.yahoo.com/v8/finance/chart/';
  const CORS_PROXIES = [
    (sym) => `https://api.allorigins.win/raw?url=${encodeURIComponent(YAHOO_DIRECT + encodeURIComponent(sym) + '?range=5y&interval=1d&events=history&includePrePost=false')}`,
    (sym) => `https://corsproxy.io/?${encodeURIComponent(YAHOO_DIRECT + encodeURIComponent(sym) + '?range=5y&interval=1d&events=history&includePrePost=false')}`,
  ];

  let lastErr;
  for (const makeUrl of CORS_PROXIES) {
    try {
      const res = await fetch(makeUrl(symbol), { signal: createTimeoutSignal(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const json = JSON.parse(text);
      const parsed = parseYahooJson(json, symbol);
      if (parsed && parsed.length) LocalCache.set(symbol, parsed);
      return parsed;
    } catch (e) {
      lastErr = e;
    }
  }
  return [];
}

function parseYahooJson(json, symbol) {
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  // Keep null values with a 'missing' flag so chart can color gaps grey
  return timestamps
    .filter(t => t != null)
    .map((t, i) => ({
      t,
      v: (closes[i] != null && !isNaN(closes[i])) ? closes[i] : null,
      missing: closes[i] == null || isNaN(closes[i]),
      source: 'yahoo'
    }));
}

// Parse the merged format returned by /api/merged (Yahoo + Stooq merged on server)
function parseMergedData(json, symbol) {
  if (json?.merged && Array.isArray(json.series)) {
    const missingCt = json.series.filter(d => d.source === 'missing').length;
    const backupCt = json.series.filter(d => d.source === 'backup').length;
    // [INFO] 纯数据说明，不是报错：
    //  - 「备选源补全」= 双源合并时用 Stooq/东财等补齐 Yahoo 未覆盖的更早历史，
    //    通常意味着数据范围变长（正常现象）；
    //  - 「缺失点」= 双源都没有报价（多为美股节假日休市，或该指数无备选源），
    //    图表会以灰色断点呈现，属预期行为。
    if (missingCt || backupCt) {
      console.log(`[INFO] ${symbol} 数据说明（非报错）: 缺失 ${missingCt} 点（多为休市日）${backupCt ? `, 备选源扩展历史 ${backupCt} 点` : ''}`);
    }
    // [WARN] 真正的异常信号：同一交易日两源收盘价偏差 > 1%
    if (json.crossValidation?.discrepancies?.length) {
      console.warn(`[WARN] ${symbol} 两源数据校验偏差>1%: ${json.crossValidation.discrepancies.length} 个交易日`, json.crossValidation.discrepancies);
    }
    return json.series.map(d => ({
      t: d.t,
      v: (d.v != null && !isNaN(d.v)) ? d.v : null,
      missing: d.source === 'missing',
      source: d.source || 'yahoo'
    }));
  }
  // Fallback: treat as raw Yahoo format
  return parseYahooJson(json, symbol);
}

// Compute rolling 20-day annualized historical volatility (HV %)
// Skips null values so data gaps don't corrupt the calculation
function calcRollingVolatility(series) {
  if (!series || series.length < 25) return [];
  // Only compute on real (non-null) values
  const valid = series.filter(d => d.v != null && !isNaN(d.v));
  if (valid.length < 25) return [];
  const rets = [];
  for (let i = 1; i < valid.length; i++) {
    const prev = valid[i - 1].v;
    const cur = valid[i].v;
    if (prev && cur && prev !== 0) {
      rets.push({ t: valid[i].t, r: (cur - prev) / prev });
    }
  }
  const hvs = [];
  const WINDOW = 20;
  for (let i = WINDOW - 1; i < rets.length; i++) {
    const sub = rets.slice(i - WINDOW + 1, i + 1);
    const mean = sub.reduce((acc, x) => acc + x.r, 0) / WINDOW;
    const variance = sub.reduce((acc, x) => acc + Math.pow(x.r - mean, 2), 0) / WINDOW;
    const hv = Math.sqrt(variance) * Math.sqrt(252) * 100;
    hvs.push({ t: rets[i].t, v: parseFloat(hv.toFixed(2)), missing: false, source: 'computed' });
  }
  return hvs;
}

async function loadMarketData(marketId) {
  if (marketDataStore[marketId]) {
    return marketDataStore[marketId];
  }

  const market = MARKETS[marketId];
  showLoading(`正在获取 ${market.title} 核心指数与恐慌指标…`);

  // 按配置里的序列顺序并发取数，条数由 indices.length + fears.length 决定
  const defs = seriesOf(market);
  const results = await Promise.all(defs.map(d => fetchSymbol(d.symbol)));

  const raw = {};
  defs.forEach((d, i) => { raw[d.key] = results[i] || []; });

  // 每个恐慌指数单独判断：若无有效历史（如 ^VXFXI 只有实时快照），
  // 用历史点数最多的那条股指算 20 日滚动波动率顶替。
  // rawFears 保留顶替前的原始序列（KPI 显示真实点位用）；
  // realFearCts 记录顶替前真实点数（buildChart 决定 yFear 范围走真 VIX 还是 HV 分支）。
  const rawFears = {};
  const realFearCts = {};
  for (const f of market.fears) {
    const rawFear = raw[f.key] || [];
    const ct = rawFear.filter(d => d.v != null && !isNaN(d.v)).length;
    realFearCts[f.key] = ct;
    rawFears[f.key] = rawFear;
    if (ct < FEAR_HV_FALLBACK_THRESHOLD && market.indices.length) {
      const baseForHv = market.indices
        .map(idx => raw[idx.key] || [])
        .reduce((best, cur) => (cur.filter(d => d.v != null).length > best.filter(d => d.v != null).length ? cur : best));
      raw[f.key] = calcRollingVolatility(baseForHv);
    }
  }

  const marketData = { raw, rawFears, realFearCts };
  marketDataStore[marketId] = marketData;
  return marketData;
}

// ── Filter Range & Align Dates ───────────────────────────────
function applyRange(data, range) {
  const nowTs = Date.now() / 1000;
  let cutoff = 0;

  if (range === 'ytd') {
    const d = new Date();
    const startOfYear = Date.UTC(d.getUTCFullYear(), 0, 1) / 1000;
    cutoff = startOfYear;
  } else {
    const cutoffs = {
      '1m': 30 * 86400,
      '3m': 90 * 86400,
      '6m': 180 * 86400,
      '1y': 365 * 86400,
      '2y': 730 * 86400,
      '5y': 5 * 365 * 86400,
      '10y': 10 * 365 * 86400,
    };
    cutoff = nowTs - (cutoffs[range] || cutoffs['1y']);
  }

  // 逐键过滤，与序列条数无关
  const out = {};
  for (const k of Object.keys(data.raw || {})) {
    out[k] = (data.raw[k] || []).filter(d => d.t >= cutoff);
  }
  return out;
}

// Helper: convert Unix timestamp to YYYY-MM-DD date string
function toDateStr(ts) {
  const d = new Date(ts * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Align dates (Union of natural dates YYYY-MM-DD) ──────────────────────
// filtered 是 { [key]: 序列 } 映射，键的数量即序列条数
function alignData(filtered) {
  const keys = Object.keys(filtered || {});
  const maps = {};
  for (const k of keys) {
    const m = new Map();
    (filtered[k] || []).forEach(d => { if (d.t) m.set(toDateStr(d.t), d); });
    maps[k] = m;
  }

  const dateSet = new Set();
  for (const k of keys) for (const d of maps[k].keys()) dateSet.add(d);
  const allDates = Array.from(dateSet).sort();

  const empty = { labels: [], timestamps: [], series: {}, pct: {}, missingFlags: [] };
  if (allDates.length === 0) {
    keys.forEach(k => { empty.series[k] = []; empty.pct[k] = []; });
    return empty;
  }

  const series = {};
  keys.forEach(k => { series[k] = []; });
  const last = {};
  const commonTimestamps = [], labels = [], missingFlags = [];

  for (const dateStr of allDates) {
    let t = null;
    for (const k of keys) { const e = maps[k].get(dateStr); if (e?.t) { t = e.t; break; } }
    if (t == null) t = new Date(dateStr + 'T12:00:00Z').getTime() / 1000;

    let anyMissing = false;
    for (const k of keys) {
      const e = maps[k].get(dateStr);
      const v = (e?.v != null && !isNaN(e.v)) ? e.v : (last[k] ?? null);   // 前值填充
      if (v != null) last[k] = v; else anyMissing = true;
      series[k].push(v);
    }

    commonTimestamps.push(t);
    labels.push(fmtDate(t));
    missingFlags.push(anyMissing);
  }

  const calcPct = (arr) => {
    if (!arr || arr.length === 0) return [];
    const baseItem = arr.find(v => v != null);
    if (baseItem == null) return arr.map(() => null);
    return arr.map(v => v == null ? null : parseFloat(((v - baseItem) / baseItem * 100).toFixed(2)));
  };
  const pct = {};
  keys.forEach(k => { pct[k] = calcPct(series[k]); });

  return { labels, timestamps: commonTimestamps, series, pct, missingFlags };
}

// ── Compute start/end indices for range selection on full 10-year aligned dataset ─────
function getRangeIndices(aligned, range) {
  if (!aligned || !aligned.timestamps || !aligned.timestamps.length) {
    return { start: 0, end: 0 };
  }
  const total = aligned.timestamps.length;
  const lastTs = aligned.timestamps[total - 1];
  let cutoff = 0;

  if (range === 'ytd') {
    const d = new Date();
    cutoff = Date.UTC(d.getUTCFullYear(), 0, 1) / 1000;
  } else {
    const cutoffs = {
      '1m': 30 * 86400,
      '3m': 90 * 86400,
      '6m': 180 * 86400,
      '1y': 365 * 86400,
      '2y': 730 * 86400,
      '5y': 5 * 365 * 86400,
      '10y': 10 * 365 * 86400,
    };
    const span = cutoffs[range] || cutoffs['1y'];
    cutoff = lastTs - span;
  }

  let startIdx = 0;
  if (range !== '10y') {
    const foundIdx = aligned.timestamps.findIndex(t => t >= cutoff);
    if (foundIdx !== -1) {
      startIdx = foundIdx;
    }
  }

  return {
    start: startIdx,
    end: Math.max(0, total - 1),
  };
}



// ── Render Dynamic UI Components ─────────────────────────────
function renderKPIs(marketConfig, aligned, rawData) {
  const kpiRow = $('kpiRow');

  // 图表时间轴上的最新交易日，用于判定各标的数据是否滞后
  const latestTs = aligned.timestamps?.length ? aligned.timestamps[aligned.timestamps.length - 1] : null;

  const getSeriesChg = (series, fallbackAligned) => {
    // Use only real (non-null) values for last/prev calculation
    if (series && series.length >= 2) {
      const nonNull = series.filter(d => d.v != null && !isNaN(d.v));
      if (nonNull.length >= 2) {
        const c = nonNull[nonNull.length - 1].v;
        const p = nonNull[nonNull.length - 2].v;
        if (p != null && !isNaN(p) && p !== 0) {
          const pct = ((c - p) / p * 100);
          return {
            lastVal: c,
            text: `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
            cls: pct >= 0 ? 'up' : 'down',
            lastTs: nonNull[nonNull.length - 1].t,
          };
        }
      }
    }
    // Fallback: use aligned array (filter nulls)
    const realAligned = (fallbackAligned || []).filter(v => v != null && !isNaN(v));
    const last = realAligned.length ? realAligned[realAligned.length - 1] : 0;
    const prev = realAligned.length >= 2 ? realAligned[realAligned.length - 2] : last;
    const pct = prev !== 0 ? ((last - prev) / prev * 100) : 0;
    return { lastVal: last, text: `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`, cls: pct >= 0 ? 'up' : 'down', lastTs: null };
  };

  // 数据源未提供最新交易日的数据时，KPI 展示的是旧值——必须标出，
  // 否则会被误读成当日行情。
  const staleTag = (chg) => {
    if (!chg?.lastTs || !latestTs || toDateStr(chg.lastTs) === toDateStr(latestTs)) return '';
    return `<span class="kpi-stale" title="数据源未提供 ${toDateStr(latestTs)} 的数据，此处为 ${toDateStr(chg.lastTs)} 收盘值">滞后</span>`;
  };

  // 按配置遍历所有序列（N 条股指 + N 条恐慌指数），顺序 = indices[] + fears[]
  const defs = seriesOf(marketConfig);
  let html = '';
  defs.forEach((def, i) => {
    // 原始序列（含 .t/.v）优先，对齐数组兜底。
    // 恐慌指数优先用顶替前的原始序列（rawFears[key]），数据不足时回退到 raw[key]（可能为波动率补齐）。
    const rawSeries = def.isFearIndex
      ? ((rawData?.rawFears?.[def.key] && rawData.rawFears[def.key].length > 0) ? rawData.rawFears[def.key] : rawData?.raw?.[def.key])
      : rawData?.raw?.[def.key];
    const alignedArr = aligned.series?.[def.key] || [];
    const chg = getSeriesChg(rawSeries, alignedArr);
    const sep = i > 0 ? '<div class="kpi-sep"></div>' : '';
    html += `
    ${sep}<div class="kpi-item" id="card-${def.key}">
      <span class="kpi-dot" style="background:${def.color}"></span>
      <span class="kpi-name">${def.name}</span>
      <span class="kpi-val">${fmt(chg.lastVal)}</span>
      <span class="kpi-chg ${chg.cls}">${chg.text}</span>${staleTag(chg)}
    </div>`;
  });

  kpiRow.innerHTML = html;
  // After DOM settles, auto-scale font to fit all items
  requestAnimationFrame(() => autoScaleKpiBar());
}


function renderAnnotations(marketConfig) {
  const annoBar = $('annotationBar');
  // 底部说明卡片阈值只读 primary 恐慌指数（isPrimary）
  const fear = primaryFear(marketConfig);
  // band 卡片的标题由 fear 阈值派生（low/high 只在配置里定义一份）：
  //   high → "VIX > 30"   mid → "VIX 18–30"   low → "VIX < 18"
  const bandTitle = (band) => {
    if (band === 'high') return `${fear.short} > ${fear.high}`;
    if (band === 'low')  return `${fear.short} < ${fear.low}`;
    return `${fear.short} ${fear.low}–${fear.high}`; // mid
  };
  annoBar.innerHTML = marketConfig.cards.map(item => `
    <div class="anno-item">
      <span class="anno-icon">${item.icon}</span>
      <div>
        <b>${item.title || bandTitle(item.band)}</b> ${item.desc}
      </div>
    </div>
  `).join('');
}

// ── Auto-scale KPI bar font to fit container width (all screen sizes) ─────────────
function autoScaleKpiBar() {
  const bar = document.getElementById('kpiRow');
  if (!bar) return;

  // Reset to default so we can measure natural width
  bar.style.fontSize = '';
  bar.style.gap = '';
  bar.style.paddingTop = '';
  bar.style.paddingBottom = '';
  bar.style.paddingLeft = '';
  bar.style.paddingRight = '';
  void bar.offsetWidth; // force reflow

  const style = getComputedStyle(bar);
  const padL = parseFloat(style.paddingLeft) || 0;
  const padR = parseFloat(style.paddingRight) || 0;
  const padT = parseFloat(style.paddingTop) || 0;
  const padB = parseFloat(style.paddingBottom) || 0;
  const baseFontPx = parseFloat(style.fontSize) || 14;
  const baseGapPx = parseFloat(style.gap) || 16;
  const availW = bar.offsetWidth - padL - padR;
  if (availW <= 0) return;

  const contentW = bar.scrollWidth - padL - padR;
  if (contentW <= availW) return;

  // 卡数越多（美股 5 张）越需要激进缩放：下限 7px font / 1px gap，
  // 同步缩内边距，让百分比基数同步变小。
  const ratio = availW / contentW;
  const newFontPx = Math.max(7, baseFontPx * ratio * 0.97);
  const newGapPx = Math.max(1, baseGapPx * ratio * 0.97);
  const padXRatio = Math.max(8, padL * ratio);
  const padYRatio = Math.max(6, padT * ratio);

  bar.style.fontSize = newFontPx.toFixed(1) + 'px';
  bar.style.gap = newGapPx.toFixed(1) + 'px';
  bar.style.paddingLeft = padXRatio.toFixed(1) + 'px';
  bar.style.paddingRight = padXRatio.toFixed(1) + 'px';
  bar.style.paddingTop = padYRatio.toFixed(1) + 'px';
  bar.style.paddingBottom = padYRatio.toFixed(1) + 'px';
}

// Run on resize
window.addEventListener('resize', autoScaleKpiBar);

// Run whenever KPI bar content changes via ResizeObserver
if (typeof ResizeObserver !== 'undefined') {
  const kpiResizeObserver = new ResizeObserver(() => autoScaleKpiBar());
  const kpiRow = document.getElementById('kpiRow');
  if (kpiRow) kpiResizeObserver.observe(kpiRow);
}

// Mobile-only fine-tune (still kept for .mobile-kpi-bar fallback)
function autoScaleMobileKpi() {
  const bar = document.querySelector('.mobile-kpi-bar');
  if (!bar || window.innerWidth > 768) return;
  if (getComputedStyle(bar).display === 'none') return;

  bar.style.fontSize = '';
  void bar.offsetWidth;

  const items = bar.querySelectorAll('.mobile-kpi-item');
  if (!items.length) return;

  const style = getComputedStyle(bar);
  const padL = parseFloat(style.paddingLeft) || 0;
  const padR = parseFloat(style.paddingRight) || 0;
  const gap = parseFloat(style.gap) || 6;
  const availW = bar.offsetWidth - padL - padR;

  let totalChildW = 0;
  items.forEach(item => { totalChildW += item.offsetWidth; });
  totalChildW += gap * (items.length - 1);

  if (totalChildW > availW && availW > 0) {
    const ratio = availW / totalChildW;
    const basePx = parseFloat(style.fontSize) || 13;
    const newPx = Math.max(7, Math.floor(basePx * ratio * 0.96 * 10) / 10);
    bar.style.fontSize = newPx + 'px';
  }
}

window.addEventListener('resize', autoScaleMobileKpi);

// ── Maximum Drawdown (MDD) Financial Algorithm & Flowing Rainbow Shader ─────
let rainbowHuePhase = 0;
let rainbowAnimFrameId = null;
let mddEnabled = true; // 最大回撤标注开关：默认开启，点击标题右侧「最大回撤」按钮可关闭/开启

function startRainbowAnimationLoop() {
  if (rainbowAnimFrameId) return;
  const animate = () => {
    rainbowHuePhase = (rainbowHuePhase + 1.2) % 360; // Smooth 60FPS hue flow
    if (crosshairState.active && crosshairState.idx != null) {
      drawCrosshairOverlay(crosshairState.idx, crosshairState.x);
    } else {
      drawRainbowOverlayOnly();
    }
    rainbowAnimFrameId = requestAnimationFrame(animate);
  };
  rainbowAnimFrameId = requestAnimationFrame(animate);
}

/**
 * 计算当前视口内可见指数的最大回撤 (Maximum Drawdown)
 */
function calcMaxDrawdown(sliced, market) {
  if (!sliced || !sliced.labels || sliced.labels.length < 2) return null;

  // 只遍历股指（indices[]），恐慌指数（isFearIndex）不参与最大回撤
  const seriesDefs = market.indices
    .map((idx, i) => ({ key: idx.key, name: idx.name, color: idx.color, vals: sliced.series?.[idx.key], dsIdx: i }))
    .filter(s => s.vals && s.vals.length);

  let worstMDD = null;

  for (const s of seriesDefs) {
    if (!chartInstance || !chartInstance.isDatasetVisible(s.dsIdx)) continue;
    const vals = s.vals || [];
    let currentPeakVal = -Infinity;
    let currentPeakIdx = -1;
    let mddVal = 0;
    let bestPeakIdx = -1;
    let bestTroughIdx = -1;

    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];
      if (v == null || isNaN(v)) continue;

      if (v > currentPeakVal) {
        currentPeakVal = v;
        currentPeakIdx = i;
      } else if (currentPeakVal > 0) {
        const dd = (v - currentPeakVal) / currentPeakVal;
        if (dd < mddVal) {
          mddVal = dd;
          bestPeakIdx = currentPeakIdx;
          bestTroughIdx = i;
        }
      }
    }

    if (bestPeakIdx >= 0 && bestTroughIdx > bestPeakIdx) {
      const peakVal = vals[bestPeakIdx];
      const troughVal = vals[bestTroughIdx];
      const mddPct = mddVal * 100;

      if (!worstMDD || mddPct < worstMDD.mddPct) {
        worstMDD = {
          seriesName: s.name,
          seriesColor: s.color,
          dsIdx: s.dsIdx,
          mddPct,
          peakIdx: bestPeakIdx,
          troughIdx: bestTroughIdx,
          peakDate: fmtDateDot(sliced.timestamps[bestPeakIdx]),
          troughDate: fmtDateDot(sliced.timestamps[bestTroughIdx]),
          peakVal,
          troughVal,
          days: Math.max(1, Math.round((sliced.timestamps[bestTroughIdx] - sliced.timestamps[bestPeakIdx]) / 86400)),
        };
      }
    }
  }

  return worstMDD;
}

/**
 * 在 Overlay Canvas 上单独画流动彩虹最大回撤区（无十字线时）
 */
function drawRainbowOverlayOnly() {
  const overlayCanvas = $('crosshairCanvas');
  if (!overlayCanvas || !chartInstance || !currentAligned) return;

  const dpr = window.devicePixelRatio || 1;
  const overlayRect = overlayCanvas.getBoundingClientRect();
  const w = overlayRect.width;
  const h = overlayRect.height;

  if (overlayCanvas.width !== Math.round(w * dpr) || overlayCanvas.height !== Math.round(h * dpr)) {
    overlayCanvas.width = Math.round(w * dpr);
    overlayCanvas.height = Math.round(h * dpr);
  }

  const ctx = overlayCanvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const chartArea = chartInstance.chartArea;
  if (chartArea) {
    const mainChartCanvas = $('mainChart');
    const mainRect = mainChartCanvas.getBoundingClientRect();
    const offsetX = mainRect.left - overlayRect.left;
    const offsetY = mainRect.top - overlayRect.top;
    // 批次C·需求2：恐慌指数阈值参考线（18 / 30，与底部说明卡片阈值一致）
    drawFearThresholdLines(ctx, chartArea, offsetX, offsetY);
    const sliced = currentSliced || currentAligned;
    const mdd = mddEnabled ? calcMaxDrawdown(sliced, MARKETS[currentMarket]) : null;
    if (mdd) {
      drawRainbowDrawdown(ctx, mdd, chartArea, offsetX, offsetY);
    }
  }
  ctx.restore();
}

/**
 * 批次C·需求2：在恐慌指数轴（yFear，对数）的 low / high 阈值位置画两条水平虚线
 * （0.5px，透明度 0.4），与底部三张说明卡片的阈值一致。overlay 自绘，不引入插件。
 */
function drawFearThresholdLines(ctx, chartArea, offsetX, offsetY) {
  if (!chartInstance || !chartInstance.scales || !chartInstance.scales.yFear) return;
  const market = MARKETS[currentMarket];
  const fear = primaryFear(market); // 阈值参考线只画 primary 的 low/high（与说明卡片一致）
  const scale = chartInstance.scales.yFear;
  const caTop = chartArea.top + offsetY;
  const caBottom = chartArea.bottom + offsetY;

  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)'; // 0.5px 虚线 + 0.4 透明度
  for (const v of [fear.low, fear.high]) {
    const y = scale.getPixelForValue(v) + offsetY;
    if (y == null || isNaN(y) || y < caTop - 2 || y > caBottom + 2) continue;
    ctx.beginPath();
    ctx.moveTo(chartArea.left + offsetX, y);
    ctx.lineTo(chartArea.right + offsetX, y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 绘制动态霓虹彩虹流动折线 (Neon Rainbow Flowing Line Pass)
 * 将最大回撤段 (Peak -> Trough) 的走势线本身变为极高醒度、发光的霓虹彩虹流动线条
 */
function drawRainbowDrawdown(ctx, mdd, chartArea, offsetX, offsetY) {
  if (!chartInstance || !mdd) return;

  const meta = chartInstance.getDatasetMeta(mdd.dsIdx);
  if (!meta || !meta.data) return;

  const pts = meta.data;
  const startIdx = Math.min(mdd.peakIdx, mdd.troughIdx);
  const endIdx = Math.max(mdd.peakIdx, mdd.troughIdx);

  if (startIdx < 0 || endIdx >= pts.length || startIdx >= endIdx) return;

  const xPeak = pts[mdd.peakIdx].x + offsetX;
  const xTrough = pts[mdd.troughIdx].x + offsetX;
  const yPeakPt = pts[mdd.peakIdx].y + offsetY;
  const yTroughPt = pts[mdd.troughIdx].y + offsetY;

  const caTop = chartArea.top + offsetY;
  const caBottom = chartArea.bottom + offsetY;
  const width = Math.abs(xTrough - xPeak);
  if (width <= 1) return;

  // 1️⃣ 创建 60FPS 高亮度、高饱和度的霓虹彩虹流动渐变 (Neon HSL Rainbow)
  const xMin = Math.min(xPeak, xTrough);
  const xMax = Math.max(xPeak, xTrough);
  const neonGrad = ctx.createLinearGradient(xMin, 0, xMax, 0);

  const stopsCount = 8;
  for (let i = 0; i <= stopsCount; i++) {
    const ratio = i / stopsCount;
    // 霓虹 HSL: 饱和度 100%, 亮度 65%, 加入时间相位实现波浪式全彩循环
    const hue = (rainbowHuePhase * 1.5 + ratio * 360) % 360;
    neonGrad.addColorStop(ratio, `hsl(${hue}, 100%, 65%)`);
  }

  // 2️⃣ 构建 Peak -> Trough 之间的折线 Path2D 轨迹
  ctx.save();
  ctx.beginPath();
  let first = true;
  for (let i = startIdx; i <= endIdx; i++) {
    const pt = pts[i];
    if (!pt || pt.x == null || pt.y == null || isNaN(pt.x) || isNaN(pt.y)) continue;
    const px = pt.x + offsetX;
    const py = pt.y + offsetY;
    if (first) {
      ctx.moveTo(px, py);
      first = false;
    } else {
      ctx.lineTo(px, py);
    }
  }

  // 3️⃣ Pass 1: 霓虹外发光软晕 Pass (Glow Pass) — 线细、靠 shadowBlur 撑出霓虹光晕
  ctx.shadowColor = `hsl(${(rainbowHuePhase * 1.5) % 360}, 100%, 65%)`;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 3.4;
  ctx.strokeStyle = neonGrad;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  // 4️⃣ Pass 2: 核心强光高亮折线 Pass (Core Bright Pass)
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#ffffff'; // 核心极白提亮
  ctx.stroke();

  ctx.lineWidth = 1.4;
  ctx.strokeStyle = neonGrad;
  ctx.stroke();

  // 5️⃣ 垂直虚线边界指导线
  ctx.beginPath();
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.moveTo(xPeak, caTop);
  ctx.lineTo(xPeak, caBottom);
  ctx.moveTo(xTrough, caTop);
  ctx.lineTo(xTrough, caBottom);
  ctx.stroke();
  ctx.setLineDash([]);

  // 6️⃣ Peak 与 Trough 对应坐标绘制霓虹脉冲发光锚点
  // Peak 锚点 (📌 最高点)
  ctx.shadowColor = '#fbbf24';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(xPeak, yPeakPt, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#fbbf24';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Peak 标签
  ctx.shadowBlur = 0;
  ctx.font = '700 10.5px "JetBrains Mono", sans-serif';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.beginPath();
  ctx.roundRect(xPeak - 24, Math.max(caTop + 4, yPeakPt - 24), 48, 18, 4);
  ctx.fill();
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#fbbf24';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('📌 高点', xPeak, Math.max(caTop + 4, yPeakPt - 24) + 9);

  // Trough 锚点 (📉 低点)
  ctx.shadowColor = '#f43f5e';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(xTrough, yTroughPt, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#f43f5e';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Trough 标签
  ctx.shadowBlur = 0;
  ctx.font = '700 10.5px "JetBrains Mono", sans-serif';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.beginPath();
  ctx.roundRect(xTrough - 24, Math.min(caBottom - 22, yTroughPt + 6), 48, 18, 4);
  ctx.fill();
  ctx.strokeStyle = '#f43f5e';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#f43f5e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('📉 谷底', xTrough, Math.min(caBottom - 22, yTroughPt + 6) + 9);

  // 7️⃣ 顶部居中流光霓虹 Badge ("🌈 最大回撤 -XX.XX%")
  const badgeX = xMin + width / 2;
  const badgeY = caTop + 14;
  const badgeText = `⚡ 最大回撤 ${mdd.mddPct.toFixed(2)}% (${mdd.seriesName})`;
  ctx.font = '700 11px Inter, system-ui, sans-serif';
  const badgeW = ctx.measureText(badgeText).width + 20;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
  ctx.beginPath();
  ctx.roundRect(badgeX - badgeW / 2, badgeY - 10, badgeW, 20, 10);
  ctx.fill();
  ctx.strokeStyle = neonGrad;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, badgeX, badgeY);

  ctx.restore();
}

// ── Overlay Crosshair Canvas Renderer (0ms Lag / 120FPS) ───────────────────
function drawCrosshairOverlay(idx, mouseX) {
  const overlayCanvas = $('crosshairCanvas');
  if (!overlayCanvas || !chartInstance || !currentAligned) return;

  const dpr = window.devicePixelRatio || 1;
  const overlayRect = overlayCanvas.getBoundingClientRect();
  const w = overlayRect.width;
  const h = overlayRect.height;

  if (overlayCanvas.width !== Math.round(w * dpr) || overlayCanvas.height !== Math.round(h * dpr)) {
    overlayCanvas.width = Math.round(w * dpr);
    overlayCanvas.height = Math.round(h * dpr);
  }

  const ctx = overlayCanvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const activeData = currentSliced || currentAligned;
  if (!activeData || idx == null || idx < 0 || idx >= activeData.labels.length) {
    ctx.restore();
    return;
  }

  const chartArea = chartInstance.chartArea;
  if (!chartArea) { ctx.restore(); return; }

  // ── 计算 mainChart canvas 相对于 crosshairCanvas 的偏移量 ──────────────
  // crosshairCanvas: position:absolute top:0 left:0，覆盖整个 chart-wrap（含 padding）
  // mainChart canvas: 受 chart-wrap padding 约束，起始点不在 (0,0)
  // 两个 canvas 的 getBoundingClientRect().left/top 之差即为偏移
  const mainChartCanvas = $('mainChart');
  const mainRect = mainChartCanvas.getBoundingClientRect();
  const offsetX = mainRect.left - overlayRect.left;
  const offsetY = mainRect.top - overlayRect.top;

  // 竖线横坐标由 x 轴换算，不取 dataset 0 的元素位置——它可能已被用户隐藏
  // pt.x/pt.y 是 mainChart 坐标系，转换到 overlayCanvas 坐标系需加偏移
  const rawPointX = chartInstance.scales.x?.getPixelForValue(idx) ?? mouseX;
  const pointX = rawPointX + offsetX;

  // chartArea 边界同样需要偏移到 overlayCanvas 坐标系
  const caLeft = chartArea.left + offsetX;
  const caRight = chartArea.right + offsetX;
  const caTop = chartArea.top + offsetY;
  const caBottom = chartArea.bottom + offsetY;

  // 0️⃣ 先画当前视口的最大回撤彩虹流动区间 (Rainbow Drawdown Zone)
  const mdd = mddEnabled ? calcMaxDrawdown(activeData, MARKETS[currentMarket]) : null;
  if (mdd) {
    drawRainbowDrawdown(ctx, mdd, chartArea, offsetX, offsetY);
  }

  // 批次C·需求2：恐慌指数阈值参考线（18 / 30）
  drawFearThresholdLines(ctx, chartArea, offsetX, offsetY);

  if (rawPointX == null || rawPointX < chartArea.left || rawPointX > chartArea.right) {
    ctx.restore();
    return;
  }

  // 1️⃣ White dashed vertical line
  ctx.beginPath();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.lineWidth = 2.0;
  ctx.moveTo(pointX, caTop);
  ctx.lineTo(pointX, caBottom);
  ctx.stroke();
  ctx.setLineDash([]);


  // 2️⃣ One crisp dot per dataset at the intersection point (skip missing or hidden datasets)
  const market = MARKETS[currentMarket];
  const seriesDefs = seriesOf(market);
  const dsColors = seriesDefs.map(d => d.color);
  const dsVals = seriesDefs.map(d => activeData.series?.[d.key]);

  // 每条曲线记录一个纵轴标签：{ y, color, 值, 相对视口起始日的涨跌幅 }
  const axisLabels = [];

  dsColors.forEach((color, dsIdx) => {
    // 必须用 isDatasetVisible：隐藏状态可能来自数据集配置（重建时恢复），
    // 此时 meta.hidden 仍为 null，直接判断 meta.hidden 会漏掉这种情况
    if (!chartInstance.isDatasetVisible(dsIdx)) return;
    const val = dsVals[dsIdx]?.[idx];
    if (val == null || isNaN(val)) return;
    const meta = chartInstance.getDatasetMeta(dsIdx);
    const pt = meta?.data?.[idx];
    if (!pt || pt.y == null || isNaN(pt.y)) return;

    // 将 mainChart 坐标系的 pt.x/pt.y 转换到 overlayCanvas 坐标系
    const dotX = pt.x + offsetX;
    const dotY = pt.y + offsetY;

    // 恐慌指数（isFearIndex）用各自 colorStops 的情绪色阶着色、且不画横向引导线
    const isFearIdx = seriesDefs[dsIdx]?.isFearIndex === true;
    const dotColor = (isFearIdx && val != null)
      ? getVixColor(val, seriesDefs[dsIdx]?.colorStops)
      : color;

    // 横向引导线：从纵轴延伸到该曲线的交点。
    if (!isFearIdx) {
      ctx.beginPath();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = withAlpha(dotColor, 0.88);
      ctx.lineWidth = 2.2;
      ctx.moveTo(caLeft, dotY);
      ctx.lineTo(dotX, dotY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 涨跌幅基准 = 相比于前一交易日 (Previous Trading Day) 的单日涨跌幅
    let prevVal = null;
    let pIdx = idx - 1;
    const seriesVals = dsVals[dsIdx] || [];
    while (pIdx >= 0 && (seriesVals[pIdx] == null || isNaN(seriesVals[pIdx]))) pIdx--;
    if (pIdx >= 0 && seriesVals[pIdx] != null) prevVal = seriesVals[pIdx];

    axisLabels.push({
      y: dotY,
      color: dotColor,
      val,
      pct: (prevVal != null && prevVal !== 0) ? (val - prevVal) / prevVal * 100 : null,
    });
  });

  // 3️⃣ Date label — drawn BELOW caBottom
  const label = fmtDateFull(activeData.timestamps[idx]);
  ctx.font = '600 11.5px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const textW = ctx.measureText(label).width;
  const padX = 9, bgH = 20;
  const bgW = textW + padX * 2;
  const bgY = caBottom + 4;
  let bgX = pointX - bgW / 2;

  bgX = Math.max(caLeft, Math.min(bgX, caRight - bgW));

  ctx.fillStyle = 'rgba(10, 15, 30, 0.92)';
  ctx.beginPath();
  ctx.roundRect(bgX, bgY, bgW, bgH, 3);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.roundRect(bgX, bgY, bgW, bgH, 3);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, bgX + bgW / 2, bgY + bgH / 2);

  // 4️⃣ 纵轴数值标签（压在最上层，避免被曲线和圆点盖住）
  drawAxisLabels(ctx, axisLabels, caLeft, caTop, caBottom);

  ctx.restore();
}

function computeAxisGutter(sliced, market, isPct) {
  const c = computeAxisGutter._ctx
    || (computeAxisGutter._ctx = document.createElement('canvas').getContext('2d'));
  c.font = '600 11px "JetBrains Mono", monospace';

  // 只测股指（恐慌指数数值量级不同且独占右轴，不占左轴留白）
  const seriesArr = market.indices.map(idx => sliced.series?.[idx.key]);

  let maxW = 0;
  for (const arr of seriesArr) {
    const nn = (arr || []).filter(v => v != null && !isNaN(v));
    if (nn.length < 2) continue;
    const base = nn[0];
    if (!base) continue;
    // 数值与涨跌幅都随 v 单调，极值处的标签最宽，测这两个就够
    for (const v of [Math.min(...nn), Math.max(...nn)]) {
      const pct = (v - base) / base * 100;
      const text = isPct
        ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
        : `${fmt(v, 2)}(${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
      maxW = Math.max(maxW, c.measureText(text).width);
    }
  }
  return maxW === 0 ? 34 : Math.ceil(maxW + 8);
}

/**
 * 在 computeAxisGutter 之上加边界：
 *   下限 34px —— 首位 x 轴日期标签以刻度为中心绘制，需要一半空间否则被裁切
 *   上限 22% 画布宽 —— 窄屏下不让标签栏挤占绘图区（代价是标签可能压到曲线上）
 */
function resolveAxisGutter(sliced, market, isPct) {
  const canvasW = $('mainChart').clientWidth || 800;
  const rawGutter = computeAxisGutter(sliced, market, isPct);
  // 保留充裕的留白宽度（最低 105px），100% 完整容纳 13,283.57(+138.87%) 等数值+百分比文本
  return Math.max(105, Math.min(rawGutter, Math.round(canvasW * 0.35)));
}

/**
 * 在左侧纵轴上为每条曲线绘制一个「值(涨跌幅)」标签，与该曲线的横向引导线同高。
 *
 * 标签边框取曲线自身颜色以便与线一一对应；括号内涨跌幅相对**当前视口起始日**，
 * 涨红跌绿。多条曲线数值接近时自动上下错开，避免标签互相覆盖。
 */
function drawAxisLabels(ctx, labels, caLeft, caTop, caBottom) {
  if (!labels || labels.length === 0) return;

  const isPct = chartMode === 'pct';
  const H = 18, PAD = 5, R = 3, GAP = 2;

  ctx.textBaseline = 'middle';

  const AVAIL = Math.max(80, caLeft - 4);

  // 按给定字号排版，始终包含百分比文本
  const layoutPass = (fontPx) => {
    ctx.font = `600 ${fontPx}px "JetBrains Mono", monospace`;
    let widest = 0;
    for (const L of labels) {
      if (isPct) {
        L.valText = '';
        L.pctText = L.pct == null ? '' : `${L.pct >= 0 ? '+' : ''}${L.pct.toFixed(2)}%`;
      } else {
        L.valText = fmt(L.val, 2);
        L.pctText = L.pct == null ? '' : `(${L.pct >= 0 ? '+' : ''}${L.pct.toFixed(2)}%)`;
      }
      L.wVal = L.valText ? ctx.measureText(L.valText).width : 0;
      L.wPct = L.pctText ? ctx.measureText(L.pctText).width : 0;
      L.w = L.wVal + L.wPct + PAD * 2 + (L.valText && L.pctText ? 3 : 0);
      widest = Math.max(widest, L.w);
    }
    return widest;
  };

  let fontPx = 11;
  let widest = layoutPass(fontPx);

  // 极窄视口下仅按比例缩字号（下限 8.5px），绝不抹除百分比
  if (widest > AVAIL && widest > 0) {
    fontPx = Math.max(8.5, Math.floor(fontPx * AVAIL / widest * 10) / 10);
    widest = layoutPass(fontPx);
  }

  // 防重叠：按 y 升序依次下推，整体超出底边时再统一上移
  const ordered = [...labels].sort((a, b) => a.y - b.y);
  let prevBottom = -Infinity;
  for (const L of ordered) {
    L.top = Math.max(L.y - H / 2, prevBottom + GAP);
    prevBottom = L.top + H;
  }
  const overflow = prevBottom - caBottom;
  if (overflow > 0) ordered.forEach(L => { L.top -= overflow; });
  ordered.forEach(L => { L.top = Math.max(caTop, L.top); });

  for (const L of ordered) {
    const bx = Math.max(1, caLeft - 4 - L.w);   // 右缘贴住纵轴
    const cy = L.top + H / 2;

    ctx.fillStyle = 'rgba(10, 15, 30, 0.95)';
    ctx.beginPath();
    ctx.roundRect(bx, L.top, L.w, H, R);
    ctx.fill();

    ctx.strokeStyle = L.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, L.top, L.w, H, R);
    ctx.stroke();

    ctx.textAlign = 'left';
    let tx = bx + PAD;
    if (L.valText) {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(L.valText, tx, cy);
      tx += L.wVal + 2;
    }
    if (L.pctText) {
      ctx.fillStyle = chgColor(L.pct);
      ctx.fillText(L.pctText, tx, cy);
    }
  }
}

function clearCrosshairOverlay() {
  const overlayCanvas = $('crosshairCanvas');
  if (!overlayCanvas) return;
  const ctx = overlayCanvas.getContext('2d');
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

// Segment callback helpers for line styling & gap coloring
const makeSegment = (datasetData) => ({
  borderColor: (ctx) => {
    const v0 = datasetData[ctx.p0DataIndex];
    const v1 = datasetData[ctx.p1DataIndex];
    if (v0 == null || v1 == null) return 'rgba(148, 163, 184, 0.45)';
    return undefined;
  },
  borderDash: (ctx) => {
    const v0 = datasetData[ctx.p0DataIndex];
    const v1 = datasetData[ctx.p1DataIndex];
    if (v0 == null || v1 == null) return [4, 4];
    return undefined;
  },
});

// 🚀 Lightweight incremental viewport update (60FPS+ Smooth Zoom & Pan, No Re-instantiation)
function updateChartViewport() {
  if (!chartInstance || !currentAligned) return;
  const sliced = getSlicedAligned(currentAligned, viewportState.start, viewportState.end);
  currentSliced = sliced;

  const isPct = chartMode === 'pct';
  const market = MARKETS[currentMarket];
  const defs = seriesOf(market);

  // 拖拽平移时同步更新 KPI 显示
  if (marketDataStore[currentMarket]) {
    renderKPIs(market, sliced, marketDataStore[currentMarket]);
  }

  chartInstance.data.labels = sliced.labels;
  // 视口变化后标签数量随之改变，x 轴锁定的上界要同步（见 buildScales 中的说明）
  if (chartInstance.options.scales.x) {
    chartInstance.options.scales.x.min = 0;
    chartInstance.options.scales.x.max = Math.max(0, sliced.labels.length - 1);
  }

  // 逐数据集更新（顺序 = 配置里的 indices[] + fear）。
  // 批次B·需求1：绘图数据始终取全量归一化×错位序列的视口切片——
  // 归一化基准锁定在时间范围起始日，拖拽平移不重算（冲突1 推荐方案）。
  const viewStart = viewportState.start ?? 0;
  const viewEnd = viewportState.end ?? (currentAligned.labels.length - 1);
  const sliceRange = (arr) => arr ? arr.slice(viewStart, viewEnd + 1) : [];
  const slicedPlot = {};
  for (const k of Object.keys(currentPlotData || {})) slicedPlot[k] = sliceRange(currentPlotData[k]);

  defs.forEach((def, dsIdx) => {
    const values = isPct ? (sliced.pct?.[def.key] || []) : (slicedPlot[def.key] || []);
    const ds = chartInstance.data.datasets[dsIdx];
    if (!ds) return;
    ds.data = values;
    ds.segment = def.isFearIndex === true
      ? makeFearSegment(values, def.colorStops)
      : makeSegment(values);
  });

  // ── 批次B·需求1：股指对数轴范围随视口显式重算（min/max 写死，不交给自动缩放）──
  if (!isPct) {
    const logRange = computeLogRange(slicedPlot, market);
    const yp = chartInstance.options.scales.yPrice;
    if (yp) { yp.min = logRange.min; yp.max = logRange.max; }
  }

  // 缩放平移会改变涨跌幅基准（视口首值），标签宽度随之变化，留白必须跟着重算
  chartInstance.options.layout.padding.left = resolveAxisGutter(sliced, market, isPct);
  chartInstance.options.layout.padding.right = 0;

  chartInstance.update('none');
}

// ── DOM Floating Endpoint Tags (智能自适应外靠/内靠防裁切) ─────────────
function renderEndpointDOMTags(chart) {
  const chartWrap = $('mainChart') ? $('mainChart').parentNode : null;
  if (!chartWrap) return;

  let container = $('endpointDOMTagsContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'endpointDOMTagsContainer';
    container.className = 'endpoint-dom-tags-container';
    chartWrap.appendChild(container);
  }

  const { chartArea } = chart;
  if (!chartArea || !chart.data.datasets || chart.data.datasets.length === 0) {
    container.innerHTML = '';
    return;
  }

  const isPct = chartMode === 'pct';
  const leftItems = [];
  const rightItems = [];

  // 获取 canvas 在 chartWrap 内的真实 offset 偏移，确保 DOM 标签与 Canvas 曲线端点 100% 垂直居中对齐
  const canvasTop = chart.canvas ? (chart.canvas.offsetTop || 0) : 0;
  const canvasLeft = chart.canvas ? (chart.canvas.offsetLeft || 0) : 0;

  // 批次B·需求3：「起终点标注」语义 = 视口最左/最右日（窗口锚点）。
  // 拖拽/缩放后位置永远贴在 chartArea.left/right（视口边缘），值跟视口走。
  // 这样保证：① 标签永远在屏幕上（不因拖拽出视口而消失）
  //          ② 标签值 = 鼠标移到视口最左/最右时的 tooltip 值，两者天然一致
  // 恐慌指数（isFearIndex）起点终点均不标注（Q3）。
  const market = MARKETS[currentMarket];
  const aligned = currentAligned;
  if (!aligned) { container.innerHTML = ''; return; }
  const viewStart = Math.max(0, viewportState.start ?? 0);
  const viewLen = (chart.data.labels || []).length;

  seriesOf(market).forEach((def, dsIdx) => {
    if (def.isFearIndex === true) return;              // 恐慌指数不标
    if (!chart.isDatasetVisible(dsIdx)) return;        // 隐藏序列不标
    const meta = chart.getDatasetMeta(dsIdx);
    if (!meta || !meta.data || meta.data.length === 0) return;
    const color = def.color;
    const seriesVals = aligned.series?.[def.key] || [];

    // 1. 起点 = 视口最左日（meta.data[0]）。位置锁 chartArea.left，值 = seriesVals[viewStart]
    const pt0 = meta.data[0];
    const val0Idx = Math.min(viewStart, seriesVals.length - 1);
    const val0 = seriesVals[val0Idx];
    if (pt0 && pt0.y != null && !isNaN(pt0.y) && val0 != null && !isNaN(val0)) {
      leftItems.push({
        yRaw: canvasTop + pt0.y,
        y: canvasTop + pt0.y,
        x: canvasLeft + chartArea.left,
        text: fmt(val0),
        color
      });
    }

    // 2. 终点 = 视口最右日（meta.data[last]）。位置锁 chartArea.right，值跟到对应索引
    const lastIdx = meta.data.length - 1;
    const ptLast = meta.data[lastIdx];
    const valNIdx = Math.min(viewStart + lastIdx, seriesVals.length - 1);
    const valN = seriesVals[valNIdx];
    if (ptLast && ptLast.y != null && !isNaN(ptLast.y) && valN != null && !isNaN(valN)) {
      rightItems.push({
        yRaw: canvasTop + ptLast.y,
        y: canvasTop + ptLast.y,
        x: canvasLeft + chartArea.right,
        text: fmt(valN),
        color
      });
    }
  });

  // 垂直碰撞避让
  function resolveCollisions(items) {
    if (items.length <= 1) return;
    items.sort((a, b) => a.yRaw - b.yRaw);
    const minGap = 20;
    for (let i = 1; i < items.length; i++) {
      if (items[i].y - items[i - 1].y < minGap) {
        items[i].y = items[i - 1].y + minGap;
      }
    }
  }

  resolveCollisions(leftItems);
  resolveCollisions(rightItems);

  // 测量文本真实宽度的 Canvas Context
  const cCtx = renderEndpointDOMTags._ctx
    || (renderEndpointDOMTags._ctx = document.createElement('canvas').getContext('2d'));
  cCtx.font = '700 11.5px "JetBrains Mono", monospace';

  function measurePillWidth(text) {
    return cCtx.measureText(text).width + 16;
  }

  const wrapW = chartWrap.clientWidth || 800;
  const wrapRect = chartWrap.getBoundingClientRect();
  const screenW = window.innerWidth;

  let html = '';

  // 左侧起点胶囊 (保持向左外靠朝向，若最左侧放不下则向右平滑移进，避免裁切)
  leftItems.forEach(item => {
    const { x, y, text, color } = item;
    const pillW = measurePillWidth(text);

    // 默认向左外靠 (leftPx = x - 4, transform: translate(-100%, -50%))
    let leftPx = x - 4;

    // 检查左侧边缘限制
    const globalLeftOffset = wrapRect.left;
    const minAllowedLeft = Math.max(6, 6 - globalLeftOffset);
    // 胶囊最左侧位置为 leftPx - pillW
    if (leftPx - pillW < minAllowedLeft) {
      leftPx = minAllowedLeft + pillW;
    }

    html += `
      <div class="endpoint-dom-pill" style="
        left: ${leftPx}px;
        top: ${y}px;
        transform: translate(-100%, -50%);
        color: ${color};
        border-color: ${color};
        box-shadow: 0 0 8px ${color}33;
      ">
        ${text}
      </div>
    `;
  });

  // 右侧终点胶囊 (向右延伸展示；若数字太长在占用完右边宽度后会超出边界，则自动向左平移移进)
  rightItems.forEach(item => {
    const { x, y, text, color } = item;
    const pillW = measurePillWidth(text);

    // 默认紧贴端点圆点向右延伸 (4px, transform: translate(0, -50%))
    let leftPx = x + 4;

    // 右侧最大可用边界 (优先使用窗口右侧边缘，保留 10px 边距)
    const maxAllowedRight = screenW - wrapRect.left - 10;
    if (leftPx + pillW > maxAllowedRight) {
      // 允许向左平移移进，确保右端刚好对齐边界，整个数字完整展示
      leftPx = maxAllowedRight - pillW;
    }

    html += `
      <div class="endpoint-dom-pill" style="
        left: ${leftPx}px;
        top: ${y}px;
        transform: translate(0, -50%);
        color: ${color};
        border-color: ${color};
        box-shadow: 0 0 10px ${color}40;
      ">
        ${text}
      </div>
    `;
  });

  container.innerHTML = html;
}

const endpointValueTagsPlugin = {
  id: 'endpointValueTags',
  afterDraw(chart) {
    renderEndpointDOMTags(chart);
  }
};

// ── Chart.js Renderer ────────────────────────────────────────
function buildChart(aligned, resetViewport = false) {
  const ctx = $('mainChart').getContext('2d');
  const market = MARKETS[currentMarket];
  currentAligned = aligned;

  const total = aligned.labels.length;
  if (resetViewport || viewportState.start == null || viewportState.end == null || viewportState.start >= total) {
    viewportState.start = 0;
    viewportState.end = Math.max(0, total - 1);
  }

  const sliced = getSlicedAligned(aligned, viewportState.start, viewportState.end);
  currentSliced = sliced;

  function hexToRgba(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  const defs = seriesOf(market);

  // 批次B·需求1：计算全量绘图数据（归一化×错位），基准 = 时间范围按钮对应起始日。
  // 只有重建 Chart（切板块/切范围）才重算基准；拖拽平移只切视口，基准不重算。
  const rangeIdx = getRangeIndices(aligned, currentRange);
  const { plot: fullPlot, base: plotBase } = computePlotData(aligned, market, rangeIdx.start);
  currentPlotData = fullPlot;
  currentPlotBase = plotBase;

  // 开发模式断言：多恐慌指数板块若 secondary − primary 价差持续 3+ 交易日 < -2，console 警告。
  // 正常 VXN 中枢高于 VIX，价差为负通常是数据管线污染（如错位系数误乘），及早暴露。
  checkFearSpreadWarning(aligned, market);

  // 当前视口切片（相对全量的偏移索引）
  const viewStart = viewportState.start ?? rangeIdx.start;
  const viewEnd = viewportState.end ?? rangeIdx.end;
  const sliceRange = (arr) => arr ? arr.slice(viewStart, viewEnd + 1) : [];
  const slicedPlot = {};
  for (const k of Object.keys(fullPlot)) slicedPlot[k] = sliceRange(fullPlot[k]);

  // 股指对数轴范围（视口内显式写死，批次B·需求1）
  const logRange = computeLogRange(slicedPlot, market);

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const isPct = chartMode === 'pct';

  const axisGutter = resolveAxisGutter(sliced, market, isPct);

  // 恢复该板块此前手动隐藏的曲线；无记录则用各自默认值（hiddenSeries 初始化即含默认隐藏）
  const stored = hiddenSeries[market.id] || (hiddenSeries[market.id] = {});
  const wasHidden = (key) => stored[key] ?? false;

  // 各恐慌指数真实点数（顶替前）：决定 fearAxisRange 走真 VIX 范围还是 HV 顶替范围。
  // 取自 marketDataStore.realFearCts（loadMarketData 在 HV 顶替前统计），
  // 不要用 slicedPlot[fearKey]——顶替后全是 HV 点，无法反映真实可用数据量。
  const realFearCts = marketDataStore[market.id]?.realFearCts ?? {};
  const fa = fearAxisRange(market, realFearCts);

  // 数据集顺序 = 配置里的 indices[] + fears[]，条数任意（N 泛化）
  const seriesKeys = defs.map(d => d.key);
  const datasets = defs.map((def, i) => {
    const isFear = def.isFearIndex === true;
    const values = isPct ? (sliced.pct?.[def.key] || []) : (slicedPlot[def.key] || []);
    return {
      label: isFear ? `${def.name}` : `${def.name} (${def.symbol})`,
      data: values,
      // 恐慌指数线风格与股指统一：线宽 2.2、不透明、无填充、tension 0.35；
      // 颜色由 makeFearSegment 按该指数自己的 colorStops 情绪色阶逐段渲染。
      borderColor: def.color,
      backgroundColor: undefined,
      borderWidth: 2.2,
      // 线型区分恐慌指数身份（VIX 实线 / VXN 虚线），图例同步体现颜色+线型
      borderDash: (isFear && def.lineDash) ? def.lineDash : undefined,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      tension: 0.35,
      spanGaps: true,
      normalized: true,
      segment: isFear ? makeFearSegment(values, def.colorStops) : makeSegment(values),
      yAxisID: isPct ? 'yShared' : (isFear ? 'yFear' : 'yPrice'),
      // 恐慌指数绘制在最上层（与股指一致的视觉优先级，便于看清情绪色）
      order: isFear ? defs.length + 1 : i + 2,
      hidden: wasHidden(def.key),
    };
  });

  currentSeriesKeys = seriesKeys;

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: sliced.labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      normalized: true,
      animation: false,
      events: ['click'],
      hover: { mode: null },
      interaction: { mode: undefined },
      plugins: {
        legend: {
          display: true, position: 'top', align: 'start',
          labels: {
            color: '#94a3b8',
            font: { family: 'Inter', size: 12 },
            boxWidth: 16, boxHeight: 3, padding: 20,
            // usePointStyle: false → 图例以横线段绘制，dataset.borderDash 的线型（VIX 实线 / VXN 虚线）可同步体现
            usePointStyle: false,
          },
          // 保留 Chart.js 默认的显隐切换，额外把结果记进 hiddenSeries，
          // 使切换时间跨度 / 涨跌幅模式重建图表后仍保持用户的选择
          onClick: (e, legendItem, legend) => {
            const ci = legend.chart;
            const dsIdx = legendItem.datasetIndex;
            if (ci.isDatasetVisible(dsIdx)) ci.hide(dsIdx);
            else ci.show(dsIdx);

            const key = currentSeriesKeys[dsIdx];
            if (key) {
              hiddenSeries[currentMarket][key] = !ci.isDatasetVisible(dsIdx);
              UserSettings.save();
            }

            // 隐藏的曲线不该再出现在十字线标签里
            clearCrosshairOverlay();
            tooltip.classList.add('hidden');
          },
        },
        tooltip: { enabled: false },
      },
      onHover: (event, elements, chart) => {
        if (elements && elements.length > 0) {
          positionTooltip(chart);
        }
      },
      layout: {
        // 右侧留白清零 (0px)，走势图曲线绝对铺满延伸到画布最右边缘；
        // 左侧按 resolveAxisGutter 精确预留，保证数值与百分比完整展示
        padding: { left: axisGutter, right: 0, top: 0, bottom: 0 }
      },
      scales: buildScales(isPct, market, sliced, logRange, fa),
      animation: { duration: 250, easing: 'easeOutQuart' },
    },
    plugins: [endpointValueTagsPlugin],
  });


  currentAligned = aligned;

  function buildScales(pct, m, slicedData, logRange, faOverride) {
    const xScale = {
      offset: false,
      bounds: 'data',
      // 锁定为完整视口索引区间。不锁定时，类目轴会按「当前可见数据集」的
      // 实际数据范围自动收缩——例如 10 年跨度下只留科创50（腾讯源仅 1200 天），
      // 轴会缩到后 1200 个索引，而十字线与 afterBuildTicks 仍按 labels 全长
      // 做比例换算，导致竖线位置和 x 轴日期全部错位。
      min: 0,
      max: Math.max(0, (slicedData?.labels?.length || 1) - 1),
      grid: { color: 'rgba(255,255,255,.04)', drawTicks: false },
      ticks: {
        color: '#475569',
        font: { family: 'JetBrains Mono', size: 10 },
        maxRotation: 0,
        autoSkip: false,
      },
      border: { display: false },
      afterBuildTicks: (axis) => {
        const labels = axis.chart.data.labels;
        if (!labels || labels.length === 0) return;
        const total = labels.length;
        if (total <= 2) return;

        const count = 8;
        const ticks = [];
        for (let i = 0; i < count; i++) {
          const idx = Math.min(total - 1, Math.max(0, Math.round(i * (total - 1) / (count - 1))));
          ticks.push({ value: idx, label: labels[idx] });
        }

        const map = new Map();
        ticks.forEach(t => map.set(t.value, t));
        axis.ticks = Array.from(map.values()).sort((a, b) => a.value - b.value);
      }
    };

    // 副 Y 轴：隐藏刻度数字和轴标题
    const hiddenYAxis = (position, drawGrid = false, minVal, maxVal) => {
      const isRight = position === 'right';
      return {
        type: 'linear',
        position,
        ...(isRight ? { display: false } : {}), // 右侧副轴完全不占用画布空间
        ...(minVal != null ? { min: minVal } : {}),
        ...(maxVal != null ? { max: maxVal } : {}),
        grid: drawGrid
          ? { color: 'rgba(255,255,255,.05)', drawTicks: false }
          : { drawOnChartArea: false },
        ticks: { display: false },
        border: { display: false },
        title: { display: false },
        afterFit: (axis) => { axis.width = 0; },
      };
    };

    if (pct) {
      return {
        x: xScale,
        yShared: hiddenYAxis('left', true),
      };
    } else {
      // ── 批次B·需求1 + 批次C·需求2 ─────────────────────────────
      // 股指：共用一根隐藏对数轴 yPrice（窗口首日归一化=100 × 错位系数，
      //       对数轴上乘常数=垂直平移，陡峭度可比）；min/max 显式写死。
      // 恐慌指数：独占一根隐藏对数轴 yFear（原始点位，min/max 由阈值派生）。
      const scales = { x: xScale };

      scales.yPrice = {
        type: 'logarithmic',
        position: 'left',
        grid: { color: 'rgba(255,255,255,.05)', drawTicks: false },
        ticks: { display: false },
        border: { display: false },
        title: { display: false },
        afterFit: (axis) => { axis.width = 0; },
        min: logRange?.min ?? 1,
        max: logRange?.max ?? 100,
      };

      const fa = faOverride || fearAxisRange(m);
      scales.yFear = {
        type: 'logarithmic',
        position: 'right',
        display: false,
        grid: { drawOnChartArea: false },
        ticks: { display: false },
        border: { display: false },
        title: { display: false },
        min: fa.min,
        max: fa.max,
      };
      return scales;
    }
  }
}

// ── Format Tooltip HTML ──────────────────────────────────────
// 批次C·需求4：股指行 = 真实点位 + 区间累计涨跌幅（相对窗口首日原始值）。
// 基准来自 currentPlotBase（buildChart 时锁定在时间范围起始日），拖拽平移不重算。
function fmtRangeHTML(cur, baseVal) {
  if (cur == null || isNaN(cur)) return '<span class="tt-missing">数据缺失</span>';
  const curStr = fmt(cur);
  if (baseVal == null || baseVal === 0) {
    return `${curStr} <span class="tt-chg zero">(区间 +0.00%)</span>`;
  }
  const pct = (cur - baseVal) / baseVal * 100;
  const sign = pct > 0 ? '+' : '';
  const cls = pct > 0 ? 'up' : (pct < 0 ? 'down' : 'zero');
  return `${curStr} <span class="tt-chg ${cls}">(区间 ${sign}${pct.toFixed(2)}%)</span>`;
}

// 批次C·需求4：恐慌指数行 = 原始数值 + 档位文字（<low 低波平稳 / low–high 温和波动 / >high 情绪高压）。
// 低波动=绿、高压=红，与底部说明卡片阈值同源（fear.low/high 配置）。
function fmtBandHTML(cur, fear) {
  if (cur == null || isNaN(cur)) return '<span class="tt-missing">数据缺失</span>';
  const band = cur < fear.low ? '低波平稳' : (cur <= fear.high ? '温和波动' : '情绪高压');
  const cls = cur < fear.low ? 'down' : (cur <= fear.high ? 'zero' : 'up');
  return `${fmt(cur)} <span class="tt-chg ${cls}">${band}</span>`;
}

function updateTooltipContent(chart, idx) {
  const aligned = currentSliced || currentAligned;
  if (!aligned) return;
  const market = MARKETS[currentMarket];
  const isPct = chartMode === 'pct';

  // 同 drawCrosshairOverlay：隐藏可能来自数据集配置，meta.hidden 不可靠
  const isHidden = (dsIdx) => !chart.isDatasetVisible(dsIdx);

  const rows = [];

  // 🌈 计算并呈现当前视口最大回撤 (Compact MDD Card) — 仅在「最大回撤」开关打开时显示
  const mdd = mddEnabled ? calcMaxDrawdown(aligned, market) : null;
  if (mdd && idx >= mdd.peakIdx && idx <= mdd.troughIdx) {
    rows.push(`
      <div class="mdd-tooltip-card">
        <div class="mdd-head">
          <span class="mdd-title">⚡ <b>最大回撤 (${mdd.seriesName})</b></span>
          <span class="mdd-badge">${mdd.mddPct.toFixed(2)}%</span>
        </div>
        <div class="mdd-sub">
          🗓️ ${mdd.peakDate} → ${mdd.troughDate} (${mdd.days}天) &nbsp;•&nbsp; $${fmt(mdd.peakVal)}→$${fmt(mdd.troughVal)}
        </div>
      </div>
    `);
  }

  // 按配置遍历所有序列（N 泛化）；恐慌指数用各自 colorStops 情绪色阶着色、显示档位文字
  const defs = seriesOf(market);
  let dsIdx = 0;

  defs.forEach((def) => {
    if (isHidden(dsIdx)) { dsIdx++; return; }
    const vals = aligned.series?.[def.key] || [];
    const val = vals[idx];
    let dotColor = def.color;
    if (def.isFearIndex === true && val != null && !isNaN(val)) {
      dotColor = getVixColor(val, def.colorStops);
    }
    // 恐慌指数档位文字用各指数自己的 low/high；说明卡片阈值只读 primary，但档位随各指数自身中枢
    const valHtml = (def.isFearIndex === true)
      ? fmtBandHTML(val, def)
      : fmtRangeHTML(val, currentPlotBase?.[def.key]);
    rows.push(`
      <div class="tooltip-row">
        <span class="tt-dot" style="background:${dotColor}"></span>
        <span class="tt-label">${def.name}</span>
        <span class="tt-val">${valHtml}</span>
      </div>`);
    dsIdx++;
  });

  // 同板块有多个恐慌指数时，额外显示「secondary − primary」价差行（美股 VXN − VIX，
  // 正数表示科技股波动溢价，比两个绝对值更有解读价值）
  if (market.fears.length > 1) {
    const primary = primaryFear(market);
    const secondary = market.fears.find(f => !f.isPrimary);
    const pVal = aligned.series?.[primary.key]?.[idx];
    const sVal = secondary ? aligned.series?.[secondary.key]?.[idx] : null;
    if (pVal != null && sVal != null && !isNaN(pVal) && !isNaN(sVal)) {
      const diff = sVal - pVal;
      const cls = diff >= 0 ? 'up' : 'down'; // 溢价为正 → 暖色（A股习惯红涨）
      rows.push(`
        <div class="tooltip-row spread-row">
          <span class="tt-dot" style="background:linear-gradient(90deg, ${secondary.color}, ${primary.color})"></span>
          <span class="tt-label">${secondary.short} − ${primary.short} 价差</span>
          <span class="tt-val">${fmt(diff)} <span class="tt-chg ${cls}">(${diff >= 0 ? '+' : ''}${diff.toFixed(2)})</span></span>
        </div>`);
    }
  }

  $('tooltipRows').innerHTML = rows.join('');
  positionTooltip(chart);
}

function positionTooltip(chart) {
  if (!crosshairState.active || crosshairState.x === null) return;

  tooltip.classList.remove('hidden');
  const ttW = tooltip.offsetWidth || 250;

  const panel = document.querySelector('.chart-panel');
  if (!panel) return;
  const panelRect = panel.getBoundingClientRect();
  const canvasRect = chart.canvas.getBoundingClientRect();

  const canvasLeftInPanel = canvasRect.left - panelRect.left;
  const xInPanel = canvasLeftInPanel + crosshairState.x;

  // 1️⃣ 横向定位：优先 100% 严格垂直居中于悬浮竖线 (xInPanel) 的正上方
  let left = xInPanel - ttW / 2;

  // 左右两侧边界受限保护：若超出右侧或左侧容器，平滑靠边贴壁收拢，尽量保持在竖线上方居中
  left = Math.max(10, Math.min(left, panelRect.width - ttW - 10));

  // 2️⃣ 纵向定位：悬浮在竖线正上方——底边贴着绘图区顶部（绝不遮挡折线），
  //    水平居中于竖线；空间不足时允许向上溢出面板（盖过标题/图例/KPI 栏间隙无妨），
  //    仅钳制在浏览器视口顶边之内
  const canvasTopInPanel = canvasRect.top - panelRect.top;
  const plotTop = canvasTopInPanel + (chart.chartArea ? chart.chartArea.top : 0);
  const ttH = tooltip.offsetHeight || 120;
  const top = Math.max(4 - panelRect.top, plotTop - ttH - 6);

  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

// ── Setup Event Listeners & Tab Switching ────────────────────
function setupTabListeners() {
  document.querySelectorAll('.market-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const marketId = tab.dataset.market;
      if (marketId && marketId !== currentMarket) {
        switchMarket(marketId);
      }
    });
  });

  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activateRange(btn.dataset.range);
    });
  });

  const modeBtn = $('modeToggle');
  if (modeBtn) {
    modeBtn.addEventListener('click', () => {
      chartMode = chartMode === 'absolute' ? 'pct' : 'absolute';
      modeBtn.classList.toggle('active', chartMode === 'pct');
      modeBtn.textContent = chartMode === 'pct' ? '绝对数值' : '涨跌幅 %';

      if (currentAligned) {
        buildChart(currentAligned);
      }
      UserSettings.save();
    });
  }

  // 「最大回撤」开关：点击才渲染彩虹回撤段/高低点锚点/Tooltip 回撤卡片，
  // overlay 动画循环每帧重绘，开关即时生效，无需重建 Chart
  const mddBtn = $('mddToggle');
  if (mddBtn) {
    mddBtn.classList.toggle('active', mddEnabled);
    mddBtn.addEventListener('click', () => {
      mddEnabled = !mddEnabled;
      mddBtn.classList.toggle('active', mddEnabled);
      UserSettings.save();
    });
  }

  // Mousemove, wheel zoom, and drag-to-pan interaction over chart container
  const chartWrap = document.querySelector('.chart-wrap');
  let rAfId = null;

  if (chartWrap) {
    // ── Mousemove (Crosshair & Tooltip) ─────────────────────
    chartWrap.addEventListener('mousemove', (e) => {
      if (!chartInstance || !currentAligned || !currentAligned.labels.length) return;
      const activeData = currentSliced || currentAligned;
      if (!activeData || !activeData.labels.length) return;

      const rect = chartInstance.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const chartArea = chartInstance.chartArea;
      if (!chartArea) return;

      if (mouseX >= chartArea.left && mouseX <= chartArea.right &&
        mouseY >= chartArea.top && mouseY <= chartArea.bottom) {

        const count = activeData.labels.length;
        // 由 x 轴自身做像素→索引换算，而不是按 labels 全长做比例换算：
        // 后者一旦轴范围与 labels 长度不一致（如某些序列被隐藏）就会整体错位。
        // 同理不能用 getDatasetMeta(0) 定位——dataset 0 可能正处于隐藏状态。
        const xScale = chartInstance.scales.x;
        let bestIdx = Math.round(xScale.getValueForPixel(mouseX));
        bestIdx = Math.max(0, Math.min(count - 1, bestIdx));

        crosshairState.active = true;
        crosshairState.idx = bestIdx;
        crosshairState.x = xScale.getPixelForValue(bestIdx) ?? mouseX;

        if (rAfId) cancelAnimationFrame(rAfId);
        rAfId = requestAnimationFrame(() => {
          drawCrosshairOverlay(bestIdx, mouseX);
          updateTooltipContent(chartInstance, bestIdx);
        });
      } else {
        if (crosshairState.active) {
          crosshairState.active = false;
          crosshairState.idx = null;
          crosshairState.x = null;
          clearCrosshairOverlay();
          tooltip.classList.add('hidden');
        }
      }
    });

    chartWrap.addEventListener('mouseleave', () => {
      crosshairState.active = false;
      crosshairState.idx = null;
      crosshairState.x = null;
      clearCrosshairOverlay();
      tooltip.classList.add('hidden');
    });

    // ── TradingView Wheel Zoom (Strictly inside Chart Area only) ──
    chartWrap.addEventListener('wheel', (e) => {
      if (!chartInstance || !currentAligned || !currentAligned.labels.length) return;

      const chartArea = chartInstance.chartArea;
      if (!chartArea) return;

      const rect = chartInstance.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // 严格判定：只有当鼠标指针真正位于折线图 Canvas 核心绘图区 (Chart Area) 内部时，才触发放大缩小
      if (mouseX < chartArea.left || mouseX > chartArea.right ||
        mouseY < chartArea.top || mouseY > chartArea.bottom) {
        return; // 光标位于两侧边缘或外部时，不拦截滚轮，恢复正常页面滚动
      }

      e.preventDefault();

      const total = currentAligned.labels.length;
      if (total <= 5) return;

      const start = viewportState.start ?? 0;
      const end = viewportState.end ?? (total - 1);
      const currentLen = end - start + 1;

      // Wheel direction: e.deltaY < 0 is Zoom In, e.deltaY > 0 is Zoom Out
      const zoomSensitivity = Math.min(0.2, Math.abs(e.deltaY) * 0.0012);
      const factor = e.deltaY < 0 ? (1 - zoomSensitivity) : (1 + zoomSensitivity);
      let targetLen = Math.round(currentLen * factor);
      const minLen = 10;
      const maxLen = total;
      targetLen = Math.max(minLen, Math.min(maxLen, targetLen));

      if (targetLen === currentLen) return;

      let newStart = start, newEnd = end;

      // Ctrl + Wheel: Zoom centered at MOUSE CURSOR
      if ((e.ctrlKey || e.metaKey) && chartArea && mouseX >= chartArea.left && mouseX <= chartArea.right) {
        const ratio = Math.max(0, Math.min(1, (mouseX - chartArea.left) / (chartArea.right - chartArea.left)));
        const pivotIdx = start + ratio * (end - start);
        newStart = Math.round(pivotIdx - ratio * (targetLen - 1));
        newEnd = newStart + targetLen - 1;
      } else {
        // Default Wheel: Zoom anchored at RIGHT EDGE (latest data point)
        newEnd = end;
        newStart = newEnd - targetLen + 1;
      }

      // Clamp boundaries
      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.min(total - 1, newStart + targetLen - 1);
      }
      if (newEnd >= total) {
        newEnd = total - 1;
        newStart = Math.max(0, newEnd - targetLen + 1);
      }

      viewportState.start = newStart;
      viewportState.end = newEnd;

      // 🚀 Incremental smooth redraw
      updateChartViewport();

      if (crosshairState.active) {
        clearCrosshairOverlay();
        tooltip.classList.add('hidden');
      }
    }, { passive: false });

    // ── Mouse & Touch Drag to Pan (Left Click / Touch Dragging) ────────────────
    let isDragging = false;
    let dragStartX = 0;
    let dragStartViewport = { start: 0, end: 0 };

    function startDrag(clientX) {
      if (!chartInstance || !currentAligned || !currentAligned.labels.length) return;
      isDragging = true;
      dragStartX = clientX;
      dragStartViewport = {
        start: viewportState.start ?? 0,
        end: viewportState.end ?? (currentAligned.labels.length - 1)
      };
      chartWrap.classList.add('dragging');
    }

    function moveDrag(clientX) {
      if (!isDragging || !chartInstance || !currentAligned) return;
      const total = currentAligned.labels.length;
      const chartArea = chartInstance.chartArea;
      if (!chartArea) return;

      const deltaX = clientX - dragStartX;
      const currentLen = dragStartViewport.end - dragStartViewport.start + 1;
      const pxPerPoint = (chartArea.right - chartArea.left) / Math.max(1, currentLen - 1);

      const pointOffset = Math.round(deltaX / pxPerPoint);
      if (pointOffset === 0) return;

      let newStart = dragStartViewport.start - pointOffset;
      let newEnd = dragStartViewport.end - pointOffset;

      // Clamp boundary
      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.min(total - 1, newStart + currentLen - 1);
      }
      if (newEnd >= total) {
        newEnd = total - 1;
        newStart = Math.max(0, newEnd - currentLen + 1);
      }

      if (newStart !== viewportState.start || newEnd !== viewportState.end) {
        viewportState.start = newStart;
        viewportState.end = newEnd;
        // 🚀 Incremental smooth redraw
        updateChartViewport();
        clearCrosshairOverlay();
        tooltip.classList.add('hidden');
      }
    }

    function stopDrag() {
      if (isDragging) {
        isDragging = false;
        chartWrap.classList.remove('dragging');
      }
    }

    chartWrap.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const rect = chartInstance.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const chartArea = chartInstance.chartArea;
      if (!chartArea) return;

      if (mouseX >= chartArea.left && mouseX <= chartArea.right &&
        mouseY >= chartArea.top && mouseY <= chartArea.bottom) {
        startDrag(e.clientX);
      }
    });

    window.addEventListener('mousemove', (e) => moveDrag(e.clientX));
    window.addEventListener('mouseup', stopDrag);

    // Touch events for mobile dragging
    chartWrap.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        startDrag(touch.clientX);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (isDragging && e.touches.length === 1) {
        moveDrag(e.touches[0].clientX);
      }
    }, { passive: true });

    window.addEventListener('touchend', stopDrag);
  }
}


async function switchMarket(marketId) {
  if (!MARKETS[marketId]) return;
  currentMarket = marketId;
  UserSettings.save();
  const market = MARKETS[marketId];

  // Update Body Theme & Active Tab Buttons
  document.body.className = market.themeClass;
  document.querySelectorAll('.market-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.market === marketId);
  });

  // Update Chart Title & Hint
  $('chartTitle').textContent = `${market.title.split('—')[1]}指数走势叠加图`;
  // 批次C·需求7：统一副标题文案（不再使用各板块 chartHint）
  $('chartHint').textContent = CHART_HINT;


  // Load Market Data & Render UI
  try {
    const rawData = await loadMarketData(marketId);
    setStatus('数据已加载', true);
    $('updateTime').textContent = `更新: ${nowStr()}`;

    // 不截断底层原始数据，保留全量 10 年历史数据，使手势拖拽可以自由漫游到更早历史
    // 注意传入 rawData.raw（{key: 序列} 映射）；rawData 本身还含 rawFear 等元数据，不可直接对齐
    const aligned = alignData(rawData.raw);
    const rangeIndices = getRangeIndices(aligned, currentRange);
    viewportState.start = rangeIndices.start;
    viewportState.end = rangeIndices.end;

    const sliced = getSlicedAligned(aligned, viewportState.start, viewportState.end);
    renderKPIs(market, sliced, rawData);
    autoScaleMobileKpi();
    renderAnnotations(market);
    buildChart(aligned, false);
  } catch (err) {
    console.error(`[ERROR] [switchMarket error]:`, err);
    showError(`无法加载 ${market.indices[0]?.name || market.id} 数据: ${err.message}`);
  } finally {
    hideLoading();
  }
}

function activateRange(range) {
  currentRange = range;
  UserSettings.save();
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.range === range);
  });

  if (!marketDataStore[currentMarket]) return;

  const rawData = marketDataStore[currentMarket];
  const aligned = alignData(rawData.raw);
  const rangeIndices = getRangeIndices(aligned, range);
  viewportState.start = rangeIndices.start;
  viewportState.end = rangeIndices.end;

  const sliced = getSlicedAligned(aligned, viewportState.start, viewportState.end);
  renderKPIs(MARKETS[currentMarket], sliced, rawData);
  autoScaleMobileKpi();
  buildChart(aligned, false);
}


// ── Overlays & Status ────────────────────────────────────────
function showLoading(msg) {
  loadingOverlay.classList.remove('hidden');
  errorOverlay.classList.add('hidden');
  $('loadingText').textContent = msg || '加载中…';
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
  // 遮罩关闭后页面布局稳定，校准 KPI 与 Canvas 尺寸
  requestAnimationFrame(() => {
    autoScaleKpiBar();
    if (chartInstance) chartInstance.resize();
  });
}

function showError(msg) {
  loadingOverlay.classList.add('hidden');
  errorOverlay.classList.remove('hidden');
  errorText.textContent = msg || '数据加载失败';
}

function setStatus(msg, ok = true, warning = false) {
  statusBadge.innerHTML = `<span class="pulse-dot" style="${warning ? 'background:#f59e0b;box-shadow:0 0 8px #f59e0b' : ''}"></span>${msg}`;
  statusBadge.style.background = ok ? (warning ? 'rgba(245,158,11,.15)' : 'rgba(34,197,94,.12)') : 'rgba(239,68,68,.12)';
  statusBadge.style.borderColor = ok ? (warning ? 'rgba(245,158,11,.4)' : 'rgba(34,197,94,.3)') : 'rgba(239,68,68,.3)';
  statusBadge.style.color = ok ? (warning ? '#fbbf24' : '#86efac') : '#fca5a5';
}

// ── Application Entry ────────────────────────────────────────
async function init() {
  // ① 读取已保存的用户 UI 视图偏好
  const saved = UserSettings.load();
  if (saved) {
    if (saved.market && MARKETS[saved.market]) currentMarket = saved.market;
    if (saved.range) currentRange = saved.range;
    // 批次C·需求5：模式切换按钮已删除，显示模式固定为绝对数值，忽略旧设置
    chartMode = 'absolute';
    if (typeof saved.mddEnabled === 'boolean') mddEnabled = saved.mddEnabled;
    if (saved.hiddenSeries && typeof saved.hiddenSeries === 'object') {
      Object.keys(saved.hiddenSeries).forEach(mktKey => {
        if (hiddenSeries[mktKey] && saved.hiddenSeries[mktKey]) {
          // 旧版位置命名键（idx1/idx2/idx3/vix）先迁移到新配置 key，再合并
          migrateLegacyHiddenKeys(mktKey, saved.hiddenSeries[mktKey], hiddenSeries[mktKey]);
          Object.assign(hiddenSeries[mktKey], saved.hiddenSeries[mktKey]);
        }
      });
    }
  }

  // ② 同步控件的初始 UI 样式（模式切换按钮已随需求5删除，仅同步时间范围）
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.range === currentRange);
  });

  setupTabListeners();
  if (retryBtn) {
    retryBtn.addEventListener('click', () => switchMarket(currentMarket));
  }
  await switchMarket(currentMarket);
  startRainbowAnimationLoop();
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await init();
  } catch (e) {
    console.error('[ERROR] [init crashed]:', e);
    hideLoading();
    showError(`初始化失败: ${e.message}`);
  }
});
