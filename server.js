/**
 * server.js — Local proxy server for Yahoo Finance data
 * Serves the static files AND proxies Yahoo Finance API to avoid CORS
 */

const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const url     = require('url');

const PORT = process.env.PORT || 3399;
const STATIC_DIR = __dirname;

// MIME types
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
};

const IS_VERCEL = !!process.env.VERCEL;
const DATA_DIR  = IS_VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, 'data');
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('[cache] Directory creation warning:', e.message);
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCachePath(symbol) {
  const safeName = symbol.replace(/[\^]/g, '').toLowerCase();
  return path.join(DATA_DIR, `cache_${safeName}.json`);
}

// Read from local cache file if valid
function readLocalCache(symbol) {
  const cachePath = getCachePath(symbol);
  if (!fs.existsSync(cachePath)) return null;
  try {
    const stat = fs.statSync(cachePath);
    const ageMs = Date.now() - stat.mtimeMs;
    const content = fs.readFileSync(cachePath, 'utf8');
    const json = JSON.parse(content);
    return { json, content, ageMs, isValid: ageMs < CACHE_TTL_MS };
  } catch (err) {
    console.error(`[cache] Read error for ${symbol}:`, err.message);
    return null;
  }
}

// Save to local cache file
function saveLocalCache(symbol, rawData) {
  const cachePath = getCachePath(symbol);
  try {
    fs.writeFileSync(cachePath, rawData, 'utf8');
    console.log(`[cache] Saved ${symbol} to local disk JSON (${cachePath})`);
  } catch (err) {
    console.error(`[cache] Save error for ${symbol}:`, err.message);
  }
}

// ── Backup Data Sources (Eastmoney for A-shares, Stooq for US/Gold) ──
const EASTMONEY_MAP = {
  '000300.SS': '1.000300',
  '000001.SS': '1.000001',
};

const STOOQ_MAP = {
  '^VIX':      '^vix',
  '^NDX':      '^ndq',
  '^SOX':      '^sox',
  'GC=F':      'gc.f',
  'SI=F':      'si.f',
};

function getBackupCachePath(yahooSym) {
  const safe = yahooSym.replace(/[^\w]/g, '').toLowerCase();
  return path.join(DATA_DIR, `backup_${safe}.json`);
}

function readBackupCache(yahooSym) {
  const p = getBackupCachePath(yahooSym);
  if (!fs.existsSync(p)) return null;
  try {
    const stat = fs.statSync(p);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const ageMs = Date.now() - stat.mtimeMs;
    return { data, ageMs, isValid: ageMs < CACHE_TTL_MS };
  } catch (e) { return null; }
}

function saveBackupCache(yahooSym, data) {
  try {
    fs.writeFileSync(getBackupCachePath(yahooSym), JSON.stringify(data), 'utf8');
    console.log(`[backup cache] Saved ${yahooSym}`);
  } catch (e) { console.error(`[backup cache] Save error ${yahooSym}:`, e.message); }
}

// Fetch Eastmoney daily KLine data for A-shares → date-keyed map: { "YYYY-MM-DD": { t, v } }
function fetchEastmoneyData(yahooSym, callback) {
  const secid = EASTMONEY_MAP[yahooSym];
  if (!secid) { callback(null); return; }
  const emUrl = `http://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55&klt=101&fqt=1&end=20500101&lmt=1500`;
  const req = http.get(emUrl, (r) => {
    let raw = '';
    r.on('data', c => raw += c);
    r.on('end', () => {
      try {
        const j = JSON.parse(raw);
        const klines = j?.data?.klines || [];
        if (klines.length === 0) { callback(null); return; }
        const map = {};
        for (const line of klines) {
          const parts = line.split(',');
          if (parts.length < 3) continue;
          const dateStr  = parts[0].trim();
          const closeVal = parseFloat(parts[2].trim());
          if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/) || isNaN(closeVal) || closeVal <= 0) continue;
          const ts = Math.floor(new Date(dateStr + 'T12:00:00Z').getTime() / 1000);
          map[dateStr] = { t: ts, v: closeVal };
        }
        const count = Object.keys(map).length;
        console.log(`[eastmoney] ${yahooSym} → ${secid}: ${count} data points`);
        callback(count > 0 ? map : null);
      } catch (e) {
        console.error(`[eastmoney] Parse error ${yahooSym}:`, e.message);
        callback(null);
      }
    });
  });
  req.on('error', e => { console.error(`[eastmoney] Network error ${yahooSym}:`, e.message); callback(null); });
  req.setTimeout(15000, () => { req.destroy(); console.warn(`[eastmoney] Timeout ${yahooSym}`); callback(null); });
}

