// MySQL/MariaDB pool (Hostinger). DATABASE_URL = mysql://user:pass@host:3306/dbname (password only in the env var).
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

export async function q(sql, params = []) {
  try {
    const [rows] = await db().query(sql, params);
    return rows;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('DB_ERROR', 'No se pudo consultar la base de datos.', { status: 500, detail: `${e.code || ''} ${e.message}` });
  }
}
