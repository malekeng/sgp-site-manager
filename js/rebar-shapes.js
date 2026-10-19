// ===== Rebar shapes: geometry, catalog and drawings =====
// A shape is a chain of segments, each with the angle turned after it (degrees, + left,
// − right, 0 on the last). Its length is computed the EasyBar way (spec §2.2): outside
// dimensions summed, plus the hooks; nothing is deducted for the bends.

const REBAR_FAMILIES = ['straight', 'figura', 'kalmara', 'hoop', 'spacer', 'bird'];
const REBAR_FAMILY_LABELS = {
  straight: 'ישר', figura: 'פיגורה', kalmara: 'קלמרה', hoop: 'חישוק', spacer: 'ספסלים/משקפיים', bird: 'ציפורים',
};

// A catalog entry from its legs and the direction each leg runs in (degrees, screen axes:
// 0 east, 90 down). The turns follow from the directions; `start` is the first direction,
// so a rotated shape (the diamond stirrup) is drawn as it looks, at the same length.
function rbShape(code, family, label, lens, dirs, extra = {}) {
  const segments = lens.map((len, i) => {
    let t = i < lens.length - 1 ? dirs[i + 1] - dirs[i] : 0;
    while (t > 180) t -= 360;
    while (t <= -180) t += 360;
    return { len, turn: t };
  });
  const s = { code, family, label, bends: lens.length - 1, hooks: 0, equal: [], inputs: lens.map((_, i) => i), segments, ...extra };
  if (dirs[0]) s.start = dirs[0];
  return s;
}
const RB_SYM5 = { equal: [[0, 4], [1, 3]], inputs: [0, 1, 2] };   // legs mirrored around the middle one

// inputs: the segments the user types; equal: groups of segments that take one value
// (a closed stirrup's opposite sides). A hoop has no segments — it is a diameter D plus
// the overlap of its two ends. The types follow EasyBar's catalog (39 shapes); the
// drawings are ours, from shapeSvg.
const REBAR_SHAPES = [
  // no bend
  { code: 'S', family: 'straight', label: 'מוט ישר', bends: 0, hooks: 0, equal: [], inputs: [0],
    segments: [{ len: 600, turn: 0 }] },
  { code: 'H', family: 'hoop', label: 'חישוק עגול', bends: 0, hooks: 0, equal: [], inputs: [], segments: [], D: 80, overlap: null },
  // one bend
  { code: 'L', family: 'figura', label: 'זווית', bends: 1, hooks: 0, equal: [], inputs: [0, 1],
    segments: [{ len: 100, turn: 90 }, { len: 30, turn: 0 }] },
  rbShape('J', 'figura', 'וו חוזר', [100, 12], [0, 160]),
  rbShape('A', 'figura', 'קצה משופע', [100, 30], [0, -45]),
  // two bends
  { code: 'U', family: 'kalmara', label: 'חית', bends: 2, hooks: 0, equal: [], inputs: [0, 1, 2],
    segments: [{ len: 100, turn: 90 }, { len: 15, turn: 90 }, { len: 100, turn: 0 }] },
  rbShape('UW', 'kalmara', 'חית רחבה', [20, 100, 20], [90, 0, -90], { equal: [[0, 2]], inputs: [0, 1] }),
  rbShape('UA', 'kalmara', 'חית — רגליים שונות', [40, 100, 20], [90, 0, -90]),
  rbShape('UT', 'kalmara', 'חית גבוהה', [100, 20, 100], [90, 0, -90], { equal: [[0, 2]], inputs: [0, 1] }),
  rbShape('UTA', 'kalmara', 'חית גבוהה — רגליים שונות', [100, 25, 60], [90, 0, -90]),
  { code: 'Z', family: 'figura', label: 'Z', bends: 2, hooks: 0, equal: [], inputs: [0, 1, 2],
    segments: [{ len: 30, turn: 90 }, { len: 100, turn: -90 }, { len: 30, turn: 0 }] },
  rbShape('HAT', 'figura', 'טרפז הפוך', [30, 40, 30], [-45, 0, 45], { equal: [[0, 2]], inputs: [0, 1] }),
  rbShape('TR', 'figura', 'שוקת משופעת', [30, 80, 30], [45, 0, -45], { equal: [[0, 2]], inputs: [0, 1] }),
  rbShape('CR', 'figura', 'כיפוף מדרגה משופע', [60, 30, 60], [0, 45, 0]),
  rbShape('ZS', 'figura', 'מדרגה ישרה', [60, 30, 60], [0, 90, 0]),
  // three bends
  { code: 'K', family: 'kalmara', label: 'קלמרה סגורה', bends: 3, hooks: 2, equal: [[0, 2], [1, 3]], inputs: [0, 1],
    segments: [{ len: 35, turn: 90 }, { len: 20, turn: 90 }, { len: 35, turn: 90 }, { len: 20, turn: 0 }] },
  rbShape('KS', 'kalmara', 'קלמרה ריבועית', [30, 30, 30, 30], [0, 90, 180, -90], { hooks: 2, equal: [[0, 1, 2, 3]], inputs: [0] }),
  rbShape('KD', 'kalmara', 'קלמרה מעוינת', [35, 20, 35, 20], [45, 135, -135, -45], { hooks: 2, equal: [[0, 2], [1, 3]], inputs: [0, 1] }),
  rbShape('C', 'kalmara', 'קלמרה פתוחה', [100, 20, 100, 15], [180, 90, 0, -90]),
  rbShape('C2', 'kalmara', 'קלמרה פתוחה — פתח באמצע', [60, 20, 100, 20], [180, 90, 0, -90]),
  rbShape('CA', 'kalmara', 'קלמרה עם צלע משופעת', [80, 25, 100, 20], [180, 135, 0, -90]),
  // four bends
  rbShape('HT', 'spacer', 'ספסל', [20, 15, 50, 15, 20], [0, 90, 0, -90, 0], RB_SYM5),
  rbShape('HTA', 'spacer', 'ספסל עם קצוות משופעים', [15, 40, 50, 40, 15], [-45, 90, 0, -90, 45], RB_SYM5),
  rbShape('CL', 'kalmara', 'קלמרה עם שפתיים', [15, 40, 50, 40, 15], [180, 90, 0, -90, 180], RB_SYM5),
  rbShape('CLH', 'kalmara', 'קלמרה עם ווים פנימיים', [15, 40, 50, 40, 15], [-135, 90, 0, -90, 135], RB_SYM5),
  rbShape('CL1', 'kalmara', 'חית עם שפה', [15, 40, 50, 40, 15], [0, 90, 0, -90, 180]),
  rbShape('CLT', 'kalmara', 'חית גבוהה עם ווים', [15, 80, 40, 80, 15], [-135, 90, 0, -90, 135], RB_SYM5),
  rbShape('BW', 'figura', 'קערה', [40, 20, 50, 20, 40], [90, 45, 0, -45, -90], RB_SYM5),
  rbShape('CH3', 'spacer', 'שוקת עם כנפיים', [20, 20, 50, 20, 20], [0, 45, 0, -45, 0], RB_SYM5),
  rbShape('CH5', 'figura', 'מדרגה משופעת עם כנפיים', [20, 20, 40, 40, 20], [0, 45, 0, -60, 0]),
  rbShape('CRT', 'figura', 'מדרגה משופעת עם קצוות', [10, 40, 30, 40, 10], [90, 0, 45, 0, -90]),
  rbShape('ZST', 'figura', 'מדרגה ישרה עם קצוות', [10, 40, 30, 40, 10], [90, 0, 90, 0, -90]),
  rbShape('GL', 'spacer', 'משקפיים', [30, 30, 30, 25, 10], [-45, 45, 135, -135, -45]),
  // five bends and more
  rbShape('CH1', 'spacer', 'ספסל עם כנפיים וקצה', [10, 20, 20, 50, 20, 20], [90, 0, 45, 0, -45, 0]),
  rbShape('CH2', 'spacer', 'ספסל עם כנפיים וקצה הפוך', [10, 20, 20, 50, 20, 20], [-90, 0, 45, 0, -45, 0]),
  rbShape('CH6', 'figura', 'מדרגה משופעת עם כנפיים וקצה', [20, 20, 40, 40, 20, 10], [0, 45, 0, -60, 0, 90]),
  rbShape('CH4', 'figura', 'מדרגה עם כנפיים וקצוות', [10, 20, 20, 40, 30, 20, 10], [90, 0, 45, 0, -60, 0, 90]),
  rbShape('SP', 'spacer', 'ספסל רגליים', [30, 30, 30, 20], [-60, 0, 90, 0]),
  // starter bars with a loop ("ציפורים")
  rbShape('BD1', 'bird', 'ציפור', [80, 20, 20, 60], [90, 180, -90, 0]),
  rbShape('BD2', 'bird', 'ציפור עם וו עליון', [10, 80, 20, 20, 60], [0, 90, 180, -90, 0]),
  rbShape('BD3', 'bird', 'ציפור עם קצה', [80, 20, 20, 60, 30], [90, 180, -90, 0, 90]),
];

