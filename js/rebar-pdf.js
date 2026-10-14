// ===== Rebar order PDF ("הזמנת ברזל") =====
// The house PDF look (dark band, title block with its 3D icon, dark table head with the
// green rule, zebra rows) painted page by page through sgpPaintPage (pdf-report.js).
// The order goes from the company to its supplier, so only the company's name and logo
// appear — no platform name, and no logo at all when the company has none.
// Tables are display:table divs: html2canvas 1.4.1 paints nothing inside real <td>.

const REBAR_PDF_ROWS = { first: 10, next: 14 };  // order lines per page — a line with its drawing is ~64 px of a 1301 px page
const REBAR_PDF_SUMMARY_ROWS = 5;                 // free lines the summary needs on the last page
const REBAR_PDF_W = 920;                          // A4 portrait at the engine's width

function rebarPdfEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function rebarPdfNum(n, d = 2) {
  if (n === null || n === undefined || n === '') return '—';
  return Number(n).toLocaleString('he-IL', { maximumFractionDigits: d });
}
// technical values like 600×250, @20 or 14×Ø16 would flip inside right-to-left text
function rebarPdfLtr(v) {
  return `<span style="direction:ltr;unicode-bidi:embed;display:inline-block;">${rebarPdfEsc(v)}</span>`;
}
function rebarPdfDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '—';
}

const RP_TH = 'display:table-cell;color:#fff;font-weight:700;font-size:11px;text-align:right;padding:10px 10px;border-bottom:3px solid #22D86B;white-space:nowrap;';
const RP_TD = 'display:table-cell;padding:8px 10px;border-bottom:1px solid #E8EEEA;color:#0E1A20;vertical-align:middle;line-height:1.4;font-size:12px;';
const RP_SECTIONS = {
  bar: { title: 'מוטות', heads: ['#', 'שרטוט', 'כינוי', 'סוג פלדה', 'קוטר מ״מ', 'אורך ס״מ', 'כמות', 'יחידה ק״ג', 'סה״כ ק״ג'] },
  mesh: { title: 'רשתות', heads: ['#', 'כינוי', 'סוג רשת', 'X×Y ס״מ', 'קוטר מ״מ', 'פסיעה ס״מ', 'סוג פלדה', 'כמות', 'יחידה ק״ג', 'סה״כ ק״ג'] },
  pile: { title: 'כלונסאות', heads: ['#', 'כינוי', 'סוג', 'd/D ס״מ', 'מוטות', 'אורך ס״מ', 'ספירלה', 'תוספות', 'כמות', 'יחידה ק״ג', 'סה״כ ק״ג'] },
  element: { title: 'אלמנטים', heads: ['#', 'שרטוט', 'כינוי', 'סוג', 'פירוט', 'כמות', 'יחידה ק״ג', 'סה״כ ק״ג'] },
};

function rebarPdfBanner(orgName, logoHtml, genStr) {
  return `
    <div style="position:relative;overflow:hidden;background:linear-gradient(120deg,#0E1A20 0%,#16262E 100%);padding:24px 40px;display:flex;align-items:center;justify-content:space-between;">
      <div style="position:absolute;left:-70px;top:-90px;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(34,216,107,0.26) 0%,rgba(34,216,107,0) 70%);"></div>
      <div style="position:relative;display:flex;align-items:center;gap:16px;">
        ${logoHtml ? `${logoHtml}<div style="width:1px;height:36px;background:rgba(255,255,255,0.18);"></div>` : ''}
        <div>
          <div style="color:#fff;font-size:16px;font-weight:800;">${rebarPdfEsc(orgName)}</div>
          <div style="color:rgba(255,255,255,0.6);font-size:11.5px;margin-top:3px;">הזמנת ברזל</div>
        </div>
      </div>
      <div style="position:relative;text-align:left;">
        <div style="color:rgba(255,255,255,0.55);font-size:10.5px;font-weight:600;">תאריך הפקה</div>
        <div style="color:#fff;font-size:13px;font-weight:700;margin-top:3px;">${rebarPdfEsc(genStr)}</div>
      </div>
    </div>
    <div style="height:4px;background:linear-gradient(90deg,#16B650 0%,#22D86B 50%,#16B650 100%);"></div>`;
}

