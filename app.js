/* ============================================================
   Market Pulse — app.js (Multi-Market Architecture)
   Supports US Stocks, A-Shares, and Gold Markets
   ============================================================ */

'use strict';

// ── Market Configurations ────────────────────────────────────
const MARKETS = {
  us: {
    id: 'us',
    title: 'Market Pulse — 美股',
    sub: '美股三大核心指数、标普500与 VIX 恐慌指数叠加对比',
    chartHint: '左轴: 纳斯达克100 & 标普500 · 右轴: 费城半导体 & VIX（独立刻度）',
    themeClass: 'theme-us',
    symbols: { vix: '^VIX', idx1: '^NDX', idx2: '^SOX', idx3: '^GSPC' },
    names: { vix: 'VIX 恐慌指数', idx1: '纳斯达克 100', idx2: '费城半导体', idx3: '标普 500' },
    descs: { vix: 'CBOE 波动率 / 恐慌指标', idx1: '^NDX · 科技龙头指数', idx2: '^SOX · 芯片产业指数', idx3: '^GSPC · 标普500大盘' },
    colors: { vix: '#22c55e', idx1: '#22d3ee', idx2: '#c084fc', idx3: '#F59E0B' },
    annotations: [
      { icon: '📌', title: 'VIX > 30', desc: '情绪高压 / 剧烈洗盘 — 市场波动率急剧飙升，多空剧烈分歧或大波幅震荡' },
      { icon: '📊', title: 'VIX 18–30', desc: '温和波动 / 避险升温 — 市场不确定性上升，防守与加仓博弈并存' },
      { icon: '✅', title: 'VIX < 18', desc: '低波平稳 / 偏好维持 — 情绪稳定乐观，多头趋势顺畅运行' }
    ]
  },
  cn: {
    id: 'cn',
    title: 'Market Pulse — A股',
    sub: 'A股核心大盘、上证综指、科创50与中国概念恐慌指数叠加对比',
    chartHint: '左轴: 沪深300 & 科创50 · 右轴: 上证指数 & 中国概念恐慌（独立刻度）',
    themeClass: 'theme-cn',
    symbols: { vix: '^VXFXI', idx1: '000300.SS', idx2: '000001.SS', idx3: '000688.SS' },
    names: { vix: '中国概念恐慌 (VXFXI)', idx1: '沪深 300 指数', idx2: '上证综合指数', idx3: '科创 50 指数' },
    descs: { vix: '^VXFXI · CBOE 中国股票波动率', idx1: '000300.SS · A股核心大盘', idx2: '000001.SS · 上证综指', idx3: '000688.SS · 硬科技龙头' },
    colors: { vix: '#22c55e', idx1: '#F59E0B', idx2: '#06B6D4', idx3: '#EC4899' },
    annotations: [
      { icon: '🇨🇳', title: 'VXFXI > 35', desc: '情绪极端剧烈 / 波动爆表 — 市场处于暴涨狂热或剧烈杀跌期，多空博弈白热化' },
      { icon: '📈', title: '沪深300 / 上证 / 科创50', desc: '蓝筹核心、上证综指与硬科技对照，观察大盘风格切换与板块轮动' },
      { icon: '🛡️', title: 'VXFXI < 20', desc: '波幅回落 / 低波动盘整 — 市场情绪平淡，大盘处于窄幅筑底或休养期' }
    ]
  },
  gold: {
    id: 'gold',
    title: 'Market Pulse — 黄金避险',
    sub: 'COMEX 金银期货价格与黄金恐慌指数 (GVZ) 叠加对比',
    chartHint: '左轴: 黄金期货 · 右轴: 白银期货 & 黄金恐慌（独立刻度）',
    themeClass: 'theme-gold',
    symbols: { vix: '^GVZ', idx1: 'GC=F', idx2: 'SI=F' },
    names: { vix: '黄金恐慌指数 (GVZ)', idx1: 'COMEX 黄金期货', idx2: 'COMEX 白银期货' },
    descs: { vix: '^GVZ · CBOE 黄金波动率', idx1: 'GC=F · 黄金期货 ($/盎司)', idx2: 'SI=F · 白银期货 ($/盎司)' },
    colors: { vix: '#22c55e', idx1: '#FBBF24', idx2: '#94A3B8' },
    annotations: [
      { icon: '🪙', title: 'GVZ > 25', desc: '避险情绪爆发 / 波动剧烈 — 地缘政治或宏观事件触发金价大波幅博弈' },
      { icon: '⚡', title: '金银比率观照', desc: '黄金与白银走势对照，反映贵金属避险与工业属性异同' },
      { icon: '✨', title: 'GVZ < 15', desc: '低波盘整 / 情绪平缓 — 避险需求平缓，金价处于平稳休养期' }
    ]
  }
};

const LOCAL_PROXY = '/api/merged?symbol=';

// ── App State ───────────────────────────────────────────────
let currentMarket = 'us';     // 'us' | 'cn' | 'gold'
let currentRange = '1y';     // '1m' | '3m' | '6m' | '1y' | '2y' | '5y'
let chartMode = 'absolute';// 'absolute' | 'pct'
let chartInstance = null;
let currentAligned = null;
let currentSliced = null;
let viewportState = { start: null, end: null };

function getSlicedAligned(aligned, start, end) {
  if (!aligned || !aligned.labels || aligned.labels.length === 0) return aligned;
  const total = aligned.labels.length;
  const s = Math.max(0, Math.min(total - 1, start ?? 0));
  const e = Math.max(s, Math.min(total - 1, end ?? (total - 1)));
  return {
    labels: aligned.labels.slice(s, e + 1),
    timestamps: aligned.timestamps.slice(s, e + 1),
    vixVals: aligned.vixVals.slice(s, e + 1),
    vix2Vals: (aligned.vix2Vals || []).slice(s, e + 1),
    idx1Vals: aligned.idx1Vals.slice(s, e + 1),
    idx2Vals: aligned.idx2Vals.slice(s, e + 1),
    idx3Vals: (aligned.idx3Vals || []).slice(s, e + 1),
    vixPct: aligned.vixPct.slice(s, e + 1),
    vix2Pct: (aligned.vix2Pct || []).slice(s, e + 1),
    idx1Pct: aligned.idx1Pct.slice(s, e + 1),
    idx2Pct: aligned.idx2Pct.slice(s, e + 1),
    idx3Pct: (aligned.idx3Pct || []).slice(s, e + 1),
    missingFlags: aligned.missingFlags.slice(s, e + 1),
    startIndex: s,
    endIndex: e,
  };
}

