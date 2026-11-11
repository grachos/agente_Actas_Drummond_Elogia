// Applies db/*.sql in order. Usage: DATABASE_URL=... node scripts/migrate.mjs
import { readdirSync, readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';

const c = await mysql.createConnection({ uri: process.env.DATABASE_URL, multipleStatements: true });
for (const f of readdirSync(new URL('../db/', import.meta.url)).filter((x) => x.endsWith('.sql')).sort()) {
  await c.query(readFileSync(new URL(`../db/${f}`, import.meta.url), 'utf8'));
  console.log('applied', f);
}
await c.end();