// Fetch Stooq daily CSV → date-keyed map
function fetchStooqData(yahooSym, callback) {
  const stooqSym = STOOQ_MAP[yahooSym];
  if (!stooqSym) { callback(null); return; }
  const stooqUrl = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSym)}&i=d`;
  const req = https.get(stooqUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/csv;q=0.8,*/*;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  }, (r) => {
    let raw = '';
    r.on('data', c => raw += c);
    r.on('end', () => {
      try {
        const lines = raw.trim().split('\n');
        if (lines.length < 2 || raw.includes('No data') || raw.includes('Przekroczono')) {
          callback(null); return;
        }
        const map = {};
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(',');
          if (parts.length < 5) continue;
          const dateStr  = parts[0].trim();
          const closeVal = parseFloat(parts[4].trim());
          if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/) || isNaN(closeVal) || closeVal <= 0) continue;
          const ts = Math.floor(new Date(dateStr + 'T12:00:00Z').getTime() / 1000);
          map[dateStr] = { t: ts, v: closeVal };
        }
        const count = Object.keys(map).length;
        console.log(`[stooq] ${yahooSym} → ${stooqSym}: ${count} data points`);
        callback(count > 0 ? map : null);
      } catch (e) {
        callback(null);
      }
    });
  });
  req.on('error', e => { callback(null); });
  req.setTimeout(15000, () => { req.destroy(); callback(null); });
}

// Unified backup fetcher: routes A-shares to Eastmoney, others to Stooq
function fetchBackupData(yahooSym, callback) {
  if (EASTMONEY_MAP[yahooSym]) {
    fetchEastmoneyData(yahooSym, callback);
  } else if (STOOQ_MAP[yahooSym]) {
    fetchStooqData(yahooSym, callback);
  } else {
    callback(null);
  }
}

// Parse Yahoo raw JSON string → date-keyed map  { "YYYY-MM-DD": { t, v } }
// v is null for dates Yahoo has timestamps but missing close prices
function parseYahooToDateMap(yahooContent) {
  try {
    const json  = JSON.parse(yahooContent);
    const res   = json?.chart?.result?.[0];
    if (!res) return null;
    const tss   = res.timestamp || [];
    const cls   = res.indicators?.quote?.[0]?.close || [];
    const map   = {};
    tss.forEach((t, i) => {
      const date = new Date(t * 1000).toISOString().split('T')[0];
      const v    = (cls[i] != null && !isNaN(cls[i])) ? cls[i] : null;
      map[date]  = { t, v };
    });
    return map;
  } catch (e) { return null; }
}

// Merge Yahoo + Stooq maps, cross-validate discrepancies > 1%
// Returns { series: [{t, v, source, date}], crossValidation: {discrepancies: [...]} }
function mergeAndValidate(yahooMap, stooqMap, symbol) {
  const allDates = new Set([
    ...Object.keys(yahooMap  || {}),
    ...Object.keys(stooqMap  || {}),
  ]);

  const series       = [];
  const discrepancies = [];

  Array.from(allDates).sort().forEach(date => {
    const yEntry = yahooMap?.[date];
    const sEntry = stooqMap?.[date];
    const yV = yEntry?.v;
    const sV = sEntry?.v;

    // Cross-validate: both sources have a real value
    if (yV != null && sV != null) {
      const diffPct = Math.abs(yV - sV) / Math.abs(yV) * 100;
      if (diffPct > 1.0) {
        discrepancies.push({ date, yahoo: +yV.toFixed(4), stooq: +sV.toFixed(4), diff_pct: +diffPct.toFixed(3) });
        console.warn(`⚠️  [校验] ${symbol} ${date}: Yahoo=${yV.toFixed(2)} Stooq=${sV.toFixed(2)} Δ${diffPct.toFixed(2)}%`);
      }
    }

    // Pick best value: Yahoo (primary) → Stooq (backup) → null (missing)
    let finalV = null, source = 'missing';
    if (yV != null)      { finalV = yV; source = 'yahoo'; }
    else if (sV != null) { finalV = sV; source = 'stooq'; }

    const t = yEntry?.t || sEntry?.t;
    if (t) series.push({ t, v: finalV, source, date });
  });

  return { series, crossValidation: { discrepancies } };
}

// Handle /api/merged route: fetch Yahoo + Backup (Eastmoney/Stooq), merge, return unified JSON
function serveMerged(symbol, res) {
  const yahooCache  = readLocalCache(symbol);
  const backupCache = readBackupCache(symbol);
  const hasBackup   = !!(EASTMONEY_MAP[symbol] || STOOQ_MAP[symbol]);
  let sent          = false;

  function sendResult(yahooMap, backupMap) {
    if (sent) return; sent = true;
    const { series, crossValidation } = mergeAndValidate(yahooMap, backupMap, symbol);
    const missingCt = series.filter(p => p.source === 'missing').length;
    const backupCt  = series.filter(p => p.source === 'backup' || p.source === 'eastmoney' || p.source === 'stooq').length;
    if (missingCt || backupCt) {
      console.log(`[merged] ${symbol}: ${missingCt} 缺失点, ${backupCt} 由备选源补全, ${crossValidation.discrepancies.length} 校验偏差`);
    }
    const payload = JSON.stringify({ symbol, merged: true, series, crossValidation });
    if (res) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Data-Source': 'merged',
        'X-Missing-Count': missingCt,
        'X-Backup-Fill': backupCt,
      });
      res.end(payload);
    }
  }

  // Both caches fresh? Serve immediately
  if (yahooCache?.isValid && (!hasBackup || backupCache?.isValid)) {
    sendResult(
      parseYahooToDateMap(yahooCache.content),
      backupCache?.data || null
    );
    return;
  }

  // Need to refresh stale sources in parallel
  let pending   = 0;
  let yahooMap  = yahooCache ? parseYahooToDateMap(yahooCache.content) : null;
  let backupMap = backupCache?.data || null;

  function tick() { if (--pending === 0) sendResult(yahooMap, backupMap); }

  if (!yahooCache?.isValid) {
    pending++;
    const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d&events=history&includePrePost=false`;
    const yReq = https.get(yUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com/',
      }
    }, (r) => {
      let raw = '';
      r.on('data', c => raw += c);
      r.on('end', () => {
        try {
          const j = JSON.parse(raw);
          if (j?.chart?.result) { saveLocalCache(symbol, raw); yahooMap = parseYahooToDateMap(raw); }
        } catch (e) {}
        tick();
      });
    });
    yReq.on('error', () => tick());
    yReq.setTimeout(15000, () => { yReq.destroy(); tick(); });
  }

  if (hasBackup && !backupCache?.isValid) {
    pending++;
    fetchBackupData(symbol, (map) => {
      if (map) { saveBackupCache(symbol, map); backupMap = map; }
      tick();
    });
  }

  if (pending === 0) sendResult(yahooMap, backupMap);
}

