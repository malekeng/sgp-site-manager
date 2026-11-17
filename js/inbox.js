// "דואר נכנס" (2026-11-04): documents that came by email to a company or site address.
// Each new file is read here once (js/ocr.js), a record is suggested (js/inbox-match.js), and a
// person attaches it with one click — through sgpUploadDocument and sgpAutoFill, under their own
// permissions. Nothing is attached, filled or deleted by the server.
// Spec: docs/superpowers/specs/2026-11-04-email-inbox-design.md §3.2.

const INBOX_UNREADABLE = 'לא ניתן לקרוא את הקובץ — בחרו רשומה ידנית';
const INBOX_DAYS_BACK = 180;

// Reads one file. A download that fails is thrown (the file stays "new" and is tried again next
// time); a file the reader cannot read is saved as "unreadable" so it is not read forever.
async function inboxReadOne(row, candidates) {
  const file = await inboxFetchFile(row);
  let extracted;
  try {
    extracted = await sgpExtractFile(file);
  } catch (_) {
    extracted = { v: SGP_EXTRACT_VERSION, kind: 'unreadable' };
  }
  return { extracted, suggestion: sgpInboxSuggest(extracted, candidates, { siteId: row.site_id }) };
}

// the same value whatever the key order (jsonb gives keys back in its own order)
function inboxStable(v) {
  return sgpInboxStableJson(v);
}

// A file read earlier gets a fresh suggestion (the pour may have been added since); it is saved
// only when it changed. Returns whether it changed.
async function inboxRefreshSuggestion(row, candidates) {
  const s = sgpInboxSuggest(row.extracted, candidates, { siteId: row.site_id });
  if (inboxStable(s) === inboxStable(row.suggestion)) return false;
  const { error } = await sb.rpc('inbox_save_reading', {
    p_file: row.id, p_extracted: row.extracted, p_suggestion: s, p_site: s && s.siteId ? s.siteId : null,
  });
  if (!error) row.suggestion = s;
  return !error;
}

// Upload → fill the empty fields → mark the file attached. If only the last step fails, the
// document already exists: a second call ("נסה שוב") marks it and uploads nothing again.
// A click while one is running gets that one's result (a double click once uploaded twice).
function inboxAttach(row, target, user) {
  if (!row._attaching) {
    row._attaching = inboxAttachOnce(row, target, user).finally(() => { row._attaching = null; });
  }
  return row._attaching;
}

