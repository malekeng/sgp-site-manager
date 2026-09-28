// ===== Shared PDF rendering engine for report pages =====
// Every page is laid out in HTML, painted by html2canvas and placed on an A4 page by
// jsPDF. Rows/cards are measured first and pages only break between whole items, so a
// row or card is never cut in half. js/excel-report.js reuses the helpers at the top.
const SGP_DOC_TYPE_LABELS = {
  photo: 'תמונה', delivery_note: 'תעודת משלוח', order: 'הזמנה',
  lab_test: 'דוח מעבדה', drawing: 'תוכנית', other: 'מסמך',
};
// long free-text fields: below the grid in card layout, and shown in full there
const SGP_LONG_KEYS = ['notes', 'description', 'summary', 'body'];

// Columns whose values are a status, and the colour each known value gets.
const SGP_STATUS_KEYS = ['status', 'approval_status', 'result', 'status_label', 'supply_status'];
const SGP_STATUS_TONE = {
  'תקין': 'good', 'מאושר': 'good', 'הושלם': 'good', 'נסגר': 'good', 'כן': 'good',
  'לא תקין': 'bad', 'נדחה': 'bad',
  'בטיפול': 'wait', 'ממתין לאישור': 'wait', 'פתוח': 'wait', 'בתהליך': 'wait', 'לביצוע': 'wait', 'חלקית': 'wait', 'לא': 'wait',
};
function sgpStatusTone(col, v) {
  if (!SGP_STATUS_KEYS.includes(col.key) || v === null || v === undefined) return null;
  return SGP_STATUS_TONE[String(v).trim()] || null;
}

const SGP_PDF_TONES = {
  good: 'background:rgba(34,216,107,0.15);color:#0B7A3B;',
  bad: 'background:rgba(229,72,77,0.13);color:#C62F35;',
  wait: 'background:rgba(255,157,66,0.17);color:#A85708;',
  neutral: 'background:#EEF2F0;color:#637178;',
};
const SGP_PDF_EMPTY = '<span style="color:#B4BDC2;">—</span>';
const sgpPill = (tone, text) =>
  `<span style="${SGP_PDF_TONES[tone]}display:inline-block;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:700;white-space:nowrap;">${text}</span>`;

function sgpEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// `full`: show long text whole (card layout) instead of trimming it to fit a table cell.
function sgpFmtPdfCell(v, col, full = false) {
  if (col.type === 'docs') {
    if (!v || !v.length) return SGP_PDF_EMPTY;
    return v.map(d => {
      const typeLabel = SGP_DOC_TYPE_LABELS[d.docType] || 'מסמך';
      const dateLabel = d.date ? fmtDate(d.date) : '';
      return `<div style="display:flex;align-items:center;gap:6px;font-size:12px;padding:3px 0;">
        ${sgpPill('good', typeLabel)}
        <span style="color:#0E1A20;">${sgpEsc(d.name)}</span>
        ${dateLabel ? `<span style="color:#9FAAB0;font-weight:600;">${dateLabel}</span>` : ''}
      </div>`;
    }).join('');
  }
  if (v === null || v === undefined || v === '') return SGP_PDF_EMPTY;
  if (col.type === 'boolean') {
    return v ? sgpPill('good', sgpEsc(col.trueLabel || 'כן')) : sgpPill('neutral', sgpEsc(col.falseLabel || 'לא'));
  }
  const tone = sgpStatusTone(col, v);
  if (tone) return sgpPill(tone, sgpEsc(v));
  if (col.type === 'date') return fmtDate(v);
  if (col.type === 'number') return `<span style="font-variant-numeric:tabular-nums;font-weight:600;">${fmtNum(v, col.digits ?? 2)}</span>`;
  if (col.type === 'multiline') {
    return sgpEsc(String(v)).split(/[\n,]+/).map(s => s.trim()).filter(Boolean).join('<br>');
  }
  let s = sgpEsc(String(v));
  if (!full && s.length > 140) {
    let cut = s.slice(0, 140);
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > 80) cut = cut.slice(0, lastSpace);
    s = cut.trim() + '…';
  }
  return s;
}

