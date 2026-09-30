// ===== "ייצוא כל המידע": every record and every attached file of the company, in one ZIP =====
// Runs in the owner's browser with the owner's own permissions, so it can only read what the
// owner can already see. Nothing is written anywhere except the downloaded file.

const COMPANY_EXPORT_JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
const COMPANY_EXPORT_PAGE = 1000;   // PostgREST returns at most this many rows per request
const COMPANY_EXPORT_TABLES = [
  { table: 'concrete_pours', label: 'יציקות בטון' },
  { table: 'rebar_deliveries', label: 'משלוחי ברזל' },
  { table: 'prestressed_slabs', label: 'לוח״דים' },
  { table: 'vendor_submissions', label: 'הגשות לאישור' },
  { table: 'quality_controls', label: 'בקרת איכות' },
  { table: 'facility_file_items', label: 'תיק מתקן' },
  { table: 'exceptions', label: 'חריגים' },
  { table: 'tasks', label: 'משימות' },
  { table: 'weekly_work_plans', label: 'תכנית עבודה' },
  { table: 'weekly_meetings', label: 'סיכומי ישיבות' },
  { table: 'correspondence', label: 'יועצים ומתכננים' },
  { table: 'quantity_sheets', label: 'גיליונות כמויות' },
  { table: 'quantity_items', label: 'סעיפי כמויות' },
  { table: 'quantity_takeoffs', label: 'חישובי כמויות' },
  { table: 'price_quotes', label: 'הצעות מחיר' },
  { table: 'site_notices', label: 'הודעות' },
  { table: 'documents', label: 'מסמכים מצורפים' },
];
const COMPANY_EXPORT_LABEL = Object.fromEntries(COMPANY_EXPORT_TABLES.map(t => [t.table, t.label]));

function exportCellValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function exportZipSafe(s) {
  return String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '_').trim().slice(0, 120) || '_';
}

function exportFilePath(doc, siteName, used) {
  const folder = `קבצים/${exportZipSafe(siteName)}/${exportZipSafe(COMPANY_EXPORT_LABEL[doc.linked_table] || 'כללי')}`;
  const name = exportZipSafe(doc.file_name || String(doc.file_path || '').split('/').pop());
  const dot = name.lastIndexOf('.');
  let path = `${folder}/${name}`;
  for (let n = 2; used.has(path); n++) {
    path = `${folder}/${dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`}`;
  }
  used.add(path);
  return path;
}

async function exportFetchAll(fetchPage, pageSize = COMPANY_EXPORT_PAGE) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

function exportSheetRows(rows) {
  const columns = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!columns.includes(k)) columns.push(k);
  return { columns, values: rows.map(r => columns.map(c => exportCellValue(r[c]))) };
}

function exportReadme({ orgName, date, counts, fileCount, failed }) {
  return [
    `ייצוא כל המידע — ${orgName}`,
    `תאריך: ${date}`,
    '',
    'הקובץ "נתונים.xlsx" כולל גיליון לכל נושא, עם כל העמודות כפי שהן נשמרות במערכת.',
    'התיקייה "קבצים" כוללת את כל המסמכים והתמונות שצורפו, לפי אתר ← נושא.',
    '',
    'רשומות:',
    ...counts.map(([label, n]) => `  ${label}: ${n}`),
    '',
    `קבצים שהורדו: ${fileCount}`,
    ...(failed.length ? ['', 'קבצים שלא ניתן היה להוריד:', ...failed.map(f => `  ${f}`)] : []),
  ].join('\r\n');
}

function exportLoadJsZip() {
  if (window.JSZip) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = COMPANY_EXPORT_JSZIP_URL; s.onload = resolve; s.onerror = () => reject(new Error('טעינת רכיב הדחיסה נכשלה'));
    document.head.appendChild(s);
  });
}

async function companyExport(org, onProgress = () => {}) {
  await Promise.all([sgpLoadExcelJs(), exportLoadJsZip()]);
  const date = new Date().toISOString().slice(0, 10);

  onProgress('טוען אתרים…');
  const sites = await exportFetchAll((a, b) => sb.from('sites').select('*').eq('organization_id', org.id).order('id').range(a, b));
  const siteIds = sites.map(s => s.id);
  const siteName = Object.fromEntries(sites.map(s => [s.id, s.name]));

  const wb = new ExcelJS.Workbook();
  const addSheet = (label, rows) => {
    const ws = wb.addWorksheet(label.slice(0, 31), { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    const { columns, values } = exportSheetRows(rows);
    if (!columns.length) { ws.addRow(['אין רשומות']); return; }
    ws.addRow(columns).font = { bold: true };
    values.forEach(v => ws.addRow(v));
  };
  const counts = [['אתרים', sites.length]];
  addSheet('אתרים', sites);

  const members = await exportFetchAll((a, b) => sb.from('organization_members').select('user_id, role').eq('organization_id', org.id).order('user_id').range(a, b));
  const people = members.length
    ? await exportFetchAll((a, b) => sb.from('profiles').select('id, full_name, username, email, phone, job_title').in('id', members.map(m => m.user_id)).order('id').range(a, b))
    : [];
  const byId = Object.fromEntries(people.map(p => [p.id, p]));
  const memberRows = members.map(m => ({ ...byId[m.user_id], role: m.role }));
  addSheet('משתמשים', memberRows);
  counts.push(['משתמשים', memberRows.length]);

  let documents = [];
  for (const t of COMPANY_EXPORT_TABLES) {
    onProgress(`טוען ${t.label}…`);
    const rows = siteIds.length
      ? await exportFetchAll((a, b) => sb.from(t.table).select('*').in('site_id', siteIds).order('id').range(a, b))
      : [];
    addSheet(t.label, rows);
    counts.push([t.label, rows.length]);
    if (t.table === 'documents') documents = rows;
  }

  const zip = new JSZip();
  zip.file('נתונים.xlsx', await wb.xlsx.writeBuffer());

  const used = new Set(), failed = [];
  let done = 0;
  const withPath = documents.filter(d => d.file_path);
  for (let i = 0; i < withPath.length; i += 100) {
    const chunk = withPath.slice(i, i + 100);
    const { data: signed, error } = await sb.storage.from('documents').createSignedUrls(chunk.map(d => d.file_path), 600);
    if (error) throw new Error(error.message);
    const queue = chunk.map((d, j) => ({ d, url: signed?.[j]?.signedUrl }));
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const target = exportFilePath(item.d, siteName[item.d.site_id] || 'ללא אתר', used);
        try {
          if (!item.url) throw new Error('no url');
          const res = await fetch(item.url);
          if (!res.ok) throw new Error(String(res.status));
          zip.file(target, await res.blob());
        } catch (_) { failed.push(target); }
        onProgress(`מוריד קבצים ${++done}/${withPath.length}…`);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  }

  zip.file('קרא אותי.txt', exportReadme({ orgName: org.name, date, counts, fileCount: done - failed.length, failed }));
  onProgress('דוחס…');
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `TADOK-${org.slug || 'export'}-${date}.zip`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  onProgress(`הקובץ ירד: ${counts.reduce((s, [, n]) => s + n, 0)} רשומות, ${done - failed.length} קבצים${failed.length ? `, ${failed.length} קבצים לא ירדו (פירוט בקובץ "קרא אותי")` : ''}.`);
}
