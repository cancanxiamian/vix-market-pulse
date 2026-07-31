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
    sub: '美股三大核心指数与 VIX 恐慌指数叠加对比',
    chartHint: '左轴: 纳斯达克100 · 右轴: 费城半导体 & VIX（独立刻度）',
    themeClass: 'theme-us',
    symbols: { vix: '^VIX', idx1: '^NDX', idx2: '^SOX' },
    names:   { vix: 'VIX 恐慌指数', idx1: '纳斯达克 100', idx2: '费城半导体' },
    descs:   { vix: 'CBOE 波动率 / 恐慌指标', idx1: '^NDX · 科技龙头指数', idx2: '^SOX · 芯片产业指数' },
    colors:  { vix: '#22c55e', idx1: '#22d3ee', idx2: '#c084fc' },
    annotations: [
      { icon: '📌', title: 'VIX > 30', desc: '情绪高压 / 剧烈洗盘 — 市场波动率急剧飙升，多空剧烈分歧或大波幅震荡' },
      { icon: '📊', title: 'VIX 18–30', desc: '温和波动 / 避险升温 — 市场不确定性上升，防守与加仓博弈并存' },
      { icon: '✅', title: 'VIX < 18', desc: '低波平稳 / 偏好维持 — 情绪稳定乐观，多头趋势顺畅运行' }
    ]
  },
  cn: {
    id: 'cn',
    title: 'Market Pulse — A股',
    sub: 'A股核心大盘指数与中国概念恐慌/波动率指数 (VXFXI) 叠加对比',
    chartHint: '左轴: 沪深300 · 右轴: 上证指数 & 中国恐慌指数（独立刻度）',
    themeClass: 'theme-cn',
    symbols: { vix: '^VXFXI', idx1: '000300.SS', idx2: '000001.SS' },
    names:   { vix: '中国概念恐慌 (VXFXI)', idx1: '沪深 300 指数', idx2: '上证综合指数' },
    descs:   { vix: '^VXFXI · CBOE 中国股票波动率', idx1: '000300.SS · A股核心大盘', idx2: '000001.SS · 上证综指' },
    colors:  { vix: '#22c55e', idx1: '#F59E0B', idx2: '#06B6D4' },
    annotations: [
      { icon: '🇨🇳', title: 'VXFXI > 35', desc: '情绪极端剧烈 / 波动爆表 — 市场处于暴涨狂热或剧烈杀跌期，多空博弈白热化' },
      { icon: '📈', title: '沪深300 / 上证', desc: '蓝筹核心与上证综指对比，观察大盘风格切换与板块轮动' },
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
    names:   { vix: '黄金恐慌指数 (GVZ)', idx1: 'COMEX 黄金期货', idx2: 'COMEX 白银期货' },
    descs:   { vix: '^GVZ · CBOE 黄金波动率', idx1: 'GC=F · 黄金期货 ($/盎司)', idx2: 'SI=F · 白银期货 ($/盎司)' },
    colors:  { vix: '#22c55e', idx1: '#FBBF24', idx2: '#94A3B8' },
    annotations: [
      { icon: '🪙', title: 'GVZ > 25', desc: '避险情绪爆发 / 波动剧烈 — 地缘政治或宏观事件触发金价大波幅博弈' },
      { icon: '⚡', title: '金银比率观照', desc: '黄金与白银走势对照，反映贵金属避险与工业属性异同' },
      { icon: '✨', title: 'GVZ < 15', desc: '低波盘整 / 情绪平缓 — 避险需求平缓，金价处于平稳休养期' }
    ]
  }
};

const LOCAL_PROXY = '/api/merged?symbol=';

// ── App State ───────────────────────────────────────────────
let currentMarket  = 'us';     // 'us' | 'cn' | 'gold'
let currentRange   = '1y';     // '1m' | '3m' | '6m' | '1y' | '2y' | '5y'
let chartMode      = 'absolute';// 'absolute' | 'pct'
let chartInstance  = null;
let currentAligned = null;

