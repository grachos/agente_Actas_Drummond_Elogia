import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { construirDatos, recalcularTotal } from '../src/actas/datos.js';
import { leerSoporte } from '../src/lectura/leer.js';

const lect = (rem = '0100000001') => ({
  bill_centro_costo: 'SEGÚN TRF',
  remesa_numero: rem, remesa_fecha: '2026-09-02', remesa_placa: 'AAA111', bill_codigo: 'XYZ001SEP26', bill_cargo_consignment: rem,
  bill_fecha_despacho: '2026-09-02', bill_placa: 'AAA111', bill_po_transport: '500000001A L12', orden_numero: 'cpltd-500000001a',
  lineas_orden: [{ linea: 12, descripcion: 'SERVICIO DE TRANSPORTE   VEHÍCULO TIPO: CAMION 600 RUTA: PDR-BAQ JURISDICCIÓN: CIÉNAGA', cantidad: '3.00EA', precio: '1,296,000.00', total: '3,888,000.00' }],
});

test('construirDatos keeps the jurisdiction, bills 1 per line, supports several lines and a blank object; recalcularTotal follows edits', () => {
  const hoy = { dia: 11, mes: 11, anio: 2026 };
  const l2 = { linea: 13, descripcion: 'OTRO SERVICIO', cantidad: '10.00EA', precio: '2,760,000.00', total: '27,600,000.00' };
  const d = construirDatos(lect(), [lect().lineas_orden[0], { ...l2, veces: 20, unitario: 13800000 }], { hoy });
  assert.equal(d.ordenCompleta, 'CPLTD-500000001A');
  assert.equal(d.lineas.length, 2);
  assert.equal(d.lineas[0].descripcion, 'SERVICIO DE TRANSPORTE VEHÍCULO TIPO: CAMION 600 RUTA: PDR-BAQ JURISDICCIÓN: CIÉNAGA');
  assert.deepEqual(Object.values(d.lineas[0]).slice(0, 6), ['12', d.lineas[0].descripcion, '3,00', '1,00', '1.296.000', '1.296.000']);
  assert.deepEqual([d.lineas[1].cantidadOrden, d.lineas[1].cantidadFacturada, d.lineas[1].valorUnitario, d.lineas[1].valorTotal], ['10,00', '20,00', '138.000', '2.760.000']); // billed 20 × unit value 138.000 = the middle value 2.760.000
  assert.deepEqual([d.fechaServicio, d.fechaActa, d.consecutivo], ['02/09/2026', '11/11/2026', '']); // the number is assigned at approval
  assert.equal('objeto' in d, false);
  assert.equal(construirDatos(lect(), lect().lineas_orden[0], { hoy, objetoDeOrden: true }).objeto, ''); // DEIPO: blank
  assert.equal(recalcularTotal({ ...d.lineas[0], cantidadFacturada: '2,00' }).valorTotal, '2.592.000');
});

test('leerSoporte sends the PDF as a document and returns the tool input', async () => {
  let sent;
  const cliente = { messages: { create: async (p) => { sent = p; return { content: [{ type: 'tool_use', input: lect() }] }; } } };
  const r = await leerSoporte(Buffer.from('%PDF-1.4 x'), { cliente, modelo: 'm' });
  assert.equal(r.remesa_numero, '0100000001');
  assert.equal(sent.messages[0].content[0].type, 'document');
  assert.equal(sent.tools[0].name, 'registrar_lectura');
  assert.equal(sent.tool_choice, undefined); // forced tool_choice is not supported by the model
});

test('esSegunTrf accepts accents, case and spacing; rejects other cost centers and empty', async () => {
  const { esSegunTrf } = await import('../src/procesar.js');
  for (const t of ['SEGÚN TRF', 'según trf', 'SEGUN  TRF', ' Segun TRF.']) assert.equal(esSegunTrf(t), true, t);
  for (const t of ['CENTRO 5', '', null, 'TRF']) assert.equal(esSegunTrf(t), false, String(t));
});

