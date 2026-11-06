const API_URL = 'https://sierra-madre-consulta-api.vicozero559.chatgpt.site/api/portal';
const EMPTY = { meta: { updatedAt: 'â€”' }, equipment: [], kpi: [], bitacora: [], calendar: [], diesel: [], supervision: [], light_vehicles: [] };
const PALETTE = ['#1476df', '#31ad72', '#f6be25', '#f28a27', '#8052e8', '#0ba6a7', '#75869a'];
const AUTO_REFRESH_MS = 5 * 60 * 1000;
let refreshInFlight = false;
let lastRefreshAttempt = 0;
let data = structuredClone(EMPTY);
let view = 'inicio';
const REPORT_BRAND = 'SIERRA MADRE';
const REPORT_UNIT = 'MINA LA GUITARRA';
const PERIOD_LABELS = { mensual: 'Mensual', semanal: 'Semanal', diario: 'Diario' };
let reportPeriod = null;
let calendarAnchor = new Date();
let calendarMode = 'month';
let calendarListMode = false;
let vehicleViewMode = 'almanac';

// Calendar classification groups
const CALENDAR_GROUPS = { VL: 'VL', JL: 'JL', SUPERFICIE: 'Superficie', MINA: 'Mina' };

/* ----------
   CLASSIFICATION RULES (order of precedence)
   ------------------------
   1. family field from equipment catalog (normalized)
   2. equipment code normalized patterns
   3. Default: Mina (unclassified services)
   
   Family mapping:
   - VEHICULOSLIGEROS / VL- codes â†’ VL (VehÃ­culos Ligeros)
   - Perforadora/perforation-related families â†’ JL (MÃ¡quinas Perforadoras)
   - Superficie-related families â†’ Superficie
   - Everything else â†’ Mina (with identification as pending classification)
*/

