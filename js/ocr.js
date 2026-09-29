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

// A page that read as noise: few real Hebrew words, or low confidence.
function sgpLooksUnread(data) {
  return (String(data.text || '').match(/[א-ת]{3,}/g) || []).length < 12 || data.confidence < 45;
}

async function sgpOcrCanvas(canvas) {
  let deg = await sgpDetectAngle(canvas);
  let upright = sgpRotated(canvas, deg);
  const main = await sgpOcrWorker('main');
  let { data } = await main.recognize(upright);
  // Phone photos of a note lying upside down, with dark margins around it, fool the
  // orientation detector (one came back as nothing at all). When the page reads as noise,
  // compare the four turns on a small copy and read again the way that reads best.
  if (sgpLooksUnread(data)) {
    const small = sgpScaled(canvas, Math.min(1, 1200 / Math.max(canvas.width, canvas.height)));
    let best = { deg, conf: -1 };
    for (const d of [0, 90, 180, 270]) {
      const r = (await main.recognize(sgpRotated(small, d))).data;
      if (r.confidence > best.conf) best = { deg: d, conf: r.confidence };
    }
    if (best.deg !== deg) {
      deg = best.deg;
      upright = sgpRotated(canvas, deg);
      data = (await main.recognize(upright)).data;
    }
  }
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

// ===== What each attached document says — kept in documents.extracted ==============
// The documents are the source of the information the standards ask for (the ת״י 118
// fields of every truck, the lab's cubes, what was ordered and what arrived), so nothing
// here is typed by the user. sgpExtractFile(file) reads a document and keeps what is
// printed on it, truck by truck and cube by cube. A value the reader is not sure of is
// listed in `doubt`, so the screen says "check against the document" instead of trusting
// it or quietly correcting it. Handwriting (arrival time, signatures) is not read: the
// document itself stays the proof.
const SGP_EXTRACT_VERSION = 1;
const SGP_EXCELJS_SRC = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';

function sgpDocKind(text, fileName) {
  const t = String(text || ''), name = String(fileName || '');
  if (/(?<![A-Za-z0-9])LA\d{10,}/.test(t) || (/חוזק\s*לחיצה/.test(t) && /מעבד/.test(t))) return 'concrete_lab';
  if (/מ["'״]?ק/.test(t) && /(ערבל|דרגת\s*חשיפה|יציאה\s*בשעה|בטון\s*מו?א?סי|גרגיר)/.test(t)) return 'concrete_note';
  if (/(לוח["'״]?ד|דריכה|רמט)/.test(t) && /מ["'״]?ר/.test(t) && /משלוח/.test(t)) return 'slab_note';
  if (/(?:SH\d{8}|תעודת\s*משלוח)/.test(t) && /ק["'״]?ג/.test(t)) return 'rebar_note';
  if (/^הז[_\s-]*\d/.test(name) || (/הזמנ|להצעת מחיר/.test(t) && /(רשתות|ברזל|מוטות|קוטר|פסיעה)/.test(t))) return 'rebar_order';
  if (/(קבלן\s*מוכר|רשם\s*הקבלנים|פנקס\s*הקבלנים)/.test(t) && /סיווג/.test(t)) return 'contractor_cert';
  if (/(תסקיר|בודק\s*מוסמך|בדיקה\s*תקופתית)/.test(t) && /(הרמה|עגורן|מנוף|במה|מלגזה|אביזר)/.test(t)) return 'inspection';
  if (/(From:|Subject:|נושא:|מאת:)/.test(t) && /(מאושר|אושר|מאשרים|אישור)/.test(t)) return 'approval';
  return 'unknown';
}

// "תעודת קבלן מוכר" / registrar certificate: the branches with group and class, and expiry.
function sgpExtractContractorCert(text) {
  const r = { branches: [] };
  const co = text.match(/(?:לחברה|שם\s*הקבלן)[\s:]*\n?\s*([^\n]{3,60}?)\s*,?\s*(\d{9})/);
  if (co) { r.company = co[1].replace(/\s+/g, ' ').replace(/בע\s*["״]\s*מ/, 'בע"מ').trim(); r.company_no = co[2]; }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(\d{3})\s+(.+?)\s+([א-ה])\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d)\s*$/);
    if (m) r.branches.push({ code: m[1], name: m[2].trim(), group: m[3], class: +m[5], expiry: sgpDates(m[4])[0]?.iso || null });
  }
  // the date AFTER "תוקף … עד" (the issue date often sits on the same line, before it)
  const until = text.match(/תוקף[^\n\d]{0,25}עד\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{2,4})/);
  r.valid_until = until ? (sgpDates(until[1])[0]?.iso || null)
    : (r.branches.length ? r.branches.map(b => b.expiry).filter(Boolean).sort()[0] || null : null);
  const issued = text.match(/תאריך\s*מתן[^\n]*?(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (issued) r.issued = sgpDates(issued[1])[0]?.iso || null;
  if (/קבלן\s*מוכר/.test(text)) r.type = 'קבלן מוכר לעבודות ממשלתיות';
  else if (/רשם\s*הקבלנים|פנקס\s*הקבלנים/.test(text)) r.type = 'רשם הקבלנים';
  return r;
}

// An approval that arrived by email: "הקבלן מאושר", when, and the line that says so.
function sgpExtractApproval(text) {
  const lines = text.split('\n');
  const i = lines.findIndex(l => /(מאושר|אושר|מאשרים)/.test(l) && !/(לאישור|אישורים)\s*$/.test(l.trim()));
  const r = { approved: i >= 0 };
  if (i >= 0) r.quote = lines[i].trim().slice(0, 160);
  // the newest message comes first in an exported thread
  const sent = text.match(/(?:Sent|תאריך|נשלח)\s*:?\s*[^\n]*?(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}|[A-Za-z]+,?\s+[A-Za-z]+\s+\d{1,2},\s+\d{4})/);
  if (sent) {
    const iso = sgpDates(sent[1])[0]?.iso || (!isNaN(Date.parse(sent[1])) ? new Date(Date.parse(sent[1]) + 12 * 3600e3).toISOString().slice(0, 10) : null);
    if (iso) r.date = iso;
  }
  const subj = text.match(/(?:Subject|נושא)\s*:\s*([^\n]{3,120})/); if (subj) r.subject = subj[1].trim();
  return r;
}

// A periodic inspection report (תסקיר) for lifting equipment: inspected on, next by.
function sgpExtractInspection(text) {
  const r = {};
  r.inspection_date = sgpDateNear(text, /תאריך\s*(?:ה)?בדיקה(?!\s*הבאה)/);
  const next = text.match(/(?:בדיקה\s*הבאה|מועד\s*הבדיקה\s*הבא|בתוקף\s*עד)[^\n\d]{0,20}(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/);
  if (next) r.next_date = sgpDates(next[1])[0]?.iso || null;
  const kind = text.match(/(עגורן\s*צריח|מנוף\s*נייד|במת\s*הרמה|מלגזה|אביזרי\s*הרמה|מכונת\s*הרמה)/); if (kind) r.equipment = kind[1];
  return r;
}

// "08:09" from an OCR'd time; flags the ones the reader may have turned around
function sgpTimeAfter(page, labelRe) {
  const m = page.match(new RegExp(labelRe.source + String.raw`\s*[:.]?\s*(\d{1,2})(\s*[:;.]\s*)(\d{2})(?!\d)`));
  if (!m || +m[1] > 23 || +m[3] > 59) return null;
  const hh = +m[1];
  // printed as "08 : 09" — OCR sometimes swaps the halves or drops a digit
  const doubtful = m[2].trim() !== ':' || /\s/.test(m[2]) || m[1].length < 2 || hh < 5 || hh >= 19;
  return { value: `${String(hh).padStart(2, '0')}:${m[3]}`, doubtful };
}
const sgpDec = s => (s == null ? null : sgpNum(String(s).replace(',', '.')));

// One ready-mix truck = one delivery note page (ת״י 118 §7.3 fields as the plant prints them).
function sgpConcreteTruck(page, pageNo) {
  const t = { page: pageNo, doubt: [] };
  t.note = sgpNoteNumber(page);
  t.date = sgpDateNear(page, /תארי[ךכן]/);
  const dep = sgpTimeAfter(page, /יציאה\s*בשעה/);
  if (dep) { t.departure = dep.value; if (dep.doubtful) t.doubt.push('departure'); }
  let m = page.match(/כמות\s*[:.]?\s*(\d+(?:[.,]\d+)?)\s*מ/);
  if (m) { const v = sgpDec(m[1]); if (v > 0 && v <= 14) t.qty = v; }
  m = page.match(/(?:הוזמן|הומן|הוזמ)\s*[:.]?\s*(\d+(?:[.,]\d+)?)/); if (m) t.ordered = sgpDec(m[1]);
  m = page.match(/סה["'״]?כ\s*[:.]?\s*(\d+(?:[.,]\d+)?)\s*מ["'״]?ק/); if (m) t.cumulative = sgpDec(m[1]);
  m = page.match(/הזמנה\s*מס\s*['"׳]?\s*[:.,]?\s*(\d{5,7})(?!\d)/) || page.match(/(?<!\d)(\d{6})(?!\d)[^\n\d]{0,12}הזמנה\s*מס/);
  if (m) t.order = m[1];
  m = page.match(new RegExp(`${SGP_NOT_HEB_BEFORE}ב\\s*[-–]?\\s*(20|25|30|35|40|50|60)(?!\\d)`)); if (m) t.grade = `ב-${m[1]}`;
  m = page.match(/דרגת\s*חשיפה\s*[:.]?\s*(\d{1,2})(?!\d)/); if (m && +m[1] >= 1 && +m[1] <= 11) t.exposure = +m[1];
  m = page.match(/גי?ר\s*מ[יר]*בי\s*[:.]?\s*(\d{1,2})\s*מ/); if (m && +m[1] >= 5 && +m[1] <= 40) t.max_aggregate_mm = +m[1];
  m = page.match(/מים\s*באתר\s*(?:עד|ער)\s*(\d{1,3})\s*ליטר/); if (m) t.water_allowed_l_m3 = +m[1];
  m = page.match(/ערבל\s*[:.]?\s*(\d{2,5})(?!\d)/); if (m) t.truck = m[1];
  const isTruck = t.note || (t.qty != null && (t.truck || t.exposure != null));
  return isTruck ? t : null;
}

function sgpExtractConcreteNote(doc) {
  const trucks = doc.pages.map((p, i) => sgpConcreteTruck(p.text, i + 1)).filter(Boolean);
  // a plant numbers its notes in one series: a number that does not share the file's
  // common prefix was most likely misread (889325 came back as 839325)
  const prefixes = trucks.map(t => (t.note && /^\d{6}$/.test(t.note) ? t.note.slice(0, 2) : null)).filter(Boolean);
  const tally = {};
  prefixes.forEach(p => { tally[p] = (tally[p] || 0) + 1; });
  const common = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
  if (prefixes.length >= 2) trucks.forEach(t => { if (t.note && /^\d{6}$/.test(t.note) && t.note.slice(0, 2) !== common) t.doubt.push('note'); });
  trucks.forEach(t => { if (!t.doubt.length) delete t.doubt; });
  return { trucks };
}

// A concrete lab report ("LA…"): cubes with their sampling time, truck and note, the
// strengths, and the acceptance rule the lab prints itself.
function sgpExtractLab(text) {
  const r = { samples: [], ages: [], averages: [] };
  let m = text.match(/(?<![A-Za-z0-9])(LA\d{10,16})(?!\d)/); if (m) r.lab_no = m[1];
  r.pour_date = sgpDateNear(text, /תאריך\s*היציקה/);
  const printed = sgpDateNear(text, /תאריך\s*הדפסה/);
  if (printed && printed !== r.pour_date) r.report_date = printed;
  m = text.match(/סוג\s*הבטון[^\n\d]{0,8}(\d{2})/); if (m) r.grade = `ב-${m[1]}`;
  r.ages = sgpUnique([...text.matchAll(/חוזק\s*לחיצה\s*(\d{1,2})\s*יום/g)].map(x => +x[1]));
  m = text.match(/בגיל\s*(\d{1,2})\s*יום\s*לא\s*יקטן\s*מ\s*-?\s*(\d{1,3}(?:\.\d)?)[^\n]*?לממוצע[^\n]*?לא\s*יקטן\s*מ\s*-?\s*(\d{1,3}(?:\.\d)?)/);
  if (m) r.criteria = { age: +m[1], avg_min: +m[2], single_min: +m[3] };
  r.averages = [...text.matchAll(/ממוצע\s*[:.]?\s*(\d{1,3}\.\d{1,2})/g)].map(x => +x[1]);
  // a row reads (left to right, as printed): MPa… kN… note truck HH:MM supplier code no
  for (const line of text.split('\n')) {
    const tok = line.trim().split(/\s+/);
    const ti = tok.findIndex(x => /^\d{1,2}:\d{2}$/.test(x));
    if (ti < 3 || tok.length < 6) continue;
    const note = tok[ti - 2], truck = tok[ti - 1];
    if (!/^\d{5,7}$/.test(note) || !/^\d{2,5}$/.test(truck)) continue;
    const nums = tok.slice(0, ti - 2).map(Number).filter(n => !isNaN(n));
    r.samples.push({
      no: /^\d{1,3}$/.test(tok[tok.length - 1]) ? +tok[tok.length - 1] : null,
      time: tok[ti], truck, note,
      mpa: nums.filter(n => n < 150), kn: nums.filter(n => n >= 150),
    });
  }
  return r;
}

function sgpOrderKey(a, b, c) { return `${parseInt(a, 10)}-${b}${c ? '.' + c : ''}`; }
function sgpOrderKeyFromName(name) {
  const m = String(name || '').match(/הז[_\s-]*(\d{3,4})[-_](\d{2})(?:\.(\d))?/);
  return m ? sgpOrderKey(m[1], m[2], m[3]) : null;
}

function sgpExtractRebarNote(doc) {
  const text = doc.text;
  const p = sgpParse.rebar(text);
  const r = {
    notes: p.delivery_note_number ? p.delivery_note_number.split('\n') : [],
    date: p.delivery_date, total_kg: p.weight_kg, diameters: p.diameter_text,
  };
  if (p._summary) r.per_note = p._summary;
  r.orders = sgpUnique([...text.matchAll(/(?:הז|רכש)\s*[:_.]?\s*(\d{3,4})\s*-\s*(\d{2})(?:\.(\d))?(?!\d)/g)].map(m => sgpOrderKey(m[1], m[2], m[3])));
  r.supplier_orders = sgpUnique([...text.matchAll(/(?<![A-Za-z0-9])S[O0](\d{8})(?!\d)/g)].map(m => 'SO' + m[1]));
  const mf = text.match(/(נוימן)[^\n]{0,24}?(\d{2}[A-Z]\d{5}|\d{5,8})/);
  if (mf) r.manufacturer = { name: mf[1], ref: mf[2] };
  else if (/נוימן/.test(text)) r.manufacturer = { name: 'נוימן' };
  return r;
}

function sgpExtractRebarOrder(doc, fileName) {
  const text = doc.text;
  const r = { order: sgpOrderKeyFromName(fileName) };
  if (!r.order) {
    const m = text.match(/(?:הז|הזמנה)\s*[:_.]?\s*(\d{3,4})\s*-\s*(\d{2})(?:\.(\d))?(?!\d)/);
    if (m) r.order = sgpOrderKey(m[1], m[2], m[3]);
  }
  r.supply_date = sgpDateNear(text, /תאריך\s*אספקה/);
  // the order's own total, where it prints one ("סה"כ … 45,044.00")
  const totals = text.split('\n').filter(l => /סה["'״]?כ/.test(l))
    .flatMap(l => [...l.matchAll(/(?<![\d,.])(\d{1,3}(?:,\d{3})+\.\d{2}|\d{3,6}\.\d{2})(?!\d)/g)].map(m => sgpNum(m[1])));
  if (totals.length) { r.total_kg = Math.max(...totals); r.doubt = ['total_kg']; }
  return r;
}

function sgpExtractSlabNote(doc) {
  const p = sgpParse.slab(doc.text);
  const r = {
    notes: p.delivery_note_number ? p.delivery_note_number.split('\n') : [],
    date: p.delivery_date, total_m2: p.quantity_m2,
  };
  const pr = doc.text.match(/(?<![A-Za-z0-9])(PR\d{8})(?!\d)/); if (pr) r.project = pr[1];
  if (/≈|\?/.test(p._summary || '')) r.doubt = ['total_m2'];
  return r;
}

// ---- Excel (the slab supplier's order form, with the team's own tracking sheet) --------
let sgpExcelJsLoading = null;
function sgpEnsureExcelJs() {
  if (typeof ExcelJS !== 'undefined') return Promise.resolve();
  if (!sgpExcelJsLoading) {
    sgpExcelJsLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SGP_EXCELJS_SRC; s.onload = resolve;
      s.onerror = () => { sgpExcelJsLoading = null; reject(new Error('טעינת רכיב האקסל נכשלה')); };
      document.head.appendChild(s);
    });
  }
  return sgpExcelJsLoading;
}
function sgpCellValue(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return sgpCellValue(v.result);
    if (v.richText) return v.richText.map(r => r.text).join('').trim() || null;
    if ('text' in v) return v.text;
    return null;
  }
  return typeof v === 'string' ? (v.replace(/\s+/g, ' ').trim() || null) : v;
}
async function sgpReadWorkbook(file) {
  await sgpEnsureExcelJs();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  return wb.worksheets.map(ws => {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row, i) => { rows.push({ i, cells: row.values.slice(1).map(sgpCellValue) }); });
    return { name: ws.name, rows };
  });
}
const sgpRound = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
function sgpFindCol(cells, re) { return cells.findIndex(c => typeof c === 'string' && re.test(c)); }
// the value that follows a label on its row (the sheets read right to left: label, value)
function sgpValueAfter(rows, labelRe) {
  for (const r of rows) {
    const k = sgpFindCol(r.cells, labelRe);
    if (k < 0) continue;
    const v = r.cells.slice(k + 1).find(x => x != null && x !== '');
    if (v != null) return v;
  }
  return null;
}
function sgpExtractSlabWorkbook(sheets) {
  const orders = [], tracking = [];
  for (const sh of sheets) {
    const hi = sh.rows.findIndex(r => sgpFindCol(r.cells, /מס['"׳]{0,2}\s*לוחד/) >= 0 && sgpFindCol(r.cells, /^כמות/) >= 0);
    if (hi >= 0) {
      const h = sh.rows[hi].cells;
      const col = re => sgpFindCol(h, re);
      const c = { plan: col(/^תכנית/), rev: col(/מהדורה/), thick: col(/עובי/), el: col(/מס['"׳]{0,2}\s*לוחד/), qty: col(/^כמות/),
        len: col(/אורך\s*1/), width: col(/רוחב/), axes: col(/צירים/) };
      const lines = [];
      for (const r of sh.rows.slice(hi + 1)) {
        const v = k => (k >= 0 ? r.cells[k] : null);
        if (v(c.el) == null || typeof v(c.qty) !== 'number') continue;
        lines.push({ element: v(c.el), qty: v(c.qty), length_m: v(c.len), width_m: v(c.width), axes: v(c.axes),
          thickness_cm: v(c.thick), plan: v(c.plan), revision: v(c.rev) });
      }
      if (lines.length) {
        const run = lines.reduce((a, l) => a + (l.qty || 0) * (l.length_m || 0), 0);
        const area = lines.reduce((a, l) => a + (l.qty || 0) * (l.length_m || 0) * (l.width_m || 0), 0);
        orders.push({
          sheet: sh.name,
          order_no: sgpValueAfter(sh.rows, /הזמנת\s*לוחדים\s*מספר/),
          date: sgpValueAfter(sh.rows, /^תאריך\s*:?$/),
          wanted_date: sgpValueAfter(sh.rows, /תאריך\s*אספקה\s*רצוי/),
          units: lines.reduce((a, l) => a + (l.qty || 0), 0),
          total_m: sgpRound(run), total_m2: sgpRound(area), lines,
        });
      }
    }
    const ti = sh.rows.findIndex(r => sgpFindCol(r.cells, /תעודת\s*משלוח/) >= 0 && sgpFindCol(r.cells, /תאריך\s*הזמנה/) >= 0);
    if (ti >= 0) {
      const h = sh.rows[ti].cells;
      const col = re => sgpFindCol(h, re);
      const c = { no: col(/^מס['"׳]?$/), od: col(/תאריך\s*הזמנה/), sd: col(/תאריך\s*אספקה/), id: col(/תאריך\s*הנחה|התקנה/),
        sup: col(/ספק|יצרן/), floor: col(/קומה|מיקום/), plan: col(/תכנית/), m: col(/סה["'״]{1,2}כ/), note: col(/תעודת\s*משלוח/), rem: col(/הערות/) };
      for (const r of sh.rows.slice(ti + 1)) {
        const v = k => (k >= 0 ? r.cells[k] : null);
        if (!v(c.od) && !v(c.note)) continue;
        tracking.push({ order_no: v(c.no), order_date: v(c.od), supply_date: v(c.sd), install_date: v(c.id),
          supplier: v(c.sup), floor: v(c.floor), plan: v(c.plan), total_m: v(c.m), note: v(c.note), remarks: v(c.rem) });
      }
    }
  }
  return { orders, tracking };
}

// Reads a file and returns what goes into documents.extracted.
async function sgpExtractFile(file, { onProgress } = {}) {
  const name = file.name || '';
  const base = { v: SGP_EXTRACT_VERSION };
  if (/\.xlsx$/i.test(name)) {
    const wb = sgpExtractSlabWorkbook(await sgpReadWorkbook(file));
    return wb.orders.length || wb.tracking.length ? { ...base, kind: 'slab_order', ...wb } : { ...base, kind: 'unknown' };
  }
  const readable = /^image\/(jpeg|png|webp|gif|bmp)$/.test(file.type) || file.type === 'application/pdf' || /\.(pdf|jpe?g|png|webp|gif|bmp)$/i.test(name);
  if (!readable) return { ...base, kind: 'unsupported' };
  return sgpExtract(await sgpReadDocument(file, { onProgress }), name);
}
// The same, from a document sgpReadDocument has already read (the scan zone on the forms).
function sgpExtract(doc, fileName) {
  const kind = sgpDocKind(doc.text, fileName);
  const base = { v: SGP_EXTRACT_VERSION, kind, pages: doc.pages.length };
  if (doc.totalPages > doc.pages.length) base.pages_total = doc.totalPages;
  if (kind === 'concrete_note') return { ...base, ...sgpExtractConcreteNote(doc) };
  if (kind === 'concrete_lab') return { ...base, ...sgpExtractLab(doc.text) };
  if (kind === 'rebar_note') return { ...base, ...sgpExtractRebarNote(doc) };
  if (kind === 'rebar_order') return { ...base, ...sgpExtractRebarOrder(doc, fileName) };
  if (kind === 'slab_note') return { ...base, ...sgpExtractSlabNote(doc) };
  if (kind === 'contractor_cert') return { ...base, ...sgpExtractContractorCert(doc.text) };
  if (kind === 'approval') return { ...base, ...sgpExtractApproval(doc.text) };
  if (kind === 'inspection') return { ...base, ...sgpExtractInspection(doc.text) };
  return base;
}
