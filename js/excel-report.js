// ===== Styled Excel export =====
// Same inputs as the PDF exports in js/pdf-report.js (load that file first — this one
// reuses its doc-type labels and status colours). Builds a real spreadsheet: dates and
// numbers stay dates and numbers, the header row is frozen and filterable, and columns
// marked `total: true` get a SUM row.
//
// ExcelJS (MIT) is about 1 MB, so it is fetched on the first export, not with the page.
const SGP_EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
let sgpExcelJsPromise = null;
function sgpLoadExcelJs() {
  if (window.ExcelJS) return Promise.resolve();
  if (!sgpExcelJsPromise) {
    sgpExcelJsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SGP_EXCELJS_URL;
      s.onload = resolve;
      s.onerror = () => { sgpExcelJsPromise = null; reject(new Error('טעינת רכיב האקסל נכשלה — בדקו את החיבור לאינטרנט')); };
      document.head.appendChild(s);
    });
  }
  return sgpExcelJsPromise;
}

const SGP_XL = {
  navy: 'FF0E1A20', green: 'FF22D86B', greenDeep: 'FF16B650', greenInk: 'FF0B7A3B', greenSoft: 'FFEAFBF1',
  soft: 'FFF3F6F4', zebra: 'FFF7FAF8', border: 'FFE3E9E6', steel: 'FF637178', ink: 'FF0E1A20', white: 'FFFFFFFF',
  subtle: 'FFB8C4C9', blue: 'FF1F6FD1',
  tone: { good: 'FF0B7A3B', bad: 'FFC62F35', wait: 'FFA85708' },
};
const SGP_XL_FONT = 'Arial';           // ships with Hebrew glyphs everywhere Excel runs
const SGP_XL_HEAD_ROW = 9;             // rows 1–8 are the letterhead
const sgpXlFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const sgpXlFont = (extra = {}) => ({ name: SGP_XL_FONT, size: 11, color: { argb: SGP_XL.ink }, ...extra });

// 'YYYY-MM-DD…' -> a UTC date, so the spreadsheet shows the same day in every time zone
function sgpXlDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}
const sgpXlNumFmt = digits => digits === 0 ? '#,##0' : `#,##0.${'0'.repeat(digits ?? 2)}`;
const sgpXlIsLong = c => c.type === 'docs' || c.type === 'multiline' || SGP_LONG_KEYS.includes(c.key);

// The value a cell holds, plus how to style it.
function sgpXlCell(v, col) {
  if (col.type === 'docs') {
    if (!v || !v.length) return { value: '—', muted: true };
    return { value: v.map(d => `${SGP_DOC_TYPE_LABELS[d.docType] || 'מסמך'}: ${d.name}${d.date ? ` (${fmtDate(d.date)})` : ''}`).join('\n') };
  }
  if (col.type === 'link') return { value: v, link: true };
  if (v === null || v === undefined || v === '') return { value: '—', muted: true };
  if (col.type === 'boolean') return v ? { value: col.trueLabel || 'כן', tone: 'good' } : { value: col.falseLabel || 'לא', muted: true };
  const tone = sgpStatusTone(col, v);
  if (tone) return { value: String(v), tone };
  if (col.type === 'date') { const d = sgpXlDate(v); return d ? { value: d, numFmt: 'dd/mm/yyyy', center: true } : { value: String(v) }; }
  if (col.type === 'number') { const n = Number(v); return isNaN(n) ? { value: String(v) } : { value: n, numFmt: sgpXlNumFmt(col.digits) }; }
  if (col.type === 'multiline') return { value: String(v).split(/[\n,]+/).map(s => s.trim()).filter(Boolean).join('\n') };
  return { value: String(v) };
}

// Width in Excel character units, from the header and the longest line of content.
function sgpXlWidth(col, rows) {
  if (col.type === 'date') return 13;
  if (col.type === 'link') return 18;
  if (sgpXlIsLong(col)) return 48;
  let longest = String(col.label).length + 3;
  for (const r of rows.slice(0, 400)) {
    const c = sgpXlCell(r[col.key], col);
    const text = c.value instanceof Date ? '00/00/0000' : typeof c.value === 'number' ? c.value.toLocaleString('en-US') : String(c.value);
    for (const line of text.split('\n')) longest = Math.max(longest, line.length + 2);
  }
  return Math.min(Math.max(longest, col.type === 'number' ? 11 : 12), 42);
}