function sgpGeneratedAt() {
  const now = new Date();
  return now.toLocaleDateString('he-IL') + ' · ' + now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

// ---- page parts -------------------------------------------------------------------
// Dark band: the company's logo and name on the reading side, the print date opposite.
function sgpBannerHtml(genStr, logoHtml) {
  return `
    <div style="position:relative;overflow:hidden;background:linear-gradient(120deg,#0E1A20 0%,#16262E 100%);padding:26px 40px;display:flex;align-items:center;justify-content:space-between;">
      <div style="position:absolute;left:-70px;top:-90px;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(34,216,107,0.26) 0%,rgba(34,216,107,0) 70%);"></div>
      <div style="position:relative;display:flex;align-items:center;gap:16px;">
        ${logoHtml}
        <div style="width:1px;height:36px;background:rgba(255,255,255,0.18);"></div>
        <div>
          <div style="color:#fff;font-size:16px;font-weight:800;letter-spacing:-0.2px;">${esc(orgDisplayName())}</div>
          <div style="color:rgba(255,255,255,0.6);font-size:11.5px;margin-top:3px;">דוח ממערכת ניהול האתר</div>
        </div>
      </div>
      <div style="position:relative;text-align:left;">
        <div style="color:rgba(255,255,255,0.55);font-size:10.5px;font-weight:600;">תאריך הפקה</div>
        <div style="color:#fff;font-size:13px;font-weight:700;margin-top:3px;">${genStr}</div>
      </div>
    </div>
    <div style="height:4px;background:linear-gradient(90deg,#16B650 0%,#22D86B 50%,#16B650 100%);"></div>`;
}

function sgpStatHtml(icon, label, value, accent = false) {
  return `
    <div style="flex:1;min-width:0;display:flex;align-items:center;gap:11px;background:${accent ? '#EAFBF1' : '#F7FAF8'};border:1px solid ${accent ? 'rgba(34,216,107,0.35)' : '#E3E9E6'};border-radius:14px;padding:12px 14px;">
      <img src="icons/nav/${icon}.webp" style="width:32px;height:32px;flex-shrink:0;">
      <div style="min-width:0;">
        <div style="font-size:10.5px;color:${accent ? '#0B7A3B' : '#637178'};font-weight:700;">${label}</div>
        <div style="font-size:${accent ? 20 : 13}px;font-weight:800;color:#0E1A20;margin-top:2px;line-height:1.25;">${value}</div>
      </div>
    </div>`;
}

function sgpTitleBlockHtml({ title, subtitle, names, period, periodLabel, count, ico }) {
  const icoHtml = ico ? `
    <div style="width:66px;height:66px;border-radius:18px;background:#F3F6F4;border:1px solid #E3E9E6;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <img src="icons/nav/${ico}.webp" style="width:46px;height:46px;">
    </div>` : '';
  return `
    <div style="padding:28px 40px 4px;">
      <div style="display:flex;align-items:center;gap:16px;">
        ${icoHtml}
        <div style="min-width:0;">
          <h1 style="color:#0E1A20;font-size:26px;font-weight:800;margin:0;letter-spacing:-0.4px;line-height:1.2;">${sgpEsc(title)}</h1>
          ${subtitle ? `<div style="color:#637178;font-size:13px;margin-top:5px;font-weight:500;">${sgpEsc(subtitle)}</div>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:12px;margin-top:18px;">
        ${sgpStatHtml('site', 'אתרים', sgpEsc(names.join(', ') || '—'))}
        ${sgpStatHtml('work-plan', sgpEsc(periodLabel || 'תקופה'), sgpEsc(period))}
        ${sgpStatHtml('reports', 'סה״כ רשומות', count, true)}
      </div>
    </div>`;
}

function sgpContinuationHeaderHtml(title) {
  return `
    <div style="background:#0E1A20;padding:13px 40px;display:flex;align-items:center;justify-content:space-between;">
      <div style="color:#fff;font-size:13px;font-weight:800;">${sgpEsc(title)} <span style="color:rgba(255,255,255,0.55);font-weight:600;">· המשך</span></div>
      <div style="color:rgba(255,255,255,0.7);font-size:11px;font-weight:600;">${esc(orgDisplayName())}</div>
    </div>
    <div style="height:3px;background:linear-gradient(90deg,#16B650,#22D86B);"></div>`;
}

// On every page, pinned to the bottom. The page number is stamped into its middle by
// jsPDF at the end, once the total is known.
function sgpFooterHtml(title) {
  return `
    <div style="margin-top:auto;padding:14px 40px 16px;border-top:1px solid #E3E9E6;display:flex;justify-content:space-between;align-items:center;gap:12px;">
      <div style="color:#9FAAB0;font-size:10.5px;font-weight:600;">${esc(orgDisplayName())} · ${sgpEsc(title)}</div>
      <div style="color:#9FAAB0;font-size:10.5px;font-weight:800;letter-spacing:0.8px;">${PLATFORM_NAME}</div>
    </div>`;
}

async function sgpWaitForImages(el) {
  const imgs = Array.from(el.querySelectorAll('img'));
  await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(res => {
    img.addEventListener('load', res);
    img.addEventListener('error', res);
  })));
}

function sgpMakeRoot(rootW) {
  const root = document.createElement('div');
  root.style.cssText = `position:fixed;left:-9999px;top:0;width:${rootW}px;background:#fff;direction:rtl;font-family:Rubik,Segoe UI,Tahoma,sans-serif;color:#0E1A20;`;
  document.body.appendChild(root);
  return root;
}

// Lays one full A4 page out of `html`, paints it and adds it to the pdf. The root is at
// least a page tall so the footer sits at the bottom; a page that still overflows (one
// huge card) is scaled down to fit rather than cut.
async function sgpPaintPage(pdf, html, { rootW, landscape, footPx, addPage }) {
  const pageWmm = landscape ? 297 : 210, pageHmm = landscape ? 210 : 297;
  const pxPerMm = rootW / pageWmm;
  const root = sgpMakeRoot(rootW);
  root.style.minHeight = `${Math.floor(pageHmm * pxPerMm)}px`;
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.innerHTML = html;
  try {
    await sgpWaitForImages(root);
    const canvas = await html2canvas(root, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: rootW });
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    let w = pageWmm, h = (canvas.height * pageWmm) / canvas.width;
    if (h > pageHmm) { w = w * pageHmm / h; h = pageHmm; }
    if (addPage) pdf.addPage('a4', landscape ? 'landscape' : 'portrait');
    pdf.addImage(imgData, 'JPEG', (pageWmm - w) / 2, 0, w, h);
    (pdf.__sgpFootMm ||= {})[pdf.internal.getCurrentPageInfo().pageNumber] = footPx / pxPerMm;
  } finally {
    document.body.removeChild(root);
  }
}

