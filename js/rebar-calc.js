// ===== Rebar order weights and summary =====
// Computes exactly as EasyBar does (measured on two real orders, spec §2), because the
// supplier prices by the same numbers: kg/m from a 3-decimal table, a line's unit weight
// rounded to the cent before × quantity, and totals summed unrounded and rounded on output.

const REBAR_STOCK_LENGTHS = [600, 1200];   // cm — bars of these lengths come off the stock uncut

function rebarRound(x, n) {
  const f = 10 ** n;
  return Math.round((x + Math.sign(x) * Number.EPSILON) * f) / f;
}

// kg per metre: π/4·d²·7850 kg/m³, kept to 3 decimals the way the tables print it.
// (The unrounded formula gives 9.48 instead of EasyBar's 9.47 for Ø16 × 600.)
function rebarW(d) {
  return rebarRound(Math.PI / 4 * d * d * 0.00785, 3);
}

function rebarAddMeters(meters, d, m) {
  meters[d] = (meters[d] || 0) + m;
  return meters;
}

// A mesh: ceil(y/s) bars of length x and ceil(x/s) bars of length y (600×250 @20 → 13 + 30).
// An asymmetric mesh gives the y-length bars their own diameter and spacing — not measured
// on EasyBar, so it is flagged approximate.
function meshCalc(p, d) {
  const dY = p.type === 'asym' && p.d_y ? p.d_y : d;
  const sX = p.type === 'asym' && p.s_x ? p.s_x : p.s;
  const mX = Math.ceil(p.y / p.s) * p.x / 100;
  const mY = Math.ceil(p.x / sX) * p.y / 100;
  const meters = rebarAddMeters(rebarAddMeters({}, d, mX), dY, mY);
  return { unit_kg: rebarRound(mX * rebarW(d) + mY * rebarW(dY), 2), meters, approx: p.type === 'asym' };
}

// Sheets in one closed bundle ("חבילה") of a standard 600×250 mesh, from a supplier's table
// (שפי סטיל, read 2026-10-14; about 1.5–1.8 t a bundle). Other sizes, asymmetric and special
// meshes have no standard bundle. Keyed "diameter@spacing".
const REBAR_MESH_BUNDLE = {
  '6@15': 40, '6@20': 50, '6.5@10': 20, '6.5@15': 30, '6.5@20': 40, '7.5@10': 16, '7.5@15': 24, '7.5@20': 32,
  '8@10': 14, '8@15': 20, '8@20': 28, '10@10': 8, '10@15': 12, '10@20': 16,
};

function meshBundle(p, d) {
  if (!p || p.type === 'asym') return null;
  const x = Number(p.x), y = Number(p.y);
  if (!((x === 600 && y === 250) || (x === 250 && y === 600))) return null;
  return REBAR_MESH_BUNDLE[`${Number(d)}@${Number(p.s)}`] ?? null;
}

// A pile cage: n main bars over L1+L2+L3, and a spiral over L2 (pitch p1) and L3 (pitch p2)
// on the cage diameter d. EasyBar takes π as 3.14 here (14×Ø16, @10/@20, Ø10 → 476.55).
function pileCalc(p, dMain) {
  const length = p.L1 + p.L2 + p.L3;
  const mMain = p.n * length / 100;
  const mSpiral = (p.L2 / p.p1 + p.L3 / p.p2) * 3.14 * p.d / 100;
  const meters = rebarAddMeters(rebarAddMeters({}, dMain, mMain), p.d_spiral, mSpiral);
  return { length_cm: length, unit_kg: rebarRound(mMain * rebarW(dMain) + mSpiral * rebarW(p.d_spiral), 2), meters };
}

// A "ליפט": a closed bundle of straight bars from the mill, each lift at most REBAR_LIFT_KG.
// Bars per lift are counted in agorot-like hundredths so a float never drops a bar.
const REBAR_LIFT_KG = 1500;

function rebarLiftQty(d, lengthCm, lifts) {
  const unit = rebarRound(lengthCm / 100 * rebarW(d), 2);
  const perLift = Math.floor(REBAR_LIFT_KG * 100 / Math.round(unit * 100));
  const qty = perLift * lifts;
  return { unit_kg: unit, per_lift: perLift, qty, lift_kg: rebarRound(perLift * unit, 2), total_kg: rebarRound(qty * unit, 2) };
}

// A cage's hoops (spec 2026-10-19 §3.3), in cm from one end: dense over `end` cm at both ends
// (step s_end), at step s in the middle. Each zone is split into equal gaps no longer than its
// step, so the count is 2·⌈end/s_end⌉ + ⌈(L−2·end)/s⌉ + 1 (or ⌈L/s_end⌉ + 1 when the ends meet).
function cageHoopPositions(L, s, end, s_end) {
  L = Number(L); s = Number(s); end = Number(end) || 0;
  const se = Number(s_end) > 0 ? Number(s_end) : s;
  if (!(L > 0) || !(s > 0)) return [];
  const pos = [0];
  const fill = (from, to, step) => {
    const n = Math.ceil((to - from) / step - 1e-9);
    for (let i = 1; i <= n; i++) pos.push(rebarRound(from + (to - from) * i / n, 4));
  };
  if (end > 0 && 2 * end < L) { fill(0, end, se); fill(end, L - end, s); fill(L - end, L, se); }
  else fill(0, L, end > 0 ? se : s);
  return pos;
}

