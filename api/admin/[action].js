// Fixed values per acta type (names, contract, logo, signature). Needs a logged-in session AND the admin key (header x-admin-key).
import { timingSafeEqual } from 'node:crypto';
import { route, body } from '../../src/http/route.js';
import { ApiError } from '../../src/http/errors.js';
import { requireSession } from '../../src/http/session.js';
import { descargarSoporte } from '../../src/soporte/descargar.js';
import { leerSoporte } from '../../src/lectura/leer.js';
import { validar } from '../../src/validacion.js';
import { renderActaPdf } from '../../src/actas/pdf.js';
import { listarConfig, getConfigTipo, guardarConfigTipo, guardarImagen } from '../../src/store/config.js';

const EDITABLES = ['contratista', 'objeto', 'empresaNombre', 'empresaSigla', 'supervisor', 'planeador', 'comprador', 'contrato', 'afe', 'sede', 'repContratista', 'cedulaContratista', 'repDrummond', 'nombreFirmaContratista'];

async function admin(req) {
  await requireSession(req);
  const esperada = Buffer.from(process.env.ADMIN_KEY || '');
  const dada = Buffer.from(String(req.headers['x-admin-key'] || ''));
  if (!esperada.length || esperada.length !== dada.length || !timingSafeEqual(esperada, dada)) throw new ApiError('ADMIN_REQUIRED', 'Clave de administrador incorrecta.', { status: 403 });
}

// TEMPORARY deployment diagnostics (GET, ?key=ADMIN_KEY, returns metrics only, never document data). Remove after the first real test.
const claveOk = (k) => { const a = Buffer.from(process.env.ADMIN_KEY || ''); const b = Buffer.from(String(k || '')); return a.length > 0 && a.length === b.length && timingSafeEqual(a, b); };
async function medir(fn) { const t = Date.now(); try { return { ok: true, ms: Date.now() - t, ...(await fn()) }; } catch (e) { return { ok: false, ms: Date.now() - t, code: e.code, message: String(e.message).slice(0, 160), detail: String(e.detail ?? '').slice(0, 400) }; } }

export default route({
  'GET:probar': async (req, res) => {
    if (!claveOk(req.query.key)) throw new ApiError('ADMIN_REQUIRED', 'Clave incorrecta.', { status: 403 });
    const { paso, remesa } = req.query;
    if (paso === 'descarga') return res.status(200).json(await medir(async () => ({ bytes: (await descargarSoporte(remesa)).length })));
    if (paso === 'lectura') return res.status(200).json(await medir(async () => {
      const l = await leerSoporte(await descargarSoporte(remesa), { remesa });
      const v = validar(l, { remesa });
      return { tipo: v.tipo, validacionOk: v.ok, camposConAlerta: v.errores.map((e) => e.campo), dudosos: l.campos_dudosos ?? [], paginas: l.paginas ?? null };
    }));
    if (paso === 'pdf') return res.status(200).json(await medir(async () => {
      const cfg = await getConfigTipo('CPLTD');
      const pdf = await renderActaPdf(cfg, { fechaActa: '11/11/2026', ordenCompleta: 'CPLTD-1', consecutivo: 'PRUEBA', fechaServicio: '02/09/2026', linea: '1', descripcion: 'PRUEBA', cantidadOrden: '1,00', cantidadFacturada: '1,00', valorUnitario: '1', valorTotal: '1', adjuntos: 'X', cierre: { dia: 11, mes: 11, anio: 2026 } });
      return { bytes: pdf.length, esPdf: pdf.subarray(0, 5).toString('latin1') === '%PDF-' };
    }));
    throw new ApiError('PARAM_INVALID', 'paso: descarga | lectura | pdf', { status: 400 });
  },
  'GET:config': async (req, res) => { await admin(req); res.status(200).json({ ok: true, ...(await listarConfig()) }); },
  'POST:tipo': async (req, res) => {
    await admin(req);
    const { tipo, valores } = body(req);
    if (!/^[A-Z]{5}$/.test(String(tipo))) throw new ApiError('PARAM_INVALID', 'Tipo inválido.', { status: 400 });
    const actual = await getConfigTipo(tipo).catch(() => ({}));
    const nuevo = { ...actual }; delete nuevo.logo; delete nuevo.firma;
    for (const k of EDITABLES) if (valores?.[k] !== undefined) { const v = String(valores[k]).trim(); if (!v || v.length > 200) throw new ApiError('PARAM_INVALID', `Valor inválido en «${k}».`, { status: 400 }); nuevo[k] = v; }
    nuevo.tipo = tipo;
    await guardarConfigTipo(tipo, nuevo);
    res.status(200).json({ ok: true });
  },
  'POST:imagen': async (req, res) => {
    await admin(req);
    const { campo, dataUri } = body(req);
    if (!['logo', 'firma'].includes(campo)) throw new ApiError('PARAM_INVALID', 'Campo inválido.', { status: 400 });
    if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(String(dataUri)) || String(dataUri).length > 400000) throw new ApiError('PARAM_INVALID', 'Sube una imagen PNG o JPG de menos de 250 KB.', { status: 400 });
    await guardarImagen(campo, dataUri);
    res.status(200).json({ ok: true });
  },
});
