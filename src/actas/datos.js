// Builds the editable acta values from a validated reading, and recomputes dependent amounts after human edits.
import { parseUS, formatCOP, formatQty } from '../lib/numeros.js';
import { parseISO, dmy } from '../lib/fechas.js';

const limpiar = (t) => String(t ?? '').replace(/\s+/g, ' ').trim(); // description copied as printed, jurisdiction included (owner 2026-11-11)

// lineas: one order line or an array of them (a remesa may bill several lines). objetoDeOrden (historical name): the type has a
// per-acta «objeto del servicio» that stays BLANK unless a person writes it (DEIPO).
export function construirDatos(lectura, lineas, { consecutivo, hoy, objetoDeOrden = false }) {
  const fecha = parseISO(lectura.bill_fecha_despacho);
  const orden = String(lectura.orden_numero).trim().toUpperCase();
  return {
    consecutivo,
    ...(objetoDeOrden ? { objeto: '' } : {}),
    fechaActa: dmy(hoy),
    cierre: { dia: hoy.dia, mes: hoy.mes, anio: hoy.anio },
    ordenCompleta: orden,
    fechaServicio: dmy(fecha),
    lineas: (Array.isArray(lineas) ? lineas : [lineas]).map((l) => {
      const precio = parseUS(l.precio);
      return { linea: String(l.linea), descripcion: limpiar(l.descripcion), cantidadOrden: formatQty(parseUS(l.cantidad)), cantidadFacturada: '1,00', valorUnitario: formatCOP(precio), valorTotal: formatCOP(precio) /* billed 1 × unit price */ };
    }),
    adjuntos: `${lectura.bill_codigo} BILL OF INLAND – TRF – ORDEN DE COMPRA ${orden}`,
  };
}

// Lines of an acta; older rows stored a single line in flat fields.
export const lineasDe = (d) => d.lineas ?? [{ linea: d.linea, descripcion: d.descripcion, cantidadOrden: d.cantidadOrden, cantidadFacturada: d.cantidadFacturada, valorUnitario: d.valorUnitario, valorTotal: d.valorTotal }];

// "1.296.000" -> cents; "2,00" -> hundredths
const pesos = (t) => { const n = Number(String(t).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : null; };
// After an edit: total = facturada × unitario (null result leaves the total untouched).
export function recalcularTotal(d) {
  const unit = pesos(d.valorUnitario); const fact = pesos(d.cantidadFacturada);
  if (unit === null || fact === null) return d;
  return { ...d, valorTotal: formatCOP(Math.round((unit * fact) / 100)) };
}