function rebarPdfChip(icon, label, value, accent) {
  return `
    <div style="flex:1;min-width:0;display:flex;align-items:center;gap:11px;background:${accent ? '#EAFBF1' : '#F7FAF8'};border:1px solid ${accent ? 'rgba(34,216,107,0.35)' : '#E3E9E6'};border-radius:14px;padding:11px 13px;">
      <img src="icons/nav/${icon}.webp" style="width:30px;height:30px;flex-shrink:0;">
      <div style="min-width:0;">
        <div style="font-size:10.5px;color:${accent ? '#0B7A3B' : '#637178'};font-weight:700;">${label}</div>
        <div style="font-size:${accent ? 18 : 13}px;font-weight:800;color:#0E1A20;margin-top:2px;">${value}</div>
      </div>
    </div>`;
}

function rebarPdfInfoBox(title, rows) {
  return `
    <div style="flex:1;min-width:0;border:1px solid #E3E9E6;border-radius:12px;padding:12px 14px;">
      <div style="font-size:11px;font-weight:800;color:#0B7A3B;margin-bottom:8px;">${title}</div>
      ${rows.filter(r => r[1]).map(([k, v]) => `
        <div style="display:flex;gap:8px;font-size:11.5px;line-height:1.55;">
          <div style="color:#637178;font-weight:700;white-space:nowrap;">${k}</div><div style="color:#0E1A20;font-weight:600;">${v}</div>
        </div>`).join('')}
    </div>`;
}

function rebarPdfFirstHead({ orgName, logoHtml, site, order, summary, genStr }) {
  const who = order.orderer || {};
  const contacts = (order.contacts || []).map(c => rebarPdfEsc([c.name, c.phone, c.role].filter(Boolean).join(' · '))).join('<br>');
  return rebarPdfBanner(orgName, logoHtml, genStr) + `
    <div style="padding:22px 40px 4px;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="width:62px;height:62px;border-radius:18px;background:#F3F6F4;border:1px solid #E3E9E6;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <img src="icons/nav/rebar.webp" style="width:44px;height:44px;">
        </div>
        <div style="min-width:0;">
          <h1 style="color:#0E1A20;font-size:26px;font-weight:800;margin:0;line-height:1.2;">הזמנת ברזל ${rebarPdfEsc(order.order_no)}</h1>
          <div style="color:#637178;font-size:13px;margin-top:5px;font-weight:500;">${rebarPdfEsc(order.name)}</div>
        </div>
      </div>
      <div style="display:flex;gap:12px;margin-top:16px;">
        ${rebarPdfChip('site', 'אתר', rebarPdfEsc(site && site.name))}
        ${rebarPdfChip('work-plan', 'תאריך אספקה נדרש', rebarPdfDate(order.required_date))}
        ${rebarPdfChip('suppliers', 'ספק', rebarPdfEsc(order.supplier || '—'))}
        ${rebarPdfChip('rebar', 'סה״כ (טון)', rebarPdfNum(summary.total_t, 2), true)}
      </div>
      <div style="display:flex;gap:12px;margin-top:12px;">
        ${rebarPdfInfoBox('המזמין', [['חברה', rebarPdfEsc(orgName)], ['יוצר ההזמנה', rebarPdfEsc([who.name, who.phone].filter(Boolean).join(' · '))], ['דוא״ל', rebarPdfEsc(who.email)]])}
        ${rebarPdfInfoBox('פרטי משלוח', [['כתובת', rebarPdfEsc(order.delivery_address)], ['אנשי קשר', contacts], ['הערות לנהג', rebarPdfEsc(order.driver_notes)]])}
      </div>
    </div>`;
}

function rebarPdfNextHead(orgName, order) {
  return `
    <div style="background:#0E1A20;padding:13px 40px;display:flex;align-items:center;justify-content:space-between;">
      <div style="color:#fff;font-size:13px;font-weight:800;">הזמנת ברזל ${rebarPdfEsc(order.order_no)} <span style="color:rgba(255,255,255,0.55);font-weight:600;">· המשך</span></div>
      <div style="color:rgba(255,255,255,0.7);font-size:11px;font-weight:600;">${rebarPdfEsc(orgName)}</div>
    </div>
    <div style="height:3px;background:linear-gradient(90deg,#16B650,#22D86B);"></div>`;
}

