const $ = (s, r = document) => r.querySelector(s);
const ESTADOS = { PENDIENTE: 'Pendiente', PROCESANDO: 'Procesando…', IGNORADA: 'Ignorada', LISTA: 'Lista', REVISAR: 'Revisar', APROBADA: 'Aprobada', ERROR: 'Error' };
const st = { lotes: [], loteId: null, actas: [], sel: new Set(), cur: null, acta: null, tab: 'datos' };

async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({ ok: false, message: 'Respuesta inesperada del servidor.' }));
  if (r.status === 401 && j.code === 'SESSION_REQUIRED') { showLogin(); throw new Error(j.message); }
  if (!r.ok || j.ok === false) throw new Error(j.message || 'Error inesperado.');
  return j;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ---------- login ---------- */
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; }
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('#loginError').textContent = ''; $('#loginBtn').disabled = true;
  try { const f = new FormData(e.target); await api('/api/auth/login', { method: 'POST', body: { usuario: f.get('usuario'), clave: f.get('clave') } }); e.target.reset(); await start(); }
  catch (err) { $('#loginError').textContent = err.message; } finally { $('#loginBtn').disabled = false; }
});
$('#xlsBtn').addEventListener('click', async () => {
  try {
    const r = await fetch('/api/actas/reporte');
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'No se pudo generar el reporte.');
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob());
    a.download = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')?.[1] || 'reporte_actas.xlsx'; a.click();
  } catch (e) { alert(e.message); }
});
$('#logout').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); showLogin(); });

async function start() {
  const me = await api('/api/auth/me'); $('#who').textContent = me.usuario;
  $('#login').hidden = true; $('#app').hidden = false;
  await cargarLotes();
}

/* ---------- lotes / lista ---------- */
async function cargarLotes(select) {
  st.lotes = (await api('/api/lotes/listar')).lotes;
  st.loteId = select ?? st.loteId ?? st.lotes[0]?.id ?? null;
  $('#lotes').innerHTML = st.lotes.map((l) => `<option value="${l.id}" ${l.id === st.loteId ? 'selected' : ''}>Lote ${l.id} · ${esc(l.usuario)} · ${l.aprobadas || 0}/${l.total}</option>`).join('') || '<option>Sin lotes</option>';
  await cargarActas();
}
$('#lotes').addEventListener('change', (e) => { st.loteId = Number(e.target.value); st.sel.clear(); st.cur = null; $('#review').innerHTML = '<p class="empty">Elige una remesa de la lista para revisarla.</p>'; cargarActas(); });

async function cargarActas() {
  st.actas = st.loteId ? (await api(`/api/lotes/ver?id=${st.loteId}`)).actas : [];
  pintarLista();
}
function pintarLista() {
  $('#lista').innerHTML = st.actas.map((a) => `<li data-id="${a.id}" class="${a.id === st.cur ? 'cur' : ''}">
    <input type="checkbox" ${st.sel.has(a.id) ? 'checked' : ''} aria-label="Seleccionar">
    <div class="meta"><b>${esc(a.remesa)}</b><span>${esc(a.consecutivo || 'sin número aún')}${a.tipo ? ' · ' + esc(a.tipo) : ''}${a.mensaje_error ? ' · ' + esc(a.mensaje_error) : ''}</span></div>
    <span class="chip ${a.estado}">${ESTADOS[a.estado]}</span></li>`).join('');
  $('#selAll').checked = st.actas.length > 0 && st.actas.every((a) => st.sel.has(a.id));
}
$('#lista').addEventListener('click', (e) => {
  const li = e.target.closest('li'); if (!li) return; const id = Number(li.dataset.id);
  if (e.target.matches('input')) { e.target.checked ? st.sel.add(id) : st.sel.delete(id); $('#selAll').checked = st.actas.every((a) => st.sel.has(a.id)); return; }
  abrir(id);
});
$('#selAll').addEventListener('change', (e) => { st.sel = new Set(e.target.checked ? st.actas.map((a) => a.id) : []); pintarLista(); });

