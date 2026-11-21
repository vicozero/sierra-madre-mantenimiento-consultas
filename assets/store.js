/* =============================================================
   Store — capa de datos
   - Lee/escribe JSON en un repositorio de GitHub (Contents API)
   - Mantiene caché en localStorage y una cola de cambios pendientes
   - Si no hay repositorio configurado, funciona en modo local
   Dos tipos de registro en el mismo archivo mensual:
     { tipo:'carga', ... }  consumo por equipo y turno
     { tipo:'boba',  ... }  lecturas del cuenta-litros de la boba
   API pública: Store.init(), Store.save(), Store.importData(), ...
   ============================================================= */
window.Store = (function () {
  'use strict';

  const API = 'https://api.github.com';
  const K = {
    remote: 'diesel.remote.v1',
    token: 'diesel.token.v1',
    tokenSession: 'diesel.token.session.v1',
    data: 'diesel.data.v2',
    pending: 'diesel.pending.v2',
    config: 'diesel.config.v2',
    demo: 'diesel.demo.v2'
  };

  const state = {
    remote: { owner: '', repo: '', branch: 'main', dir: 'data' },
    token: '',
    config: defaultConfig(),
    records: [],
    pending: [],
    periods: [],
    lastSync: null,
    source: 'local',        // 'local' | 'github' | 'github-offline'
    syncing: false,
    demo: false,
    lastError: null,
    ready: false
  };

  const listeners = [];
  let flushPromise = null;

  /* ------------------------------ utilidades ------------------------------ */

  const nowISO = () => new Date().toISOString();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function round(v, d) {
    const p = Math.pow(10, d);
    return Math.round((Number(v) + Number.EPSILON) * p) / p;
  }

  function num(v, fallback) {
    if (v === null || v === undefined || v === '') return fallback;
    if (typeof v === 'string' && v.trim() === '') return fallback;
    const n = Number(String(v).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : fallback;
  }

  function txt(v, max) {
    const s = v === null || v === undefined ? '' : String(v).trim();
    return max ? s.slice(0, max) : s;
  }

  const periodOf = (r) => String(r && r.fecha).slice(0, 7);
  const id = (tipo) => (tipo === 'boba' ? 'b' : 'c') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function uniquePeriods(arr) {
    return Array.from(new Set(arr.map((x) => String(x)).filter((p) => /^\d{4}(-\d{2})?$/.test(p)))).sort();
  }

  /* ------------------------------ configuración ------------------------------ */

  function defaultConfig() {
    return {
      empresa: 'Mi Empresa',
      razonSocial: '',
      tituloBitacora: 'BITACORA CONSUMO DIESEL',
      moneda: 'MXN',
      precioDefault: 24.5,
      contadorMax: 1000000,
      turnos: ['Turno 1', 'Turno 2'],
      categorias: [
        { id: 'EDM', nombre: 'Equipo diésel de mina' },
        { id: 'VLG', nombre: 'Vehículos ligeros' },
        { id: 'GEN', nombre: 'Generación de energía' },
        { id: 'EXT', nombre: 'Externo' },
        { id: 'LAB', nombre: 'Laboratorio' },
        { id: 'EPJ', nombre: 'Equipo presa de jales' },
        { id: 'EDP', nombre: 'Equipo diésel planta de beneficio' },
        { id: 'MTP', nombre: 'Mantenimiento planta' },
        { id: 'PRO', nombre: 'Proyectos' },
        { id: 'PLA', nombre: 'Planta' }
      ],
      departamentos: ['Mina', 'Planta Beneficio', 'Proyectos', 'Mantenimiento'],
      equipos: [],
      operadores: [],
      responsables: [],
      ubicaciones: []
    };
  }

  function normalizeConfig(raw) {
    const base = defaultConfig();
    const src = raw && typeof raw === 'object' ? raw : {};
    const c = Object.assign({}, base, src);

    c.empresa = txt(c.empresa, 120) || base.empresa;
    c.razonSocial = txt(c.razonSocial, 160);
    c.tituloBitacora = txt(c.tituloBitacora, 240) || base.tituloBitacora;
    c.moneda = txt(c.moneda, 3).toUpperCase() || 'MXN';
    c.precioDefault = num(c.precioDefault, base.precioDefault);
    c.contadorMax = num(c.contadorMax, base.contadorMax);
    if (!(c.contadorMax > 0)) c.contadorMax = base.contadorMax;

    c.turnos = Array.isArray(src.turnos) && src.turnos.length
      ? src.turnos.map((t) => txt(t, 24)).filter(Boolean)
      : base.turnos;

    const cats = Array.isArray(src.categorias) ? src.categorias : base.categorias;
    c.categorias = cats.map((x) => {
      if (typeof x === 'string') return { id: txt(x, 8).toUpperCase(), nombre: txt(x, 60) };
      return { id: txt(x && (x.id || x.codigo), 8).toUpperCase(), nombre: txt(x && x.nombre, 60) };
    }).filter((x) => x.id);

    const list = (arr) => (Array.isArray(arr) ? Array.from(new Set(arr.map((x) => txt(x, 80)).filter(Boolean))) : []);
    c.departamentos = list(src.departamentos);
    c.operadores = list(src.operadores);
    c.responsables = list(src.responsables);
    c.ubicaciones = list(src.ubicaciones);

    c.equipos = (Array.isArray(src.equipos) ? src.equipos : []).map((e) => {
      if (typeof e === 'string') return { id: txt(e, 60), categoria: '', departamento: '' };
      return {
        id: txt(e && e.id, 60),
        categoria: txt(e && e.categoria, 8).toUpperCase(),
        departamento: txt(e && e.departamento, 60)
      };
    }).filter((e) => e.id);

    return c;
  }

  /* ------------------------------ registros ------------------------------ */

  function bobaLitros(inicial, final, max) {
    if (inicial == null || final == null) return null;
    const tope = max > 0 ? max : 1000000;
    if (final >= inicial) return round(final - inicial, 3);
    // Vuelta de contador: solo si el inicial está al final de la escala
    if (inicial >= tope * 0.9 && final <= tope * 0.1) {
      return round((tope - inicial) + final, 3);
    }
    return round(final - inicial, 3); // dato inconsistente (queda negativo)
  }

  function canonProductoAceite(v) {
    const s = txt(v, 80).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!s) return '';
    if (s.indexOf('motor') !== -1) return 'Motor Shell';
    if (s.indexOf('hidraul') !== -1 || s.indexOf('spirax') !== -1) return 'Hidráulico Shell';
    return txt(v, 80);
  }

  function normalizeRecord(r, cfg) {
    if (!r || typeof r !== 'object') return null;
    const c = cfg || state.config;
    const fecha = txt(r.fecha, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;

    let tipo = 'carga';
    if (r.tipo === 'boba') tipo = 'boba';
    else if (r.tipo === 'aceite') tipo = 'aceite';
    else if (r.tipo === 'aceite_boba' || r.tipo === 'aceiteBoba' || r.tipo === 'aceite-meter') tipo = 'aceite_boba';
    else if (r.tipo === 'aceite_entrada' || r.tipo === 'aceiteEntrada' || r.tipo === 'entrada_aceite') tipo = 'aceite_entrada';

    const base = {
      id: txt(r.id, 40),
      tipo: tipo,
      fecha: fecha,
      notas: txt(r.notas, 240),
      creado: r.creado || nowISO(),
      actualizado: r.actualizado || r.creado || nowISO()
    };

    if (tipo === 'boba') {
      const rawTurno = String(r.turno == null ? '' : r.turno).trim().toUpperCase();
      let turno = '';
      if (/^[123]$/.test(rawTurno)) turno = rawTurno;
      else if (rawTurno === 'D' || rawTurno === 'DIA' || rawTurno === 'DIARIO') turno = 'D';
      else if (r.modo === 'dia') turno = 'D';
      if (!turno) return null;
      let inicial = num(r.inicial, null);
      let final = num(r.final, null);
      if (inicial == null && final == null) return null;
      let litros = bobaLitros(inicial, final, c.contadorMax);
      if (litros == null) litros = num(r.litros, null);
      return Object.assign(base, {
        turno: turno,
        inicial: inicial == null ? null : round(inicial, 3),
        final: final == null ? null : round(final, 3),
        litros: litros == null ? null : round(litros, 3),
        operador: txt(r.operador, 80)
      });
    }

    if (tipo === 'aceite_boba') {
      const producto = canonProductoAceite(r.producto || r.tipoAceite || r.aceite);
      if (!producto) return null;
      let inicial = num(r.inicial, null);
      let final = num(r.final, null);
      if (inicial == null && final == null) return null;
      let litros = bobaLitros(inicial, final, c.contadorMaxAceites || c.contadorMax || 1000000);
      if (litros == null) litros = num(r.litros, null);
      return Object.assign(base, {
        producto: producto,
        inicial: inicial == null ? null : round(inicial, 3),
        final: final == null ? null : round(final, 3),
        litros: litros == null ? null : round(litros, 3),
        operador: txt(r.operador, 80)
      });
    }

    if (tipo === 'aceite_entrada') {
      const producto = canonProductoAceite(r.producto || r.tipoAceite || r.aceite);
      if (!producto) return null;
      const litros = num(r.litros, null);
      if (!(litros > 0)) return null;
      return Object.assign(base, {
        producto: producto,
        litros: round(litros, 3),
        concepto: txt(r.concepto, 40) || 'Llegada de aceite',
        proveedor: txt(r.proveedor, 80),
        folio: txt(r.folio, 40)
      });
    }

    if (tipo === 'aceite') {
      const litros = num(r.litros, 0);
      if (!(litros > 0)) return null;
      const equipo = txt(r.equipo, 80);
      if (!equipo) return null;
      const horRaw = r.horometro;
      const horNum = num(horRaw, null);
      const precio = num(r.precio, null);
      const importe = num(r.importe, null);
      return Object.assign(base, {
        equipo: equipo,
        descripcion: txt(r.descripcion, 160),
        horometro: horNum != null ? round(horNum, 2) : (txt(horRaw, 24) || null),
        tipoAceite: canonProductoAceite(r.tipoAceite) || txt(r.tipoAceite, 80),
        compartimento: txt(r.compartimento, 80),
        motivo: txt(r.motivo, 120),
        litros: round(litros, 3),
        precio: precio == null ? null : round(precio, 4),
        importe: importe == null ? (precio != null ? round(litros * precio, 2) : null) : round(importe, 2),
        mecanico: txt(r.mecanico, 80),
        responsable: txt(r.responsable, 80),
        folio: txt(r.folio, 40)
      });
    }

    const litros = num(r.litros, 0);
    if (!(litros > 0)) return null;
    const equipo = txt(r.equipo, 80);
    if (!equipo) return null;
    const horRaw = r.horometro;
    const horNum = num(horRaw, null);
    return Object.assign(base, {
      turno: /^[123]$/.test(String(r.turno)) ? String(r.turno) : '1',
      categoria: txt(r.categoria, 8).toUpperCase(),
      equipo: equipo,
      horometro: horNum != null ? round(horNum, 2) : (txt(horRaw, 24) || null),
      litros: round(litros, 3),
      departamento: txt(r.departamento, 80),
      operador: txt(r.operador, 80),
      responsable: txt(r.responsable, 80),
      folio: txt(r.folio, 40),
      ubicacion: txt(r.ubicacion, 60)
    });
  }

  function sortRecords(arr) {
    return arr.slice().sort((a, b) => {
      if (a.fecha !== b.fecha) return String(a.fecha).localeCompare(String(b.fecha));
      if (a.turno !== b.turno) return String(a.turno).localeCompare(String(b.turno));
      if (a.tipo !== b.tipo) return a.tipo === 'boba' ? -1 : 1;
      return String(a.equipo || '').localeCompare(String(b.equipo || '')) ||
        String(a.creado || '').localeCompare(String(b.creado || ''));
    });
  }

  /** Clave natural para reconocer el mismo renglón al importar. */
  function naturalKey(r) {
    if (r.tipo === 'boba') return 'b|' + r.fecha + '|' + r.turno;
    if (r.tipo === 'aceite_boba') return 'ab|' + r.fecha + '|' + (r.producto || '');
    if (r.tipo === 'aceite_entrada') return ['ae', r.fecha, r.producto || '', r.concepto || '', r.folio || '', r.litros].join('|');
    if (r.tipo === 'aceite') return ['a', r.fecha, r.equipo, r.tipoAceite || '', r.folio || ''].join('|');
    return ['c', r.fecha, r.turno, r.equipo, r.categoria, r.folio].join('|');
  }

  function applyOp(arr, op) {
    if (!op) return arr;
    if (op.op === 'delete') return arr.filter((r) => r.id !== op.id);
    if (op.op === 'replace') {
      return (op.records || []).map((r) => normalizeRecord(r)).filter(Boolean);
    }
    const i = arr.findIndex((r) => r.id === op.id);
    if (i >= 0) arr[i] = op.record;
    else arr.push(op.record);
    return arr;
  }

  function notify() {
    listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } });
  }

  function onChange(fn) {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /* ------------------------------ persistencia local ------------------------------ */

  function readLS(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeLS(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { console.warn('Almacenamiento local no disponible', e); }
  }

  function readToken() {
    const pick = (storage, key) => {
      try {
        const raw = storage.getItem(key);
        if (!raw) return '';
        try { return JSON.parse(raw); } catch (e) { return raw; }
      } catch (e) { return ''; }
    };
    return pick(localStorage, K.token) || pick(sessionStorage, K.tokenSession) || '';
  }

  function writeToken(token, remember) {
    try {
      if (!token) {
        localStorage.removeItem(K.token);
        sessionStorage.removeItem(K.tokenSession);
        return;
      }
      if (remember) {
        localStorage.setItem(K.token, JSON.stringify(token));
        sessionStorage.removeItem(K.tokenSession);
      } else {
        sessionStorage.setItem(K.tokenSession, JSON.stringify(token));
        localStorage.removeItem(K.token);
      }
    } catch (e) { /* almacenamiento bloqueado: el token vive solo en memoria */ }
  }

  function hasRememberedToken() {
    try { return !!localStorage.getItem(K.token); } catch (e) { return false; }
  }

  function persistData() {
    writeLS(K.data, { records: state.records, lastSync: state.lastSync });
    writeLS(K.pending, state.pending);
  }
  function persistConfig() { writeLS(K.config, state.config); }
  function persistRemote() { writeLS(K.remote, state.remote); }
  function persistDemo() { writeLS(K.demo, state.demo); }

  function persistLocal() {
    persistData();
    persistConfig();
    persistRemote();
    persistDemo();
  }

  /* ------------------------------ GitHub ------------------------------ */

  function isRemote() {
    return !!(state.remote.owner && state.remote.repo && state.token);
  }
  function repoUrl() {
    const { owner, repo } = state.remote;
    return owner && repo ? `https://github.com/${owner}/${repo}` : '';
  }
  function displayPath(file) {
    return [state.remote.dir, file].filter(Boolean).join('/');
  }
  function encPath(p) {
    return p.split('/').map(encodeURIComponent).join('/');
  }

  function ghHeaders() {
    const h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (state.token) h.Authorization = 'Bearer ' + state.token;
    return h;
  }

  async function ghFetch(url, options) {
    const opts = options || {};
    const res = await fetch(url, Object.assign({}, opts, {
      headers: Object.assign({}, ghHeaders(), opts.body ? { 'Content-Type': 'application/json' } : {}, opts.headers || {})
    }));
    let body = null;
    const text = await res.text();
    if (text) { try { body = JSON.parse(text); } catch (e) { body = { raw: text }; } }
    if (!res.ok) {
      const err = new Error((body && body.message) || ('Error HTTP ' + res.status));
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return { body: body, status: res.status };
  }

  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(bin);
  }

  function b64decode(b64) {
    const clean = String(b64 || '').replace(/\s/g, '');
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /**
   * Lee un archivo del repo. Devuelve {data, sha} o {missing:true}.
   * Con token usa la API (sirve para repos privados y devuelve sha);
   * sin token usa raw.githubusercontent.com (solo repos públicos).
   */
  async function readJson(path) {
    const { owner, repo, branch } = state.remote;
    if (state.token) {
      const url = `${API}/repos/${owner}/${repo}/contents/${encPath(path)}?ref=${encodeURIComponent(branch)}`;
      try {
        const { body } = await ghFetch(url, { cache: 'no-store' });
        if (!body || typeof body.content !== 'string') return { missing: true };
        const raw = b64decode(body.content);
        if (!raw.trim()) return { data: null, sha: body.sha };
        let data = null;
        try { data = JSON.parse(raw); }
        catch (e) { throw new Error('El archivo ' + path + ' no contiene JSON válido.'); }
        return { data: data, sha: body.sha };
      } catch (err) {
        if (err.status === 404) return { missing: true };
        throw err;
      }
    }
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${encPath(path)}?v=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (res.status === 404) return { missing: true };
    if (!res.ok) throw new Error('No se pudo leer ' + path + ' (' + res.status + '). ¿El repositorio es público?');
    const txtFile = await res.text();
    if (!txtFile.trim()) return { data: null, sha: null };
    try { return { data: JSON.parse(txtFile), sha: null }; }
    catch (e) { throw new Error('El archivo ' + path + ' no contiene JSON válido.'); }
  }

  /** Lee un JSON público servido por el propio sitio (GitHub Pages), sin token ni CORS. */
  async function readJsonPublic(path) {
    const url = path + (path.indexOf('?') === -1 ? '?' : '&') + 'v=' + Date.now();
    const res = await fetch(url, { cache: 'no-store' });
    if (res.status === 404) return { missing: true };
    if (!res.ok) throw new Error('No se pudo leer ' + path + ' (' + res.status + ').');
    const text = await res.text();
    if (!text.trim()) return { data: null, sha: null };
    try { return { data: JSON.parse(text), sha: null }; }
    catch (e) { throw new Error('El archivo ' + path + ' no contiene JSON válido.'); }
  }

  async function writeFile(path, content, sha, message) {
    if (!state.token) throw new Error('Falta el token de GitHub para guardar.');
    const { owner, repo, branch } = state.remote;
    const url = `${API}/repos/${owner}/${repo}/contents/${encPath(path)}`;
    const payload = { message: message, content: b64encode(content), branch: branch };
    if (sha) payload.sha = sha;
    const res = await fetch(url, {
      method: 'PUT',
      headers: Object.assign(ghHeaders(), { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
    if (res.status === 409 || res.status === 422) {
      const err = new Error('Otra persona guardó cambios al mismo tiempo. Se reintentará.');
      err.code = 'conflict';
      throw err;
    }
    if (!res.ok) {
      let msg = 'No se pudo guardar (' + res.status + ').';
      try { const b = await res.json(); if (b && b.message) msg = b.message; } catch (e) {}
      if (res.status === 401) msg = 'Token inválido o expirado.';
      if (res.status === 403) msg = 'El token no tiene permiso de escritura (Contents: Read and write).';
      throw new Error(msg);
    }
    return res.json();
  }

  function fileText(arr) {
    return JSON.stringify(arr, null, 2) + '\n';
  }

  async function pushPeriod(period, ops) {
    const path = displayPath(period + '.json');
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await readJson(path);
      let arr = current.missing ? [] : (Array.isArray(current.data) ? current.data.slice() : []);
      arr = arr.map((r) => normalizeRecord(r)).filter(Boolean);
      ops.forEach((op) => { arr = applyOp(arr, op); });
      arr = sortRecords(arr);
      try {
        await writeFile(path, fileText(arr), current.sha,
          'diésel: ' + ops.length + ' cambio(s) — ' + period);
        mergePeriodIntoMemory(period, arr);
        return arr;
      } catch (err) {
        lastErr = err;
        if (err.code === 'conflict' && attempt < 2) { await sleep(500 * (attempt + 1)); continue; }
        throw err;
      }
    }
    throw lastErr || new Error('No se pudo guardar ' + path);
  }

  function mergePeriodIntoMemory(period, remoteArr) {
    const others = state.records.filter((r) => periodOf(r) !== period);
    let arr = remoteArr
      .map((r) => normalizeRecord(r))
      .filter(Boolean)
      .filter((r) => periodOf(r) === period);
    // Reaplicar cambios pendientes de ese periodo que hayan llegado entretanto
    state.pending.filter((p) => p.period === period).forEach((op) => { arr = applyOp(arr, op); });
    state.records = sortRecords(others.concat(arr));
    state.periods = uniquePeriods(state.records.map(periodOf));
  }

  async function updateIndex(periods) {
    const path = displayPath('index.json');
    try {
      const current = await readJson(path);
      const prev = (current.data && (current.data.periods || current.data.years)) || [];
      const next = uniquePeriods(prev.concat(periods).concat(state.periods));
      const text = JSON.stringify({ periods: next }, null, 2) + '\n';
      if (current.missing || JSON.stringify({ periods: uniquePeriods(prev) }) !== JSON.stringify({ periods: next })) {
        await writeFile(path, text, current.sha, 'diésel: índice de periodos');
      }
    } catch (e) {
      // No es crítico: el índice se puede reconstruir
      console.warn('Índice no actualizado:', e.message);
    }
  }

  /* ------------------------------ lectura ------------------------------ */

  function getConfig() { return state.config; }
  function getRecords() { return state.records; }
  function getCharges() { return state.records.filter((r) => r.tipo === 'carga'); }
  function getBoba() { return state.records.filter((r) => r.tipo === 'boba'); }
  function getAceiteDispatches() { return state.records.filter((r) => r.tipo === 'aceite'); }
  function getAceiteMeters() { return state.records.filter((r) => r.tipo === 'aceite_boba'); }
  function getAceiteEntradas() { return state.records.filter((r) => r.tipo === 'aceite_entrada'); }
  function aceiteEntradasFor(fecha, producto) {
    const p = canonProductoAceite(producto);
    const list = state.records.filter((r) => r.tipo === 'aceite_entrada' && r.fecha === fecha && canonProductoAceite(r.producto) === p);
    return { list: list, total: list.reduce((a, b) => a + (Number(b.litros) || 0), 0) };
  }
  function getState() { return state; }
  function isDemo() { return state.demo; }
  function isRemoteReady() { return isRemote(); }
  function pendingCount() { return state.pending.length; }

  function bobaFor(fecha, turno) {
    return state.records.find((r) => r.tipo === 'boba' && r.fecha === fecha && r.turno === String(turno)) || null;
  }

  function bobaDayInfo(fecha) {
    const list = state.records.filter((r) => r.tipo === 'boba' && r.fecha === fecha);
    const day = list.find((r) => r.turno === 'D') || null;
    const shifts = list.filter((r) => r.turno !== 'D').sort((a, b) => String(a.turno).localeCompare(String(b.turno)));
    const shiftLitros = shifts.reduce((a, b) => a + (Number(b.litros) || 0), 0);
    const shiftClosed = shifts.filter((b) => b.litros != null);
    let total = null;
    let fuente = 'sin datos';
    if (day && day.litros != null) {
      total = Number(day.litros);
      fuente = 'día';
    } else if (shiftClosed.length) {
      total = shiftLitros;
      fuente = 'turnos';
    } else if (day && day.inicial != null) {
      fuente = 'día (en curso)';
    } else if (shifts.length) {
      fuente = 'turnos (incompleto)';
    }
    return {
      fecha: fecha,
      day: day,
      shifts: shifts,
      total: total,
      fuente: fuente,
      lecturas: (day && day.litros != null ? 1 : 0) + shiftClosed.length,
      tieneDato: total != null
    };
  }

  function aceiteBobaFor(fecha, producto) {
    const p = canonProductoAceite(producto);
    return state.records.find((r) => r.tipo === 'aceite_boba' && r.fecha === fecha && r.producto === p) || null;
  }
  function aceiteDayInfo(fecha, producto) {
    const p = canonProductoAceite(producto);
    const rec = aceiteBobaFor(fecha, p);
    const salidas = state.records.filter((r) => r.tipo === 'aceite' && r.fecha === fecha && canonProductoAceite(r.tipoAceite) === p);
    const totalSalidas = salidas.reduce((a, b) => a + (Number(b.litros) || 0), 0);
    const totalCuenta = rec && rec.litros != null ? Number(rec.litros) : null;
    const entradas = aceiteEntradasFor(fecha, p);
    const totalEntradas = entradas.total;
    // El contador mide el movimiento bruto; las entradas (llegadas o ajustes) no son consumo.
    const consumo = totalCuenta == null ? null : totalCuenta - totalEntradas;
    return {
      fecha, producto: p, rec, salidas, totalSalidas,
      totalCuenta, movimiento: totalCuenta, totalEntradas, entradas: entradas.list, consumo,
      diff: consumo == null ? null : consumo - totalSalidas,
      tieneDato: totalCuenta != null
    };
  }

  /* ------------------------------ init ------------------------------ */

  function init() {
    const remote = readLS(K.remote);
    if (remote && typeof remote === 'object') {
      state.remote = {
        owner: String(remote.owner || ''),
        repo: String(remote.repo || ''),
        branch: String(remote.branch || 'main'),
        dir: String(remote.dir || 'data').replace(/^\/+|\/+$/g, '')
      };
    }
    state.token = readToken();
    const cfg = readLS(K.config);
    if (cfg) state.config = normalizeConfig(cfg);

    const data = readLS(K.data);
    if (data && Array.isArray(data.records)) {
      state.records = sortRecords(data.records.map((r) => normalizeRecord(r)).filter(Boolean));
      state.lastSync = data.lastSync || null;
    }

    const pending = readLS(K.pending);
    if (Array.isArray(pending)) {
      state.pending = pending
        .filter((p) => p && p.op)
        .map((p) => {
          const period = p.period || String(p.year || (p.record && periodOf(p.record)) || '');
          return Object.assign({}, p, { period: period });
        })
        .filter((p) => /^\d{4}(-\d{2})?$/.test(p.period) &&
          (p.op === 'replace' ? Array.isArray(p.records) : !!p.id));
    }
    state.pending.forEach((op) => {
      if (op.op === 'upsert' && op.record) {
        const rec = normalizeRecord(op.record);
        if (rec) applyOp(state.records, Object.assign({}, op, { record: rec }));
      } else {
        state.records = applyOp(state.records, op);
      }
    });
    state.records = sortRecords(state.records);
    state.demo = !!readLS(K.demo);
    state.periods = uniquePeriods(state.records.map(periodOf));
    state.ready = true;

    if (isRemote()) {
      state.source = 'github';
      return pull().catch((err) => {
        state.lastError = err.message;
        state.source = isRemote() ? 'github-offline' : 'local';
        notify();
      });
    }
    state.source = 'local';
    // Sin token, la página lee igualmente los datos públicos del sitio (modo solo lectura).
    const finish = async () => {
      try { await pullPublic({ silent: true }); }
      catch (err) { state.lastError = err.message; }
      notify();
    };
    if (!cfg) return loadLocalConfig().then(finish, finish);
    return finish();
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', function () {
      if (isRemote() && state.pending.length && !state.syncing) {
        pushPending().catch(function () {});
      }
    });

    // En modo solo lectura, refrescar los datos compartidos al volver a la pestaña.
    let lastAutoPull = 0;
    const autoPull = async () => {
      if (isRemote() || state.demo || state.syncing) return;
      if (Date.now() - lastAutoPull < 30000) return;
      lastAutoPull = Date.now();
      try { await pullPublic({ silent: true }); } catch (e) { /* se reintenta después */ }
    };
    window.addEventListener('focus', autoPull);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () { if (!document.hidden) autoPull(); });
      window.setInterval(function () { if (!document.hidden) autoPull(); }, 60000);
    }
  }

  /** En modo local intenta leer config.json del mismo sitio (GitHub Pages). */
  async function loadLocalConfig() {
    try {
      const res = await fetch('config.json', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data && typeof data === 'object') {
        state.config = normalizeConfig(data);
        persistConfig();
      }
    } catch (e) { /* sin config.json: se usa el ejemplo */ }
  }

  async function pullWith(reader, opts) {
    const o = opts || {};
    const dir = String(state.remote.dir || 'data');
    const indexPath = o.indexPath || (dir + '/index.json');
    const periodPath = (p) => dir + '/' + p + '.json';

    state.lastError = null;
    const cfgRes = await reader('config.json');
    if (!cfgRes.missing && cfgRes.data) {
      state.config = normalizeConfig(cfgRes.data);
      persistConfig();
    }
    const idx = await reader(indexPath);
    const idxPeriods = idx.data
      ? (Array.isArray(idx.data.periods) ? idx.data.periods : (Array.isArray(idx.data.years) ? idx.data.years : []))
      : [];
    const localPeriods = uniquePeriods(state.records.map(periodOf).concat(state.pending.map((p) => p.period)));
    const periods = uniquePeriods(idxPeriods.concat(localPeriods));

    const results = await Promise.all(periods.map((period) =>
      reader(periodPath(period))
        .then((r) => ({ period: period, data: r.missing ? [] : r.data }))
        .catch((err) => ({ period: period, error: err }))
    ));

    const loadedPeriods = new Map();
    const errors = [];
    results.forEach((r) => {
      if (r.error) { errors.push(r.period + ': ' + r.error.message); return; }
      const arr = (Array.isArray(r.data) ? r.data : []).map((x) => normalizeRecord(x)).filter(Boolean);
      loadedPeriods.set(r.period, arr);
    });

    // En modo solo lectura no se borran datos locales de un periodo que el sitio tenga vacío.
    if (o.preserveLocal) {
      loadedPeriods.forEach((arr, period) => {
        const local = state.records.filter((rec) => periodOf(rec) === period);
        const hasPending = state.pending.some((p) => p.period === period);
        if (!arr.length && local.length && !hasPending) loadedPeriods.delete(period);
      });
    }

    const before = state.records;
    state.records = sortRecords(
      before.filter((rec) => !loadedPeriods.has(periodOf(rec)))
        .concat(Array.from(loadedPeriods.values()).reduce((a, b) => a.concat(b), []))
    );
    // Reaplicar pendientes (por si el remoto aún no los tiene)
    state.pending.forEach((op) => {
      if (op.op === 'upsert' && op.record) applyOp(state.records, op);
      else state.records = applyOp(state.records, op);
    });
    state.records = sortRecords(state.records.map((r) => normalizeRecord(r)).filter(Boolean));

    state.periods = uniquePeriods(state.records.map(periodOf));
    state.source = o.readOnly ? 'github-readonly' : 'github';
    state.lastSync = nowISO();
    const changed = JSON.stringify(before) !== JSON.stringify(state.records);
    persistData();
    if (changed || !o.silent) notify();
    return { ok: true, periods: periods.length, errors: errors, changed: changed };
  }

  async function pull() {
    if (!isRemote()) {
      state.source = 'local';
      return { ok: false, reason: 'sin-configurar' };
    }
    return pullWith(readJson);
  }

  /** Sin token: lee los JSON públicos del propio sitio (GitHub Pages). */
  async function pullPublic(opts) {
    return pullWith(readJsonPublic, { readOnly: true, preserveLocal: true, silent: !!(opts && opts.silent) });
  }

  async function sync() {
    if (state.demo) throw new Error('Estás viendo datos de ejemplo. Bórralos antes de sincronizar.');
    if (state.syncing && flushPromise) return flushPromise;

    // Sin token: el botón Sincronizar solo actualiza la lectura compartida.
    if (!isRemote()) {
      state.syncing = true;
      state.lastError = null;
      notify();
      try {
        const pulled = await pullPublic();
        return { ok: true, pulled: pulled, pushed: null };
      } catch (err) {
        state.lastError = err.message;
        state.source = 'local';
        notify();
        throw err;
      } finally {
        state.syncing = false;
        notify();
      }
    }

    state.syncing = true;
    state.lastError = null;
    notify();
    try {
      const pulled = await pull();
      const pushed = await pushPending();
      state.lastSync = nowISO();
      state.source = 'github';
      persistData();
      notify();
      return { ok: true, pulled: pulled, pushed: pushed };
    } catch (err) {
      state.lastError = err.message;
      state.source = 'github-offline';
      notify();
      throw err;
    } finally {
      state.syncing = false;
      notify();
    }
  }

  async function pushPending() {
    if (!state.pending.length) return { changed: 0, errors: [] };
    if (!isRemote()) return { changed: 0, errors: ['Sin repositorio configurado'] };
    if (state.demo) return { changed: 0, errors: ['Datos de ejemplo'] };

    if (flushPromise) return flushPromise;
    flushPromise = (async () => {
      const snapshot = state.pending.slice();
      const byPeriod = new Map();
      snapshot.forEach((op) => {
        const p = String(op.period);
        if (!byPeriod.has(p)) byPeriod.set(p, []);
        byPeriod.get(p).push(op);
      });

      let changed = 0;
      const errors = [];
      for (const entry of byPeriod) {
        const period = entry[0];
        const ops = entry[1];
        try {
          await pushPeriod(period, ops);
          state.pending = state.pending.filter((p) => snapshot.indexOf(p) === -1);
          changed += ops.length;
          persistData();
          notify();
        } catch (err) {
          errors.push(period + ': ' + err.message);
        }
      }
      if (changed) await updateIndex(Array.from(byPeriod.keys()));
      if (errors.length) {
        state.lastError = errors.join(' · ');
        state.source = 'github-offline';
        notify();
      }
      return { changed: changed, errors: errors };
    })();

    try { return await flushPromise; }
    finally { flushPromise = null; }
  }

  /* ------------------------------ escritura ------------------------------ */

  function addPending(op) {
    if (op.op === 'replace') {
      state.pending = state.pending.filter((p) => p.period !== op.period);
    } else {
      state.pending = state.pending.filter((p) => !(p.id === op.id && p.period === op.period));
    }
    state.pending.push(op);
    persistData();
  }

  /** Si el periodo tiene un reemplazo pendiente, mantenerlo al día. */
  function refreshReplace(period) {
    const i = state.pending.findIndex((p) => p.op === 'replace' && p.period === period);
    if (i >= 0) {
      state.pending[i].records = state.records.filter((r) => periodOf(r) === period);
      persistData();
    }
  }

  function save(input) {
    const rec = normalizeRecord(input);
    if (!rec) {
      throw new Error(input && input.tipo === 'boba'
        ? 'Lecturas inválidas: revisa la fecha, el turno y los contadores.'
        : 'Registro inválido: revisa fecha, equipo y litros.');
    }
    if (!rec.id) rec.id = id(rec.tipo);

    const idx = state.records.findIndex((r) => r.id === rec.id);
    const prev = idx >= 0 ? state.records[idx] : null;

    if (!prev) {
      rec.creado = rec.creado || nowISO();
    } else {
      rec.creado = prev.creado || rec.creado;
    }
    rec.actualizado = nowISO();

    // La boba es única por fecha + turno (diésel) y por fecha + producto (aceites)
    if (rec.tipo === 'boba') {
      const dups = state.records.filter((r) =>
        r.tipo === 'boba' && r.fecha === rec.fecha && r.turno === rec.turno && r.id !== rec.id);
      if (dups.length) {
        state.records = state.records.filter((r) => dups.indexOf(r) === -1);
        dups.forEach((d) => {
          state.pending = state.pending.filter((p) => !(p.id === d.id && p.op === 'upsert'));
          addPending({ op: 'delete', period: periodOf(d), id: d.id });
        });
      }
    }
    if (rec.tipo === 'aceite_boba') {
      const dups = state.records.filter((r) =>
        r.tipo === 'aceite_boba' && r.fecha === rec.fecha && r.producto === rec.producto && r.id !== rec.id);
      if (dups.length) {
        state.records = state.records.filter((r) => dups.indexOf(r) === -1);
        dups.forEach((d) => {
          state.pending = state.pending.filter((p) => !(p.id === d.id && p.op === 'upsert'));
          addPending({ op: 'delete', period: periodOf(d), id: d.id });
        });
      }
    }

    if (idx < 0) {
      state.records.push(rec);
    } else {
      state.records[idx] = rec;
      if (prev && periodOf(prev) !== periodOf(rec)) {
        addPending({ op: 'delete', period: periodOf(prev), id: rec.id });
        refreshReplace(periodOf(prev));
      }
    }

    state.records = sortRecords(state.records);
    state.periods = uniquePeriods(state.records.map(periodOf));
    addPending({ op: 'upsert', period: periodOf(rec), id: rec.id, record: rec });
    refreshReplace(periodOf(rec));
    persistData();
    notify();
    autoFlush();
    return rec;
  }

  function remove(recordId) {
    const rec = state.records.find((r) => r.id === recordId);
    if (!rec) return false;
    state.records = state.records.filter((r) => r.id !== recordId);
    state.pending = state.pending.filter((p) => !(p.id === recordId && p.op === 'upsert'));
    addPending({ op: 'delete', period: periodOf(rec), id: recordId });
    state.periods = uniquePeriods(state.records.map(periodOf));
    refreshReplace(periodOf(rec));
    persistData();
    notify();
    autoFlush();
    return true;
  }

  let flushTimer = null;
  function autoFlush() {
    if (!isRemote() || state.demo) return;
    clearTimeout(flushTimer);
    flushTimer = setTimeout(async () => {
      try {
        const res = await pushPending();
        if (res.errors.length) notify();
      } catch (e) { /* queda en cola */ }
    }, 900);
  }

  /**
   * Importa registros (diésel y/o aceites).
   * payload: { charges, boba, dispatches/aceites, meters/aceiteBoba, entradas }
   * mode 'replace': el periodo queda exactamente como el archivo.
   * mode 'merge':   se actualizan los renglones coincidentes y se agregan los nuevos.
   */
  function importData(payload, mode) {
    if (state.demo) throw new Error('Borra los datos de ejemplo antes de importar.');
    const p = payload || {};
    const charges = (p.charges || []).map((r) => normalizeRecord(Object.assign({}, r, { tipo: 'carga' }))).filter(Boolean);
    const boba = (p.boba || []).map((r) => normalizeRecord(Object.assign({}, r, { tipo: 'boba' }))).filter(Boolean);
    const aceites = (p.dispatches || p.aceites || []).map((r) => normalizeRecord(Object.assign({}, r, { tipo: 'aceite' }))).filter(Boolean);
    const aceiteBoba = (p.meters || p.aceiteBoba || []).map((r) => normalizeRecord(Object.assign({}, r, { tipo: 'aceite_boba' }))).filter(Boolean);
    const entradas = (p.entradas || p.aceiteEntradas || []).map((r) => normalizeRecord(Object.assign({}, r, { tipo: 'aceite_entrada', producto: r.producto || r.tipoAceite || r.aceite }))).filter(Boolean);
    const incoming = charges.concat(boba).concat(aceites).concat(aceiteBoba).concat(entradas);
    if (!incoming.length) throw new Error('El archivo no contiene filas válidas para importar.');

    const replaceAll = mode === 'replace';
    const periods = uniquePeriods(incoming.map(periodOf));

    periods.forEach((period) => {
      const base = replaceAll ? [] : state.records.filter((r) => periodOf(r) === period);
      const buckets = new Map();
      base.forEach((r) => {
        const k = naturalKey(r);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(r);
      });

      const used = new Map();
      incoming.filter((r) => periodOf(r) === period).forEach((r) => {
        const k = naturalKey(r);
        if (!buckets.has(k)) buckets.set(k, []);
        const bucket = buckets.get(k);
        const n = used.get(k) || 0;
        const prev = bucket[n];
        if (prev) {
          r.id = prev.id;
          r.creado = prev.creado || r.creado;
          bucket[n] = r;
        } else {
          if (!r.id) r.id = id(r.tipo);
          r.creado = r.creado || nowISO();
          bucket.push(r);
        }
        used.set(k, n + 1);
      });

      const arr = [];
      buckets.forEach((bucket) => bucket.forEach((r) => { r.actualizado = nowISO(); arr.push(r); }));
      const sorted = sortRecords(arr);

      state.records = state.records.filter((r) => periodOf(r) !== period).concat(sorted);
      state.pending = state.pending.filter((op) => op.period !== period);
      state.pending.push({ op: 'replace', period: period, records: sorted });
    });

    state.records = sortRecords(state.records);
    state.periods = uniquePeriods(state.records.map(periodOf));
    persistData();
    notify();
    autoFlush();
    return {
      charges: charges.length,
      boba: boba.length,
      aceites: aceites.length,
      aceiteBoba: aceiteBoba.length,
      aceiteEntradas: entradas.length,
      periods: periods,
      mode: replaceAll ? 'replace' : 'merge'
    };
  }

  async function saveConfig(raw) {
    const cfg = normalizeConfig(raw);
    const previous = state.config;
    state.config = cfg;
    persistConfig();
    notify();
    if (isRemote() && !state.demo) {
      try {
        const cur = await readJson('config.json');
        await writeFile('config.json', JSON.stringify(cfg, null, 2) + '\n', cur.sha,
          'diésel: configuración de la empresa');
        return { ok: true, remote: true };
      } catch (err) {
        state.config = previous;
        persistConfig();
        notify();
        throw err;
      }
    }
    return { ok: true, remote: false };
  }

  function setRemote(remote, token, remember) {
    state.remote = {
      owner: String(remote.owner || '').trim(),
      repo: String(remote.repo || '').trim(),
      branch: String(remote.branch || 'main').trim() || 'main',
      dir: String(remote.dir || 'data').trim().replace(/^\/+|\/+$/g, '') || 'data'
    };
    state.token = String(token || '').trim();
    persistRemote();
    writeToken(state.token, !!remember);
    if (isRemote()) state.source = 'github';
    notify();
  }

  function forgetToken() {
    state.token = '';
    writeToken('', false);
    notify();
  }

  async function testConnection() {
    const { owner, repo } = state.remote;
    if (!owner || !repo) throw new Error('Escribe el usuario y el nombre del repositorio.');
    if (!state.token) throw new Error('Pega un token de GitHub (con permiso Contents: Read and write).');
    const { body } = await ghFetch(`${API}/repos/${owner}/${repo}`);
    const canWrite = !!(body.permissions && body.permissions.push);
    let configOk = null;
    try {
      const cfg = await readJson('config.json');
      configOk = !cfg.missing;
      if (cfg.data && !state.config.empresa) state.config = normalizeConfig(cfg.data);
    } catch (e) { configOk = false; }
    return {
      ok: true,
      fullName: body.full_name,
      private: !!body.private,
      canWrite: canWrite,
      defaultBranch: body.default_branch,
      configOk: configOk,
      branchOk: true
    };
  }

  /* ------------------------------ datos de ejemplo ------------------------------ */

  function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function loadDemo() {
    if (state.records.length && !state.demo) {
      throw new Error('Ya existen registros. Borra los datos locales antes de cargar el ejemplo.');
    }
    const cfg = state.config;
    const equipos = cfg.equipos.length
      ? cfg.equipos
      : [
          { id: 'ST-41', categoria: 'EDM', departamento: 'Mina' },
          { id: 'ST-24', categoria: 'EDM', departamento: 'Mina' },
          { id: 'MC-232D3', categoria: 'EDP', departamento: 'Planta Beneficio' },
          { id: 'VL-016', categoria: 'VLG', departamento: 'Mina' },
          { id: 'CF-WA250-6 #1', categoria: 'EDP', departamento: 'Planta Beneficio' }
        ];
    const pick = equipos.slice(0, 6);
    const operadores = cfg.operadores.length ? cfg.operadores : ['Operador 1', 'Operador 2', 'Operador 3'];
    const resp = cfg.responsables[0] || '';
    const ubi = cfg.ubicaciones[0] || '';

    const out = [];
    const today = new Date();
    const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let contador = 100000 + Math.round(Math.random() * 50000);

    for (let d = 29; d >= 0; d--) {
      const day = new Date(todayMid.getTime() - d * 86400000);
      const fecha = isoDate(day);
      let bobaDia = 0;

      ['1', '2'].forEach((turno) => {
        const n = 1 + Math.floor(Math.random() * 3);
        let turnoLitros = 0;
        for (let i = 0; i < n; i++) {
          const eq = pick[(d + i * 2 + Number(turno)) % pick.length];
          const litros = Math.round((45 + Math.random() * 160) * 10) / 10;
          turnoLitros += litros;
          out.push({
            id: id('carga'),
            tipo: 'carga',
            fecha: fecha,
            turno: turno,
            categoria: eq.categoria || 'EDM',
            equipo: eq.id,
            horometro: Math.round(1200 + d * 12 + Math.random() * 40),
            litros: litros,
            departamento: eq.departamento || 'Mina',
            operador: operadores[(d + i) % operadores.length],
            responsable: resp,
            folio: String(9000 + ((d * 7 + i) % 900)),
            ubicacion: ubi,
            notas: '',
            creado: day.toISOString(),
            actualizado: day.toISOString()
          });
        }
        const inicial = contador;
        contador += Math.round(turnoLitros);
        bobaDia += turnoLitros;
        out.push({
          id: id('boba'),
          tipo: 'boba',
          fecha: fecha,
          turno: turno,
          inicial: inicial,
          final: contador,
          litros: contador - inicial,
          notas: '',
          creado: day.toISOString(),
          actualizado: day.toISOString()
        });
      });
      if (bobaDia <= 0) contador += 100;
    }

    state.records = sortRecords(out);
    state.demo = true;
    state.pending = [];
    state.periods = uniquePeriods(state.records.map(periodOf));
    persistLocal();
    notify();
    return state.records.length;
  }

  function clearDemo() {
    state.demo = false;
    state.records = [];
    state.pending = [];
    state.periods = [];
    state.lastSync = null;
    persistLocal();
    notify();
  }

  function clearLocal() {
    state.records = [];
    state.pending = [];
    state.periods = [];
    state.lastSync = null;
    state.demo = false;
    state.lastError = null;
    persistLocal();
    notify();
  }

  return {
    init: init,
    onChange: onChange,
    getState: getState,
    getConfig: getConfig,
    getRecords: getRecords,
    getCharges: getCharges,
    getBoba: getBoba,
    getAceiteDispatches: getAceiteDispatches,
    getAceiteMeters: getAceiteMeters,
    getAceiteEntradas: getAceiteEntradas,
    aceiteEntradasFor: aceiteEntradasFor,
    bobaFor: bobaFor,
    bobaDayInfo: bobaDayInfo,
    aceiteBobaFor: aceiteBobaFor,
    aceiteDayInfo: aceiteDayInfo,
    isRemoteReady: isRemoteReady,
    isReadOnly: function () { return state.source === 'github-readonly'; },
    isDemo: isDemo,
    pendingCount: pendingCount,
    repoUrl: repoUrl,
    sync: sync,
    pull: pull,
    pullPublic: pullPublic,
    pushPending: pushPending,
    save: save,
    upsert: save,
    remove: remove,
    importData: importData,
    saveConfig: saveConfig,
    setRemote: setRemote,
    forgetToken: forgetToken,
    testConnection: testConnection,
    hasRememberedToken: hasRememberedToken,
    loadDemo: loadDemo,
    clearDemo: clearDemo,
    clearLocal: clearLocal,
    normalizeConfig: normalizeConfig,
    normalizeRecord: normalizeRecord,
    defaultConfig: defaultConfig,
    bobaLitros: bobaLitros,
    canonProductoAceite: canonProductoAceite,
    naturalKey: naturalKey,
    round: round
  };
})();
