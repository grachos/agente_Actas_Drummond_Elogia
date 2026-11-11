import { q } from '../db.js';

export async function registrarIngreso(silogUser, nombre = null) {
  await q('INSERT INTO usuarios (silog_user, nombre, ultimo_ingreso) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE ultimo_ingreso = NOW(), nombre = COALESCE(?, nombre)', [silogUser, nombre, nombre]);
  const [u] = await q('SELECT id, silog_user, nombre, estado FROM usuarios WHERE silog_user = ?', [silogUser]);
  return u;
}
export async function getUsuario(id) {
  const [u] = await q('SELECT id, silog_user, nombre, estado FROM usuarios WHERE id = ?', [id]);
  return u ?? null;
}
