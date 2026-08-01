/**
 * lib/datasource.js — 数据源共享层
 *
 * 本地 server.js 与 Vercel api/merged.js 共用同一份取数/缓存/合并逻辑，
 * 避免两处实现各自演进后行为不一致。
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const IS_VERCEL = !!process.env.VERCEL;
const DATA_DIR = IS_VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, '..', 'data');

try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) {
  console.warn('[cache] 缓存目录创建失败:', e.message);
}

const CACHE_TTL_MS = 10 * 60 * 1000;      // Yahoo：盘中会变，10 分钟
const BACKUP_TTL_MS = 6 * 60 * 60 * 1000;  // 备选源：日 K 线每天只收一次盘，6 小时足够
const YAHOO_RANGE = '10y';
const YAHOO_INCREMENTAL_RANGE = '5d';      // 增量刷新只拉最近 5 天，合并进本地全量缓存
const BACKUP_FULL_ROWS = 3000;             // 备选源无缓存时的全量拉取行数
const BACKUP_INCREMENTAL_ROWS = 10;        // 备选源有缓存时只补最近 10 个交易日
const YAHOO_TIMEOUT = 8000;
const BACKUP_TIMEOUT = 5000;
const COLD_START_MS = 4000;                // 冷启动熔断：超时先返回已有数据，抓取继续在后台写缓存

// 备选源限流保护：东方财富对短时间内的密集请求会直接重置连接（socket hang up）。
// 失败后对该标的进入冷却期，避免在被限流期间持续加压导致封锁时间延长。
const BACKUP_COOLDOWN_MS = 30 * 60 * 1000;
const BACKUP_STAGGER_MS = 2000;            // 批量刷新时各标的之间的间隔
const backupCooldown = new Map();           // symbol -> 冷却截止时间戳

/**
 * 备选数据源：东方财富日 K 线。
 * secid 前缀含义： 1. = 上交所   100. = 全球指数   101. = 期货
 *
 * 无备选源的标的（东方财富无对应品种，Stooq 已因反爬校验失效）：
 *   ^SOX ^VIX ^GVZ ^VXFXI ^VHSI  → 仅 Yahoo 单源
 */
const EASTMONEY_MAP = {
  '000300.SS': '1.000300',
  '000001.SS': '1.000001',
  '000688.SS': '1.000688',
  '^NDX': '100.NDX100',
  '^GSPC': '100.SPX',
  'GC=F': '101.GC00Y',
  'SI=F': '101.SI00Y',
};

/**
 * 备选数据源：新浪财经日 K 线（仅 A 股）。
 * datalen 上限 3000，可回溯约 12 年，是目前 A 股历史最全的免费源。
 * 对比：Yahoo 对 000300.SS 只给到 2021-03，腾讯上限 2000 条（到 2018-05）。
 */
const SINA_MAP = {
  '000300.SS': 'sh000300',
  '000001.SS': 'sh000001',
  '000688.SS': 'sh000688',
};

const ALL_SYMBOLS = [
  '^VIX', '^NDX', '^SOX', '^GSPC',              // 美股
  '^VXFXI', '000300.SS', '000001.SS', '000688.SS', // A股
  '^GVZ', 'GC=F', 'SI=F',                       // 黄金
];

const hasBackup = (symbol) => !!(EASTMONEY_MAP[symbol] || SINA_MAP[symbol]);

// ── 磁盘缓存读写 ────────────────────────────────────────────
function getCachePath(symbol) {
  return path.join(DATA_DIR, `cache_${symbol.replace(/[\^]/g, '').toLowerCase()}.json`);
}

function getBackupCachePath(symbol) {
  return path.join(DATA_DIR, `backup_${symbol.replace(/[^\w]/g, '').toLowerCase()}.json`);
}

function readLocalCache(symbol) {
  const p = getCachePath(symbol);
  if (!fs.existsSync(p)) return null;
  try {
    const ageMs = Date.now() - fs.statSync(p).mtimeMs;
    const content = fs.readFileSync(p, 'utf8');
    return { content, ageMs, isValid: ageMs < CACHE_TTL_MS };
  } catch (err) {
    console.error(`[cache] 读取失败 ${symbol}:`, err.message);
    return null;
  }
}

