// "דואר נכנס" (2026-11-04): which record a document that came by email belongs to.
// Strong only when the match is full and unique; a partial or shared match is shown as options,
// and nothing is filled before a person presses "צרף". Pure: reads its arguments, never changes them.

const INBOX_MATCH_DAYS = 45;

// every note number in a "delivery_note_number" cell (one per line, or commas/spaces)
function sgpInboxNoteList(text) {
  return String(text || '').match(/\d{4,}/g) || [];
}

function sgpInboxNear(iso, ref) {
  if (!iso || !ref) return true;
  return Math.abs(Date.parse(iso) - Date.parse(ref)) <= INBOX_MATCH_DAYS * 86400000;
}

function sgpInboxDdMm(iso) {
  const m = String(iso || '').match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : '';
}

function sgpInboxLabel(table, row) {
  if (table === 'concrete_pours') {
    return [sgpInboxDdMm(row.pour_date), row.element, row.location, row.concrete_grade].filter(Boolean).join(' · ');
  }
  return [sgpInboxDdMm(row.delivery_date), row.plan_ref].filter(Boolean).join(' · ') || 'רשומה';
}

function sgpInboxStrong(table, row, confidence, reason) {
  return { table, recordId: row.id, siteId: row.site_id, confidence, reason };
}
function sgpInboxOptions(table, rows, reason) {
  return { options: rows.map(r => ({ table, recordId: r.id, siteId: r.site_id, label: sgpInboxLabel(table, r) })), reason };
}

function sgpInboxSuggestLab(ex, pours) {
  const notes = [...new Set((ex.samples || []).map(s => s.note).filter(Boolean))];
  if (notes.length) {
    const hits = pours.map(p => {
      const own = sgpInboxNoteList(p.delivery_note_number);
      return { p, n: notes.filter(x => own.includes(x)).length };
    }).filter(h => h.n > 0).sort((a, b) => b.n - a.n);
    const full = hits.filter(h => h.n === notes.length);
    if (full.length === 1 && hits.length === 1) {
      return sgpInboxStrong('concrete_pours', full[0].p, 'strong', `${notes.length} מתוך ${notes.length} תעודות משלוח תואמות`);
    }
    if (hits.length) {
      return sgpInboxOptions('concrete_pours', hits.map(h => h.p), hits.length > 1
        ? `תעודות המשלוח נמצאות ב-${hits.length} יציקות` : `${hits[0].n} מתוך ${notes.length} תעודות משלוח תואמות`);
    }
  }
  const sameDay = pours.filter(p => ex.pour_date && p.pour_date === ex.pour_date);
  const same = sameDay.filter(p => ex.grade && p.concrete_grade === ex.grade);
  if (same.length === 1) return sgpInboxStrong('concrete_pours', same[0], 'medium', 'תאריך וסוג בטון תואמים');
  if (same.length > 1) return sgpInboxOptions('concrete_pours', same, 'כמה יציקות באותו תאריך ובאותו סוג בטון');
  if (sameDay.length) return sgpInboxOptions('concrete_pours', sameDay, 'יציקות באותו תאריך');
  return null;
}

function sgpInboxSuggestConcreteNote(ex, pours) {
  const notes = [...new Set((ex.trucks || []).map(t => t.note).filter(Boolean))];
  const hits = pours.filter(p => sgpInboxNoteList(p.delivery_note_number).some(n => notes.includes(n)));
  if (hits.length === 1) return sgpInboxStrong('concrete_pours', hits[0], 'strong', 'מספר התעודה רשום ביציקה הזאת');
  if (hits.length > 1) return sgpInboxOptions('concrete_pours', hits, 'מספר התעודה רשום בכמה יציקות');
  return { create: true, table: 'concrete_pours', reason: 'אין יציקה עם התעודה הזאת' };
}

function sgpInboxSuggestRebarNote(ex, rows) {
  const orders = ex.orders || [], notes = ex.notes || [];
  const hits = rows.filter(r => orders.includes(sgpOrderKeyFromName(r.plan_ref))
    || sgpInboxNoteList(r.delivery_note_number).some(n => notes.includes(n)));
  if (hits.length === 1) {
    const k = sgpOrderKeyFromName(hits[0].plan_ref);
    return sgpInboxStrong('rebar_deliveries', hits[0], 'strong', orders.includes(k) ? `הזמנה ${k}` : 'מספר התעודה רשום ברשומה הזאת');
  }
  if (hits.length > 1) return sgpInboxOptions('rebar_deliveries', hits, 'כמה רשומות עם אותה הזמנה');
  return { create: true, table: 'rebar_deliveries', reason: 'אין רשומה עם ההזמנה או התעודה' };
}

// extracted: what the reader stored; candidates: { concrete_pours: [...], rebar_deliveries: [...] }
function sgpInboxSuggest(extracted, candidates) {
  if (!extracted) return null;
  const c = candidates || {};
  if (extracted.kind === 'concrete_lab') {
    const ref = extracted.pour_date || extracted.report_date;
    return sgpInboxSuggestLab(extracted, (c.concrete_pours || []).filter(p => sgpInboxNear(p.pour_date, ref)));
  }
  if (extracted.kind === 'concrete_note') {
    const ref = extracted.date || null;
    return sgpInboxSuggestConcreteNote(extracted, (c.concrete_pours || []).filter(p => sgpInboxNear(p.pour_date, ref)));
  }
  if (extracted.kind === 'rebar_note') {
    return sgpInboxSuggestRebarNote(extracted, (c.rebar_deliveries || []).filter(r => sgpInboxNear(r.delivery_date, extracted.date)));
  }
  return null;
}
