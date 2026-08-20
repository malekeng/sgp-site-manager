// ===== Reusable "attach document/image" widget =====
// Usage: const attach = createAttachWidget(containerEl);
//   attach.getFiles() -> File[]
//   attach.clear()
//   after the parent record is inserted and you have its id + table name:
//   await attach.upload({ siteId, table: 'concrete_pours', recordId, userId })

function createAttachWidget(container, options = {}) {
  const label = options.label || 'מסמכים / תמונות (אופציונלי)';
  const docType = options.docType || 'other';
  let files = [];

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
    clear: () => { files = []; hideProgress(); render(); },
    async upload({ siteId, table, recordId, userId }) {
      if (!files.length) return;
      const total = files.length;
      setProgress(0, `מעלה קובץ 1 מתוך ${total}...`);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const pctStart = (i / total) * 100;
        setProgress(pctStart, `מעלה: ${file.name.length > 28 ? file.name.slice(0, 25) + '…' : file.name} (${i + 1}/${total})`);

        const ext = file.name.split('.').pop();
        const path = `${siteId}/${table}/${recordId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await sb.storage.from('documents').upload(path, file);
        if (upErr) throw upErr;

        const { error: dbErr } = await sb.from('documents').insert({
          site_id: siteId,
          doc_type: docType,
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
