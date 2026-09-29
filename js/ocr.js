// ===== Document reader for the data-entry pages (delivery notes, lab reports, quotes) =====
// Needs pdf.js (pdfjsLib) and Tesseract.js 5 loaded first.
//
// sgpReadDocument(file) returns the text of every page:
//  - A digital PDF (it carries its own text) is read directly: exact and instant. pdf.js
//    hands Hebrew back in visual order, so each line is put back into reading order.
//  - A scan or a photo goes through OCR, page by page:
//      1. orientation: copiers store delivery notes on their side or upside down, and
//         Tesseract reads a sideways page as noise, so the page is turned upright first
//         (Tesseract's orientation detector);
//      2. recognition at ~200 dpi with Hebrew + English;
//      3. numbers: the Hebrew model garbles figures such as 6,100.00 (it returned "0"),
//         so every word that holds a digit is read again with the English model and
//         replaced when that reading is confident.
// Then sgpParse.<kind>(text) turns the text into form fields.

const SGP_OCR_MAX_PAGES = 12;
const SGP_OCR_LONG_SIDE = 2400;                 // px on the page's long side, ~200 dpi on A4 (tested: at
                                                // 250+ dpi Tesseract drops whole table rows)
const SGP_PAGE_BREAK = '\n\f\n';                // between pages in the combined text

// ---- Tesseract workers: created on first use, then kept for the rest of the visit ----
const sgpOcrWorkers = {};
function sgpOcrWorker(kind) {
  if (!sgpOcrWorkers[kind]) {
    sgpOcrWorkers[kind] = (async () => {
      if (kind === 'main') {
        const w = await Tesseract.createWorker('heb+eng');
        // one column of lines: keeps each table row together as a line
        await w.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1' });
        return w;
      }
      if (kind === 'num') {
        const w = await Tesseract.createWorker('eng');
        await w.setParameters({ tessedit_pageseg_mode: '7' });   // a single word or line
        return w;
      }
      // orientation detection needs Tesseract's older engine and its 'osd' data
      return Tesseract.createWorker('osd', 0, { legacyCore: true, legacyLang: true });
    })();
    sgpOcrWorkers[kind].catch(() => { delete sgpOcrWorkers[kind]; });
  }
  return sgpOcrWorkers[kind];
}

// ---- canvas helpers ----------------------------------------------------------------
function sgpCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  return c;
}
function sgpScaled(src, scale) {
  const c = sgpCanvas(src.width * scale, src.height * scale);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c;
}
// turned clockwise by `deg` (0/90/180/270)
function sgpRotated(src, deg) {
  if (!deg) return src;
  const quarter = deg === 90 || deg === 270;
  const c = sgpCanvas(quarter ? src.height : src.width, quarter ? src.width : src.height);
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  g.rotate(deg * Math.PI / 180);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

// ---- digital PDFs: the page's own text, back in reading order ------------------------
const SGP_HEB_RE = /[֐-׿]/;
function sgpTextFromItems(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const x = it.transform[4], y = it.transform[5];
    const h = Math.abs(it.transform[3]) || it.height || 10;
    let row = rows.find(r => Math.abs(r.y - y) < h * 0.5);
    if (!row) rows.push(row = { y, items: [] });
    row.items.push({ x, s: it.str.trim() });
  }
  rows.sort((a, b) => b.y - a.y);                      // PDF y grows upwards
  return rows.map(r => {
    // right to left, except that a run without Hebrew (numbers, English) keeps its own order
    const byX = r.items.sort((a, b) => b.x - a.x);
    const out = [];
    let run = [];
    const flush = () => { out.push(...run.reverse()); run = []; };
    for (const it of byX) {
      if (SGP_HEB_RE.test(it.s)) { flush(); out.push(it); } else run.push(it);
    }
    flush();
    return out.map(i => i.s).join(' ');
  }).join('\n');
}

