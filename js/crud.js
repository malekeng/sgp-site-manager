// ===== Generic CRUD page engine =====

// Styled "add note" modal, built dynamically so any page can use it without
// needing its own static HTML. Replaces the native prompt() dialog.
function openAppendNoteModal(textarea) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop open';
  backdrop.innerHTML = `
    <div class="modal">
      <button type="button" class="icon-btn modal-close" id="closeAppendNoteBtn" aria-label="סגירה"><svg class="ui-ico ui-ico-x" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
      <h3>הוספת הערה</h3>
      <form id="appendNoteForm">
        <div class="field full">
          <label>הערה חדשה</label>
          <textarea name="note" rows="4" autofocus required placeholder="כתבו את ההערה כאן..."></textarea>
        </div>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary">הוספה</button>
          <button type="button" class="btn btn-outline" id="cancelAppendNoteBtn">ביטול</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('textarea').focus();

  function close() { backdrop.remove(); }
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  backdrop.querySelector('#cancelAppendNoteBtn').addEventListener('click', close);
  backdrop.querySelector('#closeAppendNoteBtn').addEventListener('click', close);
  backdrop.querySelector('#appendNoteForm').addEventListener('submit', e => {
    e.preventDefault();
    const newNote = new FormData(e.target).get('note');
    if (!newNote || !newNote.trim()) return;
    const dateStr = new Date().toLocaleDateString('he-IL');
    const entry = `[${dateStr}] ${newNote.trim()}`;
    textarea.value = textarea.value ? `${entry}\n${textarea.value}` : entry;
    close();
  });
}

async function initCrudPage(config) {
  const auth = await requireAuth(config.activePage);
  if (!auth) return;
  const { user, profile, site } = auth;

  const state = { rows: [], docCounts: {}, editingId: null, editingUpdatedAt: undefined, filters: {}, profileNames: {} };

  document.getElementById('pageTitle').textContent = config.title;

  const attachHost = document.getElementById('attachHost');
  let attachWidgets = [];
  if (attachHost) {
    if (Array.isArray(config.attachments) && config.attachments.length) {
      attachHost.innerHTML = config.attachments.map((_, i) => `<div id="attachSlot${i}"></div>`).join('');
      attachWidgets = config.attachments.map((a, i) =>
        createAttachWidget(document.getElementById(`attachSlot${i}`), { label: a.label, docType: a.docType })
      );
    } else {
      attachWidgets = [createAttachWidget(attachHost)];
    }
  }
  window.sgpAttachWidgetsByType = {};
  (config.attachments || []).forEach((a, i) => { window.sgpAttachWidgetsByType[a.docType] = attachWidgets[i]; });
  if (attachWidgets[0]) window.sgpAttachWidgetsByType.default = attachWidgets[0];
  const attachWidget = attachWidgets[0] || null; // kept for backward compatibility below

  function displayName(p) {
    if (!p) return 'משתמש';
    return p.full_name || p.username || p.email || 'משתמש';
  }

  function fmtDateTime(d) {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleString('he-IL', {
      day: 'numeric', month: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  async function resolveProfileNames(rows) {
    const ids = new Set();
    rows.forEach(r => {
      if (r.updated_by) ids.add(r.updated_by);
      if (r.created_by) ids.add(r.created_by);
    });
    const missing = [...ids].filter(id => !state.profileNames[id]);
    if (!missing.length) return;
    const { data, error } = await sb.from('profiles').select('id, full_name, username, email').in('id', missing);
    if (error) { console.error('resolveProfileNames failed:', error); return; }
    (data || []).forEach(p => { state.profileNames[p.id] = displayName(p); });
  }

  function auditLine(row) {
    if (!row) return '';
    const whoId = row.updated_by || row.created_by;
    const when = row.updated_at || row.created_at;
    if (!whoId && !when) return '';
    const who = whoId ? (state.profileNames[whoId] || 'משתמש') : '—';
    const label = row.updated_by ? 'עודכן ע\"י' : 'נוצר ע\"י';
    return `${label} ${who} · ${fmtDateTime(when)}`;
  }

  async function loadData() {
    let q = sb.from(config.table).select('*').eq('site_id', site.id);
    if (config.staticFilter) q = q.eq(config.staticFilter.column, config.staticFilter.value);
    if (state.filters.from) q = q.gte(config.dateField, state.filters.from);
    if (state.filters.to) q = q.lte(config.dateField, state.filters.to);
    q = q.order((config.orderBy && config.orderBy.column) || config.dateField, {
      ascending: (config.orderBy && config.orderBy.ascending) ?? false,
      nullsFirst: false,
    });
    q = q.order('created_at', { ascending: false }); // stable tie-breaker when the primary date repeats
    const { data, error } = await q;
    if (error) {
      toast('שגיאה בטעינת נתונים: ' + error.message, 'error');
      // Drop the previous result set rather than leaving it on screen — stale rows
      // here also feed the delete-confirmation attachment count.
      state.rows = [];
      state.docCounts = {};
      state.docCountsKnown = false;
      renderStats();
      renderTable();
      return;
    }
    state.rows = data || [];

    await resolveProfileNames(state.rows);

    if (state.rows.length) {
      const ids = state.rows.map(r => r.id);
      const { data: docs, error: docsErr } = await sb
        .from('documents')
        .select(config.docInsights ? 'id, linked_record_id, doc_type, file_name, file_path, extracted' : 'linked_record_id')
        .eq('linked_table', config.table)
        .in('linked_record_id', ids);
      // If this fails the counts are unknown, not zero — the delete warning must not
      // quietly claim a record has no attachments when we simply could not check.
      state.docCountsKnown = !docsErr;
      if (docsErr) console.error('doc counts failed:', docsErr);
      state.docCounts = {};
      (docs || []).forEach(d => {
        state.docCounts[d.linked_record_id] = (state.docCounts[d.linked_record_id] || 0) + 1;
      });
      // what the attached documents say about each record (see js/doc-insights.js)
      state.docsByRecord = {};
      state.insights = {};
      if (config.docInsights && typeof sgpInsights === 'function') {
        (docs || []).forEach(d => { (state.docsByRecord[d.linked_record_id] ||= []).push(d); });
        state.rows.forEach(r => {
          const ds = state.docsByRecord[r.id];
          if (ds) state.insights[r.id] = sgpInsights(config.table, r, ds);
        });
      }
    } else {
      state.docCounts = {};
      state.docsByRecord = {};
      state.insights = {};
    }

    renderStats();
    renderTable();
    if (config.onLoaded) config.onLoaded(state.rows, api);
  }

  function renderStats() {
    const host = document.getElementById('statsRow');
    if (!host) return;
    const lastUpdated = state.rows.length
      ? fmtDate(state.rows.map(r => r.updated_at || r.created_at).sort().slice(-1)[0])
      : '—';
    // the page's own sidebar icon; a page without one keeps its emoji
    const ico = pageIco(config.activePage);
    host.innerHTML =
      statCardHtml({ ico, label: ico ? 'סה"כ רשומות' : `${config.icon || '📋'} סה"כ רשומות`, value: state.rows.length }) +
      statCardHtml({ ico: 'updated', label: 'עודכן לאחרונה', value: lastUpdated, valueStyle: 'font-size:20px;' });
  }

  function renderTable() {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    thead.innerHTML = '<tr>' + config.columns.map(c => `<th>${esc(c.label)}</th>`).join('') + '<th>מסמכים</th><th>עודכן</th><th></th></tr>';

    // a page may narrow the table (e.g. one stage of the licensing path)
    const rows = state.rowFilter ? state.rows.filter(state.rowFilter) : state.rows;
    if (!rows.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="${config.columns.length + 3}">${state.rows.length ? 'אין רשומות בסינון הזה' : 'אין רשומות עדיין'}</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(row => {
      const cells = config.columns.map(c => {
        const v = row[c.key];
        let out = '—';
        if (c.render) out = c.render(row) || '—';     // the page builds (and escapes) this cell itself
        else if (v !== null && v !== undefined && v !== '') {
          if (c.type === 'date') out = esc(fmtDate(v));
          else if (c.type === 'number') out = esc(fmtNum(v, c.digits ?? 2));
          else if (c.type === 'boolean') out = esc(v ? (c.trueLabel || 'כן') : (c.falseLabel || 'לא'));
          else if (c.type === 'multiline') {
            out = String(v).split(/[\n,]+/).map(s => s.trim()).filter(Boolean).map(esc).join('<br>');
          }
          else out = esc(String(v));
        }
        return `<td class="${c.type === 'number' ? 'num-cell' : ''}">${out}</td>`;
      }).join('');
      const docCount = state.docCounts[row.id] || 0;
      // a dot for what the documents say: red = fails the standard, orange = check, green = matches
      const ins = state.insights && state.insights[row.id];
      const topCheck = ins && ins.level ? ins.checks.find(c => c.level === ins.level) : null;
      const dot = topCheck
        ? `<button type="button" class="di-dot di-dot-${ins.level}" data-insight="${row.id}" title="${esc(topCheck.text)}" aria-label="מהמסמכים: ${esc(topCheck.text)}"></button>`
        : '';
      const docCell = docCount
        ? `<td><span class="doc-badge" data-docs="${row.id}">${uiIcon('paperclip', 13)}${docCount}</span>${dot}</td>`
        : `<td class="cell-muted">—</td>`;
      const whoId = row.updated_by || row.created_by;
      const when = row.updated_at || row.created_at;
      const auditCell = whoId || when
        ? `<td class="audit-cell"><div class="audit-who">${esc(whoId ? (state.profileNames[whoId] || 'משתמש') : '—')}</div><div class="audit-when">${esc(fmtDateTime(when))}</div></td>`
        : `<td class="cell-muted">—</td>`;
      const qt = config.quickToggle;
      const toggleBtn = qt
        ? `<button class="icon-btn" data-toggle="${row.id}" title="${row[qt.key] ? qt.trueAction : qt.falseAction}">${(l => l && l.icon ? uiIcon(l.icon) : l)(row[qt.key] ? qt.trueLabel : qt.falseLabel)}</button>`
        : '';
      return `
        <tr>
          ${cells}
          ${docCell}
          ${auditCell}
          <td class="row-actions">
            <div class="row-actions-inner">
              ${toggleBtn}
              <button class="icon-btn" data-edit="${row.id}" title="עריכה" aria-label="עריכה">${uiIcon('pencil')}</button>
              <button class="icon-btn danger" data-del="${row.id}" title="מחיקה" aria-label="מחיקה">${uiIcon('trash')}</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('[data-edit]').forEach(btn =>
      btn.addEventListener('click', () => openModal(btn.dataset.edit)));
    tbody.querySelectorAll('[data-del]').forEach(btn =>
      btn.addEventListener('click', () => deleteRow(btn.dataset.del)));
    tbody.querySelectorAll('[data-toggle]').forEach(btn =>
      btn.addEventListener('click', () => quickToggle(btn.dataset.toggle)));
    tbody.querySelectorAll('[data-docs]').forEach(btn =>
      btn.addEventListener('click', () => showDocsPopup(btn.dataset.docs)));
    tbody.querySelectorAll('[data-insight]').forEach(btn =>
      btn.addEventListener('click', () => openModal(btn.dataset.insight)));
  }

  function isImageFile(name) {
    return /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(name || '');
  }

  function openLightbox(url) {
    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = `<img src="${url}" alt="תמונה מצורפת">`;
    overlay.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
  }

  async function showDocsPopup(recordId) {
    const docs = await loadRecordDocuments(config.table, recordId);
    if (!docs.length) return;
    const resolved = await Promise.all(docs.map(async d => ({ ...d, url: await getDocumentUrl(d.file_path) })));
    const lines = resolved.map((d, i) => {
      const dateLabel = d.document_date ? ` · ${esc(fmtDate(d.document_date))}` : '';
      const fileName = esc(d.file_name);
      if (!d.url) return `<div class="attach-item"><span>${fileName}${dateLabel}</span><span style="color:var(--danger);font-size:12px;">שגיאה בטעינה</span></div>`;
      if (isImageFile(d.file_name)) {
        return `<div class="attach-item" data-lightbox="${i}" style="cursor:pointer;">
          <span style="display:flex;align-items:center;gap:8px;">
            <img src="${esc(d.url)}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:6px;">
            ${fileName}${dateLabel}
          </span>
          <span class="btn btn-sm btn-outline">הצגה</span>
        </div>`;
      }
      return `<div class="attach-item"><span>${fileName}${dateLabel}</span><a href="${esc(d.url)}" class="btn btn-sm btn-outline">פתיחה / הורדה</a></div>`;
    });
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop open';
    backdrop.innerHTML = `<div class="modal"><h3>מסמכים מצורפים</h3><div class="attach-list">${lines.join('')}</div>
      <div class="modal-actions"><button class="btn btn-outline" id="closeDocsPopup">סגירה</button></div></div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelectorAll('[data-lightbox]').forEach(el => {
      el.addEventListener('click', () => openLightbox(resolved[Number(el.dataset.lightbox)].url));
    });
    backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
    backdrop.querySelector('#closeDocsPopup').addEventListener('click', () => backdrop.remove());
  }

  const modalBackdrop = document.getElementById('modalBackdrop');
  const formEl = document.getElementById('recordForm');
  const modalTitle = document.getElementById('modalTitle');
  const formMsg = document.getElementById('formMsg');

  function ensureOtherOption(options) {
    const list = [...(options || [])];
    if (!list.some(o => String(o).trim() === 'אחר')) list.push('אחר');
    return list;
  }

  function buildForm() {
    const grid = document.getElementById('formGrid');
    grid.innerHTML = config.formFields.map(f => {
      const full = f.full ? ' full' : '';
      if (f.type === 'select') {
        const opts = ensureOtherOption(f.options);
        return `<div class="field${full}" data-select-wrap="${f.key}">
          <label>${f.label}${f.required ? ' *' : ''}</label>
          <select name="${f.key}" data-has-other="1" ${f.required ? 'required' : ''}>
            <option value="">בחר...</option>
            ${opts.map(o => `<option value="${o}">${o}</option>`).join('')}
          </select>
          <input type="text" name="${f.key}__other" class="other-input" placeholder="הזינו ערך ידני..." style="display:none;margin-top:8px;">
        </div>`;
      }
      if (f.type === 'boolean') {
        const tLabel = f.trueLabel || 'כן';
        const fLabel = f.falseLabel || 'לא';
        return `<div class="field${full}"><label>${f.label}${f.required ? ' *' : ''}</label>
          <select name="${f.key}" ${f.required ? 'required' : ''}>
            <option value="${tLabel}">${tLabel}</option>
            <option value="${fLabel}">${fLabel}</option>
          </select></div>`;
      }
      if (f.type === 'datalist') {
        return `<div class="field${full}"><label>${f.label}${f.required ? ' *' : ''}</label>
          <input type="text" name="${f.key}" list="${f.key}_list" autocomplete="off" placeholder="בחרו או הקלידו ידנית" ${f.required ? 'required' : ''}>
          <datalist id="${f.key}_list">${(f.options || []).map(o => `<option value="${o}">`).join('')}</datalist>
          <div style="font-size:11px;color:var(--steel);margin-top:4px;">ניתן לבחור מהרשימה או להקליד ערך חופשי</div>
        </div>`;
      }
      if (f.type === 'textarea') {
        const appendBtn = f.key === 'notes'
          ? `<button type="button" class="btn btn-sm btn-outline" data-append-note style="margin-bottom:6px;">+ הוספת הערה</button>`
          : '';
        return `<div class="field${full}"><label>${f.label}${f.required ? ' *' : ''}</label>
          ${appendBtn}
          <textarea name="${f.key}" rows="2" ${f.required ? 'required' : ''}></textarea></div>`;
      }
      return `<div class="field${full}"><label>${f.label}${f.required ? ' *' : ''}</label>
        <input type="${f.type}" name="${f.key}" ${f.step ? `step="${f.step}"` : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} ${f.required ? 'required' : ''}></div>`;
    }).join('');

    if (config.formExtension && config.formExtension.mount) config.formExtension.mount(formEl, api);

    grid.querySelectorAll('[data-append-note]').forEach(btn => {
      btn.addEventListener('click', () => openAppendNoteModal(btn.parentElement.querySelector('textarea')));
    });

    grid.querySelectorAll('select[data-has-other]').forEach(sel => {
      const otherInput = sel.parentElement.querySelector('.other-input');
      const sync = () => {
        const isOther = sel.value === 'אחר';
        otherInput.style.display = isOther ? 'block' : 'none';
        if (isOther) {
          otherInput.required = sel.required;
          otherInput.focus();
        } else {
          otherInput.required = false;
          otherInput.value = '';
        }
      };
      sel.addEventListener('change', sync);
    });
  }

  function ensureAuditEl() {
    let el = document.getElementById('recordAudit');
    if (!el) {
      el = document.createElement('div');
      el.id = 'recordAudit';
      el.className = 'record-audit';
      modalTitle.insertAdjacentElement('afterend', el);
    }
    return el;
  }

  // "מהמסמכים המצורפים" — under the title of an existing record
  function ensureInsightsEl() {
    let el = document.getElementById('docInsights');
    if (!el) {
      el = document.createElement('div');
      el.id = 'docInsights';
      el.className = 'doc-insights';
      ensureAuditEl().insertAdjacentElement('afterend', el);
    }
    return el;
  }
  function renderInsights(id) {
    if (!config.docInsights || typeof sgpInsights !== 'function') return;
    const el = ensureInsightsEl();
    const row = id ? state.rows.find(r => r.id === id) : null;
    const docs = id && state.docsByRecord ? state.docsByRecord[id] : null;
    const ins = row && docs ? (state.insights[id] || sgpInsights(config.table, row, docs)) : null;
    el.innerHTML = ins ? sgpInsightsHtml(ins, config.table) : '';
    el.hidden = !el.innerHTML;
    const btn = el.querySelector('[data-read-docs]');
    if (!btn) return;
    if (typeof sgpExtractFile !== 'function') { btn.remove(); return; }
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const n = await sgpReadPendingDocs(ins.pending, t => { btn.textContent = t; });
      // the documents now read (and those read before) fill the record's still-empty fields
      const filled = n ? await autoFillRecord(id, docs.map(d => d.extracted).filter(Boolean)) : [];
      toast(n ? (n === 1 ? 'המסמך נקרא' : `${n} מסמכים נקראו`) + (filled.length ? ` · מולא ברשומה: ${filled.join(', ')}` : '')
        : 'לא נקרא אף מסמך', n ? 'success' : 'error');
      await loadData();
      if (state.editingId === id && modalBackdrop.classList.contains('open')) renderInsights(id);
    });
  }

  function openModal(id) {
    state.editingId = id || null;
    modalTitle.textContent = id ? 'עריכת רשומה' : 'הוספת רשומה';
    formEl.reset();
    hideMsg(formMsg);
    attachWidgets.forEach(w => w.clear());

    formEl.querySelectorAll('.other-input').forEach(inp => {
      inp.style.display = 'none';
      inp.required = false;
      inp.value = '';
    });

    const auditEl = ensureAuditEl();
    if (id) {
      const row = state.rows.find(r => r.id === id);
      state.editingUpdatedAt = row ? (row.updated_at || null) : null;
      auditEl.textContent = auditLine(row);
      auditEl.hidden = !auditEl.textContent;

      config.formFields.forEach(f => {
        const el = formEl.querySelector(`[name="${f.key}"]`);
        if (!el) return;
        if (f.type === 'boolean') { el.value = row[f.key] ? (f.trueLabel || 'כן') : (f.falseLabel || 'לא'); return; }

        const val = row[f.key];
        if (val === null || val === undefined || val === '') return;

        if (f.type === 'select') {
          const opts = ensureOtherOption(f.options || []);
          const match = opts.find(o => String(o) === String(val));
          if (match && match !== 'אחר') {
            el.value = match;
          } else {
            el.value = 'אחר';
            const otherInput = el.parentElement.querySelector('.other-input');
            if (otherInput) {
              otherInput.style.display = 'block';
              otherInput.value = String(val);
              otherInput.required = el.required;
            }
          }
          return;
        }

        el.value = val;
      });
    } else {
      auditEl.hidden = true;
      auditEl.textContent = '';
    }
    renderInsights(id);
    if (config.formExtension && config.formExtension.fill) {
      config.formExtension.fill(id ? state.rows.find(r => r.id === id) : null, api);
    }
    modalBackdrop.classList.add('open');
  }
  function closeModal() { modalBackdrop.classList.remove('open'); }

  document.getElementById('addBtn')?.addEventListener('click', () => openModal(null));
  document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
  document.getElementById('cancelBtn')?.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', e => { if (e.target === modalBackdrop) closeModal(); });

  formEl.addEventListener('submit', async e => {
    e.preventDefault();
    hideMsg(formMsg);
    const fd = new FormData(formEl);
    const payload = { site_id: site.id };
    if (config.staticFilter) payload[config.staticFilter.column] = config.staticFilter.value;

    // Collect validation problems instead of throwing: this runs OUTSIDE the try below,
    // so a throw here escaped the handler as an unhandled rejection and its catch branch
    // was never reachable.
    let validationError = null;
    config.formFields.forEach(f => {
      let v = fd.get(f.key);
      if (f.type === 'boolean') { payload[f.key] = (v === (f.trueLabel || 'כן')); return; }

      if (f.type === 'select' && v === 'אחר') {
        v = fd.get(f.key + '__other');
        if (!v || !String(v).trim()) {
          if (!validationError) validationError = 'יש להזין ערך בשדה "' + f.label + '"';
          return;
        }
        v = String(v).trim();
      }

      if (v === '') v = null;
      if (v !== null && (f.type === 'number' || f.numeric)) v = Number(v);
      payload[f.key] = v;
    });
    if (!validationError && config.formExtension && config.formExtension.collect) {
      validationError = config.formExtension.collect(payload, fd, api) || null;
    }
    if (validationError) { showMsg(formMsg, validationError, 'error'); return; }

    payload.updated_by = user.id;
    payload.updated_at = new Date().toISOString();

    const submitBtn = formEl.querySelector('[type=submit]');
    submitBtn.disabled = true;

    try {
      let recordId = state.editingId;
      const isNew = !state.editingId;
      if (state.editingId) {
        let uq = sb.from(config.table).update(payload).eq('id', state.editingId).select('id');
        uq = state.editingUpdatedAt ? uq.eq('updated_at', state.editingUpdatedAt) : uq.is('updated_at', null);
        const { data, error } = await uq;
        if (error) throw error;
        if (!data || !data.length) {
          throw new Error('הרשומה עודכנה בינתיים על ידי משתמש אחר. יש לסגור, לרענן ולנסות שוב כדי לא לדרוס את השינויים שלו.');
        }
      } else {
        payload.created_by = user.id;
        const { data, error } = await sb.from(config.table).insert(payload).select().single();
        if (error) throw error;
        recordId = data.id;
        // Lock in editingId immediately so a retry after a failed attachment upload below
        // updates this same record instead of inserting a duplicate.
        state.editingId = recordId;
      }

      const uploaded = [];
      try {
        for (const w of attachWidgets) {
          if (w.getFiles().length) {
            uploaded.push(...((await w.upload({ siteId: site.id, table: config.table, recordId, userId: user.id })) || []));
          }
        }
      } catch (attachErr) {
        console.error(attachErr);
        toast('הרשומה נשמרה בהצלחה, אך אירעה שגיאה בהעלאת קובץ מצורף: ' + attachErr.message, 'error');
        closeModal();
        await loadData();
        return;
      }

      toast(isNew ? 'הרשומה נוספה' : 'הרשומה עודכנה', 'success');
      closeModal();
      await loadData();
      readNewUploads(uploaded, recordId);
      if (config.afterSave) config.afterSave({ id: recordId, payload, isNew }, api);
    } catch (err) {
      console.error(err);
      showMsg(formMsg, 'שגיאה: ' + err.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  // New attachments are read in the background, so the documents become the record's source
  // without anyone waiting or typing. If the page is closed first, the record offers to read
  // them later ("קריאת המסמכים שעוד לא נקראו"). What they say then fills the record's fields
  // that are still empty (a lab report's strengths) — never one that already has a value.
  async function readNewUploads(uploaded, recordId) {
    if (!config.docInsights || typeof sgpExtractFile !== 'function') return;
    const todo = uploaded.filter(u => !u.extracted && u.docType !== 'photo' && SGP_READABLE_RE.test(u.file.name));
    if (!todo.length) return;
    toast(todo.length === 1 ? 'קורא ברקע את המסמך שצורף...' : `קורא ברקע ${todo.length} מסמכים שצורפו...`);
    const read = [];
    for (const u of todo) {
      try {
        const extracted = await sgpExtractFile(u.file);
        const { error } = await sb.from('documents').update({ extracted, extracted_at: new Date().toISOString() })
          .eq('id', u.id).is('extracted', null);
        if (error) throw error;
        read.push(extracted);
      } catch (err) { console.error('reading a new document failed', u.file.name, err); }
    }
    if (!read.length) return;
    const filled = await autoFillRecord(recordId, read);
    toast((read.length === 1 ? 'המסמך שצורף נקרא' : `${read.length} מסמכים שצורפו נקראו`)
      + (filled.length ? ` · מולא ברשומה: ${filled.join(', ')}` : ''), 'success');
    await loadData();
  }
  async function autoFillRecord(recordId, extractedList) {
    if (typeof sgpAutoFill !== 'function') return [];
    try { return await sgpAutoFill(config.table, recordId, extractedList, user.id); }
    catch (err) { console.error('auto-fill failed', err); return []; }
  }

  async function deleteRow(id) {
    // Warn when the record still carries attachments: deleting it leaves those
    // files in the system but detached, with no record to reach them from.
    const docCount = state.docCounts[id] || 0;
    let question;
    if (docCount) {
      question = `לרשומה זו מצורפים ${docCount} מסמכים.\n\nמחיקת הרשומה תנתק אותם — הקבצים יישארו במערכת (ויופיעו בעמוד הדוחות), אך לא ניתן יהיה להגיע אליהם דרך שום רשומה.\n\nלמחוק בכל זאת? הפעולה אינה הפיכה.`;
    } else if (state.docCountsKnown === false) {
      question = 'לא ניתן היה לבדוק אם מצורפים לרשומה מסמכים.\n\nאם יש כאלה, מחיקת הרשומה תנתק אותם.\n\nלמחוק בכל זאת? הפעולה אינה הפיכה.';
    } else {
      question = 'למחוק את הרשומה? הפעולה אינה הפיכה.';
    }
    if (!confirm(question)) return;
    const { error } = await sb.from(config.table).delete().eq('id', id);
    if (error) { toast('שגיאה במחיקה: ' + error.message, 'error'); return; }
    toast('הרשומה נמחקה', 'success');
    await loadData();
  }

  async function quickToggle(id) {
    const qt = config.quickToggle;
    if (!qt) return;
    const row = state.rows.find(r => r.id === id);
    if (!row) return;
    const newValue = !row[qt.key];
    // Same optimistic lock as the edit form: `row` comes from the last load and may be
    // stale, so only flip the value if nobody else has touched the record since.
    let tq = sb.from(config.table)
      .update({ [qt.key]: newValue, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', id).select('id');
    tq = row.updated_at ? tq.eq('updated_at', row.updated_at) : tq.is('updated_at', null);
    const { data: toggled, error } = await tq;
    if (error) { toast('שגיאה: ' + error.message, 'error'); return; }
    if (!toggled || !toggled.length) {
      toast('הרשומה עודכנה בינתיים על ידי משתמש אחר — רועננו הנתונים, נסו שוב', 'error');
      await loadData();
      return;
    }
    toast(newValue ? qt.trueToast : qt.falseToast, 'success');
    await loadData();
  }

  const filterToggle = document.getElementById('filterToggle');
  const filterPanel = document.getElementById('filterPanel');
  filterToggle?.addEventListener('click', () => filterPanel.classList.toggle('open'));

  document.getElementById('filterApply')?.addEventListener('click', () => {
    state.filters.from = document.getElementById('filterFrom').value || null;
    state.filters.to = document.getElementById('filterTo').value || null;
    loadData();
  });
  document.getElementById('filterClear')?.addEventListener('click', () => {
    document.getElementById('filterFrom').value = '';
    document.getElementById('filterTo').value = '';
    state.filters = {};
    loadData();
  });

  // what a page's own code can use (stage bar, checklists, "open a non-conformance"…)
  const api = {
    get rows() { return state.rows; },
    get editingId() { return state.editingId; },
    get docCounts() { return state.docCounts; },
    reload: loadData,
    openModal,
    setRowFilter(fn) { state.rowFilter = fn || null; renderTable(); },
    site, user, profile,
  };
  window.sgpCrud = api;

  buildForm();
  await loadData();
  // ?open=<id> (from the dashboard) opens that record
  const openId = new URLSearchParams(location.search).get('open');
  if (openId && state.rows.some(r => r.id === openId)) openModal(openId);
}
