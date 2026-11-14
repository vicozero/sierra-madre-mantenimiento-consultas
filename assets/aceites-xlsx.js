/* =============================================================
   AceitesXLSX — lectura y escritura de Excel (.xlsx) para aceites
   - Importa/exporta el formato "REPORTE ACEITES" (bitácora de
     consumo de aceites y lubricantes): Fecha, Equipo, Descripción,
     Horometro, Tipo de aceite, Compartimento, Motivo, Litros,
     Precio/L, Importe, Mecánico, Responsable, Folio / orden.
   - Soporta cuenta litros del despacho por producto (Motor Shell /
     Hidráulico Shell) en hoja "CUENTA LITROS" (exportada e importada).
   - Sin dependencias externas salvo fflate (ZIP), incluido local.
   ============================================================= */
window.AceitesXLSX = (function () {
  'use strict';

  const F = window.fflate;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
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
    let n = index + 1, out = '';
    while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
    return out;
  }
  function colIndex(letters) {
    let n = 0; for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64); return n - 1;
  }
  function numXml(v) { const n = Number(v); if (!isFinite(n)) return '0'; return String(Math.round(n * 1e6) / 1e6); }
  function dateToSerial(iso) {
    const m = String(iso || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000);
  }
  function serialToDate(serial) {
    const n = Number(serial); if (!isFinite(n)) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    if (isNaN(d.getTime())) return null;
    const p = (x) => String(x).padStart(2, '0');
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  }
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/,/g, '').trim());
    return isFinite(n) ? n : null;
  }
  function text(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function addDays(iso, n) {
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    d.setUTCDate(d.getUTCDate() + n);
    const p = (x) => String(x).padStart(2, '0');
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  }

  const STYLE = { normal:0, title:1, company:2, subtitle:3, header:4, data:5, number:6, date:7, totalLabel:8, totalNumber:9, centered:10, note:11 };

  function stylesXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="3">' +
        '<numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>' +
        '<numFmt numFmtId="165" formatCode="#,##0.0"/>' +
        '<numFmt numFmtId="166" formatCode="#,##0.00"/>' +
      '</numFmts>' +
      '<fonts count="5">' +
        '<font><sz val="11"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="10"/><name val="Calibri"/></font>' +
        '<font><sz val="10"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="14"/><color rgb="FF0F2A43"/><name val="Calibri"/></font>' +
        '<font><b/><sz val="11"/><color rgb="FF0F2A43"/><name val="Calibri"/></font>' +
      '</fonts>' +
      '<fills count="5">' +
        '<fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor indexed="64"/></patternFill></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill>' +
      '</fills>' +
      '<borders count="2">' +
        '<border><left/><right/><top/><bottom/><diagonal/></border>' +
        '<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>' +
      '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="12">' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' + //0 normal
        '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' + //1 title
        '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' + //2 company
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' + //3 subtitle
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + //4 header
        '<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' + //5 data
        '<xf numFmtId="165" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' + //6 number
        '<xf numFmtId="164" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + //7 date
        '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + //8 totalLabel
        '<xf numFmtId="165" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' + //9 totalNumber
        '<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + //10 centered
        '<xf numFmtId="166" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' + //11 money
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  function cellText(ref, style, value) {
    if (value === null || value === undefined || value === '') return '<c r="' + ref + '" s="' + style + '"/>';
    return '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' + esc(value) + '</t></is></c>';
  }
  function cellNumber(ref, style, value) {
    if (value === null || value === undefined || value === '' || !isFinite(Number(value))) return '<c r="' + ref + '" s="' + style + '"/>';
    return '<c r="' + ref + '" s="' + style + '"><v>' + numXml(value) + '</v></c>';
  }
  function cellDate(ref, style, iso) {
    const serial = dateToSerial(iso);
    if (serial === null) return '<c r="' + ref + '" s="' + style + '"/>';
    return '<c r="' + ref + '" s="' + style + '"><v>' + serial + '</v></c>';
  }
  function rowXml(num, cells, attrs) { return '<row r="' + num + '"' + (attrs ? ' ' + attrs : '') + '>' + cells.join('') + '</row>'; }

  function canonProducto(v) {
    const s = norm(v);
    if (!s) return '';
    if (s.indexOf('motor') !== -1) return 'Motor Shell';
    if (s.indexOf('hidraul') !== -1 || s.indexOf('spirax') !== -1) return 'Hidráulico Shell';
    return text(v);
  }

  /* ------------------------------ build main sheet ------------------------------ */
  function buildMainSheet(opt) {
    const cfg = opt.config || {};
    const dispatches = (opt.dispatches || []).slice().sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)) || String(a.equipo||'').localeCompare(String(b.equipo||'')) || String(a.creado||'').localeCompare(String(b.creado||'')));
    const rows = [];
    rows.push('<row r="1"/>');
    rows.push(rowXml(2, [cellText('C2', STYLE.title, cfg.empresa || 'SIERRA MADRE GOLD & SILVER')]));
    rows.push('<row r="3"/>');
    rows.push(rowXml(4, [cellText('C4', STYLE.company, cfg.razonSocial || 'LA GUITARRA COMPAÑÍA MINERA SA DE CV.')]));
    rows.push('<row r="5"/>');
    rows.push(rowXml(6, [cellText('C6', STYLE.subtitle, cfg.tituloAceites || 'BITACORA CONSUMO DE ACEITES Y LUBRICANTES · EQUIPO DIESEL MINA, PLANTA Y VEHICULOS LIGEROS.')]));
    rows.push('<row r="7"/>');
    const headers = ['Fecha','Equipo','Descripción','Horometro','Tipo de aceite','Compartimento','Motivo','Litros','Precio/L','Importe','Mecánico','Responsable','Folio / orden'];
    rows.push(rowXml(8, headers.map((h,i)=>cellText(colLetter(i+1)+'8', STYLE.header, h)), 'ht="28" customHeight="1"'));

    let r = 9;
    let totalLitros = 0, totalImporte = 0;
    dispatches.forEach((d) => {
      const litros = d.litros == null ? null : Number(d.litros);
      const precio = d.precio == null ? null : Number(d.precio);
      const importe = d.importe == null ? (litros != null && precio != null ? Math.round(litros*precio*100)/100 : null) : Number(d.importe);
      if (litros != null) totalLitros += litros;
      if (importe != null) totalImporte += importe;
      const hor = d.horometro;
      rows.push(rowXml(r, [
        cellDate('B'+r, STYLE.date, d.fecha),
        cellText('C'+r, STYLE.data, d.equipo || ''),
        cellText('D'+r, STYLE.data, d.descripcion || ''),
        (hor === null || hor === undefined || hor === '' || isFinite(Number(hor))) ? cellNumber('E'+r, STYLE.number, hor) : cellText('E'+r, STYLE.centered, hor),
        cellText('F'+r, STYLE.data, d.tipoAceite || ''),
        cellText('G'+r, STYLE.data, d.compartimento || ''),
        cellText('H'+r, STYLE.data, d.motivo || ''),
        cellNumber('I'+r, STYLE.number, litros),
        cellNumber('J'+r, STYLE.number, precio),
        cellNumber('K'+r, STYLE.number, importe),
        cellText('L'+r, STYLE.data, d.mecanico || ''),
        cellText('M'+r, STYLE.data, d.responsable || ''),
        cellText('N'+r, STYLE.centered, d.folio || '')
      ]));
      r++;
    });
    const lastData = r - 1;
    const totalRow = r;
    rows.push(rowXml(totalRow, [
      cellText('B'+totalRow, STYLE.data, ''),
      cellText('C'+totalRow, STYLE.data, ''),
      cellText('D'+totalRow, STYLE.data, ''),
      cellText('E'+totalRow, STYLE.data, ''),
      cellText('F'+totalRow, STYLE.data, ''),
      cellText('G'+totalRow, STYLE.data, ''),
      cellText('H'+totalRow, STYLE.totalLabel, 'TOTAL SALIDAS'),
      cellNumber('I'+totalRow, STYLE.totalNumber, totalLitros),
      cellText('J'+totalRow, STYLE.data, ''),
      cellNumber('K'+totalRow, STYLE.totalNumber, totalImporte || 0),
      cellText('L'+totalRow, STYLE.data, ''),
      cellText('M'+totalRow, STYLE.data, ''),
      cellText('N'+totalRow, STYLE.data, '')
    ]));

    const cols = [['A',3],['B',12],['C',14],['D',34],['E',12],['F',30],['G',22],['H',28],['I',10],['J',10],['K',12],['L',24],['M',24],['N',16]];
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      '<dimension ref="A1:N'+totalRow+'"/>' +
      '<sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane ySplit="8" topLeftCell="A9" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A9" sqref="A9"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      '<cols>' + cols.map(c=>'<col min="'+(colIndex(c[0])+1)+'" max="'+(colIndex(c[0])+1)+'" width="'+c[1]+'" customWidth="1"/>').join('') + '</cols>' +
      '<sheetData>' + rows.join('') + '</sheetData>' +
      '<autoFilter ref="B8:N'+Math.max(8,lastData)+'"/>' +
      '<mergeCells count="1"><mergeCell ref="C6:N6"/></mergeCells>' +
      '<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
      '<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>' +
      '</worksheet>';
  }

  /* ------------------------------ cuenta litros sheet ------------------------------ */
  function buildBobaSheet(opt) {
    const cfg = opt.config || {};
    const meters = (opt.meters || []).slice().sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)) || String(a.producto||'').localeCompare(String(b.producto||'')));
    const salidaBy = opt.salidaBy || {}; // key fecha|producto
    const rows = [];
    rows.push(rowXml(1, [cellText('A1', STYLE.title, 'CUENTA LITROS ACEITES — ' + (cfg.empresa || ''))], 'ht="22" customHeight="1"'));
    rows.push(rowXml(2, [cellText('A2', STYLE.company, cfg.razonSocial || '')]));
    rows.push('<row r="3"/>');
    const headers = ['Fecha','Producto','Lectura inicial','Lectura final','Litros (cuenta litros)','Litros salidas','Diferencia','Notas'];
    rows.push(rowXml(4, headers.map((h,i)=>cellText(colLetter(i)+'4', STYLE.header, h)), 'ht="28" customHeight="1"'));
    let r=5, sb=0, ss=0, sd=0;
    meters.forEach(m=>{
      const prod = canonProducto(m.producto) || m.producto || '';
      const key = m.fecha + '|' + prod;
      const salidas = Number(salidaBy[key] || 0);
      const litros = m.litros == null ? null : Number(m.litros);
      const diff = litros == null ? null : litros - salidas;
      if (litros != null) sb += litros; ss += salidas; if (diff != null) sd += diff;
      rows.push(rowXml(r, [
        cellDate('A'+r, STYLE.date, m.fecha),
        cellText('B'+r, STYLE.centered, prod),
        cellNumber('C'+r, STYLE.number, m.inicial),
        cellNumber('D'+r, STYLE.number, m.final),
        cellNumber('E'+r, STYLE.number, litros),
        cellNumber('F'+r, STYLE.number, salidas),
        cellNumber('G'+r, STYLE.number, diff),
        cellText('H'+r, STYLE.data, m.notas || '')
      ]));
      r++;
    });
    const lastData=r-1, totalRow=r;
    rows.push(rowXml(totalRow, [cellText('A'+totalRow,STYLE.totalLabel,'TOTAL'), cellText('B'+totalRow,STYLE.data,''), cellText('C'+totalRow,STYLE.data,''), cellText('D'+totalRow,STYLE.data,''), cellNumber('E'+totalRow,STYLE.totalNumber,sb), cellNumber('F'+totalRow,STYLE.totalNumber,ss), cellNumber('G'+totalRow,STYLE.totalNumber,sd), cellText('H'+totalRow,STYLE.data,'')]));
    const cols=[['A',12],['B',22],['C',16],['D',16],['E',18],['F',16],['G',14],['H',36]];
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      '<dimension ref="A1:H'+totalRow+'"/>' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A5" sqref="A5"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      '<cols>'+cols.map(c=>'<col min="'+(colIndex(c[0])+1)+'" max="'+(colIndex(c[0])+1)+'" width="'+c[1]+'" customWidth="1"/>').join('')+'</cols>' +
      '<sheetData>'+rows.join('')+'</sheetData>' +
      '<autoFilter ref="A4:H'+Math.max(4,lastData)+'"/>' +
      '<mergeCells count="1"><mergeCell ref="A1:H1"/></mergeCells>' +
      '<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
      '<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>';
  }

  function build(opt) {
    const o = opt || {};
    const cfg = o.config || {};
    const dispatches = (o.dispatches || []).slice();
    const meters = (o.meters || []).slice();
    const salidaBy = {};
    dispatches.forEach(d=>{
      const prod = canonProducto(d.tipoAceite);
      if (!prod) return;
      const k = d.fecha + '|' + prod;
      salidaBy[k] = (salidaBy[k] || 0) + (Number(d.litros)||0);
    });
    const sheets = [
      { name: 'REPORTE ACEITES', xml: buildMainSheet({ config: cfg, dispatches }) },
      { name: 'CUENTA LITROS', xml: buildBobaSheet({ config: cfg, meters, salidaBy }) }
    ];
    const files = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets.map((s,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        '</Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>',
      'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map((s,i)=>'<sheet name="'+esc(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('') + '</sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((s,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('') + '<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml': stylesXml(),
      'docProps/core.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Reporte de aceites</dc:title><dc:creator>Control de aceites</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">'+new Date().toISOString()+'</dcterms:created></cp:coreProperties>',
      'docProps/app.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Control de aceites</Application></Properties>'
    };
    sheets.forEach((s,i)=>{ files['xl/worksheets/sheet'+(i+1)+'.xml']=s.xml; });
    const bin={}; Object.keys(files).forEach(k=>{ const v=files[k]; bin[k]=v instanceof Uint8Array ? v : enc.encode(String(v)); });
    return F.zipSync(bin,{level:6});
  }

  /* ------------------------------ parse ------------------------------ */
  function attrs(tag){ const out={}; String(tag||'').replace(/([a-zA-Z0-9_:.-]+)\s*=\s*"([^"]*)"/g,(m,k,v)=>{out[k]=unesc(v); return '';}); return out; }
  function sharedStrings(files){
    const xml = files['xl/sharedStrings.xml'] ? dec.decode(files['xl/sharedStrings.xml']) : '';
    const out=[]; xml.replace(/<si\b[^>]*>([\s\S]*?)<\/si>/g,(m,inner)=>{ let t=''; inner.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g,(mm,v)=>{t+=unesc(v);return '';}); out.push(t); return ''; }); return out;
  }
  function parseSheet(xml, shared){
    const rows=[]; const rowRe=/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g; let rm;
    while((rm=rowRe.exec(xml))){
      const ra=attrs(rm[1]); const rowNum=Number(ra.r); if(!rowNum) continue;
      const cells={}; const body=rm[2]||''; const cellRe=/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let cm;
      while((cm=cellRe.exec(body))){
        const ca=attrs(cm[1]); const ref=ca.r||''; const col=ref.replace(/\d+/g,''); if(!col) continue;
        const inner=cm[2]||''; let val='';
        if(ca.t==='inlineStr'){ inner.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g,(m,v)=>{val+=unesc(v);return '';}); }
        else if(ca.t==='s'){ const mv=inner.match(/<v>([\s\S]*?)<\/v>/); if(mv) val=shared[Number(mv[1])]; }
        else if(ca.t==='str'){ const mv=inner.match(/<v>([\s\S]*?)<\/v>/); if(mv) val=unesc(mv[1]); }
        else { const mv=inner.match(/<v>([\s\S]*?)<\/v>/); if(mv) val=unesc(mv[1]); else { inner.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g,(m,v)=>{val+=unesc(v);return '';}); } }
        cells[col]={ value: val, type: ca.t||'n', style: ca.s };
      }
      rows.push({ num: rowNum, cells });
    }
    return rows.sort((a,b)=>a.num-b.num);
  }
  function sheetList(files){
    const wb=files['xl/workbook.xml']?dec.decode(files['xl/workbook.xml']):''; const rels=files['xl/_rels/workbook.xml.rels']?dec.decode(files['xl/_rels/workbook.xml.rels']):'';
    const map={}; rels.replace(/<Relationship\b([^>]*?)\/?>/g,(m,a)=>{ const o=attrs(a); if(o.Id&&o.Target){ let target=o.Target.replace(/^\/+/, ''); if(!/^xl\//.test(target)) target='xl/'+target.replace(/^\.\//,''); map[o.Id]=target; } return ''; });
    const out=[]; wb.replace(/<sheet\b([^>]*?)\/?>/g,(m,a)=>{ const o=attrs(a); const rid=o['r:id']||o['relationshipId']; if(o.name) out.push({name:o.name,path:map[rid]||''}); return ''; }); return out;
  }
  function findHeader(rows, required){
    for(const row of rows){
      const map={}; Object.keys(row.cells).forEach(col=>{ const key=norm(row.cells[col].value); if(key && map[key]===undefined) map[key]=col; });
      const ok=required.every(r=> map[r] || Object.keys(map).some(k=>k.indexOf(r)===0));
      if(ok) return { row: row.num, map };
    } return null;
  }
  function getCell(row,col){ if(!col) return ''; const c=row.cells[col]; return c?c.value:''; }
  function asDate(v){
    if(v===null||v===undefined||v==='') return null;
    const s=String(v).trim();
    if(/^\d+(\.\d+)?$/.test(s)){ const n=Number(s); if(n>20000 && n<80000) return serialToDate(n); }
    let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return m[1]+'-'+m[2]+'-'+m[3];
    m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if(m){ let d=+m[1],mo=+m[2],y=+m[3]; if(y<100) y+=2000; if(mo>12&&d<=12){const t=d;d=mo;mo=t;} if(y>1900&&mo>=1&&mo<=12&&d>=1&&d<=31) return y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0'); }
    return null;
  }
  function normProducto(v){
    const s=norm(v); if(!s) return '';
    if(s.indexOf('motor')!==-1) return 'Motor Shell';
    if(s.indexOf('hidraul')!==-1 || s.indexOf('spirax')!==-1) return 'Hidráulico Shell';
    return text(v);
  }

  function parse(buffer){
    if(!F) throw new Error('Falta el módulo de compresión (fflate).');
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let files; try{ files=F.unzipSync(u8); } catch(e){ throw new Error('El archivo no es un Excel .xlsx válido.'); }
    Object.keys(files).forEach(k=>{ const nk=k.replace(/\\/g,'/'); if(nk!==k){files[nk]=files[k]; delete files[k];} });
    const shared = sharedStrings(files);
    const sheets = sheetList(files);
    const warnings=[];
    let dispatches=[]; let meters=[]; let mainSheet='', bobaSheet='';
    const parsedSheets = sheets.map(s=>{ const xml=files[s.path]?dec.decode(files[s.path]):''; return {name:s.name,path:s.path,rows:xml?parseSheet(xml,shared):[]}; }).filter(s=>s.rows.length);

    // Main dispatch sheet: headers include fecha, equipo, litros, tipo de aceite (or aceite/producto)
    for(const s of parsedSheets){
      const h = findHeader(s.rows, ['fecha','equipo','litros']);
      if(!h) continue;
      const map=h.map;
      const col=(...names)=>{ for(const n of names){ if(map[n]) return map[n]; const k=Object.keys(map).find(x=>x.indexOf(n)!==-1 || n.indexOf(x)!==-1); if(k) return map[k]; } return ''; };
      const cFecha = col('fecha','date'); const cEq = col('equipo'); const cDesc = col('descripcion','descripci'); const cHor = col('horometro');
      const cTipo = col('tipo de aceite','tipo aceite','aceite','producto','tipo');
      const cComp = col('compartimento'); const cMot = col('motivo'); const cLit = col('litros');
      const cPrecio = col('precio'); const cImp = col('importe'); const cMec = col('mecanico','mec nico'); const cResp = col('responsable'); const cFolio = col('folio','orden');
      if(!cFecha || !cEq || !cLit) continue;
      mainSheet = s.name;
      s.rows.forEach(row=>{
        if(row.num <= h.row) return;
        const fecha = asDate(getCell(row,cFecha)); if(!fecha) return;
        const equipo = text(getCell(row,cEq)); if(!equipo) return;
        if(/^total/i.test(equipo) || /^total/i.test(text(getCell(row,cMot)))) return;
        const litros = num(getCell(row,cLit)); if(litros==null || !(litros>0)) return;
        const tipoAceite = text(getCell(row,cTipo));
        const horRaw = text(getCell(row,cHor));
        const hor = horRaw===''?null:(isFinite(Number(horRaw.replace(/,/g,'')))?Number(horRaw.replace(/,/g,'')):horRaw);
        dispatches.push({
          fecha, equipo,
          descripcion: text(getCell(row,cDesc)),
          horometro: hor,
          tipoAceite: tipoAceite || 'Hidráulico Shell',
          compartimento: text(getCell(row,cComp)),
          motivo: text(getCell(row,cMot)),
          litros: Math.round(litros*1000)/1000,
          precio: num(getCell(row,cPrecio)),
          importe: num(getCell(row,cImp)),
          mecanico: text(getCell(row,cMec)),
          responsable: text(getCell(row,cResp)),
          folio: text(getCell(row,cFolio)),
          notas: ''
        });
      });
      break;
    }

    // Cuenta litros sheet
    for(const s of parsedSheets){
      if(s.name===mainSheet) continue;
      const h = findHeader(s.rows, ['fecha','producto']);
      if(!h){
        // try fecha + (lectura inicial|inicial) as oil meter
        const h2 = findHeader(s.rows, ['fecha','inicial']);
        if(!h2) continue;
      }
      const hh = findHeader(s.rows, ['fecha','producto']) || findHeader(s.rows, ['fecha','inicial']) || findHeader(s.rows, ['fecha','turno']);
      if(!hh) continue;
      const map=hh.map;
      const col=(...names)=>{ for(const n of names){ if(map[n]) return map[n]; const k=Object.keys(map).find(x=>x.indexOf(n)!==-1 || n.indexOf(x)!==-1); if(k) return map[k]; } return ''; };
      const cFecha=col('fecha','date'); const cProd=col('producto','tipo de aceite','aceite','tipo'); const cIni=col('lectura inicial','inicial','inicio'); const cFin=col('lectura final','final','fin');
      const cLit=col('litros cuenta','litros despach','litros boba','litros'); const cNotas=col('notas','observaciones');
      if(!cFecha || !cIni || !cFin) continue;
      bobaSheet = s.name;
      s.rows.forEach(row=>{
        if(row.num <= hh.row) return;
        const fecha = asDate(getCell(row,cFecha)); if(!fecha) return;
        const ini = num(getCell(row,cIni)); const fin = num(getCell(row,cFin));
        if(ini==null && fin==null) return;
        const prod = normProducto(getCell(row,cProd)) || 'Hidráulico Shell';
        const litros = num(getCell(row,cLit));
        meters.push({ fecha, producto: prod, inicial: ini, final: fin, litros, notas: text(getCell(row,cNotas)) });
      });
      break;
    }

    // dedupe meters by fecha+producto
    const mMap=new Map(); meters.forEach(m=>{ const k=m.fecha+'|'+(canonProducto(m.producto)||m.producto); if(!mMap.has(k)) mMap.set(k,m); });
    meters = Array.from(mMap.values()).sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)) || String(a.producto).localeCompare(String(b.producto)));

    if(!mainSheet && !bobaSheet) throw new Error('No se encontró una hoja de aceites reconocible (se esperaban columnas como Fecha, Equipo, Litros).');

    const dates = dispatches.map(d=>d.fecha).concat(meters.map(m=>m.fecha)).filter(Boolean).sort();
    const litrosSalidas = dispatches.reduce((a,d)=>a+(Number(d.litros)||0),0);
    const litrosCuenta = meters.reduce((a,m)=>a+(Number(m.litros)||0),0);
    return {
      dispatches, meters,
      meta: {
        mainSheet, bobaSheet, sheets: sheets.map(s=>s.name),
        rows: dispatches.length, meterRows: meters.length,
        desde: dates[0]||'', hasta: dates[dates.length-1]||'',
        litrosSalidas: Math.round(litrosSalidas*1000)/1000,
        litrosCuenta: Math.round(litrosCuenta*1000)/1000,
        warnings: warnings.slice(0,20)
      }
    };
  }

  function filename(desde,hasta){ return 'REPORTE_ACEITES_' + (desde||'inicio') + '_a_' + (hasta||'fin') + '.xlsx'; }

  return { build, parse, filename, canonProducto, serialToDate, dateToSerial };
})();
