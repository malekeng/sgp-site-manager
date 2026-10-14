// ===== Rebar orders: numbering, input parsing, validation and order lines =====
// Pure helpers for rebar-orders.html (no DOM, no database), tested in Node.
// Needs rebar-calc.js and rebar-shapes.js loaded before it.

const REBAR_STATUS_LABELS = { draft: 'טיוטה', sent: 'נשלחה', partial: 'סופקה חלקית', complete: 'סופקה', closed: 'נסגרה' };
const REBAR_BAR_D = [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 26, 28, 30, 32, 34, 36, 40];
const REBAR_MESH_D = [5, 5.5, 6, 6.5, 8, 10, 12, 14, 16];
const REBAR_PILE_D = [12, 14, 16, 18, 20, 22, 25, 26, 28, 30, 32, 34, 36];
const REBAR_SPIRAL_D = [8, 10, 12, 14, 16];
const REBAR_STEPS = [5, 10, 15, 20, 25];
const REBAR_STEELS = ['מצולע', 'עגול'];

// "2610-03": year and month of the date, then the next number above the highest one
// already used that month. Anything not in that exact form is ignored.
function nextOrderNo(existing, date) {
  const ym = String(date.getFullYear()).slice(-2) + String(date.getMonth() + 1).padStart(2, '0');
  let max = 0;
  for (const no of existing || []) {
    const m = String(no || '').trim().match(/^(\d{4})-(\d{2,})$/);
    if (m && m[1] === ym) max = Math.max(max, Number(m[2]));
  }
  return ym + '-' + String(max + 1).padStart(2, '0');
}

// A typed number. A Hebrew keyboard often gives "12,5" for 12.5; "1,250" is a thousands
// separator. Blank or anything else → null (shown as a field error, never as NaN).
function parseNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined) return null;
  let s = String(v).replace(/\s/g, '');
  if (!s) return null;
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^-?\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  return Number(s);
}

// The form's own shape wins: a free drawing, or a catalog shape whose legs were unlinked.
function rebarBaseShape(f) {
  if (f.shape) return f.shape;
  if (f.code === 'F') return null;
  try { return rebarShape(f.code); } catch { return null; }
}

// The add-items window's shape strip: the shapes used last (newest first) …
function rebarRecentPush(list, code, max = 8) {
  return [code, ...(list || []).filter(c => c !== code)].slice(0, max);
}

// … then the usual ones, catalog codes only.
function rebarStripCodes(recent, defaults, n) {
  const known = c => c !== 'F' && REBAR_SHAPES.some(s => s.code === c);
  return [...new Set([...(recent || []), ...defaults])].filter(known).slice(0, n);
}

