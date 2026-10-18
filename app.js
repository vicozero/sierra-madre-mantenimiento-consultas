const API_URL = 'https://sierra-madre-consulta-api.feywren128.chatgpt.site/api/portal';
const EMPTY = { meta: { updatedAt: '—' }, equipment: [], kpi: [], bitacora: [], calendar: [], diesel: [], supervision: [] };
const PALETTE = ['#1476df', '#31ad72', '#f6be25', '#f28a27', '#8052e8', '#0ba6a7', '#75869a'];
let data = structuredClone(EMPTY);
let view = 'inicio';
const REPORT_BRAND = 'SIERRA MADRE';
const REPORT_UNIT = 'MINA LA GUITARRA';
const PERIOD_LABELS = { mensual: 'Mensual', semanal: 'Semanal', diario: 'Diario' };
let reportPeriod = null;
let calendarAnchor = new Date();
let calendarMode = 'month';
let calendarListMode = false;

const VIEWS = {
  inicio: { label: 'Resumen KPI', title: 'Información del programa', subtitle: 'KPI, bitácora y calendario de servicio en una sola página.' },
  bitacora: { label: 'Bitácora', title: 'Bitácora de equipos', subtitle: 'Lecturas de medidor, horas y estado por fecha y turno.' },
  supervision: { label: 'Disponibilidad supervisión', title: 'Disponibilidad supervisión', subtitle: 'Resultados por supervisor, día y equipo registrados desde La Guitarra.' },
  calendario: { label: 'Calendario de servicio', title: 'Calendario de servicio', subtitle: 'Servicios programados, proyectados y completados dentro del periodo.' },
  equipos: { label: 'Equipos', title: 'Equipos', subtitle: 'Catálogo consultivo del programa.' },
  reportes: { label: 'Reportes', title: 'Reportes de mantenimiento', subtitle: 'Genera archivos con el periodo, familia y turno seleccionados.' },
  diesel: { label: 'Diesel', title: 'Consumo de Diesel', subtitle: 'Consulta litros por turno, día, semana y mes.' }
};

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const num = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

function toast(message) {
  const element = $('toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 3200);
}

function formatDate(value) {
  if (!value) return '—';
  const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return esc(value);
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed);
}

function fmt(value, decimals = 1) {
  const number = num(value);
  return number === null ? '—' : number.toLocaleString('es-MX', { maximumFractionDigits: decimals });
}

function average(list, key) {
  const values = list.map(row => num(row[key])).filter(value => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function badge(status) {
  const text = String(status || '').toLowerCase();
  const color = /termin|complet|realiz|disponible|verde/.test(text) ? 'green'
    : /venc|fuera|rojo|fall|cr.tico/.test(text) ? 'red'
      : /program|pend|proceso|amarill|riesgo/.test(text) ? 'amber' : 'blue';
  return `<span class="status ${color}">${esc(status || 'Sin dato')}</span>`;
}

function normalize(payload) {
  if (!payload || typeof payload !== 'object' || payload.schema !== 'sierra-madre-consultas/v1') throw new Error('Versión de paquete no compatible. Se esperaba sierra-madre-consultas/v1.');
  if (!payload.meta || typeof payload.meta !== 'object') throw new Error('Faltan los metadatos de generación del paquete.');
  if (typeof payload.meta.updatedAt !== 'string' || Number.isNaN(Date.parse(payload.meta.updatedAt))) throw new Error('La fecha de generación está ausente o no es válida.');
  const validDate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = dateAtNoon(value);
    return Boolean(date && isoDate(date) === value);
  };
  if (!validDate(payload.meta.periodStart) || !validDate(payload.meta.periodEnd)) throw new Error('El periodo publicado tiene fechas ausentes o inválidas.');
  if (payload.meta.periodEnd < payload.meta.periodStart) throw new Error('El periodo publicado termina antes de su inicio.');
  for (const section of ['equipment', 'kpi', 'bitacora', 'calendar']) {
    if (!Array.isArray(payload[section])) throw new Error(`Sección faltante: ${section}`);
    if (payload[section].some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error(`La sección ${section} contiene registros con formato inválido.`);
  }
  // La sección de Diesel es opcional: los paquetes anteriores pueden no incluirla.
  payload.diesel = Array.isArray(payload.diesel) ? payload.diesel.filter(row => row && typeof row === 'object' && !Array.isArray(row)) : [];
  // Supervisión es una sección opcional para conservar compatibilidad con
  // los cortes publicados antes de habilitar La Guitarra en la API.
  payload.supervision = Array.isArray(payload.supervision) ? payload.supervision.filter(row => row && typeof row === 'object' && !Array.isArray(row)) : [];
  // El portal público no procesa órdenes ni evidencias. Esos expedientes
  // permanecen en Mantenimiento hasta contar con acceso privado por usuario.
  payload.work_orders = [];
  return payload;
}

function acceptPackage(candidate, current = data) {
  const next = normalize(candidate);
  const sections = ['equipment', 'kpi', 'bitacora', 'calendar', 'diesel'];
  const emptied = sections.filter(section => current[section]?.length > 0 && next[section].length === 0);
  if (emptied.length) throw new Error(`El paquete llegó sin registros de ${emptied.join(', ')}. Se conserva el último corte válido.`);
  return next;
}

function formatDateTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Fecha no válida';
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parsed);
}

const normStatus = value => String(value || '').trim().toLocaleLowerCase('es-MX');

function filterValues() {
  return {
    family: $('family-filter').value,
    equipment: $('equipment-filter').value,
    shift: $('shift-filter').value,
    status: $('status-filter').value,
    condition: $('condition-filter').value,
    type: $('type-filter').value,
    query: $('search').value.trim().toLocaleLowerCase('es-MX'),
    start: $('date-start').value,
    end: $('date-end').value
  };
}

function conditionOf(section, row) {
  const status = normStatus(row.status);
  if (/sin captura|sin dato/.test(status)) return 'sindato';
  if (section === 'kpi') {
    const availability = num(row.availability);
    if (availability === null) return 'sindato';
    return availability >= 70 ? 'disponible' : availability >= 50 ? 'riesgo' : 'critico';
  }
  if (/no disponible|fuera|venc|fall|cr.tic|detenid/.test(status)) return 'critico';
  if (/program|pend|proceso|urgente|proxim|riesgo|amarill/.test(status)) return 'riesgo';
  if (/disponible|operativo|complet|termin|realiz|ejecut/.test(status)) return 'disponible';
  return 'sindato';
}

function rowCode(section, row) {
  return section === 'equipment' ? row.code : row.equipment;
}

function rows(section) {
  const { family, equipment, shift, status, condition, type, query, start, end } = filterValues();
  return (data[section] || []).filter(row => {
    if (family && row.family !== family) return false;
    if (equipment && rowCode(section, row) !== equipment) return false;
    if (shift && section === 'bitacora' && row.shift !== shift) return false;
    if (status && normStatus(row.status) !== status) return false;
    if (condition && conditionOf(section, row) !== condition) return false;
    if (type && section === 'calendar' && String(row.type || '') !== type) return false;
    if (query && !Object.values(row).join(' ').toLocaleLowerCase('es-MX').includes(query)) return false;
    if (row.date && start && row.date.slice(0, 10) < start) return false;
    if (row.date && end && row.date.slice(0, 10) > end) return false;
    return true;
  });
}

function calendarRowsForView() {
  const family = $('calendar-family').value;
  const equipment = $('calendar-equipment').value;
  const status = $('calendar-status').value;
  const type = $('calendar-type').value;
  const query = $('calendar-search').value.trim().toLocaleLowerCase('es-MX');
  // El almanaque tiene navegación y filtros propios. No usar rows('calendar'),
  // porque aplica el rango KPI global y recorta los preventivos proyectados a futuro.
  return data.calendar.filter(row => {
    if (family && row.family !== family) return false;
    if (equipment && row.equipment !== equipment) return false;
    if (status && normStatus(row.status) !== status) return false;
    if (type && String(row.type || '') !== type) return false;
    if (query && !Object.values(row).join(' ').toLocaleLowerCase('es-MX').includes(query)) return false;
    return true;
  });
}

function calendarStatusKey(value) {
  const status = normStatus(value);
  if (/complet|ejecut|realiz/.test(status)) return 'done';
  if (/venc|atras/.test(status)) return 'overdue';
  if (/urgente|crit/.test(status)) return 'urgent';
  if (/cancel/.test(status)) return 'cancelled';
  if (/proxim/.test(status)) return 'upcoming';
  return 'planned';
}

