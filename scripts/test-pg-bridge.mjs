import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const listeners = {}, storage = new Map(), sent = [], timers = new Map();
let reloads = 0, timerId = 0, workerScope;
const origin = 'http://localhost:3000';
class Element { appendChild() {} }
class XHR {
  headers = {}; events = {}; responseType = ''; status = 200;
  open(_method, url) { this.url = url; }
  setRequestHeader(key, value) { this.headers[key] = value; }
  addEventListener(type, callback) { this.events[type] = callback; }
  send() {}
  complete(result) { this.responseText = JSON.stringify(result); this.events.load(); }
}
const window = {
  devicePixelRatio: 2, history: { replaceState() {} },
  fetch: async () => new Response('{}'),
  parent: { postMessage: message => sent.push(message) },
  addEventListener: (event, callback) => { (listeners[event] ||= []).push(callback); },
};
const location = { origin, href: origin + '/126/play.html?t=test-ticket', pathname: '/126/play.html', hostname: 'localhost', reload: () => reloads++ };
const context = vm.createContext({ window, location, navigator: { serviceWorker: { register: async (_url, options) => { workerScope = options.scope; } } },
  sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key,value), removeItem: key => storage.delete(key) },
  document: { head: new Element(), body: new Element(), createElement: () => ({style:{}}) },
  Element, XMLHttpRequest: XHR, URL, Request, Response, Headers, crypto: crypto.webcrypto,
  console: { info() {} }, setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id),
});
vm.runInContext(fs.readFileSync('public/game-bridge-v6.js', 'utf8'), context);
const request = () => { const xhr = new XHR(); xhr.open('POST', '/game-api/fortune-tiger/v2/Spin'); xhr.send('cs=0.08&ml=1'); return xhr; };
const first = request(); assert.equal(first.headers['X-PG-Session'], 'test-ticket');
const retry = request(); assert.equal(retry.headers['X-PG-Request-ID'], first.headers['X-PG-Request-ID']);
first.complete({ dt: { si: { bl: 9.6 } }, err: null });
assert.equal(sent[0].type, 'PG_WALLET_CHANGED');
const next = request(); assert.notEqual(next.headers['X-PG-Request-ID'], first.headers['X-PG-Request-ID']);
next.complete({ dt: { si: { bl: 9.2 } }, err: null });
const assets = new XHR(); assets.open('GET', '/126/test.bin'); assets.send(); assets.responseType = 'arraybuffer';
Object.defineProperty(assets, 'responseText', { get() { throw Error('Binary response text unavailable'); } });
assert.doesNotThrow(() => assets.events.load());
assert.equal(assets.headers['X-PG-Session'], undefined, 'No session header on assets');
for (const receive of listeners.message) receive({ origin: 'https://other.test', source: window.parent, data: { type: 'PG_AUTHORITATIVE_BALANCE', balance: 12 } });
assert.equal(timers.size, 0, 'Foreign origin ignored');
for (const receive of listeners.message) receive({ origin, source: {}, data: { type: 'PG_AUTHORITATIVE_BALANCE', balance: 12 } });
assert.equal(timers.size, 0, 'Foreign frame ignored');
for (const receive of listeners.message) receive({ origin, source: window.parent, data: { type: 'PG_AUTHORITATIVE_BALANCE', balance: 9.2 } });
assert.equal(timers.size, 0, 'Normal spin does not reload');
for (const receive of listeners.message) receive({ origin, source: window.parent, data: { type: 'PG_AUTHORITATIVE_BALANCE', balance: 12 } });
for (const callback of timers.values()) callback();
assert.equal(reloads, 1, 'External wallet adjustment refreshes game');
await context.navigator.serviceWorker.register('/shared/service-worker/sw.js', {scope:'/'});
assert.equal(workerScope, '/126/', 'Game worker does not replace platform worker');
console.log('Bridge PG: sessão, repetição de giro, arquivos binários, saldo e isolamento do worker aprovados.');
