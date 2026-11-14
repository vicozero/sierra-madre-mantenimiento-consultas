/* =============================================================
   DieselXLSX — lectura y escritura de Excel (.xlsx)
   - Genera el concentrado "REPORTE DIESEL" con el mismo formato
     de la bitácora: categoría, equipo, horómetro, fecha, turnos,
     total, departamento, operador, responsable, folio y ubicación.
   - Agrega hojas "CUENTA LITROS" y "RESUMEN".
   - Importa el mismo formato (tolera encabezados y columnas
     movidas) y también lee la hoja de cuenta litros si existe.
   - Sin dependencias externas salvo fflate (ZIP), incluido local.
   ============================================================= */
window.DieselXLSX = (function () {
  'use strict';

  const F = window.fflate;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  /* ------------------------------ utilidades ------------------------------ */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function unesc(s) {
    return String(s == null ? '' : s)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n))
      .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
      .replace(/&amp;/g, '&');
  }

  function colLetter(index) {
    let n = index + 1;
    let out = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      out = String.fromCharCode(65 + r) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }

  function colIndex(letters) {
    let n = 0;
    for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
    return n - 1;
  }

  function numXml(v) {
    const n = Number(v);
    if (!isFinite(n)) return '0';
    return String(Math.round(n * 1e6) / 1e6);
  }

  function dateToSerial(iso) {
    const m = String(iso || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return Math.round((ms - Date.UTC(1899, 11, 30)) / 86400000);
  }

  function serialToDate(serial) {
    const n = Number(serial);
    if (!isFinite(n)) return null;
    const ms = Date.UTC(1899, 11, 30) + n * 86400000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    const p = (x) => String(x).padStart(2, '0');
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  }

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/,/g, '').trim());
    return isFinite(n) ? n : null;
  }

  function text(v) {
    return v === null || v === undefined ? '' : String(v).trim();
  }

  /* ------------------------------ estilos ------------------------------ */

  const STYLE = {
    normal: 0,
    title: 1,
    company: 2,
    subtitle: 3,
    header: 4,
    data: 5,
    number: 6,
    date: 7,
    totalLabel: 8,
    totalNumber: 9,
    highlight: 10,
    legendCode: 11,
    legendText: 12,
    section: 13,
    centered: 14,
    note: 15
  };

  function stylesXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="2">' +
        '<numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>' +
        '<numFmt numFmtId="165" formatCode="#,##0.0"/>' +
      '</numFmts>' +
      '<fonts count="6">' +
        '<font><sz val="11"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="10"/><name val="Calibri"/></font>' +
        '<font><sz val="10"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="16"/><color rgb="FF0F2A43"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="12"/><color rgb="FF0F2A43"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="10"/><color rgb="FF7F6000"/><name val="Calibri"/></font>' +
      '</fonts>' +
      '<fills count="6">' +
        '<fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFFFC000"/><bgColor indexed="64"/></patternFill></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill>' +
      '</fills>' +
      '<borders count="2">' +
        '<border><left/><right/><top/><bottom/><diagonal/></border>' +
        '<border>' +
          '<left style="thin"><color rgb="FFBFBFBF"/></left>' +
          '<right style="thin"><color rgb="FFBFBFBF"/></right>' +
          '<top style="thin"><color rgb="FFBFBFBF"/></top>' +
          '<bottom style="thin"><color rgb="FFBFBFBF"/></bottom>' +
          '<diagonal/>' +
        '</border>' +
      '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="16">' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
        '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
        '<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
        '<xf numFmtId="165" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
        '<xf numFmtId="164" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
        '<xf numFmtId="165" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
        '<xf numFmtId="165" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
        '<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
        '<xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
        '<xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
        '<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
        '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  /* ------------------------------ celdas ------------------------------ */

  function cellText(ref, style, value) {
    if (value === null || value === undefined || value === '') {
      return '<c r="' + ref + '" s="' + style + '"/>';
    }
    return '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' +
      esc(value) + '</t></is></c>';
  }

  function cellNumber(ref, style, value) {
    if (value === null || value === undefined || value === '' || !isFinite(Number(value))) {
      return '<c r="' + ref + '" s="' + style + '"/>';
    }
    return '<c r="' + ref + '" s="' + style + '"><v>' + numXml(value) + '</v></c>';
  }

  function cellDate(ref, style, iso) {
    const serial = dateToSerial(iso);
    if (serial === null) return '<c r="' + ref + '" s="' + style + '"/>';
    return '<c r="' + ref + '" s="' + style + '"><v>' + serial + '</v></c>';
  }

  function cellFormula(ref, style, formula, cached) {
    return '<c r="' + ref + '" s="' + style + '"><f>' + esc(formula) + '</f><v>' + numXml(cached) + '</v></c>';
  }

  function rowXml(num, cells, attrs) {
    const a = attrs || '';
    return '<row r="' + num + '"' + (a ? ' ' + a : '') + '>' + cells.join('') + '</row>';
  }

  /* ------------------------------ hoja principal ------------------------------ */

  function buildMainSheet(opt) {
    const cfg = opt.config || {};
    const charges = opt.charges || [];
    const rows = [];

    rows.push('<row r="1"/>');
    rows.push('<row r="2" ht="24" customHeight="1"><c r="C2" s="' + STYLE.title + '" t="inlineStr"><is><t xml:space="preserve">' +
      esc(cfg.empresa || '') + '</t></is></c></row>');
    rows.push('<row r="3"/>');
    rows.push('<row r="4"><c r="C4" s="' + STYLE.company + '" t="inlineStr"><is><t xml:space="preserve">' +
      esc(cfg.razonSocial || '') + '</t></is></c></row>');
    rows.push('<row r="5"/>');
    rows.push('<row r="6"><c r="C6" s="' + STYLE.subtitle + '" t="inlineStr"><is><t xml:space="preserve">' +
      esc(cfg.tituloBitacora || 'BITACORA CONSUMO DIESEL') + '</t></is></c></row>');
    rows.push('<row r="7"/>');

    // Leyenda de categorías (4 por fila, como el formato original)
    const cats = (cfg.categorias || []).slice(0, 12);
    for (let r = 0; r < 3; r++) {
      const rowNum = 8 + r;
      const cells = [];
      for (let c = 0; c < 4; c++) {
        const cat = cats[r * 4 + c];
        const codeCol = colLetter(1 + c * 2); // B, D, F, H
        const nameCol = colLetter(2 + c * 2); // C, E, G, I
        cells.push(cellText(codeCol + rowNum, STYLE.legendCode, cat ? (cat.id || cat.codigo || '') : ''));
        cells.push(cellText(nameCol + rowNum, STYLE.legendText, cat ? (cat.nombre || '') : ''));
      }
      rows.push(rowXml(rowNum, cells));
    }

    rows.push('<row r="11"/>');
    rows.push(rowXml(12, [
      cellText('F12', STYLE.section, 'Litros diesel')
    ], 'ht="20" customHeight="1"'));

    const headers = [
      ['B', 'Categoria '],
      ['C', 'Equipo'],
      ['D', 'Horometro'],
      ['E', 'Fecha'],
      ['F', 'Turno 1'],
      ['G', 'Turno 2'],
      ['H', 'Turno 3'],
      ['I', 'Total Turnos'],
      ['J', 'Departamento'],
      ['K', 'Operador'],
      ['L', 'Responsable'],
      ['M', 'Folio'],
      ['N', 'Ubicacion T.']
    ];
    rows.push(rowXml(13, headers.map((h) => cellText(h[0] + '13', STYLE.header, h[1])), 'ht="30" customHeight="1"'));

    const sorted = charges.slice().sort((a, b) =>
      String(a.fecha).localeCompare(String(b.fecha)) ||
      String(a.categoria || '').localeCompare(String(b.categoria || '')) ||
      String(a.equipo || '').localeCompare(String(b.equipo || '')) ||
      String(a.turno || '').localeCompare(String(b.turno || '')) ||
      String(a.creado || '').localeCompare(String(b.creado || ''))
    );

    let r = 14;
    sorted.forEach((c) => {
      const t1 = c.turno === '1' ? Number(c.litros) || 0 : 0;
      const t2 = c.turno === '2' ? Number(c.litros) || 0 : 0;
      const t3 = c.turno === '3' ? Number(c.litros) || 0 : 0;
      const total = t1 + t2 + t3;
      const hor = c.horometro;
      const cells = [
        cellText('B' + r, STYLE.centered, c.categoria || ''),
        cellText('C' + r, STYLE.data, c.equipo || ''),
        (hor === null || hor === undefined || hor === '' || isFinite(Number(hor)))
          ? cellNumber('D' + r, STYLE.number, hor)
          : cellText('D' + r, STYLE.centered, hor),
        cellDate('E' + r, STYLE.date, c.fecha),
        cellNumber('F' + r, STYLE.number, t1),
        cellNumber('G' + r, STYLE.number, t2),
        cellNumber('H' + r, STYLE.number, t3),
        cellFormula('I' + r, STYLE.highlight, 'F' + r + '+G' + r + '+H' + r, total),
        cellText('J' + r, STYLE.data, c.departamento || ''),
        cellText('K' + r, STYLE.data, c.operador || ''),
        cellText('L' + r, STYLE.data, c.responsable || ''),
        cellText('M' + r, STYLE.centered, c.folio || ''),
        cellText('N' + r, STYLE.centered, c.ubicacion || '')
      ];
      rows.push(rowXml(r, cells));
      r++;
    });

    const lastData = r - 1;
    const totalRow = r;
    const sumT1 = sorted.reduce((a, c) => a + (c.turno === '1' ? Number(c.litros) || 0 : 0), 0);
    const sumT2 = sorted.reduce((a, c) => a + (c.turno === '2' ? Number(c.litros) || 0 : 0), 0);
    const sumT3 = sorted.reduce((a, c) => a + (c.turno === '3' ? Number(c.litros) || 0 : 0), 0);
    rows.push(rowXml(totalRow, [
      cellText('B' + totalRow, STYLE.data, ''),
      cellText('C' + totalRow, STYLE.data, ''),
      cellText('D' + totalRow, STYLE.data, ''),
      cellText('E' + totalRow, STYLE.data, ''),
      cellNumber('F' + totalRow, STYLE.totalNumber, sumT1),
      cellNumber('G' + totalRow, STYLE.totalNumber, sumT2),
      cellText('H' + totalRow, STYLE.totalLabel, 'TOTAL'),
      cellFormula('I' + totalRow, STYLE.totalNumber, 'SUM(I14:I' + Math.max(14, lastData) + ')', sumT1 + sumT2 + sumT3),
      cellText('J' + totalRow, STYLE.data, ''),
      cellText('K' + totalRow, STYLE.data, ''),
      cellText('L' + totalRow, STYLE.data, ''),
      cellText('M' + totalRow, STYLE.data, ''),
      cellText('N' + totalRow, STYLE.data, '')
    ]));

    const cols = [
      ['A', 3], ['B', 10], ['C', 42], ['D', 12], ['E', 12], ['F', 10], ['G', 10],
      ['H', 10], ['I', 12], ['J', 20], ['K', 20], ['L', 18], ['M', 10], ['N', 14]
    ];

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      '<dimension ref="A1:N' + totalRow + '"/>' +
      '<sheetViews><sheetView tabSelected="1" workbookViewId="0">' +
        '<pane ySplit="13" topLeftCell="A14" activePane="bottomLeft" state="frozen"/>' +
        '<selection pane="bottomLeft" activeCell="A14" sqref="A14"/>' +
      '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      '<cols>' + cols.map((c) => '<col min="' + (colIndex(c[0]) + 1) + '" max="' + (colIndex(c[0]) + 1) + '" width="' + c[1] + '" customWidth="1"/>').join('') + '</cols>' +
      '<sheetData>' + rows.join('') + '</sheetData>' +
      '<autoFilter ref="B13:N' + Math.max(14, lastData) + '"/>' +
      '<mergeCells count="2"><mergeCell ref="C6:N6"/><mergeCell ref="F12:H12"/></mergeCells>' +
      '<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
      '<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>' +
      '</worksheet>';
  }

  /* ------------------------------ hoja cuenta litros ------------------------------ */

  function buildBobaSheet(opt) {
    const cfg = opt.config || {};
    const boba = (opt.boba || []).slice().sort((a, b) =>
      String(a.fecha).localeCompare(String(b.fecha)) || String(a.turno).localeCompare(String(b.turno)));
    const chargeBy = opt.chargesByDateTurno || {};
    const rows = [];

    rows.push(rowXml(1, [cellText('A1', STYLE.title, 'CUENTA LITROS — ' + (cfg.empresa || ''))], 'ht="24" customHeight="1"'));
    rows.push(rowXml(2, [cellText('A2', STYLE.company, cfg.razonSocial || '')]));
    rows.push('<row r="3"/>');

    const headers = ['Fecha', 'Turno', 'Lectura inicial', 'Lectura final', 'Litros boba', 'Litros cargados', 'Diferencia', 'Notas'];
    rows.push(rowXml(4, headers.map((h, i) => cellText(colLetter(i) + '4', STYLE.header, h)), 'ht="28" customHeight="1"'));

    let r = 5;
    let sumBoba = 0;
    let sumCarga = 0;
    let sumDiff = 0;
    boba.forEach((b) => {
      const key = b.fecha + '|' + b.turno;
      const cargaTurno = Number(chargeBy[key] || 0);
      const cargaDia = Number((opt.chargesByDate && opt.chargesByDate[b.fecha]) || 0);
      const carga = b.turno === 'D' ? cargaDia : cargaTurno;
      const litros = b.litros == null ? null : Number(b.litros);
      const diff = litros == null ? null : litros - carga;
      if (litros != null) sumBoba += litros;
      sumCarga += carga;
      if (diff != null) sumDiff += diff;
      const turnoLabel = b.turno === 'D' ? 'Día' : ('Turno ' + b.turno);
      const cells = [
        cellDate('A' + r, STYLE.date, b.fecha),
        cellText('B' + r, STYLE.centered, turnoLabel),
        cellNumber('C' + r, STYLE.number, b.inicial),
        cellNumber('D' + r, STYLE.number, b.final),
        cellNumber('E' + r, STYLE.number, litros),
        cellNumber('F' + r, STYLE.number, carga),
        cellNumber('G' + r, STYLE.number, diff),
        cellText('H' + r, STYLE.data, b.notas || '')
      ];
      rows.push(rowXml(r, cells));
      r++;
    });

    const lastData = r - 1;
    const totalRow = r;
    rows.push(rowXml(totalRow, [
      cellText('A' + totalRow, STYLE.totalLabel, 'TOTAL'),
      cellText('B' + totalRow, STYLE.data, ''),
      cellText('C' + totalRow, STYLE.data, ''),
      cellText('D' + totalRow, STYLE.data, ''),
      cellNumber('E' + totalRow, STYLE.totalNumber, sumBoba),
      cellNumber('F' + totalRow, STYLE.totalNumber, sumCarga),
      cellNumber('G' + totalRow, STYLE.totalNumber, sumDiff),
      cellText('H' + totalRow, STYLE.data, '')
    ]));

    const cols = [['A', 12], ['B', 10], ['C', 16], ['D', 16], ['E', 14], ['F', 16], ['G', 14], ['H', 40]];

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      '<dimension ref="A1:H' + totalRow + '"/>' +
      '<sheetViews><sheetView workbookViewId="0">' +
        '<pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/>' +
        '<selection pane="bottomLeft" activeCell="A5" sqref="A5"/>' +
      '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      '<cols>' + cols.map((c) => '<col min="' + (colIndex(c[0]) + 1) + '" max="' + (colIndex(c[0]) + 1) + '" width="' + c[1] + '" customWidth="1"/>').join('') + '</cols>' +
      '<sheetData>' + rows.join('') + '</sheetData>' +
      '<autoFilter ref="A4:H' + Math.max(4, lastData) + '"/>' +
      '<mergeCells count="1"><mergeCell ref="A1:H1"/></mergeCells>' +
      '<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
      '<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>' +
      '</worksheet>';
  }

  /* ------------------------------ hoja resumen ------------------------------ */

  function buildSummarySheet(opt) {
    const cfg = opt.config || {};
    const daily = opt.daily || [];
    const rows = [];
    rows.push(rowXml(1, [cellText('A1', STYLE.title, 'RESUMEN DIARIO — ' + (cfg.empresa || ''))], 'ht="24" customHeight="1"'));
    rows.push(rowXml(2, [cellText('A2', STYLE.company, cfg.razonSocial || '')]));
    rows.push('<row r="3"/>');

    const headers = ['Fecha', 'Litros boba', 'Litros cargados', 'Diferencia', 'Cargas', 'Estado'];
    rows.push(rowXml(4, headers.map((h, i) => cellText(colLetter(i) + '4', STYLE.header, h)), 'ht="28" customHeight="1"'));

    let r = 5;
    let tb = 0, tc = 0, td = 0, tn = 0;
    daily.forEach((d) => {
      tb += d.boba || 0; tc += d.cargas || 0; td += d.diff || 0; tn += d.n || 0;
      rows.push(rowXml(r, [
        cellDate('A' + r, STYLE.date, d.fecha),
        cellNumber('B' + r, STYLE.number, d.boba),
        cellNumber('C' + r, STYLE.number, d.cargas),
        cellNumber('D' + r, STYLE.number, d.diff),
        cellNumber('E' + r, STYLE.number, d.n),
        cellText('F' + r, STYLE.centered, d.estado || '')
      ]));
      r++;
    });

    const lastData = r - 1;
    const totalRow = r;
    rows.push(rowXml(totalRow, [
      cellText('A' + totalRow, STYLE.totalLabel, 'TOTAL'),
      cellNumber('B' + totalRow, STYLE.totalNumber, tb),
      cellNumber('C' + totalRow, STYLE.totalNumber, tc),
      cellNumber('D' + totalRow, STYLE.totalNumber, td),
      cellNumber('E' + totalRow, STYLE.totalNumber, tn),
      cellText('F' + totalRow, STYLE.data, '')
    ]));

    const cols = [['A', 12], ['B', 14], ['C', 15], ['D', 14], ['E', 10], ['F', 22]];

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      '<dimension ref="A1:F' + totalRow + '"/>' +
      '<sheetViews><sheetView workbookViewId="0">' +
        '<pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/>' +
        '<selection pane="bottomLeft" activeCell="A5" sqref="A5"/>' +
      '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      '<cols>' + cols.map((c) => '<col min="' + (colIndex(c[0]) + 1) + '" max="' + (colIndex(c[0]) + 1) + '" width="' + c[1] + '" customWidth="1"/>').join('') + '</cols>' +
      '<sheetData>' + rows.join('') + '</sheetData>' +
      '<autoFilter ref="A4:F' + Math.max(4, lastData) + '"/>' +
      '<mergeCells count="1"><mergeCell ref="A1:F1"/></mergeCells>' +
      '<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
      '<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>' +
      '</worksheet>';
  }

  /* ------------------------------ build ------------------------------ */

  function build(opt) {
    const o = opt || {};
    const cfg = o.config || {};
    const charges = (o.charges || []).slice();
    const boba = (o.boba || []).slice();

    const chargeBy = {};
    const chargeByDate = {};
    charges.forEach((c) => {
      const k = c.fecha + '|' + c.turno;
      chargeBy[k] = (chargeBy[k] || 0) + (Number(c.litros) || 0);
      chargeByDate[c.fecha] = (chargeByDate[c.fecha] || 0) + (Number(c.litros) || 0);
    });

    const dates = Array.from(new Set(charges.map((c) => c.fecha).concat(boba.map((b) => b.fecha)).filter(Boolean))).sort();
    const from = o.desde || dates[0] || '';
    const to = o.hasta || dates[dates.length - 1] || '';
    const daily = [];
    if (from && to) {
      for (let d = from; d <= to; d = addDays(d, 1)) {
        const bAll = boba.filter((x) => x.fecha === d);
        const bDay = bAll.find((x) => x.turno === 'D');
        const bShifts = bAll.filter((x) => x.turno !== 'D');
        const bShiftsClosed = bShifts.filter((x) => x.litros != null);
        let bobaTotal = null;
        if (bDay && bDay.litros != null) bobaTotal = Number(bDay.litros);
        else if (bShiftsClosed.length) bobaTotal = bShifts.reduce((a, x) => a + (Number(x.litros) || 0), 0);
        const c = charges.filter((x) => x.fecha === d);
        const cargaTotal = c.reduce((a, x) => a + (Number(x.litros) || 0), 0);
        const tieneBoba = bobaTotal != null;
        const diff = tieneBoba ? bobaTotal - cargaTotal : null;
        let estado = 'Sin datos';
        if (tieneBoba && c.length) estado = Math.abs(diff) <= 1 ? 'Cuadra' : 'Diferencia';
        else if (tieneBoba) estado = 'Sin cargas';
        else if (bAll.length) estado = 'En curso';
        else if (c.length) estado = 'Sin boba';
        daily.push({ fecha: d, boba: tieneBoba ? bobaTotal : null, cargas: cargaTotal || null, diff: diff, n: c.length, estado: estado });
      }
    }

    const sheets = [
      { name: 'REPORTE DIESEL', xml: buildMainSheet({ config: cfg, charges: charges }) },
      { name: 'CUENTA LITROS', xml: buildBobaSheet({ config: cfg, boba: boba, chargesByDateTurno: chargeBy, chargesByDate: chargeByDate }) },
      { name: 'RESUMEN', xml: buildSummarySheet({ config: cfg, daily: daily }) }
    ];

    const files = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        '</Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
        '</Relationships>',
      'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets>' + sheets.map((s, i) => '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets>' +
        '</workbook>',
      'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
      'xl/styles.xml': stylesXml(),
      'docProps/core.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        '<dc:title>Reporte de diésel</dc:title><dc:creator>Control de diésel</dc:creator><dc:description>Bitácora de consumo de diésel</dc:description>' +
        '<dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString() + '</dcterms:created>' +
        '</cp:coreProperties>',
      'docProps/app.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
        '<Application>Control de diésel</Application></Properties>'
    };

    sheets.forEach((s, i) => { files['xl/worksheets/sheet' + (i + 1) + '.xml'] = s.xml; });

    // fflate exige Uint8Array; las cadenas se codifican aquí.
    const bin = {};
    Object.keys(files).forEach((k) => {
      const v = files[k];
      bin[k] = v instanceof Uint8Array ? v : enc.encode(String(v));
    });

    return F.zipSync(bin, { level: 6 });
  }

  /* ------------------------------ parse ------------------------------ */

  function attrs(tag) {
    const out = {};
    String(tag || '').replace(/([a-zA-Z0-9_:.-]+)\s*=\s*"([^"]*)"/g, (m, k, v) => {
      out[k] = unesc(v);
      return '';
    });
    return out;
  }

  function sharedStrings(files) {
    const xml = files['xl/sharedStrings.xml'] ? dec.decode(files['xl/sharedStrings.xml']) : '';
    const out = [];
    xml.replace(/<si\b[^>]*>([\s\S]*?)<\/si>/g, (m, inner) => {
      let t = '';
      inner.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, (mm, v) => { t += unesc(v); return ''; });
      out.push(t);
      return '';
    });
    return out;
  }

  function parseSheet(xml, shared) {
    const rows = [];
    const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
    let rm;
    while ((rm = rowRe.exec(xml))) {
      const ra = attrs(rm[1]);
      const rowNum = Number(ra.r);
      if (!rowNum) continue;
      const cells = {};
      const body = rm[2] || '';
      const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let cm;
      while ((cm = cellRe.exec(body))) {
        const ca = attrs(cm[1]);
        const ref = ca.r || '';
        const col = ref.replace(/\d+/g, '');
        if (!col) continue;
        const inner = cm[2] || '';
        let val = '';
        if (ca.t === 'inlineStr') {
          inner.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, (m, v) => { val += unesc(v); return ''; });
        } else if (ca.t === 's') {
          const mv = inner.match(/<v>([\s\S]*?)<\/v>/);
          if (mv) val = shared[Number(mv[1])];
        } else if (ca.t === 'str') {
          const mv = inner.match(/<v>([\s\S]*?)<\/v>/);
          if (mv) val = unesc(mv[1]);
        } else {
          const mv = inner.match(/<v>([\s\S]*?)<\/v>/);
          if (mv) val = unesc(mv[1]);
          else {
            inner.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, (m, v) => { val += unesc(v); return ''; });
          }
        }
        cells[col] = { value: val, type: ca.t || 'n', style: ca.s };
      }
      rows.push({ num: rowNum, cells: cells });
    }
    return rows.sort((a, b) => a.num - b.num);
  }

  function sheetList(files) {
    const wb = files['xl/workbook.xml'] ? dec.decode(files['xl/workbook.xml']) : '';
    const rels = files['xl/_rels/workbook.xml.rels'] ? dec.decode(files['xl/_rels/workbook.xml.rels']) : '';
    const map = {};
    rels.replace(/<Relationship\b([^>]*?)\/?>/g, (m, a) => {
      const o = attrs(a);
      if (o.Id && o.Target) {
        let target = o.Target.replace(/^\/+/, '');
        if (!/^xl\//.test(target)) target = 'xl/' + target.replace(/^\.\//, '');
        map[o.Id] = target;
      }
      return '';
    });
    const out = [];
    wb.replace(/<sheet\b([^>]*?)\/?>/g, (m, a) => {
      const o = attrs(a);
      const rid = o['r:id'] || o['relationshipId'];
      if (o.name) out.push({ name: o.name, path: map[rid] || '' });
      return '';
    });
    return out;
  }

  function normHeader(v) {
    return text(v).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function findHeader(rows, required) {
    for (const row of rows) {
      const map = {};
      Object.keys(row.cells).forEach((col) => {
        const key = normHeader(row.cells[col].value);
        if (key && map[key] === undefined) map[key] = col;
      });
      const ok = required.every((r) => {
        if (map[r]) return true;
        return Object.keys(map).some((k) => k.indexOf(r) === 0);
      });
      if (ok) return { row: row.num, map: map };
    }
    return null;
  }

  function getCell(row, col) {
    if (!col) return '';
    const c = row.cells[col];
    return c ? c.value : '';
  }

  function asDate(v) {
    if (v === null || v === undefined || v === '') return null;
    const s = String(v).trim();
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      if (n > 20000 && n < 80000) return serialToDate(n);
    }
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
      let d = +m[1], mo = +m[2], y = +m[3];
      if (y < 100) y += 2000;
      if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }
      if (y > 1900 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      }
    }
    return null;
  }

  function normTurno(v) {
    const s = String(text(v) || '').toLowerCase().trim();
    if (!s) return '';
    if (s === 'd' || s === 'dia' || s === 'día' || s === 'diario' || s === 'por dia' || s === 'por día') return 'D';
    if (/turno\s*d/.test(s) || /^d[ií]a\b/.test(s)) return 'D';
    const m = s.match(/([123])/);
    return m ? m[1] : '';
  }

  function parse(buffer) {
    if (!F) throw new Error('Falta el módulo de compresión (fflate).');
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let files;
    try { files = F.unzipSync(u8); }
    catch (e) { throw new Error('El archivo no es un Excel .xlsx válido.'); }

    // Normalizar rutas
    Object.keys(files).forEach((k) => {
      const nk = k.replace(/\\/g, '/');
      if (nk !== k) { files[nk] = files[k]; delete files[k]; }
    });

    const shared = sharedStrings(files);
    const sheets = sheetList(files);
    const warnings = [];
    let charges = [];
    let boba = [];
    let mainSheet = '';
    let bobaSheet = '';

    const parsedSheets = sheets.map((s) => {
      const xml = files[s.path] ? dec.decode(files[s.path]) : '';
      return { name: s.name, path: s.path, rows: xml ? parseSheet(xml, shared) : [] };
    }).filter((s) => s.rows.length);

    // Hoja principal: la que tenga Equipo + Fecha
    for (const s of parsedSheets) {
      const h = findHeader(s.rows, ['equipo', 'fecha']);
      if (!h) continue;
      const map = h.map;
      const col = (...names) => {
        for (const n of names) {
          if (map[n]) return map[n];
          const k = Object.keys(map).find((x) => x.indexOf(n) === 0);
          if (k) return map[k];
        }
        return '';
      };
      const cCat = col('categoria', 'category');
      const cEq = col('equipo', 'equipment');
      const cHor = col('horometro', 'horometer');
      const cFecha = col('fecha', 'date');
      const cT1 = col('turno 1', 'turno1', 't1');
      const cT2 = col('turno 2', 'turno2', 't2');
      const cT3 = col('turno 3', 'turno3', 't3');
      const cTotal = col('total turnos', 'total');
      const cDep = col('departamento', 'department');
      const cOp = col('operador', 'operator');
      const cResp = col('responsable', 'responsable', 'supervisor');
      const cFolio = col('folio');
      const cUbi = col('ubicacion t', 'ubicacion', 'location');
      if (!cEq || !cFecha) continue;

      mainSheet = s.name;
      s.rows.forEach((row) => {
        if (row.num <= h.row) return;
        const equipo = text(getCell(row, cEq));
        if (!equipo) return;
        if (/^total$/i.test(equipo)) return;
        const fecha = asDate(getCell(row, cFecha));
        if (!fecha) return;
        const cat = text(getCell(row, cCat));
        const horRaw = text(getCell(row, cHor));
        const hor = horRaw === '' ? null : (isFinite(Number(horRaw.replace(/,/g, ''))) ? Number(horRaw.replace(/,/g, '')) : horRaw);
        const dept = text(getCell(row, cDep));
        const oper = text(getCell(row, cOp));
        const resp = text(getCell(row, cResp));
        const folio = text(getCell(row, cFolio));
        const ubi = text(getCell(row, cUbi));
        const turnos = [
          ['1', num(getCell(row, cT1))],
          ['2', num(getCell(row, cT2))],
          ['3', num(getCell(row, cT3))]
        ];
        let any = false;
        turnos.forEach((t) => {
          const litros = t[1];
          if (litros != null && litros > 0) {
            any = true;
            charges.push({
              fecha: fecha,
              turno: t[0],
              categoria: cat,
              equipo: equipo,
              horometro: hor,
              litros: Math.round(litros * 1000) / 1000,
              departamento: dept,
              operador: oper,
              responsable: resp,
              folio: folio,
              ubicacion: ubi,
              notas: ''
            });
          }
        });
        if (!any) {
          const total = num(getCell(row, cTotal));
          if (total != null && total > 0) {
            charges.push({
              fecha: fecha,
              turno: '1',
              categoria: cat,
              equipo: equipo,
              horometro: hor,
              litros: Math.round(total * 1000) / 1000,
              departamento: dept,
              operador: oper,
              responsable: resp,
              folio: folio,
              ubicacion: ubi,
              notas: 'Importado de Total Turnos'
            });
            warnings.push('Fila ' + row.num + ': sin litros por turno; se usó Total Turnos (' + total + ' L).');
          }
        }
      });
      break;
    }

    // Hoja de cuenta litros (si existe)
    for (const s of parsedSheets) {
      if (s.name === mainSheet) continue;
      const h = findHeader(s.rows, ['fecha', 'turno']);
      if (!h) continue;
      const map = h.map;
      const col = (...names) => {
        for (const n of names) {
          if (map[n]) return map[n];
          const k = Object.keys(map).find((x) => x.indexOf(n) === 0);
          if (k) return map[k];
        }
        return '';
      };
      const cFecha = col('fecha', 'date');
      const cTurno = col('turno', 'shift');
      const cIni = col('lectura inicial', 'inicial', 'inicio', 'lectura inicio');
      const cFin = col('lectura final', 'final', 'fin', 'lectura fin');
      const cLit = col('litros boba', 'litros');
      const cNotas = col('notas', 'observaciones');
      if (!cIni || !cFin) continue;
      bobaSheet = s.name;
      s.rows.forEach((row) => {
        if (row.num <= h.row) return;
        const fecha = asDate(getCell(row, cFecha));
        const turno = normTurno(getCell(row, cTurno));
        if (!fecha || !turno) return;
        const ini = num(getCell(row, cIni));
        const fin = num(getCell(row, cFin));
        if (ini == null && fin == null) return;
        const lit = num(getCell(row, cLit));
        boba.push({
          fecha: fecha,
          turno: turno,
          inicial: ini,
          final: fin,
          litros: lit,
          notas: text(getCell(row, cNotas))
        });
      });
      break;
    }

    // Deduplicar boba por fecha+turno (por si hay filas repetidas)
    const bobaMap = new Map();
    boba.forEach((b) => {
      const k = b.fecha + '|' + b.turno;
      if (!bobaMap.has(k)) bobaMap.set(k, b);
    });
    boba = Array.from(bobaMap.values()).sort((a, b) =>
      String(a.fecha).localeCompare(String(b.fecha)) || String(a.turno).localeCompare(String(b.turno)));

    if (!mainSheet && !bobaSheet) throw new Error('No se encontró la hoja "REPORTE DIESEL" ni una hoja de cuenta litros con encabezados reconocibles.');

    const dates = charges.map((c) => c.fecha).concat(boba.map((b) => b.fecha)).filter(Boolean).sort();
    const litrosCargas = charges.reduce((a, c) => a + c.litros, 0);
    const litrosBoba = boba.reduce((a, b) => {
      const l = b.litros != null ? Number(b.litros) : null;
      return a + (l != null ? l : 0);
    }, 0);

    return {
      charges: charges,
      boba: boba,
      meta: {
        mainSheet: mainSheet,
        bobaSheet: bobaSheet,
        sheets: sheets.map((s) => s.name),
        rows: charges.length,
        bobaRows: boba.length,
        desde: dates[0] || '',
        hasta: dates[dates.length - 1] || '',
        litrosCargas: Math.round(litrosCargas * 1000) / 1000,
        litrosBoba: Math.round(litrosBoba * 1000) / 1000,
        warnings: warnings.slice(0, 20)
      }
    };
  }

  /* ------------------------------ descarga ------------------------------ */

  function download(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  function filename(desde, hasta) {
    const a = desde || 'inicio';
    const b = hasta || 'fin';
    return 'REPORTE_DIESEL_' + a + '_a_' + b + '.xlsx';
  }

  /* ------------------------------ utilidades internas ------------------------------ */

  function addDays(iso, n) {
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    d.setUTCDate(d.getUTCDate() + n);
    const p = (x) => String(x).padStart(2, '0');
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  }

  return {
    build: build,
    parse: parse,
    download: download,
    filename: filename,
    dateToSerial: dateToSerial,
    serialToDate: serialToDate
  };
})();
