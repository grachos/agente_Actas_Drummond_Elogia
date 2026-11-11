// Fixed values per acta type (names, contract, logo, signature) and acta number counters. Needs a logged-in session.
import { route, body } from '../../src/http/route.js';
import { ApiError } from '../../src/http/errors.js';
import { requireSession } from '../../src/http/session.js';
import { listarConfig, getConfigTipo, guardarConfigTipo, guardarImagen, guardarSiguiente } from '../../src/store/config.js';

const EDITABLES = ['contratista', 'objeto', 'empresaNombre', 'empresaSigla', 'supervisor', 'planeador', 'comprador', 'contrato', 'afe', 'sede', 'repContratista', 'cedulaContratista', 'repDrummond', 'nombreFirmaContratista', 'firmaDirector', 'firmaGerente', 'firmaCountry', 'sigCodigo', 'sigFecha'];

// Anyone with a valid session (logged in with a Silogtran user) can change the configuration (owner decision 2026-11-11).
const admin = (req) => requireSession(req);

export default route({
  'GET:config': async (req, res) => { await admin(req); res.status(200).json({ ok: true, ...(await listarConfig()) }); },
  'POST:tipo': async (req, res) => {
    await admin(req);
    const { tipo, valores } = body(req);
    if (!/^[A-Z]{5}$/.test(String(tipo))) throw new ApiError('PARAM_INVALID', 'Tipo inválido.', { status: 400 });
    const actual = await getConfigTipo(tipo).catch(() => ({}));
    const nuevo = { ...actual }; delete nuevo.logo; delete nuevo.firma;
    const OPCIONALES = ['firmaDirector', 'firmaGerente', 'firmaCountry', 'sigCodigo', 'sigFecha']; // empty = not used / default format header
    for (const k of EDITABLES) if (valores?.[k] !== undefined && !(k === 'objeto' && actual.objetoDeOrden)) { const v = String(valores[k]).trim(); if (!v && OPCIONALES.includes(k)) { delete nuevo[k]; continue; } if (!v || v.length > 200) throw new ApiError('PARAM_INVALID', `Valor inválido en «${k}».`, { status: 400 }); nuevo[k] = v; }
    nuevo.tipo = tipo;
    await guardarConfigTipo(tipo, nuevo);
    res.status(200).json({ ok: true });
  },
  'POST:consecutivo': async (req, res) => {
    await admin(req);
    const { tipo, siguiente } = body(req);
    const n = Number(siguiente);
    if (!/^[A-Z]{5}$/.test(String(tipo)) || !Number.isInteger(n) || n < 1 || n > 9999) throw new ApiError('PARAM_INVALID', 'Escribe un número entero entre 1 y 9999.', { status: 400 });
    await guardarSiguiente(tipo, n);
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
