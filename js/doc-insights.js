// ===== "מהמסמכים": what the attached documents say about a record ====================
// Reads documents.extracted (written by sgpExtract in js/ocr.js) and checks it against the
// record and against the standard:
//  - the trucks' quantity, grade and date against the form;
//  - the lab result against the acceptance rule the lab prints on its own report;
//  - the 28-day result's due date;
//  - the sampling window the delivery note itself states (clause 2ג: the plant answers for
//    strength only when the sample was taken within 90 minutes of the truck leaving the
//    plant, or 60 minutes of it arriving).
// Nothing here changes what the user entered. The writes are sgpReadPendingDocs, which fills
// documents.extracted for a document not yet read, and sgpAutoFill, which fills a record's
// fields that are still EMPTY from what its documents say (a lab report's strengths).

const SGP_DOC_KIND = {
  concrete_note: 'תעודת משלוח בטון', concrete_lab: 'דוח מעבדה', rebar_note: 'תעודת משלוח ברזל',
  rebar_order: 'הזמנת ברזל', slab_note: 'תעודת משלוח לוח"דים', slab_order: 'הזמנת לוח"דים',
  contractor_cert: 'תעודת קבלן', approval: 'אישור במייל', inspection: 'תסקיר בדיקה תקופתית',
  unknown: 'לא זוהה סוג המסמך', unsupported: 'קובץ שלא ניתן לקרוא',
};
const SGP_LEVEL_RANK = { bad: 3, warn: 2, ok: 1, info: 0 };
const SGP_READABLE_RE = /\.(pdf|jpe?g|png|webp|gif|bmp|xlsx)$/i;
const SGP_DOC_TABLES = ['concrete_pours', 'rebar_deliveries', 'prestressed_slabs', 'vendor_submissions'];
const sgpDaysBetween = (fromIso, toIso) => Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000);

const sgpUniq = list => [...new Set(list.filter(v => v !== null && v !== undefined && v !== ''))];
const sgpSum = list => list.reduce((a, b) => a + (Number(b) || 0), 0);
const sgpR = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const sgpMinutes = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
function sgpIsoAddDays(iso, n) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function sgpTodayIso() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
// a document the platform can read and has not read yet (site photos are left alone)
function sgpDocPending(d) {
  return !d.extracted && d.doc_type !== 'photo' && SGP_READABLE_RE.test(d.file_name || '');
}

function sgpInsights(table, record, docs) {
  const read = docs.filter(d => d.extracted && d.extracted.kind);
  const pending = docs.filter(sgpDocPending);
  const checks = [];
  const add = (level, text) => checks.push({ level, text });
  const by = kind => read.filter(d => d.extracted.kind === kind);
  let facts = {};
  if (table === 'concrete_pours') facts = sgpConcreteInsights(record, by, add);
  else if (table === 'rebar_deliveries') facts = sgpRebarInsights(record, by, add);
  else if (table === 'prestressed_slabs') facts = sgpSlabInsights(record, by, add);
  else if (table === 'vendor_submissions') facts = sgpVendorInsights(record, by, add);
  // delivery notes and lab reports that were filed as "other" or as a photo
  const misfiled = read.filter(d => ['concrete_note', 'concrete_lab', 'rebar_note', 'slab_note'].includes(d.extracted.kind)
    && ['other', 'photo'].includes(d.doc_type));
  if (misfiled.length) {
    add('info', (misfiled.length === 1 ? 'מסמך אחד שסומן "אחר" זוהה' : `${misfiled.length} מסמכים שסומנו "אחר" זוהו`)
      + ' לפי התוכן: ' + sgpUniq(misfiled.map(d => SGP_DOC_KIND[d.extracted.kind])).join(', '));
  }
  checks.sort((a, b) => SGP_LEVEL_RANK[b.level] - SGP_LEVEL_RANK[a.level]);
  const top = checks.find(c => c.level !== 'info');
  return { checks, level: top ? top.level : null, pending, read, facts };
}