function rebarPdfFoot(orgName, order, page, pages) {
  return `
    <div style="margin-top:auto;padding:14px 40px 16px;border-top:1px solid #E3E9E6;display:flex;justify-content:space-between;align-items:center;gap:12px;">
      <div style="color:#9FAAB0;font-size:10.5px;font-weight:600;">${rebarPdfEsc(orgName)} · הזמנת ברזל ${rebarPdfEsc(order.order_no)}</div>
      <div style="color:#637178;font-size:10.5px;font-weight:800;">עמוד ${page} / ${pages}</div>
    </div>`;
}

function rebarPdfCells(it, drawings) {
  const cell = (v, extra = '') => `<div style="${RP_TD}${extra}">${v}</div>`;
  const num = (v, d) => cell(rebarPdfNum(v, d), 'text-align:left;white-space:nowrap;');
  const alias = cell(it.alias ? rebarPdfEsc(it.alias) : '—');
  const tail = num(it.qty, 0) + num(it.unit_kg, 2) + num(it.total_kg, 2).replace(RP_TD, RP_TD + 'font-weight:800;');
  const p = it.params || {};
  if (it.kind === 'bar') {
    const img = drawings[it.line_no] ? `<img src="${drawings[it.line_no]}" style="width:150px;height:55px;display:block;">` : '<span style="color:#9FAAB0;">כמו בקובץ</span>';
    return cell(img, 'padding:4px 8px;') + alias + cell(rebarPdfEsc(it.steel)) + num(it.diameter_mm, 1) + num(it.length_cm, 1) + tail;
  }
  if (it.kind === 'element') {
    // a spacer is counted, not weighed: its weights print as a dash
    const img = drawings['e' + it.line_no] ? `<img src="${drawings['e' + it.line_no]}" style="width:150px;height:55px;display:block;">` : '—';
    const weights = p.type === 'spacer' ? num(it.qty, 0) + cell('—', 'text-align:left;') + cell('—', 'text-align:left;') : tail;
    return cell(img, 'padding:4px 8px;') + alias + cell(rebarPdfEsc(elementLabel(it))) + (p.type === 'kranz' ? cell(rebarPdfLtr(elementDesc(it)), 'text-align:left;') : cell(rebarPdfEsc(elementDesc(it)))) + weights;
  }
  if (it.kind === 'mesh') {
    const asym = p.type === 'asym';
    return alias + cell(asym ? 'א-סימטרי' : 'סימטרי') + cell(rebarPdfLtr(`${p.x}×${p.y}`), 'text-align:left;white-space:nowrap;')
      + cell(rebarPdfLtr(asym ? `${it.diameter_mm} / ${p.d_y}` : it.diameter_mm), 'text-align:left;')
      + cell(rebarPdfLtr(asym ? `@${p.s} / @${p.s_x}` : `@${p.s}`), 'text-align:left;') + cell(rebarPdfEsc(it.steel)) + tail;
  }
  return alias + cell(rebarPdfEsc(p.pile_type || 'בסיס')) + cell(rebarPdfLtr(`${p.d}/${p.D}`), 'text-align:left;')
    + cell(rebarPdfLtr(`${p.n}×Ø${it.diameter_mm}`), 'text-align:left;') + num(it.length_cm, 1)
    + cell(rebarPdfLtr(`Ø${p.d_spiral} @${p.p1}/@${p.p2}`), 'text-align:left;')
    + cell(rebarPdfEsc((p.additions || []).join(', ') || '—')) + tail;
}

function rebarPdfTable(kind, lines, drawings) {
  const sec = RP_SECTIONS[kind];
  const head = `<div style="display:table-row;background:#0E1A20;">${sec.heads.map(h => `<div style="${RP_TH}">${h}</div>`).join('')}</div>`;
  const rows = lines.map(({ it, n }) => `
    <div data-line="${kind}-${it.line_no}" style="display:table-row;background:${n % 2 ? '#F7FAF8' : '#ffffff'};">
      <div style="${RP_TD}text-align:center;padding:8px 6px;"><span style="display:inline-block;min-width:22px;padding:2px 6px;border-radius:999px;background:#EAFBF1;color:#0B7A3B;font-size:10.5px;font-weight:800;">${it.line_no}</span></div>
      ${rebarPdfCells(it, drawings)}
    </div>`).join('');
  return `
    <div style="padding:14px 40px 4px;">
      <div style="font-size:14px;font-weight:800;color:#0E1A20;margin-bottom:8px;">${sec.title}</div>
      <div style="display:table;width:100%;border-collapse:separate;border-spacing:0;border-radius:12px 12px 0 0;overflow:hidden;">
        <div style="display:table-header-group;">${head}</div>
        <div style="display:table-row-group;">${rows}</div>
      </div>
    </div>`;
}