// { field: message } for every bad field of a line; {} when it can be saved.
function validateItem(kind, f) {
  const e = {};
  const num = k => parseNum(f[k]);
  const pos = k => num(k) !== null && num(k) > 0;
  const qty = num('qty');
  if (!(qty !== null && Number.isInteger(qty) && qty > 0)) e.qty = 'כמות — מספר שלם גדול מ-0';
  if (f.steel !== undefined && !REBAR_STEELS.includes(f.steel)) e.steel = 'סוג פלדה: מצולע או עגול';
  if (kind === 'bar') {
    if (!REBAR_BAR_D.includes(num('diameter_mm'))) e.diameter_mm = 'בחרו קוטר מהרשימה';
    const base = rebarBaseShape(f);
    if (!base) e.code = 'בחרו צורה';
    else if (base.family === 'hoop') {
      const [D, overlap] = (f.lens || []).map(parseNum);
      if (!(D > 0)) e.lens = 'קוטר החישוק — מספר גדול מ-0';
      if (overlap === null || overlap === undefined || overlap < 0) e.overlap = 'חפיפה — חובה (ס״מ)';
    } else {
      const lens = (f.lens || []).map(parseNum);
      if (lens.length < base.inputs.length || lens.some(x => !(x > 0))) e.lens = 'אורך כל צלע — מספר גדול מ-0';
    }
    if (f.hook_cm !== undefined && f.hook_cm !== null && f.hook_cm !== '' && !(parseNum(f.hook_cm) >= 0)) e.hook_cm = 'אורך הוו — מספר';
  } else if (kind === 'mesh') {
    if (!REBAR_MESH_D.includes(num('diameter_mm'))) e.diameter_mm = 'בחרו קוטר מהרשימה';
    if (!pos('x')) e.x = 'רוחב — מספר גדול מ-0';
    if (!pos('y')) e.y = 'גובה — מספר גדול מ-0';
    if (!REBAR_STEPS.includes(num('s'))) e.s = 'בחרו פסיעה מהרשימה';
    if (f.type === 'asym') {
      if (!REBAR_MESH_D.includes(num('d_y'))) e.d_y = 'בחרו קוטר מהרשימה';
      if (!REBAR_STEPS.includes(num('s_x'))) e.s_x = 'בחרו פסיעה מהרשימה';
    }
  } else if (kind === 'element') {
    if (f.type === 'kranz') {
      if (!pos('L')) e.L = 'אורך הרשת — מספר גדול מ-0';
      if (!REBAR_BAR_D.includes(num('diameter_mm'))) e.diameter_mm = 'בחרו קוטר מהרשימה';
      if (!REBAR_STEPS.includes(num('s'))) e.s = 'בחרו פסיעה מהרשימה';
      if (!pos('a')) e.a = 'אורך — מספר גדול מ-0';
      if (!pos('b')) e.b = 'אורך — מספר גדול מ-0';
      const nl = num('n_long');
      if (!(nl !== null && Number.isInteger(nl) && nl >= 0)) e.n_long = 'מספר מוטות — מספר שלם 0 ומעלה';
      if (!REBAR_BAR_D.includes(num('d_long'))) e.d_long = 'בחרו קוטר מהרשימה';
    } else if (f.type === 'spacer') {
      if (!REBAR_SPACER_HEIGHTS.includes(num('height_mm'))) e.height_mm = 'בחרו גובה מהרשימה';
    } else if (f.type === 'other') {
      if (!String(f.name || '').trim()) e.name = 'שם האלמנט — חובה';
      if (f.unit_kg !== undefined && f.unit_kg !== null && f.unit_kg !== '' && !(num('unit_kg') >= 0)) e.unit_kg = 'משקל ליחידה — מספר 0 ומעלה';
    } else e.type = 'בחרו סוג אלמנט';
  } else if (kind === 'pile') {
    if (!REBAR_PILE_D.includes(num('diameter_mm'))) e.diameter_mm = 'בחרו קוטר מהרשימה';
    const n = num('n');
    if (!(n !== null && Number.isInteger(n) && n > 0)) e.n = 'מספר מוטות — מספר שלם גדול מ-0';
    const L = ['L1', 'L2', 'L3'].map(num);
    if (L.some(x => x === null || x < 0) || L.reduce((a, b) => a + (b || 0), 0) <= 0) e.L = 'אורכים — L1+L2+L3 גדול מ-0';
    if (!REBAR_STEPS.includes(num('p1'))) e.p1 = 'בחרו פסיעה מהרשימה';
    if (!REBAR_STEPS.includes(num('p2'))) e.p2 = 'בחרו פסיעה מהרשימה';
    if (!pos('d') || !pos('D') || num('d') >= num('D')) e.d = 'd חייב להיות קטן מ-D';
    if (!REBAR_SPIRAL_D.includes(num('d_spiral'))) e.d_spiral = 'בחרו קוטר ספירלה מהרשימה';
  }
  return e;
}