// ---- concrete -------------------------------------------------------------------------
function sgpConcreteInsights(rec, by, add) {
  const trucks = [], seen = new Set();
  for (const d of by('concrete_note')) {
    for (const t of d.extracted.trucks || []) {
      const sure = t.note && !(t.doubt || []).includes('note');
      const key = sure ? t.note : `${d.id}:${t.page}`;
      if (seen.has(key)) continue;            // the same note attached twice
      seen.add(key);
      trucks.push({ ...t, docId: d.id });
    }
  }
  const labs = by('concrete_lab').map(d => ({ ...d.extracted, docId: d.id }));
  if (!trucks.length && !labs.length) return { trucks, labs };

  // the notes' date against the pour's date
  if (rec.pour_date) {
    const other = trucks.filter(t => t.date && t.date !== rec.pour_date);
    if (other.length) {
      add('warn', `${other.length === 1 ? 'משאית אחת' : other.length + ' משאיות'} בתעודות מתאריך `
        + `${sgpUniq(other.map(t => t.date)).map(fmtDate).join(', ')} — והיציקה רשומה ב-${fmtDate(rec.pour_date)}. `
        + 'ייתכן שצורפו כאן תעודות של יציקה אחרת.');
    }
  }
  // quantity: the trucks of this pour's date against the form
  const own = rec.pour_date ? trucks.filter(t => !t.date || t.date === rec.pour_date) : trucks;
  const vol = rec.volume_m3 !== null && rec.volume_m3 !== undefined && rec.volume_m3 !== '' ? Number(rec.volume_m3) : null;
  // every page of the notes was recognised as a truck (a page the reader could not make out
  // may be a truck it missed, so a difference then is only reported, not flagged)
  const allPagesRead = by('concrete_note').every(d => (d.extracted.trucks || []).length >= (d.extracted.pages || 0));
  if (own.length) {
    const withQty = own.filter(t => t.qty != null);
    const sum = sgpR(sgpSum(withQty.map(t => t.qty)));
    const n = own.length === 1 ? 'משאית אחת' : `${own.length} משאיות`;
    if (withQty.length === own.length) {
      if (vol === null) add('info', `${n} בתעודות: ${fmtNum(sum, 1)} מ"ק (ברשומה לא הוזנה כמות)`);
      else if (Math.abs(sum - vol) <= 0.5) add('ok', `${n} בתעודות: ${fmtNum(sum, 1)} מ"ק — תואם לכמות ברשומה`);
      else if (sum < vol) add(allPagesRead ? 'warn' : 'info', `התעודות המצורפות מכסות ${fmtNum(sum, 1)} מ"ק מתוך ${fmtNum(vol, 1)} מ"ק ברשומה`
        + (allPagesRead ? ' — ייתכן שחסרות תעודות' : ' — חלק מהעמודים לא נקראו, בדקו בתעודה'));
      else add(allPagesRead ? 'warn' : 'info', `${n} בתעודות: ${fmtNum(sum, 1)} מ"ק — יותר מהכמות ברשומה (${fmtNum(vol, 1)} מ"ק)`);
    } else {
      const txt = `${n} בתעודות; הכמות נקראה ב-${withQty.length} מהן: ${fmtNum(sum, 1)} מ"ק`
        + (vol !== null ? ` (ברשומה ${fmtNum(vol, 1)} מ"ק)` : '') + ' — את השאר בדקו בתעודה';
      add(vol !== null && sum > vol + 0.5 ? 'warn' : 'info', txt);
    }
  }
  // grade
  const grades = sgpUniq(own.map(t => t.grade));
  if (rec.concrete_grade && grades.some(g => g !== rec.concrete_grade)) {
    add('warn', `סוג הבטון בתעודות: ${grades.join(', ')} — ברשומה ${rec.concrete_grade}. בדקו מול התעודה.`);
  }
  // what the notes state (ת״י 118 §7.3)
  const exp = sgpUniq(own.map(t => t.exposure)), agg = sgpUniq(own.map(t => t.max_aggregate_mm)),
    water = sgpUniq(own.map(t => t.water_allowed_l_m3));
  const stated = [exp.length && `דרגת חשיפה ${exp.join(', ')}`, agg.length && `גרגיר מירבי ${agg.join('/')} מ"מ`,
    water.length && `תוספת מים מותרת באתר: ${water.join('/')} ל' למ"ק`].filter(Boolean);
  if (stated.length) add('info', 'לפי התעודות: ' + stated.join(' · '));

  // lab results against the rule the lab prints
  const ages = new Set();
  for (const lab of labs) {
    const age = lab.ages && lab.ages.length ? Math.max(...lab.ages) : null;
    if (age) ages.add(age);
    const cubes = (lab.samples || []).map(s => (s.mpa || [])[0]).filter(v => v != null);
    const avg = lab.averages && lab.averages.length ? lab.averages[lab.averages.length - 1]
      : (cubes.length ? sgpR(sgpSum(cubes) / cubes.length) : null);
    const low = cubes.length ? Math.min(...cubes) : null;
    const c = lab.criteria;
    const name = lab.lab_no ? `דוח ${lab.lab_no}` : 'דוח מעבדה';
    if (avg === null) continue;
    if (c && age === c.age) {
      const pass = avg >= c.avg_min && (low === null || low >= c.single_min);
      add(pass ? 'ok' : 'bad', `${age} יום (${name}): ממוצע ${fmtNum(avg, 1)} מגפ"ס${low !== null ? `, הנמוכה ${fmtNum(low, 1)}` : ''} — `
        + `${pass ? 'עומד' : 'לא עומד'} בדרישה שבדוח (ממוצע ≥ ${c.avg_min}, כל דגימה ≥ ${c.single_min})`);
    } else {
      add('info', `${age ? age + ' ימים' : name} (${name}): ממוצע ${fmtNum(avg, 1)} מגפ"ס`
        + (c ? ` · הדרישה ל-${c.age} יום: ממוצע ≥ ${c.avg_min}, כל דגימה ≥ ${c.single_min}` : ''));
    }
  }
  // the strengths typed in the record, against the report (auto-fill never replaces a value,
  // so a wrong one has to be shown)
  for (const lab of labs) {
    const said = sgpLabFill(lab);
    for (const [key, age] of [['strength_7d', 7], ['strength_28d', 28]]) {
      const v = rec[key];
      if (v === null || v === undefined || v === '' || said[key] == null) continue;
      if (Math.abs(Number(v) - said[key]) > 0.05) {
        add('warn', `ברשומה חוזק ${age} יום ${fmtNum(v, 1)} מגפ"ס — בדוח ${lab.lab_no || 'המעבדה'} ${fmtNum(said[key], 1)} מגפ"ס. בדקו מול הדוח.`);
      }
    }
  }
  // the 28-day result, once samples were taken
  if (labs.length && !ages.has(28) && rec.pour_date) {
    const due = sgpIsoAddDays(rec.pour_date, 28);
    if (sgpTodayIso() >= due) add('warn', `תוצאת 28 יום הייתה צפויה מ-${fmtDate(due)} ועדיין לא צורפה`);
    else add('info', `תוצאת 28 יום צפויה ב-${fmtDate(due)}`);
  }
  // the sampling window, as the delivery note states it
  const flagged = new Set();
  for (const lab of labs) {
    for (const s of lab.samples || []) {
      const t = trucks.find(x => x.note === s.note);
      if (!t || !t.departure || flagged.has(s.note)) continue;
      const gap = sgpMinutes(s.time) - sgpMinutes(t.departure);
      if (!(gap > 90)) continue;
      flagged.add(s.note);
      const unsure = (t.doubt || []).includes('departure') ? ' — שעת היציאה נקראה בספק, בדקו בתעודה' : '';
      add('warn', `הדגימה מהערבל ${t.truck || s.truck} (תעודה ${s.note}) נלקחה ב-${s.time}, ${gap} דק' אחרי שיצא מהמפעל (${t.departure}${unsure}). `
        + 'לפי סעיף 2ג בתעודה, המפעל אחראי לחוזק רק כשהדגימה נלקחה עד 90 דק\' מהיציאה או עד 60 דק\' מההגעה לאתר.');
    }
  }
  const doubtful = sgpSum(trucks.map(t => (t.doubt || []).length));
  if (doubtful) {
    add('info', (doubtful === 1 ? 'ערך אחד נקרא בספק — מסומן' : `${doubtful} ערכים נקראו בספק — מסומנים`) + ' ב-? בטבלה, בדקו מול התעודה');
  }
  return { trucks, labs };
}

