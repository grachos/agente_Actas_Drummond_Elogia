import { route, body } from '../../src/http/route.js';
import { ApiError } from '../../src/http/errors.js';
import { Silogtran } from '../../src/silogtran/client.js';
import { q } from '../../src/db.js';
import { registrarIngreso } from '../../src/store/usuarios.js';
import { setSessionCookie, clearSessionCookie, requireSession } from '../../src/http/session.js';

const MAX_FALLOS = 5; // per Silogtran user in 15 minutes
const mock = () => process.env.ACTAS_MOCK === '1' && !process.env.VERCEL; // local development only

// The Silogtran password is only used to prove identity; it is neither stored nor logged.
async function verificarEnSilogtran(usuario, clave) {
  if (mock()) { if (clave !== 'demo') throw new ApiError('LOGIN_FAILED', 'Usuario o contraseña incorrectos.', { status: 401 }); return; }
  const c = new Silogtran(process.env.SILOG_BASE_URL || 'https://construproyec.colombiasoftware.net');
  try { await c.login(usuario, clave); } catch (e) {
    if (e?.name === 'SilogtranError' && e.code === 'LOGIN_FAILED') throw new ApiError('LOGIN_FAILED', 'Usuario o contraseña de Silogtran incorrectos.', { status: 401 });
    throw e;
  }
}

export default route({
  'POST:login': async (req, res) => {
    const usuario = String(body(req).usuario ?? '').trim().toLowerCase();
    const clave = String(body(req).clave ?? '');
    if (!/^[\w.@-]{2,100}$/.test(usuario) || !clave) throw new ApiError('PARAM_INVALID', 'Escribe tu usuario y contraseña de Silogtran.', { status: 400 });
    const [{ n }] = await q('SELECT COUNT(*) AS n FROM login_intentos WHERE silog_user = ? AND creado_en > NOW() - INTERVAL 15 MINUTE', [usuario]);
    if (n >= MAX_FALLOS) throw new ApiError('LOGIN_BLOCKED', 'Demasiados intentos fallidos; espera 15 minutos antes de volver a intentar.', { status: 429 });
    try { await verificarEnSilogtran(usuario, clave); } catch (e) {
      if (e?.code === 'LOGIN_FAILED') await q('INSERT INTO login_intentos (silog_user) VALUES (?)', [usuario]);
      throw e;
    }
    const u = await registrarIngreso(usuario);
    if (u.estado !== 'ACTIVO') throw new ApiError('USER_INACTIVE', 'Tu usuario está desactivado en esta aplicación.', { status: 403 });
    setSessionCookie(res, u.id);
    res.status(200).json({ ok: true, usuario: u.silog_user });
  },
  'GET:me': async (req, res) => { const u = await requireSession(req); res.status(200).json({ ok: true, usuario: u.silog_user, id: u.id }); },
  'POST:logout': async (req, res) => { clearSessionCookie(res); res.status(200).json({ ok: true }); },
});