function rebarShape(code) {
  const s = REBAR_SHAPES.find(x => x.code === code);
  if (!s) throw new Error('unknown rebar shape ' + code);
  return JSON.parse(JSON.stringify(s));
}

// values follow shape.inputs (for a hoop: [D, overlap]); equal groups then copy the
// typed value to their partners.
function shapeSetLengths(shape, values) {
  const s = JSON.parse(JSON.stringify(shape));
  if (s.family === 'hoop') {
    s.D = values[0];
    s.overlap = values[1];
    return s;
  }
  s.inputs.forEach((idx, k) => { if (values[k] !== undefined) s.segments[idx].len = values[k]; });
  for (const group of s.equal || []) {
    const src = group.find(i => s.inputs.includes(i));
    if (src === undefined) continue;
    for (const i of group) s.segments[i].len = s.segments[src].len;
  }
  return s;
}

// cm. The hook defaults to d cm (10·d in mm) and can be set per line as hook_cm.
function shapeLength(shape, d) {
  if (shape.family === 'hoop') return Math.round(3.14 * shape.D) + (Number(shape.overlap) || 0);
  const sum = shape.segments.reduce((a, g) => a + Number(g.len), 0);
  const hook = shape.hook_cm !== undefined && shape.hook_cm !== null ? Number(shape.hook_cm) : Number(d);
  return sum + (shape.hooks || 0) * hook;
}

function shapeBends(shape) {
  return shape.family === 'hoop' ? 0 : Math.max(0, shape.segments.length - 1);
}

// ---- drawings ----
// a label is a number: a stored shape's text never reaches the page as markup
function rbLabel(v) {
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : '?';
}

// The drawing keeps the shape's proportions, except that a very short leg is drawn at
// least 12% of the longest one so a 15 cm hook beside a 12 m bar stays visible. Equal
// legs stay equal, so closed shapes still close. The layout is the geometry in a w×h box:
// the corner points, the scale (px per drawn cm) and, per leg, its midpoint, the unit
// normal pointing away from the shape's centre and the unit direction along the leg.
function shapeLayout(shape, w, h, pad) {
  const segs = shape.segments || [];
  const longest = Math.max(1, ...segs.map(g => Number(g.len) || 0));
  const pts = [{ x: 0, y: 0 }];
  let heading = Number(shape.start) || 0;
  for (const g of segs) {
    const dl = Math.max(Number(g.len) || 0, longest * 0.12);
    const a = heading * Math.PI / 180, p = pts[pts.length - 1];
    pts.push({ x: p.x + dl * Math.cos(a), y: p.y + dl * Math.sin(a) });
    heading += Number(g.turn) || 0;
  }
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const bw = Math.max(Math.max(...xs) - minX, 1e-6), bh = Math.max(Math.max(...ys) - minY, 1e-6);
  const scale = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
  const offX = (w - bw * scale) / 2, offY = (h - bh * scale) / 2;
  const P = pts.map(p => ({ x: offX + (p.x - minX) * scale, y: offY + (p.y - minY) * scale }));
  const cx = P.reduce((a, p) => a + p.x, 0) / P.length, cy = P.reduce((a, p) => a + p.y, 0) / P.length;
  const labels = segs.map((g, i) => {
    const a = P[i], b = P[i + 1], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    if (nx * (mx - cx) + ny * (my - cy) < 0 || (Math.abs(mx - cx) < 1e-6 && Math.abs(my - cy) < 1e-6 && ny < 0)) { nx = -nx; ny = -ny; }
    return { x: mx, y: my, nx, ny, ux: (b.x - a.x) / len, uy: (b.y - a.y) / len };
  });
  return { points: P, scale, labels };
}