function sgpStampPageNumbers(pdf) {
  const total = pdf.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    const w = pdf.internal.pageSize.getWidth(), h = pdf.internal.pageSize.getHeight();
    const footMm = (pdf.__sgpFootMm && pdf.__sgpFootMm[p]) || 11;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(99, 113, 120);
    pdf.text(`${p} / ${total}`, w / 2, h - footMm / 2 + 1, { align: 'center' });
  }
}

function sgpLayoutOf(columns, layout) {
  const useCardLayout = layout === 'cards' || (layout !== 'table' && columns.length > 6);
  return { useCardLayout, landscape: !useCardLayout && columns.length >= 5 };
}

// Renders one section (title + table/cards + rows) into a shared pdf object,
// starting on its own fresh page(s). Returns the number of pages it added.
async function sgpRenderSectionIntoPdf(pdf, { title, columns, rows, siteNames, periodText, periodLabel, subtitle, ico, layout, cardTitleKey }, { isFirstSectionOverall } = {}) {
  if (!rows || !rows.length) return 0;
  const bannerLogo = await pdfLogoHtml(40);

  const { useCardLayout, landscape } = sgpLayoutOf(columns, layout);
  const isLongField = c => c.type === 'multiline' || c.type === 'docs' || SGP_LONG_KEYS.includes(c.key);
  const rootW = landscape ? 1280 : 920;
  const pageHeightPx = Math.floor((landscape ? 210 : 297) * rootW / (landscape ? 297 : 210));
  const names = siteNames || [];
  const period = periodText || 'כל התקופה';
  const genStr = sgpGeneratedAt();

  // ---- table layout ----
  // Built from divs with table display rather than <table>: html2canvas 1.4.1 paints
  // nothing inside real <td> cells in current Chrome, so rows came out blank.
  const TH = 'display:table-cell;color:#fff;font-weight:700;font-size:11px;text-align:right;padding:12px 12px;border-bottom:3px solid #22D86B;white-space:nowrap;';
  const tableHeadHtml = `
    <div style="display:table-row;background:#0E1A20;">
      <div style="${TH}width:38px;text-align:center;">#</div>
      ${columns.map(c => `<div style="${TH}">${sgpEsc(c.label)}</div>`).join('')}
    </div>`;
  function rowHtml(row, i) {
    const TD = 'display:table-cell;padding:10px 12px;border-bottom:1px solid #E8EEEA;color:#0E1A20;vertical-align:top;line-height:1.45;';
    return `
      <div class="pdf-tr" style="display:table-row;background:${i % 2 === 0 ? '#ffffff' : '#F7FAF8'};">
        <div style="${TD}text-align:center;padding:10px 6px;"><span style="display:inline-block;min-width:22px;padding:2px 6px;border-radius:999px;background:#EAFBF1;color:#0B7A3B;font-size:10.5px;font-weight:800;">${i + 1}</span></div>
        ${columns.map(c => `<div style="${TD}">${sgpFmtPdfCell(row[c.key], c)}</div>`).join('')}
      </div>`;
  }
  const tableWrap = bodyRowsHtml => `
    <div style="padding:18px 40px 22px;">
      <div style="display:table;width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;border-radius:12px 12px 0 0;overflow:hidden;">
        <div class="pdf-thead" style="display:table-header-group;">${tableHeadHtml}</div>
        <div style="display:table-row-group;">${bodyRowsHtml}</div>
      </div>
    </div>`;

  // ---- card layout ----
  const titleCol = cardTitleKey ? columns.find(c => c.key === cardTitleKey) : null;
  const gridCols = columns.filter(c => !isLongField(c) && c !== titleCol);
  const longCols = columns.filter(c => isLongField(c) && c !== titleCol);
  function cardHtml(row, i) {
    const gridItems = gridCols.map(c => `
      <div>
        <div style="font-size:10px;color:#9FAAB0;font-weight:700;margin-bottom:3px;">${sgpEsc(c.label)}</div>
        <div style="font-size:12.5px;color:#0E1A20;line-height:1.4;">${sgpFmtPdfCell(row[c.key], c)}</div>
      </div>`).join('');
    const longItems = longCols.map(c => {
      const v = sgpFmtPdfCell(row[c.key], c, true);
      if (v === SGP_PDF_EMPTY) return '';
      return `
        <div style="margin-top:12px;padding:10px 12px;background:#F7FAF8;border-radius:10px;">
          <div style="font-size:10px;color:#637178;font-weight:700;margin-bottom:4px;">${sgpEsc(c.label)}</div>
          <div style="font-size:12.5px;color:#0E1A20;line-height:1.55;white-space:pre-wrap;">${v}</div>
        </div>`;
    }).join('');
    return `
      <div class="pdf-card" style="border:1px solid #E3E9E6;border-right:4px solid #22D86B;border-radius:12px;padding:14px 18px 16px;margin-bottom:12px;background:#fff;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <span style="background:#0E1A20;color:#fff;font-size:10.5px;font-weight:800;padding:3px 10px;border-radius:999px;">#${i + 1}</span>
          ${titleCol ? `<span style="font-size:14.5px;font-weight:800;color:#0E1A20;">${sgpFmtPdfCell(row[titleCol.key], titleCol, true)}</span>` : ''}
        </div>
        ${gridItems ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px 18px;">${gridItems}</div>` : ''}
        ${longItems}
      </div>`;
  }
  const cardsWrap = cardsHtml => `<div style="padding:18px 40px 22px;">${cardsHtml}</div>`;

  const headFirst = sgpBannerHtml(genStr, bannerLogo)
    + sgpTitleBlockHtml({ title, subtitle, names, period, periodLabel, count: rows.length, ico });
  const headNext = sgpContinuationHeaderHtml(title);
  const foot = sgpFooterHtml(title);
  const allBody = useCardLayout
    ? cardsWrap(rows.map((r, i) => cardHtml(r, i)).join(''))
    : tableWrap(rows.map((r, i) => rowHtml(r, i)).join(''));

  // ---- measure every part once, then plan the pages ----
  const m = sgpMakeRoot(rootW);
  m.innerHTML = `<div data-m="first">${headFirst}</div><div data-m="next">${headNext}</div><div data-m="foot">${foot}</div><div data-m="body">${allBody}</div>`;
  await sgpWaitForImages(m);
  const hOf = el => el.getBoundingClientRect().height;
  const firstH = hOf(m.querySelector('[data-m="first"]'));
  const nextH = hOf(m.querySelector('[data-m="next"]'));
  const footH = hOf(m.querySelector('[data-m="foot"]'));
  const bodyEl = m.querySelector('[data-m="body"]');
  const theadH = useCardLayout ? 0 : hOf(bodyEl.querySelector('.pdf-thead'));
  const itemHeights = useCardLayout
    ? Array.from(bodyEl.querySelectorAll('.pdf-card')).map(el => hOf(el) + 12)
    : Array.from(bodyEl.querySelectorAll('.pdf-tr')).map(hOf);
  const chrome = hOf(bodyEl) - theadH - itemHeights.reduce((a, b) => a + b, 0);
  document.body.removeChild(m);

  const pages = [];
  let idx = 0;
  while (idx < rows.length) {
    const first = pages.length === 0;
    const available = pageHeightPx - (first ? firstH : nextH) - footH - chrome - theadH - 6;
    let used = 0;
    const start = idx;
    while (idx < rows.length && (used + itemHeights[idx]) <= available) {
      used += itemHeights[idx];
      idx++;
    }
    if (idx === start) idx++;
    pages.push({ startIdx: start, endIdx: idx, first });
  }

  for (let p = 0; p < pages.length; p++) {
    const { startIdx, endIdx, first } = pages[p];
    const chunk = rows.slice(startIdx, endIdx);
    const bodyHtml = useCardLayout
      ? cardsWrap(chunk.map((r, i) => cardHtml(r, startIdx + i)).join(''))
      : tableWrap(chunk.map((r, i) => rowHtml(r, startIdx + i)).join(''));
    await sgpPaintPage(pdf, (first ? headFirst : headNext) + bodyHtml + foot,
      { rootW, landscape, footPx: footH, addPage: !(isFirstSectionOverall && p === 0) });
  }
  return pages.length;
}

function sgpPdfFileName(title) {
  return `${String(title).replace(/[\\/:*?"<>|]+/g, '-')}_${new Date().toISOString().slice(0, 10)}.pdf`;
}

// Single-report export: one dataset, one PDF, saved immediately.
// Optional: ico (3D icon beside the title), layout 'cards'|'table', cardTitleKey,
// periodLabel (the label over periodText, default "תקופה").
async function sgpExportPdf(opts) {
  const { title, columns, rows, layout } = opts;
  if (!rows.length) { toast('אין נתונים תואמים לסינון שנבחר', 'error'); return; }
  const { landscape } = sgpLayoutOf(columns, layout);

  try {
    const pdf = new window.jspdf.jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    await sgpRenderSectionIntoPdf(pdf, opts, { isFirstSectionOverall: true });
    sgpStampPageNumbers(pdf);
    pdf.save(sgpPdfFileName(title));
    toast('הדוח ירד בהצלחה', 'success');
  } catch (err) {
    console.error(err);
    toast('שגיאה ביצירת ה-PDF: ' + err.message, 'error');
  }
}

// Cover of the full-system export: company, scope, and a contents list with the page
// each module starts on.
function sgpCoverHtml({ fileTitle, names, period, genStr, logoHtml, toc }) {
  const total = toc.reduce((a, t) => a + t.count, 0);
  return `
    <div style="position:relative;overflow:hidden;background:linear-gradient(135deg,#0E1A20 0%,#16262E 70%,#0E1A20 100%);padding:54px 48px 46px;">
      <div style="position:absolute;left:-120px;top:-140px;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,rgba(34,216,107,0.30) 0%,rgba(34,216,107,0) 70%);"></div>
      <div style="position:relative;display:flex;align-items:center;gap:16px;">
        ${logoHtml}
        <div style="width:1px;height:40px;background:rgba(255,255,255,0.18);"></div>
        <div style="color:#fff;font-size:18px;font-weight:800;">${esc(orgDisplayName())}</div>
      </div>
      <div style="position:relative;margin-top:44px;color:#22D86B;font-size:12px;font-weight:800;letter-spacing:1.5px;">דוח מרוכז</div>
      <div style="position:relative;color:#fff;font-size:38px;font-weight:900;margin-top:6px;letter-spacing:-0.6px;">${sgpEsc(fileTitle)}</div>
      <div style="position:relative;color:rgba(255,255,255,0.7);font-size:13px;margin-top:10px;">הופק ב־${genStr}</div>
    </div>
    <div style="height:5px;background:linear-gradient(90deg,#16B650 0%,#22D86B 50%,#16B650 100%);"></div>
    <div style="padding:26px 48px 6px;display:flex;gap:12px;">
      ${sgpStatHtml('site', 'אתרים', sgpEsc(names.join(', ') || '—'))}
      ${sgpStatHtml('work-plan', 'תקופה', sgpEsc(period))}
      ${sgpStatHtml('reports', 'סה״כ רשומות', total, true)}
    </div>
    <div style="padding:22px 48px 30px;">
      <div style="font-size:15px;font-weight:800;color:#0E1A20;margin-bottom:10px;">תוכן הדוח</div>
      ${toc.map((t, i) => `
        <div style="display:flex;align-items:center;gap:14px;padding:10px 14px;border-radius:12px;background:${i % 2 ? '#fff' : '#F7FAF8'};">
          ${t.ico ? `<img src="icons/nav/${t.ico}.webp" style="width:30px;height:30px;flex-shrink:0;">` : '<span style="width:30px;"></span>'}
          <div style="flex:1;font-size:13.5px;font-weight:700;color:#0E1A20;">${sgpEsc(t.title)}</div>
          <div style="font-size:12px;color:#637178;font-weight:600;min-width:80px;">${t.count} רשומות</div>
          <div style="font-size:12px;color:#0B7A3B;font-weight:800;min-width:56px;text-align:left;">עמ׳ ${t.page}</div>
        </div>`).join('')}
    </div>
    ${sgpFooterHtml(fileTitle)}`;
}

// Full-system export: a cover with contents, then every module that has data, each
// starting on its own page(s).
async function sgpExportFullSystem({ sections, siteNames, periodText, fileTitle }) {
  const nonEmpty = sections.filter(s => s.rows && s.rows.length);
  if (!nonEmpty.length) { toast('אין נתונים לייצוא בטווח שנבחר', 'error'); return; }
  const title = fileTitle || 'דוח מערכת מלא';

  try {
    // page 1 is left for the cover, which is painted last once the page numbers are known
    const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const toc = [];
    for (const section of nonEmpty) {
      const startPage = pdf.internal.getNumberOfPages() + 1;
      const added = await sgpRenderSectionIntoPdf(pdf, { ...section, siteNames, periodText }, { isFirstSectionOverall: false });
      if (added) toc.push({ title: section.title, ico: section.ico, count: section.rows.length, page: startPage });
    }

    pdf.setPage(1);
    const cover = sgpCoverHtml({
      fileTitle: title, names: siteNames || [], period: periodText || 'כל התקופה',
      genStr: sgpGeneratedAt(), logoHtml: await pdfLogoHtml(46), toc,
    });
    const probe = sgpMakeRoot(920);
    probe.innerHTML = sgpFooterHtml(title);
    const footPx = probe.getBoundingClientRect().height;
    document.body.removeChild(probe);
    await sgpPaintPage(pdf, cover, { rootW: 920, landscape: false, footPx, addPage: false });

    sgpStampPageNumbers(pdf);
    pdf.save(sgpPdfFileName(title));
    toast('הדוח המלא ירד בהצלחה', 'success');
  } catch (err) {
    console.error(err);
    toast('שגיאה ביצירת הדוח המלא: ' + err.message, 'error');
  }
}
