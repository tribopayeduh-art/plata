import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { PLATFORM_DEFAULTS } from '../server/platform-defaults.mjs';
dotenv.config({ path: '.env.local', quiet: true }); dotenv.config({ quiet: true });
try {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('Falta a conta de serviço Firebase Admin. Use scripts/configurar-pg-firebase.mjs com o seu JSON.');
  const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || fs.readFileSync(path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS), 'utf8'));
  const projectId = process.env.FIREBASE_PROJECT_ID || PLATFORM_DEFAULTS.firebase.projectId;
  if (account.project_id !== projectId) throw new Error('A conta de serviço pertence a outro projeto.');
  const app = admin.initializeApp({ credential: admin.credential.cert(account), projectId });
  const dbId = process.env.FIRESTORE_DATABASE_ID || PLATFORM_DEFAULTS.firebase.firestoreDatabaseId || '(default)';
  const db = dbId === '(default)' ? getFirestore(app) : getFirestore(app, dbId);
  await db.collection('users').limit(1).get();
  console.log('Conexão de leitura com a carteira Firebase aprovada. Nenhum saldo foi modificado.');
  if (!process.env.PG_SESSION_SECRET) console.warn('Defina PG_SESSION_SECRET para preservar as sessões entre reinícios.');
  await app.delete();
} catch (error) { console.error(error.message); process.exitCode = 1; }
