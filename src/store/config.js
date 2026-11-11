import { q } from '../db.js';
import { ApiError } from '../http/errors.js';

const COMUN = '_COMUN'; // images shared by all types: { logo, firma } (data URIs)

export async function getConfigTipo(tipo) {
  const rows = await q('SELECT tipo, config FROM acta_tipos WHERE tipo IN (?, ?)', [tipo, COMUN]);
  const t = rows.find((r) => r.tipo === tipo);
  if (!t) throw new ApiError('TIPO_SIN_CONFIG', `No hay configuración para el tipo de acta ${tipo}.`, { status: 500 });
  const c = rows.find((r) => r.tipo === COMUN);
  return { logo: '', firma: '', ...(c ? JSON.parse(c.config) : {}), ...JSON.parse(t.config) };
}

// Config screen: fixed values per type without the heavy images, plus whether the shared images are loaded.
export async function listarConfig() {
  const rows = await q('SELECT tipo, config FROM acta_tipos ORDER BY tipo');
  const comun = rows.find((r) => r.tipo === COMUN);
  const imgs = comun ? JSON.parse(comun.config) : {};
  return { tipos: rows.filter((r) => r.tipo !== COMUN).map((r) => ({ tipo: r.tipo, ...JSON.parse(r.config) })), logo: Boolean(imgs.logo), firma: Boolean(imgs.firma) };
}
export async function guardarImagen(campo, dataUri) {
  const [r] = await q('SELECT config FROM acta_tipos WHERE tipo = ?', [COMUN]);
  await guardarConfigTipo(COMUN, { ...(r ? JSON.parse(r.config) : {}), [campo]: dataUri });
}
export const guardarConfigTipo = (tipo, cfg) => q('INSERT INTO acta_tipos (tipo, config) VALUES (?, ?) ON DUPLICATE KEY UPDATE config = VALUES(config)', [tipo, JSON.stringify(cfg)]);

export async function loadWafCookies() {
  const [r] = await q('SELECT cookies FROM waf_cookies WHERE id = 1');
  return r ? JSON.parse(r.cookies) : null;
}
export const saveWafCookies = (c) => q('INSERT INTO waf_cookies (id, cookies) VALUES (1, ?) ON DUPLICATE KEY UPDATE cookies = VALUES(cookies)', [JSON.stringify(c)]);
