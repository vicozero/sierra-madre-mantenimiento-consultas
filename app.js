const API_URL = 'https://sierra-madre-consulta-api.feywren128.chatgpt.site/api/portal';
const EMPTY = { meta: { updatedAt: '—' }, equipment: [], kpi: [], bitacora: [], calendar: [], diesel: [] };
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
  reportes: { label: 'Reportes', title: 'Reportes de mantenimiento', subtitle: 'Genera archivos con el periodo, familia y turno seleccionados.' },
  diesel: { label: 'Diesel', title: 'Consumo de Diesel', subtitle: 'Consumo y costos de combustible por periodo y unidad.' }
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
  return payload;
}

function acceptPackage(candidate, current = data) {
  const next = normalize(candidate);
  const sections = ['equipment', 'kpi', 'bitacora', 'calendar'];
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
  renderShiftComparison(bitacoraRows);
  renderSummary(kpiRows, bitacoraRows, calendarRows);
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

render();
refreshData();

// ============ FUNCIONES DIESEL ============

function filterValuesDiesel() {
  const { family, equipment, shift, status, condition, type, query, start, end } = filterValues();
  return {
    family: $("family-filter").value,
    equipment: $("equipment-filter").value,
    shift: $("shift-filter").value,
    status: normStatus($("status-filter").value),
    condition: $("condition-filter").value,
    type: $("type-filter").value,
    query: $("search").value.trim().toLocaleLowerCase("es-MX"),
    start: $("date-start").value,
    end: $("date-end").value,
    dieselStart: $("diesel-date-start") ? $("diesel-date-start").value : "",
    dieselEnd: $("diesel-date-end") ? $("diesel-date-end").value : ""
  };
}

function rowCodeDiesel(row) {
  return row.equipment || row.code || "";
}

function normStatusDiesel(value) {
  return String(value || "").trim().toLocaleLowerCase("es-MX");
}

function conditionOfDiesel(row) {
  const status = normStatusDiesel(row.status);
  if (/disponible|operativo|complet|termin|realiz|ejecut/.test(status)) return "disponible";
  if /no disponible|fuera|venc|fall|cr.tic|detenid/.test(status)) return "critico";
  if /program|pend|proceso|urgente|proxim|riesgo|amarill/.test(status)) return "riesgo";
  return "sindato";
}

function dieselRows() {
  const { dieselStart, dieselEnd, shift, status, condition, type, family, equipment, query } = filterValuesDiesel();
  return (data.diesel || []).filter(row => {
    if (family && row.family !== family) return false;
    if (equipment && rowCodeDiesel(row) !== equipment) return false;
    if (shift && row.shift !== shift) return false;
    if (status && normStatusDiesel(row.status) !== status) return false;
    if (condition && conditionOfDiesel(row) !== condition) return false;
    if (type && String(row.type || "") !== type) return false;
    if (query && !Object.values(row).join(" ").toLocaleLowerCase("es-MX").includes(query)) return false;
    if (row.date && start && row.date.slice(0, 10) < start) return false;
    if (row.date && end && row.date.slice(0, 10) > end) return false;
    if (dieselStart && row.date.slice(0, 10) < dieselStart) return false;
    if (dieselEnd && row.date.slice(0, 10) > dieselEnd) return false;
    return true;
  });
}

function dieselIndicators(dieselRows) {
  const groups = new Map();
  for (const row of dieselRows) {
    const family = row.family || "Sin familia";
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family).push(row);
  }
  return [...groups].map(([family, items]) => ({
    family,
    equipment: distinctCountDiesel(items, "equipment"),
    consumption: sumFieldDiesel(items, "consumption"),
    cost: sumFieldDiesel(items, "cost"),
    rows: items.length
  })).sort((a, b) => b.consumption - a.consumption);
}

function distinctCountDiesel(list, key) {
  return new Set(list.map(row => row[key]).filter(Boolean)).size;
}

function sumFieldDiesel(list, key) {
  return list.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
}

