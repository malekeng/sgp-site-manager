// ===== Reusable "attach document/image" widget =====
// Usage: const attach = createAttachWidget(containerEl);
//   attach.getFiles() -> File[]
//   attach.clear()
//   after the parent record is inserted and you have its id + table name:
//   await attach.upload({ siteId, table: 'concrete_pours', recordId, userId })

function createAttachWidget(container) {
  let files = [];

  container.innerHTML = `
    <div class="field full">
      <label>מסמכים / תמונות (אופציונלי)</label>
      <div class="attach-zone" tabindex="0">
        <div id="attachZoneLabel">📎 גררו קבצים לכאן או לחצו לבחירה — ניתן לבחור כמה קבצים ביחד</div>
        <div style="font-size:11px;margin-top:4px;">תמונות, PDF, Word — עד 10MB לקובץ</div>
      </div>
      <input type="file" multiple accept="image/*,.pdf,.doc,.docx" style="display:none;">
      <div class="attach-list"></div>
    </div>
  `;

  const zone = container.querySelector('.attach-zone');
  const zoneLabel = container.querySelector('#attachZoneLabel');
  const input = container.querySelector('input[type=file]');
  const list = container.querySelector('.attach-list');

  function render() {
    zoneLabel.textContent = files.length
      ? `📎 ${files.length} קבצים נבחרו — לחצו כאן להוספת עוד`
      : '📎 גררו קבצים לכאן או לחצו לבחירה — ניתן לבחור כמה קבצים ביחד';
    list.innerHTML = files.map((f, i) => `
      <div class="attach-item">
        <span>${f.name.length > 34 ? f.name.slice(0, 31) + '…' : f.name} (${(f.size / 1024).toFixed(0)}KB)</span>
        <button type="button" class="remove" data-i="${i}">✕</button>
      </div>
    `).join('');
    list.querySelectorAll('.remove').forEach(btn => {
      btn.addEventListener('click', () => {
        files.splice(Number(btn.dataset.i), 1);
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
      files.push(f);
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
    getFiles: () => files,
    clear: () => { files = []; render(); },
    async upload({ siteId, table, recordId, userId }) {
      for (const file of files) {
        const ext = file.name.split('.').pop();
        const path = `${siteId}/${table}/${recordId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await sb.storage.from('documents').upload(path, file);
        if (upErr) throw upErr;
        const { error: dbErr } = await sb.from('documents').insert({
          site_id: siteId,
          doc_type: 'other',
          title: file.name,
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          linked_table: table,
          linked_record_id: recordId,
          uploaded_by: userId,
        });
        if (dbErr) throw dbErr;
      }
    }
  };
}

// Loads & renders attached documents for a given record (read-only badge + list in a popover/modal).
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
