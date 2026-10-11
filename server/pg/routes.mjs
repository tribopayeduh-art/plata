import path from 'node:path';
import express from 'express';
import { createPgWallet, localPgCatalog } from './wallet.mjs';

export function registerPgRoutes(app, options) {
  const wallet = createPgWallet(options);
  const fail = (res, error) => res.status(error.status || 503).json({ dt: null, err: { cd: '1302', msg: error.message }, error: 'PG_WALLET_ERROR', message: error.message });
  app.post(['/api/game_launch', '/api/igamewin/launch'], (req, res, next) => {
    const code = String(req.body?.game_code || req.body?.gameCode || '');
    if (!code.startsWith('local-pg-')) return next();
    options.verifyUser(req, res, async () => {
      try {
        if (req.body.demo) return res.status(400).json({ error: 'Modo demonstração não usa a carteira do jogador.' });
        res.setHeader('Cache-Control', 'no-store');
        res.json(await wallet.launch(req.user.uid, code));
      } catch (error) { fail(res, error); }
    });
  });
  app.use(['/web-api', '/game-api', '/local-api'], async (req, res) => {
    try {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
      const body = req.body || {};
      const token = String(req.headers['x-pg-session'] || body.atk || body.tk || req.query.t || '');
      // Report only short diagnostics; never persist launch tickets or request bodies.
      if (req.originalUrl.split('?')[0] === '/local-api/client-log') {
        wallet.verify(token);
        console.warn('[pg-client]', String(body.kind || '').slice(0,40), String(body.message || '').replace(/[A-Za-z0-9_-]{120,}/g, '[redacted]').slice(0,200));
        return res.json({ ok: true });
      }
      const result = await wallet.request({ pathname: req.originalUrl.split('?')[0], body, token, requestId: String(req.headers['x-pg-request-id'] || '') });
      res.setHeader('Cache-Control', 'no-store');
      res.json(result);
    } catch (error) { fail(res, error); }
  });
  const publicPath = path.resolve(process.cwd(), 'public');
  const serve = directory => express.static(directory, {
    setHeaders(res, file) {
      res.setHeader('Cache-Control', /\.(html|json)$/.test(file) ? 'no-cache' : 'public, max-age=86400');
      if (file.endsWith('sw.js')) { res.setHeader('Service-Worker-Allowed', '/'); res.setHeader('Cache-Control', 'no-store'); }
    },
  });
  for (const game of localPgCatalog) {
    const id = game.code.replace('local-pg-', '');
    app.use('/' + id, serve(path.join(publicPath, id)), (_req, res) => res.status(404).end());
  }
  app.use('/shared', serve(path.join(publicPath, 'shared')), (_req, res) => res.status(404).end());
  app.get(['/game-bridge-v6.js', '/telemetry-disabled.js'], (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(publicPath, path.basename(req.path)));
  });
  return wallet;
}
