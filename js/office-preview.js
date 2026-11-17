// Word and Excel inside the app (2026-11-17): "תצוגה" on a record's documents, on correspondence
// and in "דואר נכנס" opens an Office file here instead of downloading it. Excel (.xlsx/.xlsm) is
// shown as a table per sheet, CSV as one table, Word (.docx) as its text with tables and lists.
// Old binary files (.xls/.doc, Office 2003) cannot be read in a browser: they are offered for
// download. Loaded on first use by sgpOpenOffice (js/documents.js). Nothing here is ever saved.

const SGP_OFFICE_EXCELJS_SRC = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
const SGP_OFFICE_MAMMOTH_SRC = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';
const SGP_OFFICE_MAX_ROWS = 1000;
const SGP_OFFICE_MAX_COLS = 60;

// 'excel' | 'csv' | 'word' | 'legacy' (Office 2003, download only) | null
function sgpOfficeKind(name) {
  const ext = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  const e = ext ? ext[1].toLowerCase() : '';
  if (e === 'xlsx' || e === 'xlsm') return 'excel';
  if (e === 'csv') return 'csv';
  if (e === 'docx') return 'word';
  if (e === 'xls' || e === 'doc') return 'legacy';
  return null;
}

function sgpOfficeEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// CSV as Excel writes it: "," or ";" (Hebrew and European settings), quotes, doubled quotes, CRLF
function sgpCsvRows(text) {
  const s = String(text || '');
  if (!s.trim()) return [];
  const firstLine = s.split(/\r?\n/, 1)[0];
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// One Excel cell (as the Excel library gives it) as the text shown
function sgpOfficeCellText(v) {
  if (v == null) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v)) return '';
    const p = n => String(n).padStart(2, '0');
    return `${p(v.getUTCDate())}/${p(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
  }
  if (typeof v === 'number') return String(Number(v.toPrecision(12)));
  if (typeof v === 'object') {
    if ('result' in v) return sgpOfficeCellText(v.result);
    if (Array.isArray(v.richText)) return v.richText.map(r => r.text || '').join('').trim();
    if ('text' in v) return sgpOfficeCellText(v.text);
    if ('error' in v) return String(v.error);
    return '';
  }
  return String(v).replace(/\s+/g, ' ').trim();
}

// rows: [[text, …], …] → an escaped table, at most 1000 rows × 60 columns
function sgpSheetHtml(rows, { rtl = true, total } = {}) {
  const dir = rtl ? 'rtl' : 'ltr';
  const all = rows || [];
  if (!all.length) return `<div class="office-sheet" dir="${dir}"><p class="empty-state">הגיליון ריק</p></div>`;
  const shown = all.slice(0, SGP_OFFICE_MAX_ROWS);
  const cols = Math.min(SGP_OFFICE_MAX_COLS, Math.max(...shown.map(r => (r || []).length)));
  const body = shown.map(r => '<tr>' + Array.from({ length: cols }, (_, j) => `<td>${sgpOfficeEsc((r || [])[j] ?? '')}</td>`).join('') + '</tr>').join('');
  const count = total ?? all.length;
  const note = count > shown.length ? `<p class="office-note">מוצגות ${shown.length} שורות ראשונות מתוך ${count}. להורדת הקובץ המלא: "הורדה".</p>` : '';
  return `<div class="office-sheet" dir="${dir}"><table>${body}</table>${note}</div>`;
}

// The Word file's HTML (from the mammoth library), keeping only text, headings, lists, tables,
// links to web and mail, and embedded pictures. Every other tag and attribute is dropped, so
// nothing in a file someone sent can run, load from outside or restyle the page.
const SGP_WORD_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
  'br', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'a', 'img'];
function sgpSafeWordHtml(html) {
  const attrsOf = raw => {
    const out = {};
    for (const m of String(raw || '').matchAll(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
    }
    return out;
  };
  const q = v => String(v).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return String(html || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_, close, tagName, raw) => {
    const tag = tagName.toLowerCase();
    if (!SGP_WORD_TAGS.includes(tag)) return '';
    if (close) return tag === 'img' || tag === 'br' ? '' : `</${tag}>`;
    const a = attrsOf(raw);
    if (tag === 'a') {
      return /^(https?:|mailto:)/i.test(a.href || '') ? `<a href="${q(a.href)}" target="_blank" rel="noopener noreferrer">` : '<a>';
    }
    if (tag === 'img') {
      if (!/^data:image\/(png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i.test(a.src || '')) return '';
      return `<img src="${q(a.src)}"${a.alt ? ` alt="${q(a.alt)}"` : ''}>`;
    }
    if (tag === 'td' || tag === 'th') {
      const span = ['colspan', 'rowspan'].filter(k => /^\d{1,3}$/.test(a[k] || '')).map(k => ` ${k}="${a[k]}"`).join('');
      return `<${tag}${span}>`;
    }
    return `<${tag}>`;
  });
}

// ---- in the page ----------------------------------------------------------------------------
const sgpOfficeScripts = {};
function sgpOfficeLoad(src, ready) {
  if (ready()) return Promise.resolve();
  if (!sgpOfficeScripts[src]) {
    sgpOfficeScripts[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve;
      s.onerror = () => { delete sgpOfficeScripts[src]; reject(new Error('טעינת רכיב התצוגה נכשלה')); };
      document.head.appendChild(s);
    });
  }
  return sgpOfficeScripts[src];
}

// a CSV is UTF-8, or Windows-1255 when Excel saved it on a Hebrew computer
async function sgpOfficeCsvText(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''); }
  catch (_) { return new TextDecoder('windows-1255').decode(bytes); }
}

async function sgpOfficeExcelSheets(blob) {
  await sgpOfficeLoad(SGP_OFFICE_EXCELJS_SRC, () => typeof ExcelJS !== 'undefined');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  return wb.worksheets.filter(ws => ws.state !== 'hidden' && ws.state !== 'veryHidden').map(ws => {
    const rows = [];
    let total = 0;
    ws.eachRow({ includeEmpty: false }, row => {
      total++;
      if (rows.length < SGP_OFFICE_MAX_ROWS) rows.push(row.values.slice(1, SGP_OFFICE_MAX_COLS + 1).map(sgpOfficeCellText));
    });
    return { name: ws.name, rtl: !!(ws.views && ws.views[0] && ws.views[0].rightToLeft), rows, total };
  });
}

async function sgpOfficePreview(blob, name) {
  const kind = sgpOfficeKind(name);
  const url = URL.createObjectURL(blob);
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop open';
  wrap.innerHTML = `
    <div class="modal office-modal" role="dialog" aria-modal="true" aria-label="${sgpOfficeEsc(name)}">
      <div class="office-head">
        <h3 dir="auto">${sgpOfficeEsc(name)}</h3>
        <a class="btn btn-sm btn-outline" href="${url}" download="${sgpOfficeEsc(name)}">הורדה</a>
        <button type="button" class="btn btn-sm btn-outline" data-office-close>סגירה</button>
      </div>
      <div class="office-tabs" hidden></div>
      <div class="office-body"><div class="loading-overlay"><div class="spinner"></div></div></div>
    </div>`;
  document.body.appendChild(wrap);
  const body = wrap.querySelector('.office-body'), tabs = wrap.querySelector('.office-tabs');
  const close = () => { wrap.remove(); URL.revokeObjectURL(url); };
  wrap.querySelector('[data-office-close]').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  try {
    if (kind === 'excel') {
      const sheets = await sgpOfficeExcelSheets(blob);
      const show = i => {
        body.innerHTML = sheets[i] ? sgpSheetHtml(sheets[i].rows, { rtl: sheets[i].rtl, total: sheets[i].total }) : '<p class="empty-state">אין גיליונות</p>';
        tabs.querySelectorAll('button').forEach((b, j) => b.classList.toggle('active', j === i));
      };
      if (sheets.length > 1) {
        tabs.hidden = false;
        tabs.innerHTML = sheets.map((s, i) => `<button type="button" class="btn btn-sm btn-ghost" data-sheet="${i}">${sgpOfficeEsc(s.name)}</button>`).join('');
        tabs.addEventListener('click', e => { const b = e.target.closest('[data-sheet]'); if (b) show(Number(b.dataset.sheet)); });
      }
      show(0);
    } else if (kind === 'csv') {
      body.innerHTML = sgpSheetHtml(sgpCsvRows(await sgpOfficeCsvText(blob)), { rtl: true });
    } else if (kind === 'word') {
      await sgpOfficeLoad(SGP_OFFICE_MAMMOTH_SRC, () => typeof mammoth !== 'undefined');
      const r = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
      const safe = sgpSafeWordHtml(r.value).trim();
      body.innerHTML = `<div class="office-word" dir="auto">${safe || '<p class="empty-state">המסמך ריק</p>'}</div>`;
    } else {
      body.innerHTML = `<p class="office-note">זה קובץ בפורמט ישן (Office 2003) שאי אפשר להציג בתוך המערכת. אפשר להוריד אותו ולפתוח ב-Word או ב-Excel.</p>`;
    }
  } catch (err) {
    console.error('office preview failed', name, err);
    body.innerHTML = `<p class="office-note">לא הצלחנו להציג את הקובץ (${sgpOfficeEsc(err.message || 'שגיאה')}). אפשר להוריד אותו ולפתוח במחשב.</p>`;
  }
}
