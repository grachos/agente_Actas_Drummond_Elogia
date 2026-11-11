// Final deliverable: the generated acta first, then the Silogtran support PDF untouched, as ONE PDF.
import { PDFDocument } from 'pdf-lib';
import { renderActaPdf } from './pdf.js';
import { descargarSoporte } from '../soporte/descargar.js';
import { getConfigTipo } from '../store/config.js';

// Downloaded file name = the full acta number (e.g. CPLTD-068-26.pdf); only approved actas are downloaded, so the number always exists.
export const nombreFinal = (acta) => `${String(acta.consecutivo || `${acta.tipo}_${acta.remesa}`).replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;

export async function armarPdfFinal(acta, deps = { render: renderActaPdf, soporte: descargarSoporte, getConfig: getConfigTipo }) {
  const cfg = await deps.getConfig(acta.tipo);
  const [actaPdf, soporte] = await Promise.all([deps.render(cfg, acta.datos), deps.soporte(acta.remesa)]);
  const out = await PDFDocument.create();
  for (const bytes of [actaPdf, soporte]) {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
  }
  return Buffer.from(await out.save());
}
