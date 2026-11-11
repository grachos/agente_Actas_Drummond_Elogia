// Loads fixed per-type values into the DB from a local JSON (never committed). Usage: DATABASE_URL=... node scripts/seed-config.mjs fixtures/config.local.json
import { readFileSync } from 'node:fs';
import { guardarConfigTipo } from '../src/store/config.js';

const cfg = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const [tipo, c] of Object.entries(cfg)) { await guardarConfigTipo(tipo, c); console.log('saved', tipo); }
process.exit(0);