// ---- rebar ----------------------------------------------------------------------------
function sgpRebarInsights(rec, by, add) {
  const notes = [], seen = new Set();
  for (const d of by('rebar_note')) {
    const key = (d.extracted.notes || []).join(',') || d.id;
    if (seen.has(key)) continue;              // the same note attached twice
    seen.add(key);
    notes.push({ ...d.extracted, docId: d.id });
  }
  const orders = by('rebar_order').map(d => ({ ...d.extracted, docId: d.id }));
  if (notes.length) {
    // a note whose weight came out implausibly small (e.g. "5") was not really read
    const readable = notes.filter(n => n.total_kg >= 100);
    const kg = sgpR(sgpSum(readable.map(n => n.total_kg)), 0);
    const count = sgpUniq(notes.flatMap(n => n.notes)).length || notes.length;
    const unread = notes.length - readable.length;
    const txt = `${count === 1 ? 'תעודת משלוח אחת' : count + ' תעודות משלוח'}: ${fmtNum(kg, 0)} ק"ג`
      + (unread ? ` (המשקל של ${unread === 1 ? 'תעודה אחת' : unread + ' תעודות'} לא נקרא — בדקו בתעודה)` : '');
    const w = rec.weight_kg !== null && rec.weight_kg !== undefined && rec.weight_kg !== '' ? Number(rec.weight_kg) : null;
    // what the record's weight stands for varies (the whole order, one item…), so a
    // difference is shown for information, never raised as a warning
    if (w !== null && !unread && Math.abs(kg - w) <= Math.max(5, w * 0.01)) add('ok', `${txt} — תואם לכמות ברשומה`);
    else add('info', w === null ? `סופק לפי התעודות — ${txt}` : `סופק לפי התעודות — ${txt} · ברשומה ${fmtNum(w, 0)} ק"ג`);
    const dates = sgpUniq(notes.map(n => n.date));
    if (rec.delivery_date && dates.length && !dates.includes(rec.delivery_date)) {
      add('info', `תאריך התעודה ${dates.map(fmtDate).join(', ')} — תאריך האספקה ברשומה ${fmtDate(rec.delivery_date)}`);
    }
    const mf = sgpUniq(notes.map(n => n.manufacturer && n.manufacturer.name));
    if (mf.length) add('info', `יצרן לפי התעודה: ${mf.join(', ')}`);
  }
  // each note names your order ("הז 107-26"): is that order's file here too?
  const noteOrders = sgpUniq(notes.flatMap(n => n.orders || []));
  const docOrders = sgpUniq(orders.map(o => o.order));
  for (const k of noteOrders) {
    const o = orders.find(x => x.order === k);
    if (!o) { add('info', `התעודות מציינות את הזמנה ${k} — קובץ ההזמנה לא מצורף לרשומה הזאת`); continue; }
    const delivered = sgpR(sgpSum(notes.filter(n => (n.orders || []).includes(k)).map(n => n.total_kg)), 0);
    add('ok', `התעודות שייכות להזמנה ${k} — ההזמנה מצורפת`
      + (o.total_kg ? ` · הוזמנו ${fmtNum(o.total_kg, 0)} ק"ג, סופקו לפי התעודות ${fmtNum(delivered, 0)} ק"ג` : ''));
  }
  const orphanOrders = docOrders.filter(k => !noteOrders.includes(k));
  if (notes.length && orphanOrders.length) add('info', `הזמנות מצורפות שלא מופיעות בתעודות: ${orphanOrders.join(', ')}`);
  return { notes, orders };
}