function rebarPdfMiniTable(title, heads, rows, foot) {
  const th = h => `<div style="${RP_TH}${h.num ? 'text-align:left;' : ''}">${h.t}</div>`;
  const tr = (r, i, bold) => `<div style="display:table-row;background:${i % 2 ? '#F7FAF8' : '#ffffff'};">${r.map((v, k) =>
    `<div style="${RP_TD}${k ? 'text-align:left;white-space:nowrap;' : ''}${bold ? 'font-weight:800;' : ''}">${v}</div>`).join('')}</div>`;
  return `
    <div style="flex:1;min-width:0;">
      <div style="font-size:12.5px;font-weight:800;color:#0E1A20;margin-bottom:6px;">${title}</div>
      <div style="display:table;width:100%;border-collapse:separate;border-spacing:0;border-radius:10px 10px 0 0;overflow:hidden;">
        <div style="display:table-row;background:#0E1A20;">${heads.map(th).join('')}</div>
        ${rows.map((r, i) => tr(r, i)).join('')}${foot ? tr(foot, rows.length, true) : ''}
      </div>
    </div>`;
}

function rebarPdfSummary(summary, wastePct) {
  const s = summary, n = rebarPdfNum;
  const secs = [['מוטות', s.sections.bar], ['רשתות', s.sections.mesh], ['כלונסאות', s.sections.pile], ['אלמנטים', s.sections.element]];
  return `
    <div style="padding:16px 40px 8px;">
      <div style="font-size:14px;font-weight:800;color:#0E1A20;margin-bottom:10px;">סיכום הזמנה</div>
      <div style="display:flex;gap:14px;align-items:flex-start;">
        ${rebarPdfMiniTable('עיבוד ופחת', [{ t: 'פריט' }, { t: 'כמות', num: true }], [
          ['חיתוך (ק״ג)', n(s.cut_kg, 1)], ['כיפוף (ק״ג)', n(s.bend_kg, 1)], ['יחידות', n(s.kal_units, 0)],
          [`פחת ${n(wastePct, 2)}% (טון)`, n(s.waste_t, 4)]], ['סה״כ כולל פחת (טון)', n(s.with_waste_t, 4)])}
        ${rebarPdfMiniTable('קטרים', [{ t: 'קוטר מ״מ' }, { t: 'אורך (מטר)', num: true }, { t: 'משקל (ק״ג)', num: true }],
          s.by_d.map(r => [n(r.d, 1), n(r.m, 1), n(r.kg, 2)]),
          ['סה״כ', n(s.by_d.reduce((a, r) => a + r.m, 0), 1), n(s.by_d.reduce((a, r) => a + r.kg, 0), 2)])}
        ${rebarPdfMiniTable('הזמנה', [{ t: '' }, { t: 'יחידות', num: true }, { t: 'משקל (טון)', num: true }],
          secs.map(([t, x]) => [t, n(x.units, 0), n(x.kg / 1000, 2)]), ['סה״כ', n(s.units, 0), n(s.total_t, 2)])}
      </div>
    </div>`;
}

// One HTML string per A4 page. Lines flow bar → mesh → pile, REBAR_PDF_ROWS per page,
// never split; the summary goes on the last page when it has room, else on a page of its own.
function rebarPdfPages({ orgName, logoHtml, site, order, items, summary, drawings, genStr }) {
  const rank = { bar: 0, mesh: 1, pile: 2, element: 3 };
  const lines = [...items].sort((a, b) => rank[a.kind] - rank[b.kind] || a.line_no - b.line_no);
  const chunks = [];
  let i = 0;
  while (i < lines.length) {
    const cap = chunks.length ? REBAR_PDF_ROWS.next : REBAR_PDF_ROWS.first;
    chunks.push(lines.slice(i, i + cap));
    i += cap;
  }
  if (!chunks.length) chunks.push([]);
  const last = chunks[chunks.length - 1];
  const lastCap = chunks.length === 1 ? REBAR_PDF_ROWS.first : REBAR_PDF_ROWS.next;
  if (lastCap - last.length < REBAR_PDF_SUMMARY_ROWS) chunks.push([]);
  const gen = genStr || new Date().toLocaleDateString('he-IL');
  const total = chunks.length;
  return chunks.map((chunk, p) => {
    const head = p === 0 ? rebarPdfFirstHead({ orgName, logoHtml, site, order, summary, genStr: gen }) : rebarPdfNextHead(orgName, order);
    const body = Object.keys(RP_SECTIONS).map(kind => {
      const own = chunk.filter(it => it.kind === kind);
      if (!own.length) return '';
      return rebarPdfTable(kind, own.map(it => ({ it, n: lines.indexOf(it) })), drawings || {});
    }).join('');
    const sum = p === total - 1 ? rebarPdfSummary(summary, order.waste_pct ?? 3) : '';
    return head + body + sum + rebarPdfFoot(orgName, order, p + 1, total);
  });
}

