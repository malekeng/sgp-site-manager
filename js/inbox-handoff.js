// "דואר נכנס" (2026-11-04): fetching a file that came by email, and handing it to a page that
// makes a new record from it ("רשומה חדשה"). The file is read through the inbox-file function,
// which signs a 5-minute link only for a file this person may see.

async function inboxFetchFile(row) {
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(SUPABASE_FUNCTIONS_URL + '/inbox-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify({ file_id: row.id }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.url) throw new Error('הקובץ לא נטען — נסו שוב בעוד רגע');
  const blob = await (await fetch(out.url)).blob();
  return new File([blob], row.file_name || 'file', { type: row.mime_type || blob.type || 'application/octet-stream' });
}

// ---- "רשומה חדשה": a page that makes records opens with #inbox=<file id> ----------------------
let inboxHandoffFile = null;   // { id, file_name } while a new record is being made from an inbox file

function inboxHandoffPending(h) { inboxHandoffFile = h; }

// Opens "הוספה" with the file already read into the form (the page's own handleOcrFile) and
// waiting in the attach zone. Waits for initCrudPage, which sets window.sgpCrud.
async function inboxHandoff({ onFile }) {
  const m = location.hash.match(/^#inbox=([0-9a-f-]{36})$/i);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  for (let i = 0; i < 100 && !window.sgpCrud; i++) await new Promise(r => setTimeout(r, 100));
  if (!window.sgpCrud) return;
  const { data: row } = await sb.from('inbox_files').select('id, file_name, mime_type, status, extracted').eq('id', m[1]).maybeSingle();
  if (!row || !['new', 'read'].includes(row.status)) { toast('הקובץ מ"דואר נכנס" לא נמצא, או שכבר טופל', 'error'); return; }
  try {
    const file = await inboxFetchFile(row);
    window.sgpCrud.openModal(null);
    inboxHandoffPending({ id: row.id, file_name: file.name });
    await onFile(file, row);
  } catch (err) {
    toast(err.message, 'error');
  }
}

// After "שמירה" (the page's afterSave): the document just uploaded to this record with the inbox
// file's name is that file — the newest one, so an older copy is never taken.
async function inboxHandoffSaved({ id }) {
  if (!inboxHandoffFile) return;
  const h = inboxHandoffFile;
  inboxHandoffFile = null;
  const { data: docs } = await sb.from('documents').select('id, file_name, created_at')
    .eq('linked_record_id', id).order('created_at', { ascending: false });
  const doc = (docs || []).find(d => d.file_name === h.file_name);
  if (!doc) return;   // saved without the file ("לא לצרף")
  const { error } = await sb.rpc('inbox_mark_attached', { p_file: h.id, p_document: doc.id });
  if (error) toast('הרשומה נשמרה, אך הסימון ב"דואר נכנס" לא נשמר', 'error');
  else toast('הקובץ מ"דואר נכנס" צורף לרשומה', 'success');
}