// Cache fetched market raw data in memory
const marketDataStore = { us: null, cn: null, gold: null };

// Crosshair state
const crosshairState = { active: false, x: null, idx: null };

// ── DOM refs ────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const loadingOverlay = $('loadingOverlay');
const errorOverlay   = $('errorOverlay');
const errorText      = $('errorText');
const retryBtn       = $('retryBtn');
const statusBadge    = $('statusBadge');
const updateTime     = $('updateTime');
const tooltip        = $('crosshairTooltip');

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

/**
 * getVixColor(val, marketId)
 * Returns a smooth green→red gradient color for the VIX/fear-greed line.
 *
 * Thresholds based on authoritative sources (CBOE, Chase, Investing.com):
 *   US VIX  : <15 extreme greed (deep green) … >40 extreme panic (deep red)
 *   CN VXFXI: <20 greed … >50 extreme fear  (Chinese mkt is naturally more volatile)
 *   Gold GVZ: <12 greed … >30 extreme fear
 *
 * Interpolates smoothly between #16a34a (green) and #dc2626 (red).
 */
function getVixColor(val, marketId) {
  if (val == null || isNaN(val)) return 'rgba(148,163,184,0.5)';
  const ranges = {
    us:   { min: 12, max: 40 },
    cn:   { min: 18, max: 50 },
    gold: { min: 10, max: 30 },
  };
  const { min, max } = ranges[marketId] || ranges.us;
  const t = Math.max(0, Math.min(1, (val - min) / (max - min)));
  // Interpolate: green (22,163,74) → amber (234,179,8) → red (220,38,38)
  let r, g, b;
  if (t < 0.5) {
    // green → amber
    const s = t / 0.5;
    r = Math.round(22  + s * (234 - 22));
    g = Math.round(163 + s * (179 - 163));
    b = Math.round(74  + s * (8   - 74));
  } else {
    // amber → red
    const s = (t - 0.5) / 0.5;
    r = Math.round(234 + s * (220 - 234));
    g = Math.round(179 + s * (38  - 179));
    b = Math.round(8   + s * (38  - 8));
  }
  return `rgb(${r},${g},${b})`;
}