// ---- scans: orientation, recognition, numbers --------------------------------------
async function sgpDetectAngle(canvas) {
  const small = sgpScaled(canvas, Math.min(1, 1400 / Math.max(canvas.width, canvas.height)));
  try {
    const osd = await sgpOcrWorker('osd');
    const { data } = await osd.detect(small);
    return data && data.orientation_confidence > 2 ? (data.orientation_degrees || 0) : 0;
  } catch (err) {
    // no orientation detector (e.g. its data could not be downloaded): keep the one of
    // the four turns that reads best
    console.warn('OCR: orientation detection unavailable, comparing turns instead', err);
    const main = await sgpOcrWorker('main');
    let best = { deg: 0, conf: -1 };
    for (const deg of [0, 90, 180, 270]) {
      const { data } = await main.recognize(sgpRotated(sgpScaled(small, 0.6), deg));
      if (data.confidence > best.conf) best = { deg, conf: data.confidence };
    }
    return best.deg;
  }
}

const SGP_CODE_RE = /^[A-Za-z]{0,3}\d[\d,./:-]*$/;      // 6,100.00  30/07/26  SH26002917  315
const SGP_DIGITS_RE = /^\d[\d,./:-]*$/;
async function sgpFixNumbers(data, canvas) {
  const num = await sgpOcrWorker('num');
  const lines = [];
  for (const line of data.lines || []) {
    const words = [];
    for (const w of line.words) {
      let text = w.text;
      if (/\d/.test(text)) {
        const b = w.bbox, pad = 6;
        const x0 = Math.max(0, b.x0 - pad), y0 = Math.max(0, b.y0 - pad);
        const cw = Math.min(canvas.width - x0, b.x1 - b.x0 + 2 * pad), ch = Math.min(canvas.height - y0, b.y1 - b.y0 + 2 * pad);
        if (cw > 4 && ch > 4) {
          const crop = sgpCanvas(cw, ch);
          crop.getContext('2d').drawImage(canvas, x0, y0, cw, ch, 0, 0, cw, ch);
          let got = null;
          const free = (await num.recognize(crop)).data;
          const ft = free.text.trim().replace(/\s+/g, '');
          if (free.confidence >= 70 && SGP_CODE_RE.test(ft)) got = ft;
          else {
            await num.setParameters({ tessedit_char_whitelist: '0123456789.,/:-' });
            const dig = (await num.recognize(crop)).data;
            await num.setParameters({ tessedit_char_whitelist: '' });
            const dt = dig.text.trim().replace(/\s+/g, '');
            if (dig.confidence >= 80 && SGP_DIGITS_RE.test(dt)) got = dt;
          }
          if (got) text = text.replace(/[A-Za-z]{0,3}\d[\d,./:?-]*/, got);
        }
      }
      words.push(text);
    }
    lines.push(words.join(' '));
  }
  return lines.join('\n');
}

async function sgpOcrCanvas(canvas) {
  const deg = await sgpDetectAngle(canvas);
  const upright = sgpRotated(canvas, deg);
  const main = await sgpOcrWorker('main');
  const { data } = await main.recognize(upright);
  const text = data.lines && data.lines.length ? await sgpFixNumbers(data, upright) : data.text;
  return { text, confidence: data.confidence, angle: deg };
}

function sgpLoadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('לא ניתן לפתוח את התמונה')); };
    img.src = url;                                      // browsers apply the photo's EXIF rotation
  });
}