// ---- prestressed slabs ------------------------------------------------------------------
function sgpSlabInsights(rec, by, add) {
  const notes = by('slab_note').map(d => ({ ...d.extracted, docId: d.id }));
  const books = by('slab_order').map(d => ({ ...d.extracted, docId: d.id }));
  if (notes.length) {
    const m2 = sgpR(sgpSum(notes.map(n => n.total_m2)), 2);
    add('info', `${notes.length === 1 ? 'תעודת משלוח אחת' : notes.length + ' תעודות משלוח'}: ${fmtNum(m2, 2)} מ"ר`
      + (notes.some(n => n.doubt) ? ' (חלק מהסכום חושב מהשורות — בדקו מול התעודה)' : ''));
  }
  const allOrders = books.flatMap(b => b.orders || []);
  const ord = allOrders.find(o => String(o.order_no) === String(rec.order_number)) || (allOrders.length === 1 ? allOrders[0] : null);
  if (ord) {
    add('info', `הזמנה ${ord.order_no ?? ''}${ord.date ? ` (${fmtDate(ord.date)})` : ''}: ${ord.units} לוח"דים · `
      + `${fmtNum(ord.total_m, 2)} מ"א · כ-${fmtNum(ord.total_m2, 1)} מ"ר`);
  }
  const track = books.flatMap(b => b.tracking || []);
  const q = rec.quantity_m2 !== null && rec.quantity_m2 !== undefined && rec.quantity_m2 !== '' ? Number(rec.quantity_m2) : null;
  // the order's own area (quantity × length × width of every line) against the record
  if (q !== null && ord && ord.total_m2 && Math.abs(q - ord.total_m2) / ord.total_m2 < 0.01) {
    add('ok', `הכמות ברשומה (${fmtNum(q, 2)} מ"ר) תואמת לשטח ההזמנה לפי קובץ ההזמנה`);
  }
  const recNotes = String(rec.delivery_note_number || '').split(/[\s,]+/).filter(Boolean);
  const missing = sgpUniq(notes.flatMap(n => n.notes || [])).filter(n => !recNotes.includes(n));
  if (missing.length) add('info', `תעודות מצורפות שמספרן לא רשום ברשומה: ${missing.join(', ')}`);
  return { notes, books, track };
}