// ---- in the browser ----
function rebarSvgToPng(svg, w, h) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * 2; c.height = h * 2;
      const g = c.getContext('2d');   // transparent, so the drawing takes the row's own colour
      g.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

async function rebarExportPdf({ order, items, site }) {
  const summary = orderSummary(items, order.waste_pct ?? 3);
  const drawings = {};
  for (const it of items) {
    if (it.kind === 'bar' && it.shape) drawings[it.line_no] = await rebarSvgToPng(shapeSvg(it.shape, { w: 300, h: 110, stroke: 2.2 }), 300, 110);
    const el = it.kind === 'element' ? elementSvg(it.params, { w: 300, h: 110, stroke: 2.2 }) : null;
    if (el) drawings['e' + it.line_no] = await rebarSvgToPng(el, 300, 110);
  }
  const logo = await orgLogo(activeOrg);
  const logoHtml = logo.isCompany ? await pdfLogoHtml(40) : '';
  const pages = rebarPdfPages({ orgName: orgDisplayName(), logoHtml, site, order, items, summary, drawings, genStr: sgpGeneratedAt() });
  const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  for (let p = 0; p < pages.length; p++) {
    await sgpPaintPage(pdf, pages[p], { rootW: REBAR_PDF_W, landscape: false, footPx: 50, addPage: p > 0 });
  }
  return pdf.output('blob');
}

// a phone opens the share sheet (WhatsApp, mail…); a computer downloads the file
async function rebarShareOrDownload(blob, name) {
  const file = new File([blob], name, { type: 'application/pdf' });
  const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function rebarPdfName(order) { return `הזמנת ברזל ${order.order_no}.pdf`; }

// "PDF" on an issued order: the file again, nothing else changes
async function rebarDownloadPdf() {
  try {
    toast('מפיק PDF…');
    const blob = await rebarExportPdf({ order: state.order, items: state.items, site: state.ctx.site });
    await rebarShareOrDownload(blob, rebarPdfName(state.order));
  } catch (err) {
    console.error(err);
    toast('שגיאה ביצירת ה-PDF: ' + err.message, 'error');
  }
}

// "הפק PDF וסמן כנשלחה": save, make the PDF, keep a copy with the order, mark it sent, share
async function rebarIssue() {
  if (!state.items.length) { toast('אי אפשר לשלוח הזמנה בלי שורות', 'error'); return; }
  if (!(await saveOrder())) return;
  const { user, site } = state.ctx, order = state.order;
  try {
    toast('מפיק PDF…');
    const blob = await rebarExportPdf({ order, items: state.items, site });
    const name = rebarPdfName(order);
    const path = `${site.id}/rebar_orders/${order.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`;
    const { error: upErr } = await sb.storage.from('documents').upload(path, blob, { contentType: 'application/pdf' });
    if (upErr) throw upErr;
    const { error: dbErr } = await sb.from('documents').insert({
      site_id: site.id, doc_type: 'order', title: name, file_path: path, file_name: name, file_size: blob.size,
      linked_table: 'rebar_orders', linked_record_id: order.id, uploaded_by: user.id, document_date: new Date().toISOString().slice(0, 10),
    });
    if (dbErr) {
      // the file is stored but no record points to it — remove it rather than leave it behind
      await sb.storage.from('documents').remove([path]);
      throw dbErr;
    }
    if (!(await roSetStatus({ status: 'sent' }, 'ההזמנה סומנה כנשלחה — העותק נשמר במסמכי ההזמנה'))) return;
    await rebarShareOrDownload(blob, name);
  } catch (err) {
    console.error(err);
    toast('שגיאה ביצירת ה-PDF: ' + (err.message || err), 'error');
  }
}