function saveLocalCache(symbol, rawData) {
  try {
    fs.writeFileSync(getCachePath(symbol), rawData, 'utf8');
  } catch (err) {
    console.error(`[cache] 写入失败 ${symbol}:`, err.message);
  }
}

function readBackupCache(symbol) {
  const p = getBackupCachePath(symbol);
  if (!fs.existsSync(p)) return null;
  try {
    const ageMs = Date.now() - fs.statSync(p).mtimeMs;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return { data, ageMs, isValid: ageMs < BACKUP_TTL_MS };
  } catch (e) {
    return null;
  }
}

function saveBackupCache(symbol, data) {
  try {
    fs.writeFileSync(getBackupCachePath(symbol), JSON.stringify(data), 'utf8');
  } catch (e) {
    console.error(`[backup] 写入失败 ${symbol}:`, e.message);
  }
}

// 备选源写盘：新数据合并进已有备份缓存（增量刷新时保留历史），返回完整映射
function saveBackupMerged(symbol, newMap) {
  const merged = { ...(readBackupCache(symbol)?.data || {}), ...newMap };
  saveBackupCache(symbol, merged);
  return merged;
}

// ── Yahoo Finance ───────────────────────────────────────────
// 成功时回写磁盘缓存并回调原始 JSON 字符串，失败回调 null
// opts.range              拉取范围，默认 10y 全量
// opts.skipWrite          只回调不写盘（增量拉取时用，避免 5d 数据覆盖 10y 缓存）
// opts.skipTencentFallback 跳过 000688.SS 的腾讯补全判定（增量合并时缓存已是全量）
function fetchYahooRaw(symbol, callback, opts = {}) {
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    + `?range=${opts.range || YAHOO_RANGE}&interval=1d&events=history&includePrePost=false`;

  const req = https.get(yahooUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://finance.yahoo.com/',
      'Origin': 'https://finance.yahoo.com',
    }
  }, (r) => {
    let raw = '';
    r.on('data', c => raw += c);
    r.on('end', () => {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.chart?.result) {
          const res0 = parsed.chart.result[0];
          // 特殊判定：若为 000688.SS 且 Yahoo 仅返回 <= 5 天历史，使用腾讯财经补全
          if (!opts.skipTencentFallback && symbol === '000688.SS' && (!res0.timestamp || res0.timestamp.length <= 5)) {
            console.warn('[yahoo] 000688.SS 历史点数不足，使用腾讯财经 1200 天备选源补全...');
            fetchTencentKC50((tStr) => {
              if (tStr) {
                saveLocalCache(symbol, tStr);
                callback(tStr);
              } else {
                saveLocalCache(symbol, raw);
                callback(raw);
              }
            });
            return;
          }
          if (!opts.skipWrite) saveLocalCache(symbol, raw);
          callback(raw);
          return;
        }
        const desc = parsed?.chart?.error?.description;
        console.warn(`[yahoo] ${symbol} 无数据${desc ? ': ' + desc : ''} (HTTP ${r.statusCode})`);
      } catch (e) {
        console.error(`[yahoo] ${symbol} 响应解析失败:`, e.message);
      }
      callback(null);
    });
  });

  req.on('error', (err) => {
    console.error(`[yahoo] ${symbol} 网络错误:`, err.message);
    callback(null);
  });
  req.setTimeout(YAHOO_TIMEOUT, () => {
    req.destroy();
    console.warn(`[yahoo] ${symbol} 超时 (${YAHOO_TIMEOUT}ms)`);
    callback(null);
  });
}

/**
 * 增量合并：把 range=5d 的新数据并入本地 10y 全量缓存。
 * 按时间戳对齐：已存在的点用非空新值原地更新（盘中最新价会变；
 * null 不覆盖已有有效值，避免把历史好数据冲成空洞），新时间戳追加到末尾。
 * 返回合并后的 JSON 字符串；任一解析失败返回 null（交由全量抓取兜底）。
 */