// Cache fetched market raw data in memory
const marketDataStore = { us: null, cn: null, gold: null };

// 图例隐藏状态，按板块分别记忆：{ us: { vix: true }, ... }
// 切换时间跨度 / 涨跌幅模式都会重建 Chart 实例，若不在此留档，
// 用户手动隐藏的曲线会被数据集默认值重新点亮。
const hiddenSeries = { us: {}, cn: {}, gold: {} };

// 当前图表数据集下标 → 序列键（idx1/idx2/idx3/vix/vix2），供图例回写隐藏状态
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

function fmtDateFull(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

function nowStr() {
  return new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// 涨跌配色遵循 A 股习惯：涨红跌绿（与 .kpi-chg / .tt-chg 一致）
const UP_COLOR   = '#f43f5e';
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

/**
 * getVixColor(val, marketId)
 * Returns non-linear S-curve gradient for VIX/fear indicators.
 *
 * Financial Volatility Thresholds (Non-linear distribution):
 *   US VIX  : <14 green (calm) … 20 amber (alert) … 27+ red (panic) … 38+ crimson (extreme)
 *   CN VXFXI: <18 green … 25 amber … 32+ red … 45+ crimson
 *   Gold GVZ: <11 green … 16 amber … 22+ red … 30+ crimson
 */
function getVixColor(val, marketId) {
  if (val == null || isNaN(val)) return 'rgba(148,163,184,0.5)';

  const configs = {
    us:   { low: 14, warning: 20, panic: 27, extreme: 38 },
    cn:   { low: 18, warning: 25, panic: 32, extreme: 45 },
    gold: { low: 11, warning: 16, panic: 22, extreme: 30 },
  };

  const { low, warning, panic, extreme } = configs[marketId] || configs.us;

  // Compute non-linear normalized ratio t (0.0 -> 1.0)
  let t = 0;
  if (val <= low) {
    t = Math.max(0, (val / low) * 0.25);
  } else if (val <= warning) {
    t = 0.25 + ((val - low) / (warning - low)) * 0.25;
  } else if (val <= panic) {
    t = 0.50 + Math.pow((val - warning) / (panic - warning), 0.85) * 0.35;
  } else {
    t = 0.85 + Math.min(0.15, ((val - panic) / (extreme - panic)) * 0.15);
  }

  // Smooth Interpolation with 4 Color Keyframes:
  // t=0.00~0.35: Emerald Green (16,185,129) → Yellow-Green (132,204,22)
  // t=0.35~0.55: Yellow-Green → Warning Amber (245,158,11)
  // t=0.55~0.85: Amber → Panic Bright Red (239,68,68)
  // t=0.85~1.00: Bright Red → Extreme Crimson (159,18,57)
  let r, g, b;
  if (t <= 0.35) {
    const s = t / 0.35;
    r = Math.round(16 + s * (132 - 16));
    g = Math.round(185 + s * (204 - 185));
    b = Math.round(129 + s * (22 - 129));
  } else if (t <= 0.55) {
    const s = (t - 0.35) / 0.20;
    r = Math.round(132 + s * (245 - 132));
    g = Math.round(204 + s * (158 - 204));
    b = Math.round(22 + s * (11 - 22));
  } else if (t <= 0.85) {
    const s = (t - 0.55) / 0.30;
    r = Math.round(245 + s * (239 - 245));
    g = Math.round(158 - s * (158 - 68));
    b = Math.round(11 + s * (68 - 11));
  } else {
    const s = Math.min(1, (t - 0.85) / 0.15);
    r = Math.round(239 - s * (239 - 159));
    g = Math.round(68 - s * (68 - 18));
    b = Math.round(68 - s * (68 - 57));
  }

  return `rgb(${r},${g},${b})`;
}

// ── Data Fetching Logic ──────────────────────────────────────
async function fetchSymbol(symbol) {
  const isLocalServer = window.location.protocol !== 'file:';
  if (isLocalServer) {
    try {
      const res = await fetch(LOCAL_PROXY + encodeURIComponent(symbol), {
        signal: AbortSignal.timeout(4500)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return parseMergedData(json, symbol);
    } catch (e) {
      console.warn(`[local proxy fetch failed for ${symbol}]:`, e.message);
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
      const res = await fetch(makeUrl(symbol), { signal: AbortSignal.timeout(18000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const json = JSON.parse(text);
      return parseYahooJson(json, symbol);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('All fetch strategies failed');
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
    if (missingCt || backupCt) {
      console.log(`[data] ${symbol}: ${missingCt} 缺失点, 备选源补全 ${backupCt} 点`);
    }
    if (json.crossValidation?.discrepancies?.length) {
      console.warn(`[数据校验] ${symbol}: ${json.crossValidation.discrepancies.length} 个点两源偏差>1%`, json.crossValidation.discrepancies);
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

  const fetchPromises = [
    fetchSymbol(market.symbols.vix),
    fetchSymbol(market.symbols.idx1),
    fetchSymbol(market.symbols.idx2),
  ];
  if (market.symbols.idx3) fetchPromises.push(fetchSymbol(market.symbols.idx3));
  if (market.symbols.vix2) fetchPromises.push(fetchSymbol(market.symbols.vix2));

  const results = await Promise.all(fetchPromises);
  let ri = 0;
  const vixDataRaw = results[ri++];
  const idx1Data   = results[ri++];
  const idx2Data   = results[ri++];
  const idx3Data   = market.symbols.idx3 ? results[ri++] : null;
  const vix2Data   = market.symbols.vix2 ? results[ri++] : null;

  let vixData = vixDataRaw;
  const realVixCount = vixDataRaw ? vixDataRaw.filter(d => d.v != null && !isNaN(d.v)).length : 0;
  if (realVixCount < 10) {
    const realIdx1 = idx1Data.filter(d => d.v != null).length;
    const realIdx2 = idx2Data.filter(d => d.v != null).length;
    const baseForHv = (realIdx2 > realIdx1) ? idx2Data : idx1Data;
    vixData = calcRollingVolatility(baseForHv);
  }

  const marketData = {
    vix: vixData,
    vix2: vix2Data || null,
    idx1: idx1Data,
    idx2: idx2Data,
    idx3: idx3Data || null,
    rawVix: vixDataRaw,
  };

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

  return {
    vix: data.vix.filter(d => d.t >= cutoff),
    vix2: data.vix2 ? data.vix2.filter(d => d.t >= cutoff) : null,
    idx1: data.idx1.filter(d => d.t >= cutoff),
    idx2: data.idx2.filter(d => d.t >= cutoff),
    idx3: data.idx3 ? data.idx3.filter(d => d.t >= cutoff) : null,
  };
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
function alignData(filtered) {
  const s1 = filtered.idx1 || [];
  const s2 = filtered.idx2 || [];
  const s3 = filtered.idx3 || [];
  const sV = filtered.vix || [];
  const sV2 = filtered.vix2 || [];

  const map1 = new Map();
  s1.forEach(d => { if (d.t) map1.set(toDateStr(d.t), d); });
  const map2 = new Map();
  s2.forEach(d => { if (d.t) map2.set(toDateStr(d.t), d); });
  const map3 = new Map();
  s3.forEach(d => { if (d.t) map3.set(toDateStr(d.t), d); });
  const mapV = new Map();
  sV.forEach(d => { if (d.t) mapV.set(toDateStr(d.t), d); });
  const mapV2 = new Map();
  sV2.forEach(d => { if (d.t) mapV2.set(toDateStr(d.t), d); });

  const allDates = Array.from(new Set([
    ...map1.keys(), ...map2.keys(), ...map3.keys(), ...mapV.keys(), ...mapV2.keys()
  ])).sort();

  if (allDates.length === 0) {
    return { labels: [], vixVals: [], vix2Vals: [], idx1Vals: [], idx2Vals: [], idx3Vals: [], vixPct: [], vix2Pct: [], idx1Pct: [], idx2Pct: [], idx3Pct: [], timestamps: [], missingFlags: [] };
  }

  const commonTimestamps = [];
  const rawIdx1 = [], rawIdx2 = [], rawIdx3 = [], rawVix = [], rawVix2 = [];
  const missingFlags = [];
  const labels = [];

  let last1 = null, last2 = null, last3 = null, lastV = null, lastV2 = null;

  for (const dateStr of allDates) {
    const e1 = map1.get(dateStr);
    const e2 = map2.get(dateStr);
    const e3 = map3.get(dateStr);
    const eV = mapV.get(dateStr);
    const eV2 = mapV2.get(dateStr);

    const t = e1?.t || e2?.t || e3?.t || eV?.t || eV2?.t || (new Date(dateStr + 'T12:00:00Z').getTime() / 1000);

    const v1 = (e1?.v != null && !isNaN(e1.v)) ? e1.v : (last1 ?? null);
    const v2 = (e2?.v != null && !isNaN(e2.v)) ? e2.v : (last2 ?? null);
    const v3 = (e3?.v != null && !isNaN(e3.v)) ? e3.v : (last3 ?? null);
    const vV = (eV?.v != null && !isNaN(eV.v)) ? eV.v : (lastV ?? null);
    const vV2 = (eV2?.v != null && !isNaN(eV2.v)) ? eV2.v : (lastV2 ?? null);

    if (v1 != null) last1 = v1;
    if (v2 != null) last2 = v2;
    if (v3 != null) last3 = v3;
    if (vV != null) lastV = vV;
    if (vV2 != null) lastV2 = vV2;

    commonTimestamps.push(t);
    labels.push(fmtDate(t));
    rawIdx1.push(v1);
    rawIdx2.push(v2);
    rawIdx3.push(v3);
    rawVix.push(vV);
    rawVix2.push(vV2);
    missingFlags.push(v1 == null || v2 == null);
  }

  const calcPct = (arr) => {
    if (!arr || arr.length === 0) return [];
    const baseItem = arr.find(v => v != null);
    if (baseItem == null) return arr.map(() => null);
    return arr.map(v => v == null ? null : parseFloat(((v - baseItem) / baseItem * 100).toFixed(2)));
  };

  return {
    labels,
    vixVals: rawVix,
    vix2Vals: rawVix2,
    idx1Vals: rawIdx1,
    idx2Vals: rawIdx2,
    idx3Vals: rawIdx3,
    vixPct: calcPct(rawVix),
    vix2Pct: calcPct(rawVix2),
    idx1Pct: calcPct(rawIdx1),
    idx2Pct: calcPct(rawIdx2),
    idx3Pct: calcPct(rawIdx3),
    timestamps: commonTimestamps,
    missingFlags,
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

  const idx1Chg = getSeriesChg(rawData?.idx1, aligned.idx1Vals);
  const idx2Chg = getSeriesChg(rawData?.idx2, aligned.idx2Vals);
  const idx3Chg = marketConfig.symbols.idx3 ? getSeriesChg(rawData?.idx3, aligned.idx3Vals) : null;
  const vixSeriesToUse = (rawData?.rawVix && rawData.rawVix.length > 0) ? rawData.rawVix : rawData?.vix;
  const vixChg = getSeriesChg(vixSeriesToUse, aligned.vixVals);
  const vix2Chg = marketConfig.symbols.vix2 ? getSeriesChg(rawData?.vix2, aligned.vix2Vals) : null;

  let html = `
    <div class="kpi-item" id="card-idx1">
      <span class="kpi-dot" style="background:${marketConfig.colors.idx1}"></span>
      <span class="kpi-name">${marketConfig.names.idx1}</span>
      <span class="kpi-val">${fmt(idx1Chg.lastVal)}</span>
      <span class="kpi-chg ${idx1Chg.cls}">${idx1Chg.text}</span>${staleTag(idx1Chg)}
    </div>
    <div class="kpi-sep"></div>
    <div class="kpi-item" id="card-idx2">
      <span class="kpi-dot" style="background:${marketConfig.colors.idx2}"></span>
      <span class="kpi-name">${marketConfig.names.idx2}</span>
      <span class="kpi-val">${fmt(idx2Chg.lastVal)}</span>
      <span class="kpi-chg ${idx2Chg.cls}">${idx2Chg.text}</span>${staleTag(idx2Chg)}
    </div>
  `;

  if (marketConfig.symbols.idx3 && idx3Chg) {
    html += `
    <div class="kpi-sep"></div>
    <div class="kpi-item" id="card-idx3">
      <span class="kpi-dot" style="background:${marketConfig.colors.idx3}"></span>
      <span class="kpi-name">${marketConfig.names.idx3}</span>
      <span class="kpi-val">${fmt(idx3Chg.lastVal)}</span>
      <span class="kpi-chg ${idx3Chg.cls}">${idx3Chg.text}</span>${staleTag(idx3Chg)}
    </div>`;
  }

  html += `
    <div class="kpi-sep"></div>
    <div class="kpi-item" id="card-vix">
      <span class="kpi-dot" style="background:${marketConfig.colors.vix}"></span>
      <span class="kpi-name">${marketConfig.names.vix}</span>
      <span class="kpi-val">${fmt(vixChg.lastVal)}</span>
      <span class="kpi-chg ${vixChg.cls}">${vixChg.text}</span>${staleTag(vixChg)}
    </div>`;

  if (marketConfig.symbols.vix2 && vix2Chg) {
    html += `
    <div class="kpi-sep"></div>
    <div class="kpi-item" id="card-vix2">
      <span class="kpi-dot" style="background:${marketConfig.colors.vix2}"></span>
      <span class="kpi-name">${marketConfig.names.vix2}</span>
      <span class="kpi-val">${fmt(vix2Chg.lastVal)}</span>
      <span class="kpi-chg ${vix2Chg.cls}">${vix2Chg.text}</span>${staleTag(vix2Chg)}
    </div>`;
  }

  kpiRow.innerHTML = html;
  // After DOM settles, auto-scale font to fit all items
  requestAnimationFrame(() => autoScaleKpiBar());
}


function renderAnnotations(marketConfig) {
  const annoBar = $('annotationBar');
  annoBar.innerHTML = marketConfig.annotations.map(item => `
    <div class="anno-item">
      <span class="anno-icon">${item.icon}</span>
      <div>
        <b>${item.title}</b> ${item.desc}
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
  void bar.offsetWidth; // force reflow

  const style = getComputedStyle(bar);
  const padL = parseFloat(style.paddingLeft) || 0;
  const padR = parseFloat(style.paddingRight) || 0;
  const availW = bar.offsetWidth - padL - padR;
  if (availW <= 0) return;

  // Measure natural scrollWidth of content (all items + separators)
  const contentW = bar.scrollWidth - padL - padR;
  if (contentW <= availW) return; // already fits, no scaling needed

  // Calculate scale ratio and apply to font-size and gap proportionally
  const ratio = availW / contentW;
  const baseFontPx = parseFloat(style.fontSize) || 14;
  const baseGapPx  = parseFloat(style.gap) || 16;

  // Clamp: never go below 9px font (readability floor)
  const newFontPx = Math.max(9, baseFontPx * ratio * 0.97);
  const newGapPx  = Math.max(4, baseGapPx  * ratio * 0.97);

  bar.style.fontSize = newFontPx.toFixed(1) + 'px';
  bar.style.gap = newGapPx.toFixed(1) + 'px';
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

  const seriesDefs = [
    { key: 'idx1', name: market.names.idx1, color: market.colors.idx1, vals: sliced.idx1Vals, dsIdx: 0 },
    { key: 'idx2', name: market.names.idx2, color: market.colors.idx2, vals: sliced.idx2Vals, dsIdx: 1 },
  ];
  if (market.symbols.idx3) {
    seriesDefs.push({ key: 'idx3', name: market.names.idx3, color: market.colors.idx3, vals: sliced.idx3Vals || [], dsIdx: 2 });
  }

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
          peakDate: sliced.labels[bestPeakIdx],
          troughDate: sliced.labels[bestTroughIdx],
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
    const sliced = currentSliced || currentAligned;
    const mdd = calcMaxDrawdown(sliced, MARKETS[currentMarket]);
    if (mdd) {
      drawRainbowDrawdown(ctx, mdd, chartArea, offsetX, offsetY);
    }
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

  // 3️⃣ Pass 1: 霓虹外发光软晕 Pass (Glow Pass)
  ctx.shadowColor = `hsl(${(rainbowHuePhase * 1.5) % 360}, 100%, 65%)`;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 6.5;
  ctx.strokeStyle = neonGrad;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  // 4️⃣ Pass 2: 核心强光高亮折线 Pass (Core Bright Pass)
  ctx.shadowBlur = 0;
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = '#ffffff'; // 核心极白提亮
  ctx.stroke();

  ctx.lineWidth = 2.8;
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

  const meta0 = chartInstance.getDatasetMeta(0);
  // pt.x/pt.y 是 mainChart 坐标系，转换到 overlayCanvas 坐标系需加偏移
  const rawPointX = meta0?.data?.[idx]?.x ?? mouseX;
  const pointX = rawPointX + offsetX;

  // chartArea 边界同样需要偏移到 overlayCanvas 坐标系
  const caLeft = chartArea.left + offsetX;
  const caRight = chartArea.right + offsetX;
  const caTop = chartArea.top + offsetY;
  const caBottom = chartArea.bottom + offsetY;

  // 0️⃣ 先画当前视口的最大回撤彩虹流动区间 (Rainbow Drawdown Zone)
  const mdd = calcMaxDrawdown(activeData, MARKETS[currentMarket]);
  if (mdd) {
    drawRainbowDrawdown(ctx, mdd, chartArea, offsetX, offsetY);
  }

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
  const dsColors = [market.colors.idx1, market.colors.idx2];
  const dsVals = [activeData.idx1Vals, activeData.idx2Vals];
  if (market.symbols.idx3) {
    dsColors.push(market.colors.idx3);
    dsVals.push(activeData.idx3Vals);
  }
  const vixIdx = dsColors.length;
  dsColors.push(market.colors.vix);
  dsVals.push(activeData.vixVals);

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

    const isFearIdx = dsIdx >= vixIdx;   // 恐慌指数（vix / vix2）位于指数序列之后
    const dotColor = (isFearIdx && val != null) ? getVixColor(val, currentMarket) : color;

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

  const seriesArr = [sliced.idx1Vals, sliced.idx2Vals];
  if (market.symbols.idx3) seriesArr.push(sliced.idx3Vals || []);

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

const makeVixSegment = (vixDataArr, marketId) => ({
  borderColor: (ctx) => {
    const v0 = vixDataArr[ctx.p0DataIndex];
    const v1 = vixDataArr[ctx.p1DataIndex];
    if (v0 == null || v1 == null) return 'rgba(148,163,184,0.45)';
    return getVixColor((v0 + v1) / 2, marketId);
  },
  borderDash: (ctx) => {
    const v0 = vixDataArr[ctx.p0DataIndex];
    const v1 = vixDataArr[ctx.p1DataIndex];
    if (v0 == null || v1 == null) return [4, 4];
    return undefined;
  },
});

// ── Compute globally-normalized Y axis ranges so equal visual height = equal % change ──
function computeNormalizedRanges(sliced, market) {
  // Build list of index series that have data
  const seriesDefs = [
    { key: 'idx1', yId: 'yIdx1', data: sliced.idx1Vals },
    { key: 'idx2', yId: 'yIdx2', data: sliced.idx2Vals },
  ];
  if (market.symbols.idx3) {
    seriesDefs.push({ key: 'idx3', yId: 'yIdx3', data: sliced.idx3Vals || [] });
  }

  let globalMinPct = 0, globalMaxPct = 0;
  const result = {};

  for (const s of seriesDefs) {
    const nonNull = (s.data || []).filter(v => v != null && !isNaN(v));
    if (nonNull.length < 2) continue;
    const base = nonNull[0];
    if (base === 0) continue;
    const pcts = nonNull.map(v => (v - base) / base);
    const minP = Math.min(...pcts);
    const maxP = Math.max(...pcts);
    globalMinPct = Math.min(globalMinPct, minP);
    globalMaxPct = Math.max(globalMaxPct, maxP);
    result[s.key] = { yId: s.yId, base };
  }

  // 上下各留 8% 视觉余量。
  // 注意必须按「区间跨度」而非「最大绝对幅度」计算：
  // 涨跌幅高度不对称时（如白银 10 年 -43% ~ +463%），按最大绝对幅度会算出
  // 55 个百分点的留白，把轴底部从 -43% 一路压到 -98%，纵轴刻度贴到 0 附近。
  const range = Math.max(globalMaxPct - globalMinPct, 0.02);
  const pad = range * 0.08;
  // 跨度极大时（如 10 年期）留白本身可能超过「到零的距离」，把轴底压成负数。
  // 指数不存在负值，故对下界做钳制；lo/hi 对所有序列共用，钳制不破坏跨序列对齐。
  const lo = Math.max(globalMinPct - pad, -0.98);
  const hi = globalMaxPct + pad;

  // Compute absolute min/max for each series based on global pct range
  for (const entry of Object.values(result)) {
    entry.min = entry.base * (1 + lo);
    entry.max = entry.base * (1 + hi);
  }

  return result; // { idx1: { yId, base, min, max }, ... }
}

// 🚀 Lightweight incremental viewport update (60FPS+ Smooth Zoom & Pan, No Re-instantiation)
function updateChartViewport() {
  if (!chartInstance || !currentAligned) return;
  const sliced = getSlicedAligned(currentAligned, viewportState.start, viewportState.end);
  currentSliced = sliced;

  const isPct = chartMode === 'pct';
  const market = MARKETS[currentMarket];

  const idx1Data = isPct ? sliced.idx1Pct : sliced.idx1Vals;
  const idx2Data = isPct ? sliced.idx2Pct : sliced.idx2Vals;
  const idx3Data = isPct ? sliced.idx3Pct : sliced.idx3Vals;
  const vixData  = isPct ? sliced.vixPct  : sliced.vixVals;
  const vix2Data = isPct ? sliced.vix2Pct : sliced.vix2Vals;

  chartInstance.data.labels = sliced.labels;
  chartInstance.data.datasets[0].data = idx1Data;
  chartInstance.data.datasets[0].segment = makeSegment(idx1Data);
  chartInstance.data.datasets[1].data = idx2Data;
  chartInstance.data.datasets[1].segment = makeSegment(idx2Data);

  let currentDsIdx = 2;
  if (market.symbols.idx3) {
    chartInstance.data.datasets[currentDsIdx].data = idx3Data;
    chartInstance.data.datasets[currentDsIdx].segment = makeSegment(idx3Data);
    currentDsIdx++;
  }

  chartInstance.data.datasets[currentDsIdx].data = vixData;
  chartInstance.data.datasets[currentDsIdx].segment = makeVixSegment(isPct ? sliced.vixPct : sliced.vixVals, currentMarket);
  currentDsIdx++;

  if (market.symbols.vix2) {
    chartInstance.data.datasets[currentDsIdx].data = vix2Data;
    chartInstance.data.datasets[currentDsIdx].segment = makeVixSegment(isPct ? sliced.vix2Pct : sliced.vix2Vals, currentMarket);
  }

  // ── Re-normalize Y axes on every viewport change (absolute mode only) ──
  if (!isPct) {
    const normRanges = computeNormalizedRanges(sliced, market);
    for (const entry of Object.values(normRanges)) {
      const scale = chartInstance.options.scales[entry.yId];
      if (scale) {
        scale.min = entry.min;
        scale.max = entry.max;
      }
    }
  } else {
    // In pct mode: clear any manual min/max so Chart.js auto-scales
    for (const yId of ['yIdx1', 'yIdx2', 'yIdx3']) {
      const scale = chartInstance.options.scales[yId];
      if (scale) { delete scale.min; delete scale.max; }
    }
  }

  // 缩放平移会改变涨跌幅基准（视口首值），标签宽度随之变化，留白必须跟着重算
  chartInstance.options.layout.padding.left = resolveAxisGutter(sliced, market, isPct);

  chartInstance.update('none');
}

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

  const gradIdx1 = ctx.createLinearGradient(0, 0, 0, 460);
  gradIdx1.addColorStop(0, hexToRgba(market.colors.idx1, .18));
  gradIdx1.addColorStop(1, hexToRgba(market.colors.idx1, 0));

  const gradIdx2 = ctx.createLinearGradient(0, 0, 0, 460);
  gradIdx2.addColorStop(0, hexToRgba(market.colors.idx2, .14));
  gradIdx2.addColorStop(1, hexToRgba(market.colors.idx2, 0));

  const gradVix = ctx.createLinearGradient(0, 0, 0, 460);
  gradVix.addColorStop(0, hexToRgba(market.colors.vix, .22));
  gradVix.addColorStop(1, hexToRgba(market.colors.vix, 0));

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const isPct = chartMode === 'pct';
  const idx1Data = isPct ? sliced.idx1Pct : sliced.idx1Vals;
  const idx2Data = isPct ? sliced.idx2Pct : sliced.idx2Vals;
  const vixData = isPct ? sliced.vixPct : sliced.vixVals;

  const axisGutter = resolveAxisGutter(sliced, market, isPct);

  // 恢复该板块此前手动隐藏的曲线；无记录则用各自默认值
  const stored = hiddenSeries[market.id] || (hiddenSeries[market.id] = {});
  const wasHidden = (key, fallback = false) => stored[key] ?? fallback;
  const seriesKeys = ['idx1', 'idx2'];

  const datasets = [
    {
      label: `${market.names.idx1} (${market.symbols.idx1})`,
      data: idx1Data,
      borderColor: market.colors.idx1,
      borderWidth: 2.2,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      tension: 0.35,
      spanGaps: true,
      normalized: true,
      segment: makeSegment(idx1Data),
      yAxisID: isPct ? 'yShared' : 'yIdx1',
      order: 1,
      hidden: wasHidden('idx1'),
    },
    {
      label: `${market.names.idx2} (${market.symbols.idx2})`,
      data: idx2Data,
      borderColor: market.colors.idx2,
      borderWidth: 2.2,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      tension: 0.35,
      spanGaps: true,
      normalized: true,
      segment: makeSegment(idx2Data),
      yAxisID: isPct ? 'yShared' : 'yIdx2',
      order: 2,
      hidden: wasHidden('idx2'),
    },
  ];

  if (market.symbols.idx3) {
    const idx3Data = isPct ? sliced.idx3Pct : sliced.idx3Vals;
    seriesKeys.push('idx3');

    datasets.push({
      label: `${market.names.idx3} (${market.symbols.idx3})`,
      data: idx3Data,
      borderColor: market.colors.idx3,
      borderWidth: 2.2,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      tension: 0.35,
      spanGaps: true,
      normalized: true,
      segment: makeSegment(idx3Data),
      yAxisID: isPct ? 'yShared' : 'yIdx3',
      order: 3,
      hidden: wasHidden('idx3'),
    });
  }

  // vix dataset: hidden by default only if market has vix2 (CN market)
  const vixHiddenDefault = !!market.symbols.vix2;
  seriesKeys.push('vix');
  datasets.push({
    label: `${market.names.vix}`,
    data: vixData,
    borderColor: market.colors.vix,
    backgroundColor: gradVix,
    borderWidth: 2.5,
    pointRadius: 0,
    pointHoverRadius: 0,
    fill: true,
    tension: 0.3,
    spanGaps: true,
    normalized: true,
    segment: makeVixSegment(isPct ? sliced.vixPct : sliced.vixVals, market.id),
    yAxisID: isPct ? 'yShared' : 'yVix',
    order: 4,
    hidden: wasHidden('vix', vixHiddenDefault),
  });

  if (market.symbols.vix2) {
    const vix2Data = isPct ? sliced.vix2Pct : sliced.vix2Vals;
    seriesKeys.push('vix2');
    const gradVix2 = ctx.createLinearGradient(0, 0, 0, 460);
    const rv2 = parseInt(market.colors.vix2.slice(1, 3), 16);
    const gv2 = parseInt(market.colors.vix2.slice(3, 5), 16);
    const bv2 = parseInt(market.colors.vix2.slice(5, 7), 16);
    gradVix2.addColorStop(0, `rgba(${rv2},${gv2},${bv2},0.18)`);
    gradVix2.addColorStop(1, `rgba(${rv2},${gv2},${bv2},0)`);
    datasets.push({
      label: `${market.names.vix2}`,
      data: vix2Data,
      borderColor: market.colors.vix2,
      backgroundColor: gradVix2,
      borderWidth: 2.5,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: true,
      tension: 0.3,
      spanGaps: true,
      normalized: true,
      segment: makeVixSegment(isPct ? sliced.vix2Pct : sliced.vix2Vals, market.id),
      yAxisID: isPct ? 'yShared' : 'yVix2',
      order: 5,
      hidden: wasHidden('vix2', true),
    });
  }

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
            usePointStyle: true, pointStyle: 'line',
          },
          // 保留 Chart.js 默认的显隐切换，额外把结果记进 hiddenSeries，
          // 使切换时间跨度 / 涨跌幅模式重建图表后仍保持用户的选择
          onClick: (e, legendItem, legend) => {
            const ci = legend.chart;
            const dsIdx = legendItem.datasetIndex;
            if (ci.isDatasetVisible(dsIdx)) ci.hide(dsIdx);
            else ci.show(dsIdx);

            const key = currentSeriesKeys[dsIdx];
            if (key) hiddenSeries[currentMarket][key] = !ci.isDatasetVisible(dsIdx);

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
      scales: buildScales(isPct, market, sliced),
      animation: { duration: 250, easing: 'easeOutQuart' },
    },
    plugins: [],
  });


  currentAligned = aligned;

  function buildScales(pct, m, slicedData) {
    const xScale = {
      offset: false,
      bounds: 'data',
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
      // ── Percentage-normalized Y axes ──────────────────────────────
      // Ensures same visual height = same % change across all index series
      const normRanges = slicedData ? computeNormalizedRanges(slicedData, m) : {};

      const scales = {
        x: xScale,
        yIdx1: hiddenYAxis('left',  true,  normRanges.idx1?.min, normRanges.idx1?.max),
        yIdx2: hiddenYAxis('right', false, normRanges.idx2?.min, normRanges.idx2?.max),
        yVix:  hiddenYAxis('right', false),
      };
      if (m.symbols.idx3) {
        scales.yIdx3 = hiddenYAxis('left', false, normRanges.idx3?.min, normRanges.idx3?.max);
      }
      if (m.symbols.vix2) {
        scales.yVix2 = hiddenYAxis('right', false);
      }
      return scales;
    }
  }
}

// ── Format Tooltip HTML ──────────────────────────────────────
function fmtValWithChgHTML(vals, idx, isPctMode, pcts) {
  if (!vals || !Array.isArray(vals)) return '<span class="tt-missing">数据缺失</span>';
  const cur = vals[idx];

  // Missing data: show 缺失 label
  if (cur == null || isNaN(cur)) {
    return '<span class="tt-missing">数据缺失</span>';
  }

  const curStr = fmt(cur);

  // 寻找前一个有效交易日（即上一日），计算单日涨跌幅 (Day-over-Day Change)
  let prevIdx = idx - 1;
  while (prevIdx >= 0 && (vals[prevIdx] == null || isNaN(vals[prevIdx]))) prevIdx--;

  if (prevIdx < 0 || vals[prevIdx] == null || vals[prevIdx] === 0) {
    return `${curStr} <span class="tt-chg zero">(+0.00%)</span>`;
  }

  const prev = vals[prevIdx];
  const diff = cur - prev;
  const pct = (diff / prev) * 100;

  const sign = pct > 0 ? '+' : '';
  const cls = pct > 0 ? 'up' : (pct < 0 ? 'down' : 'zero');
  return `${curStr} <span class="tt-chg ${cls}">(${sign}${pct.toFixed(2)}%)</span>`;
}

function updateTooltipContent(chart, idx) {
  const aligned = currentSliced || currentAligned;
  if (!aligned) return;
  const market = MARKETS[currentMarket];
  const isPct = chartMode === 'pct';

  // 同 drawCrosshairOverlay：隐藏可能来自数据集配置，meta.hidden 不可靠
  const isHidden = (dsIdx) => !chart.isDatasetVisible(dsIdx);

  const rows = [];

  // 🌈 计算并呈现当前视口最大回撤 (Compact MDD Card)
  const mdd = calcMaxDrawdown(aligned, market);
  if (mdd && idx >= mdd.peakIdx && idx <= mdd.troughIdx) {
    rows.push(`
      <div class="mdd-tooltip-card">
        <div class="mdd-head">
          <span class="mdd-title">⚡ <b>最大回撤 (${mdd.seriesName})</b></span>
          <span class="mdd-badge">${mdd.mddPct.toFixed(2)}%</span>
        </div>
        <div class="mdd-sub">
          📅 ${mdd.peakDate.slice(5)} → ${mdd.troughDate.slice(5)} (${mdd.days}天) &nbsp;•&nbsp; $${fmt(mdd.peakVal)}→$${fmt(mdd.troughVal)}
        </div>
      </div>
    `);
  }

  // Determine VIX dot color dynamically (green-to-red gradient)
  const vixVal = aligned.vixVals[idx];
  const vixDotColor = (vixVal != null && !isNaN(vixVal))
    ? getVixColor(vixVal, currentMarket)
    : market.colors.vix;

  let dsIdx = 0;

  if (!isHidden(dsIdx)) {
    rows.push(`
      <div class="tooltip-row">
        <span class="tt-dot" style="background:${market.colors.idx1}"></span>
        <span class="tt-label">${market.names.idx1}</span>
        <span class="tt-val">${fmtValWithChgHTML(aligned.idx1Vals, idx, isPct, aligned.idx1Pct)}</span>
      </div>`);
  }
  dsIdx++;

  if (!isHidden(dsIdx)) {
    rows.push(`
      <div class="tooltip-row">
        <span class="tt-dot" style="background:${market.colors.idx2}"></span>
        <span class="tt-label">${market.names.idx2}</span>
        <span class="tt-val">${fmtValWithChgHTML(aligned.idx2Vals, idx, isPct, aligned.idx2Pct)}</span>
      </div>`);
  }
  dsIdx++;

  if (market.symbols.idx3) {
    if (!isHidden(dsIdx)) {
      rows.push(`
        <div class="tooltip-row">
          <span class="tt-dot" style="background:${market.colors.idx3}"></span>
          <span class="tt-label">${market.names.idx3}</span>
          <span class="tt-val">${fmtValWithChgHTML(aligned.idx3Vals, idx, isPct, aligned.idx3Pct)}</span>
        </div>`);
    }
    dsIdx++;
  }

  if (!isHidden(dsIdx)) {
    rows.push(`
      <div class="tooltip-row">
        <span class="tt-dot" style="background:${vixDotColor}"></span>
        <span class="tt-label">${market.names.vix}</span>
        <span class="tt-val">${fmtValWithChgHTML(aligned.vixVals, idx, isPct, aligned.vixPct)}</span>
      </div>`);
  }
  dsIdx++;

  if (market.symbols.vix2) {
    if (!isHidden(dsIdx)) {
      const vix2Val = (aligned.vix2Vals || [])[idx];
      const vix2DotColor = (vix2Val != null && !isNaN(vix2Val))
        ? getVixColor(vix2Val, currentMarket)
        : market.colors.vix2;
      rows.push(`
        <div class="tooltip-row">
          <span class="tt-dot" style="background:${vix2DotColor}"></span>
          <span class="tt-label">${market.names.vix2}</span>
          <span class="tt-val">${fmtValWithChgHTML(aligned.vix2Vals, idx, isPct, aligned.vix2Pct)}</span>
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

  // 2️⃣ 纵向定位：进一步向上大幅拉升 (top: -32px)，高高悬挂在顶栏区域，离下方 Canvas 绘图区 0 接触，彻底避免遮挡折线
  const top = -32;

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
        const ratio = (mouseX - chartArea.left) / (chartArea.right - chartArea.left);
        let approxIdx = Math.round(ratio * (count - 1));
        approxIdx = Math.max(0, Math.min(count - 1, approxIdx));

        const meta = chartInstance.getDatasetMeta(0);
        let bestIdx = approxIdx;
        if (meta?.data?.[approxIdx]) {
          let minDiff = Math.abs(meta.data[approxIdx].x - mouseX);
          for (let i = Math.max(0, approxIdx - 6); i <= Math.min(count - 1, approxIdx + 6); i++) {
            const ptX = meta.data[i]?.x;
            if (ptX != null) {
              const diff = Math.abs(ptX - mouseX);
              if (diff < minDiff) { minDiff = diff; bestIdx = i; }
            }
          }
        }

        crosshairState.active = true;
        crosshairState.idx = bestIdx;
        crosshairState.x = meta?.data?.[bestIdx]?.x ?? mouseX;

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
          mouseY < chartArea.top  || mouseY > chartArea.bottom) {
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

    // ── Mouse Drag to Pan (Left Click Dragging) ────────────────
    let isDragging = false;
    let dragStartX = 0;
    let dragStartViewport = { start: 0, end: 0 };

    chartWrap.addEventListener('mousedown', (e) => {
      if (!chartInstance || !currentAligned || !currentAligned.labels.length) return;
      if (e.button !== 0) return; // Left click only

      const rect = chartInstance.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const chartArea = chartInstance.chartArea;
      if (!chartArea) return;

      if (mouseX >= chartArea.left && mouseX <= chartArea.right &&
        mouseY >= chartArea.top && mouseY <= chartArea.bottom) {
        isDragging = true;
        dragStartX = e.clientX;
        dragStartViewport = { start: viewportState.start ?? 0, end: viewportState.end ?? (currentAligned.labels.length - 1) };
        chartWrap.classList.add('dragging');
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging || !chartInstance || !currentAligned) return;
      const total = currentAligned.labels.length;
      const chartArea = chartInstance.chartArea;
      if (!chartArea) return;

      const deltaX = e.clientX - dragStartX;
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
    });

    const stopDrag = () => {
      if (isDragging) {
        isDragging = false;
        chartWrap.classList.remove('dragging');
      }
    };
    window.addEventListener('mouseup', stopDrag);
  }
}


async function switchMarket(marketId) {
  if (!MARKETS[marketId]) return;
  currentMarket = marketId;
  const market = MARKETS[marketId];

  // Update Body Theme & Active Tab Buttons
  document.body.className = market.themeClass;
  document.querySelectorAll('.market-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.market === marketId);
  });

  // Update Chart Title & Hint
  $('chartTitle').textContent = `${market.title.split('—')[1]}指数走势叠加图`;
  $('chartHint').textContent = market.chartHint;


  // Load Market Data & Render UI
  try {
    const rawData = await loadMarketData(marketId);
    hideLoading();
    setStatus('数据已加载', true);
    $('updateTime').textContent = `更新: ${nowStr()}`;

    const filtered = applyRange(rawData, currentRange);
    const aligned = alignData(filtered);

    renderKPIs(market, aligned, rawData);
    autoScaleMobileKpi();
    renderAnnotations(market);
    // 同 activateRange：切换板块后视口必须回到完整区间
    buildChart(aligned, true);
  } catch (err) {
    console.error(`[switchMarket error]:`, err);
    showError(`无法加载 ${market.names.idx1} 数据: ${err.message}`);
  }
}

function activateRange(range) {
  currentRange = range;
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.range === range);
  });

  if (!marketDataStore[currentMarket]) return;

  const rawData = marketDataStore[currentMarket];
  const filtered = applyRange(rawData, range);
  const aligned = alignData(filtered);

  renderKPIs(MARKETS[currentMarket], aligned, rawData);
  autoScaleMobileKpi();
  // 必须重置缩放视口：否则会沿用上一区间的 [start, end]，
  // 例如从 1 年切到 10 年时只显示 2517 个点里的前 261 个（十年前的那一年）
  buildChart(aligned, true);
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

function setStatus(msg, ok = true) {
  statusBadge.innerHTML = `<span class="pulse-dot"></span>${msg}`;
  statusBadge.style.background = ok ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)';
  statusBadge.style.borderColor = ok ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)';
  statusBadge.style.color = ok ? '#86efac' : '#fca5a5';
}

// ── Application Entry ────────────────────────────────────────
async function init() {
  setupTabListeners();
  if (retryBtn) {
    retryBtn.addEventListener('click', () => switchMarket(currentMarket));
  }
  await switchMarket('us');
  startRainbowAnimationLoop();
}

document.addEventListener('DOMContentLoaded', init);