// ---- submissions: contractors, suppliers, equipment, materials ---------------------------
// The certificate, the approval email and the inspection report say what the form asks for.
function sgpVendorInsights(rec, by, add) {
  const today = sgpTodayIso();
  const certs = by('contractor_cert').map(d => d.extracted);
  const approvals = by('approval').map(d => d.extracted).filter(a => a.approved);
  const inspections = by('inspection').map(d => d.extracted);
  for (const c of certs) {
    const branches = (c.branches || []).map(b => `${b.code} ${b.name} (${b.group}${b.class})`).join(' · ');
    const who = `${c.type || 'תעודת קבלן'}${c.company ? ' — ' + c.company : ''}`;
    if (c.valid_until) {
      const days = sgpDaysBetween(today, c.valid_until);
      const tail = branches ? ` · ענפים: ${branches}` : '';
      if (days < 0) add('bad', `${who}: פגה ב-${fmtDate(c.valid_until)}${tail}`);
      else if (days <= 60) add('warn', `${who}: בתוקף עד ${fmtDate(c.valid_until)} — נותרו ${days} ימים${tail}`);
      else add('ok', `${who}: בתוקף עד ${fmtDate(c.valid_until)}${tail}`);
      if (rec.valid_until && rec.valid_until !== c.valid_until) {
        add('warn', `התוקף ברשומה (${fmtDate(rec.valid_until)}) שונה מהתוקף בתעודה (${fmtDate(c.valid_until)})`);
      } else if (!rec.valid_until) {
        add('info', `ברשומה לא הוזן תוקף — לפי התעודה: ${fmtDate(c.valid_until)}`);
      }
    } else if (branches) add('info', `${who}: ענפים ${branches}`);
  }
  for (const a of approvals) {
    add('ok', `אישור במייל${a.date ? ` מ-${fmtDate(a.date)}` : ''}: "${a.quote}"`);
    if (rec.approval_status && rec.approval_status !== 'מאושר') {
      add('warn', `לפי המייל המצורף הגורם אושר — ברשומה הסטטוס "${rec.approval_status}"`);
    }
  }
  for (const i of inspections) {
    if (i.inspection_date) add('info', `תסקיר: נבדק ב-${fmtDate(i.inspection_date)}${i.next_date ? `, בדיקה הבאה עד ${fmtDate(i.next_date)}` : ''}`);
    if (i.next_date) {
      const d = sgpDaysBetween(today, i.next_date);
      if (d < 0) add('bad', `מועד הבדיקה התקופתית הבאה (${fmtDate(i.next_date)}) עבר`);
      else if (d <= 30) add('warn', `הבדיקה התקופתית הבאה עד ${fmtDate(i.next_date)} — בעוד ${d} ימים`);
    }
  }
  return { certs, approvals, inspections };
}