// ── Yahoo Finance proxy with local file cache & 10-min auto update ──
function proxyYahoo(symbol, res, forceFetch = false) {
  const cached = readLocalCache(symbol);

  // If local cache is fresh (<10 min) and not forcing fetch, serve immediately
  if (!forceFetch && cached && cached.isValid) {
    console.log(`[cache] Serving local JSON cache for ${symbol} (age: ${Math.round(cached.ageMs / 1000)}s)`);
    if (res) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Data-Source': 'local-disk-cache',
      });
      res.end(cached.content);
    }
    return;
  }

  // Fetch fresh data from Yahoo Finance
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d&events=history&includePrePost=false`;

  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://finance.yahoo.com/',
      'Origin': 'https://finance.yahoo.com',
    }
  };

  const req = https.get(yahooUrl, options, (yahooRes) => {
    let raw = '';
    yahooRes.on('data', chunk => raw += chunk);
    yahooRes.on('end', () => {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.chart?.result) {
          // Valid data from Yahoo → update local JSON file
          saveLocalCache(symbol, raw);
          if (res) {
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'X-Data-Source': 'yahoo-live',
            });
            res.end(raw);
          }
          return;
        }
      } catch (e) {
        console.error(`[proxy] Invalid JSON response for ${symbol}:`, e.message);
      }

      // If Yahoo returned non-ok or invalid data, fallback to stale local cache if available
      if (cached) {
        console.log(`[cache] Yahoo response invalid, serving fallback local cache for ${symbol}`);
        if (res) {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'X-Data-Source': 'stale-fallback-cache',
          });
          res.end(cached.content);
        }
      } else if (res) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid data from source' }));
      }
    });
  });

  req.on('error', (err) => {
    console.error('[proxy] Yahoo error:', err.message);
    if (cached) {
      console.log(`[cache] Network error, serving fallback local cache for ${symbol}`);
      if (res) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'X-Data-Source': 'stale-fallback-cache',
        });
        res.end(cached.content);
      }
    } else if (res) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  req.setTimeout(15000, () => {
    req.destroy();
    if (cached && res) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Data-Source': 'timeout-fallback-cache',
      });
      res.end(cached.content);
    } else if (res) {
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'timeout' }));
    }
  });
}

// ── Background periodic 10-minute check & update ────────────
const ALL_SYMBOLS = [
  '^VIX', '^NDX', '^SOX',         // US Market
  '^VXFXI', '000300.SS', '000001.SS', // CN Market
  '^GVZ', 'GC=F', 'SI=F',         // Gold Market
];

function startBackgroundCheck() {
  console.log('⏰ [cron] 已启动定时器：每 10 分钟自动校验更新本地 JSON 数据文件');

  // Trigger initial cache population for any missing symbols
  ALL_SYMBOLS.forEach((sym) => {
    proxyYahoo(sym, null, false);
  });

  // Periodic interval: 10 minutes
  setInterval(() => {
    console.log(`\n⏰ [cron] 正在定期校验 9 项大盘数据更新 (10分钟周期)...`);
    ALL_SYMBOLS.forEach((sym) => {
      proxyYahoo(sym, null, true);
    });
  }, CACHE_TTL_MS);
}



// ── Static file server ──────────────────────────────────────
function serveStatic(reqPath, res) {
  const filePath = path.join(STATIC_DIR, reqPath === '/' ? 'index.html' : reqPath);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'text/plain',
    });
    res.end(data);
  });
}

// ── HTTP Server ─────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsed  = url.parse(req.url, true);
  const reqPath = parsed.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' });
    res.end();
    return;
  }

  // API merged route: /api/merged?symbol=^VIX  (Yahoo + Stooq merged with cross-validation)
  if (reqPath === '/api/merged') {
    const symbol = parsed.query.symbol;
    if (!symbol) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'symbol required' }));
      return;
    }
    console.log(`[merged] Requesting: ${symbol}`);
    serveMerged(symbol, res);
    return;
  }

  // API proxy route: /api/yahoo?symbol=^VIX  (Yahoo only, for backward compatibility)
  if (reqPath === '/api/yahoo') {
    const symbol = parsed.query.symbol;
    if (!symbol) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'symbol required' }));
      return;
    }
    console.log(`[proxy] Fetching: ${symbol}`);
    proxyYahoo(symbol, res);
    return;
  }

  // Static files
  serveStatic(reqPath, res);
});

if (!IS_VERCEL) {
  server.listen(PORT, () => {
    console.log(`\n✅ Market Pulse 服务已启动`);
    console.log(`   本地地址: http://localhost:${PORT}`);
    console.log(`   数据代理: http://localhost:${PORT}/api/yahoo?symbol=^VIX`);
    console.log(`   本地缓存: ${DATA_DIR}\n`);
    startBackgroundCheck();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[error] 端口 ${PORT} 已被占用，请关闭其他程序后重试`);
    } else {
      console.error('[error]', err.message);
    }
    process.exit(1);
  });
}

module.exports = (req, res) => {
  server.emit('request', req, res);
};
