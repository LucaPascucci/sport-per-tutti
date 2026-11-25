// Genera src/app/core/firebase/firebase-options.local.ts dalle variabili d'ambiente FIREBASE_*.
// Usato dalla CI (secret del repository). Non stampa mai i valori.
// Uso: node scripts/write-firebase-config.mjs [percorso-di-output]
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OPTION_FIELDS = {
  FIREBASE_API_KEY: 'apiKey',
  FIREBASE_AUTH_DOMAIN: 'authDomain',
  FIREBASE_PROJECT_ID: 'projectId',
  FIREBASE_STORAGE_BUCKET: 'storageBucket',
  FIREBASE_MESSAGING_SENDER_ID: 'messagingSenderId',
  FIREBASE_APP_ID: 'appId',
};
const DATABASE_ID_ENV = 'FIREBASE_FIRESTORE_DATABASE_ID';
const ENV_NAMES = [...Object.keys(OPTION_FIELDS), DATABASE_ID_ENV];

const missing = ENV_NAMES.filter((name) => (process.env[name] ?? '').trim() === '');
if (missing.length > 0) {
  console.error(`Secret Firebase mancanti: ${missing.join(', ')}`);
  process.exit(1);
}

const literal = (name) => JSON.stringify(process.env[name]);
const optionLines = Object.entries(OPTION_FIELDS).map(
  ([name, field]) => `    ${field}: ${literal(name)},`,
);

const source = [
  '// File generato da scripts/write-firebase-config.mjs: non modificarlo e non versionarlo.',
  "import type { FirebaseConfig } from './firebase-config';",
  '',
  'export const firebaseConfig: FirebaseConfig = {',
  '  options: {',
  ...optionLines,
  '  },',
  `  firestoreDatabaseId: ${literal(DATABASE_ID_ENV)},`,
  '};',
  '',
].join('\n');

const outputPath = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL('../src/app/core/firebase/firebase-options.local.ts', import.meta.url));

writeFileSync(outputPath, source);
console.log(`Configurazione Firebase scritta in ${outputPath}`);