// A column or beam cage: its longitudinal bars over L, and per hoop position the outer hoop
// w×h plus, with four legs, an inner hoop inner×h; a hoop is 2(w+h) cm plus a d-cm hook at
// each end, as shapeLength counts a stirrup. Not measured on a supplier's note: approximate.
function cageCalc(p, d) {
  const col = p.type === 'column', L = Number(p.L);
  const w = Number(col ? p.a : p.b), h = Number(col ? p.b : p.h);
  const hoops = cageHoopPositions(L, p.s, p.end, p.s_end).length;
  const hoopCm = 2 * (w + h) + 2 * d + (Number(p.legs) === 4 ? 2 * (Number(p.inner) + h) + 2 * d : 0);
  const meters = {};
  if (col) rebarAddMeters(meters, Number(p.d_long), (2 * (Number(p.n_a) + Number(p.n_b)) - 4) * L / 100);
  else {
    rebarAddMeters(meters, Number(p.d_top), Number(p.n_top) * L / 100);
    rebarAddMeters(meters, Number(p.d_bot), Number(p.n_bot) * L / 100);
  }
  rebarAddMeters(meters, d, hoops * hoopCm / 100);
  const kg = Object.entries(meters).reduce((a, [dd, m]) => a + m * rebarW(Number(dd)), 0);
  return { length_cm: L, unit_kg: rebarRound(kg, 2), meters, approx: true, weighed: true };
}

// An element (spec 2026-10-14 §3). A corner mesh ("רשת קרנץ") is weighed from its bars the
// way a mesh is: ceil(L/s) cross bars of a+b cm, plus n_long bars along L — not measured on a
// supplier's note yet, so approximate. A spacer is counted, not weighed; "other" carries its
// own weight per unit.
function elementCalc(p, d) {
  if (p.type === 'kranz') {
    const mT = Math.ceil(p.L / p.s) * (p.a + p.b) / 100;
    const mL = p.n_long * p.L / 100;
    const meters = rebarAddMeters(rebarAddMeters({}, d, mT), p.d_long, mL);
    return { length_cm: p.L, unit_kg: rebarRound(mT * rebarW(d) + mL * rebarW(p.d_long), 2), meters, approx: true, weighed: true };
  }
  if (p.type === 'column' || p.type === 'beam') return cageCalc(p, Number(d));
  if (p.type === 'spacer') return { length_cm: 200, unit_kg: 0, meters: {}, approx: false, weighed: false };
  return { length_cm: null, unit_kg: rebarRound(Number(p.unit_kg) || 0, 2), meters: {}, approx: false, weighed: true };
}

// One order line → its weights, its metres per diameter (for the whole quantity), and
// the flags the summary needs.
function itemCalc(item) {
  const qty = Number(item.qty) || 0, d = Number(item.diameter_mm);
  let length = null, unit = 0, meters = {}, approx = false, weighed = true;
  if (item.kind === 'mesh') {
    const m = meshCalc(item.params, d);
    unit = m.unit_kg; meters = m.meters; approx = m.approx;
  } else if (item.kind === 'element') {
    const e = elementCalc(item.params, d);
    length = e.length_cm; unit = e.unit_kg; meters = e.meters; approx = e.approx; weighed = e.weighed;
  } else if (item.kind === 'pile') {
    const p = pileCalc(item.params, d);
    length = p.length_cm; unit = p.unit_kg; meters = p.meters;
  } else {
    length = Number(item.length_cm) || 0;
    unit = rebarRound(length / 100 * rebarW(d), 2);
    meters = { [d]: length / 100 };
    approx = !!(item.shape && item.shape.family === 'hoop');
  }
  for (const k of Object.keys(meters)) meters[k] *= qty;
  const family = item.kind === 'bar' && item.shape ? item.shape.family : null;
  return {
    length_cm: length, unit_kg: unit, total_kg: rebarRound(unit * qty, 2), meters,
    bent: !!family && family !== 'straight', kalmara: family === 'kalmara', approx, weighed,
  };
}

function orderSummary(items, wastePct) {
  const sections = { bar: { units: 0, kg: 0 }, mesh: { units: 0, kg: 0 }, pile: { units: 0, kg: 0 }, element: { units: 0, kg: 0 } };
  const meters = {};
  let cut = 0, bend = 0, kal = 0;
  for (const item of items) {
    const c = itemCalc(item);
    const sec = sections[item.kind] || sections.bar;
    sec.units += Number(item.qty) || 0;
    sec.kg += c.total_kg;
    for (const [d, m] of Object.entries(c.meters)) rebarAddMeters(meters, d, m);
    if (item.kind !== 'bar') continue;
    if (c.bent) bend += c.total_kg;
    if (c.bent || !REBAR_STOCK_LENGTHS.includes(c.length_cm)) cut += c.total_kg;
    if (c.kalmara) kal += Number(item.qty) || 0;
  }
  const totalKg = sections.bar.kg + sections.mesh.kg + sections.pile.kg + sections.element.kg;
  const totalT = totalKg / 1000, pct = Number(wastePct) || 0;
  for (const s of Object.values(sections)) s.kg = rebarRound(s.kg, 2);
  return {
    sections,
    units: sections.bar.units + sections.mesh.units + sections.pile.units + sections.element.units,
    total_kg: rebarRound(totalKg, 2),
    total_t: rebarRound(totalT, 4),
    waste_t: rebarRound(totalT * pct / 100, 4),
    with_waste_t: rebarRound(totalT * (1 + pct / 100), 4),
    cut_kg: rebarRound(cut, 1),
    bend_kg: rebarRound(bend, 1),
    kal_units: kal,
    by_d: Object.entries(meters).map(([d, m]) => ({ d: Number(d), m: rebarRound(m, 1), kg: rebarRound(m * rebarW(Number(d)), 2) }))
      .sort((a, b) => a.d - b.d),
  };
}
