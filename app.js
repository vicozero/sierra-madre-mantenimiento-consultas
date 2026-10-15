const API_URL = 'https://sierra-madre-consulta-api.feywren128.chatgpt.site/api/portal';
const EMPTY = { meta: { updatedAt: '—' }, equipment: [], kpi: [], bitacora: [], calendar: [] };
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
  calendario: { label: 'Calendario de servicio', title: 'Calendario de servicio', subtitle: 'Servicios programados, proyectados y completados dentro del periodo.' },
  equipos: { label: 'Equipos', title: 'Equipos', subtitle: 'Catálogo consultivo del programa.' },
  reportes: { label: 'Reportes', title: 'Reportes de mantenimiento', subtitle: 'Genera archivos con el periodo, familia y turno seleccionados.' }
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
  if (!payload || payload.schema !== 'sierra-madre-consultas/v1') {
    throw new Error('El JSON no es un paquete exportado por Mantenimiento.');
  }
  for (const section of ['equipment', 'kpi', 'bitacora', 'calendar']) {
    if (!Array.isArray(payload[section])) throw new Error(`Sección faltante: ${section}`);
  }
  return payload;
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
  return rows('calendar').filter(row => {
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
  return `<div class="service-event ${kind}" title="${esc(`${label} · ${detail}${more ? ` · ${more}` : ''}`)}"><span class="service-event-title">${esc(label)}</span><span class="service-event-equipment">${esc(detail)}</span></div>`;
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

function pad2(value) {
  return String(value).padStart(2, '0');
}

function isoDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function reportAnchor() {
  const reference = data.meta?.periodEnd || $('date-end').value || data.meta?.updatedAt;
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

function familyIndicators(kpiRows) {
  const groups = new Map();
  for (const row of kpiRows) {
    const family = familyLabel(row.family);
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family).push(row);
  }
  return [...groups].map(([family, items]) => ({
    family,
    rows: items,
    equipment: distinctCount(items, 'equipment'),
    cuts: items.length,
    availability: average(items, 'availability'),
    utilization: average(items, 'utilization'),
    worked: sumField(items, 'worked_hours'),
    mp: sumField(items, 'mp_hours'),
    mc: sumField(items, 'mc_hours'),
    stops: sumField(items, 'stops'),
    tmef: average(items.filter(row => (num(row.tmef) || 0) > 0), 'tmef'),
    tmpr: average(items.filter(row => (num(row.tmpr) || 0) > 0), 'tmpr')
  })).sort((a, b) => b.worked - a.worked);
}

function globalIndicators(kpiRows, bitacoraRows, calendarRows) {
  const completed = calendarRows.filter(row => /complet|ejecut|realiz/i.test(String(row.status || ''))).length;
  const scheduled = calendarRows.filter(row => !/cancel/i.test(String(row.status || ''))).length;
  return {
    availability: average(kpiRows, 'availability'),
    utilization: average(kpiRows, 'utilization'),
    tmef: average(kpiRows.filter(row => (num(row.tmef) || 0) > 0), 'tmef'),
    tmpr: average(kpiRows.filter(row => (num(row.tmpr) || 0) > 0), 'tmpr'),
    worked: sumField(kpiRows, 'worked_hours'),
    mp: sumField(kpiRows, 'mp_hours'),
    mc: sumField(kpiRows, 'mc_hours'),
    stops: sumField(kpiRows, 'stops'),
    kpiEquipment: distinctCount(kpiRows, 'equipment'),
    cuts: kpiRows.length,
    logs: bitacoraRows.length,
    services: scheduled,
    completed,
    completion: scheduled ? completed / scheduled * 100 : null
  };
}

const pctText = value => value === null || value === undefined ? '—' : `${fmt(value)}%`;
const hrsText = value => value === null || value === undefined ? '—' : `${fmt(value)} h`;

function pptxHeader(text) {
  return { text: String(text), options: { bold: true, color: 'FFFFFF', fill: '092744', align: 'center', valign: 'middle' } };
}

function pptxTableOptions(options) {
  const { x, y, w, colW, autoPage = false, autoPageRepeatHeader = false, rowH = 0.3 } = options;
  return {
    x, y, w, colW, rowH, autoPage, autoPageRepeatHeader,
    border: { type: 'solid', color: 'dce7f3', pt: 0.5 },
    fontSize: 9, color: '17395d', valign: 'middle'
  };
}

function addPptxCards(pptx, slide, cards, options) {
  const { x, y, w, cols, cardH = 1.15 } = options;
  const gap = 0.2;
  const cardW = (w - gap * (cols - 1)) / cols;
  cards.forEach((card, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const cx = x + col * (cardW + gap);
    const cy = y + row * (cardH + gap);
    slide.addShape(pptx.ShapeType.roundRect, { x: cx, y: cy, w: cardW, h: cardH, fill: { color: 'f5f9ff' }, line: { color: 'dce7f3', width: 0.75 }, rectRadius: 0.08 });
    slide.addText(String(card.value), { x: cx + 0.08, y: cy + 0.14, w: cardW - 0.16, h: cardH * 0.52, fontSize: cardH > 1 ? 19 : 16, bold: true, color: card.color || '0f3c70', align: 'center', valign: 'middle' });
    slide.addText(String(card.label), { x: cx + 0.06, y: cy + cardH - 0.44, w: cardW - 0.12, h: 0.34, fontSize: 8.5, color: '6d829b', align: 'center', valign: 'middle' });
  });
}

async function generatePptx() {
  if (typeof PptxGenJS === 'undefined') {
    toast('No se pudo cargar el generador de PowerPoint. Recarga la página e inténtalo de nuevo.');
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
    const kindLabel = PERIOD_LABELS[kind] || null;
    const rangeText = formatRange(start, end);
    const titleSuffix = kindLabel ? `${kindLabel} ` : '';

    const kpiRows = rows('kpi');
    const bitacoraRows = rows('bitacora');
    const calendarRows = rows('calendar');
    const equipmentRows = rows('equipment');
    const families = familyIndicators(kpiRows);
    const global = globalIndicators(kpiRows, bitacoraRows, calendarRows);

    const NAVY = '092744', BLUE = '1476df', CYAN = '16b5e5', INK = '17395d', MUTED = '6d829b';
    const W = 13.333, H = 7.5;

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = REPORT_BRAND;
    pptx.company = REPORT_BRAND;
    pptx.subject = `Reporte ${titleSuffix}de mantenimiento`;
    pptx.title = `${REPORT_UNIT} · Reporte ${titleSuffix}${rangeText}`;

    const addFooter = slide => {
      slide.addText(`${REPORT_BRAND} · ${REPORT_UNIT}`, { x: 0.55, y: H - 0.44, w: 7, h: 0.3, fontSize: 8, color: MUTED });
      slide.addText(`Reporte ${titleSuffix}${rangeText}`, { x: W - 7.55, y: H - 0.44, w: 7, h: 0.3, fontSize: 8, color: MUTED, align: 'right' });
    };

    let slide = pptx.addSlide();
    slide.background = { color: NAVY };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.22, fill: { color: CYAN } });
    slide.addText(REPORT_BRAND, { x: 1.0, y: 1.75, w: 11.3, h: 0.5, fontSize: 20, bold: true, color: 'FFFFFF', charSpacing: 5 });
    slide.addText('MANTENIMIENTO', { x: 1.0, y: 2.3, w: 11.3, h: 0.4, fontSize: 13, color: CYAN, charSpacing: 7 });
    slide.addText('Resultados Unidad', { x: 1.0, y: 3.05, w: 11.3, h: 0.7, fontSize: 26, color: 'BFD8F2' });
    slide.addText(REPORT_UNIT, { x: 1.0, y: 3.7, w: 11.3, h: 0.95, fontSize: 40, bold: true, color: 'FFFFFF' });
    slide.addText(`Reporte ${titleSuffix}${rangeText}`, { x: 1.0, y: 4.85, w: 11.3, h: 0.5, fontSize: 16, color: 'FFFFFF' });
    slide.addText(`Generado el ${new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })}`, { x: 1.0, y: 6.65, w: 11.3, h: 0.4, fontSize: 10, color: '8FB6DC' });

    slide = pptx.addSlide();
    slide.background = { color: NAVY };
    slide.addText('MANTENIMIENTO', { x: 0, y: 3.0, w: W, h: 1.0, fontSize: 44, bold: true, color: 'FFFFFF', align: 'center', charSpacing: 6 });
    slide.addText(`${REPORT_BRAND} · ${REPORT_UNIT}`, { x: 0, y: 4.05, w: W, h: 0.5, fontSize: 14, color: '8FB6DC', align: 'center', charSpacing: 2 });

    slide = pptx.addSlide();
    slide.addText('Indicadores de mantenimiento', { x: 0.6, y: 0.45, w: 12.1, h: 0.6, fontSize: 24, bold: true, color: NAVY });
    slide.addText(`Resumen general · ${rangeText}`, { x: 0.6, y: 1.05, w: 12.1, h: 0.4, fontSize: 12, color: MUTED });
    addPptxCards(pptx, slide, [
      { label: 'Disponibilidad', value: pctText(global.availability), color: '12a66a' },
      { label: 'Utilización', value: pctText(global.utilization), color: BLUE },
      { label: 'TMEF promedio', value: hrsText(global.tmef), color: 'e0673c' },
      { label: 'TMPR promedio', value: hrsText(global.tmpr), color: '0ba6a7' },
      { label: 'Horas operadas', value: fmt(global.worked), color: INK },
      { label: 'Horas MP / MC', value: `${fmt(global.mp)} / ${fmt(global.mc)}`, color: '8052e8' },
      { label: 'Paros registrados', value: fmt(global.stops, 0), color: 'b43b45' },
      { label: 'Equipos con KPI', value: String(global.kpiEquipment), color: INK },
      { label: 'Cortes KPI', value: String(global.cuts), color: INK },
      { label: 'Capturas de bitácora', value: String(global.logs), color: 'f59b18' },
      { label: 'Servicios preventivos', value: String(global.services), color: '0ba6a7' },
      { label: 'Cumplimiento preventivo', value: pctText(global.completion), color: '12a66a' }
    ], { x: 0.6, y: 1.7, w: 12.1, cols: 4 });
    addFooter(slide);

    for (const family of families) {
      slide = pptx.addSlide();
      slide.addText(`Indicadores · ${family.family}`, { x: 0.55, y: 0.4, w: 12.2, h: 0.55, fontSize: 20, bold: true, color: NAVY });
      slide.addText(`${family.equipment} equipo(s) · ${family.cuts} corte(s) KPI · ${rangeText}`, { x: 0.55, y: 0.95, w: 12.2, h: 0.35, fontSize: 11, color: MUTED });
      addPptxCards(pptx, slide, [
        { label: 'Disponibilidad', value: pctText(family.availability), color: '12a66a' },
        { label: 'Utilización', value: pctText(family.utilization), color: BLUE },
        { label: 'Horas operadas', value: fmt(family.worked), color: INK },
        { label: 'MP / MC (h)', value: `${fmt(family.mp)} / ${fmt(family.mc)}`, color: '8052e8' },
        { label: 'Paros', value: fmt(family.stops, 0), color: 'b43b45' },
        { label: 'TMEF / TMPR (h)', value: `${fmt(family.tmef)} / ${fmt(family.tmpr)}`, color: '0ba6a7' }
      ], { x: 0.55, y: 1.45, w: 12.2, cols: 3, cardH: 0.95 });
      const items = aggregateByEquipment(family.rows);
      const table = [['Equipo', 'Descripción', 'Dispon.', 'Utiliz.', 'Horas', 'MP', 'MC', 'Paros', 'Estado'].map(pptxHeader)];
      for (const item of items) {
        table.push([
          { text: item.equipment, options: { bold: true, color: INK } },
          { text: item.description || '—', options: { color: INK } },
          { text: pctText(item.availability), options: { align: 'center' } },
          { text: pctText(item.utilization), options: { align: 'center' } },
          { text: fmt(item.worked_hours), options: { align: 'center' } },
          { text: fmt(item.mp_hours), options: { align: 'center' } },
          { text: fmt(item.mc_hours), options: { align: 'center' } },
          { text: fmt(item.stops, 0), options: { align: 'center' } },
          { text: String(item.status || '—'), options: { align: 'center' } }
        ]);
      }
      slide.addTable(table, pptxTableOptions({ x: 0.55, y: 3.45, w: 12.2, colW: [1.4, 3.6, 1.15, 1.15, 1.05, 0.95, 0.95, 0.95, 1.0], autoPage: items.length > 8, autoPageRepeatHeader: items.length > 8 }));
      addFooter(slide);
    }

    const conditionRows = [['Equipo', 'No. económico', 'Condición', 'Observaciones'].map(pptxHeader)];
    const byFamily = new Map();
    for (const row of equipmentRows) {
      const family = familyLabel(row.family);
      if (!byFamily.has(family)) byFamily.set(family, []);
      byFamily.get(family).push(row);
    }
    const familyNames = [...byFamily.keys()].sort((a, b) => String(a).localeCompare(String(b), 'es'));
    for (const family of familyNames) {
      conditionRows.push([{ text: family, options: { colspan: 4, bold: true, color: '0f3c70', fill: 'eaf1f9', align: 'left' } }]);
      for (const row of byFamily.get(family).sort((a, b) => String(a.code).localeCompare(String(b.code), 'es'))) {
        conditionRows.push([
          { text: row.description || row.code, options: { color: INK } },
          { text: row.code || '—', options: { align: 'center', bold: true } },
          { text: String(row.status || '—'), options: { align: 'center' } },
          { text: '', options: {} }
        ]);
      }
    }
    slide = pptx.addSlide();
    slide.addText('Condición de equipos', { x: 0.55, y: 0.4, w: 12.2, h: 0.55, fontSize: 22, bold: true, color: NAVY });
    slide.addText(`${equipmentRows.length} equipo(s) · ${familyNames.length} familia(s) · ${rangeText}`, { x: 0.55, y: 0.95, w: 12.2, h: 0.35, fontSize: 11, color: MUTED });
    if (conditionRows.length > 1) {
      slide.addTable(conditionRows, pptxTableOptions({ x: 0.55, y: 1.45, w: 12.2, colW: [5.0, 1.9, 1.9, 3.4], rowH: 0.28, autoPage: true, autoPageRepeatHeader: true }));
    } else {
      slide.addText('Sin equipos para los filtros seleccionados.', { x: 0.55, y: 1.6, w: 12.2, h: 0.4, fontSize: 12, color: MUTED });
    }
    addFooter(slide);

    await pptx.writeFile({ fileName: `Reporte_${kindLabel || 'Mantenimiento'}_${start || 'periodo'}.pptx` });
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
    <div class="detail-columns">
      <article class="detail-block">
        <div class="detail-block-head"><h4>Bitácora reciente</h4><span>${logs.length} registro(s)</span></div>
        ${logs.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Turno</th><th>Componente</th><th>Horas</th><th>Estado</th></tr></thead><tbody>${logs.map(row => `<tr><td>${formatDate(row.date)}</td><td>${esc(row.shift)}</td><td>${esc(row.component)}</td><td>${fmt(row.worked_hours)}</td><td>${badge(row.status)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Sin capturas en el periodo.</div>'}
      </article>
      <article class="detail-block">
        <div class="detail-block-head"><h4>Servicios preventivos</h4><span>${services.length} servicio(s)</span></div>
        ${services.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Servicio</th><th>Tipo</th><th>Objetivo</th><th>Estado</th></tr></thead><tbody>${services.map(row => `<tr><td>${formatDate(row.date)}</td><td>${esc(row.service)}</td><td>${esc(row.type)}</td><td>${fmt(row.target)} ${esc(row.unit)}</td><td>${badge(row.status)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Sin servicios registrados.</div>'}
      </article>
    </div>`;
  $('equipment-modal').hidden = false;
  document.body.classList.add('modal-open');
  $('equipment-modal').querySelector('.modal-close').focus();
}

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

function render() {
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
  renderSummary(kpiRows, bitacoraRows, calendarRows);
  $('kpi-count').textContent = `${kpiByEquipment.length} equipos · ${kpiRows.length} cortes`;

  setRows('kpi-table', kpiByEquipment, 9, row => `<tr data-equipment="${esc(row.equipment)}" tabindex="0" title="${row.cuts} corte(s) KPI en el periodo"><td><b>${esc(row.equipment)}</b><br>${esc(row.description)}</td><td>${esc(row.family)}</td><td>${fmt(row.availability)}%</td><td>${fmt(row.utilization)}%</td><td>${fmt(row.worked_hours)}</td><td>${fmt(row.mp_hours)}</td><td>${fmt(row.mc_hours)}</td><td>${fmt(row.stops, 0)}</td><td>${badge(row.status)}</td></tr>`);
  setRows('bitacora-table', bitacoraRows, 12, row => `<tr data-equipment="${esc(row.equipment)}" tabindex="0"><td>${formatDate(row.date)}</td><td><b>${esc(row.equipment)}</b></td><td>${esc(row.family)}</td><td>${esc(row.shift)}</td><td>${esc(row.component)}</td><td>${fmt(row.hi)}</td><td>${fmt(row.hf)}</td><td>${fmt(row.worked_hours)}</td><td>${fmt(row.mp_hours)}</td><td>${fmt(row.mc_hours)}</td><td>${fmt(row.stops, 0)}</td><td>${badge(row.status)}</td></tr>`);
  setRows('calendar-table', calendarByEquipment, 9, row => `<tr data-equipment="${esc(row.equipment)}" tabindex="0" title="Servicios en el periodo: ${esc((row.dates || []).map(formatDate).join(' · '))}"><td>${formatDate(row.date)}</td><td><b>${esc(row.equipment)}</b><br>${esc(row.description)}</td><td>${esc(row.family)}</td><td>${esc(row.service)}</td><td>${esc(row.type)}</td><td>${fmt(row.meter)} ${esc(row.unit)}</td><td>${fmt(row.target)} ${esc(row.unit)}</td><td>${badge(row.status)}</td><td>${row.services}</td></tr>`);
  renderCalendar(calendarRowsForView());
  setRows('equipment-table', equipmentRows, 4, row => `<tr data-equipment="${esc(row.code)}" tabindex="0"><td><b>${esc(row.code)}</b></td><td>${esc(row.description)}</td><td>${esc(row.family)}</td><td>${badge(row.status)}</td></tr>`);
  $('bitacora-count').textContent = `${bitacoraRows.length} registros`;
  $('calendar-count').textContent = `${calendarByEquipment.length} equipos · ${calendarRows.length} servicios`;
  $('equipment-count').textContent = `${equipmentRows.length} equipos`;

  const updated = data.meta?.updatedAt || '—';
  $('updated-at').textContent = formatDate(String(updated).slice(0, 10));
  $('footer-updated').textContent = updated;
  $('data-tag').textContent = data.schema ? 'CORTE DEL PROGRAMA' : 'SIN DATOS';
  $('report-period').textContent = `${$('date-start').value || data.meta?.periodStart || '—'} a ${$('date-end').value || data.meta?.periodEnd || '—'} · KPI ${kpiRows.length} · Bitácora ${bitacoraRows.length} · Calendario ${calendarRows.length}`;
  const periodName = PERIOD_LABELS[reportPeriod];
  $('report-pptx-range').textContent = `${periodName ? `Periodo ${periodName}` : 'Periodo seleccionado'}: ${formatRange($('date-start').value, $('date-end').value)} · ${kpiRows.length} cortes KPI · ${equipmentRows.length} equipos`;
  renderReportScope(kpiRows, bitacoraRows, calendarRows, equipmentRows);
  updatePrintHead();
}

function fillSelect(id, options, allLabel) {
  const select = $(id);
  const previous = select.value;
  select.innerHTML = `<option value="">${esc(allLabel)}</option>`
    + options.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('');
  if (options.some(([value]) => value === previous)) select.value = previous;
}

function fillFilters() {
  const allRows = [...data.equipment, ...data.kpi, ...data.bitacora, ...data.calendar];
  const sort = (a, b) => String(a).localeCompare(String(b), 'es');

  const families = [...new Set(allRows.map(row => row.family).filter(Boolean))].sort(sort);
  fillSelect('family-filter', families.map(family => [family, family]), 'Todas las familias');

  const codes = [...new Set([
    ...data.equipment.map(row => row.code),
    ...data.kpi.map(row => row.equipment),
    ...data.bitacora.map(row => row.equipment),
    ...data.calendar.map(row => row.equipment)
  ].filter(Boolean))].sort(sort);
  fillSelect('equipment-filter', codes.map(code => [code, code]), 'Todos los equipos');

  const shifts = [...new Set(data.bitacora.map(row => row.shift).filter(Boolean))].sort(sort);
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
    data = normalize(JSON.parse(await file.text()));
    if (data.meta.periodStart) $('date-start').value = data.meta.periodStart;
    if (data.meta.periodEnd) $('date-end').value = data.meta.periodEnd;
    fillFilters();
    $('public-notice').hidden = true;
    setConnection(true, 'Paquete local listo');
    render();
    toast('Paquete abierto localmente; no se envió al sitio.');
  } catch (error) {
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
    data = normalize(await response.json());
    if (data.meta.periodStart) $('date-start').value = data.meta.periodStart;
    if (data.meta.periodEnd) $('date-end').value = data.meta.periodEnd;
    fillFilters();
    $('public-notice').hidden = true;
    setConnection(true, `${data.meta?.periodStart || '—'} a ${data.meta?.periodEnd || '—'}`);
    render();
    toast('Información actualizada desde el programa.');
  } catch (error) {
    $('public-notice').hidden = false;
    setConnection(false, 'Revisa la conexión o abre un paquete local');
    toast(`No se pudo actualizar: ${error.message}`);
  } finally {
    button.classList.remove('spinning');
  }
}

function csvExport() {
  const views = {
    inicio: ['KPI', aggregateByEquipment(rows('kpi')), ['date', 'equipment', 'description', 'family', 'availability', 'utilization', 'worked_hours', 'mp_hours', 'mc_hours', 'stops', 'status', 'tmef', 'tmpr', 'cuts']],
    bitacora: ['Bitacora', rows('bitacora'), ['date', 'equipment', 'description', 'family', 'shift', 'component', 'hi', 'hf', 'worked_hours', 'mp_hours', 'mc_hours', 'standby_hours', 'stops', 'status']],
    calendario: ['Calendario', aggregateCalendarByEquipment(rows('calendar')), ['date', 'equipment', 'description', 'family', 'service', 'type', 'meter', 'target', 'unit', 'status', 'services']],
    equipos: ['Equipos', rows('equipment'), ['code', 'description', 'family', 'status']],
    reportes: ['KPI', aggregateByEquipment(rows('kpi')), ['date', 'equipment', 'description', 'family', 'availability', 'utilization', 'worked_hours', 'mp_hours', 'mc_hours', 'stops', 'status', 'tmef', 'tmpr', 'cuts']]
  };
  const [name, list, keys] = views[view];
  if (!list.length) return toast('No hay filas para exportar con estos filtros.');
  const titles = { date: 'Fecha', equipment: 'Equipo', description: 'Descripción', family: 'Familia', availability: 'Disponibilidad %', utilization: 'Utilización %', worked_hours: 'Horas operadas', mp_hours: 'MP h', mc_hours: 'MC h', stops: 'Paros', status: 'Estado', tmef: 'TMEF', tmpr: 'TMPR', shift: 'Turno', component: 'Componente', hi: 'HI', hf: 'HF', standby_hours: 'Stand by h', service: 'Servicio / gama', type: 'Tipo', meter: 'Medidor', target: 'Objetivo', unit: 'Unidad', code: 'Código', cuts: 'Cortes', services: 'Servicios' };
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = '\ufeff' + [keys.map(key => titles[key] || key), ...list.map(row => keys.map(key => row[key]))]
    .map(row => row.map(quote).join(',')).join('\r\n');
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `SierraMadre_${name}_${$('date-start').value || 'periodo'}.csv`);
}

function download(blob, name) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
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
['export-excel', 'quick-excel', 'report-excel'].forEach(id => $(id).addEventListener('click', csvExport));
['export-pdf', 'quick-pdf', 'report-pdf'].forEach(id => $(id).addEventListener('click', printReport));
document.querySelectorAll('#period-toggle [data-period]').forEach(button => button.addEventListener('click', () => applyPeriod(button.dataset.period)));
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

render();
refreshData();