const url = process.env.TEST_DATABASE_URL;
test('procesarActa: LISTA / REVISAR / IGNORADA (no «SEGÚN TRF») / ERROR / TIMEOUT', { skip: !url }, async () => {
  process.env.DATABASE_URL = url;
  const c = await mysql.createConnection({ uri: url, multipleStatements: true });
  await c.query('SET FOREIGN_KEY_CHECKS=0; DROP TABLE IF EXISTS actas, lotes, usuarios, waf_cookies, acta_tipos, consecutivos, schema_migrations; SET FOREIGN_KEY_CHECKS=1;');
  await c.end();
  const { procesarActa } = await import('../src/procesar.js');
  const A = await import('../src/store/actas.js');
  const { registrarIngreso } = await import('../src/store/usuarios.js');
  const { db } = await import('../src/db.js');
  try {
  const u = await registrarIngreso('tester');
  const rem = ['0100000001', '0100000002', '0100000003', '0100000004', '0100000005', '0100000006'];
  const { loteId } = await A.crearLote(u.id, rem.map((remesa) => ({ remesa })));
  const [a, b, ig, x, t, ig2] = await A.listarActas(loteId);
  const deps = (leer, descargar = async () => Buffer.from('%PDF')) => ({ descargar, leer, getConfig: async () => ({}), hoy: () => ({ dia: 11, mes: 11, anio: 2026 }) });
  const igual = async (_pdf, o) => lect(o.remesa);

  assert.deepEqual(await procesarActa(a.id, deps(igual)), { ok: true, estado: 'LISTA' });
  const la = await A.obtener(a.id);
  assert.equal(la.datos.lineas[0].valorUnitario, '1.296.000');
  assert.equal(la.datos.consecutivo, ''); // not numbered until approved

  let n = 0; // second reading disagrees on the price
  const r = await procesarActa(b.id, deps(async (_p, o) => { const l = lect(o.remesa); if (n++) l.lineas_orden[0].precio = '1,296,001.00'; return l; }));
  assert.equal(r.estado, 'REVISAR', JSON.stringify(r));
  assert.ok((await A.obtener(b.id)).alertas.some((z) => z.campo === 'lineas_orden'));

  // the cost center box does not say «SEGÚN TRF» in either reading -> ignored, no data, can be reprocessed
  const otro = async (_p, o) => ({ ...lect(o.remesa), bill_centro_costo: 'CENTRO 5' });
  assert.deepEqual(await procesarActa(ig.id, deps(otro)), { ok: true, estado: 'IGNORADA' });
  const gi = await A.obtener(ig.id);
  assert.equal(gi.estado, 'IGNORADA'); assert.equal(gi.datos, null); assert.match(gi.mensaje_error, /SEGÚN TRF/);
  assert.equal((await procesarActa(ig.id, deps(igual))).estado, 'LISTA'); // reprocessing works
  // one reading finds «SEGÚN TRF» and the other does not -> not ignored, goes to review with an alert
  let k = 0;
  const mixto = await procesarActa(ig2.id, deps(async (_p, o) => ({ ...lect(o.remesa), bill_centro_costo: k++ ? 'CENTRO 5' : 'SEGÚN TRF' })));
  assert.equal(mixto.estado, 'REVISAR');
  assert.ok((await A.obtener(ig2.id)).alertas.some((z) => z.campo === 'bill_centro_costo'));

  const e = await procesarActa(x.id, deps(igual, async () => { throw Object.assign(new Error('x'), { name: 'SilogtranError', code: 'WAF_FAILED' }); }));
  assert.equal(e.ok, false);
  assert.equal((await A.obtener(x.id)).estado, 'ERROR');
  // a hung dependency must end in a recorded TIMEOUT instead of leaving the acta stuck
  const colgada = await procesarActa(t.id, deps(igual, () => new Promise(() => {})), 100);
  assert.equal(colgada.motivo, 'TIMEOUT');
  assert.equal((await A.obtener(t.id)).codigo_error, 'TIMEOUT');
  } finally {
    await db().end(); // an open pool would hang the test runner when an assertion fails
  }
});