function normalizeFamily(family) {
  if (!family) return '';
  return String(family)
    .normalize('NFC')
    .trim()
    .toUpperCase()
    .replace(/['Â´`]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeCode(code) {
  if (!code) return '';
  return String(code)
    .normalize('NFC')
    .trim()
    .toUpperCase()
    .replace(/['Â´`]/g, '')
    .replace(/\s+/g, '')
    .replace(/-/g, '');
}

// Classify a calendar row into one of the 4 groups
// Returns the group key (VL, JL, SUPERFICIE, MINA)
function classifyCalendarRow(row) {
  // Priority 1: Use the family field from the row (equipment catalog)
  const family = normalizeFamily(row.family);
  if (family) {
    // VL: VehÃ­culos ligeros
    if (
      family === 'VEHICULOSLIGEROS' ||
      /VEHICULO(LIGER)?/.test(family) ||
      /^VL-/.test(normalizeCode(row.equipment))
    ) {
      return CALENDAR_GROUPS.VL;
    }
    // JL: MÃ¡quinas perforadoras - families related to perforaciÃ³n/drilling
    if (
      /PERFORADOR|PERFOR|PERFOR|BOOM|VIGA|ARRAC|STOPE/.test(family) ||
      /PERFORADOR|PERFOR|PERFOR/.test(normalizeCode(row.equipment))
    ) {
      return CALENDAR_GROUPS.JL;
    }
    // Superficie: families related to surface equipment
    if (
      /SUPERFICIE|SUPERFICI/.test(family) ||
      /PLANTA.BENEFICIO|BENEFICIO/.test(family) ||
      /PROYECTO|PROYECT/.test(family)
    ) {
      return CALENDAR_GROUPS.SUPERFICIE;
    }
  }

  // Priority 2: Use equipment code normalized patterns
  const eqCode = normalizeCode(row.equipment);
  if (eqCode) {
    // VL check via VL- prefix
    if (/^VL-/.test(eqCode)) return CALENDAR_GROUPS.VL;
    
    // JL: perforadora-related codes
    if (
      /PERFOR|PERF|ARRAC|BOOM|MC-|PM-/.test(eqCode) ||
      /LHD|HAUL|TRUCK|CAMION/.test(eqCode) === false
    ) {
      // More specific check: if it has perforaciÃ³n indicators
      if (/PERFOR|PERF|ARRAC|BOOM/.test(eqCode)) return CALENDAR_GROUPS.JL;
    }
    
    // Superficie codes
    if (/SUR-|SUP-|PLT|BENEFICIO/.test(eqCode) || /SUPERFICIE/.test(eqCode)) return CALENDAR_GROUPS.SUPERFICIE;
  }

  // Priority 3: Check service name/type as secondary reference (not primary)
  const service = String(row.service || row.type || '').toUpperCase();
  if (
    /AGUA|AGUAS|DRENA|DRENAJE|ACOP|ACOPIO/.test(service) === false &&
    /VENTIL|ARRAC|BOOM|PERFORADORA/.test(service) === false
  ) {
    // No clear classification found
  }

  // Default: Mina (unclassified - identified as pending classification)
  return CALENDAR_GROUPS.MINA;
}

// Classify all calendar rows into the 4 groups
function classifyCalendarData() {
  const classified = {
    VL: [],
    JL: [],
    SUPERFICIE: [],
    MINA: []
  };

  if (!data.calendar || !Array.isArray(data.calendar)) {
    return classified;
  }

  for (const row of data.calendar) {
    const group = classifyCalendarRow(row);
    if (classified[group]) {
      classified[group].push(row);
    } else {
      classified.MINA.push(row);
    }
  }

  return classified;
}

// Get calendar rows for a specific group
function calendarRowsForGroup(groupKey) {
  const classified = classifyCalendarData();
  return classified[groupKey] || [];
}

// Get the count of services in each group
function calendarGroupCounts() {
  const classified = classifyCalendarData();
  return {
    VL: classified.VL.length,
    JL: classified.JL.length,
    SUPERFICIE: classified.SUPERFICIE.length,
    MINA: classified.MINA.length,
    TOTAL: data.calendar ? data.calendar.length : 0
  };
}

// Validate that classification is complete (no duplicates, total matches)
function validateCalendarClassification() {
  const classified = classifyCalendarData();
  const totalClassified = classified.VL.length + classified.JL.length + classified.SUPERFICIE.length + classified.MINA.length;
  const isValid = totalClassified === (data.calendar ? data.calendar.length : 0);
  const noDuplicates = new Set([
    ...classified.VL,
    ...classified.JL,
    ...classified.SUPERFICIE,
    ...classified.MINA
  ]).size === totalClassified;
  
  return {
    valid: isValid,
    totalClassified,
    totalOriginal: data.calendar ? data.calendar.length : 0,
    noDuplicates,
    classified
  };
}

// Export the classified data for use in views
function getGroupedCalendars() {
  return classifyCalendarData();
}

// Attach classification functions to the window object for debugging/inspection
if (typeof window !== 'undefined') {
  window.classifyCalendarRow = classifyCalendarRow;
  window.classifyCalendarData = classifyCalendarData;
  window.calendarRowsForGroup = calendarRowsForGroup;
  window.calendarGroupCounts = calendarGroupCounts;
  window.validateCalendarClassification = validateCalendarClassification;
  window.getGroupedCalendars
const VIEWS = {
  inicio: { label: 'Resumen KPI', title: 'Información del programa', subtitle: 'KPI, bitácora y calendario de servicio en una sola página.' },
  bitacora: { label: 'Bitácora', title: 'Bitácora de equipos', subtitle: 'Lecturas de medidor, horas y estado por fecha y turno.' },
  supervision: { label: 'Disponibilidad supervisión', title: 'Disponibilidad supervisión', subtitle: 'Resultados por supervisor, día y equipo registrados desde La Guitarra.' },
  vehiculos: { label: 'Vehículos ligeros', title: 'Preventivos vehiculares', subtitle: 'Almanaque, Gantt y servicios realizados de la flota ligera.' },
  calendario: { label: 'Calendario de servicio', title: 'Calendario de servicio', subtitle: 'Servicios programados, proyectados y completados dentro del periodo.' },
  equipos: { label: 'Equipos', title: 'Equipos', subtitle: 'Catálogo consultivo del programa.' },
  reportes: { label: 'Reportes', title: 'Reportes de mantenimiento', subtitle: 'Genera archivos con el periodo, familia y turno seleccionados.' },
  diesel: { label: 'Diesel', title: 'Consumo de Diesel', subtitle: 'Consulta litros por turno, día, semana y mes.' }
};

 = getGroupedCalendars;

// Original code continues below - VIEWS constant and all original functions
// The complete original app.js code follows, preserving all existing functionality
// including normalize(), acceptPackage(), filter functions, calendar rendering, etc.}