async function inboxAttachOnce(row, { table, recordId, siteId }, user) {
  if (!row._documentId) {
    const file = row._file || await inboxFetchFile(row);
    const ex = row.extracted && row.extracted.kind !== 'unreadable' ? row.extracted : null;
    const target = inboxTarget(ex && ex.kind, /^image\//.test(row.mime_type || ''));
    const doc = await sgpUploadDocument({ file, siteId, table, recordId, docType: target.docType,
      documentDate: (ex && (ex.date || ex.report_date)) || null, extracted: ex, userId: user.id });
    row._documentId = doc.id;
    row._filled = await sgpAutoFill(table, recordId, ex ? [ex] : [], user.id);
  }
  const { error } = await sb.rpc('inbox_mark_attached', { p_file: row.id, p_document: row._documentId });
  if (error) throw error;
  return row._filled || [];
}

// ---- the page ------------------------------------------------------------------------------
function inboxWhat(ex) {
  if (!ex) return 'עוד לא נקרא';
  if (ex.kind === 'unreadable') return INBOX_UNREADABLE;
  if (ex.kind === 'concrete_lab') {
    const ages = (ex.ages || []).slice().sort((a, b) => a - b);
    return ['דוח מעבדה', ex.lab_no, ex.grade, ages.length ? ages.join('+') + ' ימים' : null].filter(Boolean).join(' · ');
  }
  if (ex.kind === 'concrete_note') {
    const notes = (ex.trucks || []).map(t => t.note).filter(Boolean);
    return `תעודת משלוח בטון · ${(ex.trucks || []).length} משאיות` + (notes.length ? ` · ${notes.slice(0, 4).join(', ')}${notes.length > 4 ? '…' : ''}` : '');
  }
  if (ex.kind === 'rebar_note') {
    return ['תעודת משלוח ברזל', (ex.notes || []).join(', '), (ex.orders || []).length ? 'הזמנה ' + ex.orders.join(', ') : null].filter(Boolean).join(' · ');
  }
  return (typeof SGP_DOC_KIND !== 'undefined' && SGP_DOC_KIND[ex.kind]) || 'מסמך';
}

async function inboxPageInit() {
  const auth = await requireAuth('inbox.html');
  if (!auth) return;
  const { user, profile, org } = auth;
  const main = document.getElementById('inboxMain');
  if (profile.role === 'contractor') { main.innerHTML = '<p>אין גישה לעמוד הזה.</p>'; return; }
  const isAdmin = profile.role === 'owner' || profile.role === 'admin';
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  const state = { rows: [], cands: { concrete_pours: [], rebar_deliveries: [] }, sites: {}, search: '', labDocs: [] };
  const progress = document.getElementById('inboxProgress');

  // the addresses this person may hand out (again after a change in "הגדרות קליטה")
  function loadAddresses() {
    return sb.rpc('inbox_my_addresses', { p_org: org.id }).then(({ data }) => {
      const host = document.getElementById('inboxAddresses');
      if (!data || !data.length) {
        host.innerHTML = isAdmin ? '<p style="font-size:13px;color:var(--steel);">עוד אין כתובת. פתחו את "הגדרות קליטה" ולחצו "הפעלה".</p>' : '';
        return;
      }
      host.innerHTML = data.map(a => `
        <div class="attach-item" style="flex-wrap:wrap;gap:8px;">
          <span style="min-width:110px;font-weight:600;">${a.kind === 'company' ? 'כתובת החברה' : esc(a.site_name || '')}</span>
          <span style="${INBOX_MONO}">${esc(a.address)}</span>
          <button class="btn btn-sm btn-outline" data-copy="${esc(a.address)}">העתקה</button>
        </div>`).join('');
      host.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => inboxCopy(b.dataset.copy)));
    });
  }
  loadAddresses();

  if (isAdmin) {
    const det = document.getElementById('inboxSettingsWrap');
    det.hidden = false;
    det.addEventListener('toggle', async () => {
      if (!det.open || det.dataset.mounted) return;
      det.dataset.mounted = '1';
      const { data: sites } = await sb.from('sites').select('id, name').eq('organization_id', org.id).order('name');
      await inboxSettingsMount(document.getElementById('inboxSettingsHost'), { org, sites: sites || [], onChange: loadAddresses });
    });
  }

  async function loadCandidates() {
    const since = new Date(Date.now() - INBOX_DAYS_BACK * 86400000).toISOString().slice(0, 10);
    const [pours, rebar, slabs, sites, labDocs] = await Promise.all([
      sb.from('concrete_pours').select('id, site_id, pour_date, concrete_grade, delivery_note_number, element, location').gte('pour_date', since),
      sb.from('rebar_deliveries').select('id, site_id, plan_ref, delivery_note_number, delivery_date').gte('created_at', since),
      sb.from('prestressed_slabs').select('id, site_id, delivery_date, order_date, order_number, delivery_note_number, plan_ref, location').gte('created_at', since),
      sb.from('sites').select('id, name'),
      // lab reports already on a record (by email or uploaded there), to flag a copy
      sb.from('documents').select('id, linked_table, linked_record_id, extracted').eq('doc_type', 'lab_test').not('extracted', 'is', null).gte('created_at', since),
    ]);
    state.cands = { concrete_pours: pours.data || [], rebar_deliveries: rebar.data || [], prestressed_slabs: slabs.data || [] };
    state.sites = Object.fromEntries((sites.data || []).map(s => [s.id, s.name]));
    state.labDocs = labDocs.data || [];
  }

  // where this lab report is attached already (the same number and edition), or null
  function sameReport(row) {
    const reports = state.labDocs.filter(d => d.id !== row._documentId)
      .map(d => ({ ex: d.extracted, table: d.linked_table, recordId: d.linked_record_id }))
      .concat(state.rows.filter(r => r !== row && r.status === 'attached')
        .map(r => ({ ex: r.extracted, table: r.linked_table, recordId: r.linked_record_id })));
    return sgpInboxSameReport(row.extracted, reports);
  }

  function sameReportText(dup) {
    const c = candidate(dup.table, dup.recordId);
    return 'הדוח הזה כבר מצורף' + (c ? ` ל: ${state.sites[c.site_id] || ''} · ${sgpInboxLabel(dup.table, c)}` : '');
  }

  async function loadRows() {
    const { data, error } = await sb.from('inbox_files')
      .select('*, inbox_messages(from_email, from_name, subject, received_at, sender_kind, skipped)')
      .eq('org_id', org.id).order('created_at', { ascending: false }).limit(300);
    if (error) { main.querySelector('#inboxNew').innerHTML = `<p style="color:var(--danger);">שגיאה: ${esc(error.message)}</p>`; return; }
    state.rows = data || [];
  }

  function rowById(id) { return state.rows.find(r => r.id === id); }
  function candidate(table, id) { return (state.cands[table] || []).find(r => r.id === id); }

  function suggestionHtml(row) {
    const s = row.suggestion;
    if (!row.extracted) return '';
    if (!s) return '<div class="inbox-sug muted">אין הצעה — בחרו רשומה</div>';
    if (s.create) return `<div class="inbox-sug">${esc(s.reason)}</div>`;
    if (s.options) {
      return `<div class="inbox-sug">${esc(s.reason)}:</div>` + s.options.map((o, i) => `
        <div class="attach-item"><span>${esc(state.sites[o.siteId] || '')} · ${esc(o.label)}</span>
          <button class="btn btn-sm btn-primary" data-attach-opt="${i}">צרף</button></div>`).join('');
    }
    const c = candidate(s.table, s.recordId);
    const label = c ? sgpInboxLabel(s.table, c) : 'הרשומה המוצעת';
    return `<div class="inbox-sug">→ ${esc(state.sites[s.siteId] || '')} · ${esc(label)}
      <span style="color:var(--steel);">(${esc(s.reason)})</span>
      ${s.confidence === 'medium' ? '<span class="badge" style="background:var(--warning-bg,#fff4e0);color:#a35a00;margin-inline-start:6px;">בדקו</span>' : ''}</div>`;
  }

  function insightsHtml(row) {
    const ex = row.extracted;
    if (!ex || !ex.kind || ex.kind === 'unreadable' || typeof sgpInsights !== 'function') return '';
    const target = inboxTarget(ex.kind, false);
    if (!target.table) return '';
    const s = row.suggestion;
    const rec = s && s.recordId ? candidate(s.table, s.recordId) || {} : {};
    const ins = sgpInsights(target.table, rec, [{ id: row.id, doc_type: target.docType, extracted: ex }]);
    return ins.checks.length ? sgpInsightsHtml(ins, target.table) : '';
  }

  function cardHtml(row) {
    const m = row.inbox_messages || {};
    const ex = row.extracted;
    const target = inboxTarget(ex && ex.kind, /^image\//.test(row.mime_type || ''));
    const s = row.suggestion;
    const open = row.status === 'new' || row.status === 'read';
    const dup = open ? sameReport(row) : null;
    const isPdf = /pdf/i.test(row.mime_type || '') || /\.pdf$/i.test(row.file_name || '');
    let actions = '';
    if (open) {
      if (row._documentId) actions += `<button class="btn btn-sm btn-primary" data-retry>נסה שוב</button>`;
      else {
        if (s && s.recordId) actions += `<button class="btn btn-sm btn-primary" data-attach>צרף</button>`;
        actions += `<button class="btn btn-sm btn-outline" data-other>רשומה אחרת</button>`;
        if (target.page) actions += `<button class="btn btn-sm btn-outline" data-create>רשומה חדשה</button>`;
      }
      actions += `<button class="btn btn-sm btn-ghost" data-ignore>התעלם</button>`;
    } else if (row.status === 'held' && isAdmin) {
      actions = `<select data-pattern aria-label="מה לאשר">
          <option value="${esc(m.from_email || '')}">הכתובת ${esc(m.from_email || '')}</option>
          <option value="@${esc(String(m.from_email || '').split('@')[1] || '')}">כל הדומיין @${esc(String(m.from_email || '').split('@')[1] || '')}</option>
        </select>
        <button class="btn btn-sm btn-primary" data-approve>אשר שולח</button>
        <button class="btn btn-sm btn-ghost" data-ignore>התעלם</button>`;
    } else if (row.status === 'ignored') {
      actions = `<button class="btn btn-sm btn-ghost" data-unignore>בטל התעלמות</button>`;
    }
    let state_ = '';
    if (row.status === 'attached') state_ = `<div class="inbox-sug" style="color:var(--success,#1a7f37);">צורף ✓${row.linked_table ? ' · ' + esc(state.sites[row.site_id] || '') : ''}</div>`;
    if (row.status === 'duplicate') {
      const first = rowById(row.duplicate_of);
      state_ = `<div class="inbox-sug muted">כבר התקבל ב-${first ? esc(fmtDate(first.created_at)) : '—'}</div>`;
    }
    if (row.status === 'ignored') state_ = '<div class="inbox-sug muted">סומן "התעלם"</div>';
    return `
      <div class="card inbox-item" data-id="${esc(row.id)}" style="margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <img src="icons/nav/${isPdf ? 'pdf' : 'documents'}.webp" alt="" aria-hidden="true" width="28" height="28">
          <strong style="word-break:break-all;">${esc(row.file_name)}</strong>
          <button class="btn btn-sm btn-ghost" data-view>תצוגה</button>
        </div>
        <div style="font-size:12.5px;color:var(--steel);margin:4px 0 8px;">
          ${esc(m.from_name || m.from_email || '')}${m.subject ? ' · ' + esc(m.subject) : ''} · ${esc(fmtDate(m.received_at || row.created_at))}
          ${row.site_id && state.sites[row.site_id] ? ' · ' + esc(state.sites[row.site_id]) : ''}
        </div>
        <div style="font-weight:600;margin-bottom:4px;">${esc(inboxWhat(ex))}</div>
        ${row._error ? `<div style="color:var(--danger);font-size:13px;">${esc(row._error)}</div>` : ''}
        ${open ? suggestionHtml(row) : ''}
        ${open && dup ? `<div class="inbox-sug" style="color:var(--danger);font-weight:600;">⚠ ${esc(sameReportText(dup))}</div>` : ''}
        ${state_}
        ${open ? insightsHtml(row) : ''}
        ${actions ? `<div class="header-actions" style="margin-top:10px;">${actions}</div>` : ''}
      </div>`;
  }

  function render() {
    const openRows = state.rows.filter(r => r.status === 'new' || r.status === 'read');
    const held = state.rows.filter(r => r.status === 'held');
    const q = state.search.trim().toLowerCase();
    const done = state.rows.filter(r => ['attached', 'ignored', 'duplicate'].includes(r.status))
      .filter(r => !q || [r.file_name, r.inbox_messages && r.inbox_messages.subject, r.inbox_messages && r.inbox_messages.from_email]
        .some(v => String(v || '').toLowerCase().includes(q)))
      .slice(0, 100);
    document.getElementById('inboxNew').innerHTML = openRows.length ? openRows.map(cardHtml).join('')
      : '<p class="empty-state">אין מסמכים חדשים</p>';
    const heldHost = document.getElementById('inboxHeldWrap');
    heldHost.hidden = !(isAdmin && held.length);
    document.getElementById('inboxHeld').innerHTML = held.map(cardHtml).join('');
    document.getElementById('inboxDone').innerHTML = done.length ? done.map(cardHtml).join('') : '<p class="empty-state">עדיין אין</p>';
    if (typeof refreshInboxCount === 'function') refreshInboxCount(org);
  }

  async function attachTo(row, target) {
    const dup = sameReport(row);
    if (!row._documentId && dup && !confirm(sameReportText(dup) + '. לצרף שוב?')) return;
    try {
      const filled = await inboxAttach(row, target, user);
      row.status = 'attached'; row.linked_table = target.table; row.site_id = row.site_id || target.siteId;
      row.linked_record_id = target.recordId;
      toast('צורף' + (filled.length ? ' · מולאו: ' + filled.join(', ') : ''), 'success');
    } catch (err) {
      toast((row._documentId ? 'המסמך צורף, אך הסימון ב"דואר נכנס" לא נשמר — לחצו "נסה שוב". ' : 'הצירוף נכשל: ') + (err.message || ''), 'error');
    }
    render();
  }

  // the reader's kind decides the table; for a file it did not recognise, the person chooses it
  function pickOther(row) {
    const known = inboxTarget(row.extracted && row.extracted.kind, false).table;
    const back = document.getElementById('inboxPickBackdrop');
    const host = document.getElementById('inboxPickList');
    const filter = document.getElementById('inboxPickFilter');
    const kindSel = document.getElementById('inboxPickTable');
    kindSel.hidden = !!known;
    if (known) kindSel.value = known;
    const draw = () => {
      const target = { table: kindSel.value };
      const list = state.cands[target.table] || [];
      const q = filter.value.trim();
      const rows = list.filter(c => !q || (sgpInboxLabel(target.table, c) + ' ' + (state.sites[c.site_id] || '')).includes(q)).slice(0, 60);
      host.innerHTML = rows.length ? rows.map(c => `<div class="attach-item"><span>${esc(state.sites[c.site_id] || '')} · ${esc(sgpInboxLabel(target.table, c))}</span>
        <button class="btn btn-sm btn-primary" data-pick="${esc(c.id)}">צרף</button></div>`).join('') : '<p class="empty-state">אין רשומות</p>';
      host.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
        const c = list.find(x => x.id === b.dataset.pick);
        back.classList.remove('open');
        attachTo(row, { table: target.table, recordId: c.id, siteId: c.site_id });
      }));
    };
    filter.value = '';
    filter.oninput = draw;
    kindSel.onchange = draw;
    draw();
    back.classList.add('open');
  }

  main.addEventListener('click', async e => {
    const btn = e.target.closest('button');
    const card = e.target.closest('[data-id]');
    if (!btn || !card) return;
    const row = rowById(card.dataset.id);
    if (!row) return;
    if (btn.hasAttribute('data-view')) {
      // Word / Excel inside the app (js/office-preview.js); anything else in a new tab
      if (sgpOfficeName(row.file_name)) {
        try { const f = row._file || (row._file = await inboxFetchFile(row)); await sgpOpenOffice(f, row.file_name); }
        catch (err) { toast(err.message, 'error'); }
        return;
      }
      const w = window.open('', '_blank');
      try { const f = row._file || (row._file = await inboxFetchFile(row)); w.location = URL.createObjectURL(f); }
      catch (err) { if (w) w.close(); toast(err.message, 'error'); }
    } else if (btn.hasAttribute('data-attach') || btn.hasAttribute('data-retry')) {
      const s = row.suggestion || {};
      await attachTo(row, row._target || { table: s.table, recordId: s.recordId, siteId: s.siteId });
    } else if (btn.hasAttribute('data-attach-opt')) {
      const o = row.suggestion.options[Number(btn.dataset.attachOpt)];
      row._target = { table: o.table, recordId: o.recordId, siteId: o.siteId };
      await attachTo(row, row._target);
    } else if (btn.hasAttribute('data-other')) {
      pickOther(row);
    } else if (btn.hasAttribute('data-create')) {
      location.href = `${inboxTarget(row.extracted && row.extracted.kind, false).page}#inbox=${row.id}`;
    } else if (btn.hasAttribute('data-ignore')) {
      const { error } = await sb.rpc('inbox_ignore', { p_file: row.id });
      if (error) { toast(inboxErrorText(error), 'error'); return; }
      row.status = 'ignored'; render();
    } else if (btn.hasAttribute('data-unignore')) {
      const { error } = await sb.rpc('inbox_unignore', { p_file: row.id });
      if (error) { toast(inboxErrorText(error), 'error'); return; }
      await refresh();
    } else if (btn.hasAttribute('data-approve')) {
      const pattern = card.querySelector('[data-pattern]').value;
      const { data, error } = await sb.rpc('inbox_approve_sender', { p_message: row.message_id, p_pattern: pattern });
      if (error) { toast(inboxErrorText(error), 'error'); return; }
      toast(`השולח אושר · ${data || 0} קבצים שוחררו`, 'success');
      await refresh();
    }
  });
  document.getElementById('inboxSearch').addEventListener('input', e => { state.search = e.target.value; render(); });
  document.getElementById('inboxPickClose').addEventListener('click', () => document.getElementById('inboxPickBackdrop').classList.remove('open'));

  async function readNew() {
    const fresh = state.rows.filter(r => r.status === 'new');
    for (let i = 0; i < fresh.length; i++) {
      const row = fresh[i];
      progress.textContent = `קורא ${i + 1}/${fresh.length}…`;
      try {
        const { extracted, suggestion } = await inboxReadOne(row, state.cands);
        const { error } = await sb.rpc('inbox_save_reading', {
          p_file: row.id, p_extracted: extracted, p_suggestion: suggestion, p_site: suggestion && suggestion.siteId ? suggestion.siteId : null,
        });
        if (error) throw error;
        Object.assign(row, { extracted, suggestion, status: 'read', _error: null });
        if (!row.site_id && suggestion && suggestion.siteId) row.site_id = suggestion.siteId;
      } catch (err) {
        row._error = 'הקובץ לא נטען — ננסה שוב בפתיחה הבאה';
      }
      render();
    }
    progress.textContent = '';
  }

  async function refresh() {
    await loadRows();
    for (const row of state.rows.filter(r => r.status === 'read' && r.extracted)) await inboxRefreshSuggestion(row, state.cands);
    render();
    await readNew();
  }

  await loadCandidates();
  await refresh();
}
