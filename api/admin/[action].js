// Fixed values per acta type (names, contract, logo, signature). Needs a logged-in session AND the admin key (header x-admin-key).
import { timingSafeEqual } from 'node:crypto';
import { route, body } from '../../src/http/route.js';
import { ApiError } from '../../src/http/errors.js';
import { requireSession } from '../../src/http/session.js';
import { listarConfig, getConfigTipo, guardarConfigTipo, guardarImagen } from '../../src/store/config.js';

const EDITABLES = ['contratista', 'objeto', 'empresaNombre', 'empresaSigla', 'supervisor', 'planeador', 'comprador', 'contrato', 'afe', 'sede', 'repContratista', 'cedulaContratista', 'repDrummond', 'nombreFirmaContratista', 'firmaDirector', 'firmaGerente', 'firmaCountry', 'sigCodigo', 'sigFecha'];

async function admin(req) {
  await requireSession(req);
  const esperada = Buffer.from(process.env.ADMIN_KEY || '');
  const dada = Buffer.from(String(req.headers['x-admin-key'] || ''));
  if (!esperada.length || esperada.length !== dada.length || !timingSafeEqual(esperada, dada)) throw new ApiError('ADMIN_REQUIRED', 'Clave de administrador incorrecta.', { status: 403 });
}

export default route({
  'GET:config': async (req, res) => { await admin(req); res.status(200).json({ ok: true, ...(await listarConfig()) }); },
  'POST:tipo': async (req, res) => {
    await admin(req);
    const { tipo, valores } = body(req);
    if (!/^[A-Z]{5}$/.test(String(tipo))) throw new ApiError('PARAM_INVALID', 'Tipo inválido.', { status: 400 });
    const actual = await getConfigTipo(tipo).catch(() => ({}));
    const nuevo = { ...actual }; delete nuevo.logo; delete nuevo.firma;
    for (const k of EDITABLES) if (valores?.[k] !== undefined && !(k === 'objeto' && actual.objetoDeOrden)) { const v = String(valores[k]).trim(); if (!v || v.length > 200) throw new ApiError('PARAM_INVALID', `Valor inválido en «${k}».`, { status: 400 }); nuevo[k] = v; }
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