/* ---------- nuevo lote ---------- */
$('#nuevoBtn').addEventListener('click', () => { $('#nuevoMsg').textContent = ''; $('#nuevoTxt').value = ''; $('#nuevoFile').value = ''; $('#nuevo').showModal(); });
$('#nuevoFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', raw: true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
    const h = rows[0].map((x) => String(x).trim().toLowerCase());
    const ir = h.indexOf('remesa'); const hasH = ir >= 0;
    $('#nuevoTxt').value = rows.slice(hasH ? 1 : 0).map((r) => String(hasH ? r[ir] : r[0]).trim()).filter(Boolean).join('\n');
  } catch { $('#nuevoMsg').textContent = 'No se pudo leer ese archivo.'; }
});
$('#nuevoForm').addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'ok') return; e.preventDefault();
  const items = $('#nuevoTxt').value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => ({ remesa: l.split(/[;,\t ]+/)[0] }));
  try {
    const r = await api('/api/lotes/crear', { method: 'POST', body: { items } }); $('#nuevo').close();
    if (r.duplicadas.length) alert(`${r.duplicadas.length} remesa(s) ya existían en otro lote y se omitieron: ${r.duplicadas.map((x) => x.remesa).join(', ')}`);
    await cargarLotes(r.loteId);
  } catch (err) { $('#nuevoMsg').textContent = err.message; }
});

/* ---------- procesar / aprobar / zip ---------- */
function progreso(n, total, txt) { const p = $('#progress'); p.hidden = n >= total && !txt; p.querySelector('div').style.width = `${(100 * n) / (total || 1)}%`; p.querySelector('span').textContent = txt ?? `${n} / ${total}`; }
async function pool(ids, n, fn) { let i = 0, hechos = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < ids.length) { const id = ids[i++]; await fn(id).catch(() => {}); progreso(++hechos, ids.length); } })); }

$('#procBtn').addEventListener('click', async () => {
  const ids = st.actas.filter((a) => ['PENDIENTE', 'ERROR'].includes(a.estado) && (!st.sel.size || st.sel.has(a.id))).map((a) => a.id);
  if (!ids.length) return alert('No hay remesas pendientes por procesar.');
  $('#procBtn').disabled = true; progreso(0, ids.length);
  await pool(ids, 2, async (id) => { const a = st.actas.find((x) => x.id === id); a.estado = 'PROCESANDO'; pintarLista(); try { await api('/api/actas/procesar', { method: 'POST', body: { id } }); } finally { await cargarActas(); } });
  $('#procBtn').disabled = false; progreso(1, 1, 'Listo');
  await cargarLotes(st.loteId);
});
$('#aprobBtn').addEventListener('click', async () => {
  const ids = st.actas.filter((a) => st.sel.has(a.id) && a.estado === 'LISTA').map((a) => a.id);
  if (!ids.length) return alert('Selecciona remesas en estado «Lista». Las que tienen alertas («Revisar») se aprueban una por una.');
  if (!confirm(`¿Aprobar ${ids.length} remesa(s) sin alertas?`)) return;
  const r = await api('/api/actas/aprobar', { method: 'POST', body: { ids } }); if (r.errores?.length) alert(r.errores.map((e) => e.mensaje).join('\n')); await cargarLotes(st.loteId);
});
$('#zipBtn').addEventListener('click', async () => {
  const sel = st.actas.filter((a) => st.sel.has(a.id) && a.estado === 'APROBADA');
  if (!sel.length) return alert('Selecciona remesas aprobadas para descargar.');
  if (sel.length === 1) { location.href = `/api/actas/pdf?id=${sel[0].id}`; return; }
  const zip = new JSZip(); let fallos = 0;
  $('#zipBtn').disabled = true; progreso(0, sel.length);
  await pool(sel.map((a) => a.id), 3, async (id) => {
    const r = await fetch(`/api/actas/pdf?id=${id}`); if (!r.ok) { fallos++; throw new Error(); }
    const nombre = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')?.[1] || `${id}.pdf`; zip.file(nombre, await r.blob());
  });
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `actas_lote_${st.loteId}.zip`; a.click();
  $('#zipBtn').disabled = false; progreso(1, 1, fallos ? `Listo (${fallos} fallaron)` : 'Listo');
});

