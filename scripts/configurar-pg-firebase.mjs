import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { PLATFORM_DEFAULTS } from '../server/platform-defaults.mjs';

const source = process.argv[2];
if (!source) {
  console.error('Informe o caminho do JSON da conta de serviço: node scripts/configurar-pg-firebase.mjs "C:\\caminho\\chave-firebase.json"');
  process.exit(1);
}
const envPath = path.resolve('.env.local');
let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const parsed = dotenv.parse(env);
const account = JSON.parse(fs.readFileSync(path.resolve(source), 'utf8'));
const project = parsed.FIREBASE_PROJECT_ID || PLATFORM_DEFAULTS.firebase.projectId;
if (!account.private_key || !account.client_email || account.project_id !== project) {
  throw new Error('A conta de serviço precisa pertencer ao mesmo projeto Firebase configurado na ZeroBet.');
}
const target = path.resolve('secrets/firebase-service-account.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
if (path.resolve(source) !== target) fs.copyFileSync(path.resolve(source), target);
try { fs.chmodSync(target, 0o600); } catch {}
function set(key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  env = pattern.test(env) ? env.replace(pattern, line) : env.trimEnd() + '\n' + line + '\n';
}
set('DATA_BACKEND', 'firebase'); set('VITE_DATA_BACKEND', 'firebase');
set('GOOGLE_APPLICATION_CREDENTIALS', './secrets/firebase-service-account.json');
// A stale inline value would otherwise override the configured file.
set('FIREBASE_SERVICE_ACCOUNT_JSON', '');
set('PG_SESSION_SECRET', parsed.PG_SESSION_SECRET?.length >= 32 ? parsed.PG_SESSION_SECRET : crypto.randomBytes(32).toString('hex'));
fs.writeFileSync(envPath, env, { mode: 0o600 });
console.log('Firebase Admin e sessões PG configurados. Execute npm run pg:check e reinicie o servidor.');