// A validated form → the rebar_order_items row (spec §3), weights included.
function buildItem(kind, f, lineNo) {
  const row = {
    kind, line_no: lineNo, alias: (f.alias || '').trim() || null, note: (f.note || '').trim() || null,
    steel: f.steel || 'מצולע', diameter_mm: parseNum(f.diameter_mm), qty: parseNum(f.qty),
    length_cm: null, shape: null, params: null,
  };
  if (kind === 'bar') {
    const s = shapeSetLengths(rebarBaseShape(f), (f.lens || []).map(parseNum));
    const shape = { code: s.code, family: s.family, segments: s.segments, hooks: s.hooks || 0 };
    if (f.hook_cm !== undefined && f.hook_cm !== null && f.hook_cm !== '') shape.hook_cm = parseNum(f.hook_cm);
    if (s.family === 'hoop') { shape.D = s.D; shape.overlap = s.overlap; }
    if (s.start) shape.start = s.start;   // the drawing's direction (a diamond stirrup)
    row.shape = shape;
    row.length_cm = shapeLength(shape, row.diameter_mm);
  } else if (kind === 'mesh') {
    row.params = { type: f.type === 'asym' ? 'asym' : 'sym', x: parseNum(f.x), y: parseNum(f.y), s: parseNum(f.s) };
    if (f.type === 'asym') { row.params.d_y = parseNum(f.d_y); row.params.s_x = parseNum(f.s_x); }
  } else if (kind === 'element') {
    row.steel = 'מצולע';
    if (f.type === 'kranz') {
      row.params = { type: 'kranz', variant: f.variant === 'lower' ? 'lower' : 'upper' };
      for (const k of ['L', 's', 'a', 'b', 'n_long', 'd_long']) row.params[k] = parseNum(f[k]);
    } else {
      row.diameter_mm = null;
      row.params = f.type === 'spacer' ? { type: 'spacer', height_mm: parseNum(f.height_mm) }
        : { type: 'other', name: String(f.name || '').trim(), unit_kg: parseNum(f.unit_kg) ?? 0 };
    }
  } else if (kind === 'pile') {
    row.params = {
      pile_type: f.pile_type || 'בסיס', d: parseNum(f.d), D: parseNum(f.D), n: parseNum(f.n),
      L1: parseNum(f.L1), L2: parseNum(f.L2), L3: parseNum(f.L3), p1: parseNum(f.p1), p2: parseNum(f.p2),
      d_spiral: parseNum(f.d_spiral), steel_spiral: f.steel_spiral || 'מצולע', additions: f.additions || [],
    };
  }
  const c = itemCalc(row);
  row.length_cm = c.length_cm;
  row.unit_kg = c.unit_kg;
  row.total_kg = c.total_kg;
  return row;
}

// ---- ליפט: a closed bundle of straight bars (spec 2026-10-14 §2) ----
function validateLift(f) {
  const e = {}, lifts = parseNum(f.lifts);
  if (!(lifts !== null && Number.isInteger(lifts) && lifts > 0)) e.lifts = 'מספר ליפטים — מספר שלם גדול מ-0';
  if (!REBAR_BAR_D.includes(parseNum(f.diameter_mm))) e.diameter_mm = 'בחרו קוטר מהרשימה';
  if (!REBAR_STOCK_LENGTHS.includes(parseNum(f.length))) e.length = 'אורך: 600 או 1200';
  if (f.steel !== undefined && !REBAR_STEELS.includes(f.steel)) e.steel = 'סוג פלדה: מצולע או עגול';
  return e;
}

// A lift is stored as an ordinary straight bar, so weights, PDF and receipts treat it as one.
function buildLiftItem(f, lineNo) {
  const d = parseNum(f.diameter_mm), L = parseNum(f.length), lifts = parseNum(f.lifts);
  const q = rebarLiftQty(d, L, lifts);
  const note = lifts === 1 ? `ליפט אחד × ${q.per_lift}` : `${lifts} ליפטים × ${q.per_lift}`;
  return buildItem('bar', { code: 'S', shape: null, lens: [L], diameter_mm: d, qty: q.qty, steel: f.steel || 'מצולע', alias: 'ליפט', note }, lineNo);
}

// ---- אלמנט: a corner mesh, a spacer, or another ready element (spec 2026-10-14 §3) ----
const REBAR_ELEMENT_TYPES = [['kranz', 'רשת קרנץ'], ['spacer', 'שומר מרחק'], ['other', 'אחר']];
const REBAR_KRANZ_VARIANTS = [['upper', 'קרנץ עליון (ע.)'], ['lower', 'קרנץ תחתון (ת.)']];
const REBAR_SPACER_HEIGHTS = Array.from({ length: 22 }, (_, i) => 70 + i * 10);   // 70…280 mm

