import test from 'node:test';
import assert from 'node:assert/strict';
import { actaHtml, headerTemplate } from '../src/actas/html.js';

const cfg = { empresaSigla: 'DLTD', empresaNombre: 'EMPRESA X', contratista: 'CONTRATISTA X', objeto: 'OBJETO X', supervisor: 'SUP', planeador: 'N/A', comprador: 'COMP', afe: 'N/A',
  contrato: 'DCI-0000', sede: 'PUERTO', repContratista: 'REP A', cedulaContratista: '1', repDrummond: 'REP B', nombreFirmaContratista: 'Rep A', logo: '', firma: '' };
const d = { fechaActa: '11/11/2026', ordenCompleta: 'CPLTD-1', consecutivo: 'C-1', fechaServicio: '02/09/2026', linea: '12', descripcion: 'A & B <x>',
  cantidadOrden: '3,00', cantidadFacturada: '1,00', valorUnitario: '1.296.000', valorTotal: '1.296.000', adjuntos: 'XYZ001SEP26 BILL OF INLAND – TRF – ORDEN DE COMPRA CPLTD-1', cierre: { dia: 11, mes: 11, anio: 2026 } };

test('DEIPO variant: own header code, object from the order, 5-signature block and DEI wording', () => {
  const dei = { ...cfg, variante: 'DEI', empresaSigla: 'DEI', empresaNombre: 'DRUMMOND ENERGY INC.', objetoDeOrden: true, sigCodigo: 'SIGDEI-0331', sigFecha: '03-02-2022', firmaDirector: 'DIR X', firmaGerente: 'GER Y', firmaCountry: 'COUNTRY Z' };
  const h = actaHtml(dei, { ...d, objeto: 'SERVICIOS DE RENTA DE CAMA ALTA' });
  for (const v of ['SERVICIOS DE RENTA DE CAMA ALTA', 'DEI', 'DIR X', 'GER Y', 'COUNTRY Z', 'COUNTRY MANAGER', 'Manual de Contratistas', 'recibidos mediante esta acta']) assert.ok(h.includes(v), v);
  assert.ok(!h.includes('a satisfacción mediante'));
  assert.ok(headerTemplate(dei).includes('SIGDEI-0331') && headerTemplate(dei).includes('03-02-2022'));
});

test('acta html carries every value, escapes text and closes with the acta date', () => {
  const h = actaHtml(cfg, d);
  for (const v of ['11/11/2026', 'CPLTD-1', 'DCI-0000', 'PUERTO', '3,00', '1.296.000', 'A &amp; B &lt;x&gt;', '11 días', 'NOVIEMBRE', '2026']) assert.ok(h.includes(v), v);
  assert.ok(!h.includes('<x>'));
  assert.equal((h.match(/02\/09\/2026/g) || []).length, 2); // start and end dates are the same
});