// ---- the panel ------------------------------------------------------------------------
const SGP_LEVEL_ICON = { ok: 'check', warn: 'triangle-alert', bad: 'triangle-alert', info: 'file-text' };
const sgpCellD = (v, t, field, fmt = x => x) => {
  if (v === null || v === undefined || v === '') return '<td class="di-na">—</td>';
  const doubt = t && (t.doubt || []).includes(field);
  return `<td${doubt ? ' class="di-doubt" title="נקרא בספק — בדקו בתעודה"' : ''}>${esc(fmt(v))}${doubt ? '?' : ''}</td>`;
};

function sgpInsightsHtml(ins, table) {
  const f = ins.facts || {};
  const parts = [];
  if (ins.checks.length) {
    parts.push(`<ul class="di-checks">${ins.checks.map(c =>
      `<li class="di-${c.level}">${uiIcon(SGP_LEVEL_ICON[c.level], 15)}<span>${esc(c.text)}</span></li>`).join('')}</ul>`);
  }
  if (table === 'concrete_pours' && f.trucks && f.trucks.length) {
    parts.push(`<details class="di-more"><summary>המשאיות לפי התעודות (${f.trucks.length})</summary><div class="table-wrap"><table class="di-table">
      <thead><tr><th>תעודה</th><th>תאריך</th><th>יציאה</th><th>מ"ק</th><th>הוזמן</th><th>סוג</th><th>חשיפה</th><th>גרגיר</th><th>מים</th><th>ערבל</th></tr></thead>
      <tbody>${f.trucks.map(t => `<tr>${sgpCellD(t.note, t, 'note')}${sgpCellD(t.date, t, 'date', fmtDate)}${sgpCellD(t.departure, t, 'departure')}
        ${sgpCellD(t.qty, t, 'qty')}${sgpCellD(t.ordered, t, 'ordered')}${sgpCellD(t.grade, t, 'grade')}${sgpCellD(t.exposure, t, 'exposure')}
        ${sgpCellD(t.max_aggregate_mm, t, 'max_aggregate_mm')}${sgpCellD(t.water_allowed_l_m3, t, 'water')}${sgpCellD(t.truck, t, 'truck')}</tr>`).join('')}</tbody>
    </table></div><p class="di-foot">שעת הגעה, סיום פריקה וחתימות נכתבים ביד על התעודה — הם לא נקראים; התעודה עצמה היא המקור.</p></details>`);
  }
  if (table === 'concrete_pours' && f.labs && f.labs.some(l => (l.samples || []).length)) {
    const rows = f.labs.flatMap(l => (l.samples || []).map(s => ({ ...s, lab: l.lab_no, age: l.ages && l.ages.length ? Math.max(...l.ages) : null })));
    parts.push(`<details class="di-more"><summary>הדגימות לפי דוח המעבדה (${rows.length})</summary><div class="table-wrap"><table class="di-table">
      <thead><tr><th>דוח</th><th>גיל</th><th>דגימה</th><th>שעת נטילה</th><th>ערבל</th><th>תעודה</th><th>מגפ"ס</th></tr></thead>
      <tbody>${rows.map(s => `<tr><td>${esc(s.lab || '—')}</td><td>${s.age ? s.age + ' י' : '—'}</td><td>${s.no ?? '—'}</td><td>${esc(s.time)}</td>
        <td>${esc(s.truck)}</td><td>${esc(s.note)}</td><td>${(s.mpa || []).map(v => fmtNum(v, 1)).join(' / ') || '—'}</td></tr>`).join('')}</tbody>
    </table></div></details>`);
  }
  if (table === 'rebar_deliveries' && f.notes && f.notes.length) {
    parts.push(`<details class="di-more"><summary>התעודות (${f.notes.length})</summary><div class="table-wrap"><table class="di-table">
      <thead><tr><th>תעודה</th><th>תאריך</th><th>הזמנה</th><th>ק"ג</th><th>קטרים</th></tr></thead>
      <tbody>${f.notes.map(n => `<tr><td>${esc((n.notes || []).join(', ') || '—')}</td><td>${esc(n.date ? fmtDate(n.date) : '—')}</td>
        <td>${esc((n.orders || []).join(', ') || '—')}</td><td>${n.total_kg != null ? fmtNum(n.total_kg, 0) : '—'}</td><td>${esc(n.diameters || '—')}</td></tr>`).join('')}</tbody>
    </table></div></details>`);
  }
  if (table === 'prestressed_slabs' && f.track && f.track.length) {
    parts.push(`<details class="di-more"><summary>גליון המעקב מתוך קובץ ההזמנה (${f.track.length})</summary><div class="table-wrap"><table class="di-table">
      <thead><tr><th>הזמנה</th><th>הוזמן</th><th>סופק</th><th>הונח</th><th>קומה</th><th>סה"כ מ"א</th><th>תעודה</th></tr></thead>
      <tbody>${f.track.map(t => `<tr><td>${esc(t.order_no ?? '—')}</td><td>${esc(t.order_date ? fmtDate(t.order_date) : '—')}</td>
        <td>${esc(t.supply_date ? fmtDate(t.supply_date) : '—')}</td><td>${esc(t.install_date ? fmtDate(t.install_date) : '—')}</td>
        <td>${esc(t.floor || '—')}</td><td>${t.total_m != null && t.total_m !== '' ? esc(fmtNum(t.total_m, 2)) : '—'}</td><td>${esc(t.note || '—')}</td></tr>`).join('')}</tbody>
    </table></div></details>`);
  }
  const docLines = ins.read.map(d => `<li>${esc(d.file_name)} — ${esc(SGP_DOC_KIND[d.extracted.kind] || d.extracted.kind)}</li>`)
    .concat(ins.pending.map(d => `<li class="di-pending">${esc(d.file_name)} — עוד לא נקרא</li>`));
  if (docLines.length) parts.push(`<details class="di-more"><summary>המסמכים (${docLines.length})</summary><ul class="di-docs">${docLines.join('')}</ul></details>`);
  if (ins.pending.length) {
    parts.push(`<button type="button" class="btn btn-sm btn-outline di-read" data-read-docs>${uiIcon('eye', 15)} קריאת ${ins.pending.length === 1 ? 'המסמך' : ins.pending.length + ' המסמכים'} שעוד לא נקרא${ins.pending.length === 1 ? '' : 'ו'}</button>`);
  }
  if (!parts.length) return '';
  return `<div class="di-head">${uiIcon('file-text', 16)}<b>מהמסמכים המצורפים</b><span>נקרא אוטומטית מהתעודות · לקריאה בלבד</span></div>${parts.join('')}`;
}

