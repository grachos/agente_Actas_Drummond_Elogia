// Builds the editable acta values from a validated reading, and recomputes dependent amounts after human edits.
import { parseUS, formatCOP, formatQty } from '../lib/numeros.js';
import { parseISO, dmy } from '../lib/fechas.js';

const sinJurisdiccion = (t) => String(t ?? '').replace(/\s+/g, ' ').replace(/\s*JURISDICCI[ÓO]N\s*:.*$/i, '').trim();

export function construirDatos(lectura, linea, { consecutivo, hoy, objetoDeOrden = false }) {
  const precio = parseUS(linea.precio);
  const fecha = parseISO(lectura.bill_fecha_despacho);
  return {
    consecutivo,
    ...(objetoDeOrden ? { objeto: String(lectura.orden_objeto ?? '').replace(/\s+/g, ' ').trim() } : {}),
    fechaActa: dmy(hoy),
    cierre: { dia: hoy.dia, mes: hoy.mes, anio: hoy.anio },
    ordenCompleta: String(lectura.orden_numero).trim().toUpperCase(),
    fechaServicio: dmy(fecha),
    linea: String(linea.linea),
    descripcion: sinJurisdiccion(linea.descripcion),
    cantidadOrden: formatQty(parseUS(linea.cantidad)),
    cantidadFacturada: '1,00',
    valorUnitario: formatCOP(precio),
    valorTotal: formatCOP(precio), // facturada 1 × unitario
    adjuntos: `${lectura.bill_codigo} BILL OF INLAND – TRF – ORDEN DE COMPRA ${String(lectura.orden_numero).trim().toUpperCase()}`,
  };
}

// "1.296.000" -> cents; "2,00" -> hundredths
const pesos = (t) => { const n = Number(String(t).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : null; };
// After an edit: total = facturada × unitario (null result leaves the total untouched).
export function recalcularTotal(d) {
  const unit = pesos(d.valorUnitario); const fact = pesos(d.cantidadFacturada);
  if (unit === null || fact === null) return d;
  return { ...d, valorTotal: formatCOP(Math.round((unit * fact) / 100)) };
}
