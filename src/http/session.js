// Browser session: signed, short-lived token in an HttpOnly cookie.
import { signToken, verifyToken } from '../token.js';
import { ApiError } from './errors.js';
import { getUsuario } from '../store/usuarios.js';

const NAME = 'sid';
const TTL_SEC = 8 * 3600;
const secure = () => (process.env.VERCEL ? '; Secure' : '');

export function setSessionCookie(res, userId) {
  res.setHeader('set-cookie', `${NAME}=${signToken({ uid: userId }, TTL_SEC, 'session')}; HttpOnly${secure()}; SameSite=Lax; Path=/; Max-Age=${TTL_SEC}`);
}
export const clearSessionCookie = (res) => res.setHeader('set-cookie', `${NAME}=; HttpOnly${secure()}; SameSite=Lax; Path=/; Max-Age=0`);

export function readSession(req) {
  const m = new RegExp(`(?:^|;\\s*)${NAME}=([^;]+)`).exec(req.headers.cookie || '');
  if (!m) return null;
  try { return verifyToken(m[1], 'session').uid ?? null; } catch { return null; }
}

export async function requireSession(req) {
  const uid = readSession(req);
  const user = uid ? await getUsuario(uid) : null;
  if (!user || user.estado !== 'ACTIVO') throw new ApiError('SESSION_REQUIRED', 'Tu sesión venció; entra de nuevo con tu usuario de Silogtran.', { status: 401 });
  return user;
}