// Each leg is labelled with its length on the side away from the shape's centre.
function shapeSvg(shape, opts = {}) {
  const w = opts.w || 300, h = opts.h || 120, stroke = opts.stroke || 2;
  const pad = Math.min(22, Math.round(Math.min(w, h) * 0.3));   // room for the labels (11 px out + half a line)
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
  const text = (x, y, t) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="12" font-family="Arial, sans-serif" text-anchor="middle" dominant-baseline="middle" fill="#0E1A20">${t}</text>`;
  if (shape.family === 'hoop') {
    const r = Math.max(4, Math.min(w, h) / 2 - Math.min(pad, 10));
    return head + `<circle cx="${w / 2}" cy="${h / 2}" r="${r}" fill="none" stroke="#0E1A20" stroke-width="${stroke}"/>`
      + text(w / 2, h / 2, 'Ø' + rbLabel(shape.D)) + '</svg>';
  }
  const segs = shape.segments || [];
  const { points: P, labels } = shapeLayout(shape, w, h, pad);
  let out = head + `<polyline points="${P.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ')}" fill="none" stroke="#0E1A20" stroke-width="${stroke}" stroke-linejoin="round" stroke-linecap="round"/>`;
  if (shape.hooks > 0 && P.length > 1) {
    const tick = (p, q, rot) => {   // a 135° hook at p, turned from the direction p→q
      const a = Math.atan2(q.y - p.y, q.x - p.x) + rot * Math.PI / 180;
      return `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${(p.x + 9 * Math.cos(a)).toFixed(1)}" y2="${(p.y + 9 * Math.sin(a)).toFixed(1)}" stroke="#0E1A20" stroke-width="${stroke}" stroke-linecap="round"/>`;
    };
    out += tick(P[0], P[1], 45);
    if (shape.hooks > 1) out += tick(P[P.length - 1], P[P.length - 2], -45);
  }
  labels.forEach((l, i) => { out += text(l.x + l.nx * 11, l.y + l.ny * 11, rbLabel(segs[i].len)); });
  return out + '</svg>';
}

// ---- elements (spec 2026-10-14) ----
// A corner mesh ("רשת קרנץ") drawn as its cross section: the cross bar's long leg a with the
// short leg b at the far end (down for the upper mesh, up for the lower one), and the
// longitudinal bars as circles 10, 30, 50 … cm from the free end, as on the supplier's sheet.
// Spacers and other elements have no drawing.
function elementSvg(p, opts = {}) {
  if (!p || p.type !== 'kranz') return null;
  const w = opts.w || 300, h = opts.h || 120, stroke = opts.stroke || 2;
  const pad = Math.min(22, Math.round(Math.min(w, h) * 0.3));
  const up = p.variant !== 'lower';
  const shape = { family: 'figura', segments: [{ len: p.a, turn: up ? 90 : -90 }, { len: p.b, turn: 0 }] };
  const { points: P, labels } = shapeLayout(shape, w, h, pad);
  const text = (x, y, t) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="12" font-family="Arial, sans-serif" text-anchor="middle" dominant-baseline="middle" fill="#0E1A20">${t}</text>`;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<polyline points="${P.map(q => q.x.toFixed(1) + ',' + q.y.toFixed(1)).join(' ')}" fill="none" stroke="#0E1A20" stroke-width="${stroke}" stroke-linejoin="round" stroke-linecap="round"/>`;
  const a = Number(p.a), n = Number(p.n_long) || 0;
  if (a > 0) {
    const side = up ? 1 : -1, r = Math.max(2.5, stroke * 1.4);
    for (let i = 0; i < n && 10 + 20 * i < a; i++) {
      const x = P[0].x + (10 + 20 * i) / a * (P[1].x - P[0].x);
      out += `<circle cx="${x.toFixed(1)}" cy="${(P[0].y + side * (r + stroke)).toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="#0E1A20" stroke-width="${Math.max(1, stroke * 0.7).toFixed(1)}"/>`;
    }
  }
  labels.forEach((l, i) => { out += text(l.x + l.nx * 11, l.y + l.ny * 11, rbLabel(i ? p.b : p.a)); });
  return out + '</svg>';
}

// ---- a drawing for every element: 2D or 3D (spec 2026-10-19 §2, §4) ----
// Each type's views, its default first; "other" carries an uploaded image instead.
const RB_ELEMENT_VIEWS = { kranz: ['3d', '2d'], column: ['3d', '2d'], beam: ['3d', '2d'], spacer: ['2d'] };

function elementDefaultView(type) {
  const v = RB_ELEMENT_VIEWS[type];
  return v ? v[0] : null;
}

// The view a line is drawn in: its own choice when the type has that view, else the default.
function elementView(p) {
  const v = RB_ELEMENT_VIEWS[(p || {}).type];
  if (!v) return null;
  return v.includes(p.view) ? p.view : v[0];
}

