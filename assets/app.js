/* =============================================================
   Control de diésel — interfaz
   - Boba/cuenta litros: captura por turno o por día (cualquiera cuenta para el día)
   - Dashboard, Día, Cuenta litros, Cargas, Bitácora, Reportes, Usuarios, Ajustes
   - Importa/exporta concentrado .xlsx (formato REPORTE DIESEL)
   ============================================================= */
(function () {
  'use strict';

  /* ------------------------------ utilidades ------------------------------ */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function nf(v, d) {
    if (v == null || !isFinite(v)) return '—';
    return Number(v).toLocaleString('es-MX', {
      minimumFractionDigits: d == null ? 0 : d,
      maximumFractionDigits: d == null ? 0 : d
    });
  }
  function litros(v, d) { return v == null || !isFinite(v) ? '—' : nf(v, d == null ? 1 : d) + ' L'; }
  function parseDecimal(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).replace(/\s/g, '').replace(/,/g, '.');
    if (s === '' || s === '.') return null;
    const n = Number(s);
    return isFinite(n) ? n : null;
  }
  function parseISO(iso) { const p = String(iso).split('-').map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); }
  function isoOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function todayISO() { return isoOf(new Date()); }
  function addDays(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoOf(d); }
  function monthStart(iso) { return String(iso).slice(0, 8) + '01'; }
  function monthEnd(iso) { const d = parseISO(iso); return isoOf(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
  function fmtDate(iso, largo) {
    if (!iso) return '—';
    const p = String(iso).slice(0, 10).split('-');
    return Number(p[2]) + ' ' + (largo ? MES_LARGO[Number(p[1]) - 1] : MES[Number(p[1]) - 1]) + ' ' + p[0];
  }
  function fmtShort(iso) { if (!iso) return ''; const p = String(iso).slice(0, 10).split('-'); return p[2] + '/' + p[1]; }
  function fmtMonth(key) { const p = String(key || '').split('-'); return p[0] ? (MES[Number(p[1]) - 1] + ' ' + p[0]) : '—'; }
  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso); if (isNaN(d)) return '—';
    return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function weekday(iso) {
    return ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][parseISO(iso).getDay()];
  }
  function sum(arr, fn) { return arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0); }

  function download(filename, content, mime) {
    try {
      const blob = content instanceof Uint8Array ? new Blob([content], { type: mime || 'application/octet-stream' }) : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.rel = 'noopener';
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
      return true;
    } catch (e) { toast('No se pudo descargar el archivo.', 'err'); return false; }
  }
  function downloadCSV(filename, rows) {
    const text = '\ufeff' + rows.map((row) => row.map((cell) => {
      let s = cell == null ? '' : String(cell);
      if (/[";\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    }).join(';')).join('\r\n');
    return download(filename, text, 'text/csv;charset=utf-8');
  }
  function toast(msg, kind) {
    const el = $('#toast'); if (!el) return;
    el.textContent = msg; el.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.className = 'toast'; }, kind === 'err' ? 5200 : 3200);
  }
  function badge(text, kind) { return '<span class="badge ' + (kind || '') + '">' + esc(text) + '</span>'; }
  const ICO_EDIT = '<svg class="ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  const ICO_DEL = '<svg class="ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></svg>';
  const ICO_TOGGLE_OFF = '<svg class="ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 5h6a7 7 0 0 1 0 14H9"/><path d="M9 12H3"/></svg>';
  const ICO_TOGGLE_ON = '<svg class="ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 5h-6a7 7 0 0 0 0 14h6"/><path d="M15 12h6"/></svg>';
  function notice(html, kind) {
    return '<div class="notice ' + (kind || '') + '"><svg class="ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg><div>' + html + '</div></div>';
  }
  function kpi(label, value, sub, kind) {
    return '<div class="kpi ' + (kind || '') + '"><div class="k">' + esc(label) + '</div><div class="v">' + value + '</div><div class="s">' + esc(sub || '') + '</div></div>';
  }
  function field(label, control) { return '<div class="field"><label>' + esc(label) + '</label>' + control + '</div>'; }

  /* ------------------------------ tema (día/noche) ------------------------------ */

  function systemPrefersDark() { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; }
  function currentTheme() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t;
    return systemPrefersDark() ? 'dark' : 'light';
  }
  function applyTheme(theme, persist) {
    if (theme === 'dark' || theme === 'light') {
      document.documentElement.setAttribute('data-theme', theme);
      if (persist) { try { localStorage.setItem('diesel.theme', theme); } catch (e) {} }
    } else {
      document.documentElement.removeAttribute('data-theme');
      if (persist) { try { localStorage.removeItem('diesel.theme'); } catch (e) {} }
    }
    updateThemeIcon();
  }
  function updateThemeIcon() {
    const btn = $('#btnTheme'); const icon = $('#iconTheme');
    if (!btn || !icon) return;
    const dark = currentTheme() === 'dark';
    btn.title = dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
    btn.setAttribute('aria-label', btn.title);
    icon.innerHTML = dark
      ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
      : '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';
  }

  /* ------------------------------ usuarios / accesos ------------------------------ */

  const USERS_KEY = 'diesel.users.v1';
  function readUsers() {
    try { const raw = localStorage.getItem(USERS_KEY); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr : []; } catch (e) { return []; }
  }
  function writeUsers(arr) { try { localStorage.setItem(USERS_KEY, JSON.stringify(arr)); } catch (e) {} }
  function blankUser() { return { id: '', nombre: '', usuario: '', rol: 'capturista', activo: true, clave: '', notas: '' }; }
  function ensureDraftUser() { if (!ui.draftUser) ui.draftUser = blankUser(); return ui.draftUser; }
  function hashClave(str) {
    let h = 2166136261; const s = String(str || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'h' + (h >>> 0).toString(16);
  }
  function saveUserFromForm() {
    const form = $('#userForm'); if (!form) return;
    const e = form.elements;
    const nombre = String(e.nombre.value || '').trim();
    const usuario = String(e.usuario.value || '').trim().toLowerCase();
    if (!nombre || !usuario) { toast('Nombre y usuario son obligatorios.', 'err'); return; }
    const users = readUsers();
    const id = ui.editUserId || ('u' + Date.now().toString(36));
    if (users.some((u) => u.usuario === usuario && u.id !== id)) { toast('Ya existe un acceso con ese usuario.', 'err'); return; }
    const prev = users.find((u) => u.id === id);
    const clave = String(e.clave.value || '');
    const rec = {
      id, nombre, usuario,
      rol: e.rol.value || 'capturista',
      activo: !!e.activo.checked,
      claveHash: clave ? hashClave(clave) : (prev && prev.claveHash) || '',
      notas: String(e.notas.value || '').trim(),
      creado: (prev && prev.creado) || new Date().toISOString(),
      actualizado: new Date().toISOString()
    };
    const idx = users.findIndex((u) => u.id === id);
    if (idx >= 0) users[idx] = rec; else users.push(rec);
    writeUsers(users);
    ui.editUserId = null; ui.draftUser = blankUser();
    toast(idx >= 0 ? 'Usuario actualizado.' : 'Usuario creado.', 'ok');
    render();
  }

  /* ------------------------------ estado de interfaz ------------------------------ */

  const TABS = ['dashboard', 'dia', 'boba', 'cargas', 'bitacora', 'bitacora-aceites', 'reportes', 'aceites', 'usuarios', 'ajustes'];
  const ACEITE_PRODUCTOS = ['Motor Shell', 'Hidráulico Shell'];
  const ui = {
    tab: 'dashboard',
    dia: todayISO(),
    bobaMes: todayISO().slice(0, 7),
    bobaFecha: todayISO(),
    bobaModo: 'turno',
    cargas: { desde: monthStart(todayISO()), hasta: monthEnd(todayISO()), q: '', categoria: '', turno: '' },
    bitacora: { desde: monthStart(todayISO()), hasta: monthEnd(todayISO()) },
    bitacoraAceites: { desde: monthStart(todayISO()), hasta: monthEnd(todayISO()) },
    rep: { desde: monthStart(todayISO()), hasta: todayISO() },
    aceites: { fecha: todayISO(), desde: monthStart(todayISO()), hasta: monthEnd(todayISO()), q: '', producto: '', vista: 'captura' },
    editCargaId: null,
    draftCarga: null,
    importPreview: null,
    importName: '',
    editAceiteId: null,
    draftAceite: null,
    aceiteImportPreview: null,
    aceiteImportName: '',
    editUserId: null,
    draftUser: null,
    ready: false
  };

  /* ------------------------------ arranque ------------------------------ */

  document.addEventListener('DOMContentLoaded', boot);

  async function boot() {
    if (/[?&]embed=1/.test(location.search) || /[?&]embed=true/.test(location.search)) document.body.classList.add('embed');
    readHash();
    bindChrome();
    ensureDraft();
    ensureDraftUser();
    ensureDraftAceite();
    updateThemeIcon();
    render();
    Store.onChange(updateStatus);
    try { await Store.init(); } catch (e) { console.warn(e); }
    ui.ready = true;
    ensureDraft(); ensureDraftUser(); ensureDraftAceite();
    render();
  }

  function readHash() { const h = location.hash.replace(/^#\/?/, '').split('?')[0]; ui.tab = TABS.indexOf(h) >= 0 ? h : 'dashboard'; }
  function go(tab) { if (location.hash !== '#/' + tab) location.hash = '#/' + tab; else { ui.tab = tab; render(); } }

  function bindChrome() {
    window.addEventListener('hashchange', () => { readHash(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    $('#statusChip').addEventListener('click', () => go('ajustes'));
    const themeBtn = $('#btnTheme');
    if (themeBtn) themeBtn.addEventListener('click', () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true));
    if (window.matchMedia) { try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateThemeIcon); } catch (e) {} }

    let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { markScrollables(); if (ui.tab === 'reportes') drawReportCharts(); if (ui.tab === 'dashboard') drawDashboardCharts(); if (ui.tab === 'aceites') drawAceitesCharts(); }, 150); });

    $('#btnSync').addEventListener('click', async () => {
      const btn = $('#btnSync'); btn.disabled = true;
      try {
        const res = await Store.sync();
        if (res && res.pushed === null) toast('Datos compartidos actualizados desde GitHub.', 'ok');
        else {
          const changed = res && res.pushed ? res.pushed.changed : 0;
          toast(changed ? 'Sincronizado · ' + changed + ' cambio(s) enviados' : 'Sincronizado · sin cambios pendientes', 'ok');
        }
      } catch (err) { toast(err.message || 'No se pudo sincronizar', 'err'); }
      finally { btn.disabled = false; render(); }
    });

    const view = $('#view');
    view.addEventListener('click', onClick);
    view.addEventListener('input', onInput);
    view.addEventListener('change', onChange);
    view.addEventListener('submit', (e) => {
      const form = e.target; if (!form) return; e.preventDefault();
      if (form.dataset.shift) saveShift(form);
      else if (form.dataset.bobaDay) saveBobaDay(form);
      else if (form.id === 'cargaForm') saveCargaForm();
      else if (form.dataset.aceiteMeter) saveAceiteMeter(form);
      else if (form.id === 'aceiteForm') saveAceiteForm();
      else if (form.id === 'userForm') saveUserFromForm();
      else if (form.id === 'cfgForm') saveCfgForm();
      else if (form.id === 'remoteForm') saveRemoteForm();
    });
  }

  function updateStatus() {
    const st = Store.getState(); const chip = $('#statusChip'); const text = $('#statusText'); if (!chip) return;
    let cls = 'chip', label = 'Solo local', title = 'Los datos se guardan solo en este navegador';
    if (st.syncing) { cls += ' warn'; label = 'Sincronizando…'; title = 'Conectando con GitHub'; }
    else if (st.demo) { cls += ' warn'; label = 'Datos de ejemplo'; title = 'Borra el ejemplo para empezar a capturar'; }
    else if (st.source === 'github-readonly') { cls += st.lastError ? ' err' : ' ok'; label = 'GitHub · solo lectura'; title = st.lastError || 'Datos compartidos desde GitHub. Configura un token en Ajustes para poder guardar.'; }
    else if (!Store.isRemoteReady()) { cls += ' warn'; label = 'Solo local'; title = 'Configura el repositorio y el token en Ajustes para guardar en GitHub'; }
    else if (st.pending.length) { cls += ' warn'; label = st.pending.length + ' pendiente' + (st.pending.length === 1 ? '' : 's'); title = 'Cambios sin enviar a GitHub'; }
    else if (st.lastError) { cls += ' err'; label = 'Error de sync'; title = st.lastError; }
    else { cls += ' ok'; label = 'GitHub al día'; title = 'Última sincronización: ' + (st.lastSync ? fmtDateTime(st.lastSync) : '—'); }
    chip.className = cls; text.textContent = label; chip.title = title;
    const syncBtn = $('#btnSync'); if (syncBtn) syncBtn.disabled = st.syncing || st.demo;
    const footLeft = $('#footLeft');
    if (footLeft) {
      if (Store.isRemoteReady()) footLeft.textContent = 'Repositorio: ' + st.remote.owner + '/' + st.remote.repo + ' · último cambio ' + (st.lastSync ? fmtDateTime(st.lastSync) : '—');
      else if (st.source === 'github-readonly') footLeft.textContent = 'Datos compartidos desde GitHub · solo lectura · actualizado ' + (st.lastSync ? fmtDateTime(st.lastSync) : '—');
      else if (st.demo) footLeft.textContent = 'Datos de ejemplo · no se sincronizan';
      else footLeft.textContent = 'Modo local · los datos viven en este navegador';
    }
    const link = $('#repoLink');
    if (link) { const url = Store.repoUrl(); link.hidden = !url; if (url) link.href = url; }
    const sub = $('#brandSub'); if (sub) sub.textContent = (Store.getConfig().empresa || 'Mi Empresa') + ' · boba y cargas';
  }

  function render() {
    updateStatus();
    if (!ui.draftCarga) ensureDraft();
    if (!ui.draftUser) ensureDraftUser();
    if (!ui.draftAceite) ensureDraftAceite();
    $$('#tabs a').forEach((a) => { if (a.dataset.tab === ui.tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const view = $('#view');
    if (ui.tab === 'dashboard') view.innerHTML = viewDashboard();
    else if (ui.tab === 'dia') view.innerHTML = viewDia();
    else if (ui.tab === 'boba') view.innerHTML = viewBoba();
    else if (ui.tab === 'cargas') view.innerHTML = viewCargas();
    else if (ui.tab === 'bitacora') view.innerHTML = viewBitacora();
    else if (ui.tab === 'bitacora-aceites') view.innerHTML = viewBitacoraAceites();
    else if (ui.tab === 'reportes') view.innerHTML = viewReportes();
    else if (ui.tab === 'usuarios') view.innerHTML = viewUsuarios();
    else if (ui.tab === 'aceites') view.innerHTML = viewAceites();
    else view.innerHTML = viewAjustes();
    if (ui.tab === 'dashboard') drawDashboardCharts();
    if (ui.tab === 'reportes') drawReportCharts();
    if (ui.tab === 'aceites' && (!ui.aceites.vista || ui.aceites.vista === 'dashboard' || ui.aceites.vista === 'captura')) drawAceitesCharts();
    markScrollables();
    wireDropZone();
  }

  function markScrollables() {
    $$('.tablewrap', $('#view')).forEach((w) => {
      const on = w.scrollWidth > w.clientWidth + 4;
      w.parentElement && w.parentElement.querySelectorAll(':scope > .scroll-hint').forEach((h) => { h.hidden = !on; });
    });
  }

  /* ------------------------------ datos derivados (boba/cargas) ------------------------------ */

  function chargesOf(fecha, turno) { return Store.getCharges().filter((c) => c.fecha === fecha && (!turno || c.turno === turno)); }
  function prevFinal(fecha, turno) {
    const all = Store.getBoba().filter((b) => b.final != null);
    const cands = all.filter((b) => b.fecha < fecha || (b.fecha === fecha && String(b.turno) !== 'D' && String(turno) !== 'D' && Number(b.turno) < Number(turno)));
    cands.sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.turno).localeCompare(String(b.turno)));
    return cands.length ? Number(cands[cands.length - 1].final) : null;
  }

  function dayTotals(fecha) {
    const cargas = chargesOf(fecha);
    const info = Store.bobaDayInfo ? Store.bobaDayInfo(fecha) : (function () {
      const list = Store.getBoba().filter((b) => b.fecha === fecha);
      const closed = list.filter((b) => b.litros != null);
      return { fecha, day: null, shifts: list, total: closed.length ? sum(closed, (b) => b.litros) : null, fuente: closed.length ? 'turnos' : 'sin datos', lecturas: closed.length, tieneDato: closed.length > 0 };
    })();
    const list = Store.getBoba().filter((b) => b.fecha === fecha);
    const totalCargas = sum(cargas, (c) => c.litros);
    const tieneDato = info.total != null;
    return {
      boba: list, info, cargas,
      totalBoba: tieneDato ? info.total : 0,
      totalCargas,
      diff: tieneDato ? info.total - totalCargas : 0,
      lecturas: list.filter((b) => b.litros != null).length,
      tieneDato,
      fuente: info.fuente || 'sin datos'
    };
  }

  function dailyRange(desde, hasta) {
    const out = [];
    if (!desde || !hasta || desde > hasta) return out;
    let d = desde, n = 0;
    while (d <= hasta && n < 400) {
      const t = dayTotals(d);
      const hasDay = !!(t.info && t.info.day && t.info.day.litros != null);
      const hasShifts = t.boba.some((b) => b.turno !== 'D' && b.litros != null);
      let estado = 'Sin datos';
      if (!t.tieneDato && !t.cargas.length) estado = 'Sin datos';
      else if (t.tieneDato && t.cargas.length) estado = Math.abs(t.totalBoba - t.totalCargas) <= 1 ? 'Cuadra' : 'Diferencia';
      else if (t.tieneDato) estado = hasDay ? 'Capturado (día)' : (hasShifts ? 'Capturado (turnos)' : 'Incompleto');
      else if (t.boba.length) estado = 'En curso';
      else estado = 'Sin boba';
      out.push({
        fecha: d,
        boba: t.tieneDato ? t.totalBoba : null,
        cargas: t.cargas.length ? t.totalCargas : null,
        diff: t.tieneDato ? t.totalBoba - t.totalCargas : null,
        n: t.cargas.length,
        lecturas: t.lecturas,
        tieneDato: t.tieneDato,
        fuente: t.fuente,
        estado
      });
      d = addDays(d, 1); n++;
    }
    return out;
  }

  /* ------------------------------ Dashboard ------------------------------ */

  function viewDashboard() {
    const hoy = todayISO();
    const mesDesde = monthStart(hoy), mesHasta = monthEnd(hoy);
    const d7 = addDays(hoy, -6);
    const tHoy = dayTotals(hoy);
    const dailyMes = dailyRange(mesDesde, mesHasta);
    const daily7 = dailyRange(d7, hoy);
    const chargesMes = Store.getCharges().filter((c) => c.fecha >= mesDesde && c.fecha <= mesHasta);
    const bobaMes = Store.getBoba().filter((b) => b.fecha >= mesDesde && b.fecha <= mesHasta);
    const totalCargasMes = sum(chargesMes, (c) => c.litros);
    const diasConBoba = dailyMes.filter((d) => d.tieneDato);
    const totalBobaMes = sum(diasConBoba, (d) => d.boba);
    const diffMes = totalBobaMes - totalCargasMes;
    const sinLectura = dailyMes.filter((d) => !d.tieneDato && d.n > 0).length;
    const a7 = computeAnalytics(Store.getCharges().filter((c) => c.fecha >= d7 && c.fecha <= hoy), Store.getBoba().filter((b) => b.fecha >= d7 && b.fecha <= hoy), daily7);

    return '' +
      '<div class="stack">' +
        '<section class="card">' +
          '<div class="card-head"><div><h2>Dashboard</h2><p>Resumen operativo de diésel y cuenta litros</p></div>' +
            '<div class="row"><button class="btn ghost sm" type="button" data-act="goto" data-tab="dia">Capturar día</button><button class="btn ghost sm" type="button" data-act="goto" data-tab="boba">Cuenta litros</button></div></div>' +
          '<div class="kpis">' +
            kpi('Boba hoy', litros(tHoy.tieneDato ? tHoy.totalBoba : null), 'Fuente: ' + tHoy.fuente, tHoy.tieneDato ? 'good' : '') +
            kpi('Cargas hoy', litros(tHoy.cargas.length ? tHoy.totalCargas : null), tHoy.cargas.length + ' cargas', '') +
            kpi('Diferencia hoy', tHoy.tieneDato ? (tHoy.diff > 0 ? '+' : '') + litros(tHoy.diff) : '—', 'boba - cargas', tHoy.tieneDato && Math.abs(tHoy.diff) > 1 ? 'bad' : 'good') +
            kpi('Boba mes', litros(diasConBoba.length ? totalBobaMes : null), diasConBoba.length + ' días con lectura', '') +
            kpi('Cargas mes', litros(totalCargasMes || null), chargesMes.length + ' renglones', '') +
            kpi('Diferencia mes', diasConBoba.length ? (diffMes > 0 ? '+' : '') + litros(diffMes) : '—', nf(sinLectura) + ' días con cargas sin boba', sinLectura ? 'bad' : 'good') +
            kpi('Promedio diario (7d)', litros(a7.promDia || null, 1), a7.daysWith + ' días con actividad', '') +
            kpi('Día pico (7d)', a7.pico ? litros(a7.pico.cargas, 1) : '—', a7.pico ? fmtDate(a7.pico.fecha) : 'Sin datos', '') +
          '</div>' +
        '</section>' +

        '<section class="card">' +
          '<div class="card-head"><div><h2>Tendencia últimos 7 días</h2><p>Barras: litros cargados · Línea: litros boba (por día o por turnos)</p></div></div>' +
          '<div id="dashTrend"></div>' +
        '</section>' +

        '<section class="card">' +
          '<div class="card-head"><div><h2>Distribución del mes</h2><p>Consumo por categoría y por turno (' + esc(fmtMonth(mesDesde.slice(0,7))) + ')</p></div></div>' +
          '<div class="grid cols-2">' +
            '<div><h3 style="font-size:13px;margin:0 0 8px;color:var(--muted)">Por categoría</h3><div id="dashCat"></div></div>' +
            '<div><h3 style="font-size:13px;margin:0 0 8px;color:var(--muted)">Por turno</h3><div id="dashTurno"></div></div>' +
          '</div>' +
        '</section>' +

        '<section class="card">' +
          '<div class="card-head"><div><h2>Top equipos y departamentos (mes)</h2><p>Mayores consumos del periodo</p></div></div>' +
          '<div class="grid cols-2">' +
            '<div><h3 style="font-size:13px;margin:0 0 8px;color:var(--muted)">Top equipos</h3><div id="dashEquipos"></div></div>' +
            '<div><h3 style="font-size:13px;margin:0 0 8px;color:var(--muted)">Departamentos</h3><div id="dashDepto"></div></div>' +
          '</div>' +
        '</section>' +

        '<section class="card">' +
          '<div class="card-head"><div><h2>Estado reciente (7 días)</h2><p>Cuenta litros considerado por día (por turno o por día) vs cargas</p></div></div>' +
          (daily7.length ? '<div class="tablewrap"><table><thead><tr><th>Fecha</th><th class="num">Boba</th><th>Fuente</th><th class="num">Cargas</th><th class="num">Diferencia</th><th>Estado</th></tr></thead><tbody>' +
            daily7.map((d) => '<tr><td><strong>' + esc(fmtShort(d.fecha)) + '</strong></td><td class="num">' + (d.boba == null ? '—' : nf(d.boba,1)) + '</td><td>' + esc(d.fuente || '—') + '</td><td class="num">' + (d.cargas == null ? '—' : nf(d.cargas,1)) + '</td><td class="num ' + (d.diff == null ? '' : Math.abs(d.diff) <= 1 ? 'pos' : 'neg') + '">' + (d.diff == null ? '—' : (d.diff>0?'+':'') + nf(d.diff,1)) + '</td><td>' + badge(d.estado, d.estado === 'Cuadra' ? 'ok' : d.estado.indexOf('Capturado')===0 ? 'ok' : d.estado === 'Sin datos' ? '' : 'warn') + '</td></tr>').join('') +
          '</tbody></table></div>' : '<div class="empty"><h3>Sin datos recientes</h3></div>') +
        '</section>' +
      '</div>';
  }

  function drawDashboardCharts() {
    const hoy = todayISO();
    const d7 = addDays(hoy, -6);
    const mesDesde = monthStart(hoy), mesHasta = monthEnd(hoy);
    const daily7 = dailyRange(d7, hoy);
    const chargesMes = Store.getCharges().filter((c) => c.fecha >= mesDesde && c.fecha <= mesHasta);
    const bobaMes = Store.getBoba().filter((b) => b.fecha >= mesDesde && b.fecha <= mesHasta);
    const aMes = computeAnalytics(chargesMes, bobaMes, dailyRange(mesDesde, mesHasta));

    DieselCharts.combo($('#dashTrend'), {
      labels: daily7.map((d) => fmtShort(d.fecha)),
      bars: daily7.map((d) => d.cargas == null ? 0 : d.cargas),
      line: daily7.map((d) => d.boba == null ? null : d.boba),
      barUnit: 'L cargados', lineUnit: 'L boba', aria: 'Tendencia últimos 7 días'
    });
    DieselCharts.barh($('#dashCat'), { labels: aMes.byCat.map((x) => x.label), values: aMes.byCat.map((x) => x.value), unit: 'L', aria: 'Consumo por categoría (mes)' });
    DieselCharts.donut($('#dashTurno'), { labels: aMes.byTurno.map((x) => 'Turno ' + x.label), values: aMes.byTurno.map((x) => x.value), unit: 'L', colors: ['#f59e0b', '#0ea5e9', '#8b5cf6'], aria: 'Distribución por turno (mes)' });
    DieselCharts.barh($('#dashEquipos'), { labels: aMes.topEquipos.map((x) => x.label), values: aMes.topEquipos.map((x) => x.value), unit: 'L', colors: ['#0ea5e9','#38bdf8','#7dd3fc','#f59e0b','#fbbf24','#22c55e','#8b5cf6','#ef4444','#14b8a6','#eab308'], aria: 'Top equipos (mes)' });
    DieselCharts.barh($('#dashDepto'), { labels: aMes.byDepto.map((x) => x.label), values: aMes.byDepto.map((x) => x.value), unit: 'L', colors: ['#22c55e','#4ade80','#0ea5e9','#8b5cf6','#f59e0b','#ef4444'], aria: 'Consumo por departamento (mes)' });
  }

  /* ------------------------------ vista Día (detalle) ------------------------------ */

  function bobaDayCard(fecha, rec, cargaDia, cfg) {
    const boba = rec && rec.litros != null ? rec.litros : null;
    const diff = boba == null ? null : boba - cargaDia;
    const state = !rec ? badge('Sin captura por día', 'warn') : rec.litros == null && rec.inicial != null ? badge('En curso (día)', '') : badge('Registrado (día)', 'ok');
    const prev = prevFinal(fecha, '1');
    const iniVal = (rec && rec.inicial != null) ? rec.inicial : (prev != null ? prev : '');
    return '' +
      '<article class="shift' + (rec ? ' done' : '') + '">' +
        '<header class="shift-head"><div><h3>Cuenta litros por día</h3><p>Inicial y final del día completo</p></div>' + state + '</header>' +
        '<form data-boba-day="1" data-cargas="' + cargaDia + '" data-fecha="' + esc(fecha) + '" novalidate>' +
          (rec ? '<input type="hidden" name="id" value="' + esc(rec.id) + '">' : '') +
          '<div class="grid cols-2">' +
            '<div class="field"><label for="iniD">Lectura inicial (día)</label><input id="iniD" name="inicial" type="number" step="any" inputmode="decimal" min="0" value="' + esc(iniVal) + '" placeholder="Ej. 125430">' +
              '<span class="hint">' + (prev != null ? 'Final del día anterior: <strong>' + nf(prev, 2) + '</strong>' + (rec && rec.inicial != null ? '' : ' (precargado)') + ' · <button class="btn link" type="button" data-act="use-prev-day">usar</button>' : 'Aún no hay lectura anterior') + '</span></div>' +
            '<div class="field"><label for="finD">Lectura final (día)</label><input id="finD" name="final" type="number" step="any" inputmode="decimal" min="0" value="' + (rec && rec.final != null ? esc(rec.final) : '') + '" placeholder="Ej. 126300"><span class="hint">Se calcula automáticamente</span></div>' +
          '</div>' +
          '<div class="calc">' +
            '<div class="calc-item"><span class="lbl">Litros del día (boba)</span><strong id="litD">' + litros(boba) + '</strong></div>' +
            '<div class="calc-item"><span class="lbl">Cargas del día</span><strong>' + litros(cargaDia) + '</strong></div>' +
            '<div class="calc-item"><span class="lbl">Diferencia</span><strong id="difD" class="' + (diff == null ? '' : Math.abs(diff) <= 1 ? 'pos' : 'neg') + '">' + (diff == null ? '—' : (diff > 0 ? '+' : '') + litros(diff)) + '</strong></div>' +
          '</div>' +
          '<div class="field"><label for="notasD">Notas (opcional)</label><input id="notasD" name="notas" maxlength="240" value="' + esc(rec && rec.notas || '') + '" placeholder="Observaciones del día"></div>' +
          '<div class="row end" style="margin-top:12px"><button class="btn" type="submit">' + (rec ? 'Actualizar registro del día' : 'Guardar registro del día') + '</button></div>' +
        '</form></article>';
  }

  function shiftCard(turno, rec, cargaTurno, cfg) {
    const prev = turno === '1' ? prevFinal(ui.dia, '1') : ((Store.bobaFor(ui.dia, '1') || {}).final != null ? Number(Store.bobaFor(ui.dia, '1').final) : prevFinal(ui.dia, '2'));
    const iniVal = (rec && rec.inicial != null) ? rec.inicial : (prev != null ? prev : '');
    const boba = rec && rec.litros != null ? rec.litros : null;
    const diff = boba == null ? null : boba - cargaTurno;
    const state = !rec ? badge('Pendiente', 'warn') : rec.litros == null && rec.inicial != null ? badge('En curso', '') : badge('Registrado', 'ok');
    return '' +
      '<article class="shift' + (rec ? ' done' : '') + '">' +
        '<header class="shift-head"><div><h3>Turno ' + turno + '</h3><p>12 horas</p></div>' + state + '</header>' +
        '<form data-shift="' + turno + '" data-cargas="' + cargaTurno + '" data-fecha="' + esc(ui.dia) + '" novalidate>' +
          (rec ? '<input type="hidden" name="id" value="' + esc(rec.id) + '">' : '') +
          '<div class="grid cols-2">' +
            '<div class="field"><label for="ini' + turno + '">Lectura inicial</label><input id="ini' + turno + '" name="inicial" type="number" step="any" inputmode="decimal" min="0" value="' + esc(iniVal) + '" placeholder="Ej. 125430">' +
              '<span class="hint">' + (prev != null ? ((turno === '1' ? 'Final del día anterior' : 'Lectura anterior') + ': <strong>' + nf(prev, 2) + '</strong>' + (rec && rec.inicial != null ? '' : ' (precargado)') + ' · <button class="btn link" type="button" data-act="use-prev" data-turno="' + turno + '">usar</button>') : 'Aún no hay lectura anterior') + '</span></div>' +
            '<div class="field"><label for="fin' + turno + '">Lectura final</label><input id="fin' + turno + '" name="final" type="number" step="any" inputmode="decimal" min="0" value="' + (rec && rec.final != null ? esc(rec.final) : '') + '" placeholder="Ej. 126100"><span class="hint">Se calcula automáticamente</span></div>' +
          '</div>' +
          '<div class="calc">' +
            '<div class="calc-item"><span class="lbl">Litros del turno</span><strong id="lit' + turno + '">' + litros(boba) + '</strong></div>' +
            '<div class="calc-item"><span class="lbl">Cargas del turno</span><strong>' + litros(cargaTurno) + '</strong></div>' +
            '<div class="calc-item"><span class="lbl">Diferencia</span><strong id="dif' + turno + '" class="' + (diff == null ? '' : Math.abs(diff) <= 1 ? 'pos' : 'neg') + '">' + (diff == null ? '—' : (diff > 0 ? '+' : '') + litros(diff)) + '</strong></div>' +
          '</div>' +
          '<div class="field"><label for="notas' + turno + '">Notas (opcional)</label><input id="notas' + turno + '" name="notas" maxlength="240" value="' + esc(rec && rec.notas || '') + '" placeholder="Observaciones del turno"></div>' +
          '<div class="row end" style="margin-top:12px"><button class="btn ghost sm" type="button" data-act="use-prev" data-turno="' + turno + '">Usar final anterior</button><button class="btn" type="submit">' + (rec ? 'Actualizar turno' : 'Guardar turno') + '</button></div>' +
        '</form></article>';
  }

  function dayChargesCard(fecha, cargas) {
    const rows = cargas.slice().sort((a, b) => a.equipo.localeCompare(b.equipo));
    return '' +
      '<section class="card">' +
        '<div class="card-head"><div><h2>Cargas del día</h2><p>Consumo registrado por equipo y turno</p></div><button class="btn sm" type="button" data-act="new-carga">Registrar carga</button></div>' +
        (rows.length
          ? '<div class="tablewrap"><table><thead><tr><th>Equipo</th><th>Cat.</th><th>Turno</th><th class="num">Litros</th><th>Operador</th><th>Folio</th><th></th></tr></thead><tbody>' +
            rows.map((c) => '<tr><td><strong>' + esc(c.equipo) + '</strong><div class="muted" style="font-size:11.5px">' + esc(c.departamento || '') + '</div></td><td>' + badge(c.categoria || '—', '') + '</td><td>' + esc(c.turno) + '</td><td class="num">' + nf(c.litros, 1) + '</td><td>' + esc(c.operador || '—') + '</td><td class="mono">' + esc(c.folio || '—') + '</td><td class="actions"><button class="btn icon" type="button" data-act="edit-carga" data-id="' + esc(c.id) + '" title="Editar">' + ICO_EDIT + '</button><button class="btn icon del" type="button" data-act="del-carga" data-id="' + esc(c.id) + '" title="Eliminar">' + ICO_DEL + '</button></td></tr>').join('') +
            '</tbody><tfoot><tr><td colspan="3"><strong>Total</strong></td><td class="num"><strong>' + nf(sum(rows, (c) => c.litros), 1) + '</strong></td><td colspan="3"></td></tr></tfoot></table></div>'
          : '<div class="empty"><h3>Sin cargas este día</h3><p>Registra los litros entregados a cada equipo o importa el concentrado.</p></div>') +
      '</section>';
  }

  function viewDia() {
    const cfg = Store.getConfig();
    const fecha = ui.dia;
    const t = dayTotals(fecha);
    const cargasT1 = sum(chargesOf(fecha, '1'), (c) => c.litros);
    const cargasT2 = sum(chargesOf(fecha, '2'), (c) => c.litros);
    const dayRec = Store.bobaFor(fecha, 'D');
    return '' +
      '<div class="stack">' +
        '<section class="card">' +
          '<div class="card-head"><div><h2>Registro del día</h2><p>Cuenta litros por turno o por día completo (cualquiera se toma en cuenta para el día)</p></div>' +
            '<div class="row"><button class="btn ghost sm" type="button" data-act="prev-day" title="Día anterior">←</button><input type="date" id="diaInput" value="' + esc(fecha) + '" aria-label="Fecha"><button class="btn ghost sm" type="button" data-act="next-day" title="Día siguiente">→</button><button class="btn ghost sm" type="button" data-act="today">Hoy</button></div></div>' +
          '<p class="muted" style="margin:-4px 0 12px">' + esc(fmtDate(fecha, true)) + ' · ' + esc(weekday(fecha)) + ' · ' + badge('Fuente boba del día: ' + esc(t.fuente), t.tieneDato ? 'ok' : 'warn') + '</p>' +
          (Store.isDemo() ? notice('Estás viendo datos de ejemplo. Ve a <a href="#/ajustes">Ajustes</a> para borrarlos y capturar los reales.', 'warn') : '') +
          notice('Puedes capturar <strong>por turnos</strong> o <strong>por día</strong>. Lo que registres se considera en el total del día y se especifica en Cuenta litros.', '') +
          '<div style="margin-top:12px">' + bobaDayCard(fecha, dayRec, t.totalCargas, cfg) + '</div>' +
          '<div class="day-grid" style="margin-top:12px">' + shiftCard('1', t.boba.find((b) => b.turno === '1') || null, cargasT1, cfg) + shiftCard('2', t.boba.find((b) => b.turno === '2') || null, cargasT2, cfg) + '</div>' +
        '</section>' +
        '<section class="card"><div class="card-head"><div><h2>Resumen del día</h2><p>Boba considerada contra cargas registradas</p></div></div>' +
          '<div class="kpis">' +
            kpi('Litros boba (día)', litros(t.tieneDato ? t.totalBoba : null), 'Fuente: ' + t.fuente, '') +
            kpi('Litros cargados', litros(t.cargas.length ? t.totalCargas : null), t.cargas.length + ' carga' + (t.cargas.length === 1 ? '' : 's'), '') +
            kpi('Diferencia', t.tieneDato ? (t.diff > 0 ? '+' : '') + litros(t.diff) : '—', 'boba - cargas', t.tieneDato && Math.abs(t.diff) > Math.max(1, Math.abs(t.totalBoba) * 0.01) ? 'bad' : 'good') +
            kpi('Registros boba', nf(t.lecturas), 'turnos/día con lectura', t.tieneDato ? 'good' : '') +
          '</div></section>' +
        dayChargesCard(fecha, t.cargas) +
      '</div>';
  }

  /* ------------------------------ Cuenta litros (boba) ------------------------------ */

  function viewBoba() {
    const mes = ui.bobaMes;
    const desde = mes + '-01';
    const hasta = monthEnd(desde);
    const fecha = ui.bobaFecha || todayISO();
    const cfg = Store.getConfig();
    const all = Store.getBoba().filter((b) => b.fecha >= desde && b.fecha <= hasta);
    const cargasMes = Store.getCharges().filter((c) => c.fecha >= desde && c.fecha <= hasta);
    const fechas = Array.from(new Set(all.map((b) => b.fecha).concat(cargasMes.map((c) => c.fecha)))).sort();

    let totalBoba = 0, totalCargasMes = 0, lecturas = 0, diasConDato = 0, diasSinLectura = 0;
    const rowsDia = fechas.map((f) => {
      const info = Store.bobaDayInfo(f);
      const cargas = Store.getCharges().filter((c) => c.fecha === f);
      const cargaTotal = sum(cargas, (c) => c.litros);
      totalCargasMes += cargaTotal;
      if (info.tieneDato) { totalBoba += info.total; diasConDato++; }
      lecturas += (info.day && info.day.litros != null ? 1 : 0) + info.shifts.filter((x) => x.litros != null).length;
      if (!info.tieneDato && cargas.length) diasSinLectura++;
      const diff = info.tieneDato ? info.total - cargaTotal : null;
      return { fecha: f, info, cargaTotal, diff, n: cargas.length };
    });

    const t = dayTotals(fecha);
    const cargasT1 = sum(chargesOf(fecha, '1'), (c) => c.litros);
    const cargasT2 = sum(chargesOf(fecha, '2'), (c) => c.litros);
    const dayRec = Store.bobaFor(fecha, 'D');

    return '' +
      '<div class="stack">' +
        '<section class="card">' +
          '<div class="card-head"><div><h2>Cuenta litros</h2><p>Registra por <strong>turno</strong> o por <strong>día</strong>. Cualquier captura se toma en cuenta para el día y se especifica aquí.</p></div>' +
            '<div class="row"><input type="month" id="bobaMes" value="' + esc(mes) + '" aria-label="Mes"></div></div>' +
          '<div class="kpis">' +
            kpi('Litros boba (mes)', litros(diasConDato ? totalBoba : null), diasConDato + ' días con lectura · ' + lecturas + ' registros', '') +
            kpi('Litros cargados', litros(totalCargasMes || null), cargasMes.length + ' cargas', '') +
            kpi('Diferencia', diasConDato ? (totalBoba - totalCargasMes > 0 ? '+' : '') + litros(totalBoba - totalCargasMes) : '—', 'boba - cargas', diasConDato && Math.abs(totalBoba - totalCargasMes) > Math.max(1, totalBoba * 0.01) ? 'bad' : 'good') +
            kpi('Días sin lectura', nf(diasSinLectura), 'con cargas pero sin boba', diasSinLectura ? 'bad' : 'good') +
          '</div>' +
        '</section>' +

        '<section class="card">' +
          '<div class="card-head"><div><h2>Capturar cuenta litros</h2><p>Elige fecha y modo de captura (por turno o por día)</p></div></div>' +
          '<div class="filters">' +
            field('Fecha', '<input type="date" id="bobaFecha" value="' + esc(fecha) + '">') +
            field('Modo de captura', '<select id="bobaModo"><option value="turno"' + (ui.bobaModo === 'turno' ? ' selected' : '') + '>Por turno (inicial/final de cada turno)</option><option value="dia"' + (ui.bobaModo === 'dia' ? ' selected' : '') + '>Por día (inicial/final del día)</option></select>') +
            '<div class="field"><label>Estado del día</label><div style="padding-top:6px">' + badge('Fuente: ' + esc(t.fuente), t.tieneDato ? 'ok' : 'warn') + '</div></div>' +
          '</div>' +
          '<div class="divider"></div>' +
          notice('Se toma en cuenta para el día <strong>cualquier</strong> captura disponible: registro por día o suma de turnos. Cada entrada se especifica en el listado.', '') +
          '<div style="margin-top:14px">' +
            (ui.bobaModo === 'dia'
              ? bobaDayCard(fecha, dayRec, t.totalCargas, cfg)
              : '<div class="day-grid">' + shiftCard('1', t.boba.find((b) => b.turno === '1') || null, cargasT1, cfg) + shiftCard('2', t.boba.find((b) => b.turno === '2') || null, cargasT2, cfg) + '</div>') +
          '</div>' +
          '<div class="kpis" style="margin-top:14px">' +
            kpi('Boba considerada (día)', litros(t.tieneDato ? t.totalBoba : null), 'Fuente: ' + t.fuente, '') +
            kpi('Cargas del día', litros(t.cargas.length ? t.totalCargas : null), t.cargas.length + ' cargas', '') +
            kpi('Diferencia', t.tieneDato ? (t.diff > 0 ? '+' : '') + litros(t.diff) : '—', 'boba - cargas', t.tieneDato && Math.abs(t.diff) > Math.max(1, Math.abs(t.totalBoba) * 0.01) ? 'bad' : 'good') +
          '</div>' +
        '</section>' +

        '<section class="card">' +
          '<div class="card-head"><div><h2>Lecturas de ' + esc(fmtMonth(mes)) + '</h2><p>Especifica si cada registro es por día o por turno; el total diario considera lo capturado</p></div></div>' +
          (rowsDia.length
            ? '<p class="scroll-hint" hidden>Desliza para ver más columnas — </p><div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th class="num">Inicial</th><th class="num">Final</th><th class="num">Litros</th><th class="num">Cargas día</th><th class="num">Dif.</th><th>Fuente día</th><th></th></tr></thead><tbody>' +
              rowsDia.map((r) => {
                const info = r.info;
                const recs = [];
                if (info.day) recs.push(Object.assign({ _tipo: 'Día' }, info.day));
                info.shifts.forEach((sh) => recs.push(Object.assign({ _tipo: 'Turno ' + sh.turno }, sh)));
                if (!recs.length) {
                  return '<tr><td><strong>' + esc(fmtShort(r.fecha)) + '</strong></td><td>' + badge('Sin lectura', 'warn') + '</td><td class="muted">—</td><td class="num mono">—</td><td class="num mono">—</td><td class="num">—</td><td class="num">' + nf(r.cargaTotal, 1) + '</td><td class="num">—</td><td>' + badge(r.n ? 'Sin boba' : 'Sin datos', r.n ? 'warn' : '') + '</td><td class="actions"><button class="btn icon" type="button" data-act="goto-boba-fecha" data-fecha="' + esc(r.fecha) + '" title="Capturar">' + ICO_EDIT + '</button></td></tr>';
                }
                return recs.map((b, idx) => {
                  const showDay = idx === 0;
                  const cargaComp = b.turno === 'D' ? r.cargaTotal : sum(chargesOf(r.fecha, b.turno), (c) => c.litros);
                  const d = b.litros == null ? null : b.litros - cargaComp;
                  return '<tr>' +
                    (showDay ? '<td rowspan="' + recs.length + '"><strong>' + esc(fmtShort(r.fecha)) + '</strong><div class="muted" style="font-size:11px">' + esc(weekday(r.fecha).slice(0,3)) + '</div></td>' : '') +
                    '<td>' + badge(b._tipo, b.turno === 'D' ? 'ok' : '') + '</td>' +
                    '<td>' + esc(b.turno === 'D' ? 'Registro diario' : ('Turno ' + b.turno + ' (12 h)')) + '</td>' +
                    '<td class="num mono">' + (b.inicial == null ? '—' : nf(b.inicial, 2)) + '</td>' +
                    '<td class="num mono">' + (b.final == null ? '—' : nf(b.final, 2)) + '</td>' +
                    '<td class="num"><strong>' + (b.litros == null ? '—' : nf(b.litros, 1)) + '</strong></td>' +
                    '<td class="num">' + nf(cargaComp, 1) + '</td>' +
                    '<td class="num ' + (d == null ? '' : Math.abs(d) <= 1 ? 'pos' : 'neg') + '">' + (d == null ? '—' : (d > 0 ? '+' : '') + nf(d, 1)) + '</td>' +
                    (showDay ? '<td rowspan="' + recs.length + '">' + badge(info.fuente, info.tieneDato ? 'ok' : 'warn') + '<div class="muted" style="font-size:11px;margin-top:2px">' + (info.tieneDato ? 'Considerado: ' + nf(info.total, 1) + ' L' : '—') + '</div></td>' : '') +
                    '<td class="actions"><button class="btn icon" type="button" data-act="goto-boba-fecha" data-fecha="' + esc(r.fecha) + '" title="Editar">' + ICO_EDIT + '</button><button class="btn icon del" type="button" data-act="del-boba" data-id="' + esc(b.id) + '" title="Eliminar">' + ICO_DEL + '</button></td>' +
                  '</tr>';
                }).join('');
              }).join('') +
              '</tbody><tfoot><tr><td colspan="5"><strong>Total mes (considerado por día)</strong></td><td class="num"><strong>' + nf(totalBoba, 1) + '</strong></td><td class="num"><strong>' + nf(totalCargasMes, 1) + '</strong></td><td class="num"><strong>' + nf(totalBoba - totalCargasMes, 1) + '</strong></td><td colspan="2"></td></tr></tfoot></table></div>'
            : '<div class="empty"><h3>Sin lecturas en ' + esc(fmtMonth(mes)) + '</h3><p>Usa el formulario superior para capturar por día o por turno.</p></div>') +
        '</section>' +
      '</div>';
  }

  /* ------------------------------ Cargas ------------------------------ */

  function ensureDraft(fecha) { if (!ui.draftCarga) ui.draftCarga = blankCarga(fecha); return ui.draftCarga; }
  function blankCarga(fecha) {
    const cfg = Store.getConfig(); const cat = (cfg.categorias && cfg.categorias[0]) || { id: 'EDM' };
    return { fecha: fecha || todayISO(), turno: '1', categoria: cat.id, equipo: '', horometro: '', litros: '', departamento: '', operador: '', responsable: (cfg.responsables && cfg.responsables[0]) || '', folio: '', ubicacion: (cfg.ubicaciones && cfg.ubicaciones[0]) || '', notas: '' };
  }
  function selectCategorias(value, vacio) {
    const cats = Store.getConfig().categorias || [];
    return '<select name="categoria">' + (vacio ? '<option value="">Todas</option>' : '') + cats.map((c) => '<option value="' + esc(c.id) + '"' + (c.id === value ? ' selected' : '') + '>' + esc(c.id) + (c.nombre ? ' · ' + esc(c.nombre) : '') + '</option>').join('') + '</select>';
  }
  function selectTurnos(value, vacio) {
    return '<select name="turno">' + (vacio ? '<option value="">Todos</option>' : '') + ['1','2','3'].map((t) => '<option value="' + t + '"' + (String(value) === t ? ' selected' : '') + '>Turno ' + t + '</option>').join('') + '</select>';
  }

  function viewCargas() {
    const cfg = Store.getConfig(); const f = ui.cargas;
    const all = Store.getCharges().filter((c) => {
      if (c.fecha < f.desde || c.fecha > f.hasta) return false;
      if (f.categoria && c.categoria !== f.categoria) return false;
      if (f.turno && c.turno !== f.turno) return false;
      if (f.q) { const q = f.q.toLowerCase(); const hay = [c.equipo,c.operador,c.folio,c.departamento,c.responsable].join(' ').toLowerCase(); if (hay.indexOf(q) === -1) return false; }
      return true;
    }).sort((a,b) => b.fecha.localeCompare(a.fecha) || Number(a.turno)-Number(b.turno) || a.equipo.localeCompare(b.equipo));

    const d = ensureDraft(); const editando = !!ui.editCargaId;
    return '' +
      '<div class="stack">' +
        '<section class="card"><div class="card-head"><div><h2>' + (editando ? 'Editar carga' : 'Nueva carga') + '</h2><p>Litros entregados a un equipo en un turno</p></div>' + (editando ? '<button class="btn ghost sm" type="button" data-act="cancel-edit">Cancelar edición</button>' : '') + '</div>' +
          (!cfg.equipos.length ? notice('El catálogo de equipos está vacío. Puedes capturar el nombre a mano o cargarlo en <a href="#/ajustes">Ajustes</a>.', 'warn') : '') +
          '<form id="cargaForm" novalidate><div class="grid cols-4">' +
            field('Fecha','<input type="date" name="fecha" required value="' + esc(d.fecha) + '">') +
            field('Turno', selectTurnos(d.turno)) +
            field('Categoría', selectCategorias(d.categoria)) +
            field('Equipo','<input name="equipo" list="equiposList" required value="' + esc(d.equipo) + '" placeholder="Ej. ST-41"><datalist id="equiposList">' + (cfg.equipos||[]).map((e)=>'<option value="' + esc(e.id) + '">' + esc([e.categoria,e.departamento].filter(Boolean).join(' · ')) + '</option>').join('') + '</datalist>') +
          '</div><div class="grid cols-4" style="margin-top:12px">' +
            field('Horómetro','<input name="horometro" value="' + esc(d.horometro) + '" placeholder="Número o X">') +
            field('Litros','<input name="litros" type="number" step="any" min="0.01" required value="' + esc(d.litros) + '" placeholder="0.0">') +
            field('Departamento','<input name="departamento" list="deptosList" value="' + esc(d.departamento) + '"><datalist id="deptosList">' + (cfg.departamentos||[]).map((x)=>'<option value="'+esc(x)+'">').join('') + '</datalist>') +
            field('Operador','<input name="operador" list="opsList" value="' + esc(d.operador) + '"><datalist id="opsList">' + (cfg.operadores||[]).map((x)=>'<option value="'+esc(x)+'">').join('') + '</datalist>') +
          '</div><div class="grid cols-4" style="margin-top:12px">' +
            field('Responsable','<input name="responsable" list="respList" value="' + esc(d.responsable) + '"><datalist id="respList">' + (cfg.responsables||[]).map((x)=>'<option value="'+esc(x)+'">').join('') + '</datalist>') +
            field('Folio','<input name="folio" value="' + esc(d.folio) + '">') +
            field('Ubicación T.','<input name="ubicacion" list="ubiList" value="' + esc(d.ubicacion) + '"><datalist id="ubiList">' + (cfg.ubicaciones||[]).map((x)=>'<option value="'+esc(x)+'">').join('') + '</datalist>') +
            field('Notas','<input name="notas" maxlength="240" value="' + esc(d.notas) + '">') +
          '</div><div class="row end" style="margin-top:14px"><button class="btn ' + (editando?'accent':'') + '" type="submit">' + (editando?'Guardar cambios':'Agregar carga') + '</button></div></form></section>' +

        '<section class="card"><div class="card-head"><div><h2>Cargas registradas</h2><p>' + all.length + ' renglón' + (all.length===1?'':'es') + ' · ' + litros(sum(all,(c)=>c.litros)) + '</p></div></div>' +
          '<div class="filters" id="filtrosCargas">' +
            field('Desde','<input type="date" name="desde" value="' + esc(f.desde) + '">') +
            field('Hasta','<input type="date" name="hasta" value="' + esc(f.hasta) + '">') +
            field('Categoría', selectCategorias(f.categoria,true)) +
            field('Turno', selectTurnos(f.turno,true)) +
            field('Buscar','<input type="search" name="q" value="' + esc(f.q) + '" placeholder="Equipo, operador, folio…">') +
          '</div>' +
          (all.length
            ? '<p class="scroll-hint" hidden>Desliza para ver más columnas — </p><div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>Fecha</th><th>Turno</th><th>Equipo</th><th>Cat.</th><th class="num">Horóm.</th><th class="num">Litros</th><th>Departamento</th><th>Operador</th><th>Folio</th><th></th></tr></thead><tbody>' +
              all.slice(0,400).map((c)=>'<tr><td class="mono">' + esc(fmtShort(c.fecha)) + '</td><td>' + esc(c.turno) + '</td><td><strong>' + esc(c.equipo) + '</strong></td><td>' + badge(c.categoria||'—','') + '</td><td class="num mono">' + esc(c.horometro==null?'—':c.horometro) + '</td><td class="num"><strong>' + nf(c.litros,1) + '</strong></td><td>' + esc(c.departamento||'—') + '</td><td>' + esc(c.operador||'—') + '</td><td class="mono">' + esc(c.folio||'—') + '</td><td class="actions"><button class="btn icon" type="button" data-act="edit-carga" data-id="' + esc(c.id) + '" title="Editar">' + ICO_EDIT + '</button><button class="btn icon del" type="button" data-act="del-carga" data-id="' + esc(c.id) + '" title="Eliminar">' + ICO_DEL + '</button></td></tr>').join('') +
              '</tbody><tfoot><tr><td colspan="5"><strong>Total filtrado</strong></td><td class="num"><strong>' + nf(sum(all,(c)=>c.litros),1) + '</strong></td><td colspan="4"></td></tr></tfoot></table></div>' +
              (all.length>400 ? '<p class="muted" style="margin-top:8px">Se muestran los primeros 400 renglones. Ajusta el rango o usa la búsqueda.</p>' : '')
            : '<div class="empty"><h3>Sin cargas en el rango</h3><p>Agrega una carga arriba o cambia los filtros.</p></div>') +
        '</section></div>';
  }

  /* ------------------------------ Bitácora (concentrado) ------------------------------ */

  function viewBitacoraAceites() {
    const desde = ui.bitacoraAceites.desde, hasta = ui.bitacoraAceites.hasta;
    return '' +
      '<div class="stack">' +
        '<section class="card no-print"><div class="card-head"><div><h2>Bitácora de aceites</h2><p>Registros de contadores de aceites cotejados con salidas por día y producto (independiente del diésel).</p></div></div>' +
          '<div class="filters">' + field('Desde','<input type="date" name="bitAceiteDesde" value="' + esc(desde) + '">') + field('Hasta','<input type="date" name="bitAceiteHasta" value="' + esc(hasta) + '">') +
            '<div class="field"><label>Atajos</label><div class="row"><button class="btn ghost sm" type="button" data-act="quick-range" data-range="mes">Este mes</button><button class="btn ghost sm" type="button" data-act="quick-range" data-range="mes-pasado">Mes pasado</button><button class="btn ghost sm" type="button" data-act="quick-range" data-range="30">30 días</button></div></div></div>' +
          '<div class="divider"></div><div class="row"><button class="btn accent" type="button" data-act="export-bitacora-aceites-xlsx" title="Exportar el periodo a Excel (salidas y cuenta litros)">Exportar Excel</button><button class="btn accent" type="button" data-act="pdf-aceites" title="Generar reporte PDF avanzado de aceites">Reporte PDF aceites</button><button class="btn ghost" type="button" data-act="print-report">Imprimir / PDF</button></div>' +
        '</section>' +
        aceitesCountersBitacoraHtml(desde, hasta) +
      '</div>';
  }


  function viewBitacora() {
    const cfg = Store.getConfig(); const desde = ui.bitacora.desde; const hasta = ui.bitacora.hasta;
    const charges = Store.getCharges().filter((c) => c.fecha >= desde && c.fecha <= hasta).sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.categoria.localeCompare(b.categoria)||a.equipo.localeCompare(b.equipo)||Number(a.turno)-Number(b.turno));
    const boba = Store.getBoba().filter((b) => b.fecha >= desde && b.fecha <= hasta);
    const totalLitros = sum(charges, (c) => c.litros);
    const daily = dailyRange(desde, hasta);
    const totalBoba = sum(daily.filter((d)=>d.tieneDato), (d)=>d.boba);
    const sumT = { '1':0,'2':0,'3':0 }; charges.forEach((c)=>{ sumT[c.turno]=(sumT[c.turno]||0)+Number(c.litros||0); });
    function fmtNum(n){ return nf(n, Number.isInteger(Number(n)) ? 0 : 1); }

    return '' +
      '<div class="stack">' +
        '<section class="card no-print"><div class="card-head"><div><h2>Bitácora del concentrado</h2><p>Todo el concentrado en formato de reporte. Importa y exporta el mismo Excel (.xlsx).</p></div></div>' +
          '<div class="filters">' + field('Desde','<input type="date" name="bitDesde" value="' + esc(desde) + '">') + field('Hasta','<input type="date" name="bitHasta" value="' + esc(hasta) + '">') +
            '<div class="field"><label>Atajos</label><div class="row"><button class="btn ghost sm" type="button" data-act="quick-range" data-range="mes">Este mes</button><button class="btn ghost sm" type="button" data-act="quick-range" data-range="mes-pasado">Mes pasado</button><button class="btn ghost sm" type="button" data-act="quick-range" data-range="30">30 días</button></div></div></div>' +
          '<div class="divider"></div><div class="row"><button class="btn accent" type="button" data-act="export-xlsx">Exportar concentrado (.xlsx)</button><button class="btn ghost" type="button" data-act="export-csv">Exportar CSV</button><button class="btn ghost" type="button" data-act="print-report">Imprimir / PDF</button><button class="btn accent" type="button" data-act="pdf-diesel" title="Generar reporte PDF avanzado de diésel">Reporte PDF diésel</button></div></section>' +
        '<section class="card no-print"><div class="card-head"><div><h2>Importar concentrado de diésel</h2><p>Sube el archivo Excel del concentrado (hoja REPORTE DIESEL). También lee CUENTA LITROS si existe.</p></div></div>' +
          '<div class="dropzone" id="dropZone"><input type="file" id="fileImport" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden><p><strong>Elige un archivo</strong> o arrástralo aquí</p><button class="btn ghost" type="button" data-act="pick-file">Elegir archivo .xlsx</button></div>' +
          (ui.importPreview ? importPreviewHtml() : '') + '</section>' +
        '<section class="card"><div class="card-head"><div><h2>REPORTE DIESEL</h2><p>' + esc(cfg.tituloBitacora||'Bitácora consumo diésel') + ' · ' + esc(fmtDate(desde)) + ' a ' + esc(fmtDate(hasta)) + '</p></div><div class="row">' + badge(charges.length+' renglones','') + badge(litros(totalLitros),'ok') + '</div></div>' +
          '<div class="kpis">' + kpi('Cargas', nf(charges.length), 'renglones del periodo','') + kpi('Total turnos', litros(totalLitros), 'litros cargados','') + kpi('Litros boba', litros(totalBoba||null), 'considerado por día','') + kpi('Diferencia', (totalBoba-totalLitros>0?'+':'')+litros(totalBoba-totalLitros), 'boba - cargas', Math.abs(totalBoba-totalLitros)>Math.max(1,totalBoba*0.01)?'bad':'good') + '</div>' +
          '<div style="margin-top:14px">' + (charges.length
            ? '<p class="scroll-hint" hidden>Desliza para ver más columnas — </p><div class="tablewrap"><table><thead><tr><th>Categoria</th><th>Equipo</th><th class="num">Horometro</th><th>Fecha</th><th class="num">Turno 1</th><th class="num">Turno 2</th><th class="num">Turno 3</th><th class="num">Total Turnos</th><th>Departamento</th><th>Operador</th><th>Responsable</th><th>Folio</th><th>Ubicacion T.</th></tr></thead><tbody>' +
              charges.map((c)=>{ const t1=c.turno==='1'?c.litros:0,t2=c.turno==='2'?c.litros:0,t3=c.turno==='3'?c.litros:0; return '<tr><td>'+esc(c.categoria||'')+'</td><td><strong>'+esc(c.equipo||'')+'</strong></td><td class="num mono">'+esc(c.horometro==null?'':c.horometro)+'</td><td class="mono">'+esc(fmtShort(c.fecha))+'</td><td class="num">'+(t1?fmtNum(t1):'')+'</td><td class="num">'+(t2?fmtNum(t2):'')+'</td><td class="num">'+(t3?fmtNum(t3):'')+'</td><td class="num"><strong>'+fmtNum(c.litros)+'</strong></td><td>'+esc(c.departamento||'')+'</td><td>'+esc(c.operador||'')+'</td><td>'+esc(c.responsable||'')+'</td><td class="mono">'+esc(c.folio||'')+'</td><td>'+esc(c.ubicacion||'')+'</td></tr>'; }).join('') +
              '</tbody><tfoot><tr><td colspan="4"><strong>TOTAL</strong></td><td class="num"><strong>'+nf(sumT['1']||0,1)+'</strong></td><td class="num"><strong>'+nf(sumT['2']||0,1)+'</strong></td><td class="num"><strong>'+nf(sumT['3']||0,1)+'</strong></td><td class="num"><strong>'+nf(totalLitros,1)+'</strong></td><td colspan="5"></td></tr></tfoot></table></div>'
            : '<div class="empty"><h3>Sin renglones en el periodo</h3><p>Importa el Excel del concentrado o cambia el rango de fechas.</p><div class="row" style="justify-content:center;margin-top:12px"><button class="btn" type="button" data-act="pick-file">Importar Excel</button></div></div>') + '</div></section>' +
        dieselCountersBitacoraHtml(desde, hasta) +
      '</div>';
  }

  function dieselCountersBitacoraHtml(desde, hasta) {
    const days = dailyRange(desde, hasta);
    const rows = days.map(d => {
      const bobaRec = Store.getBoba().filter(b=>b.fecha===d.fecha).sort((a,b)=>String(a.turno).localeCompare(String(b.turno)));
      const lecturas = bobaRec.length ? bobaRec.map(b=> (b.turno==='D'?'Día':'T'+b.turno)+': '+(b.inicial==null?'—':nf(b.inicial,2))+' —  '+(b.final==null?'—':nf(b.final,2))+' = '+(b.litros==null?'—':nf(b.litros,2)+' L')).join('<br>') : '—';
      const salidas = d.cargas==null ? null : d.cargas;
      const contador = d.boba==null ? null : d.boba;
      const diff = (contador==null || salidas==null) ? null : contador - salidas;
      const estado = !bobaRec.length ? badge('Sin contador','warn') : (salidas==null ? badge('Sin salidas','warn') : (Math.abs(diff||0) <= 1 ? badge('Cuadra','ok') : badge('Diferencia','bad')));
      return '<tr><td class="mono">'+esc(fmtShort(d.fecha))+'</td><td>'+lecturas+'</td><td class="num">'+(contador==null?'—':nf(contador,2))+'</td><td class="num">'+(salidas==null?'—':nf(salidas,2))+'</td><td class="num"><strong>'+ (diff==null?'—':((diff>0?'+':'')+nf(diff,2))) +'</strong></td><td>'+estado+'</td></tr>';
    }).join('');
    const totalContador = sum(days.filter(d=>d.boba!=null),(d)=>d.boba);
    const totalSalidas = sum(days.filter(d=>d.cargas!=null),(d)=>d.cargas);
    const totalDiff = totalContador - totalSalidas;
    return '<section class="card"><div class="card-head"><div><h2>Bitácora de contadores (diésel) y cotejo con salidas</h2><p>Registros de cuenta litros vs cargas/salidas por día · ' + esc(fmtDate(desde)) + ' a ' + esc(fmtDate(hasta)) + '</p></div></div>' +
      '<div class="kpis">' + kpi('Total contador', litros(totalContador||null), 'litros por cuenta litros','') + kpi('Total salidas/cargas', litros(totalSalidas||null), 'litros cargados','') + kpi('Diferencia global', (totalDiff>0?'+':'')+nf(totalDiff,2)+' L', 'contador - salidas', Math.abs(totalDiff)>1?'bad':'good') + kpi('Días con lectura', days.filter(d=>d.boba!=null).length, 'en el periodo','') + '</div>' +
      '<div style="margin-top:14px"><p class="scroll-hint" hidden>Desliza para ver más columnas — </p><div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Lecturas contador (inicial —  final = litros)</th><th class="num">Contador (L)</th><th class="num">Salidas (L)</th><th class="num">Diferencia (L)</th><th>Estado</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="6">Sin datos</td></tr>') +
      '</tbody><tfoot><tr><td><strong>TOTAL</strong></td><td></td><td class="num"><strong>'+nf(totalContador,2)+'</strong></td><td class="num"><strong>'+nf(totalSalidas,2)+'</strong></td><td class="num"><strong>'+((totalDiff>0?'+':'')+nf(totalDiff,2))+'</strong></td><td></td></tr></tfoot></table></div></div></section>';
  }

  function aceitesCountersBitacoraHtml(desde, hasta) {
    if (!desde || !hasta || desde > hasta) return '';
    const canon = (v) => Store.canonProductoAceite ? Store.canonProductoAceite(v) : v;
    const allMeters = Store.getAceiteMeters().filter(r => r.fecha >= desde && r.fecha <= hasta && r.litros != null);
    const allDispatches = Store.getAceiteDispatches().filter(r => r.fecha >= desde && r.fecha <= hasta);
    const periodo = esc(fmtDate(desde)) + ' a ' + esc(fmtDate(hasta));

    const products = ACEITE_PRODUCTOS.map((prod) => {
      const meters = allMeters.filter(r => canon(r.producto) === prod);
      const dispatches = allDispatches.filter(r => canon(r.tipoAceite) === prod);
      const recByDate = new Map();
      meters.forEach(r => { if (r.litros != null) recByDate.set(r.fecha, r); });
      const salByDate = new Map();
      dispatches.forEach(r => { const arr = salByDate.get(r.fecha) || []; arr.push(r); salByDate.set(r.fecha, arr); });

      let rows = '', d = desde, n = 0;
      while (d <= hasta && n < 400) {
        const rec = recByDate.get(d) || null;
        const salidasArr = salByDate.get(d) || [];
        if (rec || salidasArr.length) {
          const salidas = sum(salidasArr, r => r.litros);
          const contador = rec && rec.litros != null ? Number(rec.litros) : null;
          const diff = contador == null ? null : contador - salidas;
          const estado = contador == null ? badge('Sin contador', 'warn') : (Math.abs(diff) <= 1 ? badge('Cuadra', 'ok') : badge('Diferencia', 'bad'));
          rows += '<tr><td class="mono">' + esc(fmtShort(d)) + '</td>' +
            '<td class="num">' + (rec && rec.inicial != null ? nf(rec.inicial, 2) : '—') + '</td>' +
            '<td class="num">' + (rec && rec.final != null ? nf(rec.final, 2) : '—') + '</td>' +
            '<td class="num">' + (contador == null ? '—' : nf(contador, 2)) + '</td>' +
            '<td class="num">' + nf(salidas, 2) + '</td>' +
            '<td class="num"><strong>' + (diff == null ? '—' : ((diff > 0 ? '+' : '') + nf(diff, 2))) + '</strong></td>' +
            '<td>' + estado + '</td></tr>';
        }
        d = addDays(d, 1); n++;
      }
      const totalContador = sum(meters, r => r.litros);
      const totalSalidas = sum(dispatches, r => r.litros);
      const totalDiff = totalContador - totalSalidas;
      const detalle = dispatches.slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.equipo || '').localeCompare(b.equipo || ''))
        .map(r => '<tr><td class="mono">' + esc(fmtShort(r.fecha)) + '</td><td><strong>' + esc(r.equipo) + '</strong></td><td>' + esc(r.compartimento || '—') + '</td><td>' + esc(r.motivo || '—') + '</td><td class="num">' + nf(r.litros, 2) + '</td><td class="mono">' + esc(r.folio || '—') + '</td></tr>').join('');
      return { prod, meters, dispatches, rows, totalContador, totalSalidas, totalDiff, detalle };
    });

    const totalContador = sum(products, p => p.totalContador);
    const totalSalidas = sum(products, p => p.totalSalidas);
    const totalDiff = totalContador - totalSalidas;
    const hayDatos = allMeters.length > 0 || allDispatches.length > 0;

    let html = '<section class="card"><div class="card-head"><div><h2>Resumen general de aceites</h2><p>Comparativa entre productos · ' + periodo + '</p></div></div>' +
      '<div class="kpis">' +
        kpi('Total contador', nf(totalContador, 2) + ' L', allMeters.length + ' lecturas', '') +
        kpi('Total salidas', nf(totalSalidas, 2) + ' L', allDispatches.length + ' salidas', '') +
        kpi('Diferencia global', (totalDiff > 0 ? '+' : '') + nf(totalDiff, 2) + ' L', 'contador - salidas', Math.abs(totalDiff) > 1 ? 'bad' : 'good') +
      '</div>' +
      '<div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>Producto</th><th class="num">Contador (L)</th><th class="num">Salidas (L)</th><th class="num">Diferencia (L)</th><th class="num">Lecturas</th><th>Estado</th></tr></thead><tbody>' +
      products.map(p => {
        const estado = p.meters.length ? (Math.abs(p.totalDiff) <= 1 ? badge('Cuadra', 'ok') : badge('Diferencia', 'bad')) : badge('Sin lecturas', 'warn');
        return '<tr><td><strong>' + esc(p.prod) + '</strong></td><td class="num">' + nf(p.totalContador, 2) + '</td><td class="num">' + nf(p.totalSalidas, 2) + '</td><td class="num"><strong>' + ((p.totalDiff > 0 ? '+' : '') + nf(p.totalDiff, 2)) + '</strong></td><td class="num">' + p.meters.length + '</td><td>' + estado + '</td></tr>';
      }).join('') +
      '</tbody><tfoot><tr><td><strong>TOTAL</strong></td><td class="num"><strong>' + nf(totalContador, 2) + '</strong></td><td class="num"><strong>' + nf(totalSalidas, 2) + '</strong></td><td class="num"><strong>' + ((totalDiff > 0 ? '+' : '') + nf(totalDiff, 2)) + '</strong></td><td class="num"><strong>' + allMeters.length + '</strong></td><td></td></tr></tfoot></table></div>' +
      '</section>';

    if (!hayDatos) {
      return html + '<section class="card"><div class="empty"><h3>Sin registros de contadores ni salidas de aceites</h3><p>Captura lecturas o salidas en el módulo Aceites en este periodo.</p></div></section>';
    }

    products.forEach((p) => {
      const estado = p.meters.length ? (Math.abs(p.totalDiff) <= 1 ? badge('Cuadra', 'ok') : badge('Diferencia', 'bad')) : badge('Sin lecturas', 'warn');
      html += '<section class="card"><div class="card-head"><div><h2>' + esc(p.prod) + ' · cotejo contador vs salidas</h2><p>' + periodo + '</p></div>' +
        '<div class="row"><button class="btn ghost sm" type="button" data-act="export-bitacora-aceites-producto" data-producto="' + esc(p.prod) + '" title="Exportar solo ' + esc(p.prod) + ' a Excel">Exportar Excel de ' + esc(p.prod) + '</button>' + estado + '</div></div>' +
        '<div class="kpis">' +
          kpi('Contador', nf(p.totalContador, 2) + ' L', p.meters.length + ' lecturas', '') +
          kpi('Salidas', nf(p.totalSalidas, 2) + ' L', p.dispatches.length + ' salidas', '') +
          kpi('Diferencia', (p.totalDiff > 0 ? '+' : '') + nf(p.totalDiff, 2) + ' L', 'contador - salidas', Math.abs(p.totalDiff) <= 1 ? 'good' : 'bad') +
        '</div>' +
        (p.rows
          ? '<div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>Fecha</th><th class="num">Inicial</th><th class="num">Final</th><th class="num">Contador (L)</th><th class="num">Salidas (L)</th><th class="num">Diferencia (L)</th><th>Estado</th></tr></thead><tbody>' + p.rows + '</tbody>' +
            '<tfoot><tr><td><strong>TOTAL</strong></td><td></td><td></td><td class="num"><strong>' + nf(p.totalContador, 2) + '</strong></td><td class="num"><strong>' + nf(p.totalSalidas, 2) + '</strong></td><td class="num"><strong>' + ((p.totalDiff > 0 ? '+' : '') + nf(p.totalDiff, 2)) + '</strong></td><td></td></tr></tfoot></table></div>'
          : '<div class="empty" style="margin-top:12px"><h3>Sin cotejo en el periodo</h3><p>No hay lecturas ni salidas registradas para ' + esc(p.prod) + '.</p></div>') +
        '<div class="divider"></div><h3 style="margin:10px 0 6px">Detalle de salidas · ' + esc(p.prod) + '</h3>' +
        (p.detalle
          ? '<div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Equipo</th><th>Compartimento</th><th>Motivo</th><th class="num">Litros</th><th>Folio</th></tr></thead><tbody>' + p.detalle + '</tbody><tfoot><tr><td colspan="4"><strong>Total salidas</strong></td><td class="num"><strong>' + nf(p.totalSalidas, 2) + '</strong></td><td></td></tr></tfoot></table></div>'
          : '<div class="empty"><h3>Sin salidas de ' + esc(p.prod) + '</h3><p>Captura despachos de este producto en el módulo Aceites.</p></div>') +
        '</section>';
    });
    return html;
  }


  function importPreviewHtml() {
    const p = ui.importPreview; if (!p) return '';
    const meta = p.meta || {};
    return '<div class="import-preview">' +
      '<div class="notice ok"><div><strong>' + esc(ui.importName||'Archivo') + '</strong> · ' + meta.rows + ' cargas · ' + meta.bobaRows + ' lecturas · ' + esc(meta.desde?fmtDate(meta.desde):'—') + ' a ' + esc(meta.hasta?fmtDate(meta.hasta):'—') + '</div></div>' +
      '<div class="kpis" style="margin:12px 0">' + kpi('Litros en cargas', litros(meta.litrosCargas), 'del archivo','') + kpi('Litros en boba', litros(meta.litrosBoba), 'lecturas del archivo','') + kpi('Hojas', (meta.sheets||[]).length, (meta.sheets||[]).join(', '),'') + '</div>' +
      ((meta.warnings||[]).length ? notice('<strong>Avisos de lectura:</strong><ul style="margin:6px 0 0 18px">' + meta.warnings.slice(0,5).map((w)=>'<li>'+esc(w)+'</li>').join('') + '</ul>','warn') : '') +
      '<div class="row" style="margin-top:12px"><label class="check"><input type="radio" name="importMode" value="merge" checked> Combinar</label><label class="check"><input type="radio" name="importMode" value="replace"> Reemplazar periodos</label><span class="muted" style="font-size:12px">Combinar actualiza renglones iguales y agrega nuevos. Reemplazar deja el periodo exactamente como el archivo.</span></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn accent" type="button" data-act="confirm-import">Importar datos</button><button class="btn ghost" type="button" data-act="cancel-import">Cancelar</button></div></div>';
  }

  /* ------------------------------ Reportes + analítica ------------------------------ */

  function groupSum(arr, keyFn, valFn) {
    const map = new Map();
    arr.forEach((item) => { const k = keyFn(item) || 'Sin dato'; map.set(k, (map.get(k)||0) + (Number(valFn(item))||0)); });
    return Array.from(map.entries()).map((e)=>({label:e[0], value:e[1]})).sort((a,b)=>b.value-a.value);
  }
  function computeAnalytics(charges, boba, daily) {
    const totalCargas = sum(charges,(c)=>c.litros);
    const totalBoba = sum(daily.filter((d)=>d.tieneDato),(d)=>d.boba);
    const lecturas = daily.filter((d)=>d.tieneDato).length;
    const cargaDays = daily.filter((d)=>d.cargas != null);
    const promDia = cargaDays.length ? totalCargas / cargaDays.length : 0;
    const promBoba = lecturas ? totalBoba / lecturas : 0;
    const pico = cargaDays.slice().sort((a,b)=>(b.cargas||0)-(a.cargas||0))[0] || null;
    const byCat = groupSum(charges,(c)=>c.categoria,(c)=>c.litros);
    const byDepto = groupSum(charges,(c)=>c.departamento,(c)=>c.litros);
    const byTurno = groupSum(charges,(c)=>c.turno,(c)=>c.litros).sort((a,b)=>String(a.label).localeCompare(String(b.label)));
    const topEquipos = groupSum(charges,(c)=>c.equipo,(c)=>c.litros).slice(0,10);
    const diff = totalBoba - totalCargas;
    const diffPct = totalCargas>0 ? (diff/totalCargas)*100 : 0;
    let cumC=0,cumB=0; const cumLabels=[],cumCargas=[],cumBoba=[];
    daily.forEach((d)=>{ if(d.cargas!=null) cumC+=d.cargas; if(d.boba!=null) cumB+=d.boba; if(d.n||d.tieneDato){ cumLabels.push(fmtShort(d.fecha)); cumCargas.push(Math.round(cumC*10)/10); cumBoba.push(d.tieneDato?Math.round(cumB*10)/10:null);} });
    return { totalCargas,totalBoba,diff,diffPct,promDia,promBoba,pico,daysWith:cargaDays.length,lecturas,byCat,byDepto,byTurno,topEquipos,cumLabels,cumCargas,cumBoba };
  }

  function analyticsHtml(charges, boba, daily, desde, hasta) {
    if (!charges.length && !daily.some((d)=>d.tieneDato)) {
      return '<section class="card"><div class="card-head"><div><h2>Análisis avanzado</h2><p>KPIs y gráficas detalladas del periodo</p></div></div><div class="empty"><h3>Sin datos para analizar</h3><p>Importa o captura información en el periodo seleccionado.</p></div></section>';
    }
    const a = computeAnalytics(charges,boba,daily);
    const topCat=a.byCat[0], topEq=a.topEquipos[0], topDep=a.byDepto[0];
    const t1=(a.byTurno.find((x)=>x.label==='1')||{}).value||0, t2=(a.byTurno.find((x)=>x.label==='2')||{}).value||0;
    const turnoPct = a.totalCargas>0 ? ('T1 '+nf((t1/a.totalCargas)*100,1)+'% · T2 '+nf((t2/a.totalCargas)*100,1)+'%') : '—';
    return '' +
      '<section class="card"><div class="card-head"><div><h2>KPIs avanzados</h2><p>Indicadores del periodo · '+esc(fmtDate(desde))+' a '+esc(fmtDate(hasta))+'</p></div></div><div class="kpis">' +
        kpi('Promedio diario (cargas)', litros(a.promDia||null,1), a.daysWith+' días con actividad','') +
        kpi('Promedio boba por día', litros(a.promBoba||null,1), a.lecturas+' días con lectura','') +
        kpi('Día de mayor consumo', a.pico?litros(a.pico.cargas,1):'—', a.pico?fmtDate(a.pico.fecha)+' · '+a.pico.n+' cargas':'Sin datos','') +
        kpi('Diferencia boba/cargas', (a.diff>0?'+':'')+nf(a.diff,1)+' L', nf(a.diffPct,1)+'% respecto a cargas', Math.abs(a.diffPct)>3?'bad':'good') +
        kpi('Top categoría', topCat?esc(topCat.label):'—', topCat?litros(topCat.value,1)+' ('+nf((topCat.value/(a.totalCargas||1))*100,1)+'%)':'','') +
        kpi('Top equipo', topEq?esc(topEq.label):'—', topEq?litros(topEq.value,1):'','') +
        kpi('Top departamento', topDep?esc(topDep.label):'—', topDep?litros(topDep.value,1):'','') +
        kpi('Distribución por turno', turnoPct, 'participación sobre el total cargado','') +
      '</div></section>' +
      '<section class="card"><div class="card-head"><div><h2>Consumo por categoría y turno</h2><p>Distribución de litros cargados</p></div></div><div class="grid cols-2"><div><h3 style="font-size:13px;margin:0 0 8px;color:var(--muted)">Por categoría</h3><div id="chartCat"></div></div><div><h3 style="font-size:13px;margin:0 0 8px;color:var(--muted)">Por turno</h3><div id="chartTurno"></div></div></div></section>' +
      '<section class="card"><div class="card-head"><div><h2>Top equipos y departamentos</h2><p>Mayores consumos del periodo</p></div></div><div class="grid cols-2"><div><h3 style="font-size:13px;margin:0 0 8px;color:var(--muted)">Top 10 equipos</h3><div id="chartTopEquipos"></div></div><div><h3 style="font-size:13px;margin:0 0 8px;color:var(--muted)">Por departamento</h3><div id="chartDepto"></div></div></div></section>' +
      '<section class="card"><div class="card-head"><div><h2>Consumo acumulado</h2><p>Evolución acumulada de cargas y boba (considerada por día)</p></div></div><div id="chartAcum"></div></section>' +
      '<section class="card"><div class="card-head"><div><h2>Detalle por categoría</h2><p>Participación y promedios</p></div></div>' +
        (a.byCat.length ? '<div class="tablewrap"><table><thead><tr><th>Categoría</th><th class="num">Litros</th><th class="num">%</th><th class="num">Cargas</th><th class="num">Promedio/carga</th></tr></thead><tbody>' +
          a.byCat.map((x)=>{ const n=charges.filter((c)=>c.categoria===x.label).length; const pct=a.totalCargas>0?(x.value/a.totalCargas)*100:0; return '<tr><td><strong>'+esc(x.label)+'</strong></td><td class="num">'+nf(x.value,1)+'</td><td class="num">'+nf(pct,1)+'%</td><td class="num">'+n+'</td><td class="num">'+nf(n?x.value/n:0,1)+'</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<div class="empty"><h3>Sin categorías</h3></div>') + '</section>';
  }

  function viewReportes() {
    const cfg = Store.getConfig(); const desde = ui.rep.desde; const hasta = ui.rep.hasta;
    const daily = dailyRange(desde, hasta);
    const charges = Store.getCharges().filter((c)=>c.fecha>=desde && c.fecha<=hasta);
    const boba = Store.getBoba().filter((b)=>b.fecha>=desde && b.fecha<=hasta);
    const totalBoba = sum(daily.filter((d)=>d.tieneDato),(d)=>d.boba);
    const totalCargas = sum(charges,(c)=>c.litros);
    const lecturas = daily.filter((d)=>d.tieneDato).length;
    const dias = daily.filter((d)=>d.tieneDato || d.n).length;
    const pctCobertura = daily.length ? Math.round((dias/daily.length)*100) : 0;

    return '' +
      '<div class="stack">' +
        '<section class="card no-print"><div class="card-head"><div><h2>Reportes y Excel</h2><p>Concentrado, gráficas, KPIs avanzados e importación/exportación</p></div></div>' +
          '<div class="filters">' + field('Desde','<input type="date" name="repDesde" value="'+esc(desde)+'">') + field('Hasta','<input type="date" name="repHasta" value="'+esc(hasta)+'">') +
            '<div class="field"><label>Atajos</label><div class="row"><button class="btn ghost sm" type="button" data-act="quick-range" data-range="mes">Este mes</button><button class="btn ghost sm" type="button" data-act="quick-range" data-range="mes-pasado">Mes pasado</button><button class="btn ghost sm" type="button" data-act="quick-range" data-range="30">30 días</button></div></div></div>' +
          '<div class="divider"></div><div class="row"><button class="btn accent" type="button" data-act="export-xlsx">Descargar Excel (.xlsx)</button><button class="btn ghost" type="button" data-act="export-csv">CSV de cargas</button><button class="btn ghost" type="button" data-act="print-report">Imprimir / PDF</button><button class="btn accent" type="button" data-act="pdf-diesel" title="Generar reporte PDF avanzado de diésel">Reporte PDF diésel</button></div></section>' +
        '<section class="card no-print"><div class="card-head"><div><h2>Importar concentrado</h2><p>Sube el mismo archivo .xlsx (hoja REPORTE DIESEL). También lee CUENTA LITROS si existe.</p></div></div><div class="dropzone" id="dropZone"><input type="file" id="fileImport" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden><p><strong>Elige un archivo</strong> o arrástralo aquí</p><button class="btn ghost" type="button" data-act="pick-file">Elegir archivo .xlsx</button></div>' + (ui.importPreview?importPreviewHtml():'') + '</section>' +
        '<section class="card"><div class="card-head"><div><h2>Resumen del periodo</h2><p>'+esc(fmtDate(desde))+' a '+esc(fmtDate(hasta))+'</p></div></div><div class="kpis">' +
          kpi('Litros boba', litros(lecturas?totalBoba:null), lecturas+' días con lectura (día o turnos)','') +
          kpi('Litros cargados', litros(totalCargas), charges.length+' cargas','') +
          kpi('Diferencia', (lecturas?(totalBoba-totalCargas>0?'+':'')+litros(totalBoba-totalCargas):'—'), 'boba - cargas', lecturas && Math.abs(totalBoba-totalCargas)>Math.max(1,totalBoba*0.01)?'bad':'good') +
          kpi('Cobertura', pctCobertura+'%', dias+' de '+daily.length+' días con datos', pctCobertura>=80?'good':'') +
        '</div></section>' +
        '<section class="card"><div class="card-head"><div><h2>Consumo diario</h2><p>Barras: litros cargados · Línea: litros boba considerados por día</p></div></div><div id="chart"></div></section>' +
        '<section class="card"><div class="card-head"><div><h2>Detalle por día</h2><p>Comparación boba (por día o turnos) contra cargas</p></div></div>' +
          (daily.length ? '<div class="tablewrap"><table><thead><tr><th>Fecha</th><th class="num">Boba</th><th>Fuente</th><th class="num">Cargas</th><th class="num">Diferencia</th><th class="num">#</th><th>Estado</th></tr></thead><tbody>' +
            daily.map((d)=>'<tr><td><strong>'+esc(fmtShort(d.fecha))+'</strong> <span class="muted">'+esc(weekday(d.fecha).slice(0,3))+'</span></td><td class="num">'+(d.boba==null?'—':nf(d.boba,1))+'</td><td>'+esc(d.fuente||'—')+'</td><td class="num">'+(d.cargas==null?'—':nf(d.cargas,1))+'</td><td class="num '+(d.diff==null?'':Math.abs(d.diff)<=1?'pos':'neg')+'">'+(d.diff==null?'—':(d.diff>0?'+':'')+nf(d.diff,1))+'</td><td class="num">'+d.n+'</td><td>'+badge(d.estado, d.estado==='Cuadra'?'ok':d.estado.indexOf('Capturado')===0?'ok':d.estado==='Sin datos'?'':'warn')+'</td></tr>').join('') +
            '</tbody><tfoot><tr><td><strong>Total</strong></td><td class="num"><strong>'+nf(totalBoba,1)+'</strong></td><td></td><td class="num"><strong>'+nf(totalCargas,1)+'</strong></td><td class="num"><strong>'+nf(totalBoba-totalCargas,1)+'</strong></td><td class="num"><strong>'+charges.length+'</strong></td><td></td></tr></tfoot></table></div>' : '<div class="empty"><h3>Periodo sin datos</h3><p>Cambia el rango de fechas o captura lecturas.</p></div>') +
        '</section>' +
        analyticsHtml(charges, boba, daily, desde, hasta) +
      '</div>';
  }

  function drawReportCharts() {
    const daily = dailyRange(ui.rep.desde, ui.rep.hasta);
    const el = $('#chart');
    if (el) DieselCharts.combo(el, { labels: daily.map((d)=>fmtShort(d.fecha)), bars: daily.map((d)=>d.cargas==null?0:d.cargas), line: daily.map((d)=>d.boba==null?null:d.boba), barUnit:'L cargados', lineUnit:'L boba', aria:'Consumo diario' });
    const charges = Store.getCharges().filter((c)=>c.fecha>=ui.rep.desde && c.fecha<=ui.rep.hasta);
    const boba = Store.getBoba().filter((b)=>b.fecha>=ui.rep.desde && b.fecha<=ui.rep.hasta);
    const a = computeAnalytics(charges,boba,daily);
    DieselCharts.barh($('#chartCat'), { labels: a.byCat.map((x)=>x.label), values: a.byCat.map((x)=>x.value), unit:'L', aria:'Consumo por categoría' });
    DieselCharts.donut($('#chartTurno'), { labels: a.byTurno.map((x)=>'Turno '+x.label), values: a.byTurno.map((x)=>x.value), unit:'L', colors:['#f59e0b','#0ea5e9','#8b5cf6'], aria:'Distribución por turno' });
    DieselCharts.barh($('#chartTopEquipos'), { labels: a.topEquipos.map((x)=>x.label), values: a.topEquipos.map((x)=>x.value), unit:'L', colors:['#0ea5e9','#38bdf8','#7dd3fc','#f59e0b','#fbbf24','#22c55e','#8b5cf6','#ef4444','#14b8a6','#eab308'], aria:'Top equipos' });
    DieselCharts.barh($('#chartDepto'), { labels: a.byDepto.map((x)=>x.label), values: a.byDepto.map((x)=>x.value), unit:'L', colors:['#22c55e','#4ade80','#0ea5e9','#8b5cf6','#f59e0b','#ef4444'], aria:'Consumo por departamento' });
    if ($('#chartAcum') && a.cumLabels.length) DieselCharts.combo($('#chartAcum'), { labels: a.cumLabels, bars: a.cumCargas, line: a.cumBoba, barUnit:'L acum. cargas', lineUnit:'L acum. boba', aria:'Consumo acumulado' });
  }

  /* ------------------------------ Usuarios y Ajustes ------------------------------ */

  function viewUsuarios() {
    const users = readUsers().sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre)));
    const d = ensureDraftUser(); const editando = !!ui.editUserId;
    const roles = [{id:'admin',nombre:'Administrador'},{id:'capturista',nombre:'Capturista'},{id:'consulta',nombre:'Consulta'}];
    return '' +
      '<div class="stack">' +
        '<section class="card"><div class="card-head"><div><h2>Módulo de usuarios y accesos</h2><p>Crea y administra accesos (módulo inicial, local en este equipo).</p></div>' + badge(users.length+' acceso'+(users.length===1?'':'s'),'') + '</div>' + notice('<strong>Módulo en desarrollo:</strong> registra y administra accesos localmente. La integración de inicio de sesión y sincronización centralizada se puede ampliar en una siguiente etapa.', 'warn') + '</section>' +
        '<section class="card"><div class="card-head"><div><h2>' + (editando?'Editar acceso':'Crear acceso') + '</h2><p>Nombre, usuario, rol y clave</p></div>' + (editando?'<button class="btn ghost sm" type="button" data-act="cancel-user-edit">Cancelar edición</button>':'') + '</div>' +
          '<form id="userForm" novalidate><div class="grid cols-4">' +
            field('Nombre completo','<input name="nombre" required value="'+esc(d.nombre)+'" placeholder="Ej. Juan Pérez">') +
            field('Usuario','<input name="usuario" required value="'+esc(d.usuario)+'" placeholder="ej. jperez" autocomplete="off">') +
            field('Rol','<select name="rol">' + roles.map((r)=>'<option value="'+esc(r.id)+'"'+(d.rol===r.id?' selected':'')+'>'+esc(r.nombre)+'</option>').join('') + '</select>') +
            '<div class="field"><label>Estado</label><label class="check"><input type="checkbox" name="activo" '+(d.activo?'checked':'')+'> Acceso activo</label></div>' +
          '</div><div class="grid cols-2" style="margin-top:12px">' +
            field('Contraseña / PIN','<input name="clave" type="password" value="" autocomplete="new-password" placeholder="'+(editando?'Dejar en blanco para no cambiar':'Clave de acceso')+'"><span class="hint">'+(editando?'Solo escribe si deseas cambiar la clave.':'Se guarda de forma ofuscada en este módulo inicial.')+'</span>') +
            field('Notas','<input name="notas" maxlength="200" value="'+esc(d.notas)+'" placeholder="Área, turno, observaciones">') +
          '</div><div class="row end" style="margin-top:14px"><button class="btn '+(editando?'accent':'')+'" type="submit">'+(editando?'Guardar cambios':'Crear acceso')+'</button></div></form></section>' +
        '<section class="card"><div class="card-head"><div><h2>Accesos registrados</h2><p>Administración de usuarios</p></div></div>' +
          (users.length ? '<div class="tablewrap"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Actualizado</th><th></th></tr></thead><tbody>' +
            users.map((u)=>'<tr><td><strong>'+esc(u.nombre)+'</strong>'+(u.notas?'<div class="muted" style="font-size:11.5px">'+esc(u.notas)+'</div>':'')+'</td><td class="mono">'+esc(u.usuario)+'</td><td>'+esc((roles.find((r)=>r.id===u.rol)||{}).nombre||u.rol)+'</td><td>'+badge(u.activo!==false?'Activo':'Inactivo', u.activo!==false?'ok':'warn')+'</td><td class="mono">'+esc(u.actualizado?fmtDateTime(u.actualizado):'')+'</td><td class="actions"><button class="btn icon" type="button" data-act="toggle-user" data-id="'+esc(u.id)+'" title="'+(u.activo!==false?'Desactivar':'Activar')+'">'+(u.activo!==false?ICO_TOGGLE_OFF:ICO_TOGGLE_ON)+'</button><button class="btn icon" type="button" data-act="edit-user" data-id="'+esc(u.id)+'" title="Editar">' + ICO_EDIT + '</button><button class="btn icon del" type="button" data-act="del-user" data-id="'+esc(u.id)+'" title="Eliminar">' + ICO_DEL + '</button></td></tr>').join('') +
            '</tbody></table></div>' : '<div class="empty"><h3>Sin accesos creados</h3><p>Crea el primer usuario para comenzar.</p></div>') +
        '</section></div>';
  }

  function viewAjustes() {
    const cfg = Store.getConfig(); const st = Store.getState(); const remote = st.remote; const tokenSaved = !!st.token;
    return '' +
      '<div class="stack">' +
        '<section class="card"><div class="card-head"><div><h2>Empresa</h2><p>Estos datos encabezan el Excel exportado</p></div></div>' +
          '<form id="cfgForm" novalidate><div class="grid cols-2">' + field('Empresa','<input name="empresa" value="'+esc(cfg.empresa)+'" required>') + field('Razón social','<input name="razonSocial" value="'+esc(cfg.razonSocial)+'">') + '</div>' +
          '<div class="grid cols-2" style="margin-top:12px">' + field('Título de la bitácora','<input name="tituloBitacora" value="'+esc(cfg.tituloBitacora)+'">') + field('Tope del cuenta-litros','<input name="contadorMax" type="number" min="100" step="1" value="'+esc(cfg.contadorMax)+'"><span class="hint">Si el contador vuelve a cero al llegar a este número</span>') + '</div>' +
          '<div class="divider"></div><div class="grid cols-2">' +
            field('Categorías (código | nombre)','<textarea name="categorias" rows="5">' + (cfg.categorias||[]).map((c)=>c.id+' | '+c.nombre).join('\n') + '</textarea>') +
            field('Equipos (equipo | categoría | departamento)','<textarea name="equipos" rows="5" placeholder="ST-41 | EDM | Mina">' + (cfg.equipos||[]).map((e)=>[e.id,e.categoria,e.departamento].join(' | ')).join('\n') + '</textarea>') +
          '</div><div class="grid cols-4" style="margin-top:12px">' +
            field('Departamentos','<textarea name="departamentos" rows="4">' + esc((cfg.departamentos||[]).join('\n')) + '</textarea>') +
            field('Operadores','<textarea name="operadores" rows="4">' + esc((cfg.operadores||[]).join('\n')) + '</textarea>') +
            field('Responsables','<textarea name="responsables" rows="4">' + esc((cfg.responsables||[]).join('\n')) + '</textarea>') +
            field('Ubicaciones','<textarea name="ubicaciones" rows="4">' + esc((cfg.ubicaciones||[]).join('\n')) + '</textarea>') +
          '</div><div class="row end" style="margin-top:14px"><button class="btn" type="submit">Guardar configuración</button></div></form></section>' +

        '<section class="card"><div class="card-head"><div><h2>GitHub</h2><p>Los datos se comparten como JSON mensual en el repositorio</p></div>' + badge(st.source==='github'?'Conectado':st.source==='github-readonly'?'Solo lectura':st.source==='github-offline'?'Sin conexión':'Solo local', st.source==='github'?'ok':st.source==='github-readonly'?'ok':st.source==='github-offline'?'err':'warn') + '</div>' +
          (st.source==='github-readonly' ? notice('<strong>Modo solo lectura activo:</strong> esta página ya muestra los datos publicados en GitHub sin necesidad de token. Se actualiza sola al abrirla o volver a la pestaña. Para <strong>guardar</strong> cambios desde aquí, crea un token con permiso <strong>Contents: Read and write</strong> y pégalo abajo.','ok') : '') +
          '<form id="remoteForm" novalidate><div class="grid cols-4">' + field('Usuario u organización','<input name="owner" value="'+esc(remote.owner)+'" placeholder="usuario" autocomplete="off">') + field('Repositorio','<input name="repo" value="'+esc(remote.repo)+'" placeholder="datos-diesel" autocomplete="off">') + field('Rama','<input name="branch" value="'+esc(remote.branch)+'">') + field('Carpeta','<input name="dir" value="'+esc(remote.dir)+'">') + '</div>' +
          '<div class="grid cols-2" style="margin-top:12px">' + field('Token de GitHub','<input name="token" type="password" autocomplete="off" placeholder="'+(tokenSaved?'•••••••• (guardado)':'ghp_… o github_pat_…')+'"><span class="hint">Fine-grained token con permiso <strong>Contents: Read and write</strong>.</span>') +
            '<div class="field"><label>Opciones</label><label class="check"><input type="checkbox" name="remember" '+(Store.hasRememberedToken()?'checked':'')+'> Recordar el token en este equipo</label></div></div>' +
          '<div class="row end" style="margin-top:14px"><button class="btn ghost" type="button" data-act="test-conn">Probar conexión</button><button class="btn ghost" type="button" data-act="forget-token">Olvidar token</button><button class="btn" type="submit">Guardar conexión</button></div></form>' +
          '<div class="divider"></div><dl class="kv"><dt>Modo</dt><dd>'+esc(st.source==='github'?'GitHub':st.source==='github-offline'?'GitHub (sin conexión)':'Solo este navegador')+'</dd><dt>Cambios pendientes</dt><dd>'+st.pending.length+'</dd><dt>Última sincronización</dt><dd>'+esc(st.lastSync?fmtDateTime(st.lastSync):'—')+'</dd>'+(st.lastError?'<dt>Último error</dt><dd class="neg">'+esc(st.lastError)+'</dd>':'')+'</dl></section>' +

        '<section class="card"><div class="card-head"><div><h2>Datos locales</h2><p>El ejemplo sirve para probar la app sin datos reales</p></div></div><div class="row"><button class="btn ghost" type="button" data-act="load-demo">'+(Store.isDemo()?'Regenerar ejemplo':'Cargar datos de ejemplo')+'</button>' + (Store.isDemo()?'<button class="btn ghost" type="button" data-act="clear-demo">Borrar ejemplo</button>':'') + '<button class="btn danger" type="button" data-act="clear-local">Borrar todos los datos locales</button></div><p class="muted" style="margin-top:10px;font-size:12.5px">Borrar los datos locales no elimina lo que ya está en GitHub; al sincronizar se vuelve a descargar.</p>' +
          '<div class="divider"></div><div><strong>Publicar sin token</strong><p class="muted" style="font-size:12.5px">Descarga los JSON de tus datos y súbelos a la carpeta <code>data/</code> del repositorio desde la web de GitHub (Add file → Upload files). Con eso todas las personas verán los datos sin configurar nada.</p><button class="btn ghost" type="button" data-act="export-github-json">Descargar datos para GitHub (.zip)</button></div></section>' +
      '</div>';
  }

  /* ------------------------------ eventos ------------------------------ */

  function onClick(e) {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const act = btn.dataset.act;

    if (act === 'prev-day') { ui.dia = addDays(ui.dia,-1); render(); return; }
    if (act === 'next-day') { ui.dia = addDays(ui.dia,1); render(); return; }
    if (act === 'today') { ui.dia = todayISO(); render(); return; }
    if (act === 'goto') { go(btn.dataset.tab); return; }
    if (act === 'goto-day') { e.preventDefault(); ui.dia = btn.dataset.fecha; go('dia'); return; }
    if (act === 'goto-boba-fecha') { e.preventDefault(); ui.bobaFecha = btn.dataset.fecha; ui.dia = btn.dataset.fecha; if (ui.tab !== 'boba') go('boba'); else render(); return; }

    if (act === 'use-prev') {
      const turno = btn.dataset.turno;
      const prev = turno === '1' ? prevFinal(ui.dia,'1') : ((Store.bobaFor(ui.dia,'1')||{}).final != null ? Number(Store.bobaFor(ui.dia,'1').final) : prevFinal(ui.dia,'2'));
      if (prev == null) { toast('Todavía no hay una lectura final anterior.', 'err'); return; }
      const input = $('#ini' + turno);
      if (input) { input.value = prev; const form = input.closest('form'); if (form) updateShiftCalc(form); }
      return;
    }
    if (act === 'use-prev-day') {
      const prev = prevFinal(ui.bobaFecha || ui.dia, '1');
      if (prev == null) { toast('Todavía no hay una lectura final anterior.', 'err'); return; }
      const input = $('#iniD');
      if (input) { input.value = prev; const form = input.closest('form'); if (form) updateBobaDayCalc(form); }
      return;
    }

    if (act === 'new-carga') { ui.editCargaId = null; ui.draftCarga = blankCarga(ui.dia); go('cargas'); return; }
    if (act === 'edit-carga') {
      const rec = Store.getRecords().find((r)=>r.id===btn.dataset.id); if (!rec) return;
      ui.editCargaId = rec.id;
      ui.draftCarga = { fecha:rec.fecha, turno:rec.turno, categoria:rec.categoria, equipo:rec.equipo, horometro:rec.horometro==null?'':rec.horometro, litros:rec.litros, departamento:rec.departamento, operador:rec.operador, responsable:rec.responsable, folio:rec.folio, ubicacion:rec.ubicacion, notas:rec.notas };
      go('cargas'); return;
    }
    if (act === 'cancel-edit') { ui.editCargaId = null; ui.draftCarga = blankCarga(); render(); return; }
    if (act === 'del-carga') {
      const rec = Store.getRecords().find((r)=>r.id===btn.dataset.id); if (!rec) return;
      if (!confirm('¿Eliminar la carga de ' + rec.equipo + ' del ' + fmtDate(rec.fecha) + ' (turno ' + rec.turno + ')?')) return;
      Store.remove(rec.id); toast('Carga eliminada.','ok'); render(); return;
    }
    if (act === 'del-boba') {
      const rec = Store.getRecords().find((r)=>r.id===btn.dataset.id); if (!rec) return;
      const tipo = rec.turno === 'D' ? 'del día' : ('turno ' + rec.turno);
      if (!confirm('¿Eliminar la lectura ' + tipo + ' del ' + fmtDate(rec.fecha) + '?')) return;
      Store.remove(rec.id); toast('Lectura eliminada.','ok'); render(); return;
    }

    if (act === 'quick-range') {
      const range = btn.dataset.range; const target = ui.tab === 'bitacora' ? ui.bitacora : (ui.tab === 'bitacora-aceites' ? ui.bitacoraAceites : (ui.tab === 'aceites' ? ui.aceites : ui.rep)); const hoy = todayISO();
      if (range === 'mes') { target.desde = monthStart(hoy); target.hasta = monthEnd(hoy); }
      else if (range === 'mes-pasado') { const d = parseISO(monthStart(hoy)); d.setMonth(d.getMonth()-1); target.desde = monthStart(isoOf(d)); target.hasta = monthEnd(target.desde); }
      else { target.desde = addDays(hoy,-29); target.hasta = hoy; }
      render(); return;
    }

    if (act === 'export-xlsx') { exportXlsx(); return; }
    if (act === 'export-csv') { exportCsv(); return; }
    if (act === 'print-report') { window.print(); return; }
    if (act === 'pdf-diesel') { pdfDieselReport(); return; }
    if (act === 'pick-file') { const f = $('#fileImport'); if (f) f.click(); return; }
    if (act === 'cancel-import') { ui.importPreview = null; ui.importName = ''; render(); return; }
    if (act === 'confirm-import') {
      if (!ui.importPreview) return;
      const mode = ($('input[name="importMode"]:checked')||{}).value || 'merge';
      const meta = ui.importPreview.meta || {};
      try {
        const res = Store.importData(ui.importPreview, mode);
        ui.importPreview = null; ui.importName = '';
        if (meta.desde && meta.hasta) { ui.bitacora.desde = meta.desde; ui.bitacora.hasta = meta.hasta; ui.rep.desde = meta.desde; ui.rep.hasta = meta.hasta; }
        toast('Importado: ' + res.charges + ' cargas y ' + res.boba + ' lecturas (' + (res.mode==='replace'?'reemplazar':'combinar') + ').', 'ok');
        render();
      } catch (err) { toast(err.message || 'No se pudo importar', 'err'); }
      return;
    }

    if (act === 'aceite-prev-day') { ui.aceites.fecha = addDays(ui.aceites.fecha,-1); render(); return; }
    if (act === 'aceite-next-day') { ui.aceites.fecha = addDays(ui.aceites.fecha,1); render(); return; }
    if (act === 'aceite-today') { ui.aceites.fecha = todayISO(); render(); return; }
    if (act === 'aceite-vista') { ui.aceites.vista = btn.dataset.vista || 'captura'; render(); return; }
    if (act === 'new-aceite') { ui.editAceiteId = null; ui.draftAceite = blankAceite(ui.aceites.fecha); render(); const f=$('#aceiteForm'); if(f) f.scrollIntoView({behavior:'smooth',block:'start'}); return; }
    if (act === 'edit-aceite') {
      const rec = Store.getRecords().find((r)=>r.id===btn.dataset.id); if (!rec) return;
      ui.editAceiteId = rec.id;
      ui.draftAceite = { fecha:rec.fecha, equipo:rec.equipo, descripcion:rec.descripcion||'', horometro:rec.horometro==null?'':rec.horometro, tipoAceite:rec.tipoAceite||'Hidráulico Shell', compartimento:rec.compartimento||'', motivo:rec.motivo||'', litros:rec.litros, precio:rec.precio==null?'':rec.precio, importe:rec.importe==null?'':rec.importe, mecanico:rec.mecanico||'', responsable:rec.responsable||'', folio:rec.folio||'', notas:rec.notas||'' };
      render(); const f=$('#aceiteForm'); if(f) f.scrollIntoView({behavior:'smooth',block:'start'}); return;
    }
    if (act === 'cancel-aceite-edit') { ui.editAceiteId = null; ui.draftAceite = blankAceite(ui.aceites.fecha); render(); return; }
    if (act === 'del-aceite') {
      const rec = Store.getRecords().find((r)=>r.id===btn.dataset.id); if (!rec) return;
      if (!confirm('¿Eliminar la salida de ' + rec.equipo + ' (' + (rec.tipoAceite||'aceite') + ') del ' + fmtDate(rec.fecha) + '?')) return;
      Store.remove(rec.id); toast('Salida eliminada.','ok'); render(); return;
    }
    if (act === 'del-aceite-meter') {
      const rec = Store.getRecords().find((r)=>r.id===btn.dataset.id); if (!rec) return;
      if (!confirm('¿Eliminar la cuenta litros de ' + (rec.producto||'producto') + ' del ' + fmtDate(rec.fecha) + '?')) return;
      Store.remove(rec.id); toast('Cuenta litros eliminada.','ok'); render(); return;
    }
    if (act === 'export-aceites-xlsx') { exportAceitesXlsx(); return; }
    if (act === 'export-bitacora-aceites-xlsx') { exportAceitesXlsxRange(ui.bitacoraAceites.desde, ui.bitacoraAceites.hasta); return; }
    if (act === 'export-bitacora-aceites-producto') { exportAceitesXlsxRange(ui.bitacoraAceites.desde, ui.bitacoraAceites.hasta, btn.dataset.producto); return; }
    if (act === 'pdf-aceites') { pdfAceitesReport(); return; }
    if (act === 'pick-file-aceites') { const f = $('#fileImportAceites'); if (f) f.click(); return; }
    if (act === 'cancel-import-aceites') { ui.aceiteImportPreview = null; ui.aceiteImportName = ''; render(); return; }
    if (act === 'confirm-import-aceites') {
      if (!ui.aceiteImportPreview) return;
      const mode = ($('input[name="aceiteImportMode"]:checked')||{}).value || 'merge';
      const meta = ui.aceiteImportPreview.meta || {};
      try {
        const res = Store.importData(ui.aceiteImportPreview, mode);
        ui.aceiteImportPreview = null; ui.aceiteImportName = '';
        if (meta.desde && meta.hasta) { ui.aceites.desde = meta.desde; ui.aceites.hasta = meta.hasta; }
        toast('Importado: ' + (res.aceites||0) + ' salidas y ' + (res.aceiteBoba||0) + ' cuenta litros (' + (res.mode==='replace'?'reemplazar':'combinar') + ').', 'ok');
        render();
      } catch (err) { toast(err.message || 'No se pudo importar', 'err'); }
      return;
    }
    if (act === 'test-conn') { testConnection(); return; }
    if (act === 'forget-token') { if (!confirm('¿Olvidar el token guardado en este equipo?')) return; Store.forgetToken(); toast('Token olvidado.','ok'); render(); return; }
    if (act === 'load-demo') { try { Store.loadDemo(); toast('Datos de ejemplo cargados.','ok'); render(); } catch (err) { toast(err.message,'err'); } return; }
    if (act === 'clear-demo') { if (!confirm('¿Borrar los datos de ejemplo?')) return; Store.clearDemo(); toast('Ejemplo borrado.','ok'); render(); return; }
    if (act === 'clear-local') { if (!confirm('¿Borrar TODOS los datos guardados en este navegador? Esta acción no se puede deshacer.')) return; Store.clearLocal(); toast('Datos locales borrados.','ok'); render(); return; }
    if (act === 'export-github-json') { exportGithubJson(); return; }

    if (act === 'edit-user') {
      const u = readUsers().find((x)=>x.id===btn.dataset.id); if (!u) return;
      ui.editUserId = u.id; ui.draftUser = { id:u.id, nombre:u.nombre, usuario:u.usuario, rol:u.rol, activo:u.activo!==false, clave:'', notas:u.notas||'' };
      render(); const f=$('#userForm'); if(f) f.scrollIntoView({behavior:'smooth',block:'start'}); return;
    }
    if (act === 'cancel-user-edit') { ui.editUserId=null; ui.draftUser=blankUser(); render(); return; }
    if (act === 'del-user') { const u=readUsers().find((x)=>x.id===btn.dataset.id); if(!u) return; if(!confirm('¿Eliminar el acceso de "'+u.nombre+'"?')) return; writeUsers(readUsers().filter((x)=>x.id!==u.id)); toast('Usuario eliminado.','ok'); render(); return; }
    if (act === 'toggle-user') { const users=readUsers(); const u=users.find((x)=>x.id===btn.dataset.id); if(!u) return; u.activo=!u.activo; u.actualizado=new Date().toISOString(); writeUsers(users); toast(u.activo?'Acceso activado.':'Acceso desactivado.','ok'); render(); return; }
  }

  function onInput(e) {
    const t = e.target;
    if (t.closest && t.closest('#cargaForm')) { ui.draftCarga[t.name] = t.value; if (t.name === 'equipo') applyEquipoCatalog(t.value); return; }
    if (t.closest && t.closest('[data-shift]')) { updateShiftCalc(t.closest('[data-shift]')); return; }
    if (t.closest && t.closest('[data-boba-day]')) { updateBobaDayCalc(t.closest('[data-boba-day]')); return; }
    if (t.closest && t.closest('#userForm')) { ensureDraftUser(); if (t.name === 'activo') ui.draftUser.activo = t.checked; else if (t.name) ui.draftUser[t.name] = t.value; return; }
    if (t.closest && t.closest('#aceiteForm')) { ensureDraftAceite(); if (t.name) ui.draftAceite[t.name] = t.value; return; }
    if (t.closest && t.closest('[data-aceite-meter]')) { updateAceiteMeterCalc(t.closest('[data-aceite-meter]')); return; }
  }

  function onChange(e) {
    const t = e.target;
    if (t.id === 'diaInput' && t.value) { ui.dia = t.value; render(); return; }
    if (t.id === 'bobaMes' && t.value) { ui.bobaMes = t.value; render(); return; }
    if (t.id === 'bobaFecha' && t.value) { ui.bobaFecha = t.value; render(); return; }
    if (t.id === 'bobaModo') { ui.bobaModo = t.value; render(); return; }
    if (t.id === 'fileImport') { handleImportFile(t.files && t.files[0]); return; }
    if (t.id === 'fileImportAceites') { handleAceiteImportFile(t.files && t.files[0]); return; }
    if (t.id === 'aceitesFecha' && t.value) { ui.aceites.fecha = t.value; render(); return; }
    if (t.id === 'aceitesDesde' && t.value) { ui.aceites.desde = t.value; render(); return; }
    if (t.id === 'aceitesHasta' && t.value) { ui.aceites.hasta = t.value; render(); return; }
    if (t.id === 'aceitesQ') { ui.aceites.q = t.value; render(); return; }
    if (t.id === 'aceitesProducto') { ui.aceites.producto = t.value; render(); return; }
    if (t.name === 'repDesde' && t.value) { ui.rep.desde = t.value; render(); return; }
    if (t.name === 'repHasta' && t.value) { ui.rep.hasta = t.value; render(); return; }
    if (t.name === 'bitDesde' && t.value) { ui.bitacora.desde = t.value; render(); return; }
    if (t.name === 'bitHasta' && t.value) { ui.bitacora.hasta = t.value; render(); return; }
    if (t.name === 'bitAceiteDesde' && t.value) { ui.bitacoraAceites.desde = t.value; render(); return; }
    if (t.name === 'bitAceiteHasta' && t.value) { ui.bitacoraAceites.hasta = t.value; render(); return; }
    if (t.closest && t.closest('#filtrosCargas')) {
      const f = ui.cargas; const n = t.name;
      if (n === 'desde' && t.value) f.desde = t.value;
      else if (n === 'hasta' && t.value) f.hasta = t.value;
      else if (n === 'categoria') f.categoria = t.value;
      else if (n === 'turno') f.turno = t.value;
      else if (n === 'q') f.q = t.value;
      render(); return;
    }
  }

  function applyEquipoCatalog(value) {
    const cfg = Store.getConfig();
    const eq = (cfg.equipos||[]).find((e) => e.id.toLowerCase() === String(value).trim().toLowerCase());
    if (!eq) return;
    const form = $('#cargaForm'); if (!form) return;
    if (eq.categoria) { ui.draftCarga.categoria = eq.categoria; if (form.elements.categoria) form.elements.categoria.value = eq.categoria; }
    if (eq.departamento) { ui.draftCarga.departamento = eq.departamento; if (form.elements.departamento) form.elements.departamento.value = eq.departamento; }
  }

  function updateShiftCalc(form) {
    const turno = form.dataset.shift; const cfg = Store.getConfig();
    const ini = parseDecimal(form.elements.inicial.value); const fin = parseDecimal(form.elements.final.value);
    const carga = Number(form.dataset.cargas) || 0;
    let boba = null; if (ini != null && fin != null) boba = Store.bobaLitros(ini, fin, cfg.contadorMax);
    const litEl = $('#lit' + turno), difEl = $('#dif' + turno);
    if (litEl) litEl.textContent = boba == null ? '—' : nf(boba, 1) + ' L';
    if (difEl) {
      if (boba == null) { difEl.textContent = '—'; difEl.className = ''; }
      else { const d = boba - carga; difEl.textContent = (d > 0 ? '+' : '') + nf(d, 1) + ' L'; difEl.className = Math.abs(d) <= 1 ? 'pos' : 'neg'; }
    }
  }
  function updateBobaDayCalc(form) {
    const cfg = Store.getConfig();
    const ini = parseDecimal(form.elements.inicial.value); const fin = parseDecimal(form.elements.final.value);
    const carga = Number(form.dataset.cargas) || 0;
    let boba = null; if (ini != null && fin != null) boba = Store.bobaLitros(ini, fin, cfg.contadorMax);
    const litEl = $('#litD'), difEl = $('#difD');
    if (litEl) litEl.textContent = boba == null ? '—' : nf(boba, 1) + ' L';
    if (difEl) {
      if (boba == null) { difEl.textContent = '—'; difEl.className = ''; }
      else { const d = boba - carga; difEl.textContent = (d > 0 ? '+' : '') + nf(d, 1) + ' L'; difEl.className = Math.abs(d) <= 1 ? 'pos' : 'neg'; }
    }
  }
  function updateAceiteMeterCalc(form) {
    const cfg = Store.getConfig();
    const ini = parseDecimal(form.elements.inicial.value);
    const fin = parseDecimal(form.elements.final.value);
    const salidas = Number(form.dataset.salidas) || 0;
    const key = String(form.dataset.producto || '').indexOf('Motor') !== -1 ? 'M' : 'H';
    const tope = cfg.contadorMaxAceites || cfg.contadorMax;
    let cuenta = null; if (ini != null && fin != null) cuenta = Store.bobaLitros(ini, fin, tope);
    const litEl = $('#lit' + key), difEl = $('#dif' + key);
    if (litEl) litEl.textContent = cuenta == null ? '—' : nf(cuenta, 2) + ' L';
    if (difEl) {
      if (cuenta == null) { difEl.textContent = '—'; difEl.className = ''; }
      else { const d = cuenta - salidas; difEl.textContent = (d > 0 ? '+' : '') + nf(d, 1) + ' L'; difEl.className = Math.abs(d) <= 1 ? 'pos' : 'neg'; }
    }
  }

  /* ------------------------------ guardar ------------------------------ */

  function saveShift(form) {
    const turno = form.dataset.shift; const cfg = Store.getConfig();
    const ini = parseDecimal(form.elements.inicial.value); const fin = parseDecimal(form.elements.final.value);
    const id = form.elements.id ? form.elements.id.value : '';
    const fecha = form.dataset.fecha || ui.dia || ui.bobaFecha;
    if (ini == null && fin == null) { toast('Captura al menos la lectura inicial del turno ' + turno + '.', 'err'); return; }
    if (ini != null && fin != null) {
      const calc = Store.bobaLitros(ini, fin, cfg.contadorMax);
      if (calc < 0) { const ok = confirm('La lectura final es menor que la inicial y no parece una vuelta de contador (' + nf(ini,2) + ' —  ' + nf(fin,2) + ').\n\n¿Guardar de todos modos?'); if (!ok) return; }
    }
    try {
      Store.save({ id, tipo:'boba', fecha, turno, inicial:ini, final:fin, notas: form.elements.notas.value });
      toast(fin == null ? 'Lectura inicial guardada (turno ' + turno + ').' : 'Turno ' + turno + ' guardado.', 'ok');
      render();
    } catch (err) { toast(err.message || 'No se pudo guardar la lectura.', 'err'); }
  }

  function saveBobaDay(form) {
    const cfg = Store.getConfig();
    const fecha = form.dataset.fecha || ui.bobaFecha || ui.dia;
    const ini = parseDecimal(form.elements.inicial.value); const fin = parseDecimal(form.elements.final.value);
    const id = form.elements.id ? form.elements.id.value : '';
    if (ini == null && fin == null) { toast('Captura al menos la lectura inicial del día.', 'err'); return; }
    if (ini != null && fin != null) {
      const calc = Store.bobaLitros(ini, fin, cfg.contadorMax);
      if (calc < 0) { const ok = confirm('La lectura final es menor que la inicial y no parece una vuelta de contador (' + nf(ini,2) + ' —  ' + nf(fin,2) + ').\n\n¿Guardar de todos modos?'); if (!ok) return; }
    }
    try {
      Store.save({ id, tipo:'boba', fecha, turno:'D', inicial:ini, final:fin, notas: form.elements.notas.value });
      toast(fin == null ? 'Lectura inicial del día guardada.' : 'Registro del día guardado.', 'ok');
      render();
    } catch (err) { toast(err.message || 'No se pudo guardar la lectura del día.', 'err'); }
  }

  function saveAceiteMeter(form) {
    const cfg = Store.getConfig();
    const producto = String(form.dataset.producto || '').trim();
    const fecha = form.dataset.fecha || ui.aceites.fecha || todayISO();
    const ini = parseDecimal(form.elements.inicial.value);
    const fin = parseDecimal(form.elements.final.value);
    const id = form.elements.id ? form.elements.id.value : '';
    const notas = form.elements.notas ? form.elements.notas.value : '';
    if (!producto) { toast('Producto no válido.', 'err'); return; }
    if (ini == null && fin == null) { toast('Captura al menos la lectura inicial de ' + producto + '.', 'err'); return; }
    if (ini != null && fin != null) {
      const calc = Store.bobaLitros(ini, fin, cfg.contadorMaxAceites || cfg.contadorMax);
      if (calc < 0) {
        const ok = confirm('La lectura final es menor que la inicial y no parece una vuelta de contador (' + nf(ini, 2) + ' — ' + nf(fin, 2) + ').\n\n¿Guardar de todos modos?');
        if (!ok) return;
      }
    }
    try {
      Store.save({ id, tipo:'aceite_boba', fecha, producto, inicial:ini, final:fin, notas:notas });
      toast(fin == null ? 'Lectura inicial de ' + producto + ' guardada.' : 'Cuenta litros de ' + producto + ' guardada.', 'ok');
      render();
    } catch (err) { toast(err.message || 'No se pudo guardar la cuenta litros.', 'err'); }
  }

  function saveAceiteForm() {
    const form = $('#aceiteForm'); if (!form) return;
    const e = form.elements;
    const d = {
      fecha: e.fecha.value,
      equipo: String(e.equipo.value || '').trim(),
      tipoAceite: e.tipoAceite ? e.tipoAceite.value : 'Hidráulico Shell',
      litros: e.litros.value,
      descripcion: e.descripcion ? e.descripcion.value : '',
      horometro: e.horometro ? e.horometro.value : '',
      compartimento: e.compartimento ? e.compartimento.value : '',
      motivo: e.motivo ? e.motivo.value : '',
      precio: e.precio ? e.precio.value : '',
      mecanico: e.mecanico ? e.mecanico.value : '',
      responsable: e.responsable ? e.responsable.value : '',
      folio: e.folio ? e.folio.value : '',
      notas: e.notas ? e.notas.value : ''
    };
    const litrosVal = parseDecimal(d.litros);
    if (!d.fecha) { toast('Captura la fecha de la salida.', 'err'); if (e.fecha) e.fecha.focus(); return; }
    if (!d.equipo) { toast('Escribe el equipo.', 'err'); e.equipo.focus(); return; }
    if (litrosVal == null || !(litrosVal > 0)) { toast('Los litros deben ser mayores que cero.', 'err'); e.litros.focus(); return; }
    try {
      Store.save({
        id: ui.editAceiteId || '', tipo:'aceite',
        fecha: d.fecha, equipo: d.equipo, tipoAceite: d.tipoAceite,
        litros: litrosVal, descripcion: d.descripcion, horometro: d.horometro,
        compartimento: d.compartimento, motivo: d.motivo, precio: d.precio,
        mecanico: d.mecanico, responsable: d.responsable, folio: d.folio, notas: d.notas
      });
      toast(ui.editAceiteId ? 'Salida de aceite actualizada.' : 'Salida de aceite agregada.', 'ok');
      ui.aceites.fecha = d.fecha;
      ui.editAceiteId = null;
      ui.draftAceite = blankAceite(d.fecha);
      render();
    } catch (err) { toast(err.message || 'No se pudo guardar la salida de aceite.', 'err'); }
  }

  function saveCargaForm() {
    const form = $('#cargaForm'); if (!form) return;
    const e = form.elements;
    const d = { fecha:e.fecha.value, turno:e.turno.value, categoria:e.categoria.value, equipo:String(e.equipo.value||'').trim(), horometro:e.horometro.value, litros:e.litros.value, departamento:e.departamento.value, operador:e.operador.value, responsable:e.responsable.value, folio:e.folio.value, ubicacion:e.ubicacion.value, notas:e.notas.value };
    const litrosVal = parseDecimal(d.litros);
    if (!d.equipo) { toast('Escribe el equipo.', 'err'); e.equipo.focus(); return; }
    if (litrosVal == null || !(litrosVal > 0)) { toast('Los litros deben ser mayores que cero.', 'err'); e.litros.focus(); return; }
    try {
      Store.save({ id: ui.editCargaId || '', tipo:'carga', fecha:d.fecha, turno:d.turno, categoria:d.categoria, equipo:d.equipo, horometro:d.horometro, litros:litrosVal, departamento:d.departamento, operador:d.operador, responsable:d.responsable, folio:d.folio, ubicacion:d.ubicacion, notas:d.notas });
      toast(ui.editCargaId ? 'Carga actualizada.' : 'Carga agregada.', 'ok');
      if (d.fecha && d.fecha < ui.cargas.desde) ui.cargas.desde = d.fecha;
      if (d.fecha && d.fecha > ui.cargas.hasta) ui.cargas.hasta = d.fecha;
      ui.editCargaId = null; ui.draftCarga = blankCarga();
      render();
    } catch (err) { toast(err.message || 'No se pudo guardar la carga.', 'err'); }
  }

  async function saveCfgForm() {
    const form = $('#cfgForm'); if (!form) return;
    const e = form.elements;
    const lines = (v) => String(v||'').split(/\r?\n/).map((x)=>x.trim()).filter(Boolean);
    const cfg = {
      empresa: e.empresa.value, razonSocial: e.razonSocial.value, tituloBitacora: e.tituloBitacora.value, contadorMax: e.contadorMax.value,
      categorias: lines(e.categorias.value).map((l)=>{ const p=l.split('|').map((x)=>x.trim()); return {id:p[0]||'', nombre:p[1]||''}; }),
      equipos: lines(e.equipos.value).map((l)=>{ const p=l.split('|').map((x)=>x.trim()); return {id:p[0]||'', categoria:p[1]||'', departamento:p[2]||''}; }),
      departamentos: lines(e.departamentos.value), operadores: lines(e.operadores.value), responsables: lines(e.responsables.value), ubicaciones: lines(e.ubicaciones.value)
    };
    try { const res = await Store.saveConfig(cfg); toast(res.remote ? 'Configuración guardada en GitHub.' : 'Configuración guardada en este equipo.', 'ok'); render(); }
    catch (err) { toast(err.message || 'No se pudo guardar la configuración.', 'err'); }
  }

  function saveRemoteForm() {
    const form = $('#remoteForm'); if (!form) return; const e = form.elements; const token = String(e.token.value||'').trim();
    Store.setRemote({ owner:e.owner.value, repo:e.repo.value, branch:e.branch.value, dir:e.dir.value }, token || Store.getState().token, e.remember.checked);
    toast(Store.isRemoteReady() ? 'Conexión guardada.' : 'Guarda también el token para conectar.', Store.isRemoteReady() ? 'ok' : 'err');
    render();
  }
  async function testConnection() {
    try { const res = await Store.testConnection(); toast([res.fullName, res.canWrite?'escritura OK':'SIN permiso de escritura', res.configOk?'config.json encontrado':'sin config.json en el repo'].join(' · '), res.canWrite?'ok':'err'); }
    catch (err) { toast(err.message || 'No se pudo conectar.', 'err'); }
  }


  /* ------------------------------ Aceites (motor / hidráulico) ------------------------------ */

  function ensureDraftAceite(fecha) { if (!ui.draftAceite) ui.draftAceite = blankAceite(fecha); return ui.draftAceite; }
  function blankAceite(fecha) {
    return { fecha: fecha || ui.aceites.fecha || todayISO(), equipo: '', descripcion: '', horometro: '', tipoAceite: 'Hidráulico Shell', compartimento: 'Sistema hidráulico', motivo: '', litros: '', precio: '', importe: '', mecanico: '', responsable: '', folio: '', notas: '' };
  }
  function aceiteDispatchesOf(fecha) { return Store.getAceiteDispatches().filter((r)=>r.fecha===fecha); }
  function aceiteDispatchesRange(desde, hasta) { return Store.getAceiteDispatches().filter((r)=>r.fecha>=desde && r.fecha<=hasta); }
  function aceitePrevFinal(producto, fecha) {
    const p = Store.canonProductoAceite ? Store.canonProductoAceite(producto) : producto;
    const all = Store.getAceiteMeters().filter((r) => r.final != null && r.fecha < fecha && (r.producto === p || (Store.canonProductoAceite ? Store.canonProductoAceite(r.producto) === p : false)));
    all.sort((a,b)=>a.fecha.localeCompare(b.fecha));
    return all.length ? Number(all[all.length - 1].final) : null;
  }

  function aceiteMeterCard(producto, fecha) {
    const rec = Store.aceiteBobaFor ? Store.aceiteBobaFor(fecha, producto) : Store.getAceiteMeters().find((r)=>r.fecha===fecha && r.producto===producto);
    const salidas = Store.getAceiteDispatches().filter((r)=>r.fecha===fecha && (Store.canonProductoAceite?Store.canonProductoAceite(r.tipoAceite):r.tipoAceite)===producto);
    const totalSalidas = sum(salidas, (r)=>r.litros);
    const litros = rec && rec.litros != null ? rec.litros : null;
    const diff = litros == null ? null : litros - totalSalidas;
    const state = !rec ? badge('Sin lectura', 'warn') : rec.litros == null && rec.inicial != null ? badge('En curso', '') : badge('Registrado', 'ok');
    const key = producto.indexOf('Motor')!==-1 ? 'M' : 'H';
    const prev = aceitePrevFinal(producto, fecha);
    const iniVal = (rec && rec.inicial != null) ? rec.inicial : (prev != null ? prev : '');
    return '' +
      '<article class="shift' + (rec ? ' done' : '') + '">' +
        '<header class="shift-head"><div><h3>Cuenta litros · ' + esc(producto) + '</h3><p>Lectura de despacho diario</p></div>' + state + '</header>' +
        '<form data-aceite-meter="1" data-producto="' + esc(producto) + '" data-fecha="' + esc(fecha) + '" data-salidas="' + totalSalidas + '" novalidate>' +
          (rec ? '<input type="hidden" name="id" value="' + esc(rec.id) + '">' : '') +
          '<div class="grid cols-2">' +
            '<div class="field"><label for="ini' + key + '">Lectura inicial</label><input id="ini' + key + '" name="inicial" type="number" step="any" inputmode="decimal" min="0" value="' + esc(iniVal) + '" placeholder="Ej. 1000">' +
              '<span class="hint">' + (prev != null ? 'Final del día anterior: <strong>' + nf(prev, 2) + '</strong>' + (rec && rec.inicial != null ? '' : ' (precargado)') : 'Aún no hay lectura anterior') + '</span></div>' +
            '<div class="field"><label for="fin' + key + '">Lectura final</label><input id="fin' + key + '" name="final" type="number" step="any" inputmode="decimal" min="0" value="' + (rec && rec.final != null ? esc(rec.final) : '') + '" placeholder="Ej. 1050"><span class="hint">Se calcula automáticamente</span></div>' +
          '</div>' +
          '<div class="calc">' +
            '<div class="calc-item"><span class="lbl">Litros (cuenta litros)</span><strong id="lit' + key + '">' + (litros == null ? '—' : nf(litros, 2) + ' L') + '</strong></div>' +
            '<div class="calc-item"><span class="lbl">Salidas del día</span><strong>' + nf(totalSalidas,1) + ' L</strong></div>' +
            '<div class="calc-item"><span class="lbl">Diferencia</span><strong id="dif' + key + '" class="' + (diff == null ? '' : Math.abs(diff) <= 1 ? 'pos' : 'neg') + '">' + (diff == null ? '—' : (diff > 0 ? '+' : '') + nf(diff,1) + ' L') + '</strong></div>' +
          '</div>' +
          '<div class="field"><label for="notas' + key + '">Notas (opcional)</label><input id="notas' + key + '" name="notas" maxlength="240" value="' + esc(rec && rec.notas || '') + '" placeholder="Observaciones"></div>' +
          '<div class="row end" style="margin-top:12px">' +
            (rec ? '<button class="btn ghost sm" type="button" data-act="del-aceite-meter" data-id="' + esc(rec.id) + '">Eliminar</button>' : '') +
            '<button class="btn" type="submit">' + (rec ? 'Actualizar' : 'Guardar') + '</button>' +
          '</div>' +
        '</form>' +
      '</article>';
  }

  function viewAceites() {
    const fecha = ui.aceites.fecha;
    const desde = ui.aceites.desde; const hasta = ui.aceites.hasta;
    const vista = ui.aceites.vista || 'captura';
    const d = ensureDraftAceite(fecha);
    const editando = !!ui.editAceiteId;
    const dayDispatches = aceiteDispatchesOf(fecha).slice().sort((a,b)=>(a.equipo||'').localeCompare(b.equipo||''));
    const totalDia = sum(dayDispatches,(r)=>r.litros);
    const rangeDispatches = aceiteDispatchesRange(desde,hasta).filter((r)=>{
      if (ui.aceites.producto) { const p = Store.canonProductoAceite?Store.canonProductoAceite(r.tipoAceite):r.tipoAceite; if (p !== ui.aceites.producto) return false; }
      if (ui.aceites.q) { const q=ui.aceites.q.toLowerCase(); const hay=[r.equipo,r.descripcion,r.mecanico,r.responsable,r.folio,r.motivo].join(' ').toLowerCase(); if(hay.indexOf(q)===-1) return false; }
      return true;
    }).sort((a,b)=>b.fecha.localeCompare(a.fecha)||(a.equipo||'').localeCompare(b.equipo||''));
    const totalRango = sum(rangeDispatches,(r)=>r.litros);
    const metersRange = Store.getAceiteMeters().filter((m)=>m.fecha>=desde && m.fecha<=hasta);

    const toggle = '<div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm ' + (vista==='captura'?'accent':'ghost') + '" type="button" data-act="aceite-vista" data-vista="captura">Captura diaria</button><button class="btn sm ' + (vista==='dashboard'?'accent':'ghost') + '" type="button" data-act="aceite-vista" data-vista="dashboard">Dashboard y gráficos</button></div>';

    let body = '';
    if (vista === 'dashboard') {
      body = '' +
        '<section class="card"><div class="card-head"><div><h2>Dashboard de aceites</h2><p>Consulta avanzada de consumo, cuenta litros y diferencias por periodo</p></div></div>' +
          '<div class="filters">' +
            field('Desde','<input type="date" id="aceitesDesde" value="' + esc(desde) + '">') +
            field('Hasta','<input type="date" id="aceitesHasta" value="' + esc(hasta) + '">') +
            '<div class="field"><label>Atajos</label><div class="row"><button class="btn ghost sm" type="button" data-act="quick-range" data-range="mes">Este mes</button><button class="btn ghost sm" type="button" data-act="quick-range" data-range="mes-pasado">Mes pasado</button><button class="btn ghost sm" type="button" data-act="quick-range" data-range="30">30 días</button></div></div>' +
          '</div>' +
          '<div class="row" style="margin-top:12px"><button class="btn accent" type="button" data-act="export-aceites-xlsx">Exportar Excel de aceites</button><button class="btn ghost" type="button" data-act="pick-file-aceites">Importar Excel</button><button class="btn ghost sm" type="button" data-act="aceite-vista" data-vista="captura">Ir a captura diaria</button><button class="btn accent" type="button" data-act="pdf-aceites" title="Generar reporte PDF avanzado de aceites">Reporte PDF aceites</button></div>' +
          '<div class="dropzone" id="dropZoneAceites" style="margin-top:12px"><input type="file" id="fileImportAceites" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden><p><strong>Importar concentrado de aceites</strong> (.xlsx) · arrastra o elige archivo</p><button class="btn ghost sm" type="button" data-act="pick-file-aceites">Elegir archivo</button></div>' +
          (ui.aceiteImportPreview ? aceiteImportPreviewHtml() : '') +
        '</section>' +
        aceitesChartsHtml(desde, hasta);
    } else {
      body = '' +
        '<section class="card">' +
          '<div class="card-head"><div><h2>Captura diaria de aceites</h2><p>Motor Shell e Hidráulico Shell · salidas y cuenta litros de despacho</p></div>' +
            '<div class="row"><button class="btn ghost sm" type="button" data-act="aceite-prev-day">←</button><input type="date" id="aceitesFecha" value="' + esc(fecha) + '"><button class="btn ghost sm" type="button" data-act="aceite-next-day">→</button><button class="btn ghost sm" type="button" data-act="aceite-today">Hoy</button></div></div>' +
          '<p class="muted" style="margin:-4px 0 12px">' + esc(fmtDate(fecha,true)) + ' · ' + esc(weekday(fecha)) + '</p>' +
          notice('Registra las <strong>salidas/despachos</strong> del día y la <strong>cuenta litros</strong> de cada producto. Para análisis avanzado abre el <strong>Dashboard y gráficos</strong>.', '') +
        '</section>' +

        '<section class="card">' +
          '<div class="card-head"><div><h2>Cuenta litros de despacho (por producto)</h2><p>Lectura inicial y final de cada cuenta litros en el día</p></div></div>' +
          '<div class="day-grid">' + ACEITE_PRODUCTOS.map(p=>aceiteMeterCard(p, fecha)).join('') + '</div>' +
          '<div class="kpis" style="margin-top:12px">' +
            ACEITE_PRODUCTOS.map(p=>{ const i=Store.aceiteDayInfo?Store.aceiteDayInfo(fecha,p):{totalCuenta:null,totalSalidas:sum(aceiteDispatchesOf(fecha).filter(r=>(Store.canonProductoAceite?Store.canonProductoAceite(r.tipoAceite):r.tipoAceite)===p),(r)=>r.litros),diff:null}; return kpi(p, (i.totalCuenta==null?'—':nf(i.totalCuenta,1)+' L'), 'Salidas: ' + nf(i.totalSalidas,1) + ' L · Dif: ' + (i.diff==null?'—':(i.diff>0?'+':'')+nf(i.diff,1)+' L'), i.totalCuenta!=null && Math.abs(i.diff||0)>1?'bad':''); }).join('') +
          '</div>' +
        '</section>' +

        '<section class="card">' +
          '<div class="card-head"><div><h2>' + (editando?'Editar salida':'Registrar salida de aceite') + '</h2><p>Despacho a equipo</p></div>' + (editando?'<button class="btn ghost sm" type="button" data-act="cancel-aceite-edit">Cancelar</button>':'') + '</div>' +
          '<form id="aceiteForm" novalidate><div class="grid cols-4">' +
            field('Fecha','<input type="date" name="fecha" required value="' + esc(d.fecha) + '">') +
            field('Equipo','<input name="equipo" required value="' + esc(d.equipo) + '" placeholder="Ej. JU-DD210">') +
            field('Tipo de aceite','<select name="tipoAceite">' + ACEITE_PRODUCTOS.map(p=>'<option value="' + esc(p) + '"' + (d.tipoAceite===p?' selected':'') + '>' + esc(p) + '</option>').join('') + '<option value="SHELL SPIRAX S4 TXM (hidráulico)"' + (d.tipoAceite==='SHELL SPIRAX S4 TXM (hidráulico)'?' selected':'') + '>SHELL SPIRAX S4 TXM (hidráulico)</option><option value="Otro"' + (d.tipoAceite==='Otro'?' selected':'') + '>Otro</option></select>') +
            field('Litros','<input name="litros" type="number" step="any" min="0.01" required value="' + esc(d.litros) + '" placeholder="0.0">') +
          '</div><div class="grid cols-4" style="margin-top:12px">' +
            field('Descripción','<input name="descripcion" value="' + esc(d.descripcion) + '" placeholder="Equipo / descripción">') +
            field('Horómetro','<input name="horometro" value="' + esc(d.horometro) + '">') +
            field('Compartimento','<input name="compartimento" value="' + esc(d.compartimento) + '" placeholder="Sistema hidráulico">') +
            field('Motivo','<input name="motivo" value="' + esc(d.motivo) + '" placeholder="Relleno, fuga, cambio…">') +
          '</div><div class="grid cols-4" style="margin-top:12px">' +
            field('Precio/L','<input name="precio" type="number" step="any" min="0" value="' + esc(d.precio) + '">') +
            field('Mecánico','<input name="mecanico" value="' + esc(d.mecanico) + '">') +
            field('Responsable','<input name="responsable" value="' + esc(d.responsable) + '">') +
            field('Folio / orden','<input name="folio" value="' + esc(d.folio) + '">') +
          '</div><div class="field" style="margin-top:12px"><label>Notas</label><input name="notas" maxlength="240" value="' + esc(d.notas) + '"></div>' +
          '<div class="row end" style="margin-top:14px"><button class="btn ' + (editando?'accent':'') + '" type="submit">' + (editando?'Guardar cambios':'Agregar salida') + '</button></div></form>' +
        '</section>' +

        '<section class="card">' +
          '<div class="card-head"><div><h2>Salidas del día</h2><p>' + dayDispatches.length + ' renglones · ' + nf(totalDia,1) + ' L</p></div></div>' +
          (dayDispatches.length
            ? '<div class="tablewrap"><table><thead><tr><th>Equipo</th><th>Tipo de aceite</th><th>Compartimento</th><th>Motivo</th><th class="num">Litros</th><th>Mecánico</th><th>Folio</th><th></th></tr></thead><tbody>' +
              dayDispatches.map(r=>'<tr><td><strong>' + esc(r.equipo) + '</strong><div class="muted" style="font-size:11.5px">' + esc(r.descripcion||'') + '</div></td><td>' + esc(r.tipoAceite||'—') + '</td><td>' + esc(r.compartimento||'—') + '</td><td>' + esc(r.motivo||'—') + '</td><td class="num"><strong>' + nf(r.litros,1) + '</strong></td><td>' + esc(r.mecanico||'—') + '</td><td class="mono">' + esc(r.folio||'—') + '</td><td class="actions"><button class="btn icon" type="button" data-act="edit-aceite" data-id="' + esc(r.id) + '" title="Editar">' + ICO_EDIT + '</button><button class="btn icon del" type="button" data-act="del-aceite" data-id="' + esc(r.id) + '" title="Eliminar">' + ICO_DEL + '</button></td></tr>').join('') +
              '</tbody><tfoot><tr><td colspan="4"><strong>Total día</strong></td><td class="num"><strong>' + nf(totalDia,1) + '</strong></td><td colspan="3"></td></tr></tfoot></table></div>'
            : '<div class="empty"><h3>Sin salidas este día</h3><p>Captura los despachos de aceite del día.</p></div>') +
        '</section>' +

        '<section class="card">' +
          '<div class="card-head"><div><h2>Salidas por periodo (listado)</h2><p>Consulta rápida e importación/exportación</p></div></div>' +
          '<div class="filters">' +
            field('Desde','<input type="date" id="aceitesDesde" value="' + esc(desde) + '">') +
            field('Hasta','<input type="date" id="aceitesHasta" value="' + esc(hasta) + '">') +
            field('Producto','<select id="aceitesProducto"><option value="">Todos</option>' + ACEITE_PRODUCTOS.map(p=>'<option value="' + esc(p) + '"' + (ui.aceites.producto===p?' selected':'') + '>' + esc(p) + '</option>').join('') + '</select>') +
            field('Buscar','<input type="search" id="aceitesQ" value="' + esc(ui.aceites.q) + '" placeholder="Equipo, folio, mecánico…">') +
          '</div>' +
          '<div class="row" style="margin-top:12px"><button class="btn accent" type="button" data-act="export-aceites-xlsx">Exportar Excel de aceites</button><button class="btn ghost" type="button" data-act="pick-file-aceites">Importar Excel</button><button class="btn ghost sm" type="button" data-act="aceite-vista" data-vista="dashboard">Ver dashboard y gráficos</button><button class="btn accent" type="button" data-act="pdf-aceites" title="Generar reporte PDF avanzado de aceites">Reporte PDF aceites</button></div>' +
          '<div class="dropzone" id="dropZoneAceites" style="margin-top:12px"><input type="file" id="fileImportAceites" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden><p><strong>Importar concentrado de aceites</strong> (.xlsx) · arrastra o elige archivo</p><button class="btn ghost sm" type="button" data-act="pick-file-aceites">Elegir archivo</button></div>' +
          (ui.aceiteImportPreview ? aceiteImportPreviewHtml() : '') +
          '<div class="kpis" style="margin-top:12px">' + kpi('Salidas (renglones)', nf(rangeDispatches.length), 'en el periodo','') + kpi('Litros salidas', nf(totalRango,1)+' L', 'periodo filtrado','') + kpi('Lecturas cuenta litros', nf(metersRange.filter(m=>m.litros!=null).length), 'en el periodo','') + '</div>' +
          (rangeDispatches.length
            ? '<div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>Fecha</th><th>Equipo</th><th>Tipo de aceite</th><th>Compartimento</th><th>Motivo</th><th class="num">Litros</th><th>Mecánico</th><th>Folio</th><th></th></tr></thead><tbody>' +
              rangeDispatches.map(r=>'<tr><td class="mono">' + esc(fmtShort(r.fecha)) + '</td><td><strong>' + esc(r.equipo) + '</strong></td><td>' + esc(r.tipoAceite||'—') + '</td><td>' + esc(r.compartimento||'—') + '</td><td>' + esc(r.motivo||'—') + '</td><td class="num">' + nf(r.litros,1) + '</td><td>' + esc(r.mecanico||'—') + '</td><td class="mono">' + esc(r.folio||'—') + '</td><td class="actions"><button class="btn icon" type="button" data-act="edit-aceite" data-id="' + esc(r.id) + '" title="Editar">' + ICO_EDIT + '</button><button class="btn icon del" type="button" data-act="del-aceite" data-id="' + esc(r.id) + '" title="Eliminar">' + ICO_DEL + '</button></td></tr>').join('') +
              '</tbody></table></div>'
            : '<div class="empty" style="margin-top:12px"><h3>Sin salidas en el periodo</h3><p>Captura salidas o importa el Excel de aceites.</p></div>') +
        '</section>';
    }

    return '<div class="stack"><section class="card"><div class="row" style="justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><h2 style="margin:0">Aceites</h2><p class="muted" style="margin:2px 0 0">Motor Shell e Hidráulico Shell · ' + (vista==='dashboard'?'análisis y consulta de gráficos':'captura diaria y control') + '</p></div>' + toggle + '</div></section>' + body + '</div>';
  }


  function aceitesDailyRange(desde, hasta) {
    const out = [];
    if (!desde || !hasta || desde > hasta) return out;
    let d = desde, n = 0;
    while (d <= hasta && n < 400) {
      const dispatches = Store.getAceiteDispatches().filter((r)=>r.fecha===d);
      const salidas = sum(dispatches,(r)=>r.litros);
      let cuenta = 0, tieneCuenta = false;
      ACEITE_PRODUCTOS.forEach(p => { const info = Store.aceiteDayInfo?Store.aceiteDayInfo(d,p):null; if (info && info.tieneDato) { cuenta += info.totalCuenta; tieneCuenta = true; } });
      out.push({ fecha:d, salidas: salidas || 0, salidasN: salidas || null, cuenta: tieneCuenta ? cuenta : null, n: dispatches.length });
      d = addDays(d, 1); n++;
    }
    return out;
  }

  function aceitesAnalytics(dispatches, meters, daily) {
    const totalSalidas = sum(dispatches,(r)=>r.litros);
    const byProd = groupSum(dispatches, (r)=>Store.canonProductoAceite?Store.canonProductoAceite(r.tipoAceite):(r.tipoAceite||'Sin dato'), (r)=>r.litros);
    const byMotivo = groupSum(dispatches, (r)=>r.motivo||'Sin dato', (r)=>r.litros).slice(0,10);
    const byComp = groupSum(dispatches, (r)=>r.compartimento||'Sin dato', (r)=>r.litros).slice(0,10);
    const topEquipos = groupSum(dispatches, (r)=>r.equipo||'Sin dato', (r)=>r.litros).slice(0,10);
    const daysWith = daily.filter(d=>d.n>0 || d.cuenta!=null).length;
    const promDia = daysWith ? totalSalidas / daysWith : 0;
    const pico = daily.slice().sort((a,b)=>(b.salidas||0)-(a.salidas||0))[0] || null;
    const totalCuenta = sum(meters.filter(m=>m.litros!=null),(m)=>m.litros);
    return { totalSalidas, byProd, byMotivo, byComp, topEquipos, daysWith, promDia, pico, totalCuenta, registros: dispatches.length, lecturas: meters.filter(m=>m.litros!=null).length };
  }

  function aceitesChartsHtml(desde, hasta) {
    const dispatches = Store.getAceiteDispatches().filter((r)=>r.fecha>=desde && r.fecha<=hasta);
    const meters = Store.getAceiteMeters().filter((r)=>r.fecha>=desde && r.fecha<=hasta);
    const daily = aceitesDailyRange(desde, hasta);
    const a = aceitesAnalytics(dispatches, meters, daily);
    if (!dispatches.length && !meters.length) {
      return '<section class="card"><div class="card-head"><div><h2>Gráficos y KPIs avanzados</h2><p>Análisis del periodo de aceites</p></div></div><div class="empty"><h3>Sin datos para analizar</h3><p>Captura salidas o importa el Excel de aceites en el periodo.</p></div></section>';
    }
    const topProd = a.byProd[0], topEq = a.topEquipos[0], topMot = a.byMotivo[0];
    return '' +
      '<section class="card"><div class="card-head"><div><h2>KPIs avanzados (aceites)</h2><p>Indicadores del periodo · ' + esc(fmtDate(desde)) + ' a ' + esc(fmtDate(hasta)) + '</p></div></div>' +
        '<div class="kpis">' +
          kpi('Litros salidas', nf(a.totalSalidas,1) + ' L', a.registros + ' renglones', '') +
          kpi('Litros cuenta litros', nf(a.totalCuenta,1) + ' L', a.lecturas + ' lecturas', '') +
          kpi('Diferencia global', nf(a.totalCuenta - a.totalSalidas,1) + ' L', 'cuenta litros - salidas', Math.abs(a.totalCuenta - a.totalSalidas) > 1 ? 'bad' : 'good') +
          kpi('Promedio diario', nf(a.promDia,1) + ' L', a.daysWith + ' días con actividad', '') +
          kpi('Día pico (salidas)', a.pico && a.pico.salidas ? nf(a.pico.salidas,1) + ' L' : '—', a.pico && a.pico.salidas ? fmtDate(a.pico.fecha) : 'Sin datos', '') +
          kpi('Top producto', topProd ? esc(topProd.label) : '—', topProd ? nf(topProd.value,1) + ' L' : '', '') +
          kpi('Top equipo', topEq ? esc(topEq.label) : '—', topEq ? nf(topEq.value,1) + ' L' : '', '') +
          kpi('Top motivo', topMot ? esc(topMot.label) : '—', topMot ? nf(topMot.value,1) + ' L' : '', '') +
        '</div></section>' +
      '<section class="card"><div class="card-head"><div><h2>Tendencia de consumo (aceites)</h2><p>Barras: litros de salidas por día · Línea: litros cuenta litros (suma productos)</p></div></div><div id="aceiteTrend"></div></section>' +
      '<section class="card"><div class="card-head"><div><h2>Distribución por producto y motivo</h2><p>Consumo de aceites en el periodo</p></div></div><div class="grid cols-2">' +
        '<div><h3 style="font-size:13px;margin:0 0 8px;color:var(--muted)">Por producto</h3><div id="aceiteByProd"></div></div>' +
        '<div><h3 style="font-size:13px;margin:0 0 8px;color:var(--muted)">Por motivo</h3><div id="aceiteByMotivo"></div></div>' +
      '</div></section>' +
      '<section class="card"><div class="card-head"><div><h2>Top equipos y compartimentos</h2><p>Mayores consumos del periodo</p></div></div><div class="grid cols-2">' +
        '<div><h3 style="font-size:13px;margin:0 0 8px;color:var(--muted)">Top 10 equipos</h3><div id="aceiteTopEquipos"></div></div>' +
        '<div><h3 style="font-size:13px;margin:0 0 8px;color:var(--muted)">Por compartimento</h3><div id="aceiteByComp"></div></div>' +
      '</div></section>' +
      '<section class="card"><div class="card-head"><div><h2>Detalle por producto</h2><p>Participación y promedios</p></div></div>' +
        (a.byProd.length ? '<div class="tablewrap"><table><thead><tr><th>Producto</th><th class="num">Litros</th><th class="num">%</th><th class="num">Salidas</th><th class="num">Promedio/salida</th></tr></thead><tbody>' +
          a.byProd.map(x=>{ const n=dispatches.filter(r=>(Store.canonProductoAceite?Store.canonProductoAceite(r.tipoAceite):(r.tipoAceite||''))===x.label).length; const pct=a.totalSalidas>0?(x.value/a.totalSalidas)*100:0; return '<tr><td><strong>'+esc(x.label)+'</strong></td><td class="num">'+nf(x.value,1)+'</td><td class="num">'+nf(pct,1)+'%</td><td class="num">'+n+'</td><td class="num">'+nf(n?x.value/n:0,1)+'</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<div class="empty"><h3>Sin datos por producto</h3></div>') + '</section>';
  }

  function drawAceitesCharts() {
    const desde = ui.aceites.desde, hasta = ui.aceites.hasta;
    const dispatches = Store.getAceiteDispatches().filter((r)=>r.fecha>=desde && r.fecha<=hasta);
    const meters = Store.getAceiteMeters().filter((r)=>r.fecha>=desde && r.fecha<=hasta);
    const daily = aceitesDailyRange(desde, hasta);
    const a = aceitesAnalytics(dispatches, meters, daily);
    if ($('#aceiteTrend')) DieselCharts.combo($('#aceiteTrend'), { labels: daily.map(d=>fmtShort(d.fecha)), bars: daily.map(d=>d.salidas||0), line: daily.map(d=>d.cuenta==null?null:d.cuenta), barUnit:'L salidas', lineUnit:'L cuenta litros', aria:'Tendencia de consumo de aceites' });
    if ($('#aceiteByProd')) DieselCharts.donut($('#aceiteByProd'), { labels: a.byProd.map(x=>x.label), values: a.byProd.map(x=>x.value), unit:'L', colors:['#f59e0b','#0ea5e9','#22c55e','#8b5cf6','#ef4444'], aria:'Consumo por producto' });
    if ($('#aceiteByMotivo')) DieselCharts.barh($('#aceiteByMotivo'), { labels: a.byMotivo.map(x=>x.label), values: a.byMotivo.map(x=>x.value), unit:'L', aria:'Consumo por motivo' });
    if ($('#aceiteTopEquipos')) DieselCharts.barh($('#aceiteTopEquipos'), { labels: a.topEquipos.map(x=>x.label), values: a.topEquipos.map(x=>x.value), unit:'L', colors:['#0ea5e9','#38bdf8','#7dd3fc','#f59e0b','#fbbf24','#22c55e','#8b5cf6','#ef4444','#14b8a6','#eab308'], aria:'Top equipos aceites' });
    if ($('#aceiteByComp')) DieselCharts.barh($('#aceiteByComp'), { labels: a.byComp.map(x=>x.label), values: a.byComp.map(x=>x.value), unit:'L', colors:['#22c55e','#4ade80','#0ea5e9','#8b5cf6','#f59e0b','#ef4444'], aria:'Consumo por compartimento' });
  }


  function exportAceitesXlsx() { exportAceitesXlsxRange(ui.aceites.desde, ui.aceites.hasta); }

  function exportAceitesXlsxRange(desde, hasta, producto) {
    const soloProducto = producto ? (Store.canonProductoAceite ? Store.canonProductoAceite(producto) : producto) : '';
    const canon = (v) => Store.canonProductoAceite ? Store.canonProductoAceite(v) : v;
    let dispatches = Store.getAceiteDispatches().filter((r)=>r.fecha>=desde && r.fecha<=hasta);
    let meters = Store.getAceiteMeters().filter((r)=>r.fecha>=desde && r.fecha<=hasta);
    if (soloProducto) {
      dispatches = dispatches.filter((r)=>canon(r.tipoAceite) === soloProducto);
      meters = meters.filter((r)=>canon(r.producto) === soloProducto);
    }
    if (!dispatches.length && !meters.length) {
      toast(soloProducto ? ('No hay datos de ' + producto + ' en el periodo para exportar.') : 'No hay datos de aceites en el periodo para exportar.', 'err');
      return;
    }
    try {
      const bytes = AceitesXLSX.build({ config: Store.getConfig(), dispatches, meters, desde, hasta, producto: soloProducto || '' });
      const base = AceitesXLSX.filename(desde, hasta).replace(/\.xlsx$/i, '');
      const sufijo = soloProducto ? '_' + soloProducto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_') : '';
      const name = (soloProducto ? base.replace(/^REPORTE_ACEITES_/, 'BITACORA_ACEITES_') : base) + sufijo + '.xlsx';
      download(name, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      toast('Excel generado: ' + name, 'ok');
    } catch (err) { console.error(err); toast('No se pudo generar el Excel: ' + (err.message||err), 'err'); }
  }

  /** Exporta los JSON mensuales tal como los espera la app, para subirlos a GitHub sin token. */
  function exportGithubJson() {
    const recs = Store.getRecords();
    if (!recs.length) { toast('No hay datos locales para publicar.', 'err'); return; }
    try {
      const byPeriod = {};
      recs.forEach((r) => {
        const p = String(r.fecha || '').slice(0, 7) || 'sin-fecha';
        (byPeriod[p] || (byPeriod[p] = [])).push(r);
      });
      const periods = Object.keys(byPeriod).sort();
      const enc = new TextEncoder();
      const files = { 'data/index.json': enc.encode(JSON.stringify({ periods: periods }, null, 2) + '\n') };
      periods.forEach((p) => { files['data/' + p + '.json'] = enc.encode(JSON.stringify(byPeriod[p], null, 2) + '\n'); });
      const zip = window.fflate.zipSync(files, { level: 6 });
      download('datos-para-github.zip', zip, 'application/zip');
      toast('ZIP descargado. Súbelo a la carpeta data/ de GitHub y extrae los archivos.', 'ok');
    } catch (err) { console.error(err); toast('No se pudo generar el ZIP: ' + (err.message||err), 'err'); }
  }

  /* ------------------------------ importar/exportar ------------------------------ */


  function aceiteImportPreviewHtml() {
    const p = ui.aceiteImportPreview; if (!p) return '';
    const meta = p.meta || {};
    const rows = (meta.rows != null ? meta.rows : (p.dispatches||[]).length);
    const lecturas = (meta.meterRows != null ? meta.meterRows : (meta.bobaRows != null ? meta.bobaRows : (p.meters||[]).length));
    const litrosSal = (meta.litrosSalidas != null ? meta.litrosSalidas : (meta.litrosCargas != null ? meta.litrosCargas : null));
    const litrosCta = (meta.litrosCuenta != null ? meta.litrosCuenta : (meta.litrosBoba != null ? meta.litrosBoba : null));
    const canonAceite = (v)=>Store.canonProductoAceite ? Store.canonProductoAceite(v) : v;
    const porProducto = {};
    (p.dispatches||[]).forEach((d)=>{
      const prod = canonAceite(d.tipoAceite) || 'Sin producto';
      const e = porProducto[prod] || (porProducto[prod] = { n: 0, l: 0 });
      e.n++; e.l += Number(d.litros)||0;
    });
    const resumenProductos = Object.keys(porProducto).sort().map((prod)=>prod + ': ' + porProducto[prod].n + ' salidas (' + nf(porProducto[prod].l, 1) + ' L)').join(' · ');
    return '<div class="import-preview">' +
      '<div class="notice ok"><div><strong>' + esc(ui.aceiteImportName||'Archivo') + '</strong> — ' + rows + ' salidas — ' + lecturas + ' lecturas cuenta litros — ' + esc(meta.desde?fmtDate(meta.desde):'') + ' a ' + esc(meta.hasta?fmtDate(meta.hasta):'') + '</div>' +
        (resumenProductos ? '<div style="margin-top:6px"><strong>Salidas por producto:</strong> ' + esc(resumenProductos) + '</div>' : '') + '</div>' +
      '<div class="kpis" style="margin:12px 0">' + kpi('Litros en salidas', litros(litrosSal), 'del archivo','') + kpi('Litros en cuenta litros', litros(litrosCta), 'lecturas del archivo','') + kpi('Hojas', (meta.sheets||[]).length, (meta.sheets||[]).join(', '),'') + '</div>' +
      ((meta.warnings||[]).length ? notice('<strong>Avisos de lectura:</strong><ul style="margin:6px 0 0 18px">' + meta.warnings.slice(0,5).map((w)=>'<li>'+esc(w)+'</li>').join('') + '</ul>','warn') : '') +
      '<div class="row" style="margin-top:12px"><label class="check"><input type="radio" name="aceiteImportMode" value="merge" checked> Combinar</label><label class="check"><input type="radio" name="aceiteImportMode" value="replace"> Reemplazar periodos</label><span class="muted" style="font-size:12px">Combinar actualiza renglones iguales y agrega nuevos. Reemplazar deja el periodo exactamente como el archivo.</span></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn accent" type="button" data-act="confirm-import-aceites">Importar datos</button><button class="btn ghost" type="button" data-act="cancel-import-aceites">Cancelar</button></div></div>';
  }

  async function handleAceiteImportFile(file) {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name || '')) { toast('Selecciona un archivo .xlsx de aceites.', 'err'); return; }
    try {
      const buf = await file.arrayBuffer();
      const parsed = AceitesXLSX.parse(buf);
      if (!parsed.dispatches.length && !parsed.meters.length) { toast('El archivo no contiene salidas ni lecturas de cuenta litros reconocibles.', 'err'); return; }
      ui.aceiteImportPreview = parsed;
      ui.aceiteImportName = file.name;
      toast('Archivo leído: ' + parsed.dispatches.length + ' salidas, ' + parsed.meters.length + ' lecturas.', 'ok');
      render();
      const inp = document.getElementById('fileImportAceites'); if (inp) inp.value = '';
    } catch (err) { console.error(err); toast('No se pudo leer el archivo: ' + (err.message || err), 'err'); const inp = document.getElementById('fileImportAceites'); if (inp) inp.value = ''; }
  }


  function handleImportFile(file) {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) { toast('Selecciona un archivo .xlsx (Excel).', 'err'); return; }
    if (!window.DieselXLSX) { toast('Falta el lector de Excel (assets/xlsx.js).', 'err'); return; }
    const reader = new FileReader();
    reader.onload = function () {
      try { const parsed = DieselXLSX.parse(reader.result); ui.importPreview = parsed; ui.importName = file.name; render(); toast('Archivo leído: ' + parsed.meta.rows + ' cargas y ' + parsed.meta.bobaRows + ' lecturas.', 'ok'); }
      catch (err) { ui.importPreview = null; toast(err.message || 'No se pudo leer el archivo.', 'err'); render(); }
    };
    reader.onerror = function () { toast('No se pudo abrir el archivo.', 'err'); };
    reader.readAsArrayBuffer(file);
  }
  function wireDropZone() {
    const dz = $('#dropZone');
    if (dz && !dz._wired) {
      dz._wired = true;
      ['dragenter','dragover'].forEach((ev)=>dz.addEventListener(ev,(e)=>{ e.preventDefault(); dz.classList.add('over'); }));
      ['dragleave','drop'].forEach((ev)=>dz.addEventListener(ev,(e)=>{ e.preventDefault(); dz.classList.remove('over'); }));
      dz.addEventListener('drop',(e)=>{ const file=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; if(file) handleImportFile(file); });
    }
    const dza = $('#dropZoneAceites');
    if (dza && !dza._wired) {
      dza._wired = true;
      ['dragenter','dragover'].forEach((ev)=>dza.addEventListener(ev,(e)=>{ e.preventDefault(); dza.classList.add('over'); }));
      ['dragleave','drop'].forEach((ev)=>dza.addEventListener(ev,(e)=>{ e.preventDefault(); dza.classList.remove('over'); }));
      dza.addEventListener('drop',(e)=>{ const file=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; if(file) handleAceiteImportFile(file); });
    }
  }

  function activeRange() { return ui.tab === 'bitacora' ? ui.bitacora : ui.rep; }
  function rangeData() {
    const r = activeRange(); const desde = r.desde, hasta = r.hasta;
    return { desde, hasta, charges: Store.getCharges().filter((c)=>c.fecha>=desde && c.fecha<=hasta), boba: Store.getBoba().filter((b)=>b.fecha>=desde && b.fecha<=hasta) };
  }
  function exportXlsx() {
    const d = rangeData();
    if (!d.charges.length && !d.boba.length) { toast('No hay datos en el periodo para exportar.', 'err'); return; }
    try {
      const bytes = DieselXLSX.build({ config: Store.getConfig(), charges: d.charges, boba: d.boba, desde: d.desde, hasta: d.hasta });
      const name = DieselXLSX.filename(d.desde, d.hasta);
      download(name, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      toast('Excel generado: ' + name, 'ok');
    } catch (err) { console.error(err); toast('No se pudo generar el Excel: ' + (err.message||err), 'err'); }
  }
  function exportCsv() {
    const d = rangeData();
    if (!d.charges.length) { toast('No hay cargas en el periodo para exportar.', 'err'); return; }
    const rows = [['Fecha','Turno','Categoria','Equipo','Horometro','Litros','Departamento','Operador','Responsable','Folio','Ubicacion T.','Notas']];
    d.charges.slice().sort((a,b)=>a.fecha.localeCompare(b.fecha)||Number(a.turno)-Number(b.turno)).forEach((c)=>{
      rows.push([c.fecha,c.turno,c.categoria,c.equipo,c.horometro==null?'':c.horometro,String(c.litros).replace('.',','),c.departamento,c.operador,c.responsable,c.folio,c.ubicacion,c.notas]);
    });
    downloadCSV('cargas_diesel_' + d.desde + '_a_' + d.hasta + '.csv', rows);
    toast('CSV generado.', 'ok');
  }

  /* ------------------------------ Reportes PDF (avanzados) ------------------------------ */

  function reportLogoSvg(small) {
    var h = small ? 38 : 46;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 64" height="' + h + '" aria-label="Sierra Madre">' +
      '<defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#163a5c"/><stop offset="1" stop-color="#0b1e30"/></linearGradient></defs>' +
      '<g transform="translate(4,6)"><rect x="0" y="0" width="52" height="52" rx="12" fill="url(#rg)"/><path d="M6 40 L18 22 L26 32 L34 16 L46 40 Z" fill="#f59e0b"/><path d="M14 40 L23 27 L30 36 L38 24 L46 40 Z" fill="#fbbf24" opacity=".55"/><path d="M34 16 L29 23 L34 21 L39 23 Z" fill="#fff7ed" opacity=".9"/></g>' +
      '<g transform="translate(68,18)" fill="#0f2a43"><text x="0" y="18" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="1.2">SIERRA MADRE</text><text x="0" y="38" font-family="Segoe UI, Arial, sans-serif" font-size="11.5" font-weight="600" letter-spacing="2.2" fill="#64748b">GOLD &amp; SILVER</text></g></svg>';
  }

  function snapshotCharts(defs) {
    var host = document.createElement('div');
    host.setAttribute('data-pdf-snap', '1');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:980px;background:#fff;color:#0b1220;z-index:-1;pointer-events:none;font-family:Segoe UI,Arial,sans-serif;';
    document.body.appendChild(host);
    var out = {};
    defs.forEach(function (d) {
      var box = document.createElement('div');
      box.id = 'snap_' + d.id;
      box.style.cssText = 'width:' + (d.width || 940) + 'px;min-height:120px;padding:4px;';
      host.appendChild(box);
      try { d.draw(box); } catch (e) { box.innerHTML = '<div style="color:#64748b;font-size:12px">No disponible</div>'; }
      out[d.id] = box.innerHTML || '<div style="color:#64748b;font-size:12px">Sin datos</div>';
    });
    host.remove();
    return out;
  }

  function pdfKpi(label, value, sub, kind) {
    return '<div class="rkpi ' + (kind||'') + '"><div class="rk">' + esc(label) + '</div><div class="rv">' + value + '</div><div class="rs">' + esc(sub||'') + '</div></div>';
  }
  function pdfSection(title, sub, body) {
    return '<section class="rsec"><div class="rsec-head"><div><h2>' + esc(title) + '</h2>' + (sub?'<p>'+esc(sub)+'</p>':'') + '</div></div>' + body + '</section>';
  }

  function pdfCss() {
    return '' +
      '<style>' +
      '@page{size:A4;margin:14mm 12mm 14mm 12mm}' +
      '*{box-sizing:border-box} html,body{margin:0;padding:0;color:#0b1220;background:#fff;font-family:"Segoe UI",Roboto,Arial,sans-serif;font-size:11px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '.rcover{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;padding:14px 16px 12px;margin-bottom:14px;border-radius:14px;background:linear-gradient(135deg,#0b2440 0%,#123a63 55%,#1d5d96 100%);color:#fff;position:relative;overflow:hidden}' +
      '.rcover:after{content:"";position:absolute;right:-40px;top:-40px;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,rgba(245,158,11,.35),rgba(245,158,11,0) 70%)}' +
      '.rcover .left{min-width:0;position:relative;z-index:1}.rcover h1{margin:6px 0 2px;font-size:22px;letter-spacing:-.02em;font-weight:800}.rcover .sub{font-size:12px;opacity:.92}.rcover .period{margin-top:6px;font-size:12.5px;font-weight:700;color:#fde68a}' +
      '.rcover .meta{text-align:right;font-size:10.5px;opacity:.95;position:relative;z-index:1}.rcover .meta div{margin-top:2px}.rtag{display:inline-block;margin-top:6px;padding:3px 9px;border-radius:999px;background:rgba(245,158,11,.18);border:1px solid rgba(245,158,11,.35);color:#fde68a;font-weight:700;font-size:10.5px}' +
      '.rbrand{display:flex;align-items:center;gap:10px}.rbrand svg{background:#fff;border-radius:8px;padding:2px 4px}' +
      '.rgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:10px 0 14px}' +
      '.rkpi{border:1px solid #e2e8f0;border-radius:12px;padding:10px 11px;background:#f8fafc;break-inside:avoid}.rkpi .rk{font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#64748b}.rkpi .rv{font-size:17px;font-weight:800;margin-top:4px;letter-spacing:-.02em;color:#0b2440}.rkpi .rs{font-size:10px;color:#64748b;margin-top:2px}.rkpi.good .rv{color:#047857}.rkpi.bad .rv{color:#b91c1c}' +
      '.rsec{margin:0 0 14px;break-inside:avoid-page}.rsec-head{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px;border-bottom:1px solid #e2e8f0;padding-bottom:5px}.rsec-head h2{margin:0;font-size:14px;font-weight:800;color:#0b2440}.rsec-head p{margin:2px 0 0;font-size:10.5px;color:#64748b}' +
      '.rcols{display:grid;grid-template-columns:1fr 1fr;gap:12px}.rchart{border:1px solid #e2e8f0;border-radius:12px;padding:8px;background:#fff;min-height:120px;break-inside:avoid}.rchart h3{margin:0 0 6px;font-size:11.5px;color:#334155}' +
      'table{width:100%;border-collapse:collapse;font-size:10.5px}th,td{padding:6px 7px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}thead th{background:#f1f5f9;color:#334155;font-size:9.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}tfoot td{font-weight:800;background:#f8fafc}.num{text-align:right}.mono{font-family:ui-monospace,Consolas,monospace}.muted{color:#64748b}.pos{color:#047857}.neg{color:#b91c1c}' +
      '.rwrap{padding:0}.rbadge{display:inline-block;padding:2px 7px;border-radius:999px;font-size:9.5px;font-weight:700;background:#e2e8f0;color:#334155}.rbadge.ok{background:#dcfce7;color:#047857}.rbadge.warn{background:#fef3c7;color:#92400e}.rbadge.bad{background:#fee2e2;color:#b91c1c}' +
      '.rfoot{margin-top:14px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;color:#64748b;font-size:10px}' +
      '.break{break-before:page}.avoid{break-inside:avoid}' +
      '@media print{.no-print{display:none !important}}' +
      '</style>';
  }

  function openReportWindow(title, bodyHtml) {
    var w = window.open('', '_blank');
    if (!w) { toast('Permite las ventanas emergentes para generar el PDF.', 'err'); return null; }
    var doc = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title>' + pdfCss() + '</head><body>' + bodyHtml +
      '<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},350);};<\/script></body></html>';
    w.document.open();
    w.document.write(doc);
    w.document.close();
    return w;
  }

  function pdfDieselReport() {
    var desde = ui.tab === 'bitacora' ? ui.bitacora.desde : ui.rep.desde;
    var hasta = ui.tab === 'bitacora' ? ui.bitacora.hasta : ui.rep.hasta;
    if (!desde || !hasta || desde > hasta) { toast('Selecciona un periodo válido.', 'err'); return; }
    var cfg = Store.getConfig();
    var daily = dailyRange(desde, hasta);
    var charges = Store.getCharges().filter(function (c) { return c.fecha >= desde && c.fecha <= hasta; });
    var boba = Store.getBoba().filter(function (b) { return b.fecha >= desde && b.fecha <= hasta; });
    var a = computeAnalytics(charges, boba, daily);
    var lecturas = daily.filter(function (d) { return d.tieneDato; }).length;
    var dias = daily.filter(function (d) { return d.tieneDato || d.n; }).length;
    var pctCobertura = daily.length ? Math.round((dias / daily.length) * 100) : 0;
    var topCat = a.byCat[0], topEq = a.topEquipos[0], topDep = a.byDepto[0];
    var t1 = (a.byTurno.find(function (x) { return x.label === '1'; }) || {}).value || 0;
    var t2 = (a.byTurno.find(function (x) { return x.label === '2'; }) || {}).value || 0;
    var turnoPct = a.totalCargas > 0 ? ('T1 ' + nf((t1 / a.totalCargas) * 100, 1) + '% · T2 ' + nf((t2 / a.totalCargas) * 100, 1) + '%') : '—';

    var snaps = snapshotCharts([
      { id: 'trend', draw: function (el) { DieselCharts.combo(el, { labels: daily.map(function (d) { return fmtShort(d.fecha); }), bars: daily.map(function (d) { return d.cargas == null ? 0 : d.cargas; }), line: daily.map(function (d) { return d.boba == null ? null : d.boba; }), barUnit: 'L cargados', lineUnit: 'L boba', aria: 'Tendencia diaria' }); } },
      { id: 'acum', draw: function (el) { if (a.cumLabels.length) DieselCharts.combo(el, { labels: a.cumLabels, bars: a.cumCargas, line: a.cumBoba, barUnit: 'L acum. cargas', lineUnit: 'L acum. boba', aria: 'Acumulado' }); else el.innerHTML = '<div class="empty-chart">Sin datos</div>'; } },
      { id: 'cat', width: 460, draw: function (el) { DieselCharts.barh(el, { labels: a.byCat.map(function (x) { return x.label; }), values: a.byCat.map(function (x) { return x.value; }), unit: 'L', aria: 'Por categoría' }); } },
      { id: 'turno', width: 460, draw: function (el) { DieselCharts.donut(el, { labels: a.byTurno.map(function (x) { return 'Turno ' + x.label; }), values: a.byTurno.map(function (x) { return x.value; }), unit: 'L', colors: ['#f59e0b', '#0ea5e9', '#8b5cf6'], aria: 'Por turno' }); } },
      { id: 'equipos', width: 460, draw: function (el) { DieselCharts.barh(el, { labels: a.topEquipos.map(function (x) { return x.label; }), values: a.topEquipos.map(function (x) { return x.value; }), unit: 'L', colors: ['#0ea5e9', '#38bdf8', '#7dd3fc', '#f59e0b', '#fbbf24', '#22c55e', '#8b5cf6', '#ef4444', '#14b8a6', '#eab308'], aria: 'Top equipos' }); } },
      { id: 'depto', width: 460, draw: function (el) { DieselCharts.barh(el, { labels: a.byDepto.map(function (x) { return x.label; }), values: a.byDepto.map(function (x) { return x.value; }), unit: 'L', colors: ['#22c55e', '#4ade80', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444'], aria: 'Por departamento' }); } }
    ]);

    var dailyRows = daily.map(function (d) {
      return '<tr><td><strong>' + esc(fmtShort(d.fecha)) + '</strong> <span class="muted">' + esc(weekday(d.fecha).slice(0, 3)) + '</span></td><td class="num">' + (d.boba == null ? '—' : nf(d.boba, 1)) + '</td><td>' + esc(d.fuente || '—') + '</td><td class="num">' + (d.cargas == null ? '—' : nf(d.cargas, 1)) + '</td><td class="num ' + (d.diff == null ? '' : Math.abs(d.diff) <= 1 ? 'pos' : 'neg') + '">' + (d.diff == null ? '—' : (d.diff > 0 ? '+' : '') + nf(d.diff, 1)) + '</td><td class="num">' + d.n + '</td><td>' + esc(d.estado || '') + '</td></tr>';
    }).join('');
    var catRows = a.byCat.map(function (x) {
      var n = charges.filter(function (c) { return c.categoria === x.label; }).length;
      var pct = a.totalCargas > 0 ? (x.value / a.totalCargas) * 100 : 0;
      return '<tr><td><strong>' + esc(x.label) + '</strong></td><td class="num">' + nf(x.value, 1) + '</td><td class="num">' + nf(pct, 1) + '%</td><td class="num">' + n + '</td><td class="num">' + nf(n ? x.value / n : 0, 1) + '</td></tr>';
    }).join('');

    var bobaRows = daily.filter(function (d) { return d.tieneDato || d.n; }).slice(0, 120).map(function (d) {
      var recs = Store.getBoba().filter(function (b) { return b.fecha === d.fecha; }).sort(function (x, y) { return String(x.turno).localeCompare(String(y.turno)); });
      var lect = recs.length ? recs.map(function (b) { return (b.turno === 'D' ? 'Día' : 'T' + b.turno) + ': ' + (b.inicial == null ? '—' : nf(b.inicial, 2)) + ' → ' + (b.final == null ? '—' : nf(b.final, 2)) + ' = ' + (b.litros == null ? '—' : nf(b.litros, 2) + ' L'); }).join('<br>') : '—';
      var diff = (d.boba == null || d.cargas == null) ? null : d.boba - d.cargas;
      return '<tr><td class="mono">' + esc(fmtShort(d.fecha)) + '</td><td>' + lect + '</td><td class="num">' + (d.boba == null ? '—' : nf(d.boba, 2)) + '</td><td class="num">' + (d.cargas == null ? '—' : nf(d.cargas, 2)) + '</td><td class="num ' + (diff == null ? '' : Math.abs(diff) <= 1 ? 'pos' : 'neg') + '">' + (diff == null ? '—' : (diff > 0 ? '+' : '') + nf(diff, 2)) + '</td></tr>';
    }).join('');

    var body = '' +
      '<div class="rcover"><div class="left"><div class="rbrand">' + reportLogoSvg(false) + '</div><h1>Reporte de Diésel</h1><div class="sub">Cuenta litros, cargas y análisis operativo</div><div class="period">Periodo: ' + esc(fmtDate(desde, true)) + ' a ' + esc(fmtDate(hasta, true)) + '</div></div>' +
      '<div class="meta"><div><strong>' + esc(cfg.empresa || 'Empresa') + '</strong></div>' + (cfg.razonSocial ? '<div>' + esc(cfg.razonSocial) + '</div>' : '') + '<div>Generado: ' + esc(fmtDateTime(new Date().toISOString())) + '</div><div class="rtag">Formato avanzado · Diésel</div></div></div>' +

      pdfSection('Resumen ejecutivo', 'Indicadores clave del periodo', '<div class="rgrid">' +
        pdfKpi('Litros boba (cuenta litros)', litros(lecturas ? a.totalBoba : null, 1), lecturas + ' días con lectura · ' + (daily.filter(function(d){return d.fuente==='día';}).length) + ' por día', '') +
        pdfKpi('Litros cargados', litros(a.totalCargas, 1), charges.length + ' renglones de carga', '') +
        pdfKpi('Diferencia', lecturas ? (a.diff > 0 ? '+' : '') + nf(a.diff, 1) + ' L' : '—', nf(a.diffPct, 1) + '% respecto a cargas', lecturas && Math.abs(a.diffPct) > 3 ? 'bad' : 'good') +
        pdfKpi('Cobertura', pctCobertura + '%', dias + ' de ' + daily.length + ' días con datos', pctCobertura >= 80 ? 'good' : '') +
        pdfKpi('Promedio diario (cargas)', litros(a.promDia || null, 1), a.daysWith + ' días con actividad', '') +
        pdfKpi('Promedio boba por día', litros(a.promBoba || null, 1), a.lecturas + ' días con lectura', '') +
        pdfKpi('Día de mayor consumo', a.pico ? litros(a.pico.cargas, 1) : '—', a.pico ? (fmtDate(a.pico.fecha) + ' · ' + a.pico.n + ' cargas') : 'Sin datos', '') +
        pdfKpi('Distribución por turno', turnoPct, 'Top cat: ' + (topCat ? topCat.label : '—') + ' · Top eq: ' + (topEq ? topEq.label : '—'), '') +
      '</div>') +

      pdfSection('Tendencia y consumo acumulado', 'Barras: litros cargados · Línea: litros boba considerados por día',
        '<div class="rchart" style="margin-bottom:10px"><h3>Consumo diario</h3>' + snaps.trend + '</div>' +
        '<div class="rchart"><h3>Consumo acumulado del periodo</h3>' + snaps.acum + '</div>') +

      pdfSection('Distribución y principales consumos', 'Categorías, turnos, equipos y departamentos',
        '<div class="rcols" style="margin-bottom:10px"><div class="rchart"><h3>Por categoría</h3>' + snaps.cat + '</div><div class="rchart"><h3>Por turno</h3>' + snaps.turno + '</div></div>' +
        '<div class="rcols"><div class="rchart"><h3>Top 10 equipos</h3>' + snaps.equipos + '</div><div class="rchart"><h3>Por departamento</h3>' + snaps.depto + '</div></div>') +

      pdfSection('Detalle por día (boba vs cargas)', 'Comparación diaria considerada (por día o turnos)',
        daily.length ? '<table><thead><tr><th>Fecha</th><th class="num">Boba</th><th>Fuente</th><th class="num">Cargas</th><th class="num">Diferencia</th><th class="num">#</th><th>Estado</th></tr></thead><tbody>' + dailyRows +
          '</tbody><tfoot><tr><td><strong>Total</strong></td><td class="num"><strong>' + nf(a.totalBoba, 1) + '</strong></td><td></td><td class="num"><strong>' + nf(a.totalCargas, 1) + '</strong></td><td class="num"><strong>' + nf(a.totalBoba - a.totalCargas, 1) + '</strong></td><td class="num"><strong>' + charges.length + '</strong></td><td></td></tr></tfoot></table>' :
          '<p class="muted">Sin datos en el periodo.</p>') +

      (catRows ? pdfSection('Detalle por categoría', 'Participación y promedios de carga',
        '<table><thead><tr><th>Categoría</th><th class="num">Litros</th><th class="num">%</th><th class="num">Cargas</th><th class="num">Promedio/carga</th></tr></thead><tbody>' + catRows + '</tbody></table>') : '') +

      pdfSection('Cuenta litros y cotejo con salidas', 'Lecturas de contador (inicial → final) vs cargas por día',
        bobaRows ? '<table><thead><tr><th>Fecha</th><th>Lecturas contador (inicial → final = litros)</th><th class="num">Contador (L)</th><th class="num">Salidas (L)</th><th class="num">Diferencia (L)</th></tr></thead><tbody>' + bobaRows + '</tbody></table>' : '<p class="muted">Sin lecturas de cuenta litros en el periodo.</p>') +

      '<div class="rfoot"><div>Control de diésel · Sierra Madre · Reporte generado automáticamente</div><div>' + esc(fmtDateTime(new Date().toISOString())) + '</div></div>';

    openReportWindow('Reporte Diésel ' + desde + ' a ' + hasta, body);
    toast('Generando reporte PDF de diésel…', 'ok');
  }

  function pdfAceitesReport() {
    var desde, hasta;
    if (ui.tab === 'bitacora-aceites' && ui.bitacoraAceites) { desde = ui.bitacoraAceites.desde; hasta = ui.bitacoraAceites.hasta; }
    else if (ui.aceites) { desde = ui.aceites.desde; hasta = ui.aceites.hasta; }
    if (!desde) desde = monthStart(todayISO());
    if (!hasta) hasta = monthEnd(todayISO());
    if (!desde || !hasta || desde > hasta) { toast('Selecciona un periodo válido de aceites.', 'err'); return; }
    var cfg = Store.getConfig();
    var dispatches = Store.getAceiteDispatches().filter(function (r) { return r.fecha >= desde && r.fecha <= hasta; });
    var meters = Store.getAceiteMeters().filter(function (r) { return r.fecha >= desde && r.fecha <= hasta; });
    var daily = aceitesDailyRange(desde, hasta);
    var a = aceitesAnalytics(dispatches, meters, daily);
    if (!dispatches.length && !meters.length) { toast('No hay datos de aceites en el periodo para generar el reporte.', 'err'); return; }
    var topProd = a.byProd[0], topEq = a.topEquipos[0], topMot = a.byMotivo[0];
    var diffG = a.totalCuenta - a.totalSalidas;

    var snaps = snapshotCharts([
      { id: 'atrend', draw: function (el) { DieselCharts.combo(el, { labels: daily.map(function (d) { return fmtShort(d.fecha); }), bars: daily.map(function (d) { return d.salidas || 0; }), line: daily.map(function (d) { return d.cuenta == null ? null : d.cuenta; }), barUnit: 'L salidas', lineUnit: 'L cuenta litros', aria: 'Tendencia aceites' }); } },
      { id: 'aprod', width: 460, draw: function (el) { DieselCharts.donut(el, { labels: a.byProd.map(function (x) { return x.label; }), values: a.byProd.map(function (x) { return x.value; }), unit: 'L', colors: ['#f59e0b', '#0ea5e9', '#22c55e', '#8b5cf6', '#ef4444'], aria: 'Por producto' }); } },
      { id: 'amot', width: 460, draw: function (el) { DieselCharts.barh(el, { labels: a.byMotivo.map(function (x) { return x.label; }), values: a.byMotivo.map(function (x) { return x.value; }), unit: 'L', aria: 'Por motivo' }); } },
      { id: 'aeq', width: 460, draw: function (el) { DieselCharts.barh(el, { labels: a.topEquipos.map(function (x) { return x.label; }), values: a.topEquipos.map(function (x) { return x.value; }), unit: 'L', colors: ['#0ea5e9', '#38bdf8', '#7dd3fc', '#f59e0b', '#fbbf24', '#22c55e', '#8b5cf6', '#ef4444', '#14b8a6', '#eab308'], aria: 'Top equipos' }); } },
      { id: 'acomp', width: 460, draw: function (el) { DieselCharts.barh(el, { labels: a.byComp.map(function (x) { return x.label; }), values: a.byComp.map(function (x) { return x.value; }), unit: 'L', colors: ['#22c55e', '#4ade80', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444'], aria: 'Por compartimento' }); } }
    ]);

    var prodRows = a.byProd.map(function (x) {
      var n = dispatches.filter(function (r) { return (Store.canonProductoAceite ? Store.canonProductoAceite(r.tipoAceite) : (r.tipoAceite || '')) === x.label; }).length;
      var pct = a.totalSalidas > 0 ? (x.value / a.totalSalidas) * 100 : 0;
      return '<tr><td><strong>' + esc(x.label) + '</strong></td><td class="num">' + nf(x.value, 1) + '</td><td class="num">' + nf(pct, 1) + '%</td><td class="num">' + n + '</td><td class="num">' + nf(n ? x.value / n : 0, 1) + '</td></tr>';
    }).join('');

    var meterRows = [];
    daily.forEach(function (d) {
      ACEITE_PRODUCTOS.forEach(function (prod) {
        var rec = Store.aceiteBobaFor ? Store.aceiteBobaFor(d.fecha, prod) : (Store.getAceiteMeters().find(function (r) { return r.fecha === d.fecha && (Store.canonProductoAceite ? Store.canonProductoAceite(r.producto) : r.producto) === prod; }));
        var salArr = Store.getAceiteDispatches().filter(function (r) { return r.fecha === d.fecha && (Store.canonProductoAceite ? Store.canonProductoAceite(r.tipoAceite) : r.tipoAceite) === prod; });
        var sal = sum(salArr, function (r) { return r.litros; });
        if (!rec && !salArr.length) return;
        var cont = rec && rec.litros != null ? rec.litros : null;
        var diff = cont == null ? null : cont - sal;
        meterRows.push('<tr><td class="mono">' + esc(fmtShort(d.fecha)) + '</td><td>' + esc(prod) + '</td><td class="num">' + (rec && rec.inicial != null ? nf(rec.inicial, 2) : '—') + '</td><td class="num">' + (rec && rec.final != null ? nf(rec.final, 2) : '—') + '</td><td class="num">' + (cont == null ? '—' : nf(cont, 2)) + '</td><td class="num">' + nf(sal || 0, 2) + '</td><td class="num ' + (diff == null ? '' : Math.abs(diff) <= 1 ? 'pos' : 'neg') + '">' + (diff == null ? '—' : (diff > 0 ? '+' : '') + nf(diff, 2)) + '</td></tr>');
      });
    });

    var dispRows = dispatches.slice().sort(function (a, b) { return a.fecha.localeCompare(b.fecha) || (a.equipo || '').localeCompare(b.equipo || ''); }).slice(0, 200).map(function (r) {
      return '<tr><td class="mono">' + esc(fmtShort(r.fecha)) + '</td><td><strong>' + esc(r.equipo || '') + '</strong></td><td>' + esc(r.tipoAceite || '') + '</td><td>' + esc(r.compartimento || '') + '</td><td>' + esc(r.motivo || '') + '</td><td class="num">' + nf(r.litros, 2) + '</td><td>' + esc(r.mecanico || '') + '</td><td class="mono">' + esc(r.folio || '') + '</td></tr>';
    }).join('');

    var body = '' +
      '<div class="rcover"><div class="left"><div class="rbrand">' + reportLogoSvg(false) + '</div><h1>Reporte de Aceites</h1><div class="sub">Motor Shell e Hidráulico Shell · salidas, cuenta litros y análisis</div><div class="period">Periodo: ' + esc(fmtDate(desde, true)) + ' a ' + esc(fmtDate(hasta, true)) + '</div></div>' +
      '<div class="meta"><div><strong>' + esc(cfg.empresa || 'Empresa') + '</strong></div>' + (cfg.razonSocial ? '<div>' + esc(cfg.razonSocial) + '</div>' : '') + '<div>Generado: ' + esc(fmtDateTime(new Date().toISOString())) + '</div><div class="rtag">Formato avanzado · Aceites</div></div></div>' +

      pdfSection('Resumen ejecutivo', 'Indicadores clave del periodo', '<div class="rgrid">' +
        pdfKpi('Litros salidas', nf(a.totalSalidas, 1) + ' L', a.registros + ' renglones de despacho', '') +
        pdfKpi('Litros cuenta litros', nf(a.totalCuenta, 1) + ' L', a.lecturas + ' lecturas registradas', '') +
        pdfKpi('Diferencia global', nf(diffG, 1) + ' L', 'cuenta litros — salidas', Math.abs(diffG) > 1 ? 'bad' : 'good') +
        pdfKpi('Promedio diario', nf(a.promDia, 1) + ' L', a.daysWith + ' días con actividad', '') +
        pdfKpi('Día pico (salidas)', a.pico && a.pico.salidas ? nf(a.pico.salidas, 1) + ' L' : '—', a.pico && a.pico.salidas ? fmtDate(a.pico.fecha) : 'Sin datos', '') +
        pdfKpi('Top producto', topProd ? topProd.label : '—', topProd ? nf(topProd.value, 1) + ' L' : '', '') +
        pdfKpi('Top equipo', topEq ? topEq.label : '—', topEq ? nf(topEq.value, 1) + ' L' : '', '') +
        pdfKpi('Top motivo', topMot ? topMot.label : '—', topMot ? nf(topMot.value, 1) + ' L' : '', '') +
      '</div>') +

      pdfSection('Tendencia de consumo', 'Barras: litros de salidas por día · Línea: litros cuenta litros (suma productos)',
        '<div class="rchart">' + snaps.atrend + '</div>') +

      pdfSection('Distribución de consumo', 'Por producto, motivo, equipo y compartimento',
        '<div class="rcols" style="margin-bottom:10px"><div class="rchart"><h3>Por producto</h3>' + snaps.aprod + '</div><div class="rchart"><h3>Por motivo</h3>' + snaps.amot + '</div></div>' +
        '<div class="rcols"><div class="rchart"><h3>Top 10 equipos</h3>' + snaps.aeq + '</div><div class="rchart"><h3>Por compartimento</h3>' + snaps.acomp + '</div></div>') +

      (prodRows ? pdfSection('Detalle por producto', 'Participación y promedios de salida',
        '<table><thead><tr><th>Producto</th><th class="num">Litros</th><th class="num">%</th><th class="num">Salidas</th><th class="num">Promedio/salida</th></tr></thead><tbody>' + prodRows + '</tbody></table>') : '') +

      pdfSection('Cuenta litros y cotejo con salidas', 'Lecturas por producto y día (contador vs salidas)',
        meterRows.length ? '<table><thead><tr><th>Fecha</th><th>Producto</th><th class="num">Inicial</th><th class="num">Final</th><th class="num">Contador (L)</th><th class="num">Salidas (L)</th><th class="num">Diferencia (L)</th></tr></thead><tbody>' + meterRows.join('') + '</tbody></table>' : '<p class="muted">Sin lecturas de cuenta litros en el periodo.</p>') +

      (dispRows ? pdfSection('Detalle de salidas/despachos', dispatches.length > 200 ? 'Mostrando primeros 200 de ' + dispatches.length + ' renglones' : dispatches.length + ' renglones del periodo',
        '<table><thead><tr><th>Fecha</th><th>Equipo</th><th>Tipo de aceite</th><th>Compartimento</th><th>Motivo</th><th class="num">Litros</th><th>Mecánico</th><th>Folio</th></tr></thead><tbody>' + dispRows + '</tbody></table>') : '') +

      '<div class="rfoot"><div>Control de diésel y aceites · Sierra Madre · Reporte generado automáticamente</div><div>' + esc(fmtDateTime(new Date().toISOString())) + '</div></div>';

    openReportWindow('Reporte Aceites ' + desde + ' a ' + hasta, body);
    toast('Generando reporte PDF de aceites…', 'ok');
  }

})();

