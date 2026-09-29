// ===== Quality control checklists (בקרה מוקדמת / בקרה שוטפת) ============================
// The items come from the general QC specification (מפרט כללי לבקרת איכות בביצוע הקבלן,
// משרד הבינוי והשיכון): 3.2.1 בקרה מוקדמת before an activity starts, 3.2.2 בקרה שוטפת with
// its check points and hold points (נקודות עצירה — work does not go on without approval).
// The inspector ticks each item; the result follows from the ticks, a hold point needs the
// name of whoever approved it, and a failed check opens a non-conformance (אי-התאמה).

const QC_PRELIMINARY = [
  { item: 'נלמדו דרישות החוזה, המפרט והתכניות לפעילות' },
  { item: 'תכניות מאושרות לביצוע, מהדורה אחרונה' },
  { item: 'ספק / מפעל מאושר — אישורי ספקים ותווי תקן' },
  { item: 'דוגמאות חומרים אושרו' },
  { item: 'כמויות וזמינות חומרים לפעילות' },
  { item: 'ציוד וצוות מתאימים ומאושרים' },
  { item: 'מוכנות אזור העבודה' },
  { item: 'אישור הבקרה המוקדמת לתחילת הפעילות', hold: true },
];
const QC_CONCRETE_ELEMENTS = ['יסודות', 'רצפה', 'קיר', 'קיר דיפון', 'עמודים', 'קורות', 'תקרה', 'מדרגות', 'ממ״ד'];
const QC_INPROCESS_CONCRETE = [
  { item: 'סימון ומפלסים לפי התכנית' },
  { item: 'טפסות ותמיכות — יציבות, מידות, ניקיון', hold: true },
  { item: 'ברזל לפי התכנית — קטרים, מרווחים, חפיפות' },
  { item: 'כיסוי בטון (מרווחנים)' },
  { item: 'שרוולים, פריטים מובנים והכנות למערכות' },
  { item: 'ניקיון לפני יציקה' },
  { item: 'מעבדה מוזמנת לבדיקות סומך ונטילת קוביות' },
  { item: 'אישור יציקה', hold: true },
];
const QC_INPROCESS_SHELTER_EXTRA = [
  { item: 'פריטי פיקוד העורף — צנרת אוורור, חלון הדף, דלת הדף' },
];
const QC_INPROCESS_SYSTEMS = [
  { item: 'ביצוע לפי התכנית והמפרט' },
  { item: 'חומרים מאושרים (תו תקן / אישור מתכנן)' },
  { item: 'בדיקות בוצעו ותועדו (לחץ / הצפה / רציפות לפי העניין)' },
  { item: 'תיעוד בתמונות לפני כיסוי' },
  { item: 'אישור לכיסוי / להמשך', hold: true },
];

function qcTemplate(stage, subject) {
  if (stage === 'preliminary') return QC_PRELIMINARY;
  if (QC_CONCRETE_ELEMENTS.includes(subject)) {
    return subject === 'ממ״ד' ? [...QC_INPROCESS_CONCRETE.slice(0, 5), ...QC_INPROCESS_SHELTER_EXTRA, ...QC_INPROCESS_CONCRETE.slice(5)] : QC_INPROCESS_CONCRETE;
  }
  return subject ? QC_INPROCESS_SYSTEMS : [];
}

const QC_STATES = [['ok', 'תקין'], ['fail', 'לא תקין'], ['na', 'לא רלוונטי']];