function mergeYahooIncremental(cachedContent, incContent) {
  try {
    const base = JSON.parse(cachedContent)?.chart?.result?.[0];
    const inc = JSON.parse(incContent)?.chart?.result?.[0];
    const quote = base?.indicators?.quote?.[0];
    const incQuote = inc?.indicators?.quote?.[0];
    if (!base?.timestamp || !inc?.timestamp || !quote || !incQuote) return null;

    const idxByTs = new Map(base.timestamp.map((t, i) => [t, i]));
    const fields = ['open', 'high', 'low', 'close', 'volume'];
    let updated = 0, appended = 0;

    inc.timestamp.forEach((t, i) => {
      const j = idxByTs.get(t);
      if (j == null) {
        idxByTs.set(t, base.timestamp.length);
        base.timestamp.push(t);
        for (const f of fields) (quote[f] = quote[f] || []).push(incQuote[f]?.[i] ?? null);
        appended++;
      } else {
        for (const f of fields) {
          const v = incQuote[f]?.[i];
          if (v != null && quote[f]) quote[f][j] = v;
        }
        updated++;
      }
    });

    // adjclose 与 quote 同索引，一并合并
    const baseAdj = base.indicators.adjclose?.[0]?.adjclose;
    const incAdj = inc.indicators?.adjclose?.[0]?.adjclose;
    if (baseAdj && incAdj) {
      inc.timestamp.forEach((t, i) => {
        const j = idxByTs.get(t);
        const v = incAdj[i];
        if (j === baseAdj.length) baseAdj.push(v ?? null);
        else if (j < baseAdj.length && v != null) baseAdj[j] = v;
      });
    }

    base.meta = inc.meta || base.meta;
    if (updated || appended) {
      console.log(`[yahoo] 增量合并: 更新 ${updated} 点, 追加 ${appended} 点`);
    }
    return JSON.stringify({ chart: { result: [base], error: null } });
  } catch (e) {
    console.warn('[yahoo] 增量合并失败:', e.message);
    return null;
  }
}

/**
 * 刷新 Yahoo 缓存（增量优先）。
 * 已有全量缓存 → 只拉最近 5 天合并，避免每次重下 10 年数据；
 * 无缓存 → 全量 10y；增量拉取/合并失败 → 保留旧缓存并全量兜底。
 */
function refreshYahoo(symbol) {
  const cache = readLocalCache(symbol);
  if (!cache) { fetchYahooRaw(symbol, () => { }); return; }

  fetchYahooRaw(symbol, (incRaw) => {
    if (!incRaw) return; // 增量拉取失败：保留旧缓存，等下个周期
    const merged = mergeYahooIncremental(cache.content, incRaw);
    if (merged) {
      saveLocalCache(symbol, merged);
    } else {
      console.warn(`[yahoo] ${symbol} 增量合并失败，回退全量抓取`);
      fetchYahooRaw(symbol, () => { });
    }
  }, { range: YAHOO_INCREMENTAL_RANGE, skipWrite: true, skipTencentFallback: true });
}

// ── 新浪财经备选源（A 股，回溯约 12 年）──
// 成功时与已有备份缓存合并后写盘，并回调完整的日期映射，失败回调 null
function fetchSinaData(symbol, limit, callback) {
  const code = SINA_MAP[symbol];
  if (!code) { callback(null); return; }

  const until = backupCooldown.get(symbol);
  if (until && Date.now() < until) { callback(null); return; }

  const sinaUrl = 'https://money.finance.sina.com.cn/quotes_service/api/json_v2.php'
    + `/CN_MarketData.getKLineData?symbol=${code}&scale=240&ma=no&datalen=${limit}`;

  const req = https.get(sinaUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://finance.sina.com.cn/',
    }
  }, (r) => {
    let raw = '';
    r.on('data', c => raw += c);
    r.on('end', () => {
      try {
        // 响应是 JS 字面量，键名没有引号，补上后才能 JSON.parse。
        // 只匹配 { 或 , 之后的键名，避免误伤值内容。
        const rows = JSON.parse(raw.replace(/([{,])\s*(\w+)\s*:/g, '$1"$2":'));
        if (!Array.isArray(rows) || rows.length === 0) { callback(null); return; }

        const map = {};
        for (const row of rows) {
          const dateStr = String(row.day || '').trim();
          const closeVal = parseFloat(row.close);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || isNaN(closeVal) || closeVal <= 0) continue;
          map[dateStr] = { t: Math.floor(new Date(dateStr + 'T12:00:00Z').getTime() / 1000), v: closeVal };
        }
        const count = Object.keys(map).length;
        if (count === 0) { callback(null); return; }
        console.log(`[sina] ${symbol} → ${code}: ${count} 个数据点`);
        const merged = saveBackupMerged(symbol, map);
        callback(merged);
      } catch (e) {
        console.warn(`[sina] ${symbol} 解析失败:`, e.message);
        callback(null);
      }
    });
  });

  req.on('error', e => { console.warn(`[sina] ${symbol} 网络错误:`, e.message); callback(null); });
  req.setTimeout(BACKUP_TIMEOUT, () => { req.destroy(); console.warn(`[sina] ${symbol} 超时`); callback(null); });
}