const RB_INK = '#0E1A20', RB_DIM = '#637178';
const rbF = v => v.toFixed(1);
const rbHead = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
// A text with Hebrew in it is laid out right-to-left, or "ב.ע. 2Ø12" shows as "2 ב.ע.Ø12";
// `anchor` keeps meaning the visual side (start = left), so it is flipped for those.
function rbText(x, y, t, anchor = 'middle', size = 12) {
  const rtl = /[֐-׿]/.test(t);
  const a = rtl && anchor !== 'middle' ? (anchor === 'start' ? 'end' : 'start') : anchor;
  return `<text x="${rbF(x)}" y="${rbF(y)}" font-size="${Math.round(size * 10) / 10}" font-family="Arial, sans-serif" text-anchor="${a}" direction="${rtl ? 'rtl' : 'ltr'}" unicode-bidi="embed" dominant-baseline="middle" fill="${RB_INK}">${t}</text>`;
}
function rbSeg(p, q, width, cls = '', color = RB_INK) {
  return `<line${cls ? ` class="${cls}"` : ''} x1="${rbF(p[0])}" y1="${rbF(p[1])}" x2="${rbF(q[0])}" y2="${rbF(q[1])}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
}

// An isometric view — x along the element, z across it, y up — fitted into w×h. The section is
// drawn larger than to scale (at least ~22% of the length) so its bars stay readable; the
// dimensions written on it are the true ones. `oblique` (the small thumbnails): the length runs
// level and the depth goes up at 45°, so a long element fills a wide, low box.
function rbIso(L, y0, y1, z0, z1, w, h, pad, oblique) {
  const C = Math.cos(Math.PI / 6), S = 0.5, D = 0.35;
  const ks = Math.max(1, (L * 0.22) / Math.max(y1 - y0, z1 - z0, 1e-6));
  const raw = oblique
    ? (x, y, z) => [x + z * ks * D, -(y + z * D) * ks]
    : (x, y, z) => [(x - z * ks) * C, (x + z * ks) * S - y * ks];
  const pts = [];
  for (const x of [0, L]) for (const y of [y0, y1]) for (const z of [z0, z1]) pts.push(raw(x, y, z));
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const bw = Math.max(...xs) - minX || 1, bh = Math.max(...ys) - minY || 1;
  const k = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
  const ox = (w - bw * k) / 2 - minX * k, oy = (h - bh * k) / 2 - minY * k;
  return (x, y, z) => { const r = raw(x, y, z); return [ox + r[0] * k, oy + r[1] * k]; };
}

// The text unit of a drawing: 1 for the small ones (table rows, thumbnails), larger for the big
// ones on the PDF's drawings page, so their numbers stay readable once shrunk.
function rbUnit(w, h) { return Math.max(1, Math.min(w, h) / 240); }

// The hoops a drawing shows: all of them up to `max`, else every k-th (one k for every zone,
// so the dense ends still look denser).
function cageDrawnHoops(L, s, end, s_end, max = 80) {
  const all = cageHoopPositions(L, s, end, s_end);
  if (all.length <= max) return all;
  const k = Math.ceil(all.length / max);
  return all.filter((_, i) => i % k === 0);
}

// A cage's section: width W (across, z) and height H (y); a column is a×b, a beam b×h.
function rbCageSection(p) {
  const col = p.type === 'column';
  return { W: Number(col ? p.a : p.b), H: Number(col ? p.b : p.h) };
}

// Where a cage's bars sit in its section, as [y, z] in cm, a little inside the hoop: a column has
// n_a bars on each a-side and n_b on each b-side (corners shared); a beam n_top on top, n_bot below.
function rbCageBars(p) {
  const { W, H } = rbCageSection(p), c = Math.min(W, H) * 0.1;
  const spread = (n, len) => (n < 2 ? [len / 2] : Array.from({ length: n }, (_, i) => c + (len - 2 * c) * i / (n - 1)));
  const out = [];
  if (p.type === 'column') {
    for (const z of spread(Number(p.n_a), W)) out.push([c, z], [H - c, z]);
    for (const y of spread(Number(p.n_b), H).slice(1, -1)) out.push([y, c], [y, W - c]);
  } else {
    for (const z of spread(Number(p.n_top), W)) out.push([H - c, z]);
    for (const z of spread(Number(p.n_bot), W)) out.push([c, z]);
  }
  return out;
}

// A cage drawing needs every size it is built from; otherwise there is no drawing.
function rbCageOk(p) {
  const nums = p.type === 'column' ? [p.a, p.b, p.L, p.n_a, p.n_b, p.s] : [p.b, p.h, p.L, p.n_top, p.n_bot, p.s];
  return nums.every(v => Number(v) > 0) && (Number(p.legs) !== 4 || Number(p.inner) > 0);
}

// The texts beside a cage: its bars (one line for a column, ב.ע./ב.ת. for a beam) and its hoops.
function rbCageTexts(item) {
  const p = item.params;
  const bars = p.type === 'column'
    ? [`${rbLabel(2 * (Number(p.n_a) + Number(p.n_b)) - 4)}Ø${rbLabel(p.d_long)}`]
    : [`ב.ע. ${rbLabel(p.n_top)}Ø${rbLabel(p.d_top)}`, `ב.ת. ${rbLabel(p.n_bot)}Ø${rbLabel(p.d_bot)}`];
  return { bars, hoops: `${Number(p.legs) === 4 ? '4L ' : ''}Ø${rbLabel(item.diameter_mm)}@${rbLabel(p.s)}` };
}

// 3D: every bar along L, a hoop (and the inner one) at each drawn position; the bars and hoops
// written top-left, the section top-right, the length under the front edge.
function rbCage3d(item, w, h, stroke, bare) {
  const p = item.params, L = Number(p.L), { W, H } = rbCageSection(p), u = rbUnit(w, h);
  const pad = bare ? 2 : Math.max(18, Math.round(Math.min(w, h) * 0.16));
  const P = rbIso(L, 0, H, 0, W, w, h, pad, bare);
  let out = rbHead(w, h);
  out += rbCageBars(p).map(([y, z]) => rbSeg(P(0, y, z), P(L, y, z), (stroke * 0.9).toFixed(2), 'bar')).join('');
  const rings = [[0, W]];
  if (Number(p.legs) === 4) rings.push([(W - Number(p.inner)) / 2, (W + Number(p.inner)) / 2]);
  const hw = Math.max(0.6, stroke * 0.35).toFixed(2);
  for (const x of cageDrawnHoops(L, p.s, p.end, p.s_end)) {
    for (const [z0, z1] of rings) {
      const pts = [P(x, 0, z0), P(x, H, z0), P(x, H, z1), P(x, 0, z1)];
      out += `<polygon class="hoop" points="${pts.map(q => rbF(q[0]) + ',' + rbF(q[1])).join(' ')}" fill="none" stroke="${RB_INK}" stroke-width="${hw}"/>`;
    }
  }
  const t = rbCageTexts(item);
  [...t.bars, t.hoops].forEach((s, i) => { out += rbText(4 * u, (10 + i * 14) * u, s, 'start', 12 * u); });
  out += rbText(w - 4 * u, 10 * u, `${rbLabel(W)}×${rbLabel(H)}`, 'end', 12 * u);
  const a0 = P(0, 0, W), a1 = P(L, 0, W);
  out += rbText((a0[0] + a1[0]) / 2, Math.min(h - 8 * u, (a0[1] + a1[1]) / 2 + 14 * u), 'L=' + rbLabel(L), 'middle', 12 * u);
  return out + '</svg>';
}

// 2D: the section on the right (hoops as rectangles, one circle per bar, the sizes) and the side
// view on the left (the bars, a tick per drawn hoop, and the zones with their lengths and spacing).
function rbCage2d(item, w, h, stroke) {
  const p = item.params, L = Number(p.L), { W, H } = rbCageSection(p), u = rbUnit(w, h);
  const pad = Math.max(16, Math.round(Math.min(w, h) * 0.14));
  const t = rbCageTexts(item);
  let out = rbHead(w, h);
  // the section
  const box = Math.min(h - 2 * pad - 16 * u, w * 0.32), k = box / Math.max(W, H);
  const sx = w - pad - W * k, sy = (h - H * k) / 2;
  const at = (y, z) => [sx + z * k, sy + (H - y) * k];
  out += `<rect x="${rbF(sx)}" y="${rbF(sy)}" width="${rbF(W * k)}" height="${rbF(H * k)}" fill="none" stroke="${RB_INK}" stroke-width="${(stroke * 0.6).toFixed(2)}" rx="2"/>`;
  if (Number(p.legs) === 4) {
    const i = Number(p.inner);
    out += `<rect x="${rbF(sx + (W - i) / 2 * k)}" y="${rbF(sy)}" width="${rbF(i * k)}" height="${rbF(H * k)}" fill="none" stroke="${RB_INK}" stroke-width="${(stroke * 0.5).toFixed(2)}" rx="2"/>`;
  }
  const r = Math.max(2, Math.min(W, H) * k * 0.06);
  out += rbCageBars(p).map(([y, z]) => { const q = at(y, z); return `<circle cx="${rbF(q[0])}" cy="${rbF(q[1])}" r="${rbF(r)}" fill="${RB_INK}"/>`; }).join('');
  out += rbText(sx + W * k / 2, sy + H * k + 11 * u, rbLabel(W), 'middle', 12 * u);
  out += rbText(sx - 4 * u, sy + H * k / 2, rbLabel(H), 'end', 12 * u);
  const title = t.bars.join(' · '), est = title.length * 6 * u;   // ~6 px a character at 11 px: kept inside the drawing
  out += rbText(Math.min(sx + W * k / 2, w - 2 - est / 2), sy - 9 * u, title, 'middle', 11 * u);
  // the side view
  const x0 = pad, x1 = sx - 30 * u, ty = h / 2 - 12 * u, by = h / 2 + 12 * u, kx = (x1 - x0) / L;
  out += rbSeg([x0, ty], [x1, ty], (stroke * 0.8).toFixed(2)) + rbSeg([x0, by], [x1, by], (stroke * 0.8).toFixed(2));
  for (const x of cageDrawnHoops(L, p.s, p.end, p.s_end)) out += rbSeg([x0 + x * kx, ty], [x0 + x * kx, by], Math.max(0.6, stroke * 0.3).toFixed(2));
  const end = Number(p.end) || 0, dy = by + 16 * u;
  const zones = end > 0 && 2 * end < L ? [[0, end, p.s_end], [end, L - end, p.s], [L - end, L, p.s_end]]
    : [[0, L, end > 0 ? p.s_end : p.s]];
  for (const [a, b, step] of zones) {
    const xa = x0 + a * kx, xb = x0 + b * kx;
    out += rbSeg([xa, dy - 4 * u], [xa, dy + 4 * u], 0.8 * u, '', RB_DIM) + rbSeg([xb, dy - 4 * u], [xb, dy + 4 * u], 0.8 * u, '', RB_DIM) + rbSeg([xa, dy], [xb, dy], 0.8 * u, '', RB_DIM);
    if (zones.length > 1) out += rbText((xa + xb) / 2, dy + 10 * u, rbLabel(b - a), 'middle', 11 * u);
    out += rbText((xa + xb) / 2, ty - 9 * u, '@' + rbLabel(step), 'middle', 11 * u);
  }
  out += rbText((x0 + x1) / 2, Math.min(h - 6 * u, dy + 22 * u), 'L=' + rbLabel(L), 'middle', 12 * u);
  out += rbText(x0, 10 * u, t.hoops, 'start', 12 * u);
  return out + '</svg>';
}

// A corner mesh in 3D: ⌈L/s⌉ cross bars bent a then b (down for the upper mesh, up for the lower),
// and the longitudinal bars 10, 30, 50 … cm from the free end, along L.
function rbKranz3d(p, w, h, stroke, bare) {
  const L = Number(p.L), a = Number(p.a), b = Number(p.b), s = Number(p.s);
  if (![L, a, b, s].every(v => v > 0)) return null;
  const turn = p.variant === 'lower' ? 1 : -1, pad = bare ? 2 : Math.max(18, Math.round(Math.min(w, h) * 0.16)), u = rbUnit(w, h);
  const P = rbIso(L, Math.min(0, turn * b), Math.max(0, turn * b), 0, a, w, h, pad, bare);
  let out = rbHead(w, h);
  const n = Math.ceil(L / s), cw = Math.max(0.6, stroke * 0.4).toFixed(2);
  for (let i = 0; i < n; i++) {
    const x = n > 1 ? L * i / (n - 1) : L / 2;
    const pts = [P(x, 0, 0), P(x, 0, a), P(x, turn * b, a)];
    out += `<polyline class="cross" points="${pts.map(q => rbF(q[0]) + ',' + rbF(q[1])).join(' ')}" fill="none" stroke="${RB_INK}" stroke-width="${cw}" stroke-linejoin="round"/>`;
  }
  for (let i = 0; i < (Number(p.n_long) || 0) && 10 + 20 * i < a; i++) {
    const z = 10 + 20 * i;
    out += rbSeg(P(0, 0, z), P(L, 0, z), (stroke * 0.9).toFixed(2), 'bar');
  }
  const e0 = P(L, 0, 0), e1 = P(L, 0, a), e2 = P(L, turn * b, a);
  out += rbText((e0[0] + e1[0]) / 2 + 10 * u, (e0[1] + e1[1]) / 2 - 8 * u, rbLabel(p.a), 'start', 12 * u);
  out += rbText((e1[0] + e2[0]) / 2 + 8 * u, (e1[1] + e2[1]) / 2, rbLabel(p.b), 'start', 12 * u);
  const f0 = P(0, 0, 0), f1 = P(L, 0, 0);
  out += rbText((f0[0] + f1[0]) / 2 + 14 * u, (f0[1] + f1[1]) / 2 - 12 * u, 'L=' + rbLabel(L), 'middle', 12 * u);
  return out + '</svg>';
}

// A spacer seen from the side: base, top wire and the zigzag between, 2 m long; the height is
// drawn larger than to scale and written in mm.
function rbSpacer2d(p, w, h, stroke) {
  const H = Number(p.height_mm) / 10, L = 200;
  if (!(H > 0)) return null;
  const pad = Math.max(16, Math.round(Math.min(w, h) * 0.16)), u = rbUnit(w, h);
  const x0 = pad, x1 = w - pad - 34 * u, y1 = pad + 4 * u, y0 = h - pad - 10 * u;
  let out = rbHead(w, h);
  const sw = (stroke * 0.8).toFixed(2);
  out += rbSeg([x0, y0], [x1, y0], sw) + rbSeg([x0, y1], [x1, y1], sw);
  const n = L / 10, pts = Array.from({ length: n + 1 }, (_, i) => `${rbF(x0 + (x1 - x0) * i / n)},${rbF(i % 2 ? y1 : y0)}`);
  out += `<polyline points="${pts.join(' ')}" fill="none" stroke="${RB_INK}" stroke-width="${(stroke * 0.6).toFixed(2)}" stroke-linejoin="round"/>`;
  out += rbSeg([x1 + 10 * u, y1], [x1 + 10 * u, y0], 0.8 * u, '', RB_DIM) + rbText(x1 + 14 * u, (y0 + y1) / 2, 'h=' + rbLabel(p.height_mm), 'start', 11 * u);
  out += rbText((x0 + x1) / 2, y0 + 14 * u, rbLabel(L), 'middle', 12 * u);
  return out + '</svg>';
}

// ---- piles (2026-10-19): a round cage of n bars on the diameter d, L1+L2+L3 long, wound by a
// spiral at p1 over L2 and p2 over L3 (none over L1, the part that goes into the cap) ----
function pileView(p) { return p && p.view === '2d' ? '2d' : '3d'; }

// The spiral turns a drawing shows: all of them up to `max`, else every k-th (one k for both
// zones, so the dense zone still looks denser).
function pileDrawnTurns(p, max = 80) {
  const t2 = Number(p.L2) > 0 ? Number(p.L2) / Number(p.p1) : 0, t3 = Number(p.L3) > 0 ? Number(p.L3) / Number(p.p2) : 0;
  const k = Math.max(1, Math.ceil((t2 + t3) / max));
  return { k, n: Math.ceil(t2 / k - 1e-9) + Math.ceil(t3 / k - 1e-9) };
}

function rbPileOk(p) {
  const L1 = Number(p.L1) || 0, L2 = Number(p.L2) || 0, L3 = Number(p.L3) || 0;
  return Number(p.d) > 0 && Number.isInteger(Number(p.n)) && Number(p.n) >= 3 && Math.min(L1, L2, L3) >= 0 && L1 + L2 + L3 > 0
    && (L2 === 0 || Number(p.p1) > 0) && (L3 === 0 || Number(p.p2) > 0);
}

function rbPileTexts(item) {
  const p = item.params;
  return {
    bars: `${rbLabel(p.n)}Ø${rbLabel(item.diameter_mm)}`,
    spiral: `ספירלה Ø${rbLabel(p.d_spiral)} @${rbLabel(p.p1)}/@${rbLabel(p.p2)}`,
    size: `d=${rbLabel(p.d)}${Number(p.D) > 0 ? ' · D=' + rbLabel(p.D) : ''}`,
  };
}

// the spiral's zones along the cage: [from, length, pitch]
function rbPileZones(p) {
  const L1 = Number(p.L1) || 0, L2 = Number(p.L2) || 0, L3 = Number(p.L3) || 0;
  return [[L1, L2, Number(p.p1)], [L1 + L2, L3, Number(p.p2)]].filter(z => z[1] > 0);
}

// The zones with their keys, for the boxes of the window: [key, from, to, step, step key].
function rbPileKeyedZones(p) {
  const L1 = Number(p.L1) || 0, L2 = Number(p.L2) || 0, L3 = Number(p.L3) || 0;
  return [['L1', 0, L1, null, null], ['L2', L1, L1 + L2, Number(p.p1), 'p1'], ['L3', L1 + L2, L1 + L2 + L3, Number(p.p2), 'p2']]
    .filter(z => z[2] > z[1]);
}
const RB_BOX_HALF = 34;   // half a box of the window, in px: two boxes closer than this share no row

// 3D: the cage lying down, every bar along it and the spiral around them; the bars and spiral
// written top-left, d/D top-right, the length under the front edge. ed.boxed (the window): the
// sizes are boxes at ed.marks[key] instead of text.
function rbPile3d(item, w, h, stroke, bare, ed = {}) {
  const p = item.params, L = (Number(p.L1) || 0) + (Number(p.L2) || 0) + (Number(p.L3) || 0), r = Number(p.d) / 2, u = rbUnit(w, h);
  const pad = bare ? 2 : Math.max(18, Math.round(Math.min(w, h) * 0.16));
  const P = rbIso(L, -r, r, -r, r, w, h, pad, bare);
  let out = rbHead(w, h);
  const n = Number(p.n);
  for (let i = 0; i < n; i++) {
    const a = 2 * Math.PI * i / n, y = r * 0.9 * Math.cos(a), z = r * 0.9 * Math.sin(a);
    out += rbSeg(P(0, y, z), P(L, y, z), (stroke * 0.9).toFixed(2), 'bar');
  }
  const { k } = pileDrawnTurns(p), pts = [];
  let turn = 0;
  for (const [x0, len, pitch] of rbPileZones(p)) {
    const step = pitch * k, segs = Math.max(1, Math.round(len / step * 16));
    for (let j = 0; j <= segs; j++) {
      const ang = turn + 2 * Math.PI * (len * j / segs) / step;
      pts.push(P(x0 + len * j / segs, r * Math.cos(ang), r * Math.sin(ang)));
    }
    turn += 2 * Math.PI * len / step;
  }
  if (pts.length) out += `<polyline class="spiral" points="${pts.map(q => rbF(q[0]) + ',' + rbF(q[1])).join(' ')}" fill="none" stroke="${RB_INK}" stroke-width="${Math.max(0.6, stroke * 0.35).toFixed(2)}" stroke-linejoin="round"/>`;
  const t = rbPileTexts(item);
  out += rbText(4 * u, 10 * u, t.bars, 'start', 12 * u) + rbText(4 * u, 24 * u, t.spiral, 'start', 12 * u);
  const a0 = P(0, -r, r), a1 = P(L, -r, r);
  if (ed.boxed) {
    const m = ed.marks || {}, top = 12 * u;
    // [d][box]   [D][box] at the top right; each letter right before its box
    m.D = [w - RB_BOX_HALF - 6, top]; m.d = [m.D[0] - 4 * RB_BOX_HALF - 10, top];
    out += rbText(m.D[0] - RB_BOX_HALF - 4, top, 'D', 'end', 12 * u) + rbText(m.d[0] - RB_BOX_HALF - 4, top, 'd', 'end', 12 * u);
    let lastRight = -Infinity;
    for (const [key, a, b, , stepKey] of rbPileKeyedZones(p)) {
      const lo = P((a + b) / 2, -r, r), hi = P((a + b) / 2, r, -r);
      const second = lo[0] - RB_BOX_HALF < lastRight + 4;
      m[key] = [lo[0], Math.min(h - 14, lo[1] + (second ? 46 : 18))];
      if (!second) lastRight = lo[0] + RB_BOX_HALF;
      if (stepKey) m[stepKey] = [hi[0], Math.max(14, hi[1] - 18)];
    }
  } else out += rbText(w - 4 * u, 10 * u, t.size, 'end', 12 * u);
  // with boxes under the edge, the total length goes to the bottom corner
  if (ed.boxed) out += rbText(4 * u, h - 8 * u, 'L=' + rbLabel(L), 'start', 12 * u);
  else out += rbText((a0[0] + a1[0]) / 2, Math.min(h - 8 * u, (a0[1] + a1[1]) / 2 + 14 * u), 'L=' + rbLabel(L), 'middle', 12 * u);
  return out + '</svg>';
}

// 2D: the section on the right (d, the dashed D around it, one dot per bar) and the side view on
// the left (the bars, the spiral as a zigzag, the zones with their lengths and steps).
function rbPile2d(item, w, h, stroke, ed = {}) {
  const p = item.params, L1 = Number(p.L1) || 0, L = L1 + (Number(p.L2) || 0) + (Number(p.L3) || 0);
  const d = Number(p.d), D = Number(p.D) > 0 ? Number(p.D) : 0, n = Number(p.n), u = rbUnit(w, h), t = rbPileTexts(item);
  const pad = Math.max(16, Math.round(Math.min(w, h) * 0.14));
  let out = rbHead(w, h);
  // the section
  const R = Math.max(d, D) / 2, k = Math.min(h - 2 * pad - 24 * u, w * 0.26) / (2 * R);
  const cx = w - pad - R * k, cy = h / 2;
  if (D) out += `<circle cx="${rbF(cx)}" cy="${rbF(cy)}" r="${rbF(D / 2 * k)}" fill="none" stroke="${RB_DIM}" stroke-width="${(0.8 * u).toFixed(2)}" stroke-dasharray="${rbF(4 * u)} ${rbF(3 * u)}"/>`;
  out += `<circle cx="${rbF(cx)}" cy="${rbF(cy)}" r="${rbF(d / 2 * k)}" fill="none" stroke="${RB_INK}" stroke-width="${(stroke * 0.6).toFixed(2)}"/>`;
  const rb = Math.max(1.5, d * k * 0.035), rr = d / 2 * k - rb - 1;
  for (let i = 0; i < n; i++) {
    const a = 2 * Math.PI * i / n;
    out += `<circle class="bar" cx="${rbF(cx + rr * Math.cos(a))}" cy="${rbF(cy + rr * Math.sin(a))}" r="${rbF(rb)}" fill="${RB_INK}"/>`;
  }
  out += rbText(cx, cy - R * k - 9 * u, t.bars, 'middle', 11 * u);
  if (ed.boxed) {
    const m = ed.marks || {}, y = cy + R * k + 14 * u;
    m.d = [cx - RB_BOX_HALF - 16, y]; m.D = [cx + RB_BOX_HALF + 24, y];
    out += rbText(m.d[0] - RB_BOX_HALF - 4, y, 'd', 'end', 11 * u) + rbText(m.D[0] - RB_BOX_HALF - 4, y, 'D', 'end', 11 * u);
  } else out += rbText(cx, cy + R * k + 11 * u, t.size, 'middle', 11 * u);
  // the side view
  const x0 = pad, x1 = cx - R * k - 30 * u, ty = h / 2 - 12 * u, by = h / 2 + 12 * u, kx = (x1 - x0) / L;
  const sw = (stroke * 0.8).toFixed(2);
  out += rbSeg([x0, ty], [x1, ty], sw) + rbSeg([x0, by], [x1, by], sw);
  const { k: every } = pileDrawnTurns(p), zz = [];
  for (const [a, len, pitch] of rbPileZones(p)) {
    const half = pitch * every / 2, m = Math.max(1, Math.round(len / half));
    for (let j = 0; j <= m; j++) zz.push(`${rbF(x0 + (a + len * j / m) * kx)},${rbF(j % 2 ? by : ty)}`);
  }
  if (zz.length) out += `<polyline class="spiral" points="${zz.join(' ')}" fill="none" stroke="${RB_INK}" stroke-width="${Math.max(0.6, stroke * 0.3).toFixed(2)}"/>`;
  const dy = by + 16 * u;
  // a zone's length goes under it; one that would run into the label (or box) before it drops a row
  let lastRight = -Infinity, rows = 1;
  for (const [key, a, b, step, stepKey] of rbPileKeyedZones(p)) {
    const xa = x0 + a * kx, xb = x0 + b * kx, label = rbLabel(b - a), mid = (xa + xb) / 2;
    const half = ed.boxed ? RB_BOX_HALF : label.length * 3.4 * u, row2 = ed.boxed ? 2 * RB_BOX_HALF / 3 + 14 * u : 12 * u;
    out += rbSeg([xa, dy - 4 * u], [xa, dy + 4 * u], 0.8 * u, '', RB_DIM) + rbSeg([xb, dy - 4 * u], [xb, dy + 4 * u], 0.8 * u, '', RB_DIM) + rbSeg([xa, dy], [xb, dy], 0.8 * u, '', RB_DIM);
    const second = mid - half < lastRight + 2 * u, y = dy + 10 * u + (second ? row2 : 0);
    if (ed.boxed) (ed.marks || {})[key] = [mid, y]; else out += rbText(mid, y, label, 'middle', 11 * u);
    if (second) rows = 2; else lastRight = mid + half;
    if (step) {
      if (ed.boxed) (ed.marks || {})[stepKey] = [mid, ty - 14 * u]; else out += rbText(mid, ty - 9 * u, '@' + rbLabel(step), 'middle', 11 * u);
    }
  }
  out += rbText((x0 + x1) / 2, Math.min(h - 6 * u, dy + (rows === 2 ? 34 : 22) * u + (ed.boxed ? 12 * u : 0)), 'L=' + rbLabel(L), 'middle', 12 * u);
  out += rbText(x0, 10 * u, t.spiral, 'start', 12 * u);
  return out + '</svg>';
}

// A pile line's drawing in its view (or opts.view), or null for sizes that cannot be drawn;
// opts.bare as for elements.
function pileDrawing(item, opts = {}) {
  const p = (item && item.params) || {};
  if (!rbPileOk(p)) return null;
  const view = opts.view === '2d' || opts.view === '3d' ? opts.view : pileView(p);
  const w = opts.w || 300, h = opts.h || 120, stroke = opts.stroke || 2, bare = !!opts.bare;
  const ed = { marks: opts.marks, boxed: !!opts.boxed };   // the window's boxes (2026-10-19)
  const svg = view === '2d' ? rbPile2d(item, w, h, stroke, ed) : rbPile3d(item, w, h, stroke, bare, ed);
  return bare ? svg.replace(/<text[\s\S]*?<\/text>/g, '') : svg;
}

// The drawing of an element line in its view (or opts.view): an SVG string, or null for "other"
// (its image is shown instead) and for sizes that cannot be drawn. opts.bare (the small
// thumbnails, whose line already lists every size): no text, and a 3D view fills the box.
function elementDrawing(item, opts = {}) {
  const p = (item && item.params) || {};
  const view = elementView({ ...p, view: opts.view || p.view });
  if (!view) return null;
  const w = opts.w || 300, h = opts.h || 120, stroke = opts.stroke || 2, bare = !!opts.bare;
  let svg = null;
  if (p.type === 'kranz') svg = view === '2d' ? elementSvg(p, { w, h, stroke }) : rbKranz3d(p, w, h, stroke, bare);
  else if (p.type === 'column' || p.type === 'beam') {
    if (rbCageOk(p)) svg = view === '2d' ? rbCage2d(item, w, h, stroke) : rbCage3d(item, w, h, stroke, bare);
  } else if (p.type === 'spacer') svg = rbSpacer2d(p, w, h, stroke);
  return svg && bare ? svg.replace(/<text[\s\S]*?<\/text>/g, '') : svg;
}

// ---- meshes (2026-10-14) ----
// A mesh's bars as meshCalc weighs them — ceil(y/s) bars along X spaced s apart, ceil(x/s_x)
// along Y — laid at their spacing and centred, so the ends stick out equally on both edges.
// Positions are cm from the top (ys) and from the left (xs).
function meshBars(p) {
  const x = Number(p.x), y = Number(p.y), s = Number(p.s);
  const sX = p.type === 'asym' && Number(p.s_x) > 0 ? Number(p.s_x) : s;
  const nX = Math.max(1, Math.ceil(y / s)), nY = Math.max(1, Math.ceil(x / sX));
  const oy = (y - (nX - 1) * s) / 2, ox = (x - (nY - 1) * sX) / 2;
  return { nX, nY, oy, ox, ys: Array.from({ length: nX }, (_, i) => oy + i * s), xs: Array.from({ length: nY }, (_, i) => ox + i * sX) };
}

// The mesh in a w×h box, proportions kept and centred: its corner, drawn size, scale (px per
// cm) and the bars in px.
function meshLayout(p, w, h, pad) {
  const b = meshBars(p), x = Number(p.x), y = Number(p.y);
  const scale = Math.min((w - 2 * pad) / x, (h - 2 * pad) / y);
  const dw = x * scale, dh = y * scale, x0 = (w - dw) / 2, y0 = (h - dh) / 2;
  return { x0, y0, w: dw, h: dh, scale, nX: b.nX, nY: b.nY, ys: b.ys.map(v => y0 + v * scale), xs: b.xs.map(v => x0 + v * scale) };
}

// The mesh as the supplier wants it sketched: every bar, X under it, Y beside it, and the
// diameter@spacing above (both directions for an asymmetric mesh). No size, no drawing.
function meshSvg(p, d, opts = {}) {
  if (!p || !(Number(p.x) > 0 && Number(p.y) > 0 && Number(p.s) > 0)) return null;
  const w = opts.w || 300, h = opts.h || 120, stroke = opts.stroke || 2;
  const pad = Math.min(22, Math.round(Math.min(w, h) * 0.3));
  const l = meshLayout(p, w, h, pad), sw = Math.max(0.8, stroke * 0.45).toFixed(2);
  const text = (x, y, t, anchor = 'middle') => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="12" font-family="Arial, sans-serif" text-anchor="${anchor}" dominant-baseline="middle" fill="#0E1A20">${t}</text>`;
  const line = (x1, y1, x2, y2) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#0E1A20" stroke-width="${sw}"/>`;
  const asym = p.type === 'asym';
  const spec = 'Ø' + rbLabel(d) + '@' + rbLabel(p.s) + (asym ? ' · Ø' + rbLabel(Number(p.d_y) || d) + '@' + rbLabel(Number(p.s_x) || p.s) : '');
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
  out += l.ys.map(v => line(l.x0, v, l.x0 + l.w, v)).join('') + l.xs.map(v => line(v, l.y0, v, l.y0 + l.h)).join('');
  out += text(l.x0 + l.w / 2, l.y0 + l.h + 11, rbLabel(p.x)) + text(l.x0 - 4, l.y0 + l.h / 2, rbLabel(p.y), 'end') + text(l.x0 + l.w / 2, l.y0 - 11, spec);
  return out + '</svg>';
}

