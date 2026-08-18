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
    return s.replace(/</g, '<').replace(/>/g, '>');
  }

  const now = new Date();
  const genStr = now.toLocaleDateString('he-IL') + ' · ' + now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const landscape = columns.length >= 5;
  const rootW = landscape ? 1280 : 920;

  const root = document.createElement('div');
  root.style.cssText = `position:fixed;left:-9999px;top:0;width:${rootW}px;background:#fff;direction:rtl;font-family:Rubik,Segoe UI,Tahoma,sans-serif;color:#141729;`;

  const names = siteNames || [];
  const period = periodText || 'כל התקופה';

  root.innerHTML = `
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
    <div style="height:4px;background:linear-gradient(90deg,#00D68F 0%,#3D9EFF 100%);"></div>

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
    </div>

    <div style="padding:18px 32px 24px;">
      <table style="width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;border:1px solid #E6EAF5;border-radius:14px;overflow:hidden;">
        <thead>
          <tr>
            <th style="background:#F7F8FC;color:#6B7090;font-weight:700;font-size:11px;text-align:right;padding:12px 10px;border-bottom:1px solid #E6EAF5;width:36px;">#</th>
            ${columns.map(c => `<th style="background:#F7F8FC;color:#6B7090;font-weight:700;font-size:11px;text-align:right;padding:12px 12px;border-bottom:1px solid #E6EAF5;white-space:nowrap;">${c.label}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, i) => `
            <tr style="background:${i % 2 === 0 ? '#ffffff' : '#FAFBFE'};">
              <td style="padding:11px 10px;border-bottom:1px solid #EEF1F8;color:#A0A5C0;font-size:11px;font-weight:600;">${i + 1}</td>
              ${columns.map(c => `<td style="padding:11px 12px;border-bottom:1px solid #EEF1F8;color:#141729;vertical-align:top;line-height:1.45;">${fmtPdfCell(row[c.key], c)}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div style="padding:16px 32px 22px;border-top:1px solid #E6EAF5;display:flex;justify-content:space-between;align-items:center;gap:12px;">
      <div style="color:#A0A5C0;font-size:11px;font-weight:600;">SGP ניהול אתרי בנייה — דוח אוטומטי מהמערכת</div>
      <div style="color:#A0A5C0;font-size:11px;font-weight:600;">${title}</div>
    </div>
  `;
  document.body.appendChild(root);

  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(res => {
    img.addEventListener('load', res);
    img.addEventListener('error', res);
  })));

  try {
    const canvas = await html2canvas(root, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: rootW,
    });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 6;
    const usableW = pageWidth - margin * 2;
    const imgHeight = (canvas.height * usableW) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    let heightLeft = imgHeight;
    let position = margin;
    pdf.addImage(imgData, 'JPEG', margin, position, usableW, imgHeight);
    heightLeft -= (pageHeight - margin * 2);

    while (heightLeft > 2) {
      position = margin - (imgHeight - heightLeft);
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', margin, position, usableW, imgHeight);
      heightLeft -= (pageHeight - margin * 2);
    }

    const total = pdf.internal.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      pdf.setPage(p);
      pdf.setFontSize(8);
      pdf.setTextColor(160, 165, 192);
      pdf.text(`${p} / ${total}`, pageWidth / 2, pageHeight - 3, { align: 'center' });
    }

    const fileDate = now.toISOString().slice(0, 10);
    pdf.save(`${title}_${fileDate}.pdf`);
    toast('הדוח ירד בהצלחה', 'success');
  } catch (err) {
    console.error(err);
    toast('שגיאה ביצירת ה-PDF: ' + err.message, 'error');
  } finally {
    document.body.removeChild(root);
  }
}
