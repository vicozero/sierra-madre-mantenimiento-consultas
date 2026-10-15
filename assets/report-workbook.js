/* Generador OOXML del reporte de mantenimiento para Excel. */
(function (root) {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]);
  const colName = index => {
    let n = index + 1, out = '';
    while (n) { const rem = (n - 1) % 26; out = String.fromCharCode(65 + rem) + out; n = Math.floor((n - 1) / 26); }
    return out;
  };
  const xmlText = value => `<t xml:space="preserve">${esc(value)}</t>`;

  function cellXml(value, ref, style = 0) {
    const styleAttr = style ? ` s="${style}"` : '';
    if (value === null || value === undefined || value === '') return `<c r="${ref}"${styleAttr}/>`;
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${styleAttr}><is>${xmlText(value)}</is></c>`;
  }

  function worksheetXml(rows, options = {}) {
    const cols = options.widths || [];
    const sheetRows = rows.map((row, ri) => {
      const cells = row.map((cell, ci) => {
        const value = cell && typeof cell === 'object' && Object.hasOwn(cell, 'value') ? cell.value : cell;
        const style = cell && typeof cell === 'object' && Object.hasOwn(cell, 'style') ? cell.style : 0;
        return cellXml(value, `${colName(ci)}${ri + 1}`, style);
      }).join('');
      return `<row r="${ri + 1}" ht="${ri === 0 ? 30 : 21}" customHeight="1">${cells}</row>`;
    }).join('');
    const widthXml = cols.length ? `<cols>${cols.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>` : '';
    const merges = (options.merges || []).length ? `<mergeCells count="${options.merges.length}">${options.merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>` : '';
    const filter = options.autoFilter ? `<autoFilter ref="${options.autoFilter}"/>` : '';
    const frozen = options.frozenRows ? `<sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="${options.frozenRows}" topLeftCell="A${options.frozenRows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${options.frozenRows + 1}" sqref="A${options.frozenRows + 1}"/></sheetView></sheetViews>` : '<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>';
    const drawing = options.drawing ? '<drawing r:id="rId1"/>' : '';
    const dimension = `A1:${colName(Math.max(0, ...rows.map(row => row.length)) - 1)}${Math.max(rows.length, 1)}`;
    const setup = '<pageMargins left="0.25" right="0.25" top="0.45" bottom="0.45" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/>';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="${dimension}"/>${frozen}<sheetFormatPr defaultRowHeight="21"/>${widthXml}<sheetData>${sheetRows}</sheetData>${filter}${merges}${setup}${drawing}</worksheet>`;
  }

  function stylesXml() {
    const xfs = [
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="left" indent="1"/></xf>',
      '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="left" indent="1"/></xf>',
      '<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="center" wrapText="1"/></xf>',
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>',
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>',
      '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>',
      '<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>',
      '<xf numFmtId="0" fontId="5" fillId="4" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>',
      '<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>'
    ].join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.0;[Red]-#,##0.0;–"/><numFmt numFmtId="165" formatCode="0.0%"/><numFmt numFmtId="166" formatCode="#,##0"/></numFmts><fonts count="6"><font><sz val="10"/><name val="Aptos"/><color rgb="FF17395D"/></font><font><b/><sz val="19"/><name val="Aptos Display"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="10"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="9"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="10"/><name val="Aptos"/><color rgb="FF17395D"/></font><font><i/><sz val="9"/><name val="Aptos"/><color rgb="FF55718D"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF092744"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCEBFA"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F6FC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDCE7F3"/></left><right style="thin"><color rgb="FFDCE7F3"/></right><top style="thin"><color rgb="FFDCE7F3"/></top><bottom style="thin"><color rgb="FFDCE7F3"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }

  function chartTitleXml(title) {
    return `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr lang="es-MX" sz="1400" b="1"><a:solidFill><a:srgbClr val="092744"/></a:solidFill><a:latin typeface="Aptos"/></a:defRPr></a:pPr><a:r><a:rPr lang="es-MX" sz="1400" b="1"/><a:t>${esc(title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
  }

  function chartXml({ title, col, firstRow, lastRow, values, families }) {
    const axis = col === 'D' ? 610001 : 610101;
    const valAxis = axis + 1;
    const nameRef = `'Resumen'!$${col}$6`;
    const valuesRef = `'Resumen'!$${col}$${firstRow}:$${col}$${lastRow}`;
    const categoriesRef = `'Resumen'!$A$${firstRow}:$A$${lastRow}`;
    const pts = values.map((v, i) => Number.isFinite(v) ? `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>` : '').join('');
    const cats = families.map((name, i) => `<c:pt idx="${i}"><c:v>${esc(name)}</c:v></c:pt>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:lang val="es-MX"/><c:chart>${chartTitleXml(title)}<c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>${nameRef}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${esc(title)}</c:v></c:pt></c:strCache></c:strRef></c:tx><c:spPr><a:solidFill><a:srgbClr val="${col === 'D' ? '20A875' : '1476DF'}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:cat><c:strRef><c:f>${categoriesRef}</c:f><c:strCache><c:ptCount val="${families.length}"/>${cats}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>${valuesRef}</c:f><c:numCache><c:formatCode>0.0%</c:formatCode><c:ptCount val="${values.length}"/>${pts}</c:numCache></c:numRef></c:val><c:dLbls><c:showVal val="1"/><c:numFmt formatCode="0.0%" sourceLinked="0"/></c:dLbls></c:ser><c:gapWidth val="70"/><c:overlap val="0"/><c:axId val="${axis}"/><c:axId val="${valAxis}"/></c:barChart><c:catAx><c:axId val="${axis}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:tickLblPos val="nextTo"/><c:crossAx val="${valAxis}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx><c:valAx><c:axId val="${valAxis}"/><c:scaling><c:orientation val="minMax"/><c:max val="1"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E2EAF3"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="0%" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${axis}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/><c:showDLblsOverMax val="0"/></c:chart></c:chartSpace>`;
  }

  function drawingXml(chartCount, topRow) {
    const anchors = Array.from({ length: chartCount }, (_, i) => {
      const leftCol = i === 0 ? 0 : 7, rightCol = i === 0 ? 7 : 14;
      return `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${leftCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${topRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${rightCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${topRow + 15}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="${i ? 'Utilización por familia' : 'Disponibilidad por familia'}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors}</xdr:wsDr>`;
  }

  function chartRelationshipXml(count) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from({ length: count }, (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${i + 1}.xml"/>`).join('')}</Relationships>`;
  }

  function drawingRelationshipXml(count) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from({ length: count }, (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${i + 1}.xml"/>`).join('')}</Relationships>`;
  }

  function coreWorkbookXml(names) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="18000" windowHeight="11200"/></bookViews><sheets>${names.map((name, i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029"/></workbook>`;
  }

  function workbookRelsXml(sheetCount) {
    const sheetRels = Array.from({ length: sheetCount }, (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  }

  function sheetRelsXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>';
  }

  function contentTypesXml(sheetCount, chartCount) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${Array.from({ length: sheetCount }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}${chartCount ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}${Array.from({ length: chartCount }, (_, i) => `<Override PartName="/xl/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('')}</Types>`;
  }

  function packageParts(zip, sheets, charts) {
    const names = sheets.map(sheet => sheet.name);
    zip.file('[Content_Types].xml', contentTypesXml(sheets.length, charts.length));
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.file('xl/workbook.xml', coreWorkbookXml(names));
    zip.file('xl/_rels/workbook.xml.rels', workbookRelsXml(sheets.length));
    zip.file('xl/styles.xml', stylesXml());
    sheets.forEach((sheet, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, worksheetXml(sheet.rows, { ...sheet.options, drawing: i === 0 && charts.length > 0 })));
    if (charts.length) {
      zip.file('xl/worksheets/_rels/sheet1.xml.rels', sheetRelsXml());
      zip.file('xl/drawings/drawing1.xml', drawingXml(charts.length, charts[0].topRow));
      zip.file('xl/drawings/_rels/drawing1.xml.rels', drawingRelationshipXml(charts.length));
      charts.forEach((chart, i) => zip.file(`xl/charts/chart${i + 1}.xml`, chartXml(chart)));
    }
  }

  function reportRows({ label, range, asOf, families, kpiDetails, bitacora, calendar, weeklyNote }) {
    const header = ['Familia', 'Equipos', 'Cortes KPI', 'Disponibilidad', 'Utilización', 'Horas trabajadas', 'Horas MP', 'Horas MC', 'Paros', 'TMEF (h)', 'TMPR (h)'];
    const summary = [
      [{ value: 'SIERRA MADRE · REPORTE DE MANTENIMIENTO', style: 1 }],
      [{ value: `${label} · ${range}`, style: 2 }],
      [{ value: `Corte de información: ${asOf || '—'} · Generado: ${new Date().toLocaleString('es-MX')}`, style: 8 }],
      [{ value: weeklyNote || 'Indicadores calculados con los cortes KPI publicados para el periodo. Horas y paros se presentan según registros exportados.', style: 8 }],
      [],
      header.map((value, index) => ({ value, style: 3 })),
      ...families.map(family => [
        { value: family.family, style: 7 }, { value: family.equipment, style: 9 }, { value: family.cuts, style: 9 },
        { value: family.availability === null ? '' : family.availability / 100, style: 6 }, { value: family.utilization === null ? '' : family.utilization / 100, style: 6 },
        { value: family.worked, style: 5 }, { value: family.mp, style: 5 }, { value: family.mc, style: 5 },
        { value: family.stops, style: 9 }, { value: family.tmef ?? '', style: 5 }, { value: family.tmpr ?? '', style: 5 }
      ])
    ];
    const chartTop = Math.max(summary.length + 2, 12);
    if (!families.length) summary.push([{ value: 'Sin registros KPI para representar en gráficas en este periodo.', style: 8 }]);
    const familyRows = [
      [{ value: 'SIERRA MADRE · KPI POR EQUIPO', style: 1 }],
      [{ value: `${label} · ${range}`, style: 2 }],
      [{ value: weeklyNote || 'Los valores provienen de cortes KPI del programa.', style: 8 }],
      [],
      ['Fecha del corte', 'Equipo', 'Descripción', 'Familia', 'Disponibilidad', 'Utilización', 'Horas trabajadas', 'Horas MP', 'Horas MC', 'Paros', 'TMEF (h)', 'TMPR (h)', 'Estado'].map(value => ({ value, style: 3 })),
      ...kpiDetails.map(row => [row.date || '', row.equipment || '', { value: row.description || '', style: 4 }, { value: row.family || 'Sin familia', style: 4 }, numVal(row.availability, true), numVal(row.utilization, true), numVal(row.worked_hours), numVal(row.mp_hours), numVal(row.mc_hours), numVal(row.stops), numVal(row.tmef), numVal(row.tmpr), row.status || ''].map((cell, index) => cell && typeof cell === 'object' ? cell : ({ value: cell, style: index <= 1 || index === 12 ? 4 : 5 })))
    ];
    const logs = [
      [{ value: 'SIERRA MADRE · BITÁCORA OPERATIVA', style: 1 }],
      [{ value: `${label} · ${range}`, style: 2 }],
      [{ value: 'Registro por fecha y turno; no se completa información no publicada.', style: 8 }],
      [],
      ['Fecha', 'Equipo', 'Descripción', 'Familia', 'Turno', 'Componente', 'HI', 'HF', 'Horas trabajadas', 'Horas MP', 'Horas MC', 'Stand by (h)', 'Paros', 'Estado'].map(value => ({ value, style: 3 })),
      ...bitacora.map(row => [row.date || '', row.equipment || '', row.description || '', row.family || '', row.shift || '', row.component || '', numVal(row.hi), numVal(row.hf), numVal(row.worked_hours), numVal(row.mp_hours), numVal(row.mc_hours), numVal(row.standby_hours), numVal(row.stops), row.status || ''].map((cell, index) => cell && typeof cell === 'object' ? cell : ({ value: cell, style: index <= 5 || index === 13 ? 4 : 5 })))
    ];
    const services = [
      [{ value: 'SIERRA MADRE · CALENDARIO DE SERVICIOS', style: 1 }],
      [{ value: `${label} · ${range}`, style: 2 }],
      [{ value: 'Servicios con fecha programada, estimada o realizada dentro del periodo.', style: 8 }],
      [],
      ['Fecha', 'Equipo', 'Descripción', 'Familia', 'Servicio', 'Origen', 'Medidor actual', 'Objetivo', 'Unidad', 'Estado'].map(value => ({ value, style: 3 })),
      ...calendar.map(row => [row.date || '', row.equipment || '', row.description || '', row.family || '', row.service || '', row.type || '', numVal(row.meter), numVal(row.target), row.unit || '', row.status || ''].map((cell, index) => cell && typeof cell === 'object' ? cell : ({ value: cell, style: index <= 5 || index >= 8 ? 4 : 5 })))
    ];
    return {
      chartTop,
      sheets: [
        { name: 'Resumen', rows: summary, options: { widths: [29, 12, 12, 17, 16, 19, 14, 14, 12, 13, 13], merges: ['A1:K1', 'A2:K2', 'A3:K3', 'A4:K4'], frozenRows: 6 } },
        { name: 'KPI por equipo', rows: familyRows, options: { widths: [15, 15, 34, 26, 16, 15, 18, 13, 13, 10, 13, 13, 22], merges: ['A1:M1', 'A2:M2', 'A3:M3'], frozenRows: 5, autoFilter: familyRows.length > 5 ? `A5:M${familyRows.length}` : '' } },
        { name: 'Bitácora', rows: logs, options: { widths: [15, 15, 32, 24, 12, 20, 13, 13, 17, 12, 12, 15, 10, 22], merges: ['A1:N1', 'A2:N2', 'A3:N3'], frozenRows: 5, autoFilter: logs.length > 5 ? `A5:N${logs.length}` : '' } },
        { name: 'Calendario', rows: services, options: { widths: [15, 15, 32, 24, 30, 24, 16, 16, 14, 18], merges: ['A1:J1', 'A2:J2', 'A3:J3'], frozenRows: 5, autoFilter: services.length > 5 ? `A5:J${services.length}` : '' } }
      ]
    };
  }

  function numVal(value, percent = false) {
    if (value === null || value === undefined || value === '') return '';
    const number = Number(value);
    return Number.isFinite(number) ? (percent ? { value: number / 100, style: 6 } : { value: number, style: 5 }) : '';
  }

  async function createReport(config) {
    if (!root.JSZip) throw new Error('No se pudo cargar el generador de archivos Excel. Recarga la página e inténtalo de nuevo.');
    const { label, range, asOf, families, kpiDetails, bitacora, calendar, weeklyNote } = config;
    const prepared = reportRows({ label, range, asOf, families, kpiDetails, bitacora, calendar, weeklyNote });
    const kpiFamilies = families.filter(row => row.availability !== null || row.utilization !== null);
    const charts = kpiFamilies.length ? [
      { title: 'Disponibilidad por familia', col: 'D', firstRow: 7, lastRow: 6 + families.length, values: families.map(row => row.availability === null ? null : row.availability / 100), families: families.map(row => row.family), topRow: prepared.chartTop - 1 },
      { title: 'Utilización por familia', col: 'E', firstRow: 7, lastRow: 6 + families.length, values: families.map(row => row.utilization === null ? null : row.utilization / 100), families: families.map(row => row.family), topRow: prepared.chartTop - 1 }
    ] : [];
    const zip = new root.JSZip();
    packageParts(zip, prepared.sheets, charts);
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    return { blob, chartCount: charts.length, kpiFamilyCount: kpiFamilies.length };
  }

  root.SierraExcelReport = { createReport };
})(typeof window !== 'undefined' ? window : globalThis);
