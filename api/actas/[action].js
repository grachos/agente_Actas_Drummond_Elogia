import { route, body, intParam } from '../../src/http/route.js';
import { ApiError } from '../../src/http/errors.js';
import { requireSession } from '../../src/http/session.js';
import * as A from '../../src/store/actas.js';
import { procesarActa } from '../../src/procesar.js';
import { descargarSoporte } from '../../src/soporte/descargar.js';
import { sanearDatos } from '../../src/actas/validarEdicion.js';
import { armarPdfFinal, nombreFinal } from '../../src/actas/final.js';
import { actaHtml } from '../../src/actas/html.js';
import { getConfigTipo } from '../../src/store/config.js';

const cargar = async (id) => { const a = await A.obtener(id); if (!a) throw new ApiError('NOT_FOUND', 'No existe esa acta.', { status: 404 }); return a; };
const pdf = (res, buf, nombre) => { res.setHeader('content-type', 'application/pdf'); res.setHeader('content-disposition', `inline; filename="${nombre}"`); res.setHeader('cache-control', 'private, no-store'); res.status(200).send(buf); };

export default route({
  'POST:procesar': async (req, res) => { await requireSession(req); res.status(200).json(await procesarActa(intParam(body(req).id))); },
  'GET:obtener': async (req, res) => { await requireSession(req); res.status(200).json({ ok: true, acta: await cargar(intParam(req.query.id)) }); },
  'POST:guardar': async (req, res) => {
    await requireSession(req);
    const id = intParam(body(req).id); const a = await cargar(id);
    if (!['LISTA', 'REVISAR', 'APROBADA'].includes(a.estado)) throw new ApiError('ESTADO_INVALIDO', 'Esa acta aún no está lista para editar.', { status: 409 });
    await A.guardarDatos(id, sanearDatos(body(req).datos));
    res.status(200).json({ ok: true, acta: await cargar(id) });
  },
  'POST:aprobar': async (req, res) => {
    const u = await requireSession(req);
    const ids = (body(req).ids ?? []).map((x) => intParam(x));
    res.status(200).json({ ok: true, aprobadas: await A.aprobar(ids, u.id) });
  },
  'POST:desaprobar': async (req, res) => { await requireSession(req); await A.desaprobar(intParam(body(req).id)); res.status(200).json({ ok: true }); },
  'GET:soporte': async (req, res) => { await requireSession(req); const a = await cargar(intParam(req.query.id)); pdf(res, await descargarSoporte(a.remesa), `${a.remesa}_soporte.pdf`); },
  'GET:vista': async (req, res) => {
    await requireSession(req);
    const a = await cargar(intParam(req.query.id));
    if (!a.datos || !a.tipo) throw new ApiError('SIN_DATOS', 'Esa acta aún no tiene datos.', { status: 409 });
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    res.status(200).send(actaHtml(await getConfigTipo(a.tipo), a.datos, { vista: true }));
  },
  'GET:pdf': async (req, res) => {
    await requireSession(req);
    const a = await cargar(intParam(req.query.id));
    if (a.estado !== 'APROBADA') throw new ApiError('NO_APROBADA', 'Solo se genera el PDF de actas aprobadas.', { status: 409 });
    pdf(res, await armarPdfFinal(a), nombreFinal(a));
  },
});
