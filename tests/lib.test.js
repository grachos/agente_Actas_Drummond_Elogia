import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUS, formatCOP, formatQty } from '../src/lib/numeros.js';
import { parseISO, parseBillDate, dmy, hoyBogota } from '../src/lib/fechas.js';

test('parseUS reads US-format amounts as integer cents', () => {
  assert.equal(parseUS('4,536,000.00'), 453600000);
  assert.equal(parseUS('1,296,000.00'), 129600000);
  assert.equal(parseUS('3.00EA'), 300);
  assert.equal(parseUS('18,260,868.00'), 1826086800);
  assert.equal(parseUS('12,34'), null);
  assert.equal(parseUS(''), null);
});
test('formatCOP / formatQty', () => {
  assert.equal(formatCOP(453600000), '4.536.000');
  assert.equal(formatCOP(129600000), '1.296.000');
  assert.equal(formatQty(300), '3,00');
});
test('dates', () => {
  assert.deepEqual(parseISO('2026-09-02'), { anio: 2026, mes: 9, dia: 2 });
  assert.equal(parseISO('2026-02-30'), null);
  assert.deepEqual(parseBillDate('2', 'SEP', '26'), { dia: 2, mes: 9, anio: 2026 });
  assert.equal(dmy({ dia: 2, mes: 9, anio: 2026 }), '02/09/2026');
  assert.deepEqual(hoyBogota(new Date('2026-11-12T03:00:00Z')), { dia: 11, mes: 11, anio: 2026 }); // 22:00 in Bogota
});
