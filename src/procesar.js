// Per-remesa pipeline: download support -> two independent readings -> validate -> save for human review.
import { descargarSoporte } from './soporte/descargar.js';
import { leerSoporte } from './lectura/leer.js';
import { validar, comparar } from './validacion.js';
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
    await A.guardarError(id, err.code, err.message);
    return { ok: false, motivo: err.code, mensaje: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function trabajar(id, deps) {
  {
    const acta = await A.obtener(id);
    const pdf = await medir(`descarga ${acta.remesa}`, () => deps.descargar(acta.remesa));
    const [l1, l2] = await medir(`lectura x2 ${acta.remesa}`, () => Promise.all([deps.leer(pdf, { remesa: acta.remesa }), deps.leer(pdf, { remesa: acta.remesa })]));
    const v = validar(l1, { remesa: acta.remesa });
    const alertas = [...v.errores, ...comparar(l1, l2).map((campo) => ({ campo, mensaje: `Las dos lecturas de la IA difieren en «${campo}».` }))];
    let datos = null;
    if (v.linea && v.tipo) {
      const cfg = await deps.getConfig(v.tipo); // fail early if the type has no fixed values loaded
      try { datos = construirDatos(l1, v.linea, { consecutivo: acta.consecutivo, hoy: deps.hoy(), objetoDeOrden: Boolean(cfg?.objetoDeOrden) }); if (cfg?.objetoDeOrden && !datos.objeto) alertas.push({ campo: 'orden_objeto', mensaje: 'No se pudo leer el objeto del servicio de la orden; escríbelo a mano.' }); } catch { alertas.push({ campo: 'datos', mensaje: 'No se pudieron armar los datos del acta; complétalos a mano.' }); }
    }
    await A.guardarResultado(id, { tipo: v.tipo, estado: alertas.length || !datos ? 'REVISAR' : 'LISTA', lectura: { ...l1, _segunda_lectura: l2 }, alertas, datos });
    return { ok: true, estado: alertas.length || !datos ? 'REVISAR' : 'LISTA' };
  }
}