/* ---------- revisión ---------- */
const GENERALES = [['fechaActa', 'Fecha del acta (dd/mm/aaaa)'], ['ordenCompleta', 'Orden de compra'], ['fechaServicio', 'Fecha de inicio y terminación']];
const LINEA = [['linea', 'Línea'], ['descripcion', 'Descripción', 'area'], ['cantidadOrden', 'Cantidad de la orden'], ['cantidadFacturada', 'Cantidad facturada'], ['valorUnitario', 'Valor unitario'], ['valorTotal', 'Valor total facturado', 'ro']];
const lineasDe = (d) => d.lineas ?? [{ linea: d.linea, descripcion: d.descripcion, cantidadOrden: d.cantidadOrden, cantidadFacturada: d.cantidadFacturada, valorUnitario: d.valorUnitario, valorTotal: d.valorTotal }];
const campo = (name, titulo, tipo, valor, mal) => `<label class="${mal ? 'bad' : ''}">${titulo}${tipo === 'area' ? `<textarea name="${name}" rows="3">${esc(valor)}</textarea>` : `<input name="${name}" value="${esc(valor)}" ${tipo === 'ro' ? 'readonly' : ''}>`}</label>`;
// Plain map of every editable value (names: field, or l<i>.field for order lines); used to detect edits and to build the payload.
const aplanar = (d) => ({ ...Object.fromEntries([...GENERALES.map(([k]) => k), 'objeto', 'adjuntos'].filter((k) => k in d).map((k) => [k, d[k]])), ...Object.fromEntries(lineasDe(d).flatMap((l, i) => LINEA.map(([k]) => [`l${i}.${k}`, l[k]]))) });
function desaplanar(m) {
  const d = Object.fromEntries(Object.entries(m).filter(([k]) => !k.includes('.')));
  d.lineas = []; for (const [k, v] of Object.entries(m)) { const x = /^l(\d+)\.(.+)$/.exec(k); if (x) (d.lineas[+x[1]] ??= {})[x[2]] = v; }
  return d;
}
const PAGINA = (campo, p = {}) => (/^(remesa|placa_remesa)/.test(campo) ? p.remesa : /^(bill|placa)/.test(campo) ? p.bill : /^(orden_numero|lineas_orden|linea)/.test(campo) ? p.orden : null);

