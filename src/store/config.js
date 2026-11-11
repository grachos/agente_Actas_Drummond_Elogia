import { q } from '../db.js';
import { ApiError } from '../http/errors.js';

export async function getConfigTipo(tipo) {
  const [r] = await q('SELECT config FROM acta_tipos WHERE tipo = ?', [tipo]);
  if (!r) throw new ApiError('TIPO_SIN_CONFIG', `No hay configuración para el tipo de acta ${tipo}.`, { status: 500 });
  return JSON.parse(r.config);
}
export const guardarConfigTipo = (tipo, cfg) => q('INSERT INTO acta_tipos (tipo, config) VALUES (?, ?) ON DUPLICATE KEY UPDATE config = VALUES(config)', [tipo, JSON.stringify(cfg)]);

export async function loadWafCookies() {
  const [r] = await q('SELECT cookies FROM waf_cookies WHERE id = 1');
  return r ? JSON.parse(r.cookies) : null;
}
export const saveWafCookies = (c) => q('INSERT INTO waf_cookies (id, cookies) VALUES (1, ?) ON DUPLICATE KEY UPDATE cookies = VALUES(cookies)', [JSON.stringify(c)]);
