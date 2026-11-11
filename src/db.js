// MySQL/MariaDB pool (Hostinger). DATABASE_URL = mysql://user:pass@host:3306/dbname (password only in the env var).
import { readFileSync, readdirSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { ApiError } from './http/errors.js';

let pool;
export function db() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new ApiError('CONFIG_MISSING', 'Falta configurar DATABASE_URL en el servidor.', { status: 500 });
  // Small pool: serverless instances multiply and shared hosting caps simultaneous connections.
  pool = mysql.createPool({ uri: url, connectionLimit: 3, waitForConnections: true, charset: 'utf8mb4', connectTimeout: 10000, ssl: process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : undefined });
  return pool;
}

// Idempotent schema creation + optional first-time seed (ACTAS_SEED env), once per server instance.
let ready;
async function ensureSchema() {
  const cx = await mysql.createConnection({ uri: process.env.DATABASE_URL, multipleStatements: true, charset: 'utf8mb4', connectTimeout: 10000, ssl: process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : undefined });
  try {
    const dir = new URL('../db/', import.meta.url);
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) await cx.query(readFileSync(new URL(f, dir), 'utf8'));
    if (process.env.ACTAS_SEED) {
      const [[{ n }]] = await cx.query('SELECT COUNT(*) AS n FROM acta_tipos');
      if (!n) for (const [tipo, cfg] of Object.entries(JSON.parse(process.env.ACTAS_SEED))) await cx.query('INSERT IGNORE INTO acta_tipos (tipo, config) VALUES (?, ?)', [tipo, JSON.stringify(cfg)]);
    }
  } finally {
    await cx.end().catch(() => {});
  }
}

export async function q(sql, params = []) {
  try {
    db();
    ready ??= ensureSchema().catch((e) => { ready = undefined; throw e; });
    await ready;
    const [rows] = await db().query(sql, params);
    return rows;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('DB_ERROR', 'No se pudo consultar la base de datos.', { status: 500, detail: `${e.code || ''} ${e.message}` });
  }
}
