import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { reporteExcel } from '../src/reporte.js';
import { totalActa } from '../src/actas/datos.js';

const linea = (valorTotal) => ({ linea: '1', descripcion: 'X', cantidadOrden: '1,00', cantidadFacturada: '1,00', valorUnitario: valorTotal, valorTotal });

test('total of an acta = sum of its lines (one line, several lines, legacy flat data)', () => {
  assert.equal(totalActa({ lineas: [linea('1.296.000')] }), 1296000);
  assert.equal(totalActa({ lineas: [linea('1.296.000'), linea('2.760.000')] }), 4056000);
  assert.equal(totalActa({ linea: '1', valorTotal: '57.499.875' }), 57499875);
});

test('Excel report: header, remesa kept as text, numeric total, acta number; one row per registered acta', async () => {
  const buf = await reporteExcel([
    { remesa: '0100000001', consecutivo: 'CPLTD-068-26', datos: { lineas: [linea('1.296.000')] } },
    { remesa: '0100000002', consecutivo: 'CMLTD-075-26', datos: { lineas: [linea('1.000.000'), linea('2.500.000')] } },
  ]);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
  const ws = wb.getWorksheet('Actas');
  assert.deepEqual(ws.getRow(1).values.slice(1), ['Número de remesa', 'Total acta', 'Número de consecutivo del acta']);
  assert.deepEqual(ws.getRow(2).values.slice(1), ['0100000001', 1296000, 'CPLTD-068-26']); // leading zero preserved, total numeric
  assert.deepEqual(ws.getRow(3).values.slice(1), ['0100000002', 3500000, 'CMLTD-075-26']);
  assert.equal(ws.rowCount, 3);
  assert.equal((await reporteExcel([])).length > 0, true); // empty report still a valid file
});
