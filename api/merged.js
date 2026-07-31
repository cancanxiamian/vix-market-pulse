const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const IS_VERCEL = !!process.env.VERCEL;
const DATA_DIR  = IS_VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, '..', 'data');
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {}

const CACHE_TTL_MS = 10 * 60 * 1000;

const EASTMONEY_MAP = {
  '000300.SS': '1.000300',
  '000001.SS': '1.000001',
};

const STOOQ_MAP = {
  '^VIX':  '^vix',
  '^NDX':  '^ndq',
  '^SOX':  '^sox',
  'GC=F':  'gc.f',
  'SI=F':  'si.f',
};

function getCachePath(symbol) {
  const safeName = symbol.replace(/[\^]/g, '').toLowerCase();
  return path.join(DATA_DIR, `cache_${safeName}.json`);
}

function getBackupCachePath(symbol) {
  const safe = symbol.replace(/[^\w]/g, '').toLowerCase();
  return path.join(DATA_DIR, `backup_${safe}.json`);
}

function readLocalCache(symbol) {
  const cachePath = getCachePath(symbol);
  if (!fs.existsSync(cachePath)) return null;
  try {
    const stat = fs.statSync(cachePath);
    const ageMs = Date.now() - stat.mtimeMs;
    const content = fs.readFileSync(cachePath, 'utf8');
    const json = JSON.parse(content);
    return { json, content, ageMs, isValid: ageMs < CACHE_TTL_MS };
  } catch (err) { return null; }
}

function saveLocalCache(symbol, rawData) {
  try { fs.writeFileSync(getCachePath(symbol), rawData, 'utf8'); } catch (err) {}
}

function readBackupCache(symbol) {
  const p = getBackupCachePath(symbol);
  if (!fs.existsSync(p)) return null;
  try {
    const stat = fs.statSync(p);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const ageMs = Date.now() - stat.mtimeMs;
    return { data, ageMs, isValid: ageMs < CACHE_TTL_MS };
  } catch (e) { return null; }
}

function saveBackupCache(symbol, data) {
  try { fs.writeFileSync(getBackupCachePath(symbol), JSON.stringify(data), 'utf8'); } catch (e) {}
}

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
        callback(Object.keys(map).length > 0 ? map : null);
      } catch (e) { callback(null); }
    });
  });
  req.on('error', () => callback(null));
  req.setTimeout(10000, () => { req.destroy(); callback(null); });
}

function fetchStooqData(yahooSym, callback) {
  const stooqSym = STOOQ_MAP[yahooSym];
  if (!stooqSym) { callback(null); return; }
  const stooqUrl = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSym)}&i=d`;
  const req = https.get(stooqUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,text/csv;q=0.8,*/*;q=0.7',
    }
  }, (r) => {
    let raw = '';
    r.on('data', c => raw += c);
    r.on('end', () => {
      try {
        const lines = raw.trim().split('\n');
        if (lines.length < 2 || raw.includes('No data')) { callback(null); return; }
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
        callback(Object.keys(map).length > 0 ? map : null);
      } catch (e) { callback(null); }
    });
  });
  req.on('error', () => callback(null));
  req.setTimeout(10000, () => { req.destroy(); callback(null); });
}

function fetchBackupData(yahooSym, callback) {
  if (EASTMONEY_MAP[yahooSym]) fetchEastmoneyData(yahooSym, callback);
  else if (STOOQ_MAP[yahooSym]) fetchStooqData(yahooSym, callback);
  else callback(null);
}

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

function mergeAndValidate(yahooMap, backupMap, symbol) {
  const allDates = new Set([
    ...Object.keys(yahooMap  || {}),
    ...Object.keys(backupMap || {}),
  ]);
  const series       = [];
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
      }
    }

    let finalV = null, source = 'missing';
    if (yV != null)      { finalV = yV; source = 'yahoo'; }
    else if (bV != null) { finalV = bV; source = 'backup'; }

    const t = yEntry?.t || bEntry?.t;
    if (t) series.push({ t, v: finalV, source, date });
  });

  return { series, crossValidation: { discrepancies } };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const symbol = urlObj.searchParams.get('symbol') || req.query?.symbol;

  if (!symbol) {
    res.status(400).json({ error: 'symbol required' });
    return;
  }

  const yahooCache  = readLocalCache(symbol);
  const backupCache = readBackupCache(symbol);
  const hasBackup   = !!(EASTMONEY_MAP[symbol] || STOOQ_MAP[symbol]);

  function respond(yMap, bMap) {
    const { series, crossValidation } = mergeAndValidate(yMap, bMap, symbol);
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ symbol, merged: true, series, crossValidation });
  }

  if (yahooCache?.isValid && (!hasBackup || backupCache?.isValid)) {
    respond(parseYahooToDateMap(yahooCache.content), backupCache?.data || null);
    return;
  }

  let pending = 0;
  let yahooMap  = yahooCache ? parseYahooToDateMap(yahooCache.content) : null;
  let backupMap = backupCache?.data || null;

  function done() {
    if (--pending <= 0) respond(yahooMap, backupMap);
  }

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
        done();
      });
    });
    yReq.on('error', () => done());
    yReq.setTimeout(10000, () => { yReq.destroy(); done(); });
  }

  if (hasBackup && !backupCache?.isValid) {
    pending++;
    fetchBackupData(symbol, (map) => {
      if (map) { saveBackupCache(symbol, map); backupMap = map; }
      done();
    });
  }

  if (pending === 0) respond(yahooMap, backupMap);
};