// ── 腾讯财经备选源（专门用于补全 000688.SS 科创50 历史）──
// limit 取 1800：科创50 基日为 2019-12-31，至今约 1595 个交易日，
// 1800 可覆盖全部历史（原先的 1200 会把起点截断到 2021-08，丢掉近两年）。
// 注意上限不能再提，实测 3000 会返回无法解析的响应。
function fetchTencentKC50(callback) {
  const tencentUrl = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh000688,day,,,1800,qfq';
  https.get(tencentUrl, (r) => {
    let raw = '';
    r.on('data', c => raw += c);
    r.on('end', () => {
      try {
        const json = JSON.parse(raw);
        const dayData = (json.data && json.data.sh000688) ? (json.data.sh000688.day || json.data.sh000688.qfqday) : [];
        if (!dayData || !dayData.length) { callback(null); return; }

        const timestamp = [], open = [], high = [], low = [], close = [], volume = [];
        dayData.forEach(row => {
          const dateStr = row[0];
          const o = parseFloat(row[1]), c = parseFloat(row[2]), h = parseFloat(row[3]), l = parseFloat(row[4]), v = parseFloat(row[5]);
          const ts = Math.floor(new Date(dateStr + 'T00:00:00Z').getTime() / 1000);
          timestamp.push(ts); open.push(o); close.push(c); high.push(h); low.push(l); volume.push(v);
        });

        const yahooFormatted = {
          chart: {
            result: [{
              meta: {
                currency: "CNY", symbol: "000688.SS", exchangeName: "SHH", fullExchangeName: "Shanghai",
                instrumentType: "INDEX", firstTradeDate: timestamp[0], regularMarketTime: timestamp[timestamp.length - 1],
                regularMarketPrice: close[close.length - 1], chartPreviousClose: close[close.length - 2] || close[close.length - 1],
                dataGranularity: "1d", range: "5y", validRanges: ["1d", "5d", "1mo", "1y", "5y"]
              },
              timestamp,
              indicators: { quote: [{ open, high, low, close, volume }], adjclose: [{ adjclose: close }] }
            }],
            error: null
          }
        };
        callback(JSON.stringify(yahooFormatted));
      } catch (e) {
        callback(null);
      }
    });
  }).on('error', () => callback(null));
}

// Yahoo 原始 JSON → 以自然日为键的映射 { "YYYY-MM-DD": { t, v } }
// Yahoo 有时间戳但收盘价为空时 v 为 null，交由 mergeAndValidate 用备选源补全
function parseYahooToDateMap(yahooContent) {
  try {
    const res = JSON.parse(yahooContent)?.chart?.result?.[0];
    if (!res) return null;
    const tss = res.timestamp || [];
    const cls = res.indicators?.quote?.[0]?.close || [];
    const map = {};
    tss.forEach((t, i) => {
      const date = new Date(t * 1000).toISOString().split('T')[0];
      map[date] = { t, v: (cls[i] != null && !isNaN(cls[i])) ? cls[i] : null };
    });
    return map;
  } catch (e) {
    return null;
  }
}

// ── 备选源：东方财富日 K 线 ─────────────────────────────────
// 成功时与已有备份缓存合并后写盘，并回调完整的日期映射，失败回调 null
/**
 * 备选源路由。
 *
 * A 股优先走新浪财经：Yahoo 对 000300.SS 只给到 2021-03（上证却有完整 10 年），
 * 而新浪 datalen=3000 可回溯至 2014，且与 Yahoo 重叠段实测最大偏差 0.58%。
 * 新浪失败时退回东方财富。美股与黄金新浪没有对应品种，仍走东方财富。
 *
 * 行数策略：已有备份缓存 → 只拉最近 BACKUP_INCREMENTAL_ROWS 行增量合并；
 * 无缓存 → 全量 BACKUP_FULL_ROWS 行。
 */
