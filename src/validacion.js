// Business validations over a reading of the support PDF. Pure code, no AI: any failure blocks automatic generation.
import { parseUS } from './lib/numeros.js';
import { parseISO } from './lib/fechas.js';

export const TIPOS = ['DEIPO', 'CMLTD', 'CPLTD', 'EDLTD'];
const PLACA = /^[A-Z]{3}\d{3}$/;
const BILL = /^[A-Z]{3}\d{3}[A-Z]{3}\d{2}$/;

// "CPLTD-500284486A" -> { prefijo: "CPLTD", numero: "500284486A" }
export function partirOrden(texto) {
  const m = /^([A-Z]{5})-([0-9A-Z]+)$/.exec(String(texto ?? '').trim().toUpperCase());
  return m ? { prefijo: m[1], numero: m[2] } : null;
}

// Bill "PO. TRANSPORT" ("500284486A L12", "0100443504 L1", "7400007648 L1 L2") -> { numero, linea (first), lineas: [all] }
export function partirPoTransport(texto) {
  const m = /^([0-9A-Z]+)((?:\s*[,/&+-]?\s*L\s*\d{1,3})+)$/.exec(String(texto ?? '').trim().toUpperCase());
  if (!m) return null;
  const lineas = [...m[2].matchAll(/L\s*(\d{1,3})/g)].map((x) => Number(x[1]));
  return { numero: m[1], linea: lineas[0], lineas };
}

const sinCeros = (s) => String(s).replace(/^0+/, '');

/**
 * lectura: output of the vision reading (strings exactly as printed).
 * Returns { ok, tipo, linea, cantidadFacturada, errores: [{campo, mensaje}] }.
 */
export function validar(lectura, { remesa }) {
  const errores = [];
  const err = (campo, mensaje) => errores.push({ campo, mensaje });
  const L = lectura ?? {};

  // remesa
  const rem = String(remesa).trim();
  if (L.remesa_numero !== rem) err('remesa_numero', `La remesa leída (${L.remesa_numero ?? 'vacía'}) no es la solicitada (${rem}).`);
  if (L.bill_cargo_consignment !== rem) err('bill_cargo_consignment', `El «Cargo consignment» del Bill (${L.bill_cargo_consignment ?? 'vacío'}) no coincide con la remesa.`);

  // order type
  const orden = partirOrden(L.orden_numero);
  if (!orden) err('orden_numero', 'No se pudo leer el número de la orden de compra.');
  else if (!TIPOS.includes(orden.prefijo)) err('orden_numero', `El prefijo ${orden.prefijo} no es uno de ${TIPOS.join(', ')}.`);

  // Bill -> order, line
  const po = partirPoTransport(L.bill_po_transport);
  if (!po) err('bill_po_transport', 'No se pudo leer la orden y la línea en el Bill of Inland (PO. TRANSPORT).');
  else if (orden && sinCeros(po.numero) !== sinCeros(orden.numero)) {
    err('bill_po_transport', `La orden del Bill (${po.numero}) no coincide con la orden de compra (${orden.numero}).`);
  }
  if (!BILL.test(String(L.bill_codigo ?? ''))) err('bill_codigo', `El código del Bill of Inland (${L.bill_codigo ?? 'vacío'}) no tiene la forma esperada.`);

  // plates
  const placas = { remesa: L.remesa_placa, bill: L.bill_placa, ...(L.orden_salida_placa ? { orden_salida: L.orden_salida_placa } : {}) };
  for (const [k, v] of Object.entries(placas)) if (!PLACA.test(String(v ?? ''))) err(`placa_${k}`, `La placa de ${k} (${v ?? 'vacía'}) no tiene la forma AAA999.`);
  if (new Set(Object.values(placas)).size > 1) err('placa', `Las placas no coinciden entre documentos: ${JSON.stringify(placas)}.`);

  // dispatch date
  if (!parseISO(L.bill_fecha_despacho)) err('bill_fecha_despacho', 'La fecha de despacho del Bill no es válida.');
  if (L.remesa_fecha && L.bill_fecha_despacho && L.remesa_fecha !== L.bill_fecha_despacho) {
    err('fechas', `La fecha de la remesa (${L.remesa_fecha}) y la del Bill (${L.bill_fecha_despacho}) difieren.`);
  }

  // order lines (a remesa may bill more than one line of the same order)
  const lineas = [];
  if (po) {
    for (const n of [...new Set(po.lineas)]) {
      const linea = (L.lineas_orden ?? []).find((x) => Number(x.linea) === n);
      if (!linea) { err('lineas_orden', `La línea ${n} no aparece en la página de la orden de compra.`); continue; }
      const q = parseUS(linea.cantidad); // hundredths of a unit
      const precio = parseUS(linea.precio); // cents
      const total = parseUS(linea.total); // cents
      let veces = 1; let unitario = precio;
      if (q === null || precio === null || total === null || q === 0 || precio === 0 || total === 0) err('linea', `No se pudieron leer cantidad, precio o total de la línea ${n}.`);
      else {
        // Owner rule (2026-11-11): unit value = line total ÷ quantity; billed quantity = middle value (PO Price) ÷ unit value.
        // Normally the unit value IS the middle value -> 1. Example: total 200, quantity 4 -> unit 50; middle 150 -> billed 3, amount 3 × 50 = 150.
        const exacta = (total * 100) % q === 0;
        unitario = exacta ? (total * 100) / q : null; // cents
        if (!exacta || precio % unitario !== 0 || precio / unitario < 1) err('linea', `Línea ${n}: el valor del medio (${linea.precio}) no es un número entero de veces el valor unitario (total ${linea.total} ÷ cantidad ${linea.cantidad}); revisa los valores leídos.`);
        else veces = precio / unitario;
      }
      if (!String(linea.descripcion ?? '').trim()) err('linea', `La descripción de la línea ${n} está vacía.`);
      lineas.push({ ...linea, veces, unitario });
      continue;
    }
  }

  return { ok: errores.length === 0, tipo: orden?.prefijo ?? null, lineas, linea: lineas[0] ?? null, errores };
}

// Two independent readings must agree on every critical field; returns the list of disagreeing fields.
export const CAMPOS_CRITICOS = ['remesa_numero', 'bill_cargo_consignment', 'bill_codigo', 'bill_fecha_despacho', 'bill_placa', 'bill_po_transport', 'orden_numero'];
export function comparar(a, b) {
  const dif = CAMPOS_CRITICOS.filter((k) => String(a?.[k] ?? '') !== String(b?.[k] ?? ''));
  const la = (a?.lineas_orden ?? []).map((x) => `${x.linea}|${x.cantidad}|${x.precio}|${x.total}`).sort().join(';');
  const lb = (b?.lineas_orden ?? []).map((x) => `${x.linea}|${x.cantidad}|${x.precio}|${x.total}`).sort().join(';');
  if (la !== lb) dif.push('lineas_orden');
  return dif;
}
