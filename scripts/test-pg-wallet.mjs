import assert from 'node:assert/strict';
import { createPgWallet, localPgCatalog, mergePgCatalog } from '../server/pg/wallet.mjs';
import { games } from '../server/pg/games.js';
import { registerPgRoutes } from '../server/pg/routes.mjs';
import express from 'express';

// Serialized transactional double. A failed callback discards all staged writes.
class Database {
  rows = new Map();
  tail = Promise.resolve();
  collection(name) {
    return { doc: id => ({ path: `${name}/${id}`, get: async () => this.snapshot(`${name}/${id}`) }) };
  }
  snapshot(key, rows = this.rows) {
    return { exists: rows.has(key), data: () => structuredClone(rows.get(key)) };
  }
  async runTransaction(callback) {
    const previous = this.tail;
    let release;
    this.tail = new Promise(resolve => { release = resolve; });
    await previous;
    const staged = new Map(this.rows);
    let writing = false;
    try {
      const result = await callback({
        get: async ref => { assert.equal(writing, false, 'All reads precede writes'); return this.snapshot(ref.path, staged); },
        set: (ref, data, options) => { writing = true; staged.set(ref.path, structuredClone(options?.merge ? { ...staged.get(ref.path), ...data } : data)); },
      });
      this.rows = staged;
      return result;
    } finally { release(); }
  }
  user(uid, amount, extra = {}) { this.rows.set(`users/${uid}`, { walletBalance: amount, balance: amount, realBalance: amount, status: 'ACTIVE', ...extra }); }
  balance(uid) { return this.rows.get(`users/${uid}`).walletBalance; }
}
const tokenFrom = result => new URL(result.launch_url, 'http://localhost').searchParams.get('t');
const db = new Database();
db.user('alice', 100);
db.user('bob', 50);
const wallet = createPgWallet({ db, secret: 'test-only-secret', rng: () => .999 });
assert.equal(localPgCatalog.length, 11);
assert.equal(mergePgCatalog([{ name: 'Fortune Tiger', code: 'remote' }, { name: 'Other' }]).length, 12);
assert.equal(mergePgCatalog([], 'OTHER').length, 0);
for (const game of games) {
  const token = tokenFrom(await wallet.launch('alice', `local-pg-${game.id}`));
  const base = `/game-api/${game.slug}/v2`;
  const session = await wallet.request({ pathname: '/web-api/auth/session/v2/verifySession', token });
  assert.equal(session.dt.tk, token);
  assert.equal(session.dt.gm[0].gid, game.id);
  assert.equal(session.dt.geu, `game-api/${game.slug}/`);
  const info = await wallet.request({ pathname: `${base}/GameInfo/Get`, token });
  assert.equal(info.dt.bl, db.balance('alice'));
  const before = db.balance('alice');
  const args = { pathname: `${base}/Spin`, token, requestId: 'first-spin', body: { cs: game.cs[0], ml: 1 } };
  const spin = await wallet.request(args);
  assert.equal(spin.err, null, game.name);
  assert.equal(spin.dt.si.bl, db.balance('alice'));
  assert.equal(Math.round(db.balance('alice') * 100), Math.round(before * 100) - Math.round(spin.dt.si.tb * 100) + Math.round(spin.dt.si.tw * 100));
  const after = db.balance('alice');
  assert.deepEqual(await wallet.request(args), spin, 'Retry returns identical receipt');
  assert.equal(db.balance('alice'), after, 'Retry does not charge');
}
assert.equal(db.balance('bob'), 50, 'Player balances isolated');
const token = tokenFrom(await wallet.launch('alice', 'local-pg-126'));
await assert.rejects(wallet.request({ pathname: '/game-api/fortune-tiger/v2/Spin', token: token + 'tamper', requestId: 'tamper' }), /Sessão inválida/);
await assert.rejects(wallet.request({ pathname: '/game-api/fortune-ox/v2/Spin', token, requestId: 'wrong-game' }), /incompatível/);
await assert.rejects(wallet.request({ pathname: '/game-api/fortune-tiger/v2/Spin', token }), /Identificador/);
db.user('alice', 12.34);
assert.equal((await wallet.request({ pathname: '/game-api/fortune-tiger/v2/GameInfo/Get', token })).dt.bl, 12.34, 'External adjustment reflected');
const invalid = await wallet.request({ pathname: '/game-api/fortune-tiger/v2/Spin', token, requestId: 'invalid-bet', body: { cs: 999, ml: 1 } });
assert.ok(invalid.err);
assert.equal(db.balance('alice'), 12.34);
db.user('alice', 12.34, { status: 'BLOCKED' });
await assert.rejects(wallet.request({ pathname: '/game-api/fortune-tiger/v2/Spin', token, requestId: 'blocked' }), /Conta indisponível/);

