// ===== Purchase order PDF ("הזמנת רכש") =====
// The rebar order's sheet (rebar-pdf.js: band, chips, info boxes, dark table head) with the fields of
// the company's Excel form. It goes from the company to its supplier, so no platform name appears.
// Tables are display:table divs: html2canvas 1.4.1 paints nothing inside real <td>.

const PO_PDF_TITLE = 'הזמנת רכש';
const PO_PDF_H = Math.floor(REBAR_PDF_W * 297 / 210);   // A4 portrait at the engine's width
const PO_PDF_TABLE_PAD = 18;                            // the padding around a page's table
const PO_PDF_COLS = [
  { t: 'מס\'', w: 44 }, { t: 'מק"ט', w: 86 }, { t: 'תיאור הפריט', w: 282 }, { t: 'יחידה', w: 72 },
  { t: 'כמות', w: 72, num: true }, { t: 'מחיר ליחידה (₪)', w: 112, num: true }, { t: 'הנחה %', w: 60, num: true }, { t: 'סה"כ (₪)', w: 112, num: true },
];
const PO_PDF_SIGNS = ['הוזמן ע"י (שם וחתימה)', 'אישור מנהל/ת פרויקט', 'אישור הספק (חתימה וחותמת)'];

function poPdfFirstHead({ orgName, logoHtml, site, order, items, company, genStr }) {
  const c = company || {}, who = order.orderer || {}, esc = rebarPdfEsc;
  const dot = parts => parts.filter(x => String(x || '').trim()).join(' · ');
  const contacts = (order.contacts || []).map(x => esc(dot([x.name, x.phone]))).join('<br>');
  const draft = order.status === 'draft'
    ? '<span style="display:inline-block;margin-inline-start:10px;padding:3px 12px;border-radius:999px;background:#FFF1DC;color:#8A5300;font-size:12px;font-weight:800;vertical-align:middle;">טיוטה</span>' : '';
  return `<div data-po-head>${rebarPdfBanner(orgName, logoHtml, genStr, PO_PDF_TITLE)}
    <div style="padding:22px 40px 4px;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="width:62px;height:62px;border-radius:18px;background:#F3F6F4;border:1px solid #E3E9E6;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <img src="icons/nav/outgoing.webp" style="width:44px;height:44px;">
        </div>
        <div style="min-width:0;">
          <h1 style="color:#0E1A20;font-size:26px;font-weight:800;margin:0;line-height:1.2;">${PO_PDF_TITLE} ${esc(order.order_no)}${draft}</h1>
          <div style="color:#637178;font-size:13px;margin-top:5px;font-weight:500;">תאריך הזמנה ${rebarPdfDate(order.order_date)}</div>
        </div>
      </div>
      <div style="display:flex;gap:12px;margin-top:16px;">
        ${rebarPdfChip('site', 'פרויקט / אתר', esc(site && site.name))}
        ${rebarPdfChip('work-plan', 'מועד אספקה נדרש', rebarPdfDate(order.required_date))}
        ${rebarPdfChip('suppliers', 'ספק', esc(order.supplier || '—'))}
        ${rebarPdfChip('prices', 'סה"כ לתשלום (₪)', poMoney(poTotals(items, order.vat_pct).total), true)}
      </div>
      <div style="display:flex;gap:12px;margin-top:12px;">
        ${rebarPdfInfoBox('המזמין', [['חברה', esc(orgName)], ['ח.פ', esc(c.tax_id)], ['כתובת', esc(c.address)], ['טלפון', esc(c.phone)],
          ['דוא״ל', esc(c.email)], ['הוזמן ע"י', esc(dot([who.name, who.phone]))]])}
        ${rebarPdfInfoBox('לכבוד (ספק)', [['שם', esc(order.supplier)], ['ח.פ / ע.מ', esc(order.supplier_tax_id)], ['איש קשר', esc(order.supplier_contact)],
          ['טלפון', esc(order.supplier_phone)], ['דוא״ל', esc(order.supplier_email)], ['תנאי תשלום', esc(order.payment_terms)]])}
        ${rebarPdfInfoBox('פרטי אספקה', [['כתובת', esc(order.delivery_address)], ['אנשי קשר', contacts]])}
      </div>
    </div></div>`;
}

function poPdfTable(rows) {
  const th = c => `<div style="${RP_TH}width:${c.w}px;box-sizing:border-box;${c.num ? 'text-align:left;' : ''}">${rebarPdfEsc(c.t)}</div>`;
  return `
    <div style="padding:14px 40px 4px;">
      <div style="display:table;width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0;border-radius:12px 12px 0 0;overflow:hidden;">
        <div data-po-thead style="display:table-row;background:#0E1A20;">${PO_PDF_COLS.map(th).join('')}</div>
        ${rows}
      </div>
    </div>`;
}

