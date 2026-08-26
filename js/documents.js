// ===== Reusable "attach document/image" widget =====
// Usage: const attach = createAttachWidget(containerEl);
//   attach.getFiles() -> {file, docType}[]
//   attach.clear()
//   after the parent record is inserted and you have its id + table name:
//   await attach.upload({ siteId, table: 'concrete_pours', recordId, userId })
//
// options.docType: if set (e.g. rebar's 'order' / 'delivery_note' slots), every file
//   in this widget is tagged with that fixed type -- no per-file selector shown.
// If not set, each attached file gets its own type dropdown (default guessed from
//   the file extension: images -> 'photo', everything else -> 'other').

const DOC_TYPE_OPTIONS = [
  { value: 'photo', label: 'תמונה' },
  { value: 'delivery_note', label: 'תעודת משלוח' },
  { value: 'order', label: 'הזמנה' },
  { value: 'lab_report', label: 'דוח / אישור מעבדה' },
  { value: 'drawing', label: 'תוכנית / שרטוט' },
  { value: 'other', label: 'אחר' },
];

function isImageFileName(name) {
  return /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(name || '');
}

function createAttachWidget(container, options = {}) {
  const label = options.label || 'מסמכים / תמונות (אופציונלי)';
  const fixedDocType = options.docType || null;
  let entries = []; // { file, docType }

  container.innerHTML = `
    <div class="field full">
      <label>${label}</label>
      <div class="attach-zone" tabindex="0">
        <div id="attachZoneLabel">📎 גררו קבצים לכאן או לחצו לבחירה — ניתן לבחור כמה קבצים ביחד</div>
        <div style="font-size:11px;margin-top:4px;">תמונות, PDF, Word — עד 10MB לקובץ</div>
      </div>
      <input type="file" multiple accept="image/*,.pdf,.doc,.docx" style="display:none;">
      <div class="attach-list"></div>
      <div class="upload-progress" id="uploadProgress" hidden>
        <div class="upload-progress-track">
          <div class="upload-progress-fill" id="uploadProgressFill"></div>
        </div>
        <div class="upload-progress-text" id="uploadProgressText">מעלה קבצים... 0%</div>
      </div>
    </div>
  `;

  const zone = container.querySelector('.attach-zone');
  const zoneLabel = container.querySelector('#attachZoneLabel');
  const input = container.querySelector('input[type=file]');
  const list = container.querySelector('.attach-list');
  const progressEl = container.querySelector('#uploadProgress');
  const progressFill = container.querySelector('#uploadProgressFill');
  const progressText = container.querySelector('#uploadProgressText');

  function setProgress(pct, label) {
    progressEl.hidden = false;
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    progressFill.style.width = p + '%';
    progressText.textContent = label || (`מעלה קבצים... ${p}%`);
  }

  function hideProgress() {
    progressEl.hidden = true;
    progressFill.style.width = '0%';
  }

  function render() {
    zoneLabel.textContent = entries.length
      ? `📎 ${entries.length} קבצים נבחרו — לחצו כאן להוספת עוד`
      : '📎 גררו קבצים לכאן או לחצו לבחירה — ניתן לבחור כמה קבצים ביחד';

    list.innerHTML = entries.map((entry, i) => {
      const f = entry.file;
      const shortName = f.name.length > 30 ? f.name.slice(0, 27) + '…' : f.name;
      const typeSelect = fixedDocType ? '' : `
        <select class="attach-type-select" data-i="${i}" style="font-size:12px;padding:4px 8px;border-radius:8px;border:1px solid var(--border);background:var(--sheet);">
          ${DOC_TYPE_OPTIONS.map(o => `<option value="${o.value}" ${o.value === entry.docType ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>`;
      const isDeliveryNote = entry.docType === 'delivery_note';
      const dateInput = isDeliveryNote ? `
        <span style="display:flex;align-items:center;gap:4px;">
          <label style="font-size:11px;color:var(--steel);white-space:nowrap;">תאריך קבלה:</label>
          <input type="date" class="attach-date" data-i="${i}" value="${entry.documentDate || ''}" style="font-size:12px;padding:4px 8px;border-radius:8px;border:1px solid var(--border);background:var(--sheet);">
        </span>` : '';
      return `
        <div class="attach-item" style="flex-wrap:wrap;gap:6px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" class="attach-select" data-i="${i}" ${entry.selected !== false ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--green);cursor:pointer;">
            <span style="${entry.selected === false ? 'color:var(--steel);text-decoration:line-through;' : ''}">${shortName} (${(f.size / 1024).toFixed(0)}KB)</span>
          </label>
          <span style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            ${typeSelect}
            ${dateInput}
            <button type="button" class="remove" data-i="${i}">✕</button>
          </span>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.attach-date').forEach(inp => {
      inp.addEventListener('change', () => {
        entries[Number(inp.dataset.i)].documentDate = inp.value || null;
      });
    });
    list.querySelectorAll('.attach-select').forEach(cb => {
      cb.addEventListener('change', () => {
        entries[Number(cb.dataset.i)].selected = cb.checked;
        render();
      });
    });
    list.querySelectorAll('.remove').forEach(btn => {
      btn.addEventListener('click', () => {
        entries.splice(Number(btn.dataset.i), 1);
        render();
      });
    });
    list.querySelectorAll('.attach-type-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const entry = entries[Number(sel.dataset.i)];
        entry.docType = sel.value;
        if (entry.docType === 'delivery_note' && !entry.documentDate) {
          entry.documentDate = new Date().toISOString().slice(0, 10);
        }
        render();
      });
    });
  }

  function addFiles(fileList) {
    for (const f of fileList) {
      if (f.size > 10 * 1024 * 1024) {
        toast(`הקובץ ${f.name} גדול מ-10MB ולא נוסף`, 'error');
        continue;
      }
      const guessedType = fixedDocType || (isImageFileName(f.name) ? 'photo' : 'other');
      const defaultDate = guessedType === 'delivery_note' ? new Date().toISOString().slice(0, 10) : null;
      entries.push({ file: f, docType: guessedType, selected: true, documentDate: defaultDate });
    }
    render();
  }

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', e => { if (e.key === 'Enter') input.click(); });
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    addFiles(e.dataTransfer.files);
  });

  return {
    getFiles: () => entries,
    clear: () => { entries = []; hideProgress(); render(); },
    addFile: (file) => addFiles([file]),
    async upload({ siteId, table, recordId, userId }) {
      const toUpload = entries.filter(e => e.selected !== false);
      if (!toUpload.length) return;
      const total = toUpload.length;
      setProgress(0, `מעלה קובץ 1 מתוך ${total}...`);

      for (let i = 0; i < toUpload.length; i++) {
        const { file, docType, documentDate } = toUpload[i];
        const pctStart = (i / total) * 100;
        setProgress(pctStart, `מעלה: ${file.name.length > 28 ? file.name.slice(0, 25) + '…' : file.name} (${i + 1}/${total})`);

        const ext = file.name.split('.').pop();
        const path = `${siteId}/${table}/${recordId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await sb.storage.from('documents').upload(path, file);
        if (upErr) throw upErr;

        const { error: dbErr } = await sb.from('documents').insert({
          site_id: siteId,
          doc_type: docType || fixedDocType || 'other',
          document_date: documentDate || null,
          title: file.name,
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          linked_table: table,
          linked_record_id: recordId,
          uploaded_by: userId,
        });
        if (dbErr) throw dbErr;

        setProgress(((i + 1) / total) * 100, i + 1 === total ? 'ההעלאה הושלמה' : `הועלה ${i + 1} מתוך ${total}`);
      }

      await new Promise(r => setTimeout(r, 350));
      hideProgress();
    }
  };
}

async function loadRecordDocuments(table, recordId) {
  const { data, error } = await sb
    .from('documents')
    .select('*')
    .eq('linked_table', table)
    .eq('linked_record_id', recordId)
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
}

async function getDocumentUrl(filePath) {
  const { data, error } = await sb.storage.from('documents').createSignedUrl(filePath, 3600);
  if (error) { console.error(error); return null; }
  return data.signedUrl;
}
