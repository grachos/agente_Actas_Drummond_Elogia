// Per-remesa pipeline: download support -> two independent readings -> validate -> save for human review.
import { descargarSoporte } from './soporte/descargar.js';
import { leerSoporte } from './lectura/leer.js';
import { validar, comparar, partirOrden } from './validacion.js';
import { construirDatos } from './actas/datos.js';
import { hoyBogota } from './lib/fechas.js';
import { ApiError, toApiError } from './http/errors.js';
import * as A from './store/actas.js';
import { getConfigTipo } from './store/config.js';

const real = { descargar: descargarSoporte, leer: leerSoporte, getConfig: getConfigTipo, hoy: () => hoyBogota() };

const LIMITE_MS = 52000; // Vercel kills the function at 60 s; record a TIMEOUT error before that so the acta never stays stuck
const medir = async (etiqueta, fn) => { const t = Date.now(); try { return await fn(); } finally { console.log(`[procesar] ${etiqueta} ${Date.now() - t} ms`); } };

export async function procesarActa(id, deps = real, limiteMs = LIMITE_MS) {
  if (!(await A.reclamar(id))) return { ok: false, motivo: 'EN_PROCESO' };
  let timer;
  const limite = new Promise((_, rej) => { timer = setTimeout(() => rej(new ApiError('TIMEOUT', 'Se agotó el tiempo al procesar; reintenta.', { status: 504 })), limiteMs); });
  try {
    return await Promise.race([trabajar(id, deps), limite]);
  } catch (e) {
    const err = toApiError(e);
    console.error(`[procesar] acta ${id} ${err.code}: ${err.detail ?? err.message}`); // shows up in the Vercel runtime logs
    await A.guardarError(id, err.code, err.message);
    return { ok: false, motivo: err.code, mensaje: err.message };
  } finally {
    clearTimeout(timer);
  }
}

// «COST CENTER» box of the Bill of Inland must say «SEGÚN TRF»; otherwise no acta is made (owner rule 2026-11-11).
export const esSegunTrf = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').includes('SEGUNTRF');

async function trabajar(id, deps) {
  {
    const acta = await A.obtener(id);
    const pdf = await medir(`descarga ${acta.remesa}`, () => deps.descargar(acta.remesa));
    const [l1, l2] = await medir(`lectura x2 ${acta.remesa}`, () => Promise.all([deps.leer(pdf, { remesa: acta.remesa }), deps.leer(pdf, { remesa: acta.remesa })]));
    const trf = [esSegunTrf(l1.bill_centro_costo), esSegunTrf(l2.bill_centro_costo)];
    const dudoso = [...(l1.campos_dudosos ?? []), ...(l2.campos_dudosos ?? [])].includes('bill_centro_costo');
    if (!trf[0] && !trf[1] && !dudoso) { // neither reading found «SEGÚN TRF» and the box was legible: ignore (visible in the list, can be reprocessed)
      await A.guardarIgnorada(id, { tipo: partirOrden(l1.orden_numero)?.prefijo, lectura: { ...l1, _segunda_lectura: l2 }, mensaje: 'El Bill of Inland no dice «SEGÚN TRF»; no se genera acta.' });
      return { ok: true, estado: 'IGNORADA' };
    }
    const v = validar(l1, { remesa: acta.remesa });
    const alertas = [...(trf[0] !== trf[1] || (!trf[0] && dudoso) ? [{ campo: 'bill_centro_costo', mensaje: 'No se pudo confirmar que el Bill diga «SEGÚN TRF» (las lecturas difieren o no es legible); revisa el recuadro «COST CENTER».' }] : []), ...v.errores, ...comparar(l1, l2).map((campo) => ({ campo, mensaje: `Las dos lecturas de la IA difieren en «${campo}».` }))];
    let datos = null;
    if (v.lineas.length && v.tipo) {
      const cfg = await deps.getConfig(v.tipo); // fail early if the type has no fixed values loaded
      try { datos = construirDatos(l1, v.lineas, { hoy: deps.hoy(), objetoDeOrden: Boolean(cfg?.objetoDeOrden) }); } catch { alertas.push({ campo: 'datos', mensaje: 'No se pudieron armar los datos del acta; complétalos a mano.' }); }
    }
    await A.guardarResultado(id, { tipo: v.tipo, estado: alertas.length || !datos ? 'REVISAR' : 'LISTA', lectura: { ...l1, _segunda_lectura: l2 }, alertas, datos });
    return { ok: true, estado: alertas.length || !datos ? 'REVISAR' : 'LISTA' };
  }
}
