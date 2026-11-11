import { route, body, intParam } from '../../src/http/route.js';
import { ApiError } from '../../src/http/errors.js';
import { requireSession } from '../../src/http/session.js';
import { remesaValida } from '../../src/soporte/descargar.js';
import * as A from '../../src/store/actas.js';

const MAX_ITEMS = 500;
export default route({
  'POST:crear': async (req, res) => {
    const u = await requireSession(req);
    const items = body(req).items;
    if (!Array.isArray(items) || !items.length || items.length > MAX_ITEMS) throw new ApiError('PARAM_INVALID', `Envía entre 1 y ${MAX_ITEMS} remesas.`, { status: 400 });
    const limpias = items.map((x) => ({ remesa: String(x?.remesa ?? '').trim(), consecutivo: String(x?.consecutivo ?? '').trim() }));
    const malas = limpias.filter((x) => !remesaValida(x.remesa) || !x.consecutivo || x.consecutivo.length > 50);
    if (malas.length) throw new ApiError('PARAM_INVALID', `Hay ${malas.length} fila(s) con remesa o consecutivo inválido (primera: «${malas[0].remesa}»).`, { status: 400 });
    res.status(200).json({ ok: true, ...(await A.crearLote(u.id, limpias)) });
  },
  'GET:listar': async (req, res) => { await requireSession(req); res.status(200).json({ ok: true, lotes: await A.listarLotes() }); },
  'GET:ver': async (req, res) => { await requireSession(req); res.status(200).json({ ok: true, actas: await A.listarActas(intParam(req.query.id)) }); },
});
