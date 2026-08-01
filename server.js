/**
 * server.js — 本地开发服务器
 * 托管静态文件 + 代理 Yahoo Finance（规避 CORS）+ 10 分钟定时刷新磁盘缓存
 *
 * 取数、缓存与双源合并逻辑位于 lib/datasource.js，与 Vercel 的 api/merged.js 共用。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ds = require('./lib/datasource');

const PORT = process.env.PORT || 3399;
const STATIC_DIR = __dirname;
const IS_VERCEL = !!process.env.VERCEL;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// ── /api/merged?symbol=X ────────────────────────────────────
function serveMerged(symbol, res) {
  ds.buildMerged(symbol, (payload, meta) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-Data-Source': meta.fromCache ? 'disk-cache' : 'live-fetch',
      'X-Missing-Count': meta.missingCt,
      'X-Backup-Fill': meta.backupCt,
    });
    res.end(JSON.stringify(payload));
  });
}

// ── /api/yahoo?symbol=X （仅 Yahoo 单源，保留向后兼容）──────
function serveYahoo(symbol, res) {
  const cached = ds.readLocalCache(symbol);

  const sendJson = (body, source) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-Data-Source': source,
    });
    res.end(body);
  };

  if (cached?.isValid) {
    sendJson(cached.content, 'disk-cache');
    return;
  }

  ds.fetchYahooRaw(symbol, (raw) => {
    if (raw) {
      sendJson(raw, 'yahoo-live');
    } else if (cached) {
      sendJson(cached.content, 'stale-fallback-cache');
    } else {
      sendJson(JSON.stringify({ chart: { result: [{ timestamp: [], indicators: { quote: [{ close: [] }] } }] } }), 'empty');
    }
  });
}

// ── 定时刷新 ────────────────────────────────────────────────
function startBackgroundCheck() {
  console.log('⏰ [cron] 已启动定时器：每 10 分钟自动校验更新本地 JSON 数据文件');

  ds.refreshAll(false);

  setInterval(() => {
    console.log(`\n⏰ [cron] 正在定期校验 ${ds.ALL_SYMBOLS.length} 项大盘数据更新 (10分钟周期)...`);
    ds.refreshAll(true);
  }, ds.CACHE_TTL_MS);
}

// ── 静态文件 ────────────────────────────────────────────────
function serveStatic(reqPath, res) {
  // 阻断路径穿越：解析后必须仍在 STATIC_DIR 之内
  const safePath = path.normalize(path.join(STATIC_DIR, reqPath === '/' ? 'index.html' : reqPath));
  if (!safePath.startsWith(STATIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(safePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(safePath)] || 'text/plain' });
    res.end(data);
  });
}

// ── HTTP Server ─────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const reqPath = parsed.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' });
    res.end();
    return;
  }

  if (reqPath === '/api/merged' || reqPath === '/api/yahoo') {
    const symbol = parsed.query.symbol;
    if (!symbol) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'symbol required' }));
      return;
    }
    console.log(`[${reqPath === '/api/merged' ? 'merged' : 'proxy'}] 请求: ${symbol}`);
    if (reqPath === '/api/merged') serveMerged(symbol, res);
    else serveYahoo(symbol, res);
    return;
  }

  serveStatic(reqPath, res);
});

if (!IS_VERCEL) {
  server.listen(PORT, () => {
    console.log(`\n✅ Market Pulse 服务已启动`);
    console.log(`   本地地址: http://localhost:${PORT}`);
    console.log(`   数据代理: http://localhost:${PORT}/api/merged?symbol=^VIX`);
    console.log(`   本地缓存: ${ds.DATA_DIR}\n`);
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

module.exports = (req, res) => server.emit('request', req, res);
