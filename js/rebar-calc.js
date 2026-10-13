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

// A pile cage: n main bars over L1+L2+L3, and a spiral over L2 (pitch p1) and L3 (pitch p2)
// on the cage diameter d. EasyBar takes π as 3.14 here (14×Ø16, @10/@20, Ø10 → 476.55).
function pileCalc(p, dMain) {
  const length = p.L1 + p.L2 + p.L3;
  const mMain = p.n * length / 100;
  const mSpiral = (p.L2 / p.p1 + p.L3 / p.p2) * 3.14 * p.d / 100;
  const meters = rebarAddMeters(rebarAddMeters({}, dMain, mMain), p.d_spiral, mSpiral);
  return { length_cm: length, unit_kg: rebarRound(mMain * rebarW(dMain) + mSpiral * rebarW(p.d_spiral), 2), meters };
}

// One order line → its weights, its metres per diameter (for the whole quantity), and
// the flags the summary needs.
function itemCalc(item) {
  const qty = Number(item.qty) || 0, d = Number(item.diameter_mm);
  let length = null, unit = 0, meters = {}, approx = false;
  if (item.kind === 'mesh') {
    const m = meshCalc(item.params, d);
    unit = m.unit_kg; meters = m.meters; approx = m.approx;
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
    bent: !!family && family !== 'straight', kalmara: family === 'kalmara', approx,
  };
}

function orderSummary(items, wastePct) {
  const sections = { bar: { units: 0, kg: 0 }, mesh: { units: 0, kg: 0 }, pile: { units: 0, kg: 0 } };
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
  const totalKg = sections.bar.kg + sections.mesh.kg + sections.pile.kg;
  const totalT = totalKg / 1000, pct = Number(wastePct) || 0;
  for (const s of Object.values(sections)) s.kg = rebarRound(s.kg, 2);
  return {
    sections,
    units: sections.bar.units + sections.mesh.units + sections.pile.units,
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
