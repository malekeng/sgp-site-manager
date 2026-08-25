// PDF report builder for SGP
async function sgpExportPdf({ title, columns, rows, siteNames, periodText, subtitle }) {
  if (!rows.length) { toast('אין נתונים תואמים לסינון שנבחר', 'error'); return; }

  function fmtPdfCell(v, col) {
    if (col.type === 'docs') {
      if (!v || !v.length) return '<span style="color:#9aa0ab;">—</span>';
      return `<span style="display:inline-block;background:#E8FBF3;color:#00A86B;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700;">📎 ${v.length}</span>`;
    }
    if (v === null || v === undefined || v === '') return '<span style="color:#9aa0ab;">—</span>';
    if (col.type === 'boolean') {
      return v ? '<span style="color:#00A86B;font-weight:700;">כן</span>' : '<span style="color:#9aa0ab;">לא</span>';
    }
    if (col.type === 'date') return fmtDate(v);
    if (col.type === 'number') return `<span style="font-variant-numeric:tabular-nums;font-weight:600;">${fmtNum(v, col.digits ?? 2)}</span>`;
    let s = String(v);
    if (s.length > 80) s = s.slice(0, 77) + '…';
    return s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const now = new Date();
  const genStr = now.toLocaleDateString('he-IL') + ' · ' + now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const landscape = columns.length >= 5;
  const rootW = landscape ? 1280 : 920;
  const names = siteNames || [];
  const period = periodText || 'כל התקופה';
  const fileDate = now.toISOString().slice(0, 10);

  const tableHeadHtml = `
    <tr>
      <th style="background:#F7F8FC;color:#6B7090;font-weight:700;font-size:11px;text-align:right;padding:12px 10px;border-bottom:1px solid #E6EAF5;width:36px;">#</th>
      ${columns.map(c => `<th style="background:#F7F8FC;color:#6B7090;font-weight:700;font-size:11px;text-align:right;padding:12px 12px;border-bottom:1px solid #E6EAF5;white-space:nowrap;">${c.label}</th>`).join('')}
    </tr>`;

  function rowHtml(row, indexInFullSet) {
    return `
      <tr style="background:${indexInFullSet % 2 === 0 ? '#ffffff' : '#FAFBFE'};">
        <td style="padding:11px 10px;border-bottom:1px solid #EEF1F8;color:#A0A5C0;font-size:11px;font-weight:600;">${indexInFullSet + 1}</td>
        ${columns.map(c => `<td style="padding:11px 12px;border-bottom:1px solid #EEF1F8;color:#141729;vertical-align:top;line-height:1.45;">${fmtPdfCell(row[c.key], c)}</td>`).join('')}
      </tr>`;
  }

  function bannerHtml() {
    return `
      <div style="background:linear-gradient(135deg,#121A6B 0%,#0A1048 100%);padding:22px 32px;display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:14px;">
          <img src="icons/logo-white.svg" style="height:38px;display:block;" onerror="this.style.display='none'">
          <div>
            <div style="color:#fff;font-size:15px;font-weight:800;letter-spacing:-0.2px;">SGP · שי גיל פרויקטים</div>
            <div style="color:rgba(255,255,255,0.65);font-size:11.5px;margin-top:2px;">ניהול אתרי בנייה</div>
          </div>
        </div>
        <div style="color:rgba(255,255,255,0.8);text-align:left;font-size:12px;font-weight:600;">
          <div>הופק ב־${genStr}</div>
        </div>
      </div>
      <div style="height:4px;background:linear-gradient(90deg,#00D68F 0%,#3D9EFF 100%);"></div>`;
  }

  function titleBlockHtml() {
    return `
      <div style="padding:26px 32px 8px;">
        <h1 style="color:#121A6B;font-size:26px;font-weight:800;margin:0;letter-spacing:-0.4px;">${title}</h1>
        ${subtitle ? `<div style="color:#6B7090;font-size:13px;margin-top:6px;font-weight:500;">${subtitle}</div>` : ''}
        <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:14px;">
          <div style="background:#F4F6FB;border:1px solid #E6EAF5;border-radius:12px;padding:10px 14px;min-width:140px;">
            <div style="font-size:11px;color:#6B7090;font-weight:600;">אתרים</div>
            <div style="font-size:13px;font-weight:700;margin-top:2px;">${names.join(', ') || '—'}</div>
          </div>
          <div style="background:#F4F6FB;border:1px solid #E6EAF5;border-radius:12px;padding:10px 14px;min-width:140px;">
            <div style="font-size:11px;color:#6B7090;font-weight:600;">תקופה</div>
            <div style="font-size:13px;font-weight:700;margin-top:2px;">${period}</div>
          </div>
          <div style="background:#E8FBF3;border:1px solid rgba(0,214,143,0.25);border-radius:12px;padding:10px 14px;min-width:100px;">
            <div style="font-size:11px;color:#00A86B;font-weight:600;">סה״כ רשומות</div>
            <div style="font-size:18px;font-weight:800;color:#04231a;margin-top:2px;">${rows.length}</div>
          </div>
        </div>
      </div>`;
  }

  function continuationHeaderHtml(pageLabel) {
    return `
      <div style="padding:16px 32px 4px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #E6EAF5;">
        <div style="font-size:14px;font-weight:800;color:#121A6B;">${title} — המשך</div>
        <div style="font-size:11px;color:#A0A5C0;font-weight:600;">${pageLabel}</div>
      </div>`;
  }

  function footerHtml() {
    return `
      <div style="padding:16px 32px 22px;border-top:1px solid #E6EAF5;display:flex;justify-content:space-between;align-items:center;gap:12px;">
        <div style="color:#A0A5C0;font-size:11px;font-weight:600;">SGP ניהול אתרי בנייה — דוח אוטומטי מהמערכת</div>
        <div style="color:#A0A5C0;font-size:11px;font-weight:600;">${title}</div>
      </div>`;
  }

  function tableWrap(theadHtml, bodyRowsHtml) {
    return `
      <div style="padding:18px 32px 24px;">
        <table style="width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;border:1px solid #E6EAF5;border-radius:14px;overflow:hidden;">
          <thead>${theadHtml}</thead>
          <tbody>${bodyRowsHtml}</tbody>
        </table>
      </div>`;
  }

  async function waitForImages(el) {
    const imgs = Array.from(el.querySelectorAll('img'));
    await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(res => {
      img.addEventListener('load', res);
      img.addEventListener('error', res);
    })));
  }

  function makeRoot() {
    const root = document.createElement('div');
    root.style.cssText = `position:fixed;left:-9999px;top:0;width:${rootW}px;background:#fff;direction:rtl;font-family:Rubik,Segoe UI,Tahoma,sans-serif;color:#141729;`;
    document.body.appendChild(root);
    return root;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const margin = 6;
  const usableWMm = pageWidthMm - margin * 2;
  const usableHMm = pageHeightMm - margin * 2;
  const pxPerMm = rootW / usableWMm;          // DOM px (unscaled) per mm, independent of html2canvas's internal scale
  const pageHeightPx = usableHMm * pxPerMm;   // how many DOM px of content fit on one page

  try {
    // ---- Step 1: measure everything on one throwaway, fully-built root (all rows) ----
    const measureRoot = makeRoot();
    measureRoot.innerHTML = bannerHtml() + titleBlockHtml() + tableWrap(tableHeadHtml, rows.map((r, i) => rowHtml(r, i)).join('')) + footerHtml();
    await waitForImages(measureRoot);
    const measureRect = measureRoot.getBoundingClientRect();
    const theadEl = measureRoot.querySelector('thead');
    const theadTop = theadEl.getBoundingClientRect().top - measureRect.top;
    const theadHeight = theadEl.getBoundingClientRect().height;
    const trs = Array.from(measureRoot.querySelectorAll('tbody tr'));
    const rowHeights = trs.map(tr => tr.getBoundingClientRect().height);
    document.body.removeChild(measureRoot);

    // ---- Step 2: compute page break points that always fall between rows ----
    const pages = []; // each entry: { startIdx, endIdx (exclusive), isFirst, isLast }
    let idx = 0;
    let isFirst = true;
    while (idx < rows.length) {
      const availableForRows = isFirst
        ? (pageHeightPx - theadTop - theadHeight - 30 /* small buffer */)
        : (pageHeightPx - 80 /* continuation header */ - theadHeight - 30);
      let used = 0;
      const start = idx;
      while (idx < rows.length && (used + rowHeights[idx]) <= availableForRows) {
        used += rowHeights[idx];
        idx++;
      }
      if (idx === start) idx++; // guarantee progress even if a single row is taller than a page
      pages.push({ startIdx: start, endIdx: idx, isFirst });
      isFirst = false;
    }
    pages[pages.length - 1].isLast = true;

    // ---- Step 3: render + rasterize each page separately, one clean image per PDF page ----
    for (let p = 0; p < pages.length; p++) {
      const { startIdx, endIdx, isFirst: first, isLast } = pages[p];
      const chunkRowsHtml = rows.slice(startIdx, endIdx).map((r, i) => rowHtml(r, startIdx + i)).join('');
      const pageRoot = makeRoot();
      pageRoot.innerHTML =
        (first ? bannerHtml() + titleBlockHtml() : continuationHeaderHtml(`עמוד ${p + 1} מתוך ${pages.length}`)) +
        tableWrap(tableHeadHtml, chunkRowsHtml) +
        (isLast ? footerHtml() : '');
      await waitForImages(pageRoot);

      const canvas = await html2canvas(pageRoot, {
        scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: rootW,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const imgHeightMm = (canvas.height * usableWMm) / canvas.width;

      if (p > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', margin, margin, usableWMm, imgHeightMm);

      document.body.removeChild(pageRoot);
    }

    const total = pdf.internal.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      pdf.setPage(p);
      pdf.setFontSize(8);
      pdf.setTextColor(160, 165, 192);
      pdf.text(`${p} / ${total}`, pageWidthMm / 2, pageHeightMm - 3, { align: 'center' });
    }

    pdf.save(`${title}_${fileDate}.pdf`);
    toast('הדוח ירד בהצלחה', 'success');
  } catch (err) {
    console.error(err);
    toast('שגיאה ביצירת ה-PDF: ' + err.message, 'error');
  }
}