function dateAtNoon(value) {
  const date = new Date(`${String(value || '').slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calendarTitle(date, options = { month: 'long', year: 'numeric' }) {
  return new Intl.DateTimeFormat('es-MX', options).format(date).replace(/^./, letter => letter.toLocaleUpperCase('es-MX'));
}

function calendarItem(row) {
  const statusKey = calendarStatusKey(row.status);
  const kind = statusKey === 'done' ? 'done' : statusKey === 'overdue' || statusKey === 'urgent' ? 'urgent' : 'planned';
  const label = row.service || row.type || row.description || 'Servicio';
  const detail = row.equipment || 'Equipo sin código';
  const target = num(row.target);
  const meter = num(row.meter);
  const more = [target === null ? '' : `Objetivo ${fmt(target)} ${row.unit || ''}`, meter === null ? '' : `Medidor ${fmt(meter)} ${row.unit || ''}`, row.status || ''].filter(Boolean).join(' · ');
  const targetText = target === null ? '' : `Objetivo ${fmt(target)} ${row.unit || ''}`;
  return `<div class="service-event ${kind}" title="${esc(`${label} · ${detail}${more ? ` · ${more}` : ''}`)}"><span class="service-event-title">${esc(label)}</span><span class="service-event-equipment">${esc(detail)}</span><span class="service-event-meta">${esc(row.status || 'Programado')}${targetText ? ` · ${esc(targetText)}` : ''}</span></div>`;
}

function calendarPeriodRows(list) {
  const y = calendarAnchor.getFullYear(), m = calendarAnchor.getMonth();
  return list.filter(row => { const date = dateAtNoon(row.date); return date && date.getFullYear() === y && date.getMonth() === m; });
}

function renderCalendar(list) {
  $('calendar-month-title').textContent = calendarTitle(calendarAnchor);
  $('calendar-heading-title').textContent = calendarMode === 'month' ? calendarTitle(calendarAnchor) : calendarMode === 'week' ? `Semana del ${calendarTitle(weekStart(calendarAnchor), { day: 'numeric', month: 'short' })}` : calendarTitle(calendarAnchor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('calendar-summary-period').textContent = calendarTitle(calendarAnchor);
  const monthRows = calendarPeriodRows(list);
  const done = monthRows.filter(row => calendarStatusKey(row.status) === 'done').length;
  const overdue = monthRows.filter(row => ['overdue', 'urgent'].includes(calendarStatusKey(row.status))).length;
  const planned = monthRows.filter(row => !['done', 'cancelled'].includes(calendarStatusKey(row.status))).length;
  $('calendar-summary-cards').innerHTML = [
    ['✓', done, 'Completados', 'done'], ['◷', planned, 'Programados', 'planned'], ['!', overdue, 'Vencidos / urgentes', 'urgent'], ['▦', monthRows.length, 'Servicios del mes', 'total']
  ].map(([icon, value, label, kind]) => `<div class="calendar-summary-card ${kind}"><span>${icon}</span><div><b>${value}</b><small>${label}</small></div></div>`).join('');

  const statuses = new Map();
  monthRows.forEach(row => { const label = String(row.status || 'Sin estado'); const key = calendarStatusKey(label); statuses.set(`${key}|${label}`, { key, label, count: (statuses.get(`${key}|${label}`)?.count || 0) + 1 }); });
  $('calendar-legend').innerHTML = statuses.size ? [...statuses.values()].map(item => `<div><i class="legend-dot ${item.key}"></i><span>${esc(item.label)}</span><b>${item.count}</b></div>`).join('') : '<div class="calendar-empty-note">Sin estados en este mes.</div>';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upcoming = list.filter(row => { const date = dateAtNoon(row.date); return date && date >= today && calendarStatusKey(row.status) !== 'cancelled'; }).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 5);
  $('calendar-upcoming-count').textContent = upcoming.length ? `Ver ${upcoming.length}` : '';
  $('calendar-upcoming').innerHTML = upcoming.length ? upcoming.map(row => `<div class="upcoming-item"><time>${esc(new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short' }).format(dateAtNoon(row.date)))}</time><div><b>${esc(row.service || row.type || 'Servicio')}</b><span>${esc(row.equipment || '—')} · ${esc(row.description || row.family || '')}</span></div><i class="legend-dot ${calendarStatusKey(row.status)}"></i></div>`).join('') : '<div class="calendar-empty-note">No hay próximos servicios publicados.</div>';

  const days = calendarDates();
  const visible = list.filter(row => { const date = String(row.date || '').slice(0, 10); return days.some(day => isoDate(day) === date); });
  $('calendar-grid').innerHTML = days.map(date => {
    const dayRows = visible.filter(row => String(row.date).slice(0, 10) === isoDate(date));
    const inMonth = date.getMonth() === calendarAnchor.getMonth();
    const cells = dayRows.slice(0, calendarMode === 'day' ? 8 : 2).map(calendarItem).join('');
    const more = dayRows.length > (calendarMode === 'day' ? 8 : 2) ? `<span class="calendar-more">+${dayRows.length - (calendarMode === 'day' ? 8 : 2)} más</span>` : '';
    return `<div class="calendar-day ${inMonth ? '' : 'outside'} ${date.toDateString() === new Date().toDateString() ? 'today' : ''}"><b class="calendar-date">${date.getDate()}</b>${cells}${more || (!dayRows.length ? '<span class="calendar-no-service">Sin servicios</span>' : '')}</div>`;
  }).join('');
  $('calendar-grid').classList.toggle('week-mode', calendarMode === 'week');
  $('calendar-grid').classList.toggle('day-mode', calendarMode === 'day');
  $('calendar-grid').hidden = calendarListMode;
  $('calendar-list').hidden = !calendarListMode;
  $('calendar-list-toggle').textContent = calendarListMode ? '▦ Ver calendario' : '☷ Ver en lista';
  if (calendarListMode) {
    $('calendar-list').innerHTML = visible.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Equipo</th><th>Familia</th><th>Servicio</th><th>Tipo</th><th>Medidor</th><th>Objetivo</th><th>Estado</th></tr></thead><tbody>${visible.sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(row=>`<tr><td>${formatDate(row.date)}</td><td><b>${esc(row.equipment)}</b><br>${esc(row.description)}</td><td>${esc(row.family)}</td><td>${esc(row.service)}</td><td>${esc(row.type)}</td><td>${fmt(row.meter)} ${esc(row.unit)}</td><td>${fmt(row.target)} ${esc(row.unit)}</td><td>${badge(row.status)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Sin servicios en este periodo.</div>';
  }
  $('calendar-count').textContent = `${monthRows.length} servicios en el mes · ${list.length} en el periodo`;
  document.querySelectorAll('[data-calendar-view]').forEach(button => button.classList.toggle('active', button.dataset.calendarView === calendarMode));
}

function weekStart(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function calendarDates() {
  if (calendarMode === 'day') return [new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth(), calendarAnchor.getDate())];
  if (calendarMode === 'week') return Array.from({ length: 7 }, (_, i) => { const date = weekStart(calendarAnchor); date.setDate(date.getDate() + i); return date; });
  const first = new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth(), 1);
  const start = weekStart(first);
  return Array.from({ length: 42 }, (_, i) => { const date = new Date(start); date.setDate(start.getDate() + i); return date; });
}

function setRows(id, list, columnCount, makeRow) {
  $(id).innerHTML = list.length
    ? list.map(makeRow).join('')
    : `<tr><td class="empty" colspan="${columnCount}">Sin registros para estos filtros.</td></tr>`;
}

function metric(title, value, caption, color, icon, progress = null) {
  const bar = progress === null ? '' : `<div class="metric-progress"><i style="width:${Math.max(0, Math.min(100, progress))}%;--metric-color:${color}"></i></div>`;
  return `<article class="metric" style="--metric-color:${color}">
    <div class="metric-head"><span class="metric-icon">${icon}</span><span>${esc(title)}</span></div>
    <strong>${esc(value)}</strong><small>${esc(caption)}</small>${bar}
  </article>`;
}

function groupFamilies(list) {
  const groups = new Map();
  for (const row of list) {
    const family = String(row.family || 'Sin familia').trim() || 'Sin familia';
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family).push(row);
  }
  return [...groups].map(([family, items]) => ({
    family,
    rows: items,
    availability: average(items, 'availability'),
    count: items.length
  })).sort((a, b) => (b.availability ?? -1) - (a.availability ?? -1));
}

function aggregateByEquipment(list) {
  const groups = new Map();
  for (const row of list) {
    const code = row.equipment;
    if (!code) continue;
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(row);
  }
  const total = (items, key) => items.reduce((sum, item) => sum + (num(item[key]) || 0), 0);
  return [...groups].map(([equipment, items]) => {
    const sorted = [...items].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const last = sorted.at(-1) || items[0];
    const withDescription = items.find(row => row.description) || last;
    const withFamily = items.find(row => row.family) || last;
    return {
      equipment,
      description: withDescription.description || '',
      family: withFamily.family || '',
      status: last.status,
      availability: average(items, 'availability'),
      utilization: average(items, 'utilization'),
      worked_hours: total(items, 'worked_hours'),
      mp_hours: total(items, 'mp_hours'),
      mc_hours: total(items, 'mc_hours'),
      stops: total(items, 'stops'),
      tmef: average(items.filter(row => (num(row.tmef) || 0) > 0), 'tmef'),
      tmpr: average(items.filter(row => (num(row.tmpr) || 0) > 0), 'tmpr'),
      date: last.date,
      cuts: items.length
    };
  }).sort((a, b) => String(a.equipment).localeCompare(String(b.equipment), 'es'));
}

function aggregateCalendarByEquipment(list) {
  const groups = new Map();
  for (const row of list) {
    const code = row.equipment;
    if (!code) continue;
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(row);
  }
  const today = new Date().toISOString().slice(0, 10);
  return [...groups].map(([equipment, items]) => {
    const sorted = [...items].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const next = sorted.find(row => String(row.date).slice(0, 10) >= today) || sorted.at(-1);
    return { ...next, equipment, services: items.length, dates: sorted.map(row => row.date) };
  }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/* ---------- Reporte en PowerPoint (mensual / semanal / diario) ---------- */

const PPTX_NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main'
};

function parsePptxSlide(xml) {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw new Error('La plantilla de PowerPoint está dañada.');
  return document;
}

function pptxNodes(node, namespace, name) {
  return [...node.getElementsByTagNameNS(namespace, name)];
}

function setPptxTextNodes(nodes, value) {
  if (!nodes.length) return;
  nodes[0].textContent = String(value ?? '');
  nodes.slice(1).forEach(node => { node.textContent = ''; });
}

function replacePptxMarker(document, marker, value) {
  let changed = false;
  for (const shape of pptxNodes(document, PPTX_NS.p, 'sp')) {
    const texts = pptxNodes(shape, PPTX_NS.a, 't');
    if (texts.map(node => node.textContent).join('').includes(marker)) {
      setPptxTextNodes(texts, pptxNodes(shape, PPTX_NS.a, 't').map(node => node.textContent).join('').replace(marker, String(value ?? '—')));
      changed = true;
    }
  }
  return changed;
}

function pptxTableRows(document) {
  const table = pptxNodes(document, PPTX_NS.a, 'tbl')[0];
  return table ? pptxNodes(table, PPTX_NS.a, 'tr') : [];
}

function pptxRowCells(row) {
  return [...row.children].filter(node => node.namespaceURI === PPTX_NS.a && node.localName === 'tc');
}

function pptxCellText(cell) {
  return pptxNodes(cell, PPTX_NS.a, 't').map(node => node.textContent).join('');
}

function setPptxCell(cell, value) {
  setPptxTextNodes(pptxNodes(cell, PPTX_NS.a, 't'), value);
}

function expandPptxDataTable(document, requiredRows) {
  const table = pptxNodes(document, PPTX_NS.a, 'tbl')[0];
  const rows = pptxTableRows(document);
  let capacity = rows.slice(1).filter(row => pptxCellText(pptxRowCells(row)[0] || row).includes('__DATA_ROW__')).length;
  while (capacity < requiredRows) {
    const templateRow = [...rows].reverse().find(row => pptxCellText(pptxRowCells(row)[0] || row).includes('__DATA_ROW__'));
    if (!templateRow) break;
    const row = templateRow.cloneNode(true);
    const cells = pptxRowCells(row);
    cells.forEach((cell, index) => setPptxCell(cell, index === 0 ? '__DATA_ROW__' : ''));
    table.appendChild(row);
    const height = Number(row.getAttribute('h')) || 0;
    const transform = document.getElementsByTagNameNS(PPTX_NS.p, 'graphicFrame')[0]?.getElementsByTagNameNS(PPTX_NS.a, 'xfrm')[0];
    const extent = transform?.getElementsByTagNameNS(PPTX_NS.a, 'ext')[0];
    if (extent && height) extent.setAttribute('cy', String(Number(extent.getAttribute('cy')) + height));
    rows.push(row);
    capacity++;
  }
  return capacity;
}

function fillPptxDataTable(document, items, toCells) {
  let index = 0;
  for (const row of pptxTableRows(document).slice(1)) {
    const cells = pptxRowCells(row);
    if (pptxCellText(cells[0] || row).includes('__DATA_ROW__')) {
      const item = items[index++];
      cells.forEach((cell, column) => setPptxCell(cell, item ? toCells(item)[column] ?? '' : ''));
    }
  }
  if (index < items.length) throw new Error(`La plantilla admite ${index} renglones de esta familia y hay ${items.length}; se requiere ampliar el diseño para evitar omitir equipos.`);
}

function fillPptxConditionTables(documents, groups) {
  let groupIndex = 0;
  let equipmentIndex = 0;
  let activeGroup = null;
  for (const document of documents) {
    for (const row of pptxTableRows(document).slice(1)) {
      const cells = pptxRowCells(row);
      const marker = pptxCellText(cells[0] || row);
      if (marker.includes('__FAMILY_ROW__')) {
        if (!activeGroup || equipmentIndex >= activeGroup.items.length) {
          activeGroup = groups[groupIndex++] || null;
          equipmentIndex = 0;
        }
        cells.forEach((cell, column) => setPptxCell(cell, activeGroup && column === 0 ? activeGroup.family : ''));
      } else if (marker.includes('__EQUIP_ROW__')) {
        const item = activeGroup?.items[equipmentIndex++];
        cells.forEach((cell, column) => setPptxCell(cell, item ? [item.description || item.code, item.code || '—', item.status || '—', ''][column] ?? '' : ''));
      }
    }
  }
  if (groupIndex < groups.length || groups.slice(0, groupIndex).some(group => group.items.length > 0 && group === activeGroup && equipmentIndex < group.items.length)) {
    const remaining = groups.slice(groupIndex).reduce((sum, group) => sum + group.items.length, 0);
    if (remaining) throw new Error('La plantilla no tiene renglones suficientes para mostrar todos los equipos; no se generó un reporte incompleto.');
  }
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function isoDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function reportAnchor() {
  const reference = $('report-anchor-date')?.value || data.meta?.periodEnd || $('date-end').value || data.meta?.updatedAt;
  const parsed = reference ? new Date(`${String(reference).slice(0, 10)}T12:00:00`) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function periodRange(kind) {
  const base = reportAnchor();
  if (kind === 'diario') return { start: isoDate(base), end: isoDate(base) };
  if (kind === 'semanal') {
    const start = new Date(base);
    start.setDate(base.getDate() - ((base.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: isoDate(start), end: isoDate(end) };
  }
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { start: isoDate(start), end: isoDate(end) };
}

function formatDayLong(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}

function formatRange(start, end) {
  if (!start && !end) return '—';
  if (!start || !end || start === end) return formatDayLong(start || end);
  const first = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return `${start} a ${end}`;
  const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear();
  const firstText = new Intl.DateTimeFormat('es-MX', sameMonth ? { day: '2-digit' } : { day: '2-digit', month: 'long' }).format(first);
  return `del ${firstText} al ${formatDayLong(end)}`;
}

function periodKindFromRange(start, end) {
  if (!start || !end) return null;
  if (start === end) return 'diario';
  const first = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return null;
  const days = Math.round((last - first) / 86400000) + 1;
  if (days === 7) return 'semanal';
  const monthEnd = new Date(last.getFullYear(), last.getMonth() + 1, 0).getDate();
  if (first.getDate() === 1 && last.getDate() === monthEnd && first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()) return 'mensual';
  return null;
}

function applyPeriod(kind) {
  if (!PERIOD_LABELS[kind]) return;
  reportPeriod = kind;
  if ($('report-anchor-date') && !$('report-anchor-date').value) $('report-anchor-date').value = isoDate(reportAnchor());
  const { start, end } = periodRange(kind);
  $('date-start').value = start;
  $('date-end').value = end;
  document.querySelectorAll('#period-toggle [data-period]').forEach(button => button.classList.toggle('active', button.dataset.period === kind));
  render();
}

function clearPeriodSelection() {
  reportPeriod = null;
  document.querySelectorAll('#period-toggle [data-period]').forEach(button => button.classList.remove('active'));
}

function sumField(list, key) {
  return list.reduce((sum, row) => sum + (num(row[key]) || 0), 0);
}

function familyLabel(value) {
  const clean = String(value || '').trim();
  return /[a-z0-9áéíóúñ]/i.test(clean) ? clean : 'Sin familia';
}

function distinctCount(list, key) {
  return new Set(list.map(row => row[key]).filter(Boolean)).size;
}

function familyIndicators(kpiRows, bitacoraRows = []) {
  const groups = new Map();
  for (const row of kpiRows) {
    const family = familyLabel(row.family);
    if (!groups.has(family)) groups.set(family, { kpi: [], logs: [] });
    groups.get(family).kpi.push(row);
  }
  for (const row of bitacoraRows) {
    const family = familyLabel(row.family);
    if (!groups.has(family)) groups.set(family, { kpi: [], logs: [] });
    groups.get(family).logs.push(row);
  }
  return [...groups].map(([family, sets]) => {
    const items = [...sets.kpi, ...sets.logs];
    return {
    family,
    rows: sets.kpi,
    logRows: sets.logs,
    equipment: distinctCount(items, 'equipment'),
    cuts: sets.kpi.length,
    availability: average(sets.kpi, 'availability'),
    utilization: average(sets.kpi, 'utilization'),
    worked: sumField(sets.logs, 'worked_hours'),
    mp: sumField(sets.logs, 'mp_hours'),
    mc: sumField(sets.logs, 'mc_hours'),
    stops: sumField(sets.logs, 'stops'),
    tmef: average(sets.kpi.filter(row => (num(row.tmef) || 0) > 0), 'tmef'),
    tmpr: average(sets.kpi.filter(row => (num(row.tmpr) || 0) > 0), 'tmpr')
  };
  }).sort((a, b) => b.worked - a.worked);
}

function globalIndicators(kpiRows, bitacoraRows, calendarRows) {
  const completed = calendarRows.filter(row => /complet|ejecut|realiz/i.test(String(row.status || ''))).length;
  const scheduled = calendarRows.filter(row => !/cancel/i.test(String(row.status || ''))).length;
  return {
    availability: average(kpiRows, 'availability'),
    utilization: average(kpiRows, 'utilization'),
    tmef: average(kpiRows.filter(row => (num(row.tmef) || 0) > 0), 'tmef'),
    tmpr: average(kpiRows.filter(row => (num(row.tmpr) || 0) > 0), 'tmpr'),
    worked: sumField(bitacoraRows, 'worked_hours'),
    mp: sumField(bitacoraRows, 'mp_hours'),
    mc: sumField(bitacoraRows, 'mc_hours'),
    stops: sumField(bitacoraRows, 'stops'),
    kpiEquipment: distinctCount(kpiRows, 'equipment'),
    cuts: kpiRows.length,
    logs: bitacoraRows.length,
    services: scheduled,
    completed,
    completion: scheduled ? completed / scheduled * 100 : null
  };
}

function reportEquipmentRows(kpiRows, bitacoraRows) {
  const codes = new Set([...kpiRows, ...bitacoraRows].map(row => row.equipment).filter(Boolean));
  return [...codes].map(equipment => {
    const kpi = kpiRows.filter(row => row.equipment === equipment);
    const logs = bitacoraRows.filter(row => row.equipment === equipment);
    const latest = [...logs, ...kpi].sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).at(-1) || {};
    const detail = [...logs, ...kpi].find(row => row.description || row.family) || latest;
    return {
      equipment,
      description: detail.description || '',
      family: familyLabel(detail.family),
      status: latest.status || '—',
      availability: average(kpi, 'availability'),
      utilization: average(kpi, 'utilization'),
      worked_hours: sumField(logs, 'worked_hours'),
      mp_hours: sumField(logs, 'mp_hours'),
      mc_hours: sumField(logs, 'mc_hours'),
      stops: sumField(logs, 'stops'),
      tmef: average(kpi.filter(row => (num(row.tmef) || 0) > 0), 'tmef'),
      tmpr: average(kpi.filter(row => (num(row.tmpr) || 0) > 0), 'tmpr')
    };
  });
}

const pctText = value => value === null || value === undefined ? '—' : `${fmt(value)}%`;
const hrsText = value => value === null || value === undefined ? '—' : `${fmt(value)} h`;

async function generatePptx() {
  if (typeof JSZip === 'undefined') {
    toast('No se pudo cargar el lector de la plantilla. Recarga la página e inténtalo de nuevo.');
    return;
  }
  if (!data.schema) {
    toast('Aún no hay información del programa para generar el reporte.');
    return;
  }
  const button = $('report-pptx');
  button.disabled = true;
  try {
    const start = $('date-start').value;
    const end = $('date-end').value;
    const kind = reportPeriod || periodKindFromRange(start, end);
    if (!start || !end || !kind) throw new Error('Selecciona una fecha base y elige Día, Semana o Mes antes de generar el reporte.');
    const kindLabel = PERIOD_LABELS[kind];
    const rangeText = formatRange(start, end);
    const periodText = `${kindLabel} ${rangeText}`;

    const kpiRows = rows('kpi');
    const bitacoraRows = rows('bitacora');
    const calendarRows = rows('calendar');
    const equipmentRows = rows('equipment');
    const families = familyIndicators(kpiRows, bitacoraRows).map(family => ({
      ...family,
      reportRows: reportEquipmentRows(family.rows, family.logRows)
    })).sort((a, b) => b.reportRows.length - a.reportRows.length || b.worked - a.worked);
    const global = globalIndicators(kpiRows, bitacoraRows, calendarRows);
    if (families.length > 12) throw new Error(`La plantilla conserva 12 páginas por familia y el periodo tiene ${families.length}. No se exportó para evitar omitir una familia.`);
    const response = await fetch('./assets/report-template.bin', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo descargar la plantilla PowerPoint del portal.');
    const archive = await JSZip.loadAsync(await response.arrayBuffer());

    const familyPages = [];
    for (let slideNo = 4; slideNo <= 15; slideNo++) {
      const path = `ppt/slides/slide${slideNo}.xml`;
      const document = parsePptxSlide(await archive.file(path).async('string'));
      const capacity = pptxTableRows(document).slice(1).filter(row => pptxCellText(pptxRowCells(row)[0] || row).includes('__DATA_ROW__')).length;
      familyPages.push({ slideNo, path, document, capacity });
    }
    const remainingFamilies = [...families];
    for (const page of familyPages.sort((a, b) => b.capacity - a.capacity || a.slideNo - b.slideNo)) {
      const family = remainingFamilies[0]?.reportRows.length === page.capacity + 1
        ? remainingFamilies.shift()
        : (() => { const index = remainingFamilies.findIndex(item => item.reportRows.length <= page.capacity); return index >= 0 ? remainingFamilies.splice(index, 1)[0] : null; })();
      if (!family && remainingFamilies.length) throw new Error(`No hay espacio en la plantilla para la familia ${remainingFamilies[0].family}; no se generó un archivo incompleto.`);
      const metrics = family ? [pctText(family.availability), pctText(family.utilization), fmt(family.worked), `${fmt(family.mp)} / ${fmt(family.mc)}`, fmt(family.stops, 0), `${fmt(family.tmef)} / ${fmt(family.tmpr)}`] : ['—', '—', '—', '— / —', '—', '— / —'];
      replacePptxMarker(page.document, '{{FAMILIA}}', family?.family || 'Sin registros');
      replacePptxMarker(page.document, '{{EQUIPOS}}', family ? String(family.equipment) : '0');
      replacePptxMarker(page.document, '{{CORTES}}', family ? String(family.cuts) : '0');
      replacePptxMarker(page.document, '{{RANGO}}', rangeText);
      metrics.forEach((value, index) => replacePptxMarker(page.document, `{{FM${String(index).padStart(2, '0')}}}`, value));
      replacePptxMarker(page.document, '{{PERIODO}}', periodText);
      expandPptxDataTable(page.document, family?.reportRows.length || 0);
      fillPptxDataTable(page.document, family?.reportRows || [], item => [item.equipment, item.description || '—', pctText(item.availability), pctText(item.utilization), fmt(item.worked_hours), fmt(item.mp_hours), fmt(item.mc_hours), fmt(item.stops, 0), item.status || '—']);
      archive.file(page.path, new XMLSerializer().serializeToString(page.document));
    }
    if (remainingFamilies.length) throw new Error(`La plantilla no pudo asignar página a: ${remainingFamilies.map(item => item.family).join(', ')}.`);

    const general = parsePptxSlide(await archive.file('ppt/slides/slide3.xml').async('string'));
    replacePptxMarker(general, '{{RANGO}}', rangeText);
    replacePptxMarker(general, '{{PERIODO}}', periodText);
    const generalMetrics = [pctText(global.availability), pctText(global.utilization), hrsText(global.tmef), hrsText(global.tmpr), fmt(global.worked), `${fmt(global.mp)} / ${fmt(global.mc)}`, fmt(global.stops, 0), String(global.kpiEquipment), String(global.cuts), String(global.logs), String(global.services), pctText(global.completion)];
    generalMetrics.forEach((value, index) => replacePptxMarker(general, `{{M${String(index).padStart(2, '0')}}}`, value));
    archive.file('ppt/slides/slide3.xml', new XMLSerializer().serializeToString(general));

    const cover = parsePptxSlide(await archive.file('ppt/slides/slide1.xml').async('string'));
    replacePptxMarker(cover, '{{PERIODO}}', periodText);
    replacePptxMarker(cover, '{{GENERADO}}', new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' }));
    archive.file('ppt/slides/slide1.xml', new XMLSerializer().serializeToString(cover));

    const conditionDocument = parsePptxSlide(await archive.file('ppt/slides/slide16.xml').async('string'));
    const grouped = new Map();
    for (const row of equipmentRows) {
      const family = familyLabel(row.family);
      if (!grouped.has(family)) grouped.set(family, []);
      grouped.get(family).push(row);
    }
    const conditionGroups = [...grouped].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([family, items]) => ({ family, items: items.sort((a, b) => String(a.code).localeCompare(String(b.code), 'es')) }));
    const conditionDocuments = [conditionDocument];
    for (let slideNo = 17; slideNo <= 19; slideNo++) conditionDocuments.push(parsePptxSlide(await archive.file(`ppt/slides/slide${slideNo}.xml`).async('string')));
    replacePptxMarker(conditionDocument, '{{EQUIPOS}}', String(equipmentRows.length));
    replacePptxMarker(conditionDocument, '{{FAMILIAS}}', String(conditionGroups.length));
    replacePptxMarker(conditionDocument, '{{RANGO}}', rangeText);
    replacePptxMarker(conditionDocument, '{{PERIODO}}', periodText);
    fillPptxConditionTables(conditionDocuments, conditionGroups);
    conditionDocuments.forEach((document, index) => archive.file(`ppt/slides/slide${index + 16}.xml`, new XMLSerializer().serializeToString(document)));

    const output = await archive.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    download(output, `Reporte_${kind}_${start}.pptx`);
    toast(`Reporte ${kindLabel ? kindLabel.toLocaleLowerCase('es-MX') : 'de mantenimiento'} generado: ${equipmentRows.length} equipos · ${kpiRows.length} cortes KPI.`);
  } catch (error) {
    toast(`No se pudo generar el reporte: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

function renderTrend(kpiRows) {
  const host = $('availability-trend');
  const daily = new Map();
  for (const row of kpiRows) {
    if (num(row.availability) === null || !row.date) continue;
    const date = row.date.slice(0, 10);
    if (!daily.has(date)) daily.set(date, []);
    daily.get(date).push(Number(row.availability));
  }
  const points = [...daily].map(([date, values]) => ({ date, value: values.reduce((a, b) => a + b, 0) / values.length }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!points.length) {
    host.innerHTML = '<div class="empty">No hay cortes KPI dentro del periodo seleccionado.</div>';
    $('trend-start').textContent = '—';
    $('trend-end').textContent = '—';
    return;
  }
  const width = 720, height = 184, left = 42, right = 704, top = 14, bottom = 148;
  const values = points.map(point => point.value);
  const minValue = Math.max(0, Math.floor((Math.min(...values) - 10) / 25) * 25);
  const maxValue = Math.min(100, Math.max(100, Math.ceil((Math.max(...values) + 5) / 25) * 25));
  const range = Math.max(maxValue - minValue, 1);
  const coords = points.map((point, index) => ({
    ...point,
    x: left + (right - left) * index / Math.max(points.length - 1, 1),
    y: bottom - (bottom - top) * (point.value - minValue) / range
  }));
  const grid = [0, 1, 2, 3, 4].map(index => {
    const y = top + (bottom - top) * index / 4;
    const label = maxValue - range * index / 4;
    return `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#e8eef6"/><text x="${left - 8}" y="${y + 3}" text-anchor="end" fill="#8a9aab" font-size="9">${Math.round(label)}%</text>`;
  }).join('');
  const path = coords.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
  const area = `${path} L${right},${bottom} L${left},${bottom} Z`;
  const markers = coords.map(point => `<circle cx="${point.x}" cy="${point.y}" r="3.3" fill="#128b47" stroke="white" stroke-width="1.5"><title>${formatDate(point.date)} · ${fmt(point.value)}%</title></circle>`).join('');
  const labels = coords.length < 7 ? coords : [coords[0], ...coords.slice(1, -1).filter((_, index) => index % Math.ceil(coords.length / 5) === 0), coords.at(-1)];
  const xLabels = labels.map(point => `<text x="${point.x}" y="169" text-anchor="middle" fill="#7b8fa6" font-size="8">${esc(point.date.slice(5).replace('-', '/'))}</text>`).join('');
  host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Disponibilidad promedio por corte KPI">${grid}<path d="${area}" fill="#10a667" opacity=".10"/><path d="${path}" fill="none" stroke="#128b47" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>${markers}${xLabels}</svg>`;
  $('trend-start').textContent = formatDate(points[0].date);
  $('trend-end').textContent = formatDate(points.at(-1).date);
}

function renderFamilyPanel(kpiRows) {
  const families = groupFamilies(kpiRows).filter(item => item.availability !== null);
  const donut = $('family-donut');
  const legend = $('family-legend');
  const overall = average(kpiRows, 'availability');
  if (!families.length) {
    donut.style.setProperty('--donut', '#edf2f8');
    donut.innerHTML = '<div class="donut-center"><b>—</b><span>Sin datos KPI</span></div>';
    legend.innerHTML = '<div class="empty">Sin disponibilidad por familia para mostrar.</div>';
    return;
  }
  const total = families.reduce((sum, family) => sum + family.count, 0);
  let cursor = 0;
  const stops = families.map((family, index) => {
    const start = cursor;
    cursor += 360 * family.count / total;
    return `${PALETTE[index % PALETTE.length]} ${start}deg ${cursor}deg`;
  });
  donut.style.setProperty('--donut', `conic-gradient(${stops.join(',')})`);
  donut.innerHTML = `<div class="donut-center"><b>${overall === null ? '—' : `${fmt(overall)}%`}</b><span>Disponibilidad<br>general</span></div>`;
  legend.innerHTML = families.slice(0, 7).map((family, index) => `<div class="family-key"><i style="background:${PALETTE[index % PALETTE.length]}"></i><span title="${esc(family.family)}">${esc(family.family)}</span><b>${fmt(family.availability)}%</b></div>`).join('');
}

function renderComparison(currentRows) {
  const container = $('family-comparison');
  const current = groupFamilies(currentRows).filter(item => item.availability !== null);
  const startText = $('date-start').value;
  const endText = $('date-end').value;
  if (!startText || !endText || !current.length) {
    container.innerHTML = '<div class="empty">Selecciona fechas con datos KPI para consultar el comparativo.</div>';
    return;
  }
  const start = new Date(`${startText}T12:00:00`);
  const end = new Date(`${endText}T12:00:00`);
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const previousEnd = new Date(start.getTime() - 86400000);
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * 86400000);
  const previousRows = data.kpi.filter(row => {
    if ($('family-filter').value && row.family !== $('family-filter').value) return false;
    if (!row.date) return false;
    const date = row.date.slice(0, 10);
    return date >= previousStart.toISOString().slice(0, 10) && date <= previousEnd.toISOString().slice(0, 10);
  });
  const previous = new Map(groupFamilies(previousRows).map(item => [item.family, item.availability]));
  const items = current.slice(0, 6);
  container.innerHTML = items.map(item => {
    const prior = previous.get(item.family);
    return `<div class="compare-row"><span class="compare-name" title="${esc(item.family)}">${esc(item.family)}</span><div class="compare-bars"><div class="compare-track"><i style="width:${Math.max(0, Math.min(100, item.availability))}%"></i></div><div class="compare-track previous"><i style="width:${prior === undefined || prior === null ? 0 : Math.max(0, Math.min(100, prior))}%"></i></div></div><span class="compare-value">${fmt(item.availability)}%</span></div>`;
  }).join('');
}

function renderImpact(kpiRows) {
  const list = [...kpiRows].filter(row => num(row.availability) !== null)
    .sort((a, b) => Number(a.availability) - Number(b.availability)).slice(0, 5);
  setRows('impact-table', list, 4, row => {
    const availability = Number(row.availability);
    const state = availability < 50 ? 'Crítico' : availability < 70 ? 'En riesgo' : 'Normal';
    return `<tr data-equipment="${esc(row.equipment)}" tabindex="0"><td><b>${esc(row.equipment)}</b></td><td>${esc(row.family || '—')}</td><td>${fmt(availability)}%</td><td>${badge(state)}</td></tr>`;
  });
}

function compareRow(name, primary, secondary, valueText) {
  const second = secondary ? `<div class="compare-track ${secondary.className || ''}"><i style="width:${secondary.pct}%"></i></div>` : '';
  return `<div class="compare-row"><span class="compare-name" title="${esc(name)}">${esc(name)}</span><div class="compare-bars"><div class="compare-track ${primary.className || ''}"><i style="width:${primary.pct}%"></i></div>${second}</div><span class="compare-value">${esc(valueText)}</span></div>`;
}

function percentile(value, max) {
  return Math.max(0, Math.min(100, max > 0 ? value / max * 100 : 0));
}

function renderReliability(kpiRows) {
  const host = $('reliability-chart');
  const items = groupFamilies(kpiRows).map(group => ({
    family: group.family,
    tmef: average(group.rows.filter(row => (num(row.tmef) || 0) > 0), 'tmef'),
    tmpr: average(group.rows.filter(row => (num(row.tmpr) || 0) > 0), 'tmpr')
  })).filter(item => item.tmef !== null || item.tmpr !== null).sort((a, b) => (b.tmef ?? 0) - (a.tmef ?? 0));
  if (!items.length) {
    host.innerHTML = '<div class="empty">Sin TMEF/TMPR registrados en el periodo.</div>';
    return;
  }
  const max = Math.max(1, ...items.flatMap(item => [item.tmef || 0, item.tmpr || 0]));
  host.innerHTML = items.slice(0, 7).map(item => compareRow(item.family,
    { pct: percentile(item.tmef || 0, max) },
    { pct: percentile(item.tmpr || 0, max), className: 'orange' },
    `${fmt(item.tmef)} / ${fmt(item.tmpr)} h`)).join('');
}

function renderStops(kpiRows) {
  const host = $('stops-chart');
  const groups = new Map();
  for (const row of kpiRows) {
    const family = String(row.family || 'Sin familia');
    groups.set(family, (groups.get(family) || 0) + (num(row.stops) || 0));
  }
  const items = [...groups].map(([family, total]) => ({ family, total })).filter(item => item.total > 0).sort((a, b) => b.total - a.total);
  if (!items.length) {
    host.innerHTML = '<div class="empty">Sin paros registrados en el periodo.</div>';
    return;
  }
  const max = Math.max(...items.map(item => item.total));
  host.innerHTML = items.slice(0, 7).map(item => compareRow(item.family, { pct: percentile(item.total, max) }, null, fmt(item.total, 0))).join('');
}

function renderHours(kpiRows) {
  const host = $('hours-chart');
  const groups = new Map();
  for (const row of kpiRows) {
    const family = String(row.family || 'Sin familia');
    const group = groups.get(family) || { mp: 0, mc: 0 };
    group.mp += num(row.mp_hours) || 0;
    group.mc += num(row.mc_hours) || 0;
    groups.set(family, group);
  }
  const items = [...groups].map(([family, group]) => ({ family, ...group })).filter(item => item.mp + item.mc > 0).sort((a, b) => (b.mp + b.mc) - (a.mp + a.mc));
  if (!items.length) {
    host.innerHTML = '<div class="empty">Sin horas de mantenimiento en el periodo.</div>';
    return;
  }
  const max = Math.max(1, ...items.map(item => item.mp + item.mc));
  host.innerHTML = items.slice(0, 7).map(item => compareRow(item.family,
    { pct: percentile(item.mp, max) },
    { pct: percentile(item.mc, max), className: 'orange' },
    `${fmt(item.mp + item.mc)}h`)).join('');
}

function renderShiftComparison(bitacoraRows) {
  const host = $('shift-comparison');
  const groups = new Map();
  for (const row of bitacoraRows) {
    const shift = String(row.shift || 'Sin turno').trim() || 'Sin turno';
    const group = groups.get(shift) || { captures: 0, worked: 0, mp: 0, mc: 0, stops: 0 };
    group.captures += 1;
    group.worked += num(row.worked_hours) || 0;
    group.mp += num(row.mp_hours) || 0;
    group.mc += num(row.mc_hours) || 0;
    group.stops += num(row.stops) || 0;
    groups.set(shift, group);
  }
  const items = [...groups].map(([shift, metrics]) => ({ shift, ...metrics })).sort((a, b) => a.shift.localeCompare(b.shift, 'es'));
  if (!items.length) {
    host.innerHTML = '<div class="empty">Sin capturas por turno en el periodo consultado.</div>';
    return;
  }
  host.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Turno</th><th>Capturas</th><th>Horas operadas</th><th>MP h</th><th>MC h</th><th>Paros</th></tr></thead><tbody>${items.map(item => `<tr><td><b>${esc(item.shift)}</b></td><td>${item.captures}</td><td>${fmt(item.worked)}</td><td>${fmt(item.mp)}</td><td>${fmt(item.mc)}</td><td>${fmt(item.stops, 0)}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderTop(kpiRows) {
  const host = $('top-chart');
  const groups = new Map();
  for (const row of kpiRows) {
    if (!row.equipment) continue;
    groups.set(row.equipment, (groups.get(row.equipment) || 0) + (num(row.worked_hours) || 0));
  }
  const items = [...groups].map(([equipment, hours]) => ({ equipment, hours })).filter(item => item.hours > 0).sort((a, b) => b.hours - a.hours).slice(0, 6);
  if (!items.length) {
    host.innerHTML = '<div class="empty">Sin horas operadas en el periodo.</div>';
    return;
  }
  const max = Math.max(...items.map(item => item.hours));
  host.innerHTML = items.map(item => compareRow(item.equipment, { pct: percentile(item.hours, max) }, null, `${fmt(item.hours)}h`)).join('');
}

function miniTrend(points) {
  if (!points.length) return '<div class="empty">Sin cortes KPI en el periodo.</div>';
  const width = 520, height = 96, pad = 10;
  const values = points.map(point => point.value);
  const min = Math.min(...values), max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const coords = points.map((point, index) => ({
    x: pad + (width - pad * 2) * index / Math.max(points.length - 1, 1),
    y: height - pad - (height - pad * 2) * (point.value - min) / range,
    tip: `${formatDate(point.date)} · ${fmt(point.value)}%`
  }));
  const line = coords.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords.at(-1).x.toFixed(1)},${height - pad} L${coords[0].x.toFixed(1)},${height - pad} Z`;
  const dots = coords.map(point => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="2.6" fill="#128b47" stroke="white" stroke-width="1.2"><title>${esc(point.tip)}</title></circle>`).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Disponibilidad por corte">${min !== max ? `<path d="${area}" fill="#10a667" opacity=".12"/>` : ''}<path d="${line}" fill="none" stroke="#128b47" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`;
}

function detailMetric(label, value) {
  return `<div class="detail-metric"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
}

function openEquipment(code) {
  if (!code) return;
  const { start, end } = filterValues();
  const inRange = row => {
    if (!row.date) return true;
    const date = row.date.slice(0, 10);
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  };
  const base = data.equipment.find(row => row.code === code) || {};
  const kpiRows = data.kpi.filter(row => row.equipment === code && inRange(row)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const last = kpiRows.at(-1) || data.kpi.find(row => row.equipment === code) || {};
  const availability = average(kpiRows, 'availability');
  const utilization = average(kpiRows, 'utilization');
  const hours = kpiRows.reduce((sum, row) => sum + (num(row.worked_hours) || 0), 0);
  const stops = kpiRows.reduce((sum, row) => sum + (num(row.stops) || 0), 0);
  const tmef = average(kpiRows.filter(row => (num(row.tmef) || 0) > 0), 'tmef');
  const tmpr = average(kpiRows.filter(row => (num(row.tmpr) || 0) > 0), 'tmpr');
  const logs = data.bitacora.filter(row => row.equipment === code && inRange(row)).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);
  const dailyGroups = new Map();
  for (const row of data.bitacora.filter(item => item.equipment === code && inRange(item))) {
    const date = String(row.date || '').slice(0, 10);
    if (!date) continue;
    const day = dailyGroups.get(date) || { date, worked: 0, mp: 0, mc: 0, captures: 0 };
    day.worked += num(row.worked_hours) || 0;
    day.mp += num(row.mp_hours) || 0;
    day.mc += num(row.mc_hours) || 0;
    day.captures += 1;
    dailyGroups.set(date, day);
  }
  const kpiByDate = new Map(kpiRows.filter(row => row.date).map(row => [String(row.date).slice(0, 10), row]));
  const dailyRows = [...new Set([...dailyGroups.keys(), ...kpiByDate.keys()])].sort((a, b) => b.localeCompare(a)).map(date => ({
    ...(dailyGroups.get(date) || { date, worked: null, mp: null, mc: null, captures: 0 }),
    kpi: kpiByDate.get(date) || null
  }));
  const services = data.calendar.filter(row => row.equipment === code).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 8);
  const trendPoints = kpiRows.filter(row => num(row.availability) !== null).map(row => ({ date: row.date, value: Number(row.availability) }));
  const description = base.description || last.description || code;
  const family = base.family || last.family || '—';
  const status = base.status || last.status || 'Sin dato';

  $('equipment-detail').innerHTML = `
    <header class="detail-head">
      <div class="detail-code">${esc(code)}</div>
      <div><h2 id="modal-title">${esc(description)}</h2><p>${esc(family)} · ${badge(status)}</p></div>
    </header>
    <div class="detail-metrics">
      ${detailMetric('Disponibilidad', availability === null ? '—' : `${fmt(availability)}%`)}
      ${detailMetric('Utilización', utilization === null ? '—' : `${fmt(utilization)}%`)}
      ${detailMetric('Horas operadas', fmt(hours))}
      ${detailMetric('Paros', fmt(stops, 0))}
      ${detailMetric('TMEF', tmef === null ? '—' : `${fmt(tmef)} h`)}
      ${detailMetric('TMPR', tmpr === null ? '—' : `${fmt(tmpr)} h`)}
    </div>
    <article class="detail-block">
      <div class="detail-block-head"><h4>Disponibilidad por corte</h4><span>${trendPoints.length} corte(s) en el periodo</span></div>
      ${miniTrend(trendPoints)}
    </article>
    <article class="detail-block">
      <div class="detail-block-head"><h4>Indicadores y horas por fecha</h4><span>${dailyRows.length} día(s)</span></div>
      <p class="daily-kpi-note">Disponibilidad y utilización se muestran únicamente en las fechas publicadas como corte KPI. Las horas diarias son la suma de capturas de bitácora del equipo.</p>
      ${dailyRows.length ? `<div class="table-wrap daily-kpi-table"><table><thead><tr><th>Fecha</th><th>Disponibilidad<br><small>corte KPI</small></th><th>Utilización<br><small>corte KPI</small></th><th>Horas trabajadas</th><th>Horas MP</th><th>Horas MC</th><th>Horas mantenimiento</th><th>Capturas</th></tr></thead><tbody>${dailyRows.map(row => `<tr><td>${formatDate(row.date)}</td><td>${row.kpi && num(row.kpi.availability) !== null ? `${fmt(row.kpi.availability)}%` : '—'}</td><td>${row.kpi && num(row.kpi.utilization) !== null ? `${fmt(row.kpi.utilization)}%` : '—'}</td><td>${fmt(row.worked)}</td><td>${fmt(row.mp)}</td><td>${fmt(row.mc)}</td><td>${fmt(row.mp === null && row.mc === null ? null : (row.mp || 0) + (row.mc || 0))}</td><td>${row.captures || '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Sin KPI ni capturas de bitácora para este equipo en el periodo seleccionado.</div>'}
    </article>
    <div class="detail-columns">
      <article class="detail-block">
        <div class="detail-block-head"><h4>Bitácora reciente</h4><span>${logs.length} registro(s)</span></div>
        ${logs.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Turno</th><th>Componente</th><th>Horas</th><th>Estado</th></tr></thead><tbody>${logs.map(row => `<tr><td>${formatDate(row.date)}</td><td>${esc(row.shift)}</td><td>${esc(row.component)}</td><td>${fmt(row.worked_hours)}</td><td>${badge(row.status)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Sin capturas en el periodo.</div>'}
      </article>
      <article class="detail-block">
        <div class="detail-block-head"><h4>Servicios preventivos</h4><span>${services.length} servicio(s)</span></div>
        ${services.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Servicio</th><th>Tipo</th><th>Objetivo</th><th>Estado</th></tr></thead><tbody>${services.map(row => `<tr><td>${formatDate(row.date)}</td><td>${esc(row.service)}</td><td>${esc(row.type)}</td><td>${fmt(row.target)} ${esc(row.unit)}</td><td>${badge(row.status)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Sin servicios registrados.</div>'}
      </article>
    </div><article class="detail-block"><h4>Órdenes de trabajo y evidencias</h4>${ordersForEquipment(code)}</article>`;
  $('equipment-modal').hidden = false;
  document.body.classList.add('modal-open');
  $('equipment-modal').querySelector('.modal-close').focus();
}

function evidenceURL(file) {
  return /^[a-f0-9]{64}$/.test(file.sha256 || '') ? `${API_URL}/evidence/${file.sha256}` : null;
}
function ordersForEquipment(code) {
  const list=(data.work_orders||[]).filter(r=>r.equipment===code);
  return list.length ? `<div class="order-links">${list.map(r=>`<button type="button" class="button button-outline" data-order="${esc(r.id)}">${esc(r.number)} · ${formatDate(r.date)} · ${(r.evidence||[]).length} evidencias</button>`).join('')}</div>` : '<p>Sin órdenes publicadas para este equipo.</p>';
}
function renderOrders() {
  if (!$('orders-table')) return;
  const list=rows('work_orders');
  setRows('orders-table',list,7,r=>`<tr tabindex="0" data-order="${esc(r.id)}"><td><button class="text-link" data-order="${esc(r.id)}">${esc(r.number)}</button></td><td>${formatDate(r.date)}</td><td>${esc(r.equipment)}<br><small>${esc(r.description)}</small></td><td>${esc(r.type)}</td><td>${esc(r.correction||r.instructions||r.failure||'Sin descripción')}</td><td>${badge(r.status)}</td><td>${(r.evidence||[]).length}</td></tr>`);
  $('orders-count').textContent=`${list.length} órdenes · ${list.reduce((n,r)=>n+(r.evidence||[]).length,0)} evidencias`;
}
function openOrder(id) {
  const order=(data.work_orders||[]).find(r=>String(r.id)===String(id));
  if(!order)return toast('Esta orden ya no está en el corte publicado. Actualiza la consulta.');
  const files=Array.isArray(order.evidence)?order.evidence:[];
  $('order-detail').innerHTML=`<header class="detail-head"><div><h2 id="order-title">${esc(order.number)}</h2><p>${esc(order.equipment)} · ${esc(order.description)} · ${formatDate(order.date)}</p>${badge(order.status)}</div></header><article class="detail-block"><h4>${esc(order.type)} · ${esc(order.priority)} · ${esc(order.component||'Sin componente')}</h4><h4>Trabajo solicitado</h4><p class="order-text">${esc(order.instructions||'Sin información registrada')}</p><h4>Falla reportada</h4><p class="order-text">${esc(order.failure||'Sin información registrada')}</p><h4>Trabajo realizado</h4><p class="order-text">${esc(order.correction||'Sin información registrada')}</p></article><article class="detail-block"><h4>Evidencias de la orden (${files.length})</h4><div class="evidence-grid">${files.map(file=>{const url=evidenceURL(file);return `<article class="evidence-card">${file.available&&url&&String(file.mime).startsWith('image/')?`<a href="${url}" target="_blank" rel="noopener noreferrer"><img loading="lazy" src="${url}" alt="${esc(file.caption||file.name)}"></a>`:''}<b>${esc(file.name)}</b><p>${esc(file.caption||'Sin descripción adicional')}</p><small>${esc(file.mime)} · ${fmt((file.size||0)/1024,0)} KB</small><br>${file.available&&url?`<a class="button button-primary" href="${url}" target="_blank" rel="noopener noreferrer">${file.mime==='application/pdf'?'Abrir PDF':'Abrir imagen'}</a>`:'<span class="status amber">Archivo no disponible</span>'}</article>`}).join('')||'<p>Esta orden aún no tiene evidencias publicadas.</p>'}</div></article>`;
  $('order-modal').hidden=false;document.body.classList.add('modal-open');$('order-modal').querySelector('.modal-close').focus();
}
function closeOrder(){ $('order-modal').hidden=true;if($('equipment-modal').hidden)document.body.classList.remove('modal-open'); }
document.addEventListener('click',event=>{const close=event.target.closest('[data-order-close]');if(close)return closeOrder();const button=event.target.closest('[data-order]');if(button){event.stopPropagation();openOrder(button.dataset.order);}});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeOrder();if(event.key==='Enter'&&event.target.matches('tr[data-order]'))openOrder(event.target.dataset.order);});

function closeModal() {
  $('equipment-modal').hidden = true;
  document.body.classList.remove('modal-open');
}

function updatePrintHead() {
  const { family, equipment, shift, status, condition, type, start, end } = filterValues();
  const conditionLabel = { disponible: 'Disponible', riesgo: 'En riesgo', critico: 'Crítico', sindato: 'Sin dato' }[condition] || 'Todas';
  $('print-title').textContent = VIEWS[view]?.label || 'Resumen KPI';
  $('print-subtitle').textContent = VIEWS[view]?.subtitle || '';
  $('print-period').textContent = `Periodo: ${start || '—'} a ${end || '—'}`;
  $('print-filters').textContent = `Familia: ${family || 'Todas'} · Equipo: ${equipment || 'Todos'} · Turno: ${shift || 'Todos'} · Estado: ${status || 'Todos'} · Condición: ${conditionLabel} · Tipo: ${type || 'Todos'}`;
  $('print-generated').textContent = `Generado: ${new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}`;
}

function renderSummary(kpiRows, bitacoraRows, calendarRows) {
  const equipmentCount = new Set(kpiRows.map(row => row.equipment).filter(Boolean)).size;
  const stops = bitacoraRows.reduce((sum, row) => sum + (num(row.stops) || 0), 0);
  const hours = bitacoraRows.reduce((sum, row) => sum + (num(row.worked_hours) || 0), 0);
  const items = [
    ['▣', 'Equipos con KPI', equipmentCount, 'En periodo / familia'],
    ['◷', 'Capturas de bitácora', bitacoraRows.length, 'Registros consultados'],
    ['▦', 'Servicios en periodo', calendarRows.length, 'Calendario preventivo'],
    ['⚠', 'Paros registrados', fmt(stops, 0), `${fmt(hours)} horas operadas`]
  ];
  $('operational-summary').innerHTML = items.map(([icon, label, value, note]) => `<div class="summary-item"><span class="summary-icon">${icon}</span><div><span>${label}</span><b>${esc(value)}</b><small>${esc(note)}</small></div></div>`).join('');
}

function renderReportScope(kpiRows, bitacoraRows, calendarRows, equipmentRows) {
  const family = $('family-filter').value || 'Todas las familias';
  const shift = $('shift-filter').value || 'Todos los turnos';
  const period = `${$('date-start').value || '—'} a ${$('date-end').value || '—'}`;
  $('report-scope').textContent = `Periodo ${period} · ${family} · ${shift}. El reporte respeta el módulo abierto y los filtros vigentes.`;
  $('report-breakdown').innerHTML = [
    ['Registros KPI', kpiRows.length], ['Bitácora', bitacoraRows.length],
    ['Servicios', calendarRows.length], ['Equipos', equipmentRows.length]
  ].map(([label, value]) => `<div class="breakdown-item"><b>${value}</b><span>${label}</span></div>`).join('');
}

function supervisionRows() {
  const { family, equipment, shift, query, start, end } = filterValues();
  return (data.supervision || []).filter(row => {
    const date = String(row.date || '').slice(0, 10);
    if (family && row.family !== family) return false;
    if (equipment && row.equipment !== equipment) return false;
    if (shift && row.shift !== shift) return false;
    if (query && !Object.values(row).join(' ').toLocaleLowerCase('es-MX').includes(query)) return false;
    if (start && date && date < start) return false;
    if (end && date && date > end) return false;
    return true;
  });
}

function renderSupervision() {
  const list = supervisionRows();
  const grouped = new Map();
  for (const row of list) {
    const supervisor = String(row.supervisor || row.administrator || 'Sin supervisor').trim() || 'Sin supervisor';
    const item = grouped.get(supervisor) || { supervisor, rows: [], dates: new Set(), equipment: new Set() };
    item.rows.push(row);
    if (row.date) item.dates.add(String(row.date).slice(0, 10));
    if (row.equipment) item.equipment.add(row.equipment);
    grouped.set(supervisor, item);
  }
  const summary = [...grouped.values()].map(item => ({
    ...item,
    availability: average(item.rows, 'availability'), utilization: average(item.rows, 'utilization'),
    worked: item.rows.reduce((sum, row) => sum + (num(row.worked_hours) || 0), 0),
    maintenance: item.rows.reduce((sum, row) => sum + (num(row.mp_hours) || 0) + (num(row.mc_hours) || 0), 0)
  })).sort((a, b) => a.supervisor.localeCompare(b.supervisor, 'es'));
  const availability = average(list, 'availability');
  const utilization = average(list, 'utilization');
  $('supervision-metrics').innerHTML = [
    metric('Supervisores', summary.length, 'Administradores con registros', '#1476df', '◉'),
    metric('Capturas sincronizadas', list.length, 'En el periodo consultado', '#f59b18', '▤'),
    metric('Disponibilidad', availability === null ? '—' : `${fmt(availability)}%`, 'Promedio de supervisión', '#17a76a', '⚙', availability),
    metric('Utilización', utilization === null ? '—' : `${fmt(utilization)}%`, 'Promedio de supervisión', '#0ba6a7', '◉', utilization)
  ].join('');
  setRows('supervision-table', summary, 8, row => `<tr><td><b>${esc(row.supervisor)}</b></td><td>${row.dates.size}</td><td>${row.equipment.size}</td><td>${row.rows.length}</td><td>${fmt(row.availability)}%</td><td>${fmt(row.utilization)}%</td><td>${fmt(row.worked)} h</td><td>${fmt(row.maintenance)} h</td></tr>`);
  setRows('supervision-detail-table', list.slice().sort((a,b) => String(b.date || '').localeCompare(String(a.date || ''))), 11, row => `<tr><td>${formatDate(row.date)}</td><td><b>${esc(row.supervisor || row.administrator || 'Sin supervisor')}</b></td><td>${esc(row.equipment)}</td><td>${esc(row.family)}</td><td>${esc(row.shift)}</td><td>${fmt(row.availability)}%</td><td>${fmt(row.utilization)}%</td><td>${fmt(row.worked_hours)} h</td><td>${fmt(row.mp_hours)} h</td><td>${fmt(row.mc_hours)} h</td><td>${badge(row.status)}</td></tr>`);
  $('supervision-count').textContent = `${summary.length} supervisor${summary.length === 1 ? '' : 'es'} · ${list.length} capturas`;
}

function render() {
  renderOrders();
  const kpiRows = rows('kpi');
  const kpiByEquipment = aggregateByEquipment(kpiRows);
  const bitacoraRows = rows('bitacora');
  const calendarRows = rows('calendar');
  const calendarByEquipment = aggregateCalendarByEquipment(calendarRows);
  const equipmentRows = rows('equipment');
  const availability = average(kpiRows, 'availability');
  const utilization = average(kpiRows, 'utilization');
  const tmef = average(kpiRows.filter(row => (num(row.tmef) || 0) > 0), 'tmef');
  const tmpr = average(kpiRows.filter(row => (num(row.tmpr) || 0) > 0), 'tmpr');
  const serviceCount = calendarRows.filter(row => !/cancel/i.test(String(row.status || ''))).length;
  const completed = calendarRows.filter(row => /complet|ejecut|realiz/i.test(String(row.status || ''))).length;
  const completion = serviceCount ? completed / serviceCount * 100 : null;

  $('metrics').innerHTML = [
    metric('Disponibilidad mecánica', availability === null ? '—' : `${fmt(availability)}%`, 'Promedio KPI del periodo', '#17a76a', '⚙', availability),
    metric('Utilización', utilization === null ? '—' : `${fmt(utilization)}%`, 'Promedio KPI del periodo', '#1476df', '◉', utilization),
    metric('TMEF promedio', tmef === null ? '—' : `${fmt(tmef)} h`, 'Tiempo medio entre fallas', '#e0673c', '⏱'),
    metric('TMPR promedio', tmpr === null ? '—' : `${fmt(tmpr)} h`, 'Tiempo medio para reparar', '#0ba6a7', '⏱'),
    metric('Ejecución de preventivos', completion === null ? '—' : `${fmt(completion)}%`, `${completed} de ${serviceCount} servicios completados`, '#8052e8', '▦', completion),
    metric('Capturas de bitácora', bitacoraRows.length, 'En el periodo consultado', '#f59b18', '⚒'),
    metric('Servicios en el periodo', serviceCount, 'En el calendario consultado', '#0ba6a7', '▣')
  ].join('');

  renderTrend(kpiRows);
  renderFamilyPanel(kpiRows);
  renderComparison(kpiRows);
  renderImpact(kpiByEquipment);
  renderReliability(kpiRows);
  renderStops(kpiRows);
  renderHours(kpiRows);
  renderTop(kpiRows);
  renderShiftComparison(bitacoraRows);
  renderSummary(kpiRows, bitacoraRows, calendarRows);
  renderSupervision();
  $('kpi-count').textContent = `${kpiByEquipment.length} equipos · ${kpiRows.length} cortes`;

  setRows('kpi-table', kpiByEquipment, 9, row => `<tr data-equipment="${esc(row.equipment)}" tabindex="0" title="${row.cuts} corte(s) KPI en el periodo"><td><b>${esc(row.equipment)}</b><br>${esc(row.description)}</td><td>${esc(row.family)}</td><td>${fmt(row.availability)}%</td><td>${fmt(row.utilization)}%</td><td>${fmt(row.worked_hours)}</td><td>${fmt(row.mp_hours)}</td><td>${fmt(row.mc_hours)}</td><td>${fmt(row.stops, 0)}</td><td>${badge(row.status)}</td></tr>`);
  setRows('bitacora-table', bitacoraRows, 12, row => `<tr data-equipment="${esc(row.equipment)}" tabindex="0"><td>${formatDate(row.date)}</td><td><b>${esc(row.equipment)}</b></td><td>${esc(row.family)}</td><td>${esc(row.shift)}</td><td>${esc(row.component)}</td><td>${fmt(row.hi)}</td><td>${fmt(row.hf)}</td><td>${fmt(row.worked_hours)}</td><td>${fmt(row.mp_hours)}</td><td>${fmt(row.mc_hours)}</td><td>${fmt(row.stops, 0)}</td><td>${badge(row.status)}</td></tr>`);
  setRows('calendar-table', calendarByEquipment, 9, row => `<tr data-equipment="${esc(row.equipment)}" tabindex="0" title="Servicios en el periodo: ${esc((row.dates || []).map(formatDate).join(' · '))}"><td>${formatDate(row.date)}</td><td><b>${esc(row.equipment)}</b><br>${esc(row.description)}</td><td>${esc(row.family)}</td><td>${esc(row.service)}</td><td>${esc(row.type)}</td><td>${fmt(row.meter)} ${esc(row.unit)}</td><td>${fmt(row.target)} ${esc(row.unit)}</td><td>${badge(row.status)}</td><td>${row.services}</td></tr>`);
  renderCalendar(calendarRowsForView());
  setRows('equipment-table', equipmentRows, 4, row => `<tr data-equipment="${esc(row.code)}" tabindex="0"><td><b>${esc(row.code)}</b></td><td>${esc(row.description)}</td><td>${esc(row.family)}</td><td>${badge(row.status)}</td></tr>`);
  $('bitacora-count').textContent = `${bitacoraRows.length} registros`;
  $('equipment-count').textContent = `${equipmentRows.length} equipos`;

  const updated = data.meta?.updatedAt || '—';
  $('updated-at').textContent = formatDateTime(updated);
  $('footer-updated').textContent = updated;
  $('data-tag').textContent = data.schema ? 'CORTE DEL PROGRAMA' : 'SIN DATOS';
  $('report-period').textContent = `${$('date-start').value || data.meta?.periodStart || '—'} a ${$('date-end').value || data.meta?.periodEnd || '—'} · KPI ${kpiRows.length} · Bitácora ${bitacoraRows.length} · Calendario ${calendarRows.length}`;
  const periodName = PERIOD_LABELS[reportPeriod];
  $('report-pptx-range').textContent = `${periodName ? `Periodo ${periodName}` : 'Periodo seleccionado'}: ${formatRange($('date-start').value, $('date-end').value)} · ${kpiRows.length} cortes KPI · ${equipmentRows.length} equipos`;
  renderReportScope(kpiRows, bitacoraRows, calendarRows, equipmentRows);
  updatePrintHead();
  renderDiesel();
}

function fillSelect(id, options, allLabel) {
  const select = $(id);
  const previous = select.value;
  select.innerHTML = `<option value="">${esc(allLabel)}</option>`
    + options.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('');
  if (options.some(([value]) => value === previous)) select.value = previous;
}

function fillFilters() {
  const dieselSource = Array.isArray(data.diesel) ? data.diesel : [];
  const allRows = [...data.equipment, ...data.kpi, ...data.bitacora, ...data.calendar, ...dieselSource, ...data.work_orders];
  const sort = (a, b) => String(a).localeCompare(String(b), 'es');

  const families = [...new Set(allRows.map(row => row.family).filter(Boolean))].sort(sort);
  fillSelect('family-filter', families.map(family => [family, family]), 'Todas las familias');

  const codes = [...new Set([
    ...data.equipment.map(row => row.code),
    ...data.kpi.map(row => row.equipment),
    ...data.bitacora.map(row => row.equipment),
    ...data.calendar.map(row => row.equipment),
    ...data.work_orders.map(row => row.equipment),
    ...dieselSource.map(row => row.equipment || row.code)
  ].filter(Boolean))].sort(sort);
  fillSelect('equipment-filter', codes.map(code => [code, code]), 'Todos los equipos');

  const shifts = [...new Set([...data.bitacora.map(row => row.shift), ...dieselSource.map(row => row.shift)].filter(Boolean))].sort(sort);
  fillSelect('shift-filter', shifts.map(shift => [shift, shift]), 'Todos');

  const statusMap = new Map();
  for (const row of allRows) {
    const key = normStatus(row.status);
    if (key && !statusMap.has(key)) statusMap.set(key, String(row.status).trim());
  }
  const statuses = [...statusMap].sort((a, b) => sort(a[1], b[1]));
  fillSelect('status-filter', statuses, 'Todos los estados');

  const types = [...new Set(data.calendar.map(row => row.type).filter(Boolean))].sort(sort);
  fillSelect('type-filter', types.map(type => [type, type]), 'Todos los tipos');
  fillSelect('calendar-family', families.map(family => [family, family]), 'Todas las familias');
  fillSelect('calendar-equipment', [...new Set(data.calendar.map(row => row.equipment).filter(Boolean))].sort(sort).map(code => [code, code]), 'Todos los equipos');
  const calendarStatuses = [...new Map(data.calendar.map(row => [normStatus(row.status), String(row.status || '').trim()]).filter(([key, label]) => key && label)).entries()].sort((a,b)=>sort(a[1],b[1]));
  fillSelect('calendar-status', calendarStatuses, 'Todos los estados');
  fillSelect('calendar-type', types.map(type => [type, type]), 'Todos los tipos');
}

async function loadLocal(file) {
  if (!file) return;
  try {
    data = acceptPackage(JSON.parse(await file.text()));
    if (data.meta.periodStart) $('date-start').value = data.meta.periodStart;
    if (data.meta.periodEnd) $('date-end').value = data.meta.periodEnd;
    if (data.meta.periodEnd) $('report-anchor-date').value = data.meta.periodEnd;
    fillFilters();
    $('public-notice').hidden = true;
    setConnection(true, 'Paquete local listo');
    render();
    toast('Paquete abierto localmente; no se envió al sitio.');
  } catch (error) {
    setConnection(Boolean(data.schema), data.schema ? 'Corte válido conservado' : 'Esperando un paquete válido');
    $('public-notice').hidden = false;
    $('connection-error-title').textContent = 'No se pudo importar el paquete';
    $('connection-error-detail').textContent = `${error.message} No se sustituyeron los datos que ya estaban cargados.`;
    toast(`No se pudo abrir el paquete: ${error.message}`);
  }
}

function setConnection(online, message) {
  $('connection-label').textContent = online ? 'Conectado' : 'Sin conexión';
  $('data-status').textContent = message;
  document.querySelector('.status-dot').classList.toggle('offline', !online);
}

async function refreshData() {
  const button = $('refresh-data');
  button.classList.add('spinning');
  try {
    const response = await fetch(API_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = acceptPackage(await response.json());
    if (data.meta.periodStart) $('date-start').value = data.meta.periodStart;
    if (data.meta.periodEnd) $('date-end').value = data.meta.periodEnd;
    if (data.meta.periodEnd) $('report-anchor-date').value = data.meta.periodEnd;
    fillFilters();
    $('public-notice').hidden = true;
    setConnection(true, `${data.meta?.periodStart || '—'} a ${data.meta?.periodEnd || '—'}`);
    render();
    toast('Información actualizada desde el programa.');
  } catch (error) {
    $('public-notice').hidden = false;
    setConnection(false, data.schema ? 'Sin conexión; se conserva el último corte válido' : 'Sin datos; revisa conexión o importa un paquete');
    $('connection-label').textContent = error instanceof TypeError ? 'Sin conexión' : 'No actualizado';
    $('connection-error-title').textContent = data.schema ? 'No se pudo actualizar el portal' : 'No hay conexión con el último corte publicado';
    $('connection-error-detail').textContent = `${error.message || 'Error de red o respuesta inválida.'} ${data.schema ? `Se conserva el corte generado el ${formatDateTime(data.meta?.updatedAt)}.` : 'Comprueba internet o abre un JSON válido exportado por Mantenimiento.exe.'}`;
    toast(`No se pudo actualizar: ${error.message}`);
  } finally {
    button.classList.remove('spinning');
  }
}

function csvExport() {
  const views = {
    inicio: ['KPI', aggregateByEquipment(rows('kpi')), ['date', 'equipment', 'description', 'family', 'availability', 'utilization', 'worked_hours', 'mp_hours', 'mc_hours', 'stops', 'status', 'tmef', 'tmpr', 'cuts']],
    bitacora: ['Bitacora', rows('bitacora'), ['date', 'equipment', 'description', 'family', 'shift', 'component', 'hi', 'hf', 'worked_hours', 'mp_hours', 'mc_hours', 'standby_hours', 'stops', 'status']],
    calendario: ['Calendario', calendarRowsForView(), ['date', 'equipment', 'description', 'family', 'service', 'type', 'meter', 'target', 'unit', 'status']],
    ordenes: ['Ordenes', rows('work_orders'), ['number','date','equipment','family','type','status','instructions','correction']],
    equipos: ['Equipos', rows('equipment'), ['code', 'description', 'family', 'status']],
    diesel: ['Diesel', dieselFiltered(), ['date', 'equipment', 'description', 'category', 'department', 'horometer', 'shift', 'shift1', 'shift2', 'shift3', 'liters']],
    supervision: ['Disponibilidad_supervision', supervisionRows(), ['date', 'supervisor', 'equipment', 'family', 'shift', 'availability', 'utilization', 'worked_hours', 'mp_hours', 'mc_hours', 'status']],
    reportes: ['KPI', aggregateByEquipment(rows('kpi')), ['date', 'equipment', 'description', 'family', 'availability', 'utilization', 'worked_hours', 'mp_hours', 'mc_hours', 'stops', 'status', 'tmef', 'tmpr', 'cuts']]
  };
  const [name, list, keys] = views[view];
  if (!list.length) return toast('No hay filas para exportar con estos filtros.');
  const titles = { date: 'Fecha', equipment: 'Equipo', description: 'Descripción', family: 'Familia', category: 'Categoría', department: 'Departamento', horometer: 'Horómetro', shift1: 'Turno 1 (L)', shift2: 'Turno 2 (L)', shift3: 'Turno 3 (L)', availability: 'Disponibilidad %', utilization: 'Utilización %', worked_hours: 'Horas operadas', mp_hours: 'MP h', mc_hours: 'MC h', stops: 'Paros', status: 'Estado', tmef: 'TMEF', tmpr: 'TMPR', shift: 'Turno', component: 'Componente', hi: 'HI', hf: 'HF', standby_hours: 'Stand by h', service: 'Servicio / gama', type: 'Tipo', meter: 'Medidor', target: 'Objetivo', unit: 'Unidad', code: 'Código', cuts: 'Cortes', services: 'Servicios', liters: 'Total litros', hours: 'Horas' };
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = '\ufeff' + [keys.map(key => titles[key] || key), ...list.map(row => keys.map(key => row[key]))]
    .map(row => row.map(quote).join(',')).join('\r\n');
  const from = view === 'diesel' ? $('diesel-date-start').value : $('date-start').value;
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `SierraMadre_${name}_${from || 'periodo'}.csv`);
}

function download(blob, name) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

function filteredReportRows(section, start, end, { applyDate = true } = {}) {
  const { family, equipment, shift, status, condition, type, query } = filterValues();
  return (data[section] || []).filter(row => {
    if (family && row.family !== family) return false;
    if (equipment && rowCode(section, row) !== equipment) return false;
    if (shift && section === 'bitacora' && row.shift !== shift) return false;
    if (status && normStatus(row.status) !== status) return false;
    if (condition && conditionOf(section, row) !== condition) return false;
    if (type && section === 'calendar' && String(row.type || '') !== type) return false;
    if (query && !Object.values(row).join(' ').toLocaleLowerCase('es-MX').includes(query)) return false;
    if (applyDate && row.date && start && row.date.slice(0, 10) < start) return false;
    if (applyDate && row.date && end && row.date.slice(0, 10) > end) return false;
    return true;
  });
}

async function generateExcelReport() {
  if (!data.schema) return toast('Aún no hay información publicada para generar el Excel.');
  if (!window.SierraExcelReport?.createReport) return toast('No se cargó el generador Excel. Recarga la página e inténtalo de nuevo.');
  const button = $('report-excel');
  const note = $('report-excel-note');
  const start = $('date-start').value || data.meta?.periodStart || '';
  const end = $('date-end').value || data.meta?.periodEnd || '';
  const kind = reportPeriod || periodKindFromRange(start, end) || 'periodo';
  if (!start || !end) return toast('Selecciona un rango de fechas para el reporte.');
  button.disabled = true;
  const oldLabel = button.textContent;
  button.textContent = 'Preparando Excel…';
  try {
    let kpiRows = filteredReportRows('kpi', start, end);
    let weeklyNote = '';
    if (kind === 'semanal') {
      const kpiDates = [...new Set(data.kpi.map(row => String(row.date || '').slice(0, 10)).filter(Boolean))];
      const hasDailyCuts = data.meta?.kpiGranularity === 'diaria' || kpiDates.some(date => {
        const parsed = dateAtNoon(date);
        return parsed && parsed.getDate() !== new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0).getDate() && date !== data.meta?.periodEnd;
      });
      if (!hasDailyCuts) {
        const referenceDate = data.kpi.map(row => String(row.date || '').slice(0, 10)).filter(date => date && date <= end).sort().at(-1);
        kpiRows = referenceDate ? filteredReportRows('kpi', '', '', { applyDate: false }).filter(row => String(row.date || '').slice(0, 10) === referenceDate) : [];
        weeklyNote = referenceDate
          ? `El paquete publica KPI por corte mensual, no KPI semanal. La gráfica y la hoja KPI muestran como referencia el último corte disponible (${formatDate(referenceDate)}); no representan el resultado exclusivo de esta semana. La bitácora y servicios sí están filtrados a la semana.`
          : 'El paquete no contiene KPI publicado hasta el cierre de esta semana. Se conservan las hojas de bitácora y calendario con los datos disponibles.';
      }
    }
    const bitacora = filteredReportRows('bitacora', start, end);
    const calendar = filteredReportRows('calendar', start, end);
    const kpiDetails = aggregateByEquipment(kpiRows).map(row => ({ ...row, date: kpiRows.filter(item => item.equipment === row.equipment).map(item => item.date).filter(Boolean).sort().at(-1) || '' }));
    const families = familyIndicators(kpiRows);
    const result = await window.SierraExcelReport.createReport({
      label: PERIOD_LABELS[kind] || 'Periodo seleccionado', range: formatRange(start, end),
      asOf: formatDateTime(data.meta?.updatedAt), families, kpiDetails, bitacora, calendar, weeklyNote
    });
    const filename = `SierraMadre_Reporte_${kind}_${start}_al_${end}.xlsx`;
    download(result.blob, filename);
    const chartText = result.chartCount ? `${result.kpiFamilyCount} familias en gráficas KPI` : 'sin cortes KPI para graficar';
    note.textContent = weeklyNote || `${chartText}. Datos al ${formatDateTime(data.meta?.updatedAt)}.`;
    toast(`Excel listo: ${kpiDetails.length} equipos KPI, ${bitacora.length} capturas y ${calendar.length} servicios.`);
  } catch (error) {
    note.textContent = `No se pudo generar el libro: ${error.message}`;
    toast(`No se pudo generar el Excel: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = oldLabel;
  }
}

function printReport() {
  document.body.classList.add('printing');
  window.print();
  setTimeout(() => document.body.classList.remove('printing'), 1000);
}

function selectView(element) {
  const next = element.dataset.view;
  if (!VIEWS[next]) return;
  view = next;
  document.body.classList.toggle('calendar-open', view === 'calendario');
  if (view === 'calendario' && $('date-end').value) {
    $('search').value = '';
    ['family-filter','equipment-filter','shift-filter','status-filter','condition-filter','type-filter'].forEach(id => { $(id).value = ''; });
    clearPeriodSelection();
    const endDate = dateAtNoon($('date-end').value);
    if (endDate) calendarAnchor = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    render();
  }
  document.querySelectorAll('.view').forEach(section => section.classList.toggle('active-view', section.id === `view-${view}`));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view));
  $('crumb-current').textContent = VIEWS[view].label;
  $('page-title').textContent = VIEWS[view].title;
  $('page-subtitle').textContent = VIEWS[view].subtitle;
  updatePrintHead();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => selectView(button)));
['search', 'family-filter', 'equipment-filter', 'shift-filter', 'status-filter', 'condition-filter', 'type-filter', 'date-start', 'date-end'].forEach(id => {
  $(id).addEventListener(id === 'search' ? 'input' : 'change', render);
});
$('clear-filters').addEventListener('click', () => {
  $('search').value = '';
  ['family-filter', 'equipment-filter', 'shift-filter', 'status-filter', 'condition-filter', 'type-filter'].forEach(id => { $(id).value = ''; });
  $('date-start').value = data.meta?.periodStart || '';
  $('date-end').value = data.meta?.periodEnd || '';
  clearPeriodSelection();
  render();
});
$('apply-filters').addEventListener('click', render);
$('refresh-data').addEventListener('click', refreshData);
$('load-data').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', event => loadLocal(event.target.files?.[0]));
['export-excel', 'quick-excel'].forEach(id => $(id).addEventListener('click', csvExport));
$('report-excel').addEventListener('click', generateExcelReport);
['export-pdf', 'quick-pdf', 'report-pdf'].forEach(id => $(id).addEventListener('click', printReport));
document.querySelectorAll('#period-toggle [data-period]').forEach(button => button.addEventListener('click', () => applyPeriod(button.dataset.period)));
$('report-anchor-date').addEventListener('change', () => {
  if (reportPeriod) applyPeriod(reportPeriod);
  else {
    const anchor = $('report-anchor-date').value;
    if (anchor) $('report-pptx-range').textContent = `Fecha elegida: ${formatDayLong(anchor)} · elige Día, Semana o Mes para fijar el intervalo.`;
  }
});
$('report-pptx').addEventListener('click', generatePptx);
  $('report-pdf-calendario').addEventListener('click', () => {
    const start = $('date-start').value;
    const end = $('date-end').value;
    if (!start || !end) {
      toast('Selecciona un periodo primero.');
      return;
    }
    document.body.classList.add('printing');
    window.print();
    setTimeout(() => document.body.classList.remove('printing'), 1000);
  });
['calendar-family', 'calendar-equipment', 'calendar-status', 'calendar-type'].forEach(id => $(id).addEventListener('change', () => renderCalendar(calendarRowsForView())));
$('calendar-search').addEventListener('input', () => renderCalendar(calendarRowsForView()));
$('calendar-list-toggle').addEventListener('click', () => { calendarListMode = !calendarListMode; renderCalendar(calendarRowsForView()); });
$('calendar-refresh').addEventListener('click', refreshData);
$('calendar-prev').addEventListener('click', () => moveCalendar(-1));
$('calendar-next').addEventListener('click', () => moveCalendar(1));
$('calendar-today').addEventListener('click', () => { const today = new Date(); calendarAnchor = new Date(today.getFullYear(), today.getMonth(), today.getDate()); setCalendarPeriod(); });
document.querySelectorAll('[data-calendar-view]').forEach(button => button.addEventListener('click', () => { calendarMode = button.dataset.calendarView; renderCalendar(calendarRowsForView()); }));
function moveCalendar(direction) {
  if (calendarMode === 'week') calendarAnchor.setDate(calendarAnchor.getDate() + direction * 7);
  else if (calendarMode === 'day') calendarAnchor.setDate(calendarAnchor.getDate() + direction);
  else calendarAnchor = new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth() + direction, 1);
  setCalendarPeriod();
}
function setCalendarPeriod() {
  let start, end;
  if (calendarMode === 'day') start = end = isoDate(calendarAnchor);
  else if (calendarMode === 'week') { const first = weekStart(calendarAnchor); const last = new Date(first); last.setDate(last.getDate() + 6); start = isoDate(first); end = isoDate(last); }
  else { start = isoDate(new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth(), 1)); end = isoDate(new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth() + 1, 0)); }
  $('date-start').value = start; $('date-end').value = end; clearPeriodSelection(); render();
}
['date-start', 'date-end'].forEach(id => $(id).addEventListener('change', () => {
  if (!reportPeriod) return;
  clearPeriodSelection();
  render();
}));

document.addEventListener('click', event => {
  const trigger = event.target.closest('[data-equipment]');
  if (trigger) {
    openEquipment(trigger.dataset.equipment);
    return;
  }
  if (event.target.closest('[data-modal-close]')) closeModal();
});
document.addEventListener('keydown', event => {
  const modal = $('equipment-modal');
  if (event.key === 'Escape' && !modal.hidden) {
    closeModal();
    return;
  }
  if (event.key === 'Enter' && event.target.matches('[data-equipment]')) {
    event.preventDefault();
    openEquipment(event.target.dataset.equipment);
  }
});

// ============ MÓDULO DE DIESEL ============

const DIESEL_PERIODS = { turno: 'Turno', dia: 'Día', semana: 'Semana', mes: 'Mes' };
let dieselPeriod = 'mes';
let dieselPdf = null; // exposed for automated preview/verification
let dieselLocalRecords = [];
let dieselWorkbook = null;
let dieselWorkbookSheets = [];
let dieselSharedStrings = [];
let dieselImportedSource = '';
let dieselPdfLogo = null;

function xmlElements(node, name) {
  return [...node.getElementsByTagNameNS('*', name)];
}

function xmlText(node) {
  return xmlElements(node, 't').map(item => item.textContent || '').join('');
}

function excelColumnIndex(address) {
  const letters = String(address || '').match(/^[A-Z]+/i)?.[0]?.toUpperCase() || '';
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return value - 1;
}

function excelSerialDate(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 1 || serial > 100000) return '';
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function parseDieselDate(value) {
  if (typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(String(value || ''))) return excelSerialDate(value);
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const local = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (local) return `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
  return '';
}

function dieselHeaderKey(value) {
  return String(value || '').trim().toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

function dieselResolvePath(base, target) {
  const parts = (target.startsWith('/') ? target.slice(1) : `${base}/${target}`).split('/');
  const stack = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

async function readDieselWorkbook(file) {
  const Zip = typeof JSZip !== 'undefined' ? JSZip : window.JSZip;
  if (!Zip?.loadAsync) throw new Error('No se pudo cargar el lector de Excel. Recarga el portal e inténtalo de nuevo.');
  dieselWorkbook = await Zip.loadAsync(await file.arrayBuffer());
  const workbookXml = dieselWorkbook.file('xl/workbook.xml');
  const relsXml = dieselWorkbook.file('xl/_rels/workbook.xml.rels');
  if (!workbookXml || !relsXml) throw new Error('El archivo no parece un libro Excel .xlsx válido.');
  const [workbookText, relsText, sharedText] = await Promise.all([
    workbookXml.async('text'), relsXml.async('text'), dieselWorkbook.file('xl/sharedStrings.xml')?.async('text') || Promise.resolve('')
  ]);
  const workbookDoc = new DOMParser().parseFromString(workbookText, 'application/xml');
  const relsDoc = new DOMParser().parseFromString(relsText, 'application/xml');
  const sharedDoc = sharedText ? new DOMParser().parseFromString(sharedText, 'application/xml') : null;
  if (xmlElements(workbookDoc, 'parsererror').length || xmlElements(relsDoc, 'parsererror').length) throw new Error('El libro tiene una estructura interna inválida.');
  dieselSharedStrings = sharedDoc ? xmlElements(sharedDoc, 'si').map(xmlText) : [];
  const rels = new Map(xmlElements(relsDoc, 'Relationship').map(rel => [rel.getAttribute('Id'), rel.getAttribute('Target')]));
  dieselWorkbookSheets = xmlElements(workbookDoc, 'sheet').map(sheet => {
    const rid = sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || sheet.getAttribute('r:id');
    const target = rels.get(rid);
    if (!target) return null;
    return { name: sheet.getAttribute('name') || 'Hoja', path: dieselResolvePath('xl', target) };
  }).filter(Boolean);
  if (!dieselWorkbookSheets.length) throw new Error('El libro no contiene hojas que se puedan leer.');
  return { sharedStrings: dieselSharedStrings, sheets: dieselWorkbookSheets };
}

async function parseDieselSheet(sheetInfo, sharedStrings) {
  const source = dieselWorkbook?.file(sheetInfo.path);
  if (!source) throw new Error(`No se encontró la hoja «${sheetInfo.name}» en el libro.`);
  const xml = await source.async('text');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (xmlElements(doc, 'parsererror').length) throw new Error(`La hoja «${sheetInfo.name}» está dañada.`);
  const rows = xmlElements(doc, 'row');
  const cellValue = cell => {
    const type = cell.getAttribute('t');
    if (type === 'inlineStr') return xmlText(cell);
    const raw = xmlElements(cell, 'v')[0]?.textContent ?? '';
    if (type === 's') return sharedStrings[Number(raw)] || '';
    return raw;
  };
  let header = null;
  let columns = {};
  const records = [];
  for (const row of rows) {
    const cells = new Map(xmlElements(row, 'c').map(cell => [excelColumnIndex(cell.getAttribute('r')), cellValue(cell)]));
    const indexed = [...cells.entries()].filter(([index]) => index >= 0).sort((a, b) => a[0] - b[0]);
    if (!header) {
      const candidates = new Map(indexed.map(([index, value]) => [dieselHeaderKey(value), index]));
      if (candidates.has('categoria') && candidates.has('equipo') && candidates.has('fecha')) {
        header = true;
        columns = Object.fromEntries(candidates);
      }
      continue;
    }
    const at = key => columns[key] === undefined ? '' : cells.get(columns[key]) ?? '';
    const date = parseDieselDate(at('fecha'));
    const equipment = String(at('equipo') || '').trim();
    if (!date || !equipment) continue;
    const number = value => {
      const parsed = num(String(value ?? '').replace(/,/g, '').trim());
      return parsed === null ? 0 : parsed;
    };
    const shifts = [number(at('turno 1')), number(at('turno 2')), number(at('turno 3'))];
    const reportedTotal = columns['total turnos'] === undefined ? null : num(String(at('total turnos') ?? '').replace(/,/g, '').trim());
    const total = reportedTotal === null ? shifts.reduce((sum, liters) => sum + liters, 0) : reportedTotal;
    if (total < 0 || shifts.some(liters => liters < 0)) continue;
    const meterValue = num(String(at('horometro') || '').replace(/,/g, '').trim());
    records.push({
      sourceRow: `${sheetInfo.name}:${row.getAttribute('r') || records.length + 1}`,
      date, equipment, category: String(at('categoria') || 'Sin categoría').trim(),
      department: String(at('departamento') || '').trim(), horometer: meterValue,
      shift1: shifts[0], shift2: shifts[1], shift3: shifts[2], liters: total,
      totalMismatch: reportedTotal !== null && Math.abs(reportedTotal - shifts.reduce((sum, liters) => sum + liters, 0)) > 0.01
    });
  }
  if (!header) throw new Error(`No se encontró el encabezado «Categoría / Equipo / Fecha» en «${sheetInfo.name}».`);
  return records;
}

async function importDieselSheet() {
  if (!dieselWorkbook) return toast('Primero selecciona un archivo Excel de Diesel.');
  const sheet = dieselWorkbookSheets[Number($('diesel-sheet').value)];
  if (!sheet) return toast('Selecciona una hoja válida del Excel.');
  const button = $('diesel-load-sheet');
  button.disabled = true;
  button.textContent = 'Cargando…';
  try {
    const records = await parseDieselSheet(sheet, dieselSharedStrings);
    if (!records.length) throw new Error(`La hoja «${sheet.name}» no contiene capturas con fecha y equipo.`);
    dieselLocalRecords = records;
    dieselImportedSource = sheet.name;
    const dates = records.map(row => row.date).sort();
    const equipmentCatalog = new Map((data.equipment || []).map(row => [row.code, row]));
    for (const record of dieselLocalRecords) {
      const catalog = equipmentCatalog.get(record.equipment);
      if (catalog?.description) record.description = catalog.description;
      if (catalog?.family && !record.category) record.category = catalog.family;
    }
    $('diesel-anchor-date').value = dates.at(-1);
    setDieselPeriodRange();
    populateDieselFilters();
    const differences = records.filter(row => row.totalMismatch).length;
    $('diesel-source-status').textContent = `${records.length.toLocaleString('es-MX')} capturas · ${formatDate(dates[0])} a ${formatDate(dates.at(-1))} · hoja «${sheet.name}» · nombres de operadores excluidos${differences ? ` · ${differences} diferencias entre Total Turnos y suma de turnos` : ''}.`;
    renderDiesel();
    toast(`Se cargaron ${records.length.toLocaleString('es-MX')} registros de Diesel.`);
  } catch (error) {
    $('diesel-source-status').textContent = error.message;
    toast(`No se pudo cargar Diesel: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = 'Cargar hoja';
  }
}

function setDieselPeriodRange() {
  const anchorValue = $('diesel-anchor-date').value || dieselLocalRecords.map(row => row.date).sort().at(-1) || '';
  const anchor = dateAtNoon(anchorValue);
  if (!anchor) return;
  let start = new Date(anchor);
  let end = new Date(anchor);
  if (dieselPeriod === 'semana') {
    start = weekStart(anchor);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else if (dieselPeriod === 'mes') {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  }
  $('diesel-date-start').value = isoDate(start);
  $('diesel-date-end').value = isoDate(end);
}

function populateDieselFilters() {
  const records = dieselList();
  const fill = (id, values, label) => {
    const select = $(id);
    const previous = select.value;
    select.innerHTML = `<option value="">${label}</option>` + values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
    if (values.includes(previous)) select.value = previous;
  };
  fill('diesel-category-filter', [...new Set(records.map(row => row.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), 'Todas');
  fill('diesel-equipment-filter', [...new Set(records.map(row => row.equipment).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), 'Todos');
}

// Normaliza un registro venga del paquete del programa o de una carga directa de Excel.
function dieselRecord(row) {
  const date = String(row.date || row.work_date || row.fecha || '').slice(0, 10);
  const shift1 = num(row.shift1 ?? row.diesel_t1 ?? row.turno_1 ?? row.turno1);
  const shift2 = num(row.shift2 ?? row.diesel_t2 ?? row.turno_2 ?? row.turno2);
  const shift3 = num(row.shift3 ?? row.diesel_t3 ?? row.turno_3 ?? row.turno3);
  const shiftTotal = [shift1, shift2, shift3].some(value => value !== null)
    ? [shift1, shift2, shift3].reduce((sum, value) => sum + (value || 0), 0) : null;
  const liters = num(row.liters ?? row.diesel_liters ?? row.consumption ?? row.litros ?? row.litros_diesel ?? row.total_turnos);
  const meter = num(row.horometer ?? row.horometer_final ?? row.meter ?? row.horometro);
  return {
    date,
    equipment: String(row.equipment || row.code || row.equipo || '').trim(),
    description: String(row.description || row.descripcion || '').trim(),
    category: String(row.category || row.categoria || row.family || row.familia || '').trim(),
    department: String(row.department || row.departamento || '').trim(),
    shift: String(row.shift || row.turno || '').trim(),
    shift1, shift2, shift3,
    liters: liters === null ? (shiftTotal ?? 0) : liters,
    horometer: meter,
    totalMismatch: Boolean(row.totalMismatch),
    sourceRow: String(row.sourceRow || row.id || '').trim()
  };
}

function dieselList() {
  const source = Array.isArray(data.diesel) && data.diesel.length ? data.diesel : dieselLocalRecords;
  return source
    .map(dieselRecord)
    .filter(row => (row.date || row.equipment) && row.liters >= 0)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.equipment.localeCompare(b.equipment, 'es'));
}

function dieselFiltered() {
  const category = $('diesel-category-filter').value;
  const equipment = $('diesel-equipment-filter').value;
  const selectedShift = $('diesel-shift-filter').value;
  const start = $('diesel-date-start').value;
  const end = $('diesel-date-end').value;
  const selected = dieselList().filter(row => {
    if (category && row.category !== category) return false;
    if (equipment && row.equipment !== equipment) return false;
    if (row.date && start && row.date < start) return false;
    if (row.date && end && row.date > end) return false;
    return true;
  });
  const shiftNames = ['Turno 1', 'Turno 2', 'Turno 3'];
  if (selectedShift) return selected.flatMap(row => {
    const index = Number(selectedShift) - 1;
    const amounts = [row.shift1, row.shift2, row.shift3];
    if (amounts.every(value => value === null || value === undefined)) return row.shift === shiftNames[index] ? [{ ...row, shift: shiftNames[index] }] : [];
    const amount = amounts[index] || 0;
    if (amount <= 0) return [];
    return [{ ...row, liters: amount, shift: shiftNames[index], shift1: index === 0 ? amount : 0, shift2: index === 1 ? amount : 0, shift3: index === 2 ? amount : 0 }];
  });
  if (dieselPeriod === 'turno') return selected.flatMap(row => {
    const amounts = [row.shift1, row.shift2, row.shift3];
    if (amounts.every(value => value === null || value === undefined)) return row.shift ? [row] : [];
    return amounts.map((amount, index) => ({ ...row, shift: shiftNames[index], liters: amount || 0, shift1: index === 0 ? amount || 0 : 0, shift2: index === 1 ? amount || 0 : 0, shift3: index === 2 ? amount || 0 : 0 })).filter(row => row.liters > 0);
  });
  return selected;
}

function dieselPeriodKey(row, mode) {
  if (mode === 'turno') return `${row.date || 'Sin fecha'}|${row.shift || 'Sin turno'}`;
  if (mode === 'semana') {
    const base = dateAtNoon(row.date);
    if (!base) return 'Sin fecha';
    const first = new Date(base);
    first.setDate(base.getDate() - ((base.getDay() + 6) % 7));
    return isoDate(first);
  }
  if (mode === 'mes') return row.date ? row.date.slice(0, 7) : 'Sin fecha';
  return row.date || 'Sin fecha';
}

function dieselPeriodLabel(key, mode) {
  if (!key || key === 'Sin fecha') return 'Sin fecha';
  if (mode === 'mes') {
    const [year, month] = key.split('-');
    return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(new Date(Number(year), Number(month) - 1, 1));
  }
  if (mode === 'semana') return `Semana del ${formatDayLong(key)}`;
  if (mode === 'turno') {
    const [date, shift] = key.split('|');
    return `${formatDate(date)} · ${shift}`;
  }
  return formatDayLong(key);
}

function dieselShortLabel(key, mode) {
  if (!key || key === 'Sin fecha') return 'S/F';
  if (mode === 'mes') {
    const [year, month] = key.split('-');
    return new Intl.DateTimeFormat('es-MX', { month: 'short' }).format(new Date(Number(year), Number(month) - 1, 1)).replace('.', '');
  }
  if (mode === 'turno') {
    const [date, shift] = key.split('|');
    const shortDate = date.slice(8, 10) + '/' + date.slice(5, 7);
    const shortShift = (String(shift).match(/\d+/) || [''])[0];
    return shortShift ? `${shortDate}·T${shortShift}` : shortDate;
  }
  return key.slice(8, 10) + '/' + key.slice(5, 7);
}

function dieselBuckets(rows, mode) {
  const groups = new Map();
  for (const row of rows) {
    const key = dieselPeriodKey(row, mode);
    if (!groups.has(key)) groups.set(key, { key, liters: 0, shift1: 0, shift2: 0, shift3: 0, records: new Set(), equipment: new Set(), shifts: new Set() });
    const bucket = groups.get(key);
    bucket.liters += row.liters;
    bucket.shift1 += row.shift1 || 0;
    bucket.shift2 += row.shift2 || 0;
    bucket.shift3 += row.shift3 || 0;
    bucket.records.add(row.sourceRow || `${row.date}|${row.equipment}|${row.horometer ?? ''}|${row.liters}`);
    if (row.equipment) bucket.equipment.add(row.equipment);
    if (row.shift) bucket.shifts.add(row.shift);
  }
  return [...groups.values()].map(bucket => ({
    key: bucket.key,
    label: dieselPeriodLabel(bucket.key, mode),
    liters: bucket.liters,
    shift1: bucket.shift1,
    shift2: bucket.shift2,
    shift3: bucket.shift3,
    records: bucket.records.size,
    equipmentCount: bucket.equipment.size,
  })).sort((a, b) => String(b.key).localeCompare(String(a.key)));
}

function dieselByEquipment(rows) {
  const groups = new Map();
  for (const row of rows) {
    const code = row.equipment || 'Sin equipo';
    if (!groups.has(code)) groups.set(code, { equipment: code, description: row.description, category: row.category, department: row.department, horometer: null, latestDate: '', shift1: 0, shift2: 0, shift3: 0, liters: 0, records: new Set() });
    const bucket = groups.get(code);
    bucket.liters += row.liters;
    bucket.shift1 += row.shift1 || 0;
    bucket.shift2 += row.shift2 || 0;
    bucket.shift3 += row.shift3 || 0;
    bucket.records.add(row.sourceRow || `${row.date}|${row.equipment}|${row.horometer ?? ''}|${row.liters}`);
    if (!bucket.description && row.description) bucket.description = row.description;
    if (!bucket.category && row.category) bucket.category = row.category;
    if (!bucket.department && row.department) bucket.department = row.department;
    if (row.horometer !== null && row.horometer !== undefined && (!bucket.latestDate || row.date >= bucket.latestDate)) {
      bucket.latestDate = row.date;
      bucket.horometer = row.horometer;
    }
  }
  return [...groups.values()].map(bucket => ({ ...bucket, records: bucket.records.size }))
    .sort((a, b) => b.liters - a.liters);
}

function dieselTotals(rows) {
  const liters = rows.reduce((sum, row) => sum + row.liters, 0);
  const captureCount = new Set(rows.map(row => row.sourceRow || `${row.date}|${row.equipment}|${row.horometer ?? ''}|${row.liters}`)).size;
  return {
    liters,
    equipment: new Set(rows.map(row => row.equipment).filter(Boolean)).size,
    records: captureCount,
    average: captureCount ? liters / captureCount : null,
    mismatches: new Set(rows.filter(row => row.totalMismatch).map(row => row.sourceRow || `${row.date}|${row.equipment}|${row.horometer ?? ''}`)).size,
    horometer: [...rows].filter(row => row.horometer !== null && row.horometer !== undefined).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]?.horometer ?? null
  };
}

function dieselByCategory(rows) {
  const groups = new Map();
  for (const row of rows) {
    const category = row.category || 'Sin categoría';
    if (!groups.has(category)) groups.set(category, { category, liters: 0, equipment: new Set(), records: new Set() });
    const group = groups.get(category);
    group.liters += row.liters;
    if (row.equipment) group.equipment.add(row.equipment);
    group.records.add(row.sourceRow || `${row.date}|${row.equipment}|${row.horometer ?? ''}|${row.liters}`);
  }
  return [...groups.values()].map(group => ({ category: group.category, liters: group.liters, equipmentCount: group.equipment.size, records: group.records.size })).sort((a, b) => b.liters - a.liters);
}

// Compatibilidad con la exportación CSV genérica (botón global).
function dieselRows() {
  return dieselList();
}

function dieselPdfFit(pdf, text, maxWidth) {
  let value = String(text ?? '');
  if (pdf.getTextWidth(value) <= maxWidth) return value;
  while (value.length > 1 && pdf.getTextWidth(value + '…') > maxWidth) value = value.slice(0, -1);
  return value + '…';
}

function dieselPdfHeader(pdf) {
  pdf.setFillColor('#092744');
  pdf.rect(0, 0, 210, 20, 'F');
  pdf.setFillColor('#1476df');
  pdf.rect(0, 20, 210, 1.2, 'F');
  if (dieselPdfLogo) {
    pdf.setFillColor('#ffffff');
    pdf.roundedRect(8, 2.5, 14, 15, 1, 1, 'F');
    pdf.addImage(dieselPdfLogo, 'PNG', 9, 3, 12, 14, undefined, 'FAST');
  }
  pdf.setTextColor('#ffffff');
  pdf.setFont('Helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('SIERRA MADRE · MANTENIMIENTO', 25, 9);
  pdf.setFont('Helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor('#9fc4ea');
  pdf.text('Reporte ejecutivo de consumo de Diesel', 25, 15);
  pdf.text(`Generado ${new Date().toLocaleString('es-MX')}`, 200, 9, { align: 'right' });
  pdf.text(REPORT_UNIT, 200, 15, { align: 'right' });
}

function dieselPdfFooter(pdf) {
  const total = pdf.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    pdf.setPage(page);
    pdf.setDrawColor('#e2ebf5');
    pdf.setLineWidth(0.3);
    pdf.line(10, 285, 200, 285);
    pdf.setFont('Helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor('#6d829b');
    pdf.text('SIERRA MADRE · MANTENIMIENTO · REPORTE DE DIESEL', 10, 289);
    pdf.text(`Página ${page} de ${total}`, 200, 289, { align: 'right' });
  }
}

function dieselPdfTable(pdf, startY, left, columns, rows) {
  const rowHeight = 6.4;
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
  let y = startY;
  const drawHeader = () => {
    pdf.setFillColor('#0f1e36');
    pdf.rect(left, y, totalWidth, rowHeight, 'F');
    pdf.setTextColor('#ffffff');
    pdf.setFont('Helvetica', 'bold');
    pdf.setFontSize(7);
    let x = left;
    columns.forEach(column => {
      const textX = column.align === 'right' ? x + column.width - 1.5 : column.align === 'center' ? x + column.width / 2 : x + 1.5;
      pdf.text(dieselPdfFit(pdf, column.title, column.width - 3), textX, y + 4.2, { align: column.align || 'left' });
      x += column.width;
    });
    y += rowHeight;
  };
  drawHeader();
  rows.forEach((row, rowIndex) => {
    if (y + rowHeight > 276) {
      pdf.addPage();
      dieselPdfHeader(pdf);
      y = 28;
      drawHeader();
    }
    if (rowIndex % 2 === 0) {
      pdf.setFillColor('#f5f9ff');
      pdf.rect(left, y, totalWidth, rowHeight, 'F');
    }
    pdf.setFont('Helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor('#17395d');
    let x = left;
    columns.forEach((column, columnIndex) => {
      const value = dieselPdfFit(pdf, row[columnIndex] ?? '', column.width - 3);
      const textX = column.align === 'right' ? x + column.width - 1.5 : column.align === 'center' ? x + column.width / 2 : x + 1.5;
      pdf.text(value, textX, y + 4.2, { align: column.align || 'left' });
      x += column.width;
    });
    y += rowHeight;
  });
  return y;
}

async function generateDieselPDF() {
  const JsPDF = typeof jsPDF !== 'undefined' ? jsPDF : (window.jspdf && window.jspdf.jsPDF);
  if (!JsPDF) {
    toast('No se pudo cargar el generador de PDF. Recarga la página e inténtalo de nuevo.');
    return;
  }
  const rows = dieselFiltered();
  if (!rows.length) {
    toast('No hay registros de Diesel para generar el reporte con estos filtros.');
    return;
  }
  const mode = dieselPeriod;
  const buckets = dieselBuckets(rows, mode);
  const totals = dieselTotals(rows);
  const byEquipment = dieselByEquipment(rows);
  const byCategory = dieselByCategory(rows);
  const start = $('diesel-date-start').value || '';
  const end = $('diesel-date-end').value || '';

  const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  dieselPdf = pdf;
  try {
    const response = await fetch('./assets/logo.png', { cache: 'force-cache' });
    if (response.ok) {
      const blob = await response.blob();
      dieselPdfLogo = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  } catch { dieselPdfLogo = null; }
  dieselPdfHeader(pdf);

  // Encabezado del reporte
  pdf.setFont('Helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor('#0f3c70');
  pdf.text('Consumo de Diesel', 10, 32);
  pdf.setFont('Helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor('#556d87');
  pdf.text(`Agrupación: ${DIESEL_PERIODS[mode]}`, 10, 38);
  pdf.text(`Periodo: ${formatRange(start, end)}`, 10, 43);
  pdf.text(`Hoja: ${dieselImportedSource || 'Datos publicados'} · Capturas: ${totals.records} · Equipos: ${totals.equipment}`, 10, 48);

  // Tarjetas KPI
  const cards = [
    { label: 'Litros consumidos', value: `${fmt(totals.liters)} L`, color: '#f59b18' },
    { label: 'Capturas', value: `${totals.records}`, color: '#1476df' },
    { label: 'Equipos', value: `${totals.equipment}`, color: '#8052e8' },
    { label: 'Promedio / captura', value: `${fmt(totals.average)} L`, color: '#12a66a' },
    { label: 'Categorías', value: `${byCategory.length}`, color: '#0ba6a7' }
  ];
  const cardW = 36, cardGap = 3.5, cardY = 54, cardH = 20;
  cards.forEach((card, index) => {
    const x = 10 + index * (cardW + cardGap);
    pdf.setFillColor('#f5f9ff');
    pdf.setDrawColor('#dce7f3');
    pdf.setLineWidth(0.4);
    pdf.roundedRect(x, cardY, cardW, cardH, 2, 2, 'DF');
    pdf.setFillColor(card.color);
    pdf.roundedRect(x, cardY, cardW, 2.2, 1, 1, 'F');
    pdf.setFont('Helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(card.color);
    pdf.text(String(card.value), x + cardW / 2, cardY + 11.5, { align: 'center' });
    pdf.setFont('Helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor('#556d87');
    pdf.text(card.label, x + cardW / 2, cardY + 16.6, { align: 'center' });
  });

  // Gráficas de consumo por periodo y categoría
  pdf.setFont('Helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor('#0f3c70');
  pdf.text(`Consumo por ${DIESEL_PERIODS[mode].toLowerCase()} (litros)`, 10, 80);
  pdf.text('Consumo por categoría', 132, 80);
  pdf.setDrawColor('#e2ebf5');
  pdf.setLineWidth(0.3);
  pdf.line(10, cardY + cardH + 10, 200, cardY + cardH + 10);
  pdf.line(10, cardY + cardH + 40, 200, cardY + cardH + 40);
  const drawBars = (items, left, width) => {
    const chartData = items.slice(0, 10).reverse();
    if (!chartData.length) return;
    const chartBottom = 124, chartTopY = 91;
    const maxLiters = Math.max(...chartData.map(item => item.liters), 1);
    const slot = width / chartData.length;
    const barWidth = Math.min(slot * 0.55, 11);
    chartData.forEach((item, index) => {
      const barHeight = Math.max((item.liters / maxLiters) * (chartBottom - chartTopY - 6), 0.8);
      const x = left + index * slot + (slot - barWidth) / 2;
      const y = chartBottom - barHeight;
      pdf.setFillColor(index % 2 ? '#17a76a' : '#1476df');
      pdf.roundedRect(x, y, barWidth, barHeight, 1, 1, 'F');
      pdf.setFont('Helvetica', 'bold');
      pdf.setFontSize(5.2);
      pdf.setTextColor('#0f3c70');
      pdf.text(fmt(item.liters), x + barWidth / 2, y - 1.2, { align: 'center' });
      pdf.setFont('Helvetica', 'normal');
      pdf.setFontSize(5.2);
      pdf.setTextColor('#6d829b');
      pdf.text(dieselPdfFit(pdf, item.label, slot - 1), x + barWidth / 2, chartBottom + 3.4, { align: 'center' });
    });
  };
  drawBars(buckets.slice(0, 10).map(bucket => ({ label: dieselShortLabel(bucket.key, mode), liters: bucket.liters })), 10, 116);
  drawBars(byCategory.map(item => ({ label: item.category, liters: item.liters })), 132, 68);

  // Tabla resumen por periodo
  if (totals.mismatches) {
    pdf.setFont('Helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor('#9a5a00');
    pdf.text(`Nota: ${totals.mismatches} captura(s) no coinciden entre Total Turnos y la suma de los tres turnos. El total conserva el dato del Excel.`, 10, 132);
  }
  let cursorY = 140;
  pdf.setFont('Helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor('#0f3c70');
  pdf.text(`Resumen por ${DIESEL_PERIODS[mode].toLowerCase()}`, 10, cursorY - 3);
  cursorY = dieselPdfTable(pdf, cursorY, 10, [
    { title: 'Periodo', width: 55 },
    { title: 'Equipos', width: 17, align: 'center' },
    { title: 'Capturas', width: 19, align: 'center' },
    { title: 'Turno 1 L', width: 22, align: 'right' },
    { title: 'Turno 2 L', width: 22, align: 'right' },
    { title: 'Turno 3 L', width: 22, align: 'right' },
    { title: 'Total L', width: 30, align: 'right' }
  ], buckets.map(bucket => [
    bucket.label,
    String(bucket.equipmentCount),
    String(bucket.records),
    fmt(bucket.shift1),
    fmt(bucket.shift2),
    fmt(bucket.shift3),
    fmt(bucket.liters)
  ]));

  cursorY += 9;
  if (cursorY > 250) { pdf.addPage(); dieselPdfHeader(pdf); cursorY = 30; }
  pdf.setFont('Helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor('#0f3c70');
  pdf.text('Consumo por categoría', 10, cursorY - 3);
  cursorY = dieselPdfTable(pdf, cursorY, 10, [
    { title: 'Categoría', width: 80 },
    { title: 'Equipos', width: 30, align: 'center' },
    { title: 'Capturas', width: 35, align: 'center' },
    { title: 'Litros', width: 45, align: 'right' }
  ], byCategory.map(item => [item.category, String(item.equipmentCount), String(item.records), fmt(item.liters)]));

  // Tabla por equipo
  cursorY += 9;
  if (cursorY > 250) {
    pdf.addPage();
    dieselPdfHeader(pdf);
    cursorY = 30;
  }
  pdf.setFont('Helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor('#0f3c70');
  pdf.text('Consumo por equipo', 10, cursorY - 3);
  dieselPdfTable(pdf, cursorY, 10, [
    { title: 'Equipo', width: 25 },
    { title: 'Categoría', width: 25 },
    { title: 'Departamento', width: 25 },
    { title: 'Horómetro', width: 22, align: 'right' },
    { title: 'T1 L', width: 18, align: 'right' },
    { title: 'T2 L', width: 18, align: 'right' },
    { title: 'T3 L', width: 18, align: 'right' },
    { title: 'Total L', width: 24, align: 'right' },
    { title: 'Capturas', width: 15, align: 'center' }
  ], byEquipment.map(item => [
    item.equipment,
    item.category || '—',
    item.department || '—',
    fmt(item.horometer),
    fmt(item.shift1),
    fmt(item.shift2),
    fmt(item.shift3),
    fmt(item.liters),
    String(item.records)
  ]));

  dieselPdfFooter(pdf);
  const filename = `SierraMadre_Diesel_${mode}_${start || 'periodo'}.pdf`;
  pdf.save(filename);
  toast(`PDF generado: ${filename}`);
}

function renderDiesel() {
  populateDieselFilters();
  const rows = dieselFiltered();
  const mode = dieselPeriod;
  const buckets = dieselBuckets(rows, mode);
  const totals = dieselTotals(rows);
  const categories = dieselByCategory(rows);
  const byEquipment = dieselByEquipment(rows);

  const countEl = $('diesel-count');
  if (countEl) countEl.textContent = `${totals.records.toLocaleString('es-MX')} capturas`;

  const kpis = $('diesel-kpis');
  if (kpis) {
    kpis.innerHTML = [
      metric('Litros consumidos', `${fmt(totals.liters)} L`, 'Consumo total del periodo', '#f59b18', '⛽'),
      metric('Capturas', totals.records.toLocaleString('es-MX'), 'Renglones de abastecimiento', '#1476df', '▤'),
      metric('Equipos con consumo', `${totals.equipment}`, 'Unidades distintas en el periodo', '#8052e8', '◉'),
      metric('Promedio por captura', totals.average === null ? '—' : `${fmt(totals.average)} L`, 'Litros / renglón de abastecimiento', '#12a66a', '◑'),
      metric('Categorías', `${categories.length}`, 'Tipos registrados en el Excel', '#0ba6a7', '▣')
    ].join('');
  }

  renderDieselBarChart($('diesel-chart'), buckets.slice(0, 12).reverse().map(bucket => ({ label: dieselShortLabel(bucket.key, mode), value: bucket.liters, title: bucket.label })));
  renderDieselBarChart($('diesel-category-chart'), categories.slice(0, 10).reverse().map(bucket => ({ label: bucket.category, value: bucket.liters, title: `${bucket.category}: ${fmt(bucket.liters)} L` })));

  const tbody = $('diesel-table');
  if (tbody) {
    tbody.innerHTML = buckets.length
      ? buckets.map(bucket => `<tr><td><b>${esc(bucket.label)}</b></td><td>${bucket.equipmentCount}</td><td>${bucket.records}</td><td>${fmt(bucket.shift1)}</td><td>${fmt(bucket.shift2)}</td><td>${fmt(bucket.shift3)}</td><td><b>${fmt(bucket.liters)}</b></td></tr>`).join('')
      : '<tr><td class="empty" colspan="7">Sin registros para estos filtros.</td></tr>';
  }
  const equipmentTable = $('diesel-equipment-table');
  if (equipmentTable) equipmentTable.innerHTML = byEquipment.length
    ? byEquipment.map(item => `<tr><td><b>${esc(item.equipment)}</b><br>${esc(item.description || '')}</td><td>${esc(item.category || '—')}</td><td>${esc(item.department || '—')}</td><td>${fmt(item.horometer)}</td><td>${fmt(item.shift1)}</td><td>${fmt(item.shift2)}</td><td>${fmt(item.shift3)}</td><td><b>${fmt(item.liters)}</b></td><td>${item.records}</td></tr>`).join('')
    : '<tr><td class="empty" colspan="9">Carga una hoja del Excel de Diesel para consultar los equipos.</td></tr>';

  const scope = $('diesel-scope');
  if (scope) {
    const start = $('diesel-date-start').value || '';
    const end = $('diesel-date-end').value || '';
    scope.textContent = `${dieselImportedSource ? `Hoja «${dieselImportedSource}» · ` : ''}Agrupado por ${DIESEL_PERIODS[mode].toLowerCase()} · ${formatRange(start, end)} · ${totals.records} capturas en ${buckets.length} periodo(s)${totals.mismatches ? ` · ${totals.mismatches} diferencias Total Turnos / suma de turnos` : ''}.`;
  }

  const range = $('diesel-pdf-range');
  if (range) range.textContent = `${DIESEL_PERIODS[mode]} · ${formatRange($('diesel-date-start').value, $('diesel-date-end').value)} · ${fmt(totals.liters)} L`;

  if (Array.isArray(data.diesel) && data.diesel.length) {
    $('diesel-source-status').textContent = `${data.diesel.length.toLocaleString('es-MX')} registros recibidos desde la publicación del programa. El archivo no se carga en este navegador.`;
  } else if (!dieselLocalRecords.length) {
    $('diesel-source-status').textContent = 'El paquete web todavía no incluye Diesel del programa. Selecciona el Excel que importas en Mantenimiento.exe para consultarlo aquí.';
  }

  document.querySelectorAll('#period-toggle-diesel [data-period]').forEach(button => button.classList.toggle('active', button.dataset.period === mode));
}

function renderDieselBarChart(host, items) {
  if (!host) return;
  if (!items.length) {
    host.innerHTML = '<p class="diesel-empty">Sin registros para los filtros seleccionados.</p>';
    return;
  }
  const max = Math.max(...items.map(item => item.value), 1);
  host.innerHTML = `<div class="diesel-bars">${items.map(item => `
    <div class="diesel-bar" title="${esc(item.title)}">
      <b>${fmt(item.value)}</b>
      <span class="diesel-bar-track"><i style="height:${Math.max(4, item.value / max * 100)}%"></i></span>
      <small>${esc(item.label)}</small>
    </div>`).join('')}</div>`;
}

function generateDieselCSV() {
  const rows = dieselFiltered();
  if (!rows.length) return toast('No hay registros de Diesel para exportar con estos filtros.');
  const titles = ['Fecha', 'Equipo', 'Descripción', 'Categoría', 'Departamento', 'Horómetro', 'Turno', 'Turno 1 (L)', 'Turno 2 (L)', 'Turno 3 (L)', 'Total (L)'];
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const lines = [titles, ...rows.map(row => [
    row.date,
    row.equipment,
    row.description,
    row.category,
    row.department,
    row.horometer,
    row.shift,
    (row.shift1 || 0).toFixed(2),
    (row.shift2 || 0).toFixed(2),
    (row.shift3 || 0).toFixed(2),
    row.liters.toFixed(2)
  ])];
  const csv = '\ufeff' + lines.map(line => line.map(quote).join(',')).join('\r\n');
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `SierraMadre_Diesel_${dieselPeriod}_${$('diesel-date-start').value || 'periodo'}.csv`);
  toast('CSV de Diesel exportado.');
}

document.querySelectorAll('#period-toggle-diesel [data-period]').forEach(button => button.addEventListener('click', () => {
  dieselPeriod = button.dataset.period;
  setDieselPeriodRange();
  renderDiesel();
}));
$('export-diesel-pdf').addEventListener('click', generateDieselPDF);
$('export-diesel-csv').addEventListener('click', generateDieselCSV);
$('diesel-open-file').addEventListener('click', () => { $('diesel-file-input').value = ''; $('diesel-file-input').click(); });
$('diesel-file-input').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  $('diesel-source-status').textContent = `Leyendo «${file.name}» en este navegador…`;
  $('diesel-open-file').disabled = true;
  try {
    const result = await readDieselWorkbook(file);
    $('diesel-sheet').innerHTML = result.sheets.map((sheet, index) => `<option value="${index}">${esc(sheet.name)}</option>`).join('');
    $('diesel-sheet').disabled = false;
    $('diesel-sheet').value = String(result.sheets.length - 1);
    $('diesel-load-sheet').disabled = false;
    $('diesel-source-status').textContent = `Libro reconocido · ${result.sheets.length} hojas. Se seleccionó la última hoja; revisa el nombre y cárgala para analizarla sin sumar otras hojas.`;
    await importDieselSheet();
  } catch (error) {
    $('diesel-source-status').textContent = error.message;
    toast(`No se pudo leer el Excel: ${error.message}`);
  } finally {
    $('diesel-open-file').disabled = false;
  }
});
$('diesel-load-sheet').addEventListener('click', importDieselSheet);
['diesel-date-start', 'diesel-date-end', 'diesel-category-filter', 'diesel-equipment-filter', 'diesel-shift-filter'].forEach(id => $(id).addEventListener('change', renderDiesel));
$('diesel-anchor-date').addEventListener('change', () => { setDieselPeriodRange(); renderDiesel(); });
$('diesel-clear-filters').addEventListener('click', () => {
  $('diesel-category-filter').value = '';
  $('diesel-equipment-filter').value = '';
  $('diesel-shift-filter').value = '';
  const latest = dieselLocalRecords.map(row => row.date).sort().at(-1) || '';
  $('diesel-anchor-date').value = latest;
  setDieselPeriodRange();
  renderDiesel();
});

render();
refreshData();