function sgpXlSheetName(title, wb) {
  let base = String(title).replace(/[\\/?*[\]:]/g, '-').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'גיליון';
  let name = base, n = 2;
  while (wb.getWorksheet(name)) name = `${base.slice(0, 26)} (${n++})`;
  return name;
}

// The company's logo as a PNG the workbook can embed: its own logo on a white chip (it
// may be dark), or the platform logo as is (white lettering, drawn on the dark band).
async function sgpXlLogo(wb) {
  try {
    const logo = await orgLogo(activeOrg);
    const blob = await (await fetch(logo.src)).blob();
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const H = 76, pad = logo.isCompany ? 12 : 0;       // drawn at 2x
      const w = Math.round(img.naturalWidth * (H - pad * 2) / img.naturalHeight) + pad * 2;
      const c = document.createElement('canvas');
      c.width = w; c.height = H;
      const g = c.getContext('2d');
      if (logo.isCompany) {
        g.fillStyle = '#ffffff';
        if (g.roundRect) { g.beginPath(); g.roundRect(0, 0, w, H, 14); g.fill(); } else g.fillRect(0, 0, w, H);
      }
      g.drawImage(img, pad, pad, w - pad * 2, H - pad * 2);
      return { id: wb.addImage({ base64: c.toDataURL('image/png'), extension: 'png' }), w: w / 2, h: H / 2 };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    console.warn('Excel export: logo skipped', err);
    return null;
  }
}

