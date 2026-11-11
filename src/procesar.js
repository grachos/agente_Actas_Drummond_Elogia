// Per-remesa pipeline: download support -> two independent readings -> validate -> save for human review.
import { descargarSoporte } from './soporte/descargar.js';
import { leerSoporte } from './lectura/leer.js';
import { validar, comparar } from './validacion.js';
import { construirDatos } from './actas/datos.js';
import { hoyBogota } from './lib/fechas.js';
import { toApiError } from './http/errors.js';
import * as A from './store/actas.js';
import { getConfigTipo } from './store/config.js';

const real = { descargar: descargarSoporte, leer: leerSoporte, getConfig: getConfigTipo, hoy: () => hoyBogota() };

export async function procesarActa(id, deps = real) {
  if (!(await A.reclamar(id))) return { ok: false, motivo: 'EN_PROCESO' };
  try {
    const acta = await A.obtener(id);
    const pdf = await deps.descargar(acta.remesa);
    const [l1, l2] = await Promise.all([deps.leer(pdf, { remesa: acta.remesa }), deps.leer(pdf, { remesa: acta.remesa })]);
    const v = validar(l1, { remesa: acta.remesa });
    const alertas = [...v.errores, ...comparar(l1, l2).map((campo) => ({ campo, mensaje: `Las dos lecturas de la IA difieren en «${campo}».` }))];
    let datos = null;
    if (v.linea && v.tipo) {
      await deps.getConfig(v.tipo); // fail early if the type has no fixed values loaded
      try { datos = construirDatos(l1, v.linea, { consecutivo: acta.consecutivo, hoy: deps.hoy() }); } catch { alertas.push({ campo: 'datos', mensaje: 'No se pudieron armar los datos del acta; complétalos a mano.' }); }
    }
    await A.guardarResultado(id, { tipo: v.tipo, estado: alertas.length || !datos ? 'REVISAR' : 'LISTA', lectura: { ...l1, _segunda_lectura: l2 }, alertas, datos });
    return { ok: true, estado: alertas.length || !datos ? 'REVISAR' : 'LISTA' };
  } catch (e) {
    const err = toApiError(e);
    await A.guardarError(id, err.code, err.message);
    return { ok: false, motivo: err.code, mensaje: err.message };
  }
}
