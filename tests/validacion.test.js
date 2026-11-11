import test from 'node:test';
import assert from 'node:assert/strict';
import { validar, comparar, partirOrden, partirPoTransport } from '../src/validacion.js';

// Synthetic data only (shape copied from real samples; values are made up).
const base = () => ({
  remesa_numero: '0100000001', remesa_fecha: '2026-09-02', remesa_placa: 'AAA111',
  bill_codigo: 'XYZ001SEP26', bill_cargo_consignment: '0100000001', bill_fecha_despacho: '2026-09-02',
  bill_placa: 'AAA111', bill_po_transport: '500000001A L12',
  orden_numero: 'CPLTD-500000001A',
  lineas_orden: [
    { linea: 11, descripcion: 'X', cantidad: '3.00EA', precio: '5,852,000.00', total: '17,556,000.00' },
    { linea: 12, descripcion: 'SERVICIO DE TRANSPORTE', cantidad: '3.00EA', precio: '1,296,000.00', total: '3,888,000.00' },
  ],
  orden_salida_placa: 'AAA111',
});

test('a consistent reading passes and bills 1', () => {
  const r = validar(base(), { remesa: '0100000001' });
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.equal(r.tipo, 'CPLTD');
  assert.equal(r.linea.linea, 12);
  assert.equal(r.lineas.length, 1);
  assert.equal(r.lineas[0].veces, 1); // total ÷ quantity = unit price -> billed once
});
test('order in the Bill may lack the prefix and leading zeros', () => {
  const l = base(); l.orden_numero = 'CMLTD-0100443504'; l.bill_po_transport = '100443504 L1';
  l.lineas_orden = [{ linea: 1, descripcion: 'T', cantidad: '9.00EA', precio: '6,388,875.00', total: '57,499,875.00' }];
  assert.equal(validar(l, { remesa: '0100000001' }).ok, true);
});
test('wrong remesa, plate mismatch, bad total and missing line are blocked', () => {
  assert.equal(validar(base(), { remesa: '0100000002' }).ok, false);
  const p = base(); p.bill_placa = 'BBB222';
  assert.ok(validar(p, { remesa: '0100000001' }).errores.some((e) => e.campo === 'placa'));
  const t = base(); t.lineas_orden[1].total = '3,888,001.00';
  assert.ok(validar(t, { remesa: '0100000001' }).errores.some((e) => e.campo === 'linea'));
  const m = base(); m.bill_po_transport = '500000001A L99';
  assert.ok(validar(m, { remesa: '0100000001' }).errores.some((e) => e.campo === 'lineas_orden'));
});
test('unknown prefix and different order numbers are blocked', () => {
  const u = base(); u.orden_numero = 'ABCDE-500000001A';
  assert.ok(validar(u, { remesa: '0100000001' }).errores.some((e) => e.campo === 'orden_numero'));
  const o = base(); o.bill_po_transport = '500000009A L12';
  assert.ok(validar(o, { remesa: '0100000001' }).errores.some((e) => e.campo === 'bill_po_transport'));
});
test('comparar finds disagreements between two readings', () => {
  const a = base(); const b = base();
  assert.deepEqual(comparar(a, b), []);
  b.bill_codigo = 'XYZ002SEP26'; b.lineas_orden[1].precio = '1,296,001.00';
  assert.deepEqual(comparar(a, b).sort(), ['bill_codigo', 'lineas_orden']);
});
test('billed times = (total ÷ quantity) ÷ unit price: 1 normally, 2, 3… 20 when the total is that many times the price', () => {
  const l = base();
  l.lineas_orden[1].total = '7,776,000.00'; // 3 × 1,296,000 × 2
  const r = validar(l, { remesa: '0100000001' });
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.equal(r.lineas[0].veces, 2);
  l.lineas_orden[1].total = '77,760,000.00'; // × 20
  assert.equal(validar(l, { remesa: '0100000001' }).lineas[0].veces, 20);
  l.lineas_orden[1].total = '5,000,000.00'; // not a whole number of times -> blocked
  assert.ok(validar(l, { remesa: '0100000001' }).errores.some((e) => e.campo === 'linea'));
});
test('a remesa can bill two lines of the same order', () => {
  const l = base(); l.bill_po_transport = '500000001A L11 L12';
  const r = validar(l, { remesa: '0100000001' });
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.deepEqual(r.lineas.map((x) => x.linea), [11, 12]);
  l.bill_po_transport = '500000001A L12, L99';
  assert.ok(validar(l, { remesa: '0100000001' }).errores.some((e) => e.campo === 'lineas_orden'));
});
test('parsers', () => {
  assert.deepEqual(partirOrden('cpltd-500284486a'), { prefijo: 'CPLTD', numero: '500284486A' });
  assert.deepEqual(partirPoTransport('0100443504 L1'), { numero: '0100443504', linea: 1, lineas: [1] });
  assert.deepEqual(partirPoTransport('7400007648 L1/L2').lineas, [1, 2]);
  assert.equal(partirPoTransport('basura'), null);
});