// Reads the documents that were not read yet and stores what they say. Needs js/ocr.js
// (and pdf.js + Tesseract) on the page. Only documents.extracted is written, and only
// while it is still empty.
async function sgpReadPendingDocs(pending, onProgress = () => {}) {
  let done = 0;
  for (const d of pending) {
    onProgress(`קורא ${done + 1} מתוך ${pending.length}: ${d.file_name}`);
    try {
      const url = await getDocumentUrl(d.file_path);
      if (!url) throw new Error('לא ניתן להוריד את הקובץ');
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], d.file_name, { type: blob.type });
      const extracted = await sgpExtractFile(file, { onProgress: t => onProgress(`${d.file_name}: ${t}`) });
      const { error } = await sb.from('documents').update({ extracted, extracted_at: new Date().toISOString() })
        .eq('id', d.id).is('extracted', null);
      if (error) throw error;
      d.extracted = extracted;
      done++;
    } catch (err) {
      console.error('reading document failed', d.file_name, err);
      toast(`לא ניתן היה לקרוא את ${d.file_name}: ${err.message}`, 'error');
    }
  }
  return done;
}

// ---- auto-fill: a record's empty fields, from what its documents say ---------------------
// A lab report gives the pour its strengths (each age's printed average), its number, and
// "tested". Only fields still empty are filled — a value already in the record is never
// replaced (a different one is flagged by the insights instead).
const SGP_FILL_FIELDS = { concrete_pours: ['strength_7d', 'strength_28d', 'lab_test_number', 'lab_tested'] };
const SGP_FILL_LABELS = { strength_7d: 'חוזק 7 יום', strength_28d: 'חוזק 28 יום', lab_test_number: 'מס\' בדיקה', lab_tested: 'נבדק במעבדה' };

