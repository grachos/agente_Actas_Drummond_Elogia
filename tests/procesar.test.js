import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { construirDatos, recalcularTotal } from '../src/actas/datos.js';
import { leerSoporte } from '../src/lectura/leer.js';

const lect = () => ({
  remesa_numero: '0100000001', remesa_fecha: '2026-09-02', remesa_placa: 'AAA111', bill_codigo: 'XYZ001SEP26', bill_cargo_consignment: '0100000001',
  bill_fecha_despacho: '2026-09-02', bill_placa: 'AAA111', bill_po_transport: '500000001A L12', orden_numero: 'cpltd-500000001a',
  lineas_orden: [{ linea: 12, descripcion: 'SERVICIO DE TRANSPORTE   VEHÍCULO TIPO: CAMION 600 RUTA: PDR-BAQ JURISDICCIÓN: CIÉNAGA', cantidad: '3.00EA', precio: '1,296,000.00', total: '3,888,000.00' }],
});

test('construirDatos keeps the jurisdiction, bills 1 per line, supports several lines and a blank object; recalcularTotal follows edits', () => {
  const hoy = { dia: 11, mes: 11, anio: 2026 };
  const l2 = { linea: 13, descripcion: 'OTRO SERVICIO', cantidad: '10.00EA', precio: '2,760,000.00', total: '27,600,000.00' };
  const d = construirDatos(lect(), [lect().lineas_orden[0], { ...l2, veces: 20, unitario: 13800000 }], { consecutivo: 'C-1', hoy });
  assert.equal(d.ordenCompleta, 'CPLTD-500000001A');
  assert.equal(d.lineas.length, 2);
  assert.equal(d.lineas[0].descripcion, 'SERVICIO DE TRANSPORTE VEHÍCULO TIPO: CAMION 600 RUTA: PDR-BAQ JURISDICCIÓN: CIÉNAGA');
  assert.deepEqual(Object.values(d.lineas[0]).slice(0, 6), ['12', d.lineas[0].descripcion, '3,00', '1,00', '1.296.000', '1.296.000']);
  assert.deepEqual([d.lineas[1].cantidadOrden, d.lineas[1].cantidadFacturada, d.lineas[1].valorUnitario, d.lineas[1].valorTotal], ['10,00', '20,00', '138.000', '2.760.000']); // billed 20 × unit value 138.000 = the middle value 2.760.000
  assert.deepEqual([d.fechaServicio, d.fechaActa], ['02/09/2026', '11/11/2026']);
  assert.equal('objeto' in d, false);
  assert.equal(construirDatos(lect(), lect().lineas_orden[0], { consecutivo: 'C', hoy, objetoDeOrden: true }).objeto, ''); // DEIPO: blank
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

const url = process.env.TEST_DATABASE_URL;
test('procesarActa: consistent readings -> LISTA; disagreement or wrong remesa -> REVISAR; download error -> ERROR', { skip: !url }, async () => {
  process.env.DATABASE_URL = url;
  const c = await mysql.createConnection({ uri: url, multipleStatements: true });
  await c.query('SET FOREIGN_KEY_CHECKS=0; DROP TABLE IF EXISTS actas, lotes, usuarios, waf_cookies, acta_tipos; SET FOREIGN_KEY_CHECKS=1;');
  await c.query(readFileSync(new URL('../db/001_init.sql', import.meta.url), 'utf8'));
  await c.end();
  const { procesarActa } = await import('../src/procesar.js');
  const A = await import('../src/store/actas.js');
  const { registrarIngreso } = await import('../src/store/usuarios.js');
  const { db } = await import('../src/db.js');
  const u = await registrarIngreso('tester');
  const { loteId } = await A.crearLote(u.id, [{ remesa: '0100000001', consecutivo: 'A' }, { remesa: '0100000001', consecutivo: 'B' }, { remesa: '0100000009', consecutivo: 'C' }]);
  const [a, b, x] = await A.listarActas(loteId);
  const deps = (leer, descargar = async () => Buffer.from('%PDF')) => ({ descargar, leer, getConfig: async () => ({}), hoy: () => ({ dia: 11, mes: 11, anio: 2026 }) });

  assert.deepEqual(await procesarActa(a.id, deps(async () => lect())), { ok: true, estado: 'LISTA' });
  assert.equal((await A.obtener(a.id)).datos.lineas[0].valorUnitario, '1.296.000');

  let n = 0; // second reading disagrees on the price
  const r = await procesarActa(b.id, deps(async () => { const l = lect(); if (n++) l.lineas_orden[0].precio = '1,296,001.00'; return l; }));
  assert.equal(r.estado, 'REVISAR');
  assert.ok((await A.obtener(b.id)).alertas.some((z) => z.campo === 'lineas_orden'));

  const e = await procesarActa(x.id, deps(async () => lect(), async () => { throw Object.assign(new Error('x'), { name: 'SilogtranError', code: 'WAF_FAILED' }); }));
  assert.equal(e.ok, false);
  assert.equal((await A.obtener(x.id)).estado, 'ERROR');
  // a hung dependency must end in a recorded TIMEOUT instead of leaving the acta stuck
  const { loteId: l2 } = await A.crearLote(u.id, [{ remesa: '0100000007', consecutivo: 'T' }]);
  const [t] = await A.listarActas(l2);
  const colgada = await procesarActa(t.id, deps(async () => lect(), () => new Promise(() => {})), 100);
  assert.equal(colgada.motivo, 'TIMEOUT');
  assert.equal((await A.obtener(t.id)).codigo_error, 'TIMEOUT');
  await db().end();
});
