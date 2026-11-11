const $ = (s) => document.querySelector(s);
const CAMPOS = [['contratista', 'Contratista'], ['objeto', 'Objeto del servicio'], ['empresaNombre', 'Empresa (en el texto)'], ['empresaSigla', 'Sigla de la empresa'], ['contrato', 'Contrato (DCI)'], ['afe', 'AFE'], ['sede', 'Sede'], ['supervisor', 'Supervisor / solicitante'], ['planeador', 'Planeador'], ['comprador', 'Comprador'], ['repContratista', 'Representante del contratista'], ['cedulaContratista', 'Cédula del representante'], ['repDrummond', 'Representante de Drummond'], ['nombreFirmaContratista', 'Nombre bajo la firma']];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const h = () => ({ 'content-type': 'application/json', 'x-admin-key': $('#clave').value });
async function api(path, body) {
  const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: h(), body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.message || 'Error inesperado.');
  return j;
}
async function cargar() {
  $('#msg').textContent = '';
  try {
    const c = await api('/api/admin/config');
    $('#imgs').hidden = false; $('#logoSt').textContent = c.logo ? '✓ Logo cargado' : 'Sin logo'; $('#firmaSt').textContent = c.firma ? '✓ Firma cargada' : 'Sin firma';
    $('#tipos').innerHTML = c.tipos.map((t) => `<form class="card" style="width:auto" data-tipo="${t.tipo}"><h2>${t.tipo}</h2>${CAMPOS.map(([k, l]) => `<label>${l}<input name="${k}" value="${esc(t[k])}"></label>`).join('')}<div class="row"><span class="muted small"></span><button class="primary">Guardar ${t.tipo}</button></div></form>`).join('') || '<p class="muted">No hay tipos cargados todavía.</p>';
  } catch (e) { $('#msg').textContent = e.message; }
}
$('#cargar').addEventListener('click', cargar);
$('#tipos').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target; const st = f.querySelector('span');
  try { await api('/api/admin/tipo', { tipo: f.dataset.tipo, valores: Object.fromEntries(new FormData(f)) }); st.textContent = '✓ Guardado'; } catch (err) { st.textContent = err.message; }
});
for (const campo of ['logo', 'firma']) $('#' + campo).addEventListener('change', (e) => {
  const file = e.target.files[0]; if (!file) return;
  const fr = new FileReader();
  fr.onload = async () => { try { await api('/api/admin/imagen', { campo, dataUri: fr.result }); $('#' + campo + 'St').textContent = '✓ Cargado'; } catch (err) { $('#' + campo + 'St').textContent = err.message; } };
  fr.readAsDataURL(file);
});