function poPdfRow(it, i) {
  const esc = rebarPdfEsc;
  const cell = (v, extra = '') => `<div style="${RP_TD}${extra}">${v}</div>`;
  const num = (v, extra = '') => cell(v, 'text-align:left;white-space:nowrap;' + extra);
  const disc = Number(it.discount_pct) ? poQty(it.discount_pct) : '—';
  return `
    <div data-po-row style="display:table-row;background:${i % 2 ? '#F7FAF8' : '#ffffff'};">
      ${cell(`<span style="display:inline-block;min-width:22px;padding:2px 6px;border-radius:999px;background:#EAFBF1;color:#0B7A3B;font-size:10.5px;font-weight:800;">${i + 1}</span>`, 'text-align:center;padding:8px 6px;')}
      ${cell(esc(it.sku) || '—')}
      ${cell(esc(it.description))}
      ${cell(esc(it.unit))}
      ${num(poQty(it.qty))}${num(poMoney(it.unit_price))}${num(disc)}${num(poMoney(poLineTotal(it)), 'font-weight:800;')}
    </div>`;
}

function poPdfTail({ order, items }) {
  const t = poTotals(items, order.vat_pct), vatPct = Number(order.vat_pct) || 0;
  const row = (k, v, strong) => `
    <div style="display:flex;justify-content:space-between;gap:14px;padding:${strong ? '11px 16px' : '8px 16px'};${strong ? 'background:#EAFBF1;' : 'border-bottom:1px solid #E8EEEA;'}font-size:${strong ? 14 : 12.5}px;font-weight:${strong ? 800 : 600};color:#0E1A20;">
      <span>${rebarPdfEsc(k)}</span><span style="white-space:nowrap;">${poMoney(v)} ₪</span>
    </div>`;
  const notes = order.notes
    ? `<div style="flex:1;min-width:0;border:1px solid #E3E9E6;border-radius:12px;padding:12px 14px;font-size:12px;line-height:1.55;color:#0E1A20;white-space:pre-line;"><b style="color:#0B7A3B;">הערות:</b> ${rebarPdfEsc(order.notes)}</div>`
    : '<div style="flex:1;min-width:0;"></div>';
  const sign = s => `
    <div style="flex:1;min-width:0;">
      <div style="height:46px;border-bottom:1px solid #0E1A20;"></div>
      <div style="margin-top:6px;font-size:11.5px;font-weight:700;color:#637178;text-align:center;">${rebarPdfEsc(s)}</div>
    </div>`;
  return `
    <div data-po-tail style="padding:12px 40px 10px;">
      <div style="display:flex;gap:16px;align-items:flex-start;">
        ${notes}
        <div style="width:330px;flex-shrink:0;border:1px solid #E3E9E6;border-radius:12px;overflow:hidden;">
          ${row('סה"כ לפני מע"מ', t.net)}${row(`מע"מ ${poQty(vatPct)}%`, t.vat)}${row('סה"כ לתשלום כולל מע"מ', t.total, true)}
        </div>
      </div>
      <div style="display:flex;gap:28px;margin-top:22px;">${PO_PDF_SIGNS.map(sign).join('')}</div>
    </div>`;
}

// `heights` are the measured sizes: { head, thead, next, foot, rows: [...], tail }; without them all is on one page.
function purchasePdfPages({ orgName, logoHtml, site, order, items, company, genStr, heights }) {
  const gen = genStr || new Date().toLocaleDateString('he-IL');
  const rows = (items || []).map(poPdfRow);
  const tail = poPdfTail({ order, items });
  const h = heights;
  const sets = h
    ? poPaginate(h.rows, h.tail, PO_PDF_H - h.head - h.thead - h.foot - PO_PDF_TABLE_PAD, PO_PDF_H - h.next - h.thead - h.foot - PO_PDF_TABLE_PAD)
    : [{ rows: rows.map((_, i) => i), tail: true }];
  return sets.map((set, p) => {
    const head = p === 0 ? poPdfFirstHead({ orgName, logoHtml, site, order, items, company, genStr: gen }) : rebarPdfNextHead(orgName, order, PO_PDF_TITLE);
    const table = set.rows.length || p === 0 ? poPdfTable(set.rows.map(i => rows[i]).join('')) : '';
    return head + table + (set.tail ? tail : '') + `<div data-po-foot style="margin-top:auto;">${rebarPdfFoot(orgName, order, p + 1, sets.length, PO_PDF_TITLE)}</div>`;
  });
}

// ---- in the browser ----
async function poPdfMeasure(args) {
  const root = sgpMakeRoot(REBAR_PDF_W);
  root.innerHTML = purchasePdfPages(args)[0] + `<div data-po-next>${rebarPdfNextHead(args.orgName, args.order, PO_PDF_TITLE)}</div>`;
  try {
    await sgpWaitForImages(root);
    const h = sel => root.querySelector(sel).offsetHeight;
    return { head: h('[data-po-head]'), thead: h('[data-po-thead]'), next: h('[data-po-next]'), foot: h('[data-po-foot]'), tail: h('[data-po-tail]'),
      rows: Array.from(root.querySelectorAll('[data-po-row]')).map(r => r.offsetHeight) };
  } finally {
    document.body.removeChild(root);
  }
}

async function poExportPdf({ order, items, site, company }) {
  const logo = await orgLogo(activeOrg);
  const args = { orgName: orgDisplayName(), logoHtml: logo.isCompany ? await pdfLogoHtml(40) : '', site, order, items, company, genStr: sgpGeneratedAt() };
  const pages = purchasePdfPages({ ...args, heights: await poPdfMeasure(args) });
  const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  for (let p = 0; p < pages.length; p++) {
    await sgpPaintPage(pdf, pages[p], { rootW: REBAR_PDF_W, landscape: false, footPx: 50, addPage: p > 0 });
  }
  return pdf.output('blob');
}