// Reads every page (up to SGP_OCR_MAX_PAGES). onProgress receives a Hebrew status line.
async function sgpReadDocument(file, { onProgress = () => {} } = {}) {
  const pages = [];
  let totalPages = 1;
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')) {
    onProgress('פותח את הקובץ...');
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    totalPages = pdf.numPages;
    const n = Math.min(totalPages, SGP_OCR_MAX_PAGES);
    for (let i = 1; i <= n; i++) {
      const page = await pdf.getPage(i);
      const layer = sgpTextFromItems((await page.getTextContent()).items);
      if ((layer.match(/[א-תA-Za-z0-9]/g) || []).length >= 40) {
        pages.push({ text: layer, source: 'text' });
        continue;
      }
      onProgress(n > 1 ? `סורק עמוד ${i} מתוך ${n}...` : 'סורק את המסמך...');
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(4.2, SGP_OCR_LONG_SIDE / Math.max(base.width, base.height)) });
      const canvas = sgpCanvas(vp.width, vp.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      const r = await sgpOcrCanvas(canvas);
      pages.push({ text: r.text, source: 'ocr', confidence: r.confidence, angle: r.angle });
    }
  } else {
    onProgress('סורק את התמונה...');
    const img = await sgpLoadImage(file);
    // shrink large photos; never enlarge (smoothing a small scan up blurs it and costs accuracy)
    const scale = Math.min(1, SGP_OCR_LONG_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = sgpCanvas(img.naturalWidth * scale, img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const r = await sgpOcrCanvas(canvas);
    pages.push({ text: r.text, source: 'ocr', confidence: r.confidence, angle: r.angle });
  }
  return { pages, totalPages, text: pages.map(p => p.text).join(SGP_PAGE_BREAK) };
}

// The text as shown under "טקסט גולמי שזוהה": page by page when there are several.
function sgpDocumentRawText(doc) {
  const more = doc.totalPages > doc.pages.length ? `\n\n(נקראו ${doc.pages.length} העמודים הראשונים מתוך ${doc.totalPages})` : '';
  if (doc.pages.length === 1) return doc.pages[0].text + more;
  return doc.pages.map((p, i) => `——— עמוד ${i + 1} ———\n${p.text}`).join('\n\n') + more;
}

// ===== Turning text into fields ======================================================
// Hebrew letters are not "word" characters to JavaScript's \b, so these stand in for it.
const SGP_NOT_HEB_BEFORE = '(?<![\\u05D0-\\u05EA])';
const SGP_NOT_HEB_AFTER = '(?![\\u05D0-\\u05EA])';

function sgpNum(s) {
  if (s === null || s === undefined) return null;
  const n = parseFloat(String(s).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}
function sgpPages(text) { return String(text || '').split(SGP_PAGE_BREAK); }

// Every well-formed date in the text: 27/09/2026, 30.07.26, 1-8-2026 (day first).
function sgpDates(text) {
  const out = [];
  for (const m of String(text).matchAll(/(?<![\d/.-])(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?![\d/.-])/g)) {
    const d = +m[1], mo = +m[2];
    let y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 2000 || y > 2099) continue;
    out.push({ iso: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, index: m.index });
  }
  return out;
}
// The date that belongs to a label ("תאריך התעודה"): on the label's line, the one nearest
// to it (OCR sometimes puts the value before the label). Otherwise the first date.
function sgpDateNear(text, labelRe) {
  for (const line of String(text).split('\n')) {
    const m = line.match(labelRe);
    if (!m) continue;
    const dates = sgpDates(line);
    if (dates.length) return dates.sort((a, b) => Math.abs(a.index - m.index) - Math.abs(b.index - m.index))[0].iso;
  }
  const all = sgpDates(text);
  return all.length ? all[0].iso : null;
}

// A delivery note's number: the barcode line first (printed as *SH26002917*), else the
// number that follows "תעודת משלוח" / "מספר תעודה".
function sgpNoteNumber(page) {
  const bar = page.match(/\*\s*(?:\d{0,5}[A-Z]{0,2})?([A-Z]{2}\d{8})\s*\*/) || page.match(/(?<![A-Za-z0-9])((?:SH|DN)\d{8})(?!\d)/);
  if (bar) return bar[1];
  const m = page.match(/משלו[חהת][^\n\d]{0,22}?([A-Z]{0,3}\d{5,10})(?!\d)/)
    || page.match(/(?:מספר|מס['"׳]?)\s*תעודה[^\n\d]{0,8}([A-Z]{0,3}\d{5,10})(?!\d)/);
  if (!m) return null;
  // the Hebrew model tends to read the "SH" prefix as "51" / "5H"
  return m[1].replace(/^5[1H](2\d{7})$/, 'SH$1');
}
function sgpUnique(list) { return [...new Set(list.filter(Boolean))]; }

// "3 תעודות משלוח: 13 + ≈9.5 + ? = 22.5 מ"ק — בדקו את המסומנים" — one figure per delivery
// note: "?" where its amount could not be read, "≈" where it was worked out from the rows
// rather than read from the note's own total. A missing page shows instead of vanishing.
// perPage: [{ v: number|null, est: boolean }]
function sgpPageSummary(perPage, unit) {
  if (perPage.length < 2) return '';
  const fmt = n => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const total = perPage.reduce((a, p) => a + (p.v || 0), 0);
  const unsure = perPage.some(p => p.v === null || p.est);
  return `${perPage.length} תעודות משלוח: ${perPage.map(p => p.v === null ? '?' : (p.est ? '≈' : '') + fmt(p.v)).join(' + ')}`
    + ` = ${fmt(Math.round(total * 100) / 100)} ${unit}` + (unsure ? ' — בדקו את המסומנים' : '');
}
// the first line with text after line i (OCR leaves blank lines inside boxes)
function sgpNextLines(lines, i, n) { return lines.slice(i + 1).filter(l => l.trim()).slice(0, n); }

function sgpFindSupplier(text, known) {
  const low = String(text).toLowerCase();
  for (const s of known) if (s.needles.some(n => low.includes(n.toLowerCase()))) return s.label;
  // any "X בע"מ" company name, except our own (we are the customer on every note)
  const candidates = [...String(text).matchAll(/([א-ת][א-ת\s.'"]{2,30}(?:בע["'״]?מ|בעמ))/g)];
  const match = candidates.find(m => !looksLikeOwnCompany(m[1]));
  return match ? match[1].trim() : null;
}

const sgpParse = {
  // Concrete delivery notes (one truck per page) and concrete lab reports.
  concrete(text) {
    const r = {
      supplier: null, concrete_grade: null, volume_m3: null, delivery_note_number: null,
      lab_test_number: null, strength_7d: null, strength_28d: null, element: null, pour_date: null,
      _summary: '',
    };
    r.supplier = sgpFindSupplier(text, [
      { needles: ['מואסי', 'מוואסי', 'mawassi'], label: 'א.מואסי' },
      { needles: ['רדימיקס', 'readymix', 'ready mix'], label: 'רדימיקס' },
      { needles: ['הנקל'], label: 'הנקל' },
    ]);
    const grade = text.match(new RegExp(`${SGP_NOT_HEB_BEFORE}ב\\s*[-–]?\\s*(20|25|30|40|50)(?!\\d)`))
      || text.match(new RegExp(`(?<!\\d)(20|25|30|40|50)\\s*[-–]\\s*ב${SGP_NOT_HEB_AFTER}`));
    if (grade) r.concrete_grade = `ב-${grade[1]}`;

    const isLab = /LA\d{10,}|חוזק\s*לחיצה|דו["'״]?ח\s*בדיקה/.test(text);
    if (isLab) {
      r.pour_date = sgpDateNear(text, /תאריך\s*היציקה/);
      const lab = text.match(/(?<![A-Za-z0-9])(LA\d{10,16})(?!\d)/);
      if (lab) r.lab_test_number = lab[1];
      const age = text.match(/חוזק\s*לחיצה\s*(7|28)\s*יום/) || text.match(/(7|28)\s*יום\s*לחיצה/);
      const avg = text.match(/ממוצע\s*[:.]?\s*(\d{1,3}(?:\.\d{1,2})?)/) || text.match(/(\d{1,3}\.\d{1,2})\s*ממוצע/);
      if (avg) r[age && age[1] === '28' ? 'strength_28d' : 'strength_7d'] = sgpNum(avg[1]);
      r._summary = r.lab_test_number ? `דוח מעבדה ${r.lab_test_number}` : 'דוח מעבדה';
    } else {
      r.pour_date = sgpDateNear(text, /תארי[ךכן]/);
      // one delivery note (one truck) per page: add up the loads, list every note number
      const perPage = [], notes = [];
      for (const page of sgpPages(text)) {
        const q = page.match(/כמות\s*[:.]?\s*(\d+(?:[.,]\d+)?)\s*מ/);
        let v = q ? sgpNum(q[1].replace(',', '.')) : null;
        if (v !== null && !(v > 0 && v <= 20)) v = null;               // a truck carries up to ~12 m³
        const note = sgpNoteNumber(page);
        if (v === null && !note) continue;                              // not a delivery note page
        perPage.push({ v, est: false });
        notes.push(note);
      }
      const read = perPage.filter(p => p.v !== null);
      if (read.length) r.volume_m3 = Math.round(read.reduce((a, p) => a + p.v, 0) * 10) / 10;
      const list = sgpUnique(notes);
      if (list.length) r.delivery_note_number = list.join('\n');
      r._summary = sgpPageSummary(perPage, 'מ"ק');
    }
    const el = text.match(/אלמנט\s*[:.]?\s*([א-ת"'״]{2,12})/);
    if (el) {
      const w = el[1];
      const MAP = [[/^קיר.*דיפון/, 'קיר דיפון'], [/^קיר/, 'קיר'], [/^רצפ/, 'רצפה'], [/^עמוד/, 'עמודים'], [/^קור/, 'קורות'],
        [/^תקר/, 'תקרה'], [/^מדרג/, 'מדרגות'], [/^יסוד/, 'יסודות'], [/^ממ["'״]?ד/, 'ממ"ד'], [/^טופינג/, 'טופינג/החלקה']];
      const hit = MAP.find(([re]) => re.test(w));
      if (hit) r.element = hit[1];
    }
    return r;
  },

  // Rebar delivery notes (עין עירון and others); weights are summed over rows and pages.
  rebar(text) {
    const r = {
      supplier: null, diameter_text: null, weight_kg: null, delivery_note_number: null,
      plan_ref: null, location: null, delivery_date: null, _summary: '',
    };
    r.supplier = sgpFindSupplier(text, [
      { needles: ['עין עירון'], label: 'עין עירון בע"מ' },
      { needles: ['ERON STEEL'], label: 'ERON STEEL' },
      { needles: ['נוימן'], label: 'נוימן תעשיות פלדה' },
    ]);
    // each product row shows the shipped weight and the order's remaining weight, both in
    // ק"ג; the shipped one is the larger of the two
    const perPage = [], notes = [];
    for (const page of sgpPages(text)) {
      let pageKg = 0;
      for (const line of page.split('\n')) {
        if (!/ק["'״]?ג/.test(line)) continue;
        // weights are printed with decimals (4,929.00), which tells them apart from the
        // row's other numbers even when the text order separates a figure from its ק"ג
        let vals = [...line.matchAll(/(?<![\d,.])(\d{1,3}(?:,\d{3})+\.\d{1,3}|\d+\.\d{2,3})(?!\d)/g)].map(m => sgpNum(m[1]));
        if (!vals.length) {
          vals = [...line.matchAll(/(\d{1,3}(?:,\d{3})+|\d+)\s*ק["'״]?ג|ק["'״]?ג\s*(\d{1,3}(?:,\d{3})+|\d+)/g)]
            .map(m => sgpNum(m[1] || m[2]));
        }
        vals = vals.filter(v => v !== null);
        if (vals.length) pageKg += Math.max(...vals);
      }
      const note = sgpNoteNumber(page);
      if (!pageKg && !note) continue;                                   // e.g. a weighing ticket
      perPage.push({ v: pageKg > 0 ? Math.round(pageKg * 100) / 100 : null, est: false });
      notes.push(note);
    }
    const total = perPage.reduce((a, p) => a + (p.v || 0), 0);
    if (total > 0) r.weight_kg = Math.round(total * 100) / 100;
    const list = sgpUnique(notes);
    if (list.length) r.delivery_note_number = list.join('\n');

    const codes = new Set();
    for (const m of text.matchAll(/מיוחדת\s?(\d{1,2}-\d{1,2})/g)) codes.add(m[1]);
    for (const m of text.matchAll(/Ø\s?(\d{1,2})(?!\d)/g)) codes.add(m[1]);
    for (const m of text.matchAll(new RegExp(`(?<![\\d.])(\\d{1,2})\\s*(?:מ["'״]?מ${SGP_NOT_HEB_AFTER}|mm(?![a-z]))`, 'gi'))) codes.add(m[1]);
    if (codes.size) r.diameter_text = [...codes].join(', ');

    const po = text.match(/(?<![A-Za-z0-9])(SO\d{6,10})(?!\d)/i);
    if (po) r.plan_ref = po[1];
    else {
      const plan = text.match(/(?:רשימת ברזל|מס['"׳]? תוכנית|תוכנית מס['"׳]?)[:\s]*([A-Za-z0-9\-/]{2,15})/);
      if (plan) r.plan_ref = plan[1];
    }
    r.delivery_date = sgpDateNear(text, /תאריך\s*(?:ה)?תעודה/);
    r._summary = sgpPageSummary(perPage, 'ק"ג');
    return r;
  },

  // Prestressed slab delivery notes (רמט טרום and others).
  slab(text) {
    const r = {
      supplier: null, order_number: null, plan_ref: null, quantity_m2: null,
      delivery_note_number: null, location: null, delivery_date: null, _summary: '',
    };
    r.supplier = sgpFindSupplier(text, [{ needles: ['רמט טרום', 'ramet'], label: 'רמט טרום בע"מ' }]);
    // areas are printed with two decimals (129.73 מ"ר); anything else next to מ"ר is a
    // misread (e.g. "5620200מ"ר") and must not be added
    const ROW = /(?<![\d.])(\d{1,3}\.\d{2})\s*מ["'״]?ר/;
    const TOTAL = /(?<![\d.])(\d{1,4}\.\d{2})\s*מ["'״]?ר/;
    const perPage = [], notes = [];
    for (const page of sgpPages(text)) {
      const lines = page.split('\n');
      const at = lines.findIndex(l => /סיכום\s*כמויות/.test(l));
      const rows = lines.slice(0, at >= 0 ? at : lines.length).map(l => l.match(ROW)).filter(Boolean).map(m => sgpNum(m[1]));
      // the note's own total, under "סיכום כמויות" — unless it is smaller than one of its own
      // rows, which means part of it was misread (210.32 read as 0.32); then the rows added up
      let pageQty = null, est = false;
      if (at >= 0) {
        for (const l of [lines[at], ...sgpNextLines(lines, at, 3)]) { const m = l.match(TOTAL); if (m) { pageQty = sgpNum(m[1]); break; } }
      }
      if (pageQty !== null && rows.length && pageQty < Math.max(...rows)) pageQty = null;
      if (pageQty === null && rows.length) { pageQty = Math.round(rows.reduce((a, b) => a + b, 0) * 100) / 100; est = true; }
      const note = sgpNoteNumber(page);
      if (pageQty === null && !note) continue;                          // not a delivery note page
      perPage.push({ v: pageQty, est });
      notes.push(note);
    }
    const total = perPage.reduce((a, p) => a + (p.v || 0), 0);
    if (total > 0) r.quantity_m2 = Math.round(total * 100) / 100;
    const list = sgpUnique(notes);
    if (list.length) r.delivery_note_number = list.join('\n');
    const order = text.match(/(?:מס['"׳]? הזמנה|הזמנה מס['"׳]?)[:\s]*([0-9A-Za-z\-/]{2,15})/);
    if (order) r.order_number = order[1];
    const plan = text.match(/(?:מס['"׳]? תכנית|תכנית מס['"׳]?)[:\s]*([0-9A-Za-z\-/]{2,15})/);
    if (plan) r.plan_ref = plan[1];
    r.delivery_date = sgpDateNear(text, /תאריך\s*(?:ה)?תעודה/);
    r._summary = sgpPageSummary(perPage, 'מ"ר');
    return r;
  },

  // Price quotes.
  quote(text) {
    const r = { material: null, supplier: null, unit_price: null, unit: null };
    const price = text.match(/(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?:₪|ש["'״]?ח)/)
      || text.match(/מחיר[^\n\d]{0,12}(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/);
    if (price) r.unit_price = sgpNum(price[1]);
    const unit = text.match(new RegExp(`${SGP_NOT_HEB_BEFORE}(טון|מ["'״]?ק|מ["'״]?ר|יחידה|יח['"׳]?|ק["'״]?ג|מטר)${SGP_NOT_HEB_AFTER}`));
    if (unit) r.unit = unit[1];
    r.supplier = sgpFindSupplier(text, []);
    const material = text.match(new RegExp(`${SGP_NOT_HEB_BEFORE}(ברזל|פלדה|בטון|טרום|חול|חצץ|בלוקים|מלט|רשת)${SGP_NOT_HEB_AFTER}[^\\n]{0,20}`));
    if (material) r.material = material[0].trim();
    return r;
  },
};
