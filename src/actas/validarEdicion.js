// Server-side check of what a person types in the review form (never trust the browser).
import { ApiError } from '../http/errors.js';
import { esFechaValida } from '../lib/fechas.js';
import { recalcularTotal, lineasDe } from './datos.js';

const GENERALES = { ordenCompleta: 40, adjuntos: 300, fechaActa: 10, fechaServicio: 10 };
const LINEA = { linea: 4, descripcion: 400, cantidadOrden: 12, cantidadFacturada: 12, valorUnitario: 20 };
const DMY = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const MAX_LINEAS = 6;
const bad = (m) => { throw new ApiError('DATOS_INVALIDOS', m, { status: 400 }); };
const limpio = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

// consecutivo: the acta number is never typed by hand; the stored one (assigned at approval) is kept.
export function sanearDatos(input, consecutivo = '') {
  const d = { consecutivo };
  for (const [k, max] of Object.entries(GENERALES)) {
    const v = limpio(input?.[k]);
    if (!v) bad(`El campo «${k}» no puede estar vacío.`);
    if (v.length > max) bad(`El campo «${k}» es demasiado largo.`);
    d[k] = v;
  }
  if (input?.objeto !== undefined) { // optional free text (DEIPO); blank is fine
    const o = limpio(input.objeto);
    if (o.length > 300) bad('El objeto del servicio es demasiado largo.');
    d.objeto = o;
  }
  for (const k of ['fechaActa', 'fechaServicio']) {
    const m = DMY.exec(d[k]);
    if (!m || !esFechaValida({ dia: +m[1], mes: +m[2], anio: +m[3] })) bad(`La fecha «${k}» debe ser dd/mm/aaaa y válida.`);
  }
  const entrada = lineasDe(input ?? {});
  if (!Array.isArray(entrada) || !entrada.length || entrada.length > MAX_LINEAS) bad(`El acta debe tener entre 1 y ${MAX_LINEAS} líneas.`);
  d.lineas = entrada.map((l, i) => {
    const o = {};
    for (const [k, max] of Object.entries(LINEA)) {
      const v = limpio(l?.[k]);
      if (!v) bad(`Línea ${i + 1}: el campo «${k}» no puede estar vacío.`);
      if (v.length > max) bad(`Línea ${i + 1}: el campo «${k}» es demasiado largo.`);
      o[k] = v;
    }
    if (!/^\d{1,3}(\.\d{3})*$/.test(o.valorUnitario)) bad(`Línea ${i + 1}: el valor unitario debe verse como 1.296.000.`);
    for (const k of ['cantidadOrden', 'cantidadFacturada']) if (!/^\d+,\d{2}$/.test(o[k])) bad(`Línea ${i + 1}: «${k}» debe verse como 1,00.`);
    return recalcularTotal({ ...o, valorTotal: '' });
  });
  const [dia, mes, anio] = d.fechaActa.split('/').map(Number);
  d.cierre = { dia, mes, anio };
  return d;
}
