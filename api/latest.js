/**
 * api/latest.js — Vercel Serverless Function
 * GET /api/latest?symbol=^VIX[&days=5]
 *
 * 只返回最近 N 个交易日的合并数据，供前端增量刷新使用。
 * 相比 /api/merged 全量返回，网络传输量减少 ~99%。
 *
 * 注意：Vercel 冷启动时 /tmp 为空，buildLatest 会实时抓取并截尾，
 *      行为与 /api/merged 首次冷启动一致，可接受。
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
  const days   = parseInt(urlObj.searchParams.get('days') || req.query?.days) || 5;

  if (!symbol) {
    res.status(400).json({ error: 'symbol required' });
    return;
  }

  const n = Math.max(1, Math.min(days, 30));

  ds.buildLatest(symbol, n, (payload, meta) => {
    const latest = payload.series?.[payload.series.length - 1];
    res.setHeader('X-Data-Source',  meta.fromCache ? 'disk-cache' : 'live-fetch');
    res.setHeader('X-Latest-Date',  latest?.date || '');
    res.setHeader('X-Days-Returned', payload.series?.length || 0);
    res.status(200).json(payload);
  });
};