// One formatted worksheet: letterhead, title, a line of facts, then the table.
function sgpXlSheet(wb, ctx, { title, subtitle, facts, columns, rows }) {
  const cols = [{ key: '__n', label: '#', type: 'n' }, ...columns];
  const n = cols.length;
  const landscape = columns.length >= 5;
  const ws = wb.addWorksheet(sgpXlSheetName(title, wb), {
    views: [{ rightToLeft: true, showGridLines: false, state: 'frozen', ySplit: SGP_XL_HEAD_ROW, activeCell: `A${SGP_XL_HEAD_ROW + 1}` }],
    properties: { tabColor: { argb: SGP_XL.greenDeep } },
    pageSetup: {
      paperSize: 9, orientation: landscape ? 'landscape' : 'portrait',
      fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 },
      printTitlesRow: `${SGP_XL_HEAD_ROW}:${SGP_XL_HEAD_ROW}`,
    },
  });
  const hf = s => String(s).replace(/&/g, '&&');
  ws.headerFooter.oddFooter = `&L&8${hf(ctx.org)}&C&8&P / &N&R&8${hf(PLATFORM_NAME)}`;

  // column widths; a narrow table is widened so the letterhead has room
  const widths = [6, ...columns.map(c => sgpXlWidth(c, rows))];
  const room = 64 - widths.reduce((a, b) => a + b, 0);
  if (room > 0 && n > 1) for (let i = 1; i < n; i++) widths[i] += room / (n - 1);
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = Math.round(w * 10) / 10; });

  const band = (r, height, argb) => {
    ws.getRow(r).height = height;
    for (let c = 1; c <= n; c++) ws.getCell(r, c).fill = sgpXlFill(argb);
  };
  const merged = r => { if (n > 1) ws.mergeCells(r, 1, r, n); return ws.getCell(r, 1); };

  // rows 1–3: dark letterhead with the logo, then a green rule
  band(1, 44, SGP_XL.navy);
  band(2, 22, SGP_XL.navy);
  band(3, 4, SGP_XL.green);
  merged(1);
  const who = merged(2);
  who.value = { richText: [
    { text: ctx.org, font: sgpXlFont({ size: 12, bold: true, color: { argb: SGP_XL.white } }) },
    { text: `    ·    הופק ב־${ctx.genStr}`, font: sgpXlFont({ size: 9, color: { argb: SGP_XL.subtle } }) },
  ] };
  who.alignment = { vertical: 'middle', indent: 1 };
  if (ctx.logo) ws.addImage(ctx.logo.id, { tl: { col: 0.12, row: 0.12 }, ext: { width: ctx.logo.w, height: ctx.logo.h }, editAs: 'oneCell' });
  ws.getRow(4).height = 10;

  // rows 5–7: title, subtitle, facts
  const t = merged(5);
  ws.getRow(5).height = 30;
  t.value = title;
  t.font = sgpXlFont({ size: 18, bold: true });
  t.alignment = { vertical: 'middle' };
  const st = merged(6);
  ws.getRow(6).height = subtitle ? 18 : 6;
  if (subtitle) { st.value = subtitle; st.font = sgpXlFont({ size: 10, color: { argb: SGP_XL.steel } }); }
  const f = merged(7);
  ws.getRow(7).height = 24;
  const parts = [];
  facts.forEach(([label, value, accent], i) => {
    if (i) parts.push({ text: '     |     ', font: sgpXlFont({ size: 10, color: { argb: SGP_XL.subtle } }) });
    parts.push({ text: `${label}: `, font: sgpXlFont({ size: 10, bold: true, color: { argb: accent ? SGP_XL.greenInk : SGP_XL.steel } }) });
    parts.push({ text: String(value), font: sgpXlFont({ size: 10, bold: !!accent }) });
  });
  f.value = { richText: parts };
  f.fill = sgpXlFill(SGP_XL.soft);
  f.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(8).height = 10;

  // row 9: header
  const head = ws.getRow(SGP_XL_HEAD_ROW);
  head.height = 30;
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.label;
    cell.font = sgpXlFont({ bold: true, color: { argb: SGP_XL.white } });
    cell.fill = sgpXlFill(SGP_XL.navy);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: SGP_XL.green } } };
  });

  // data
  const first = SGP_XL_HEAD_ROW + 1;
  rows.forEach((row, ri) => {
    const r = ws.getRow(first + ri);
    cols.forEach((c, ci) => {
      const cell = r.getCell(ci + 1);
      const border = { bottom: { style: 'thin', color: { argb: SGP_XL.border } } };
      if (ri % 2) cell.fill = sgpXlFill(SGP_XL.zebra);
      cell.border = border;
      if (c.type === 'n') {
        cell.value = ri + 1;
        cell.font = sgpXlFont({ size: 10, bold: true, color: { argb: SGP_XL.greenInk } });
        cell.alignment = { vertical: 'top', horizontal: 'center' };
        return;
      }
      const x = sgpXlCell(row[c.key], c);
      if (x.link && x.value) {
        cell.value = x.value;
        cell.font = sgpXlFont({ color: { argb: SGP_XL.blue }, underline: true });
        cell.alignment = { vertical: 'top' };
        return;
      }
      cell.value = x.value;
      if (x.numFmt) cell.numFmt = x.numFmt;
      cell.font = sgpXlFont(x.tone ? { bold: true, color: { argb: SGP_XL.tone[x.tone] } }
        : x.muted ? { color: { argb: SGP_XL.subtle } } : {});
      cell.alignment = { vertical: 'top', wrapText: sgpXlIsLong(c) || String(x.value).length > 40 || String(x.value).includes('\n'),
        ...(x.center || x.muted ? { horizontal: 'center' } : {}) };
    });
  });
  const last = first + rows.length - 1;

  // totals for the columns that add up
  if (rows.length && columns.some(c => c.total)) {
    const r = ws.getRow(last + 1);
    r.height = 24;
    cols.forEach((c, ci) => {
      const cell = r.getCell(ci + 1);
      cell.fill = sgpXlFill(SGP_XL.greenSoft);
      cell.border = { top: { style: 'medium', color: { argb: SGP_XL.greenDeep } } };
      cell.font = sgpXlFont({ bold: true });
      cell.alignment = { vertical: 'middle' };
      if (c.total) {
        const letter = ws.getColumn(ci + 1).letter;
        const sum = rows.reduce((a, row) => a + (Number(row[c.key]) || 0), 0);
        cell.value = { formula: `SUM(${letter}${first}:${letter}${last})`, result: sum };
        cell.numFmt = sgpXlNumFmt(c.digits);
      }
    });
    const label = r.getCell(cols.findIndex(c => c.type !== 'n' && !c.total) + 1 || 1);
    if (!label.value) label.value = 'סה״כ';
  }

  if (rows.length) ws.autoFilter = { from: { row: SGP_XL_HEAD_ROW, column: 1 }, to: { row: SGP_XL_HEAD_ROW, column: n } };
  return ws;
}

