// Dispatcher for api/<group>/[action].js files (keeps the number of Vercel functions low).
import { ApiError, sendError } from './errors.js';

// routes: { 'GET:listar': async (req, res) => {...}, 'POST:crear': ... }
export const route = (routes) => async (req, res) => {
  try {
    const h = routes[`${req.method}:${req.query.action}`];
    if (!h) throw new ApiError('NOT_FOUND', 'Ruta no encontrada.', { status: 404 });
    await h(req, res);
  } catch (e) {
    sendError(res, e);
  }
};

export const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {});
export function intParam(v, nombre = 'id') {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new ApiError('PARAM_INVALID', `Falta o es inválido «${nombre}».`, { status: 400 });
  return n;
}
