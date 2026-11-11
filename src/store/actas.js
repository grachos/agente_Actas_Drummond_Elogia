import { q, db } from '../db.js';

const J = (v) => (v == null ? null : JSON.stringify(v));
const P = (v) => (v == null ? null : JSON.parse(v));
const fila = (r) => r && { ...r, lectura: P(r.lectura), alertas: P(r.alertas) ?? [], datos: P(r.datos) };

// items: [{ remesa, consecutivo }]. Duplicated (remesa, consecutivo) pairs are skipped and reported.
export async function crearLote(usuarioId, items) {
  const cx = await db().getConnection();
  try {
    await cx.beginTransaction();
    const [r] = await cx.query('INSERT INTO lotes (usuario_id) VALUES (?)', [usuarioId]);
    const loteId = r.insertId;
    const creadas = []; const duplicadas = [];
    for (const it of items) {
      const [x] = await cx.query('INSERT IGNORE INTO actas (lote_id, usuario_id, remesa, consecutivo) VALUES (?, ?, ?, ?)', [loteId, usuarioId, it.remesa, it.consecutivo]);
      (x.affectedRows ? creadas : duplicadas).push(it);
    }
    await cx.commit();
    return { loteId, creadas: creadas.length, duplicadas };
  } catch (e) {
    await cx.rollback();
    throw e;
  } finally {
    cx.release();
  }
}

export const listarLotes = () => q('SELECT l.id, l.creado_en, u.silog_user AS usuario, COUNT(a.id) AS total, SUM(a.estado = \'APROBADA\') AS aprobadas FROM lotes l JOIN usuarios u ON u.id = l.usuario_id LEFT JOIN actas a ON a.lote_id = l.id GROUP BY l.id ORDER BY l.id DESC LIMIT 50');
export const listarActas = (loteId) => q('SELECT id, remesa, consecutivo, tipo, estado, codigo_error, mensaje_error, aprobado_en FROM actas WHERE lote_id = ? ORDER BY id', [loteId]);
export async function obtener(id) {
  const [r] = await q('SELECT a.*, u.silog_user AS usuario, ap.silog_user AS aprobado_por_usuario FROM actas a JOIN usuarios u ON u.id = a.usuario_id LEFT JOIN usuarios ap ON ap.id = a.aprobado_por WHERE a.id = ?', [id]);
  return fila(r) ?? null;
}

// Atomic claim: only one invocation can move an acta into PROCESANDO (double click / retries safe).
export async function reclamar(id) {
  const r = await q("UPDATE actas SET estado = 'PROCESANDO', codigo_error = NULL, mensaje_error = NULL WHERE id = ? AND estado IN ('PENDIENTE','ERROR','REVISAR','LISTA')", [id]);
  return r.affectedRows === 1;
}
export const guardarResultado = (id, { tipo, estado, lectura, alertas, datos }) =>
  q('UPDATE actas SET tipo = ?, estado = ?, lectura = ?, alertas = ?, datos = ? WHERE id = ?', [tipo, estado, J(lectura), J(alertas), J(datos), id]);
export const guardarError = (id, codigo, mensaje) => q("UPDATE actas SET estado = 'ERROR', codigo_error = ?, mensaje_error = ? WHERE id = ?", [codigo, String(mensaje).slice(0, 500), id]);

// Human edits; an approved acta must be re-approved after any edit.
export const guardarDatos = (id, datos) => q("UPDATE actas SET datos = ?, estado = IF(estado = 'APROBADA', 'LISTA', estado), aprobado_por = NULL, aprobado_en = NULL WHERE id = ? AND estado IN ('LISTA','REVISAR','APROBADA')", [J(datos), id]);
export async function aprobar(ids, usuarioId) {
  if (!ids.length) return 0;
  const r = await q("UPDATE actas SET estado = 'APROBADA', aprobado_por = ?, aprobado_en = NOW() WHERE id IN (?) AND estado IN ('LISTA','REVISAR') AND datos IS NOT NULL", [usuarioId, ids]);
  return r.affectedRows;
}
export const desaprobar = (id) => q("UPDATE actas SET estado = 'LISTA', aprobado_por = NULL, aprobado_en = NULL WHERE id = ? AND estado = 'APROBADA'", [id]);
