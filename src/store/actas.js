import { q, db } from '../db.js';
import { hoyBogota } from '../lib/fechas.js';

const J = (v) => (v == null ? null : JSON.stringify(v));
const P = (v) => (v == null ? null : JSON.parse(v));
const ATASCADA = "(a.estado = 'PROCESANDO' AND a.actualizado_en < NOW() - INTERVAL 3 MINUTE)"; // the function was killed (60 s limit) before it could record a result
const TIMEOUT_MSG = 'Se agotó el tiempo al procesar; reintenta.';
const destrabar = (r) => (r && r.atascada ? { ...r, estado: 'ERROR', codigo_error: 'TIMEOUT', mensaje_error: TIMEOUT_MSG } : r);
const fila = (r) => r && { ...destrabar(r), lectura: P(r.lectura), alertas: P(r.alertas) ?? [], datos: P(r.datos) };

// items: [{ remesa }]. A remesa that already exists in any lote is skipped and reported (one acta per remesa). The acta number is
// assigned later, when the acta is approved (see aprobar), so ignored or discarded remesas never burn a number.
export async function crearLote(usuarioId, items) {
  const cx = await db().getConnection();
  try {
    await cx.beginTransaction();
    const [r] = await cx.query('INSERT INTO lotes (usuario_id) VALUES (?)', [usuarioId]);
    const loteId = r.insertId;
    const creadas = []; const duplicadas = [];
    for (const it of items) {
      const [x] = await cx.query("INSERT INTO actas (lote_id, usuario_id, remesa, consecutivo) SELECT ?, ?, ?, '' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM actas WHERE remesa = ?)", [loteId, usuarioId, it.remesa, it.remesa]);
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
export const listarActas = async (loteId) => (await q(`SELECT a.id, a.remesa, a.consecutivo, a.tipo, a.estado, a.codigo_error, a.mensaje_error, a.aprobado_en, ${ATASCADA} AS atascada FROM actas a WHERE a.lote_id = ? ORDER BY a.id`, [loteId])).map(destrabar);
export async function obtener(id) {
  const [r] = await q(`SELECT a.*, ${ATASCADA} AS atascada, u.silog_user AS usuario, ap.silog_user AS aprobado_por_usuario FROM actas a JOIN usuarios u ON u.id = a.usuario_id LEFT JOIN usuarios ap ON ap.id = a.aprobado_por WHERE a.id = ?`, [id]);
  return fila(r) ?? null;
}

// Atomic claim: only one invocation can move an acta into PROCESANDO (double click / retries safe).
export async function reclamar(id) {
  const r = await q("UPDATE actas SET estado = 'PROCESANDO', codigo_error = NULL, mensaje_error = NULL WHERE id = ? AND (estado IN ('PENDIENTE','ERROR','REVISAR','LISTA','IGNORADA') OR (estado = 'PROCESANDO' AND actualizado_en < NOW() - INTERVAL 3 MINUTE))", [id]);
  return r.affectedRows === 1;
}
export const guardarResultado = (id, { tipo, estado, lectura, alertas, datos }) =>
  q('UPDATE actas SET tipo = ?, estado = ?, lectura = ?, alertas = ?, datos = ? WHERE id = ?', [tipo, estado, J(lectura), J(alertas), J(datos), id]);
// The Bill of Inland does not say «SEGÚN TRF»: no acta is made (visible in the list; can be reprocessed).
export const guardarIgnorada = (id, { tipo, lectura, mensaje }) => q("UPDATE actas SET tipo = ?, estado = 'IGNORADA', codigo_error = 'NO_SEGUN_TRF', mensaje_error = ?, lectura = ?, alertas = NULL, datos = NULL WHERE id = ?", [tipo ?? null, String(mensaje).slice(0, 500), J(lectura), id]);
export const guardarError = (id, codigo, mensaje) => q("UPDATE actas SET estado = 'ERROR', codigo_error = ?, mensaje_error = ? WHERE id = ?", [codigo, String(mensaje).slice(0, 500), id]);

// Human edits; an approved acta must be re-approved after any edit.
export const guardarDatos = (id, datos) => q("UPDATE actas SET datos = ?, estado = IF(estado = 'APROBADA', 'LISTA', estado), aprobado_por = NULL, aprobado_en = NULL WHERE id = ? AND estado IN ('LISTA','REVISAR','APROBADA')", [J(datos), id]);
const yy = (anio) => String(anio % 100).padStart(2, '0');

// Approves one by one. The acta number (TIPO-NNN-YY) is taken from the per-type counter inside the same transaction, so numbers are
// sequential and never repeated even if several people approve at once. An acta that already has a number keeps it (re-approval after an edit).
export async function aprobar(ids, usuarioId, anio = hoyBogota().anio) {
  await q('SELECT 1'); // makes sure the schema exists
  const res = { aprobadas: 0, omitidas: 0, errores: [] };
  for (const id of ids) {
    const cx = await db().getConnection();
    try {
      await cx.beginTransaction();
      const [[a]] = await cx.query('SELECT id, tipo, estado, datos FROM actas WHERE id = ? FOR UPDATE', [id]);
      if (!a || !['LISTA', 'REVISAR'].includes(a.estado) || !a.datos) { await cx.rollback(); res.omitidas++; continue; }
      const datos = JSON.parse(a.datos);
      if (!datos.consecutivo) {
        const [[c]] = await cx.query('SELECT siguiente FROM consecutivos WHERE tipo = ? FOR UPDATE', [a.tipo]);
        if (!c) { await cx.rollback(); res.errores.push({ id, mensaje: `Configura el consecutivo de ${a.tipo} en Configuración antes de aprobar.` }); continue; }
        datos.consecutivo = `${a.tipo}-${String(c.siguiente).padStart(3, '0')}-${yy(anio)}`;
        await cx.query('UPDATE consecutivos SET siguiente = siguiente + 1 WHERE tipo = ?', [a.tipo]);
      }
      await cx.query("UPDATE actas SET estado = 'APROBADA', datos = ?, consecutivo = ?, aprobado_por = ?, aprobado_en = NOW() WHERE id = ?", [JSON.stringify(datos), datos.consecutivo, usuarioId, id]);
      await cx.commit();
      res.aprobadas++;
    } catch (e) {
      await cx.rollback().catch(() => {});
      throw e;
    } finally {
      cx.release();
    }
  }
  return res;
}
// Registered = approved: remesa, acta number and data (for the Excel report), in approval order.
export async function listarAprobadas() {
  return (await q("SELECT remesa, consecutivo, datos FROM actas WHERE estado = 'APROBADA' AND consecutivo <> '' ORDER BY aprobado_en, id")).map((r) => ({ ...r, datos: JSON.parse(r.datos) }));
}
export const desaprobar = (id) => q("UPDATE actas SET estado = 'LISTA', aprobado_por = NULL, aprobado_en = NULL WHERE id = ? AND estado = 'APROBADA'", [id]);