// The window's form for an element: the defaults for a new one, or a saved row read back.
function rebarElementForm(item) {
  const p = (item && item.params) || {};
  return {
    alias: item ? item.alias || '' : '', note: item ? item.note || '' : '', qty: item ? item.qty : '', steel: 'מצולע',
    type: p.type || 'kranz', variant: p.variant || 'upper', L: p.L ?? 600, diameter_mm: item && p.type === 'kranz' ? item.diameter_mm : 8,
    s: p.s ?? 20, a: p.a ?? 80, b: p.b ?? 15, n_long: p.n_long ?? 3, d_long: p.d_long ?? 8,
    height_mm: p.height_mm ?? 120, name: p.name || '', unit_kg: p.type === 'other' && p.unit_kg ? p.unit_kg : '',
  };
}

// The "סוג" text of an element, for the order table and the PDF.
function elementLabel(item) {
  const p = item.params || {};
  if (p.type === 'kranz') return (REBAR_KRANZ_VARIANTS.find(v => v[0] === p.variant) || REBAR_KRANZ_VARIANTS[0])[1];
  return (REBAR_ELEMENT_TYPES.find(t => t[0] === p.type) || REBAR_ELEMENT_TYPES[2])[1];
}

// The "פירוט" text of an element, for the order table and the PDF.
function elementDesc(item) {
  const p = item.params || {}, n = v => String(Number(v));
  if (p.type === 'kranz') return `L=${n(p.L)} · Ø${n(item.diameter_mm)}@${n(p.s)} · ${n(p.n_long)}Ø${n(p.d_long)}`;
  if (p.type === 'spacer') return `גובה ${n(p.height_mm)} מ״מ · אורך 2 מ׳`;   // plain Hebrew: a mixed LTR wrapper garbles it
  return p.name || '';
}

const REBAR_ORDER_RESET = ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'sent_at', 'sent_by',
  'closed_at', 'closed_by', 'close_reason', 'source_ref'];
const REBAR_ITEM_RESET = ['id', 'order_id', 'created_at', 'created_by', 'updated_at', 'updated_by'];

// "שכפול": a new draft with the same header and lines, under a new number.
function duplicateOrder(order, items, orderNo) {
  const o = { ...order, order_no: orderNo, status: 'draft', source: 'tadok' };
  for (const k of REBAR_ORDER_RESET) delete o[k];
  const lines = (items || []).map(i => {
    const c = JSON.parse(JSON.stringify(i));
    for (const k of REBAR_ITEM_RESET) delete c[k];
    return c;
  });
  return { order: o, items: lines };
}

function isOverdue(order, todayIso) {
  return !!order.required_date && order.required_date < todayIso && !['complete', 'closed'].includes(order.status);
}

const REBAR_DB_ERRORS = {
  rebar_order_locked: 'ההזמנה נשלחה ולכן נעולה — פתחו אותה לעריכה',
  rebar_order_needs_items: 'אי אפשר לשלוח הזמנה בלי שורות',
  rebar_close_needs_reason: 'יש לכתוב סיבת סגירה',
  rebar_bad_transition: 'הפעולה אינה אפשרית במצב הנוכחי של ההזמנה',
  rebar_site_immutable: 'אי אפשר להעביר הזמנה לאתר אחר',
  rebar_receipt_order_state: 'אפשר לקלוט משלוח רק להזמנה שנשלחה ולא נסגרה',
  rebar_receipt_wrong_order: 'השורה אינה שייכת להזמנה הזו',
  rebar_order_has_receipts: 'כבר נקלטו משלוחים להזמנה — אי אפשר לפתוח אותה לעריכה',
  rebar_delivery_linked: 'השורה נוצרה מהזמנת ברזל — פתחו את ההזמנה כדי לשנות אותה',
};

function rebarDbError(err) {
  if (!err) return '';
  if (err.code === '23505') return 'מספר ההזמנה כבר קיים באתר';
  const key = Object.keys(REBAR_DB_ERRORS).find(k => String(err.message || '').startsWith(k));
  return key ? REBAR_DB_ERRORS[key] : (err.message || String(err));
}

// the same, for a refused delete: an order that received deliveries is closed instead
function rebarDeleteError(err) {
  if (err && String(err.message || '').startsWith('rebar_order_has_receipts')) return 'כבר נקלטו משלוחים להזמנה — סגרו אותה במקום למחוק';
  return rebarDbError(err);
}