// Simultaneous sessions share a single authoritative wallet.
db.user('small', .4);
const tokens = await Promise.all([wallet.launch('small', 'local-pg-126'), wallet.launch('small', 'local-pg-126')]);
const simultaneous = await Promise.all(tokens.map((launch, i) => wallet.request({ pathname: '/game-api/fortune-tiger/v2/Spin', token: tokenFrom(launch), requestId: `concurrent-${i}`, body: { cs: .08, ml: 1 } })));
assert.equal(simultaneous.filter(result => !result.err).length, 1);
assert.equal(db.balance('small'), 0);
db.user('retry', 10);
const retryToken = tokenFrom(await wallet.launch('retry', 'local-pg-126'));
const same = { pathname: '/game-api/fortune-tiger/v2/Spin', token: retryToken, requestId: 'simultaneous-retry', body: { cs: .08, ml: 1 } };
const repeated = await Promise.all([wallet.request(same), wallet.request(same)]);
assert.deepEqual(repeated[0], repeated[1]);
assert.equal(db.balance('retry'), 9.6);

// Credit wins once, including the free continuation of Butterfly Blossom.
const wins = createPgWallet({ db, secret: 'wins-only', rng: () => 0 });
for (const game of games) {
  db.user('winner', 10);
  const winToken = tokenFrom(await wins.launch('winner', `local-pg-${game.id}`));
  const args = { pathname: `/game-api/${game.slug}/v2/Spin`, token: winToken, requestId: 'win', body: { cs: game.cs[0], ml: 1 } };
  const result = await wins.request(args);
  assert.equal(result.err, null);
  assert.equal(Math.round(db.balance('winner') * 100), 1000 - Math.round(result.dt.si.tb * 100) + Math.round(result.dt.si.tw * 100));
  assert.deepEqual(await wins.request(args), result);
  if (game.id === '125') {
    const before = db.balance('winner');
    const next = await wins.request({ ...args, requestId: 'cascade' });
    assert.equal(next.dt.si.tb, 0, 'Cascade has no second debit');
    assert.equal(Math.round(db.balance('winner') * 100), Math.round(before * 100) + Math.round(next.dt.si.tw * 100));
  }
}
assert.ok([...db.rows.values()].filter(row => row.roundId).every(row => ['user_bet','user_win','BET','WIN'].includes(row.type)), 'Spins never counted as deposits');
await assert.rejects(createPgWallet({ db: null }).launch('alice', 'local-pg-126'), /Firebase/);
await assert.rejects(createPgWallet({ db, ready: () => false }).launch('alice', 'local-pg-126'), /conta de serviço/);
const expired = createPgWallet({ db, secret: 'expiry', now: () => 0 });
db.user('alice', 10);
const expiredToken = tokenFrom(await expired.launch('alice', 'local-pg-126'));
assert.throws(() => createPgWallet({ db, secret: 'expiry', now: () => 21600001 }).verify(expiredToken), /expirada/);

// Exercise HTTP adapter and static clients, without any live Firebase access.
const app = express(); app.use(express.json()); app.use(express.urlencoded({ extended: true }));
registerPgRoutes(app, { db, secret: 'http-test', rng: () => .999, verifyUser: (req, res, next) => {
  if (req.headers.authorization !== 'Bearer test-alice') return res.sendStatus(401);
  req.user = { uid: 'alice' }; next();
} });
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  assert.equal((await fetch(origin + '/api/game_launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ game_code: 'local-pg-126' }) })).status, 401);
  const response = await fetch(origin + '/api/game_launch', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test-alice' }, body: JSON.stringify({ game_code: 'local-pg-126' }) });
  const launch = await response.json(); assert.equal(response.status, 200);
  const sessionToken = tokenFrom(launch);
  const api = await fetch(origin + '/game-api/fortune-tiger/v2/Spin', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pg-session': sessionToken, 'x-pg-request-id': 'http-spin', cookie: 'pgDemo126='+encodeURIComponent(JSON.stringify({balance:999999999,last:{}})) }, body: JSON.stringify({ cs: .08, ml: 1 }) });
  assert.equal(api.status, 200); assert.equal(api.headers.get('set-cookie'), null);
  assert.equal((await api.json()).dt.si.bl, 9.6, 'Forged cookie ignored');
  for (const game of games) {
    const asset = await fetch(origin + `/${game.id}/play.html`);
    assert.equal(asset.status, 200, game.name);
    assert.ok((await asset.text()).includes('/game-bridge-v6.js'));
  }
  assert.equal((await fetch(origin + '/shared/does-not-exist.js')).status, 404, 'Missing asset never returns SPA HTML');
} finally { await new Promise(resolve => server.close(resolve)); }
console.log('PG: 11 clientes; saldo, prêmios, cascata, repetição, concorrência, isolamento, autenticação, cookies e bloqueios aprovados.');
