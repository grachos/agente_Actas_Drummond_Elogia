// Server-side check of what a person types in the review form (never trust the browser).
import { ApiError } from '../http/errors.js';
import { esFechaValida } from '../lib/fechas.js';
import { recalcularTotal } from './datos.js';

const CAMPOS = { consecutivo: 50, ordenCompleta: 40, linea: 4, descripcion: 400, cantidadOrden: 12, cantidadFacturada: 12, valorUnitario: 20, adjuntos: 300, fechaActa: 10, fechaServicio: 10 };
const DMY = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const bad = (m) => { throw new ApiError('DATOS_INVALIDOS', m, { status: 400 }); };

export function sanearDatos(input) {
  const d = {};
  for (const [k, max] of Object.entries(CAMPOS)) {
    const v = String(input?.[k] ?? '').replace(/\s+/g, ' ').trim();
    if (!v) bad(`El campo «${k}» no puede estar vacío.`);
    if (v.length > max) bad(`El campo «${k}» es demasiado largo.`);
    d[k] = v;
  }
  for (const k of ['fechaActa', 'fechaServicio']) {
    const m = DMY.exec(d[k]);
    if (!m || !esFechaValida({ dia: +m[1], mes: +m[2], anio: +m[3] })) bad(`La fecha «${k}» debe ser dd/mm/aaaa y válida.`);
  }
  if (!/^\d{1,3}(\.\d{3})*$/.test(d.valorUnitario)) bad('El valor unitario debe verse como 1.296.000.');
  for (const k of ['cantidadOrden', 'cantidadFacturada']) if (!/^\d+,\d{2}$/.test(d[k])) bad(`«${k}» debe verse como 1,00.`);
  const [dia, mes, anio] = d.fechaActa.split('/').map(Number);
  return recalcularTotal({ ...d, valorTotal: '', cierre: { dia, mes, anio } });
}