function fetchBackupData(symbol, callback) {
  const limit = readBackupCache(symbol) ? BACKUP_INCREMENTAL_ROWS : BACKUP_FULL_ROWS;
  if (SINA_MAP[symbol]) {
    fetchSinaData(symbol, limit, (map) => {
      if (map) { callback(map); return; }
      if (EASTMONEY_MAP[symbol]) fetchEastmoneyData(symbol, limit, callback);
      else callback(null);
    });
    return;
  }
  fetchEastmoneyData(symbol, limit, callback);
}

function fetchEastmoneyData(symbol, limit, callback) {
  const secid = EASTMONEY_MAP[symbol];
  if (!secid) { callback(null); return; }

  const until = backupCooldown.get(symbol);
  if (until && Date.now() < until) {
    console.log(`[eastmoney] ${symbol} 冷却中，跳过 (剩余 ${Math.round((until - Date.now()) / 1000)}s)`);
    callback(null);
    return;
  }

  const fail = (reason) => {
    backupCooldown.set(symbol, Date.now() + BACKUP_COOLDOWN_MS);
    console.warn(`[eastmoney] ${symbol} ${reason}，进入 ${BACKUP_COOLDOWN_MS / 60000} 分钟冷却`);
    callback(null);
  };

  const emUrl = `http://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}`
    + `&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55&klt=101&fqt=1&end=20500101&lmt=${limit}`;

  const req = http.get(emUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://quote.eastmoney.com/',
      'Accept': '*/*',
    }
  }, (r) => {
    let raw = '';
    r.on('data', c => raw += c);
    r.on('end', () => {
      try {
        const klines = JSON.parse(raw)?.data?.klines || [];
        if (klines.length === 0) {
          console.warn(`[eastmoney] ${symbol} → ${secid}: 无数据（secid 可能失效）`);
          callback(null);
          return;
        }
        backupCooldown.delete(symbol);
        const map = {};
        for (const line of klines) {
          const parts = line.split(',');
          if (parts.length < 3) continue;
          const dateStr = parts[0].trim();
          const closeVal = parseFloat(parts[2].trim());
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || isNaN(closeVal) || closeVal <= 0) continue;
          map[dateStr] = { t: Math.floor(new Date(dateStr + 'T12:00:00Z').getTime() / 1000), v: closeVal };
        }
        const count = Object.keys(map).length;
        if (count === 0) { callback(null); return; }
        console.log(`[eastmoney] ${symbol} → ${secid}: ${count} 个数据点`);
        const merged = saveBackupMerged(symbol, map);
        callback(merged);
      } catch (e) {
        fail(`解析失败 (${e.message})`);
      }
    });
  });

  req.on('error', e => fail(`网络错误 (${e.message})`));
  req.setTimeout(BACKUP_TIMEOUT, () => { req.destroy(); fail('超时'); });
}

// ── 双源合并与交叉校验 ──────────────────────────────────────
// Yahoo 为主源，缺失处用备选源补全；两源同日偏差 > 1% 记入 crossValidation
function mergeAndValidate(yahooMap, backupMap, symbol) {
  const allDates = new Set([
    ...Object.keys(yahooMap || {}),
    ...Object.keys(backupMap || {}),
  ]);

  const series = [];
  const discrepancies = [];

  Array.from(allDates).sort().forEach(date => {
    const yEntry = yahooMap?.[date];
    const bEntry = backupMap?.[date];
    const yV = yEntry?.v;
    const bV = bEntry?.v;

    if (yV != null && bV != null) {
      const diffPct = Math.abs(yV - bV) / Math.abs(yV) * 100;
      if (diffPct > 1.0) {
        discrepancies.push({ date, yahoo: +yV.toFixed(4), backup: +bV.toFixed(4), diff_pct: +diffPct.toFixed(3) });
        console.warn(`⚠️  [校验] ${symbol} ${date}: Yahoo=${yV.toFixed(2)} 备选=${bV.toFixed(2)} Δ${diffPct.toFixed(2)}%`);
      }
    }

    let finalV = null, source = 'missing';
    if (yV != null) { finalV = yV; source = 'yahoo'; }
    else if (bV != null) { finalV = bV; source = 'backup'; }

    const t = yEntry?.t || bEntry?.t;
    if (t) series.push({ t, v: finalV, source, date });
  });

  return { series, crossValidation: { discrepancies } };
}