async function abrir(id, { pagina } = {}) {
  st.cur = id; pintarLista();
  const { acta } = await api(`/api/actas/obtener?id=${id}`); st.acta = acta;
  const rv = $('#review');
  if (acta.estado === 'ERROR') { rv.innerHTML = `<p class="empty">${esc(acta.mensaje_error || 'Error al procesar.')}<br><br><button id="reint">Reintentar</button></p>`; $('#reint').onclick = async () => { await api('/api/actas/procesar', { method: 'POST', body: { id } }); await cargarActas(); abrir(id); }; return; }
  if (acta.estado === 'IGNORADA') { rv.innerHTML = `<p class="empty">${esc(acta.mensaje_error)}<br><span class="muted small">No se genera acta para esta remesa. Si crees que es un error de lectura, puedes procesarla de nuevo.</span><br><br><button id="reint">Procesar de nuevo</button></p>`; $('#reint').onclick = async () => { await api('/api/actas/procesar', { method: 'POST', body: { id } }); await cargarActas(); abrir(id); }; return; }
  if (!acta.datos) { rv.innerHTML = `<p class="empty">${acta.estado === 'PENDIENTE' ? 'Aún no se ha procesado. Usa «Procesar pendientes».' : 'Esta remesa no tiene datos para el acta; revisa las alertas.'}${acta.alertas.length ? '<ul class="alerts">' + acta.alertas.map((a) => `<li>${esc(a.mensaje)}</li>`).join('') + '</ul>' : ''}</p>`; return; }
  const pg = acta.lectura?.paginas || {}; const malos = new Set(acta.alertas.map((a) => a.campo));
  rv.innerHTML = `<div class="split">
    <iframe id="pdfv" title="Soporte de Silogtran" src="/api/actas/soporte?id=${id}#page=${pagina || 1}&view=FitH"></iframe>
    <div class="panel">
      <div class="tabs"><button data-t="datos" class="${st.tab === 'datos' ? 'on' : ''}">Datos</button><button data-t="acta" class="${st.tab === 'acta' ? 'on' : ''}">Vista previa del acta</button></div>
      <div class="pane" id="pane"></div>
      <div class="actions"><span class="chip ${acta.estado}">${ESTADOS[acta.estado]}</span><span class="muted small">${acta.aprobado_por_usuario ? 'Aprobó ' + esc(acta.aprobado_por_usuario) : ''}</span><span class="grow"></span>
        <button id="gBtn">Guardar</button><button id="aBtn" class="primary" title="Ctrl+Enter">${acta.estado === 'APROBADA' ? 'Aprobada ✓' : 'Aprobar y siguiente'}</button></div>
    </div></div>`;
  const pane = $('#pane');
  const pintaPane = () => {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === st.tab));
    if (st.tab === 'acta') { pane.innerHTML = `<p class="muted small">Así saldrá el acta en el PDF (las firmas van en blanco). Se genera al abrir esta pestaña…</p><iframe title="Vista previa del acta" src="/api/actas/vistapdf?id=${id}&t=${Date.now()}#view=FitH&toolbar=1"></iframe>`; return; }
    pane.innerHTML = (acta.alertas.length ? `<ul class="alerts">${acta.alertas.map((a, i) => `<li data-i="${i}" title="Ver en el soporte">⚠ ${esc(a.mensaje)}</li>`).join('')}</ul>` : '<p class="muted">Sin alertas: las dos lecturas coinciden y las validaciones pasaron.</p>') +
      `<div class="form" id="form"><label>Consecutivo del acta (se asigna solo al aprobar)<input value="${esc(acta.datos.consecutivo || '')}" readonly></label>${GENERALES.map(([k, t]) => campo(k, t, '', acta.datos[k], malos.has('orden_numero') && k === 'ordenCompleta')).join('')}${'objeto' in acta.datos ? campo('objeto', 'Objeto del servicio (opcional; queda en blanco si no lo escribes)', 'area', acta.datos.objeto) : ''}${lineasDe(acta.datos).map((l, i) => `<fieldset><legend>Línea ${esc(l.linea)} de la orden de compra</legend>${LINEA.map(([k, t, tipo]) => campo(`l${i}.${k}`, t, tipo, l[k], (malos.has('linea') || malos.has('lineas_orden')) && k !== 'valorTotal')).join('')}</fieldset>`).join('')}${campo('adjuntos', 'Documentos adjuntos', 'area', acta.datos.adjuntos)}</div>`;
    pane.querySelectorAll('.alerts li').forEach((li) => li.addEventListener('click', () => { const p = PAGINA(acta.alertas[li.dataset.i].campo, pg); if (p) $('#pdfv').src = `/api/actas/soporte?id=${id}&t=${Date.now()}#page=${p}&view=FitH`; }));
  };
  const actual = () => Object.fromEntries([...document.querySelectorAll('#form [name]')].map((i) => [i.name, i.value]));
  const cambiado = () => { const o = aplanar(acta.datos); return Object.entries(actual()).some(([k, v]) => !k.endsWith('.valorTotal') && String(o[k] ?? '') !== v); };
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.t === 'acta' && st.tab === 'datos' && cambiado()) { // the preview shows what is saved: save the edits first
      try { await api('/api/actas/guardar', { method: 'POST', body: { id, datos: leer() } }); await cargarActas(); st.tab = 'acta'; return abrir(id); } catch (e) { alert(e.message); return; }
    }
    st.tab = b.dataset.t; pintaPane();
  }));
  pintaPane();
  const leer = () => desaplanar(actual());
  $('#gBtn').onclick = async () => { try { if (st.tab === 'datos') await api('/api/actas/guardar', { method: 'POST', body: { id, datos: leer() } }); await cargarActas(); abrir(id); } catch (e) { alert(e.message); } };
  $('#aBtn').onclick = async () => { try { if (st.tab === 'datos') await api('/api/actas/guardar', { method: 'POST', body: { id, datos: leer() } }); const r = await api('/api/actas/aprobar', { method: 'POST', body: { ids: [id] } }); if (r.errores?.length) { alert(r.errores[0].mensaje); return; } await cargarActas(); siguiente(1); } catch (e) { alert(e.message); } };
}
function siguiente(d) {
  const i = st.actas.findIndex((a) => a.id === st.cur); const n = st.actas.slice(i + d)[d > 0 ? 'find' : 'findLast']?.((a) => a.estado !== 'APROBADA' || d < 0);
  if (n) abrir(n.id);
}
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Enter') { $('#aBtn')?.click(); }
  else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); siguiente(1); }
  else if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); siguiente(-1); }
});

api('/api/auth/me').then(start).catch(showLogin);
