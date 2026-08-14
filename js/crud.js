// ===== Generic CRUD page engine =====
// config = {
//   table, activePage, title,
//   dateField,                          // field used for the date filter panel
//   columns: [{key,label,type:'text'|'number'|'date',digits}],
//   formFields: [{key,label,type:'text'|'number'|'date'|'select',required,options,step}],
//   orderBy: {column, ascending}
// }
async function initCrudPage(config) {
  const auth = await requireAuth(config.activePage);
  if (!auth) return;
  const { user, profile, site } = auth;

  const state = { rows: [], docCounts: {}, editingId: null, filters: {} };

  document.getElementById('pageTitle').textContent = config.title;

  const attachHost = document.getElementById('attachHost');
  const attachWidget = attachHost ? createAttachWidget(attachHost) : null;

  async function loadData() {
    let q = sb.from(config.table).select('*').eq('site_id', site.id);
    if (state.filters.from) q = q.gte(config.dateField, state.filters.from);
    if (state.filters.to) q = q.lte(config.dateField, state.filters.to);
    q = q.order((config.orderBy && config.orderBy.column) || config.dateField, {
      ascending: (config.orderBy && config.orderBy.ascending) ?? false,
    });
    const { data, error } = await q;
    if (error) { toast('שגיאה בטעינת נתונים: ' + error.message, 'error'); return; }
    state.rows = data || [];

    // doc counts
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
      ? fmtDate(state.rows.map(r => r.created_at).sort().slice(-1)[0])
      : '—';
    host.innerHTML = `
      <div class="stat-card"><div class="label">סה"כ רשומות</div><div class="value">${state.rows.length}</div></div>
      <div class="stat-card"><div class="label">עודכן לאחרונה</div><div class="value" style="font-size:20px;">${lastUpdated}</div></div>
    `;
  }

  function renderTable() {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    thead.innerHTML = '<tr>' + config.columns.map(c => `<th>${c.label}</th>`).join('') + '<th>מסמכים</th><th></th></tr>';

    if (!state.rows.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="${config.columns.length + 2}">אין רשומות עדיין</td></tr>`;
      return;
    }

    tbody.innerHTML = state.rows.map(row => {
      const cells = config.columns.map(c => {
        const v = row[c.key];
        let out = '—';
        if (v !== null && v !== undefined && v !== '') {
          if (c.type === 'date') out = fmtDate(v);
          else if (c.type === 'number') out = fmtNum(v, c.digits ?? 2);
          else out = String(v);
        }
        return `<td>${out}</td>`;
      }).join('');
      const docCount = state.docCounts[row.id] || 0;
      const docCell = docCount
        ? `<td><span class="doc-badge" data-docs="${row.id}">📎 ${docCount}</span></td>`
        : `<td style="color:var(--text-mute);">—</td>`;
      return `
        <tr>
          ${cells}
          ${docCell}
          <td class="row-actions">
            <button class="icon-btn" data-edit="${row.id}" title="עריכה">✏️</button>
            <button class="icon-btn danger" data-del="${row.id}" title="מחיקה">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('[data-edit]').forEach(btn =>
      btn.addEventListener('click', () => openModal(btn.dataset.edit)));
    tbody.querySelectorAll('[data-del]').forEach(btn =>
      btn.addEventListener('click', () => deleteRow(btn.dataset.del)));
    tbody.querySelectorAll('[data-docs]').forEach(btn =>
      btn.addEventListener('click', () => showDocsPopup(btn.dataset.docs)));
  }

  async function showDocsPopup(recordId) {
    const docs = await loadRecordDocuments(config.table, recordId);
    if (!docs.length) return;
    const lines = await Promise.all(docs.map(async d => {
      const url = await getDocumentUrl(d.file_path);
      return `<div class="attach-item"><span>${d.file_name}</span>${url ? `<a href="${url}" target="_blank" class="btn btn-sm btn-outline">פתח</a>` : ''}</div>`;
    }));
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop open';
    backdrop.innerHTML = `<div class="modal"><h3>מסמכים מצורפים</h3><div class="attach-list">${lines.join('')}</div>
      <div class="modal-actions"><button class="btn btn-outline" id="closeDocsPopup">סגירה</button></div></div>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
    backdrop.querySelector('#closeDocsPopup').addEventListener('click', () => backdrop.remove());
  }

  // ===== Modal / form =====
  const modalBackdrop = document.getElementById('modalBackdrop');
  const formEl = document.getElementById('recordForm');
  const modalTitle = document.getElementById('modalTitle');
  const formMsg = document.getElementById('formMsg');

  function buildForm() {
    const grid = document.getElementById('formGrid');
    grid.innerHTML = config.formFields.map(f => {
      const full = f.full ? ' full' : '';
      if (f.type === 'select') {
        return `<div class="field${full}"><label>${f.label}${f.required ? ' *' : ''}</label>
          <select name="${f.key}" ${f.required ? 'required' : ''}>
            <option value="">בחר...</option>
            ${f.options.map(o => `<option value="${o}">${o}</option>`).join('')}
          </select></div>`;
      }
      if (f.type === 'textarea') {
        return `<div class="field${full}"><label>${f.label}${f.required ? ' *' : ''}</label>
          <textarea name="${f.key}" rows="2" ${f.required ? 'required' : ''}></textarea></div>`;
      }
      return `<div class="field${full}"><label>${f.label}${f.required ? ' *' : ''}</label>
        <input type="${f.type}" name="${f.key}" ${f.step ? `step="${f.step}"` : ''} ${f.required ? 'required' : ''}></div>`;
    }).join('');
  }

  function openModal(id) {
    state.editingId = id || null;
    modalTitle.textContent = id ? 'עריכת רשומה' : 'הוספת רשומה';
    formEl.reset();
    hideMsg(formMsg);
    if (attachWidget) attachWidget.clear();

    if (id) {
      const row = state.rows.find(r => r.id === id);
      config.formFields.forEach(f => {
        const el = formEl.querySelector(`[name="${f.key}"]`);
        if (el && row[f.key] !== null && row[f.key] !== undefined) el.value = row[f.key];
      });
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
      if (v === '') v = null;
      if (v !== null && f.type === 'number') v = Number(v);
      payload[f.key] = v;
    });

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

      if (attachWidget && attachWidget.getFiles().length) {
        await attachWidget.upload({ siteId: site.id, table: config.table, recordId, userId: user.id });
      }

      toast(state.editingId ? 'הרשומה עודכנה' : 'הרשומה נוספה', 'success');
      closeModal();
      await loadData();
    } catch (err) {
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

  // ===== Filter panel =====
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