// the form extension used by both QC pages
function qcChecklistExtension(stage) {
  let host, list = [];
  const form = () => document.getElementById('recordForm');
  function render() {
    if (!list.length) { host.innerHTML = '<p class="qc-empty">בחרו את הנושא כדי לקבל את רשימת הבדיקה</p>'; return; }
    host.innerHTML = `<div class="qc-head"><b>רשימת בדיקה</b><span>לפי המפרט הכללי לבקרת איכות · <span class="qc-hold-key">נקודת עצירה</span> — אין להמשיך בלי אישור</span></div>
      <ol class="qc-list">${list.map((c, i) => `<li class="qc-item${c.hold ? ' hold' : ''}">
        <span class="qc-text">${esc(c.item)}${c.hold ? ' <span class="qc-hold-key">נקודת עצירה</span>' : ''}</span>
        <span class="qc-choices" role="radiogroup" aria-label="${esc(c.item)}">${QC_STATES.map(([v, l]) =>
          `<button type="button" class="qc-choice qc-${v}${c.status === v ? ' on' : ''}" data-i="${i}" data-v="${v}" aria-pressed="${c.status === v}">${l}</button>`).join('')}</span>
      </li>`).join('')}</ol>`;
    host.querySelectorAll('.qc-choice').forEach(b => b.addEventListener('click', () => {
      const c = list[+b.dataset.i];
      c.status = c.status === b.dataset.v ? null : b.dataset.v;
      render();
      syncResult();
    }));
  }
  // the result follows the ticks (the inspector can still change it)
  function syncResult() {
    const sel = form().querySelector('[name=result]');
    if (!sel || !list.length) return;
    const statuses = list.map(c => c.status);
    sel.value = statuses.includes('fail') ? 'לא תקין' : statuses.every(s => s === 'ok' || s === 'na') ? 'תקין' : 'בטיפול';
  }
  function load(subject, saved) {
    const tpl = qcTemplate(stage, subject);
    list = tpl.map(t => ({ ...t, status: (saved || []).find(s => s.item === t.item)?.status || null }));
    // items that were saved but are no longer in the template stay (nothing recorded is lost)
    (saved || []).forEach(s => { if (!list.some(c => c.item === s.item)) list.push({ ...s }); });
    render();
  }
  return {
    mount(formEl) {
      host = document.createElement('div');
      host.className = 'qc-checklist';
      formEl.querySelector('#formGrid').insertAdjacentElement('afterend', host);
      formEl.querySelector('[name=subject]').addEventListener('change', e => load(e.target.value, list.filter(c => c.status)));
    },
    fill(row) { load(row ? row.subject : null, row ? row.checklist : null); },
    collect(payload) {
      payload.checklist = list.length ? list.map(c => ({ item: c.item, hold: !!c.hold, status: c.status || null })) : null;
      const heldOk = list.some(c => c.hold && c.status === 'ok');
      if (heldOk && !payload.approved_by) return 'אושרה נקודת עצירה — יש לציין מי אישר (שדה "אושר ע״י")';
      if (heldOk && !payload.approval_date) payload.approval_date = payload.control_date;
      return null;
    },
  };
}

// A failed check opens a non-conformance with the failed items — once per check.
async function qcOpenNonConformance({ id, payload }, api) {
  if (payload.result !== 'לא תקין') return;
  const { data: existing } = await sb.from('exceptions').select('id').eq('source_table', 'quality_controls').eq('source_id', id);
  if (existing && existing.length) return;
  const failed = (payload.checklist || []).filter(c => c.status === 'fail').map(c => '• ' + c.item);
  if (!confirm(`הבקרה סומנה "לא תקין".\n\nלפתוח אי-התאמה${failed.length ? ' עם הליקויים:\n' + failed.join('\n') : ''}?`)) return;
  const plan = new Date(); plan.setDate(plan.getDate() + 7);
  const { data, error } = await sb.from('exceptions').insert({
    site_id: api.site.id, exception_date: payload.control_date, category: 'ביצוע', location: payload.subject,
    description: `${payload.stage === 'preliminary' ? 'בקרה מוקדמת' : 'בקרה שוטפת'} ל"${payload.subject}" — לא תקין` + (failed.length ? ':\n' + failed.join('\n') : ''),
    status: 'פתוח', severity: 2, planned_close_date: plan.toISOString().slice(0, 10),
    source_table: 'quality_controls', source_id: id, created_by: api.user.id,
  }).select('id').single();
  if (error) { toast('לא ניתן היה לפתוח אי-התאמה: ' + error.message, 'error'); return; }
  toast('נפתחה אי-התאמה — עוברים לרשימה', 'success');
  setTimeout(() => { location.href = `exceptions.html?open=${data.id}`; }, 900);
}