/**
 * 取得某标的的合并数据。
 *
 * 响应策略：
 *   1. 磁盘有 Yahoo 缓存 → 立即返回（即使过期），过期部分在后台静默刷新
 *   2. 无任何缓存 → 并行抓取 Yahoo + 备选源，4 秒熔断兜底
 *
 * @param {string} symbol
 * @param {(payload: object, meta: object) => void} callback
 */
function buildMerged(symbol, callback) {
  const yahooCache = readLocalCache(symbol);
  const backupCache = readBackupCache(symbol);
  const backupable = hasBackup(symbol);
  let sent = false;

  function send(yahooMap, backupMap, fromCache) {
    if (sent) return;
    sent = true;
    const { series, crossValidation } = mergeAndValidate(yahooMap, backupMap, symbol);
    const missingCt = series.filter(p => p.source === 'missing').length;
    const backupCt = series.filter(p => p.source === 'backup').length;
    if (missingCt || backupCt) {
      console.log(`[merged] ${symbol}: ${missingCt} 缺失点, ${backupCt} 由备选源补全, ${crossValidation.discrepancies.length} 校验偏差`);
    }
    callback(
      { symbol, merged: true, series, crossValidation },
      { missingCt, backupCt, fromCache }
    );
  }

  // 1️⃣ 缓存优先：只要磁盘上有 Yahoo 缓存就立即响应，陈旧部分后台补
  if (yahooCache) {
    console.log(`[merged] ⚡ 磁盘缓存命中: ${symbol} (age ${Math.round(yahooCache.ageMs / 1000)}s)`);
    send(parseYahooToDateMap(yahooCache.content), backupCache?.data || null, true);

    if (!yahooCache.isValid) refreshYahoo(symbol);
    if (backupable && !backupCache?.isValid) fetchBackupData(symbol, () => { });
    return;
  }

  // 2️⃣ 冷启动：并行抓取，4 秒熔断先返回已有内容（抓取继续跑完以写热缓存）
  let pending = 0;
  let yahooMap = null;
  let backupMap = backupCache?.data || null;

  const breaker = setTimeout(() => {
    console.warn(`[merged] ⏰ 冷启动 ${COLD_START_MS}ms 熔断: ${symbol}`);
    send(yahooMap, backupMap, false);
  }, COLD_START_MS);

  function tick() {
    if (--pending <= 0) {
      clearTimeout(breaker);
      send(yahooMap, backupMap, false);
    }
  }

  pending++;
  fetchYahooRaw(symbol, (raw) => {
    if (raw) yahooMap = parseYahooToDateMap(raw);
    tick();
  });

  if (backupable && !backupCache?.isValid) {
    pending++;
    fetchBackupData(symbol, (map) => {
      if (map) backupMap = map;
      tick();
    });
  }
}

/**
 * 定时刷新全部标的。
 *
 * Yahoo 并发无妨；备选源必须串行错峰——东方财富对密集请求会直接重置连接，
 * 一旦触发限流，全部 A 股补全数据都会断供。
 *
 * @param {boolean} force 为 true 时忽略 Yahoo 缓存有效期强制刷新（走增量合并，代价很小）；
 *                        备选源始终尊重自己的 6 小时 TTL，不受 force 影响。
 */
function refreshAll(force = false) {
  for (const symbol of ALL_SYMBOLS) {
    if (force || !readLocalCache(symbol)?.isValid) refreshYahoo(symbol);
  }

  const pendingBackup = ALL_SYMBOLS.filter(s => hasBackup(s) && !readBackupCache(s)?.isValid);
  pendingBackup.forEach((symbol, i) => {
    setTimeout(() => fetchBackupData(symbol, () => { }), i * BACKUP_STAGGER_MS);
  });
}

module.exports = {
  DATA_DIR,
  CACHE_TTL_MS,
  BACKUP_TTL_MS,
  ALL_SYMBOLS,
  EASTMONEY_MAP,
  hasBackup,
  readLocalCache,
  saveLocalCache,
  readBackupCache,
  saveBackupCache,
  fetchYahooRaw,
  fetchBackupData,
  refreshYahoo,
  mergeYahooIncremental,
  parseYahooToDateMap,
  mergeAndValidate,
  buildMerged,
  refreshAll,
};
