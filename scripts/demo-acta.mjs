// Local demo: renders a sample acta from fixtures/config.local.json (gitignored). Usage: node scripts/demo-acta.mjs <out.pdf>
import { readFileSync, writeFileSync } from 'node:fs';
import { renderActaPdf } from '../src/actas/pdf.js';

const cfg = JSON.parse(readFileSync(new URL('../fixtures/config.local.json', import.meta.url)))['CPLTD'];
const datos = {
  fechaActa: '11/11/2026', ordenCompleta: 'CPLTD-500000001A', consecutivo: 'TEST002', fechaServicio: '02/09/2026',
  linea: '12', descripcion: 'SERVICIO DE TRANSPORTE TERRESTRE DE CARGA VEHÍCULO TIPO: CAMION 600 RUTA: PDR-BAQ TIPO DE CARGA: CONSOLIDADO',
  cantidadOrden: '3,00', cantidadFacturada: '1,00', valorUnitario: '1.296.000', valorTotal: '1.296.000',
  adjuntos: 'XYZ001SEP26 BILL OF INLAND – TRF – ORDEN DE COMPRA CPLTD-500000001A', cierre: { dia: 11, mes: 11, anio: 2026 },
};
writeFileSync(process.argv[2] || 'acta.pdf', await renderActaPdf(cfg, datos));
