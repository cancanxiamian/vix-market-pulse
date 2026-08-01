/**
 * api/merged.js — Vercel Serverless Function
 * GET /api/merged?symbol=^VIX
 *
 * 取数、缓存与双源合并逻辑位于 lib/datasource.js，与本地 server.js 共用。
 *
 * 注意：Serverless 环境下缓存目录为 /tmp，冷启动即清空，
 *      因此线上每个新实例的首个请求都会走实时抓取路径（4 秒熔断兜底）。
 */

const ds = require('../lib/datasource');

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const symbol = urlObj.searchParams.get('symbol') || req.query?.symbol;

  if (!symbol) {
    res.status(400).json({ error: 'symbol required' });
    return;
  }

  ds.buildMerged(symbol, (payload, meta) => {
    res.setHeader('X-Data-Source', meta.fromCache ? 'disk-cache' : 'live-fetch');
    res.setHeader('X-Missing-Count', meta.missingCt);
    res.setHeader('X-Backup-Fill', meta.backupCt);
    res.status(200).json(payload);
  });
};
