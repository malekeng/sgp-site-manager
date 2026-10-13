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
// legs stay equal, so closed shapes still close. Each leg is labelled with its length
// on the side away from the shape's centre.
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
  let out = head + `<polyline points="${P.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ')}" fill="none" stroke="#0E1A20" stroke-width="${stroke}" stroke-linejoin="round" stroke-linecap="round"/>`;
  if (shape.hooks > 0 && P.length > 1) {
    const tick = (p, q, rot) => {   // a 135° hook at p, turned from the direction p→q
      const a = Math.atan2(q.y - p.y, q.x - p.x) + rot * Math.PI / 180;
      return `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${(p.x + 9 * Math.cos(a)).toFixed(1)}" y2="${(p.y + 9 * Math.sin(a)).toFixed(1)}" stroke="#0E1A20" stroke-width="${stroke}" stroke-linecap="round"/>`;
    };
    out += tick(P[0], P[1], 45);
    if (shape.hooks > 1) out += tick(P[P.length - 1], P[P.length - 2], -45);
  }
  segs.forEach((g, i) => {
    const a = P[i], b = P[i + 1], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    if (nx * (mx - cx) + ny * (my - cy) < 0 || (Math.abs(mx - cx) < 1e-6 && Math.abs(my - cy) < 1e-6 && ny < 0)) { nx = -nx; ny = -ny; }
    out += text(mx + nx * 11, my + ny * 11, rbLabel(g.len));
  });
  return out + '</svg>';
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