// ---- editing on the drawing ----
// The legs that share one length with leg i (a closed stirrup's opposite sides).
function shapeLinkedSegs(shape, i) {
  const g = (shape.equal || []).find(gr => gr.includes(i));
  return g ? [...g].sort((a, b) => a - b) : [i];
}

// Which typed value (an index into shape.inputs) sets leg i; -1 for a hoop.
function shapeInputIndex(shape, i) {
  const linked = shapeLinkedSegs(shape, i);
  return (shape.inputs || []).findIndex(idx => linked.includes(idx));
}

// The same shape with every leg typed on its own ("סימטרי" off); name, family and hooks kept.
function shapeUnlinked(shape) {
  const s = JSON.parse(JSON.stringify(shape));
  s.equal = [];
  s.inputs = (s.segments || []).map((_, i) => i);
  return s;
}

// Whether a stored shape still has equal legs wherever its catalog shape pairs them.
function shapeKeepsEqual(shape, equal) {
  return (equal || []).every(g => g.every(i => Number(shape.segments[i].len) === Number(shape.segments[g[0]].len)));
}

// Dragging a leg: the pointer's travel along the leg's direction (dir, a unit vector in
// screen px) at `scale` px per cm, from the length v0, snapped to `step` cm.
function shapeDragLen(v0, dx, dy, dir, scale, step = 5) {
  const v = Number(v0) + (dx * dir.ux + dy * dir.uy) / scale;
  return Math.max(step, Math.round(v / step) * step);
}

