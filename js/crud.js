// ===== Generic CRUD page engine =====

// Styled "add note" modal, built dynamically so any page can use it without
// needing its own static HTML. Replaces the native prompt() dialog.
function openAppendNoteModal(textarea) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop open';
  backdrop.innerHTML = `
    <div class="modal">
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
      <button type="button" class="icon-btn" id="closeAppendNoteBtn" style="position:absolute;top:18px;left:18px;">✕</button>
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

  const state = { rows: [], docCounts: {}, editingId: null, filters: {}, profileNames: {} };

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
    const { data } = await sb.from('profiles').select('id, full_name, username, email').in('id', missing);
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
    if (state.filters.from) q = q.gte(config.dateField, state.filters.from);
    if (state.filters.to) q = q.lte(config.dateField, state.filters.to);
    q = q.order((config.orderBy && config.orderBy.column) || config.dateField, {
      ascending: (config.orderBy && config.orderBy.ascending) ?? false,
      nullsFirst: false,
    });
    q = q.order('created_at', { ascending: false }); // stable tie-breaker when the primary date repeats
    const { data, error } = await q;
    if (error) { toast('שגיאה בטעינת נתונים: ' + error.message, 'error'); return; }
    state.rows = data || [];

    await resolveProfileNames(state.rows);

    if (state.rows.length) {
      const ids = state.rows.map(r => r.id);
      const { data: docs } = await sb
        .from('documents')
        .select('linked_record_id')
        .eq('linked_table', config.table)
        .in('linked_record_id', ids);
      state.docCounts = {};
      (docs || []).forEach(d => {
        state.docCounts[d.linked_record_id] = (state.docCounts[d.linked_record_id] || 0) + 1;
      });
    } else {
      state.docCounts = {};
    }

    renderStats();
    renderTable();
  }

  function renderStats() {
    const host = document.getElementById('statsRow');
    if (!host) return;
    const lastUpdated = state.rows.length
      ? fmtDate(state.rows.map(r => r.updated_at || r.created_at).sort().slice(-1)[0])
      : '—';
    const icon = config.icon || '📋';
    host.innerHTML = `
      <div class="stat-card"><div class="label">${icon} סה\"כ רשומות</div><div class="value">${state.rows.length}</div></div>
      <div class="stat-card"><div class="label">🕒 עודכן לאחרונה</div><div class="value" style="font-size:20px;">${lastUpdated}</div></div>
    `;
  }

  function renderTable() {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    thead.innerHTML = '<tr>' + config.columns.map(c => `<th>${esc(c.label)}</th>`).join('') + '<th>מסמכים</th><th>עודכן</th><th></th></tr>';

    if (!state.rows.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="${config.columns.length + 3}">אין רשומות עדיין</td></tr>`;
      return;
    }

    tbody.innerHTML = state.rows.map(row => {
      const cells = config.columns.map(c => {
        const v = row[c.key];
        let out = '—';
        if (v !== null && v !== undefined && v !== '') {
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
      const docCell = docCount
        ? `<td><span class="doc-badge" data-docs="${row.id}">📎 ${docCount}</span></td>`
        : `<td style="color:var(--steel-light);">—</td>`;
      const whoId = row.updated_by || row.created_by;
      const when = row.updated_at || row.created_at;
      const auditCell = whoId || when
        ? `<td class="audit-cell"><div class="audit-who">${esc(whoId ? (state.profileNames[whoId] || 'משתמש') : '—')}</div><div class="audit-when">${esc(fmtDateTime(when))}</div></td>`
        : `<td style="color:var(--steel-light);">—</td>`;
      const qt = config.quickToggle;
      const toggleBtn = qt
        ? `<button class="icon-btn" data-toggle="${row.id}" title="${row[qt.key] ? qt.trueAction : qt.falseAction}">${row[qt.key] ? qt.trueLabel : qt.falseLabel}</button>`
        : '';
      return `
        <tr>
          ${cells}
          ${docCell}
          ${auditCell}
          <td class="row-actions">
            <div class="row-actions-inner">
              ${toggleBtn}
              <button class="icon-btn" data-edit="${row.id}" title="עריכה">✏️</button>
              <button class="icon-btn danger" data-del="${row.id}" title="מחיקה">🗑️</button>
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
  }

  function isImageFile(name) {
    return /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(name || '');
  }

  function openLightbox(url) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(6,15,53,0.92);z-index:300;display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out;';
    overlay.innerHTML = `<img src="${url}" style="max-width:100%;max-height:100%;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,0.5);">`;
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
            <img src="${esc(d.url)}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;">
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
        <input type="${f.type}" name="${f.key}" ${f.step ? `step="${f.step}"` : ''} ${f.required ? 'required' : ''}></div>`;
    }).join('');

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

    config.formFields.forEach(f => {
      let v = fd.get(f.key);
      if (f.type === 'boolean') { payload[f.key] = (v === (f.trueLabel || 'כן')); return; }

      if (f.type === 'select' && v === 'אחר') {
        v = fd.get(f.key + '__other');
        if (!v || !String(v).trim()) {
          showMsg(formMsg, 'יש להזין ערך בשדה "' + f.label + '"', 'error');
          throw new Error('missing other value');
        }
        v = String(v).trim();
      }

      if (v === '') v = null;
      if (v !== null && (f.type === 'number' || f.numeric)) v = Number(v);
      payload[f.key] = v;
    });

    payload.updated_by = user.id;
    payload.updated_at = new Date().toISOString();

    const submitBtn = formEl.querySelector('[type=submit]');
    submitBtn.disabled = true;

    try {
      let recordId = state.editingId;
      if (state.editingId) {
        const { error } = await sb.from(config.table).update(payload).eq('id', state.editingId);
        if (error) throw error;
      } else {
        payload.created_by = user.id;
        const { data, error } = await sb.from(config.table).insert(payload).select().single();
        if (error) throw error;
        recordId = data.id;
      }

      for (const w of attachWidgets) {
        if (w.getFiles().length) {
          await w.upload({ siteId: site.id, table: config.table, recordId, userId: user.id });
        }
      }

      toast(state.editingId ? 'הרשומה עודכנה' : 'הרשומה נוספה', 'success');
      closeModal();
      await loadData();
    } catch (err) {
      if (err.message === 'missing other value') {
        submitBtn.disabled = false;
        return;
      }
      console.error(err);
      showMsg(formMsg, 'שגיאה: ' + err.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  async function deleteRow(id) {
    if (!confirm('למחוק את הרשומה? הפעולה אינה הפיכה.')) return;
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
    const { error } = await sb.from(config.table)
      .update({ [qt.key]: newValue, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast('שגיאה: ' + error.message, 'error'); return; }
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

  buildForm();
  await loadData();
}
