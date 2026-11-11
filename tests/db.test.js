// Integration test: runs only when TEST_DATABASE_URL points to an empty throwaway MySQL/MariaDB database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';

const url = process.env.TEST_DATABASE_URL;
test('actas store: lote, atomic claim, edit/approve rules', { skip: !url }, async () => {
  process.env.DATABASE_URL = url;
  const c = await mysql.createConnection({ uri: url, multipleStatements: true });
  await c.query('SET FOREIGN_KEY_CHECKS=0; DROP TABLE IF EXISTS actas, lotes, usuarios, waf_cookies, acta_tipos; SET FOREIGN_KEY_CHECKS=1;');
  await c.query(readFileSync(new URL('../db/001_init.sql', import.meta.url), 'utf8'));
  await c.end();
  const { registrarIngreso } = await import('../src/store/usuarios.js');
  const A = await import('../src/store/actas.js');
  const { db } = await import('../src/db.js');

  const u = await registrarIngreso('tester');
  assert.equal((await registrarIngreso('tester')).id, u.id);
  const lote = await A.crearLote(u.id, [{ remesa: '1', consecutivo: 'A' }, { remesa: '2', consecutivo: 'B' }, { remesa: '1', consecutivo: 'A' }]);
  assert.equal(lote.creadas, 2); assert.equal(lote.duplicadas.length, 1);
  const [a] = await A.listarActas(lote.loteId);
  assert.equal(a.estado, 'PENDIENTE');
  assert.equal(await A.reclamar(a.id), true);
  assert.equal(await A.reclamar(a.id), false); // second concurrent claim loses
  await A.guardarResultado(a.id, { tipo: 'CPLTD', estado: 'LISTA', lectura: { x: 1 }, alertas: [], datos: { linea: '12' } });
  assert.equal(await A.aprobar([a.id], u.id), 1);
  assert.equal((await A.obtener(a.id)).estado, 'APROBADA');
  await A.guardarDatos(a.id, { linea: '13' }); // editing an approved acta sends it back to review
  const e = await A.obtener(a.id);
  assert.equal(e.estado, 'LISTA'); assert.equal(e.aprobado_por, null); assert.deepEqual(e.datos, { linea: '13' });
  await db().end();
});
