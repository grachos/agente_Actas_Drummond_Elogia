// Integration test: runs only when TEST_DATABASE_URL points to an empty throwaway MySQL/MariaDB database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';

const url = process.env.TEST_DATABASE_URL;
test('actas store: lote, atomic claim, numbering at approval, edit rules', { skip: !url }, async () => {
  process.env.DATABASE_URL = url;
  const c = await mysql.createConnection({ uri: url, multipleStatements: true });
  await c.query('SET FOREIGN_KEY_CHECKS=0; DROP TABLE IF EXISTS actas, lotes, usuarios, waf_cookies, acta_tipos, consecutivos, schema_migrations; SET FOREIGN_KEY_CHECKS=1;');
  await c.end();
  const { registrarIngreso } = await import('../src/store/usuarios.js');
  const A = await import('../src/store/actas.js');
  const { db, q } = await import('../src/db.js');
  try {

  const u = await registrarIngreso('tester');
  assert.equal((await registrarIngreso('tester')).id, u.id);
  const lote = await A.crearLote(u.id, [{ remesa: '1' }, { remesa: '2' }, { remesa: '3' }, { remesa: '1' }]);
  assert.equal(lote.creadas, 3); assert.equal(lote.duplicadas.length, 1);
  assert.equal((await A.crearLote(u.id, [{ remesa: '2' }])).duplicadas.length, 1); // a remesa already in another lote is skipped
  const [a, b, d] = await A.listarActas(lote.loteId);
  assert.equal(a.estado, 'PENDIENTE');
  assert.equal(await A.reclamar(a.id), true);
  assert.equal(await A.reclamar(a.id), false); // second concurrent claim loses
  const listo = (id, tipo) => A.guardarResultado(id, { tipo, estado: 'LISTA', lectura: { x: 1 }, alertas: [], datos: { consecutivo: '', lineas: [{ linea: '12' }] } });
  await listo(a.id, 'CPLTD'); await listo(b.id, 'CPLTD'); await listo(d.id, 'DEIPO');

  // the seed gives CPLTD 68 and CMLTD 75; numbers are TIPO-NNN-YY, sequential, assigned at approval; DEIPO has no counter yet
  const r = await A.aprobar([a.id, b.id, d.id], u.id, 2026);
  assert.equal(r.aprobadas, 2); assert.equal(r.errores.length, 1); assert.match(r.errores[0].mensaje, /DEIPO/);
  assert.equal((await A.obtener(a.id)).consecutivo, 'CPLTD-068-26');
  assert.equal((await A.obtener(b.id)).datos.consecutivo, 'CPLTD-069-26');
  assert.equal((await A.obtener(d.id)).estado, 'LISTA'); // not approved, no number burned
  assert.equal((await q("SELECT siguiente FROM consecutivos WHERE tipo = 'CPLTD'"))[0].siguiente, 70);

  // editing an approved acta sends it back to review but keeps its number; re-approval does not take a new one
  const e0 = await A.obtener(a.id);
  await A.guardarDatos(a.id, { ...e0.datos, lineas: [{ linea: '13' }] });
  const e = await A.obtener(a.id);
  assert.equal(e.estado, 'LISTA'); assert.equal(e.aprobado_por, null); assert.equal(e.datos.consecutivo, 'CPLTD-068-26');
  await A.aprobar([a.id], u.id, 2026);
  assert.equal((await q("SELECT siguiente FROM consecutivos WHERE tipo = 'CPLTD'"))[0].siguiente, 70);

  // a configured counter makes the next DEIPO approval work; two approvals at once never repeat a number
  await q("INSERT INTO consecutivos (tipo, siguiente) VALUES ('DEIPO', 5)");
  const lote2 = await A.crearLote(u.id, [{ remesa: '10' }, { remesa: '11' }]);
  const [p1, p2] = await A.listarActas(lote2.loteId);
  await listo(p1.id, 'DEIPO'); await listo(p2.id, 'DEIPO');
  await Promise.all([A.aprobar([p1.id], u.id, 2026), A.aprobar([p2.id], u.id, 2026)]);
  const nums = [(await A.obtener(p1.id)).consecutivo, (await A.obtener(p2.id)).consecutivo].sort();
  assert.deepEqual(nums, ['DEIPO-005-26', 'DEIPO-006-26']);

  // the one-time cleanup migration removes exactly the test acta (remesa + hand-typed number) and nothing else
  await q("INSERT INTO actas (lote_id, usuario_id, remesa, consecutivo, estado) VALUES (?, ?, '0101219749', 'GGOMEZ19', 'APROBADA')", [lote.loteId, u.id]);
  const antes = (await q('SELECT COUNT(*) AS n FROM actas'))[0].n;
  const cx = await mysql.createConnection({ uri: url, multipleStatements: true });
  await cx.query(readFileSync(new URL('../db/004_borrar_acta_prueba.sql', import.meta.url), 'utf8')); await cx.end();
  assert.equal((await q('SELECT COUNT(*) AS n FROM actas'))[0].n, antes - 1);
  assert.equal((await q("SELECT COUNT(*) AS n FROM actas WHERE consecutivo = 'GGOMEZ19'"))[0].n, 0);

  // a stale PROCESANDO (function killed) shows as ERROR/TIMEOUT after 3 minutes and can be claimed again
  assert.equal(await A.reclamar(d.id), true); // d is still LISTA (it could not be approved without a DEIPO counter)
  await q("UPDATE actas SET actualizado_en = NOW() - INTERVAL 5 MINUTE WHERE id = ?", [d.id]);
  assert.equal((await A.obtener(d.id)).estado, 'ERROR');
  assert.equal((await A.obtener(d.id)).codigo_error, 'TIMEOUT');
  assert.equal(await A.reclamar(d.id), true);
  } finally {
    await db().end();
  }
});
