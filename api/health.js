import { q } from '../src/db.js';
import { sendError } from '../src/http/errors.js';

const NEED = ['DATABASE_URL', 'TOKEN_SECRET', 'ANTHROPIC_API_KEY', 'SILOG_BASE_URL'];
export default async function handler(req, res) {
  try {
    const config = Object.fromEntries(NEED.map((k) => [k, Boolean(process.env[k])]));
    let db = false;
    try { await q('SELECT 1'); db = true; } catch { /* reported below */ }
    res.status(config.DATABASE_URL && db ? 200 : 503).json({ ok: db, config, db });
  } catch (e) { sendError(res, e); }
}
