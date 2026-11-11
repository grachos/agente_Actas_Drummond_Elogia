import { q } from '../src/db.js';
import { sendError } from '../src/http/errors.js';

const NEED = ['DATABASE_URL', 'TOKEN_SECRET', 'ANTHROPIC_API_KEY', 'SILOG_BASE_URL'];
export default async function handler(req, res) {
  try {
    const config = Object.fromEntries(NEED.map((k) => [k, Boolean(process.env[k])]));
    let db = false; let tipos = null; let error = null;
    try { tipos = (await q('SELECT tipo FROM acta_tipos ORDER BY tipo')).map((r) => r.tipo); db = true; } catch (e) { error = `${e.code || ''} ${e.detail || e.message}`.slice(0, 200); }
    res.status(config.DATABASE_URL && db ? 200 : 503).json({ ok: db, config, db, tipos, error });
  } catch (e) { sendError(res, e); }
}