function sgpLabFill(ex) {
  if (!ex || ex.kind !== 'concrete_lab') return {};
  const out = { lab_tested: true };
  if (ex.lab_no) out.lab_test_number = ex.lab_no;
  let byAge = ex.avg_by_age;
  if (!byAge) {   // read before avg_by_age existed: the first average is the latest age's
    const ages = (ex.ages || []).slice().sort((a, b) => b - a);
    if (ages.length && (ex.averages || []).length) byAge = { [ages[0]]: ex.averages[0] };
  }
  if (byAge && byAge[7] != null) out.strength_7d = byAge[7];
  if (byAge && byAge[28] != null) out.strength_28d = byAge[28];
  return out;
}

function sgpFillPatch(table, row, extractedList) {
  const fields = SGP_FILL_FIELDS[table];
  if (!fields) return {};
  const patch = {};
  for (const ex of extractedList || []) {
    const said = table === 'concrete_pours' ? sgpLabFill(ex) : {};
    for (const key of fields) {
      if (!(key in said) || key in patch) continue;
      const cur = row ? row[key] : null;
      const empty = key === 'lab_tested' ? cur !== true : (cur === null || cur === undefined || cur === '');
      if (empty) patch[key] = said[key];
    }
  }
  return patch;
}

// Writes the patch with the form's own lock (the row's updated_at), so a concurrent edit is
// never overwritten. Returns the Hebrew labels of what was filled.
async function sgpAutoFill(table, recordId, extractedList, userId) {
  const fields = SGP_FILL_FIELDS[table];
  if (!fields || !recordId) return [];
  const { data: row, error } = await sb.from(table).select(['id', 'updated_at', ...fields].join(', ')).eq('id', recordId).single();
  if (error || !row) return [];
  const patch = sgpFillPatch(table, row, extractedList);
  if (!Object.keys(patch).length) return [];
  let q = sb.from(table).update({ ...patch, updated_by: userId, updated_at: new Date().toISOString() }).eq('id', recordId).select('id');
  q = row.updated_at ? q.eq('updated_at', row.updated_at) : q.is('updated_at', null);
  const { data, error: upErr } = await q;
  if (upErr || !data || !data.length) return [];
  return Object.keys(patch).map(k => SGP_FILL_LABELS[k] || k);
}
