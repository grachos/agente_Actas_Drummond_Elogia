// Downloads the remesa support PDF from the public Silogtran URL (read-only GET, no login needed; the WAF cookie is reused).
import { readFileSync } from 'node:fs';
import { Silogtran } from '../silogtran/client.js';
import { ApiError } from '../http/errors.js';
import { loadWafCookies, saveWafCookies } from '../store/config.js';

export const SUFIJO = () => process.env.SOPORTE_SUFIJO || '57';
const BASE = () => process.env.SILOG_BASE_URL || 'https://construproyec.colombiasoftware.net';

export const urlSoporte = (remesa) => `images/imagenes/construproyec/remesa_003/${remesa}_${SUFIJO()}.pdf`;
export const remesaValida = (r) => /^\d{6,12}$/.test(String(r));

export async function descargarSoporte(remesa) {
  if (!remesaValida(remesa)) throw new ApiError('REMESA_INVALID', `La remesa «${remesa}» no es válida (solo dígitos).`, { status: 400 });
  if (process.env.ACTAS_MOCK === '1' && !process.env.VERCEL) { // local development only: read sample PDFs from fixtures/soporte/
    try { return readFileSync(new URL(`../../fixtures/soporte/${remesa}.pdf`, import.meta.url)); } catch { throw new ApiError('NO_ATTACHMENT', `No existe el soporte de la remesa ${remesa} en Silogtran.`, { status: 404 }); }
  }
  const client = new Silogtran(BASE());
  client.importCookies((await loadWafCookies().catch(() => null)) || {});
  let res;
  try {
    res = await client.request(urlSoporte(remesa), { timeoutSec: 25 });
  } catch (e) {
    if (e?.code === 'SILOG_NOT_FOUND') throw new ApiError('NO_ATTACHMENT', `No existe el soporte de la remesa ${remesa} en Silogtran.`, { status: 404 });
    throw e;
  }
  if (client.wafSolved) await saveWafCookies(client.exportCookies()).catch(() => {});
  const ok = /pdf/i.test(res.type) && res.body.subarray(0, 5).toString('latin1') === '%PDF-' && res.body.length > 1000;
  if (!ok) throw new ApiError('NOT_A_PDF', `Silogtran no devolvió un PDF para la remesa ${remesa}.`, { status: 502 });
  return res.body;
}