async function sgpXlContext(wb) {
  wb.creator = PLATFORM_NAME;
  wb.created = new Date();
  return { org: orgDisplayName(), genStr: sgpGeneratedAt(), logo: await sgpXlLogo(wb) };
}

async function sgpXlSave(wb, title) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${String(title).replace(/[\\/:*?"<>|]+/g, '-')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const sgpXlFacts = ({ siteNames, periodText, periodLabel, count }) => [
  ['אתרים', (siteNames || []).join(', ') || '—'],
  [periodLabel || 'תקופה', periodText || 'כל התקופה'],
  ['סה״כ רשומות', count, true],
];

// One dataset, one workbook. Takes the same options as sgpExportPdf.
async function sgpExportExcel({ title, columns, rows, siteNames, periodText, periodLabel, subtitle }) {
  if (!rows.length) { toast('אין נתונים תואמים לסינון שנבחר', 'error'); return; }
  try {
    await sgpLoadExcelJs();
    const wb = new ExcelJS.Workbook();
    const ctx = await sgpXlContext(wb);
    sgpXlSheet(wb, ctx, { title, subtitle, columns, rows, facts: sgpXlFacts({ siteNames, periodText, periodLabel, count: rows.length }) });
    await sgpXlSave(wb, title);
    toast('קובץ האקסל ירד בהצלחה', 'success');
  } catch (err) {
    console.error(err);
    toast('שגיאה ביצירת קובץ האקסל: ' + err.message, 'error');
  }
}

// Every module with data on its own sheet, after a summary sheet that links to each.
async function sgpExportFullSystemExcel({ sections, siteNames, periodText, fileTitle }) {
  const nonEmpty = sections.filter(s => s.rows && s.rows.length);
  if (!nonEmpty.length) { toast('אין נתונים לייצוא בטווח שנבחר', 'error'); return; }
  const title = fileTitle || 'דוח מערכת מלא';
  try {
    await sgpLoadExcelJs();
    const wb = new ExcelJS.Workbook();
    const ctx = await sgpXlContext(wb);
    const toc = nonEmpty.map(s => {
      const ws = sgpXlSheet(wb, ctx, { title: s.title, subtitle: s.subtitle, columns: s.columns, rows: s.rows,
        facts: sgpXlFacts({ siteNames, periodText, count: s.rows.length }) });
      // HYPERLINK() rather than a stored link: Excel and LibreOffice both follow it within the file
      const target = `#'${ws.name.replace(/'/g, "''")}'!A1`.replace(/"/g, '""');
      return { title: s.title, count: s.rows.length, link: { formula: `HYPERLINK("${target}","מעבר לגיליון")`, result: 'מעבר לגיליון' } };
    });
    // written last (the links need the sheet names), shown first
    const cover = sgpXlSheet(wb, ctx, {
      title, subtitle: 'כל מודול בגיליון נפרד — לחצו על "מעבר לגיליון" כדי לפתוח אותו',
      columns: [
        { key: 'title', label: 'מודול', type: 'text' },
        { key: 'count', label: 'רשומות', type: 'number', digits: 0, total: true },
        { key: 'link', label: 'גיליון', type: 'link' },
      ],
      rows: toc,
      facts: sgpXlFacts({ siteNames, periodText, count: toc.reduce((a, t) => a + t.count, 0) }),
    });
    cover.orderNo = -1;
    wb.views = [{ activeTab: 0, firstSheet: 0 }];
    await sgpXlSave(wb, title);
    toast('קובץ האקסל המלא ירד בהצלחה', 'success');
  } catch (err) {
    console.error(err);
    toast('שגיאה ביצירת קובץ האקסל: ' + err.message, 'error');
  }
}