// ---- free drawing ----
// Clicked points (cm, screen axes: x right, y down) → a shape. Points snap to the grid,
// repeats drop out, straight runs merge, and turns round to the nearest 45°.
function shapeFromPoints(points, gridCm = 5) {
  const snap = v => Math.round(v / gridCm) * gridCm;
  let pts = points.map(p => ({ x: snap(p.x), y: snap(p.y) }))
    .filter((p, i, a) => i === 0 || p.x !== a[i - 1].x || p.y !== a[i - 1].y);
  pts = pts.filter((p, i, a) => {
    if (i === 0 || i === a.length - 1) return true;
    const u = { x: p.x - a[i - 1].x, y: p.y - a[i - 1].y }, v = { x: a[i + 1].x - p.x, y: a[i + 1].y - p.y };
    return u.x * v.y - u.y * v.x !== 0 || u.x * v.x + u.y * v.y < 0;
  });
  if (pts.length < 2) return null;
  const headings = [], segments = [];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
    headings.push(Math.atan2(dy, dx) * 180 / Math.PI);
    segments.push({ len: Math.round(Math.hypot(dx, dy)), turn: 0 });
  }
  for (let i = 0; i < segments.length - 1; i++) {
    let t = headings[i + 1] - headings[i];
    while (t > 180) t -= 360;
    while (t <= -180) t += 360;
    segments[i].turn = Math.round(t / 45) * 45;
  }
  return {
    code: 'F', family: segments.length > 1 ? 'figura' : 'straight', label: 'שרטוט חופשי',
    bends: segments.length - 1, hooks: 0, equal: [], inputs: segments.map((_, i) => i), segments,
  };
}
