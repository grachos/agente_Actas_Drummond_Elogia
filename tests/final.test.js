import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { armarPdfFinal, nombreFinal } from '../src/actas/final.js';
import { sanearDatos } from '../src/actas/validarEdicion.js';

const pdfDe = async (n) => { const d = await PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage(); return Buffer.from(await d.save()); };

test('final PDF = acta pages first, then the support untouched, in one file', async () => {
  const buf = await armarPdfFinal({ tipo: 'CPLTD', remesa: '0100000001', datos: {} }, { getConfig: async () => ({}), render: async () => pdfDe(2), soporte: async () => pdfDe(5) });
  assert.equal((await PDFDocument.load(buf)).getPageCount(), 7);
  assert.equal(nombreFinal({ tipo: 'CPLTD', remesa: '0100000001' }), 'CPLTD_0100000001.pdf');
});

const ok = { consecutivo: 'C-1', ordenCompleta: 'CPLTD-1', adjuntos: 'A', fechaActa: '11/11/2026', fechaServicio: '02/09/2026',
  lineas: [{ linea: '12', descripcion: 'X', cantidadOrden: '3,00', cantidadFacturada: '2,00', valorUnitario: '1.296.000' }] };
test('sanearDatos recomputes each line total, derives the closing date, allows a blank object and rejects bad input', () => {
  const d = sanearDatos(ok);
  assert.equal(d.lineas[0].valorTotal, '2.592.000');
  assert.deepEqual(d.cierre, { dia: 11, mes: 11, anio: 2026 });
  assert.equal(sanearDatos({ ...ok, objeto: '' }).objeto, '');
  assert.equal(sanearDatos({ ...ok, objeto: '  RENTA   DE CAMA ALTA ' }).objeto, 'RENTA DE CAMA ALTA');
  const dos = sanearDatos({ ...ok, lineas: [ok.lineas[0], { ...ok.lineas[0], linea: '13', cantidadFacturada: '1,00', valorUnitario: '2.760.000' }] });
  assert.deepEqual(dos.lineas.map((l) => l.valorTotal), ['2.592.000', '2.760.000']);
  assert.throws(() => sanearDatos({ ...ok, fechaActa: '31/02/2026' }), /fecha/);
  assert.throws(() => sanearDatos({ ...ok, lineas: [{ ...ok.lineas[0], valorUnitario: '1296000' }] }), /valor unitario/);
  assert.throws(() => sanearDatos({ ...ok, lineas: [{ ...ok.lineas[0], descripcion: '' }] }), /vacío/);
  assert.throws(() => sanearDatos({ ...ok, lineas: [] }), /entre 1 y/);
});
