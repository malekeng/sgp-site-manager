// ===== Weekly quality report (דוח איכות שבועי) ==========================================
// What the QC specification asks the contractor to report every week (4.6.2): the work done,
// tests and their results, non-conformances, instructions — built from what is already in
// the system, including what the attached documents say (js/doc-insights.js). Nothing to fill in.

async function sgpWeeklyQualityReport({ siteIds, siteNames, from, to }) {
  const inRange = (q, field) => q.gte(field, from).lte(field, to);
  const today = new Date().toISOString().slice(0, 10);
  const sections = [];

  // records of the materials tables, with their documents, for the document findings
  async function withDocs(table, dateField) {
    const [{ data: recs }, { data: docs }] = await Promise.all([
      inRange(sb.from(table).select('*').in('site_id', siteIds), dateField).order(dateField, { ascending: true }),
      sb.from('documents').select('id, linked_record_id, doc_type, file_name, file_path, extracted').in('site_id', siteIds).eq('linked_table', table),
    ]);
    const byRec = {};
    (docs || []).forEach(d => { (byRec[d.linked_record_id] ||= []).push(d); });
    return (recs || []).map(r => ({ r, ins: byRec[r.id] ? sgpInsights(table, r, byRec[r.id]) : null }));
  }
  const LEVEL = { bad: 'לא תקין', warn: 'לבדיקה', ok: 'תקין', info: '—' };

  // 1. the week's pours, with what their delivery notes and lab reports say
  const pours = await withDocs('concrete_pours', 'pour_date');
  sections.push({
    title: 'יציקות בטון בשבוע', ico: 'concrete',
    columns: [
      { key: 'pour_date', label: 'תאריך', type: 'date' }, { key: 'location', label: 'מיקום', type: 'text' },
      { key: 'element', label: 'אלמנט', type: 'text' }, { key: 'concrete_grade', label: 'סוג', type: 'text' },
      { key: 'volume_m3', label: 'מ"ק', type: 'number', total: true }, { key: 'trucks', label: 'משאיות בתעודות', type: 'text' },
      { key: 'result', label: 'מהמסמכים', type: 'text' },
    ],
    rows: pours.map(({ r, ins }) => ({
      ...r,
      trucks: ins && ins.facts.trucks && ins.facts.trucks.length ? String(ins.facts.trucks.length) : '—',
      result: ins && ins.level ? LEVEL[ins.level] : (ins && ins.pending.length ? 'טרם נקרא' : '—'),
    })),
  });

  // 2. findings from the documents (every materials record with something to check)
  const findings = [];
  const add = (label, ins) => ins && ins.checks.filter(c => c.level === 'bad' || c.level === 'warn')
    .forEach(c => findings.push({ what: label, result: LEVEL[c.level], text: c.text }));
  pours.forEach(({ r, ins }) => add(`יציקה ${r.element || ''} ${fmtDate(r.pour_date)}`, ins));
  (await withDocs('rebar_deliveries', 'order_date')).forEach(({ r, ins }) => add(`ברזל ${r.supplier || ''} ${fmtDate(r.order_date)}`, ins));
  (await withDocs('prestressed_slabs', 'order_date')).forEach(({ r, ins }) => add(`לוח"דים הזמנה ${r.order_number || ''}`, ins));
  sections.push({
    title: 'ממצאים מהמסמכים המצורפים', ico: 'documents',
    columns: [{ key: 'what', label: 'רשומה', type: 'text' }, { key: 'result', label: 'רמה', type: 'text' }, { key: 'text', label: 'ממצא', type: 'text' }],
    rows: findings,
  });

  // 3. lab results that arrived, and 28-day results that are due
  const labRows = [];
  pours.forEach(({ r, ins }) => {
    if (!ins) return;
    (ins.facts.labs || []).forEach(l => {
      const age = l.ages && l.ages.length ? Math.max(...l.ages) : null;
      const avg = l.averages && l.averages.length ? l.averages[l.averages.length - 1] : null;
      const c = l.criteria;
      const low = Math.min(...(l.samples || []).map(s => (s.mpa || [])[0]).filter(v => v != null));
      labRows.push({
        pour_date: r.pour_date, element: r.element, lab: l.lab_no || '', age: age ? `${age} יום` : '—', avg,
        rule: c ? `≥ ${c.avg_min} / ${c.single_min}` : '—',
        result: c && age === c.age && avg != null ? (avg >= c.avg_min && low >= c.single_min ? 'עומד' : 'לא עומד') : 'ממתין',
      });
    });
  });
  sections.push({
    title: 'תוצאות מעבדה', ico: 'quality',
    columns: [
      { key: 'pour_date', label: 'יציקה', type: 'date' }, { key: 'element', label: 'אלמנט', type: 'text' }, { key: 'lab', label: 'דוח', type: 'text' },
      { key: 'age', label: 'גיל', type: 'text' }, { key: 'avg', label: 'ממוצע מגפ"ס', type: 'number' }, { key: 'rule', label: 'דרישה (ממוצע/בודדת)', type: 'text' },
      { key: 'result', label: 'תוצאה', type: 'text' },
    ],
    rows: labRows,
  });

  // 4. quality control of the week
  const { data: qc } = await inRange(sb.from('quality_controls').select('*').in('site_id', siteIds), 'control_date').order('control_date');
  sections.push({
    title: 'בקרת איכות', ico: 'quality',
    columns: [
      { key: 'control_date', label: 'תאריך', type: 'date' }, { key: 'stage_label', label: 'סוג', type: 'text' },
      { key: 'subject', label: 'נושא', type: 'text' }, { key: 'list', label: 'רשימת בדיקה', type: 'text' },
      { key: 'result', label: 'תוצאה', type: 'text' }, { key: 'approved_by', label: 'נקודת עצירה אושרה ע״י', type: 'text' },
    ],
    rows: (qc || []).map(q => {
      const l = q.checklist || [];
      return { ...q, stage_label: q.stage === 'preliminary' ? 'מוקדמת' : 'שוטפת',
        list: l.length ? `${l.filter(c => c.status).length}/${l.length}${l.some(c => c.status === 'fail') ? ` · ${l.filter(c => c.status === 'fail').length} לא תקין` : ''}` : '—' };
    }),
  });

  // 5. non-conformances: opened this week, and everything still open
  const { data: ncr } = await sb.from('exceptions').select('*').in('site_id', siteIds).order('exception_date');
  sections.push({
    title: 'אי-התאמות — שנפתחו השבוע ופתוחות', ico: 'exceptions',
    columns: [
      { key: 'exception_date', label: 'נפתח', type: 'date' }, { key: 'location', label: 'מיקום', type: 'text' },
      { key: 'severity', label: 'חומרה', type: 'text' }, { key: 'status', label: 'סטטוס', type: 'text' },
      { key: 'planned_close_date', label: 'סגירה מתוכננת', type: 'date' }, { key: 'late', label: 'איחור', type: 'text' },
      { key: 'corrective_action', label: 'פעולה מתקנת', type: 'text' },
    ],
    rows: (ncr || []).filter(x => x.status !== 'נסגר' || (x.exception_date >= from && x.exception_date <= to)).map(x => {
      const late = x.planned_close_date && x.status !== 'נסגר' && x.planned_close_date < today
        ? `${Math.round((Date.parse(today) - Date.parse(x.planned_close_date)) / 86400000)} ימים` : '';
      return { ...x, severity: x.severity ? String(x.severity) : '—', late };
    }),
  });

  // 6. deliveries of the week
  const [{ data: rebar }, { data: slabs }] = await Promise.all([
    inRange(sb.from('rebar_deliveries').select('*').in('site_id', siteIds), 'delivery_date').order('delivery_date'),
    inRange(sb.from('prestressed_slabs').select('*').in('site_id', siteIds), 'delivery_date').order('delivery_date'),
  ]);
  sections.push({
    title: 'אספקות בשבוע', ico: 'rebar',
    columns: [
      { key: 'delivery_date', label: 'תאריך', type: 'date' }, { key: 'kind', label: 'חומר', type: 'text' },
      { key: 'supplier', label: 'ספק', type: 'text' }, { key: 'qty', label: 'כמות', type: 'text' },
      { key: 'delivery_note_number', label: 'תעודות', type: 'text' },
    ],
    rows: [
      ...(rebar || []).map(r => ({ ...r, kind: 'ברזל', qty: r.weight_kg != null ? `${fmtNum(r.weight_kg, 0)} ק"ג` : '—' })),
      ...(slabs || []).map(r => ({ ...r, kind: 'לוח"דים', qty: r.quantity_m2 != null ? fmtNum(r.quantity_m2, 2) : '—' })),
    ],
  });

  // 7. action items from the meetings that are still open
  const { data: tasks } = await sb.from('tasks').select('*').in('site_id', siteIds).not('meeting_id', 'is', null).neq('status', 'done').order('due_date');
  sections.push({
    title: 'משימות פתוחות מישיבות', ico: 'tasks',
    columns: [{ key: 'title', label: 'משימה', type: 'text' }, { key: 'due_date', label: 'עד', type: 'date' }, { key: 'status_label', label: 'סטטוס', type: 'text' }],
    rows: (tasks || []).map(t => ({ ...t, status_label: t.due_date && t.due_date < today ? 'באיחור' : ({ todo: 'לביצוע', in_progress: 'בתהליך' }[t.status] || t.status) })),
  });

  await sgpExportFullSystem({
    sections, siteNames, periodText: `${fmtDate(from)} — ${fmtDate(to)}`,
    fileTitle: 'דוח איכות שבועי',
  });
}
