import crypto from 'node:crypto';
import { games, tables } from './games.js';
import { handle } from './api.js';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const cents = value => {
  const result = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(result) || result < 0) throw new PgError('Saldo inválido.', 409);
  return result;
};
export class PgError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const localPgCatalog = games.map((game, index) => ({
  id: `pg-local-${game.id}`, code: `local-pg-${game.id}`, name: game.name,
  providerCode: 'PGSOFT', providerName: 'PG SOFT', category: 'PG SOFT',
  featured: true, sortOrder: -100 + index, rtp: '20.00%',
  image: `/games/pg/${game.slug}-clean-v1.png`, demo: false,
}));
export const localPgProvider = { id: 'PGSOFT', code: 'PGSOFT', name: 'PG SOFT', image: '/providers/pgsoft.png' };
export function mergePgCatalog(remote = [], provider = '') {
  const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const names = new Set(games.map(game => norm(game.name)));
  const local = !provider || /^(pgsoft|pg|pocketgames|pocketgamesoft)$/i.test(provider) ? localPgCatalog : [];
  return [...local, ...remote.filter(game => !local.length || !names.has(norm(game.name)))];
}

export function createPgWallet({ db, secret, ready = () => true, now = Date.now, rng, onCommit = () => {} }) {
  const signingKey = secret || crypto.randomBytes(32).toString('hex');
  function sign(payload) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return encoded + '.' + crypto.createHmac('sha256', signingKey).update(encoded).digest('base64url');
  }
  function verify(token) {
    if (typeof token !== 'string' || token.length > 2048) throw new PgError('Sessão inválida.', 401);
    const [encoded, sig, extra] = token.split('.');
    const expected = crypto.createHmac('sha256', signingKey).update(encoded || '').digest('base64url');
    if (extra || !sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new PgError('Sessão inválida.', 401);
    let payload;
    try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()); } catch { throw new PgError('Sessão inválida.', 401); }
    if (!payload.uid || typeof payload.uid !== 'string' || payload.uid.includes('/') || !payload.sid || !Number.isFinite(payload.exp) || payload.exp <= now() || !games.some(g => g.id === payload.gid)) throw new PgError('Sessão expirada. Abra o jogo novamente.', 401);
    return payload;
  }
  function database() { if (!db || !ready()) throw new PgError('Configure a conta de serviço Firebase Admin no servidor para conectar a carteira.', 503); return db; }
  function active(data) {
    if (!data) throw new PgError('Jogador não encontrado.', 404);
    if (data.disabled || data.blocked || data.banned || /BLOCKED|SUSPENDED|BANNED|INACTIVE|DISABLED/i.test(String(data.status || ''))) throw new PgError('Conta indisponível para jogar.', 403);
  }
  async function launch(uid, code) {
    const game = games.find(g => code === `local-pg-${g.id}`);
    if (!game) throw new PgError('Jogo não encontrado.', 404);
    if (!uid || uid.includes('/')) throw new PgError('Jogador inválido.', 401);
    let snap;
    try { snap = await database().collection('users').doc(uid).get(); }
    catch (e) { if (e instanceof PgError) throw e; throw new PgError('Não foi possível conectar a carteira Firebase. Verifique as credenciais do servidor.', 503); }
    active(snap.exists ? snap.data() : null);
    const override = await database().collection('game_overrides').doc(`PGSOFT__${code}`).get();
    if (override.exists && override.data().enabled === false) throw new PgError('Jogo indisponível.', 403);
    cents(snap.data().walletBalance ?? snap.data().balance ?? 0);
    const token = sign({ uid, gid: game.id, sid: crypto.randomUUID(), exp: now() + 6 * 60 * 60 * 1000 });
    return { success: true, launch_url: `/${game.id}/play.html?t=${encodeURIComponent(token)}&l=pt`, provider: 'PGSOFT' };
  }
  async function request({ pathname, body = {}, token, requestId }) {
    const session = verify(token);
    const game = games.find(g => g.id === session.gid);
    const slug = pathname.split('/')[2];
    if (pathname.startsWith('/game-api/') && slug !== game.slug && !(game.slug === 'bikini-paradise' && slug === 'bikine-paradise')) throw new PgError('Jogo incompatível com a sessão.', 403);
    const isSpin = pathname.endsWith('/Spin');
    if (isSpin && (!requestId || !/^[a-zA-Z0-9_.:-]{1,200}$/.test(requestId))) throw new PgError('Identificador de giro obrigatório.', 400);
    const userRef = database().collection('users').doc(session.uid);
    const stateRef = database().collection('pg_game_states').doc(hash(`${session.uid}:${game.id}`));
    const operation = hash(`${session.uid}:${game.id}:${session.sid}:${requestId}`);
    const receiptRef = database().collection('pg_rounds').doc(operation);
    // Generate the outcome once; Firestore may rerun the transaction callback.
    const randomValues = isSpin ? [rng ? rng() : crypto.randomInt(2 ** 32) / 2 ** 32, rng ? rng() : crypto.randomInt(2 ** 32) / 2 ** 32] : [];
    let output;
    try {
      output = await database().runTransaction(async transaction => {
        const user = await transaction.get(userRef);
        const profile = user.exists ? user.data() : null;
        active(profile);
        const override = await transaction.get(database().collection('game_overrides').doc(`PGSOFT__local-pg-${game.id}`));
        if (override.exists && override.data().enabled === false) throw new PgError('Jogo indisponível.', 403);
        const balance = cents(profile.walletBalance ?? profile.balance ?? 0);
        const receipt = isSpin ? await transaction.get(receiptRef) : null;
        if (receipt?.exists) return receipt.data().response;
        const previous = await transaction.get(stateRef);
        const saved = previous.exists ? previous.data().state : null;
        const initial = structuredClone(tables[game.slug].initial);
        const state = saved ? structuredClone(saved) : { balance, last: { ...initial, cs: game.cs[0], ml: 1, tb: 0, tbb: 0, tw: 0, np: 0, aw: 0 }, pending: null };
        // Cookies and launch query values never define the player's balance.
        state.balance = balance;
        Object.assign(state.last, { bl: balance / 100, blb: balance / 100, blab: balance / 100 });
        let nextState, randomIndex = 0;
        const response = await handle(new Request('https://pg.local' + pathname, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...body, gi: game.id }),
        }), { state, rng: () => randomValues[randomIndex++ % randomValues.length], onState: value => { nextState = value; } });
        const result = await response.json();
        if (pathname.endsWith('/verifySession') && result.dt) result.dt.tk = token;
        if (!isSpin || result.err) return result;
        const si = result.dt.si;
        const bet = cents(si.tb), win = cents(si.tw);
        if (nextState.balance !== balance - bet + win || nextState.balance < 0) throw new PgError('Falha na validação da carteira.', 409);
        const date = new Date(now()).toISOString();
        const patch = { walletBalance: nextState.balance / 100, balance: nextState.balance / 100, realBalance: nextState.balance / 100, updatedAt: date };
        transaction.set(userRef, patch, { merge: true });
        transaction.set(stateRef, { uid: session.uid, gameId: game.id, state: nextState, updatedAt: date });
        transaction.set(receiptRef, { uid: session.uid, gameId: game.id, providerCode: 'PGSOFT', bet: bet / 100, win: win / 100, balanceBefore: balance / 100, balanceAfter: nextState.balance / 100, response: result, createdAt: date });
        for (const [type, amount] of [['user_bet', bet], ['user_win', win]]) {
          if (!amount) continue;
          const entry = { uid: session.uid, userCode: session.uid, type, amount: amount / 100, status: 'COMPLETED', gameCode: `local-pg-${game.id}`, gameName: game.name, providerCode: 'PGSOFT', roundId: operation, createdAt: date };
          transaction.set(database().collection('transactions').doc(`${operation}_${type}`), entry);
          transaction.set(database().collection('game_transactions').doc(`${operation}_${type}`), { ...entry, type: type === 'user_bet' ? 'BET' : 'WIN', game_code: entry.gameCode, round_id: operation, new_balance: nextState.balance / 100 });
        }
        return result;
      });
    } catch (e) {
      if (e instanceof PgError) throw e;
      console.error('[pg-wallet]', e.code || e.message);
      throw new PgError('Não foi possível confirmar o giro na carteira. Tente novamente.', 503);
    }
    if (isSpin && !output.err) onCommit(session.uid);
    return output;
  }
  return { launch, request, verify };
}