function generateDieselPDF() {
  if (typeof jsPDF === "undefined") {
    toast("No se pudo cargar jsPDF. Recarga la página e intente de nuevo.");
    return;
  }
  const start = $("diesel-date-start") ? $("diesel-date-start").value : "";
  const end = $("diesel-date-end") ? $("diesel-date-end").value : "";
  if (!start || !end) {
    toast("Selecciona un periodo primero.");
    return;
  }

  const dieselRows = dieselRows();
  const indicators = dieselIndicators(dieselRows);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [210, 297] });
  const NAVY = "092744", BLUE = "1476df", CYAN = "16b5e5", INK = "17395d", MUTED = "6d829b";
  const WHITE = "FFFFFF", ORANGE = "F59E0B", GREEN = "12A66A", RED = "EF4444";

  // Header
  pdf.setFillColor(NAVY);
  pdf.rect(0, 0, 210, 12, "F");
  pdf.setFontSize(14);
  pdf.setTextColor(WHITE);
  pdf.setFont("Helvetica", "bold");
  pdf.text("SIERRA MADRE · Mantenimiento", 10, 7);
  pdf.setFontSize(8);
  pdf.text("Consumo de Diesel · " + new Date().toLocaleDateString("es-MX"), 10, 10);

  // KPI Cards
  const cardH = 12;
  const cardW = 45;
  const gap = 5;
  const cards = [
    { label: "Consumo Total", value: fmt(Number(indicators.reduce((s,i)=>s+i.consumption,0))), color: GREEN },
    { label: "Costo Total", value: fmt(Number(indicators.reduce((s,i)=>s+i.cost,0))), color: ORANGE },
    { label: "Total Registros", value: String(indicators.reduce((s,i)=>s+i.rows,0)), color: BLUE }
  ];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const xi = 10 + i * (cardW + gap);
    pdf.setFillColor("#F5F9FF");
    pdf.setDrawColor("#DCE7F3");
    pdf.setLineWidth(0.5);
    pdf.rect(xi, 20, cardW, cardH, "DF");
    pdf.setFontSize(11);
    pdf.setTextColor(card.color);
    pdf.setFont("Helvetica", "bold");
    pdf.text(String(card.value), xi + 2, 26, { maxWidth: cardW - 4, align: "center" });
    pdf.setFontSize(8);
    pdf.setTextColor("#6D829B");
    pdf.setFont("Helvetica", "");
    pdf.text(card.label, xi + 2, 35, { maxWidth: cardW - 4, align: "center" });
  }

  // Table
  const colW = [25, 35, 30, 25, 25, 30, 30];
  const headers = ["Fecha", "Equipo", "Familia", "Turno", "Consumo (h)", "Costo", "Estado"];
  const headerH = 8;
  const rowH = 7;
  const marginL = 10;
  const marginT = 35;

  // Header
  pdf.setFillColor("#0F1E36");
  pdf.setTextColor(WHITE);
  pdf.setFontSize(7);
  pdf.setFont("Helvetica", "bold");
  let cx = marginL;
  for (let i = 0; i < headers.length; i++) {
    pdf.text(headers[i], cx, marginT, { maxWidth: colW[i], align: "center" });
    cx += colW[i];
  }

  // Data sorted by date desc
  const sortedRows = [...dieselRows].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const periodRows = sortedRows.filter(row => {
    const evt = new Date(row.date + "T12:00:00");
    return new Date(start + "T12:00:00") <= evt && evt <= new Date(end + "T12:00:00");
  });

  pdf.setFontSize(6.5);
  pdf.setFont("Helvetica", "");
  pdf.setTextColor("#1F2937");
  let rowY = marginT + headerH;
  for (let i = 0; i < periodRows.length; i++) {
    if (rowY > 270) {
      pdf.addPage();
      pdf.setFillColor("#0F1E36");
      pdf.setTextColor(WHITE);
      pdf.setFontSize(7);
      pdf.setFont("Helvetica", "bold");
      cx = marginL;
      for (let h = 0; h < headers.length; h++) {
        pdf.text(headers[h], cx, marginT, { maxWidth: colW[h], align: "center" });
        cx += colW[h];
      }
      rowY = marginT + headerH;
    }

    const row = periodRows[i];
    const cx = marginL;
    const dateText = row.date.slice(8, 10) + "/" + row.date.slice(5, 7) + "/" + row.date.slice(0, 4);
    const cells = [
      dateText,
      row.equipment || "-",
      row.family || "-",
      row.shift || "-",
      Number(row.consumption || 0).toFixed(2),
      Number(row.cost || 0).toFixed(2),
      row.status || "-"
    ];

    for (let ci = 0; ci < cells.length; ci++) {
      pdf.setFontSize(6);
      pdf.setTextColor("#1F2937");
      pdf.setFont("Helvetica", "");
      pdf.text(String(cells[ci]), cx, rowY, { maxWidth: colW[ci] });
      cx += colW[ci];
    }
    rowY += rowH;
  }

  // Footer
  pdf.setFontSize(7);
  pdf.setTextColor("#64748b");
  pdf.text("SIERRA MADRE · Mantenimiento | Diesel Report", marginL, 285);
  pdf.text("Página " + pdf.pageNo, 200, 285, { align: "right" });

  const filename = "Diesel_Report_" + start + "_" + end + ".pdf";
  pdf.save(filename);
  toast("PDF generado: " + filename);
}

// Diesel event listeners
$("export-diesel-pdf").addEventListener("click", generateDieselPDF);
$("export-diesel-csv").addEventListener("click", () => {
  const dieselRows = dieselRows();
  if (!dieselRows.length) return toast("No hay filas para exportar con estos filtros.");
  const rowsCSV = dieselRows.map(row => [
    row.date,
    row.equipment || "-",
    row.family || "-",
    row.shift || "-",
    Number(row.consumption).toFixed(2),
    Number(row.cost).toFixed(2),
    row.status || "-"
  ]).map(row => cell => `"${String(cell).replaceAll('"', '""')}"`).join(",");
  const blob = new Blob(["\ufeffFecha,Equipo,Familia,Turno,Consumo (h),Costo,Estado\r\n" + dieselRows.map(row => 
    dieselRows.map(r => 
      `"${String(r.date).replaceAll('"', '""')},${String(r.equipment || '-').replaceAll('"', '""')},${String(r.family || '-').replaceAll('"', '""')},${String(r.shift || '-').replaceAll('"', '""')},${Number(r.consumption).toFixed(2)},${Number(r.cost).toFixed(2)},${String(r.status || '-').replaceAll('"', '""')}`
    ).join("\r\n")
  ]), {type: "text/csv;charset=utf-8"});
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = "SierraMadre_ReporteDiesel_" + start + ".csv";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  toast("CSV exportado: SierraMadre_ReporteDiesel_" + start + ".csv");
});

render();
refreshData();
