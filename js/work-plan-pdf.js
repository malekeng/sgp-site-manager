// The weekly plan's PDF, in the look of the company's plan sheet: a navy band, the groups' legend, the
// warning line and one card per day. Painted page by page through sgpPaintPage (pdf-report.js).
const WP_PDF_W = 794;
const WP_PDF_H = 1123;
const WP_PDF_PAD = 36;
const WP_PDF_FOOT = 42;
const WP_PDF_GAP = 12;
const WP_NAVY = '#121A6B';
const WP_INK = '#3A4160';
const WP_LEGEND_GENERAL = 'כללי / ללא גרעין ספציפי';
const WP_WARNING = 'שימו לב: התכנית כפופה לשינויים בהתאם לזמינות הציוד והחומרים באתר ולתנאים המשתנים בשטח.';

function wpPdfDot(color) {
  return `<span style="display:block;width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0;"></span>`;
}

function wpPdfHeader({ orgName, logoHtml, site, plan }) {
  const where = [site.name, site.location].filter(Boolean).map(wpEsc).join(' · ');
  return `
    <div style="background:${WP_NAVY};color:#fff;padding:18px ${WP_PDF_PAD}px 14px;">
      <div style="display:flex;align-items:center;gap:14px;">
        ${logoHtml}
        <div style="width:1px;height:26px;background:rgba(255,255,255,0.28);"></div>
        <div style="font-size:14px;font-weight:700;">${wpEsc(orgName)}</div>
      </div>
      <div style="margin-top:10px;font-size:13px;font-weight:600;color:rgba(255,255,255,0.72);">${where}</div>
      <div style="margin-top:2px;font-size:25px;font-weight:800;line-height:1.25;">תכנית עבודה שבועית</div>
      <div style="margin-top:2px;font-size:13.5px;font-weight:600;color:rgba(255,255,255,0.72);">שבוע ${wpEsc(wpWeekText(plan))}</div>
    </div>
    <div style="height:4px;background:#00D68F;"></div>`;
}

function wpPdfLegend(groups) {
  const item = g => `
    <div style="display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:${WP_INK};">
      ${wpPdfDot(g.color)}<span>${wpEsc(g.name === WP_GENERAL ? WP_LEGEND_GENERAL : g.name)}</span>
    </div>`;
  return `<div style="background:#F7F8FC;border-bottom:1px solid #EFEFF4;padding:11px ${WP_PDF_PAD}px;display:flex;flex-wrap:wrap;gap:8px 20px;">${groups.map(item).join('')}</div>`;
}

function wpPdfWarning() {
  return `<div style="background:#FFF6E5;border-bottom:1px solid #FFDD9B;padding:11px ${WP_PDF_PAD}px;text-align:center;font-size:12.5px;font-weight:700;color:#8A5A00;">⚠ ${WP_WARNING}</div>`;
}

function wpPdfNotes(notes) {
  if (!notes) return '';
  return `<div style="padding:12px ${WP_PDF_PAD}px 0;font-size:12.5px;line-height:1.5;color:${WP_INK};white-space:pre-line;"><b>הערות: </b>${wpEsc(notes)}</div>`;
}

function wpPdfGroup(group) {
  const lines = group.lines.map(t => `
    <div style="display:flex;gap:8px;padding:2px 0;font-size:12.5px;line-height:1.4;color:${WP_INK};">
      <span style="color:#B4B8CC;flex-shrink:0;">–</span><span>${wpLineHtml(t)}</span>
    </div>`).join('');
  return `
    <div style="margin-top:6px;">
      <div style="display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:800;line-height:1.4;color:#1E2448;">${wpPdfDot(group.color)}<span>${wpEsc(group.name)}</span></div>
      ${lines}
    </div>`;
}

function wpPdfDayCard(day) {
  return `
    <div data-wp-card style="border:1px solid #E9EBF5;border-radius:12px;overflow:hidden;background:#fff;margin-bottom:${WP_PDF_GAP}px;">
      <div style="background:${WP_NAVY};color:#fff;padding:8px 18px;font-size:14px;font-weight:800;line-height:1.4;">${wpEsc(day.label)}</div>
      <div style="padding:2px 18px 9px;">${day.groups.map(wpPdfGroup).join('')}</div>
    </div>`;
}

// The page number is stamped into its middle by sgpStampPageNumbers when there is more than one page.
function wpPdfFooter({ site, genDate }) {
  return `<div style="margin-top:auto;height:${WP_PDF_FOOT}px;box-sizing:border-box;padding:12px ${WP_PDF_PAD}px 0;font-size:10.5px;font-weight:600;color:#9AA3B8;">הופק ב-${wpEsc(genDate)} · ${wpEsc(site.name)} · תכנית עבודה שבועית</div>`;
}

// `heights` are the measured sizes: { head, cards: [...] }; without them everything is on one page.
function workPlanPdfPages({ orgName, logoHtml, site, plan, tasks, genDate, heights }) {
  const head = `<div data-wp-head>${wpPdfHeader({ orgName, logoHtml, site, plan })}${wpPdfLegend(wpGroups(tasks))}${wpPdfWarning()}${wpPdfNotes(plan.notes)}</div>`;
  const cards = wpSheet(tasks).map(wpPdfDayCard);
  const foot = wpPdfFooter({ site, genDate });
  const room = WP_PDF_H - WP_PDF_FOOT - WP_PDF_PAD / 2;
  const sets = heights
    ? wpPaginate(heights.cards.map(h => h + WP_PDF_GAP), room - heights.head - WP_PDF_PAD / 2, room)
    : [cards.map((_, i) => i)];
  return sets.map((set, p) => `
    ${p === 0 ? head : ''}
    <div style="padding:${p === 0 ? WP_PDF_PAD / 2 : WP_PDF_PAD}px ${WP_PDF_PAD}px 0;">${set.map(i => cards[i]).join('')}</div>
    ${foot}`);
}

async function wpPdfMeasure(args) {
  const root = sgpMakeRoot(WP_PDF_W);
  root.innerHTML = workPlanPdfPages(args)[0];
  try {
    await sgpWaitForImages(root);
    return {
      head: root.querySelector('[data-wp-head]').offsetHeight,
      cards: Array.from(root.querySelectorAll('[data-wp-card]')).map(c => c.offsetHeight),
    };
  } finally {
    document.body.removeChild(root);
  }
}

async function exportWorkPlanPdf({ site, plan, tasks }) {
  try {
    const now = new Date();
    const args = { orgName: orgDisplayName(), logoHtml: await pdfLogoHtml(34), site, plan, tasks,
      genDate: `${now.getDate()}.${now.getMonth() + 1}.${now.getFullYear()}` };
    const pages = workPlanPdfPages({ ...args, heights: await wpPdfMeasure(args) });
    const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    for (let p = 0; p < pages.length; p++) {
      await sgpPaintPage(pdf, pages[p], { rootW: WP_PDF_W, landscape: false, footPx: WP_PDF_FOOT, addPage: p > 0 });
    }
    if (pages.length > 1) sgpStampPageNumbers(pdf);
    pdf.save(wpFileName(site.name, plan));
    toast('הדוח ירד בהצלחה', 'success');
  } catch (err) {
    console.error(err);
    toast('שגיאה ביצירת ה-PDF: ' + err.message, 'error');
  }
}
