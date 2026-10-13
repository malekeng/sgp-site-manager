// ===== Rebar order receipts: what arrived, the status it means, and the check against the note =====
// Pure helpers for rebar-orders.html and the dashboard (no DOM, no database), tested in Node.
// The status rule is the database's own (private.rebar_recompute_order); it is repeated here
// only to show the result before the page reloads.

const RR_TOLERANCE_KG = 5;      // with 1%: the same threshold the documents check uses
const RR_TOLERANCE_PCT = 0.01;
const RR_SECTION = { bar: 'מוטות', mesh: 'רשתות', pile: 'כלונסאות' };

function rrRound(x, n = 2) {
  const f = 10 ** n;
  return Math.round((x + Math.sign(x) * Number.EPSILON) * f) / f;
}
function rrFmt(n) {
  return Number(n).toLocaleString('he-IL', { maximumFractionDigits: 2 });
}

function receivedByItem(receiptItems) {
  const out = {};
  for (const r of receiptItems || []) out[r.item_id] = (out[r.item_id] || 0) + Number(r.qty_received || 0);
  return out;
}

// kg received counts at most what a line ordered, so extra steel never shows past 100%
function orderProgress(items, receiptItems) {
  const got = receivedByItem(receiptItems);
  let ordered = 0, received = 0;
  const lines = {};
  for (const it of items || []) {
    const q = Number(it.qty) || 0, r = got[it.id] || 0;
    ordered += Number(it.total_kg) || 0;
    received += Math.min(r, q) * (Number(it.unit_kg) || 0);
    lines[it.id] = { ordered: q, received: r, remaining: Math.max(0, q - r) };
  }
  return {
    kg_ordered: rrRound(ordered), kg_received: rrRound(received),
    pct: ordered > 0 ? Math.round(100 * received / ordered) : 0, lines,
  };
}

function deriveStatus(order, items, receiptItems) {
  if (!order || ['draft', 'closed'].includes(order.status)) return order && order.status;
  const got = receivedByItem(receiptItems);
  const list = items || [];
  if (list.length && list.every(it => (got[it.id] || 0) >= Number(it.qty))) return 'complete';
  if (list.some(it => (got[it.id] || 0) > 0)) return 'partial';
  return 'sent';
}

// Which note group an order line belongs to: a mesh by its own standard-mesh group, else
// (like bars and piles) the "מיוחדת A-B" range that holds its diameter.
function noteGroupOf(item, rows) {
  const d = Number(item.diameter_mm);
  const read = (rows || []).filter(r => !r.unread);
  if (item.kind === 'mesh') {
    const m = read.find(r => r.mesh_d === d);
    if (m) return m.group;
  }
  const sp = read.find(r => r.range && d >= r.range[0] && d <= r.range[1]);
  return sp ? sp.group : null;
}

function rrCompare(label, tickKg, noteKg) {
  const diff = rrRound(tickKg - noteKg);
  const base = `${label}: סומן ${rrFmt(tickKg)} ק״ג, בתעודה ${rrFmt(noteKg)} ק״ג`;
  return Math.abs(diff) <= Math.max(RR_TOLERANCE_KG, noteKg * RR_TOLERANCE_PCT)
    ? { level: 'ok', text: `${base} — תואם` }
    : { level: 'warn', text: `${base} — הפרש ${rrFmt(Math.abs(diff))} ק״ג` };
}

// The checks for one receipt before it is saved (spec §7). `ticked` is what the site marked
// now, `prior` what earlier receipts of the order already brought, `priorNotes` their notes.
function receiptCheck({ order, items, ticked, note, priorNotes = [], prior = {} }) {
  const checks = [];
  const byId = Object.fromEntries((items || []).map(it => [it.id, it]));
  const n = note || {};
  const orders = n.orders || [];
  if (orders.length && !orders.includes(order.order_no)) {
    checks.push({ level: 'warn', text: `התעודה שייכת להזמנה ${orders.join(', ')}` });
  }
  for (const no of n.notes || []) {
    if (priorNotes.includes(no)) checks.push({ level: 'warn', text: `התעודה ${no} כבר נקלטה בהזמנה הזו` });
  }
  for (const t of ticked || []) {
    const it = byId[t.item_id];
    if (it && (prior[t.item_id] || 0) + Number(t.qty) > Number(it.qty)) {
      checks.push({ level: 'warn', text: `התקבל יותר מהמוזמן בשורה ${it.line_no} (${RR_SECTION[it.kind] || ''})` });
    }
  }
  const marked = (ticked || []).filter(t => byId[t.item_id] && Number(t.qty) > 0)
    .map(t => ({ it: byId[t.item_id], kg: Number(t.qty) * (Number(byId[t.item_id].unit_kg) || 0) }));
  const noteKg = Number(n.total_kg);
  if (!marked.length) return checks;
  if (!(noteKg >= 20)) {
    checks.push({ level: 'info', text: 'משקל התעודה לא נקרא — הבדיקה לפי הסימון בלבד' });
    return checks;
  }
  const rows = (n.rows || []).filter(r => !r.unread);
  const groups = marked.map(m => noteGroupOf(m.it, rows));
  const rowGroups = [...new Set(rows.map(r => r.group))];
  const perGroup = rows.length && groups.every(Boolean) && rowGroups.every(g => groups.includes(g));
  if (perGroup) {
    for (const g of rowGroups) {
      const tick = marked.filter((_, i) => groups[i] === g).reduce((a, m) => a + m.kg, 0);
      const inNote = rows.filter(r => r.group === g).reduce((a, r) => a + r.kg, 0);
      checks.push(rrCompare(g, rrRound(tick), rrRound(inNote)));
    }
  } else {
    if (rows.length) checks.push({ level: 'info', text: 'השוואה לפי סה״כ — לא כל השורות זוהו בתעודה' });
    checks.push(rrCompare('סה״כ', rrRound(marked.reduce((a, m) => a + m.kg, 0)), noteKg));
  }
  return checks;
}