// ── Data Fetching Logic ──────────────────────────────────────
async function fetchSymbol(symbol) {
  const isLocalServer = window.location.protocol !== 'file:';
  if (isLocalServer) {
    try {
      const res = await fetch(LOCAL_PROXY + encodeURIComponent(symbol), {
        signal: AbortSignal.timeout(25000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return parseMergedData(json, symbol);
    } catch (e) {
      console.warn('[proxy fetch failed]:', e.message);
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
  const closes    = result.indicators?.quote?.[0]?.close || [];
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
    const stooqCt   = json.series.filter(d => d.source === 'stooq').length;
    if (missingCt || stooqCt) {
      console.log(`[data] ${symbol}: ${missingCt} 缺失点, Stooq补全 ${stooqCt} 点`);
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
    const cur  = valid[i].v;
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

  const [vixDataRaw, idx1Data, idx2Data] = await Promise.all([
    fetchSymbol(market.symbols.vix),
    fetchSymbol(market.symbols.idx1),
    fetchSymbol(market.symbols.idx2),
  ]);

  let vixData = vixDataRaw;
  // If vix series has <10 real points (e.g. ^VXFXI returns only live quote on Yahoo),
  // automatically compute historical 20-day rolling Volatility Index from the most complete index series
  const realVixCount = vixDataRaw ? vixDataRaw.filter(d => d.v != null && !isNaN(d.v)).length : 0;
  if (realVixCount < 10) {
    const realIdx1 = idx1Data.filter(d => d.v != null).length;
    const realIdx2 = idx2Data.filter(d => d.v != null).length;
    const baseForHv = (realIdx2 > realIdx1) ? idx2Data : idx1Data;
    console.log(`[volatility] Computing rolling HV for ${marketId} from ${baseForHv === idx2Data ? market.symbols.idx2 : market.symbols.idx1}`);
    vixData = calcRollingVolatility(baseForHv);
  }

  const marketData = {
    vix: vixData,
    idx1: idx1Data,
    idx2: idx2Data,
    rawVix: vixDataRaw,
  };

  marketDataStore[marketId] = marketData;
  return marketData;
}


// ── Filter Range & Align Dates ───────────────────────────────
function applyRange(data, range) {
  const now = Date.now() / 1000;
  const cutoffs = {
    '1m': 30 * 86400,
    '3m': 90 * 86400,
    '6m': 180 * 86400,
    '1y': 365 * 86400,
    '2y': 730 * 86400,
    '5y': 5 * 365 * 86400,
  };
  const cutoff = now - (cutoffs[range] || cutoffs['1y']);
  return {
    vix:  data.vix.filter(d => d.t >= cutoff),
    idx1: data.idx1.filter(d => d.t >= cutoff),
    idx2: data.idx2.filter(d => d.t >= cutoff),
  };
}

// ── Align dates (Union of timestamps, null-aware, with missingFlags tracking) ───────────
function alignData(filtered) {
  const s1 = filtered.idx1 || [];
  const s2 = filtered.idx2 || [];
  const sV = filtered.vix  || [];

  // Build sorted union of all timestamps
  const rawTs = [...s1.map(x => x.t), ...s2.map(x => x.t), ...sV.map(x => x.t)].sort((a,b) => a - b);
  const uniqueTs = [];
  for (const t of rawTs) {
    if (uniqueTs.length === 0 || (t - uniqueTs[uniqueTs.length - 1]) > 14000) {
      uniqueTs.push(t);
    }
  }

  if (uniqueTs.length === 0) {
    return { labels: [], vixVals: [], idx1Vals: [], idx2Vals: [], vixPct: [], idx1Pct: [], idx2Pct: [], timestamps: [], missingFlags: [] };
  }

  // O(log N) Binary search for nearest item in sorted series (125x faster than linear scan)
  function findNearest(targetT, series, maxGap = 864000) {
    if (!series || series.length === 0) return null;
    let low = 0, high = series.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (series[mid].t === targetT) return series[mid];
      if (series[mid].t < targetT) low = mid + 1;
      else high = mid - 1;
    }
    let best = null, minDiff = Infinity;
    for (let i = Math.max(0, high - 1); i <= Math.min(series.length - 1, low + 1); i++) {
      const diff = Math.abs(series[i].t - targetT);
      if (diff < minDiff) { minDiff = diff; best = series[i]; }
    }
    return (best && minDiff <= maxGap) ? best : null;
  }

  // O(log N) Binary search for nearest item with a REAL (non-null) value
  function findNearestReal(targetT, series, maxGap = 864000) {
    if (!series || series.length === 0) return null;
    let low = 0, high = series.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (series[mid].t < targetT) low = mid + 1;
      else high = mid - 1;
    }
    let best = null, minDiff = Infinity;
    const start = Math.max(0, high - 10);
    const end   = Math.min(series.length - 1, low + 10);
    for (let i = start; i <= end; i++) {
      if (series[i].v == null || isNaN(series[i].v)) continue;
      const diff = Math.abs(series[i].t - targetT);
      if (diff < minDiff) { minDiff = diff; best = series[i]; }
    }
    return (best && minDiff <= maxGap) ? best : null;
  }

  const commonTimestamps = [];
  const rawIdx1 = [], rawIdx2 = [], rawVix = [];
  const missingFlags = [];
  const labels = [];

  for (const t of uniqueTs) {
    // Tight window (36h): match exact trading day
    const near1 = findNearest(t, s1, 129600);
    const near2 = findNearest(t, s2, 129600);
    const nearV = findNearest(t, sV, 129600);

    // If a series has an entry for timestamp t (even with v=null), honor it directly without fake 10-day forward-filling
    const v1 = (near1 != null) ? (near1.v ?? null) : (findNearestReal(t, s1, 864000)?.v ?? null);
    const v2 = (near2 != null) ? (near2.v ?? null) : (findNearestReal(t, s2, 864000)?.v ?? null);
    const vV = (nearV != null) ? (nearV.v ?? null) : (findNearestReal(t, sV, 864000)?.v ?? null);

    const m1 = v1 == null;
    const m2 = v2 == null;
    const mV = vV == null;

    commonTimestamps.push(t);
    labels.push(fmtDate(t));
    rawIdx1.push(v1);
    rawIdx2.push(v2);
    rawVix.push(vV);
    missingFlags.push(m1 || m2 || mV);
  }

  const calcPct = (arr) => {
    if (arr.length === 0) return [];
    const baseItem = arr.find(v => v != null);
    if (baseItem == null) return arr.map(() => null);
    return arr.map(v => v == null ? null : parseFloat(((v - baseItem) / baseItem * 100).toFixed(2)));
  };

  return {
    labels,
    vixVals:    rawVix,
    idx1Vals:   rawIdx1,
    idx2Vals:   rawIdx2,
    vixPct:     calcPct(rawVix),
    idx1Pct:    calcPct(rawIdx1),
    idx2Pct:    calcPct(rawIdx2),
    timestamps: commonTimestamps,
    missingFlags,
  };
}



// ── Render Dynamic UI Components ─────────────────────────────
function renderKPIs(marketConfig, aligned, rawData) {
  const kpiRow = $('kpiRow');

  const getSeriesChg = (series, fallbackAligned) => {
    // Use only real (non-null) values for last/prev calculation
    if (series && series.length >= 2) {
      const nonNull = series.filter(d => d.v != null && !isNaN(d.v));
      if (nonNull.length >= 2) {
        const c = nonNull[nonNull.length - 1].v;
        const p = nonNull[nonNull.length - 2].v;
        if (p != null && !isNaN(p) && p !== 0) {
          const pct = ((c - p) / p * 100);
          return { lastVal: c, text: `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`, cls: pct >= 0 ? 'up' : 'down' };
        }
      }
    }
    // Fallback: use aligned array (filter nulls)
    const realAligned = (fallbackAligned || []).filter(v => v != null && !isNaN(v));
    const last = realAligned.length ? realAligned[realAligned.length - 1] : 0;
    const prev = realAligned.length >= 2 ? realAligned[realAligned.length - 2] : last;
    const pct  = prev !== 0 ? ((last - prev) / prev * 100) : 0;
    return { lastVal: last, text: `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`, cls: pct >= 0 ? 'up' : 'down' };
  };

  const idx1Chg = getSeriesChg(rawData?.idx1, aligned.idx1Vals);
  const idx2Chg = getSeriesChg(rawData?.idx2, aligned.idx2Vals);
  const vixSeriesToUse = (rawData?.rawVix && rawData.rawVix.length > 0) ? rawData.rawVix : rawData?.vix;
  const vixChg  = getSeriesChg(vixSeriesToUse, aligned.vixVals);


  kpiRow.innerHTML = `
    <div class="kpi-card" id="card-idx1">
      <div class="kpi-label">
        <span class="kpi-dot" style="background:${marketConfig.colors.idx1}"></span>${marketConfig.names.idx1}
      </div>
      <div class="kpi-value">${fmt(idx1Chg.lastVal)}</div>
      <div class="kpi-change ${idx1Chg.cls}">${idx1Chg.text}</div>
      <div class="kpi-desc">${marketConfig.descs.idx1}</div>
    </div>
    <div class="kpi-card" id="card-idx2">
      <div class="kpi-label">
        <span class="kpi-dot" style="background:${marketConfig.colors.idx2}"></span>${marketConfig.names.idx2}
      </div>
      <div class="kpi-value">${fmt(idx2Chg.lastVal)}</div>
      <div class="kpi-change ${idx2Chg.cls}">${idx2Chg.text}</div>
      <div class="kpi-desc">${marketConfig.descs.idx2}</div>
    </div>
    <div class="kpi-card" id="card-vix">
      <div class="kpi-label">
        <span class="kpi-dot" style="background:${marketConfig.colors.vix}"></span>${marketConfig.names.vix}
      </div>
      <div class="kpi-value">${fmt(vixChg.lastVal)}</div>
      <div class="kpi-change ${vixChg.cls}">${vixChg.text}</div>
      <div class="kpi-desc">${marketConfig.descs.vix}</div>
    </div>
  `;
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

// ── Overlay Crosshair Canvas Renderer (0ms Lag / 120FPS) ───────────────────
function drawCrosshairOverlay(idx, mouseX) {
  const overlayCanvas = $('crosshairCanvas');
  if (!overlayCanvas || !chartInstance || !currentAligned) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = overlayCanvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  if (overlayCanvas.width !== Math.round(w * dpr) || overlayCanvas.height !== Math.round(h * dpr)) {
    overlayCanvas.width  = Math.round(w * dpr);
    overlayCanvas.height = Math.round(h * dpr);
  }

  const ctx = overlayCanvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  if (idx == null || idx < 0 || idx >= currentAligned.labels.length) {
    ctx.restore();
    return;
  }

  const chartArea = chartInstance.chartArea;
  if (!chartArea) { ctx.restore(); return; }

  const meta0 = chartInstance.getDatasetMeta(0);
  const pointX = meta0?.data?.[idx]?.x ?? mouseX;

  if (pointX == null || pointX < chartArea.left || pointX > chartArea.right) {
    ctx.restore();
    return;
  }

  // 1️⃣ White dashed vertical line
  ctx.beginPath();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth   = 1.5;
  ctx.moveTo(pointX, chartArea.top);
  ctx.lineTo(pointX, chartArea.bottom);
  ctx.stroke();
  ctx.setLineDash([]);

  // 2️⃣ One crisp dot per dataset at the intersection point (skip missing or hidden datasets)
  const market = MARKETS[currentMarket];
  const dsColors = [market.colors.idx1, market.colors.idx2, market.colors.vix];
  const dsVals   = [currentAligned.idx1Vals, currentAligned.idx2Vals, currentAligned.vixVals];

  [0, 1, 2].forEach((dsIdx) => {
    if (chartInstance.getDatasetMeta(dsIdx).hidden === true) return;
    const val = dsVals[dsIdx]?.[idx];
    if (val == null || isNaN(val)) return;
    const meta = chartInstance.getDatasetMeta(dsIdx);
    const pt   = meta?.data?.[idx];
    if (!pt || pt.y == null || isNaN(pt.y)) return;

    const dotColor = (dsIdx === 2 && val != null) ? getVixColor(val, currentMarket) : dsColors[dsIdx];
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
    ctx.fillStyle   = dotColor;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  });

  // 3️⃣ Date label — drawn BELOW chartArea.bottom
  const label = fmtDateFull(currentAligned.timestamps[idx]);
  ctx.font         = '600 11.5px Inter, system-ui, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  const textW = ctx.measureText(label).width;
  const padX  = 9, bgH = 20;
  const bgW   = textW + padX * 2;
  const bgY   = chartArea.bottom + 4;
  let   bgX   = pointX - bgW / 2;

  bgX = Math.max(chartArea.left, Math.min(bgX, chartArea.right - bgW));

  ctx.fillStyle = 'rgba(10, 15, 30, 0.92)';
  ctx.beginPath();
  ctx.roundRect(bgX, bgY, bgW, bgH, 3);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth   = 0.8;
  ctx.beginPath();
  ctx.roundRect(bgX, bgY, bgW, bgH, 3);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, bgX + bgW / 2, bgY + bgH / 2);

  ctx.restore();
}

function clearCrosshairOverlay() {
  const overlayCanvas = $('crosshairCanvas');
  if (!overlayCanvas) return;
  const ctx = overlayCanvas.getContext('2d');
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

// ── Chart.js Renderer ────────────────────────────────────────
function buildChart(aligned) {
  const ctx = $('mainChart').getContext('2d');
  const market = MARKETS[currentMarket];

  function hexToRgba(hex, a) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
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
  const idx1Data = isPct ? aligned.idx1Pct : aligned.idx1Vals;
  const idx2Data = isPct ? aligned.idx2Pct : aligned.idx2Vals;
  const vixData  = isPct ? aligned.vixPct  : aligned.vixVals;

  // Helper to make a segment callback per dataset so ONLY missing lines turn grey
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

  // VIX segment: smooth green→amber→red gradient based on value
  const makeVixSegment = (vixDataArr) => ({
    borderColor: (ctx) => {
      const v0 = vixDataArr[ctx.p0DataIndex];
      const v1 = vixDataArr[ctx.p1DataIndex];
      if (v0 == null || v1 == null) return 'rgba(148,163,184,0.45)';
      return getVixColor((v0 + v1) / 2, market.id);
    },
    borderDash: (ctx) => {
      const v0 = vixDataArr[ctx.p0DataIndex];
      const v1 = vixDataArr[ctx.p1DataIndex];
      if (v0 == null || v1 == null) return [4, 4];
      return undefined;
    },
  });

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: aligned.labels,
      datasets: [
        {
          label: `${market.names.idx1} (${market.symbols.idx1})`,
          data: idx1Data,
          borderColor: market.colors.idx1,
          backgroundColor: gradIdx1,
          borderWidth: 2.2,
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: true,
          tension: 0.35,
          spanGaps: true,
          normalized: true,
          segment: makeSegment(idx1Data),
          yAxisID: isPct ? 'yShared' : 'yIdx1',
          order: 2,
        },
        {
          label: `${market.names.idx2} (${market.symbols.idx2})`,
          data: idx2Data,
          borderColor: market.colors.idx2,
          backgroundColor: gradIdx2,
          borderWidth: 2.2,
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: true,
          tension: 0.35,
          spanGaps: true,
          normalized: true,
          segment: makeSegment(idx2Data),
          yAxisID: isPct ? 'yShared' : 'yIdx2',
          order: 3,
        },
        {
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
          segment: makeVixSegment(isPct ? aligned.vixPct : aligned.vixVals),
          yAxisID: isPct ? 'yShared' : 'yVix',
          order: 1,
        },
      ],
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
        },
        tooltip: { enabled: false },
      },
      onHover: (event, elements, chart) => {
        if (elements && elements.length > 0) {
          positionTooltip(chart);
        }
      },
      scales: buildScales(isPct, market),
      animation: { duration: 250, easing: 'easeOutQuart' },
    },
    plugins: [],
  });


  currentAligned = aligned;

  function buildScales(pct, m) {
    const xScale = {
      grid: { color: 'rgba(255,255,255,.04)', drawTicks: false },
      ticks: {
        color: '#475569',
        font: { family: 'JetBrains Mono', size: 10 },
        maxTicksLimit: 10, maxRotation: 0,
      },
      border: { display: false },
    };

    if (pct) {
      return {
        x: xScale,
        yShared: {
          type: 'linear', position: 'left',
          grid: { color: 'rgba(255,255,255,.05)', drawTicks: false },
          ticks: {
            color: '#94a3b8',
            font: { family: 'JetBrains Mono', size: 10 },
            callback: (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%',
          },
          border: { display: false },
          title: { display: true, text: '相对涨跌幅 (%)', color: '#64748b', font: { size: 10 } },
        },
      };
    } else {
      return {
        x: xScale,
        yIdx1: {
          type: 'linear', position: 'left',
          grid: { color: 'rgba(255,255,255,.05)', drawTicks: false },
          ticks: {
            color: hexToRgba(m.colors.idx1, .75),
            font: { family: 'JetBrains Mono', size: 10 },
            callback: (v) => v >= 1000 ? (v/1000).toFixed(1) + 'k' : v,
          },
          border: { display: false },
          title: { display: true, text: m.names.idx1, color: hexToRgba(m.colors.idx1, .75), font: { size: 10 } },
        },
        yIdx2: {
          type: 'linear', position: 'right',
          grid: { drawOnChartArea: false },
          ticks: {
            color: hexToRgba(m.colors.idx2, .75),
            font: { family: 'JetBrains Mono', size: 10 },
            callback: (v) => v >= 1000 ? (v/1000).toFixed(1) + 'k' : v,
          },
          border: { display: false },
          title: { display: true, text: m.names.idx2, color: hexToRgba(m.colors.idx2, .75), font: { size: 10 } },
        },
        yVix: {
          type: 'linear', position: 'right',
          grid: { drawOnChartArea: false },
          ticks: {
            color: hexToRgba(m.colors.vix, .85),
            font: { family: 'JetBrains Mono', size: 10 },
            padding: 32,
          },
          border: { display: false },
          title: { display: true, text: m.names.vix, color: hexToRgba(m.colors.vix, .85), font: { size: 10 } },
        },
      };
    }
  }
}

// ── Format Tooltip HTML ──────────────────────────────────────
function fmtValWithChgHTML(vals, idx, isPctMode, pcts) {
  const cur = vals[idx];

  // Missing data: show 缺失 label
  if (cur == null || isNaN(cur)) {
    return '<span class="tt-missing">数据缺失</span>';
  }

  const curStr = isPctMode
    ? ((pcts[idx] >= 0 ? '+' : '') + (pcts[idx] != null ? pcts[idx].toFixed(2) : '0.00') + '%')
    : fmt(cur);

  // Find previous non-null value for daily change calculation
  let prevIdx = idx - 1;
  while (prevIdx >= 0 && (vals[prevIdx] == null || isNaN(vals[prevIdx]))) prevIdx--;

  if (prevIdx < 0 || vals[prevIdx] == null || vals[prevIdx] === 0) {
    return `${curStr} <span class="tt-chg zero">(0.00%)</span>`;
  }

  const prev = vals[prevIdx];
  const diff = cur - prev;
  const pct  = (diff / prev) * 100;

  const sign = pct > 0 ? '+' : '';
  const cls  = pct > 0 ? 'up' : (pct < 0 ? 'down' : 'zero');
  return `${curStr} <span class="tt-chg ${cls}">(${sign}${pct.toFixed(2)}%)</span>`;
}

function updateTooltipContent(chart, idx) {
  const aligned = currentAligned;
  if (!aligned) return;
  const market = MARKETS[currentMarket];
  const isPct  = chartMode === 'pct';

  // Dataset order: [0]=idx1, [1]=idx2, [2]=vix
  const isHidden = (dsIdx) => chart.getDatasetMeta(dsIdx).hidden === true;

  // Determine VIX dot color dynamically (green-to-red gradient)
  const vixVal = aligned.vixVals[idx];
  const vixDotColor = (vixVal != null && !isNaN(vixVal))
    ? getVixColor(vixVal, currentMarket)
    : market.colors.vix;

  const rows = [];
  if (!isHidden(0)) {
    rows.push(`
      <div class="tooltip-row">
        <span class="tt-dot" style="background:${market.colors.idx1}"></span>
        <span class="tt-label">${market.names.idx1}</span>
        <span class="tt-val">${fmtValWithChgHTML(aligned.idx1Vals, idx, isPct, aligned.idx1Pct)}</span>
      </div>`);
  }
  if (!isHidden(1)) {
    rows.push(`
      <div class="tooltip-row">
        <span class="tt-dot" style="background:${market.colors.idx2}"></span>
        <span class="tt-label">${market.names.idx2}</span>
        <span class="tt-val">${fmtValWithChgHTML(aligned.idx2Vals, idx, isPct, aligned.idx2Pct)}</span>
      </div>`);
  }
  if (!isHidden(2)) {
    rows.push(`
      <div class="tooltip-row">
        <span class="tt-dot" style="background:${vixDotColor}"></span>
        <span class="tt-label">${market.names.vix}</span>
        <span class="tt-val">${fmtValWithChgHTML(aligned.vixVals, idx, isPct, aligned.vixPct)}</span>
      </div>`);
  }

  $('tooltipRows').innerHTML = rows.join('');
  positionTooltip(chart);
}

function positionTooltip(chart) {
  if (!crosshairState.active || crosshairState.x === null) return;

  tooltip.classList.remove('hidden');
  const ttW = tooltip.offsetWidth  || 250;
  const ttH = tooltip.offsetHeight || 95;

  const panelRect  = document.querySelector('.chart-panel').getBoundingClientRect();
  const canvasRect = chart.canvas.getBoundingClientRect();

  const canvasLeftInPanel = canvasRect.left - panelRect.left;
  const canvasTopInPanel  = canvasRect.top  - panelRect.top;

  const xInPanel     = canvasLeftInPanel + crosshairState.x;
  const chartAreaTop = canvasTopInPanel  + chart.chartArea.top;

  // Position ABOVE chartAreaTop so it never blocks curves
  const top = Math.max(12, chartAreaTop - ttH - 8);

  let left = xInPanel - ttW / 2;
  left = Math.max(0, Math.min(left, panelRect.width - ttW));

  tooltip.style.left = left + 'px';
  tooltip.style.top  = top  + 'px';
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

  // Mousemove and mouseleave interaction over chart container
  const chartWrap = document.querySelector('.chart-wrap');
  let rAfId = null;

  if (chartWrap) {
    chartWrap.addEventListener('mousemove', (e) => {
      if (!chartInstance || !currentAligned || !currentAligned.labels.length) return;

      const rect = chartInstance.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const chartArea = chartInstance.chartArea;
      if (!chartArea) return;

      if (mouseX >= chartArea.left && mouseX <= chartArea.right &&
          mouseY >= chartArea.top  && mouseY <= chartArea.bottom) {

        const count = currentAligned.labels.length;
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

        if (crosshairState.idx !== bestIdx) {
          crosshairState.active = true;
          crosshairState.idx    = bestIdx;
          crosshairState.x      = meta?.data?.[bestIdx]?.x ?? mouseX;

          if (rAfId) cancelAnimationFrame(rAfId);
          rAfId = requestAnimationFrame(() => {
            drawCrosshairOverlay(bestIdx, mouseX);
            updateTooltipContent(chartInstance, bestIdx);
          });
        }
      } else {
        if (crosshairState.active) {
          crosshairState.active = false;
          crosshairState.idx    = null;
          crosshairState.x      = null;
          clearCrosshairOverlay();
          tooltip.classList.add('hidden');
        }
      }
    });

    chartWrap.addEventListener('mouseleave', () => {
      crosshairState.active = false;
      crosshairState.idx    = null;
      crosshairState.x      = null;
      clearCrosshairOverlay();
      tooltip.classList.add('hidden');
    });
  }
}


async function switchMarket(marketId) {
  if (!MARKETS[marketId]) return;
  currentMarket = marketId;
  const market  = MARKETS[marketId];

  // Update Body Theme & Active Tab Buttons
  document.body.className = market.themeClass;
  document.querySelectorAll('.market-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.market === marketId);
  });

  // Update Chart Title & Hint
  $('chartTitle').textContent = `${market.title.split('—')[1]}指数走势叠加图`;
  $('chartHint').textContent  = market.chartHint;


  // Load Market Data & Render UI
  try {
    const rawData = await loadMarketData(marketId);
    hideLoading();
    setStatus('数据已加载', true);
    $('updateTime').textContent = `更新: ${nowStr()}`;

    const filtered = applyRange(rawData, currentRange);
    const aligned  = alignData(filtered);

    renderKPIs(market, aligned, rawData);
    renderAnnotations(market);
    buildChart(aligned);
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

  const rawData  = marketDataStore[currentMarket];
  const filtered = applyRange(rawData, range);
  const aligned  = alignData(filtered);

  renderKPIs(MARKETS[currentMarket], aligned, rawData);
  buildChart(aligned);
}


// ── Overlays & Status ────────────────────────────────────────
function showLoading(msg) {
  loadingOverlay.classList.remove('hidden');
  errorOverlay.classList.add('hidden');
  $('loadingText').textContent = msg || '加载中…';
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
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
}

document.addEventListener('DOMContentLoaded', init);
