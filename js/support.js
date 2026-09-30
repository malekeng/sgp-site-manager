// ===== Support requests — shared by support.html and the operator's card in platform-admin =====
// A request (support_tickets) is a thread of messages (support_messages). Only its author and
// the platform operator can see it; the database enforces that, this file only draws it.

const SUPPORT_CATEGORIES = ['תקלה', 'שאלה', 'הצעה לשיפור', 'גישה והרשאות', 'פרטיות ומידע אישי'];
const SUPPORT_STATUS_CLASS = { 'פתוחה': 'st-open', 'נענתה': 'st-answered', 'סגורה': 'st-closed' };
const SUPPORT_MAX_FILES = 3;
const SUPPORT_MAX_BYTES = 10 * 1024 * 1024;
const SUPPORT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'application/pdf'];
const SUPPORT_EMAIL = 'malek.pg@hotmail.com';

function supportEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Some phones hand over a photo with an empty type, so the name decides when the type is missing.
const SUPPORT_TYPE_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
                              gif: 'image/gif', heic: 'image/heic', heif: 'image/heic', pdf: 'application/pdf' };
function supportContentType(file) {
  if (file.type) return file.type;
  const ext = String(file.name || '').split('.').pop().toLowerCase();
  return SUPPORT_TYPE_BY_EXT[ext] || '';
}

// null when the files can be sent, otherwise the reason, for the form.
function supportCheckFiles(files) {
  const list = Array.from(files || []);
  if (list.length > SUPPORT_MAX_FILES) return `אפשר לצרף עד ${SUPPORT_MAX_FILES} קבצים`;
  for (const f of list) {
    if (f.size > SUPPORT_MAX_BYTES) return `הקובץ ${f.name} גדול מ-10MB`;
    if (!SUPPORT_TYPES.includes(supportContentType(f))) return `הקובץ ${f.name} אינו תמונה או PDF`;
  }
  return null;
}

// Camera photos are often 10MB and more. Before upload they are redrawn at most
// SUPPORT_IMAGE_MAX_SIDE pixels on the long side, which keeps a screenshot or a photo of
// a defect perfectly readable at a fraction of the size.
const SUPPORT_IMAGE_MAX_SIDE = 2400;
const SUPPORT_SHRINK_ABOVE = 1.5 * 1024 * 1024;

function supportScaledSize(w, h, max = SUPPORT_IMAGE_MAX_SIDE) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

function supportNeedsShrink(file) {
  const type = supportContentType(file);
  return type.startsWith('image/') && type !== 'image/gif' && file.size > SUPPORT_SHRINK_ABOVE;
}

// Storage keys must be plain ASCII, so a Hebrew name keeps only its extension and any Latin
// letters or digits; the time and a random part keep keys unique.
function supportObjectName(fileName, now = Date.now(), rand = Math.random().toString(36).slice(2, 8)) {
  const name = String(fileName || '');
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) : '';
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${now}_${rand}${base ? '_' + base : ''}${ext ? '.' + ext : ''}`;
}

function supportFileLabel(path, index = 0) {
  const last = String(path).split('/').pop();
  const m = last.match(/^\d+_[a-z0-9]+(?:_([^.]*))?(\.[a-z0-9]+)?$/);
  if (!m) return last;
  return `${m[1] || 'קובץ ' + (index + 1)}${m[2] || ''}`;
}

// Technical details sent with a new request. Shown to the user before sending.
function supportContext({ page, orgName, siteName, userName, email, appVersion } = {},
                        env = (typeof navigator !== 'undefined'
                          ? { ua: navigator.userAgent, w: screen.width, h: screen.height, lang: navigator.language } : {})) {
  return {
    page: page || null, org: orgName || null, site: siteName || null,
    user: userName || null, email: email || null,
    browser: env.ua ? String(env.ua).slice(0, 300) : null,
    screen: env.w ? `${env.w}×${env.h}` : null,
    lang: env.lang || null, app: appVersion || null,
  };
}

const SUPPORT_CONTEXT_LABELS = { page: 'דף', org: 'חברה', site: 'אתר', user: 'שם', email: 'דוא״ל',
                                 browser: 'דפדפן', screen: 'מסך', lang: 'שפה', app: 'גרסה' };
function supportContextHtml(ctx) {
  return `<dl class="sp-ctx">${Object.entries(SUPPORT_CONTEXT_LABELS)
    .filter(([k]) => ctx && ctx[k])
    .map(([k, label]) => `<dt>${label}</dt><dd>${supportEsc(ctx[k])}</dd>`).join('')}</dl>`;
}

function supportTime(iso) {
  return new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function supportThreadHtml(messages, { viewerIsOperator = false, fileUrls = {}, requesterName = '' } = {}) {
  return (messages || []).map(m => {
    const mine = viewerIsOperator ? m.from_operator : !m.from_operator;
    const who = m.from_operator ? 'צוות TADOK' : (viewerIsOperator ? (requesterName || 'הפונה') : 'אני');
    const files = (m.attachment_paths || []).map((p, i) => fileUrls[p]
      ? `<a href="${supportEsc(fileUrls[p])}" target="_blank" rel="noopener">${supportEsc(supportFileLabel(p, i))}</a>`
      : `<span>${supportEsc(supportFileLabel(p, i))}</span>`).join('');
    return `<div class="sp-msg${mine ? ' mine' : ''}${m.from_operator ? ' op' : ''}">
      <div class="sp-msg-head"><strong>${supportEsc(who)}</strong><time>${supportEsc(supportTime(m.created_at))}</time></div>
      <div class="sp-msg-body">${supportEsc(m.body).replace(/\n/g, '<br>')}</div>
      ${files ? `<div class="sp-msg-files">${files}</div>` : ''}
    </div>`;
  }).join('');
}

// ---- browser-only ----

function supportLoadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

// A photo the browser cannot decode (HEIC on some desktops) is sent as it is.
async function supportShrinkImage(file) {
  let img;
  try { img = await supportLoadImage(file); } catch (_) { return file; }
  const { w, h } = supportScaledSize(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
  if (!blob || blob.size >= file.size) return file;
  const base = String(file.name || '').replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], base + '.jpg', { type: 'image/jpeg' });
}

async function supportPrepareFiles(files) {
  const out = [];
  for (const f of Array.from(files || [])) out.push(supportNeedsShrink(f) ? await supportShrinkImage(f) : f);
  return out;
}

// ---- browser-only: talk to the database ----

async function supportAppVersion() {
  try { const keys = await caches.keys(); return keys.find(k => /^sgp-v\d+$/.test(k)) || null; } catch (_) { return null; }
}

async function supportUpload(ownerId, ticketId, files) {
  const paths = [];
  for (const f of Array.from(files || [])) {
    const path = `${ownerId}/${ticketId}/${supportObjectName(f.name)}`;
    const { error } = await sb.storage.from('support').upload(path, f, { contentType: supportContentType(f), upsert: false });
    if (error) throw new Error('העלאת הקובץ נכשלה: ' + error.message);
    paths.push(path);
  }
  return paths;
}

async function supportOpenTicket({ userId, category, subject, body, files, organizationId, siteId, context }) {
  const id = crypto.randomUUID();
  const paths = await supportUpload(userId, id, files);
  const { error } = await sb.rpc('support_open_ticket', {
    p_id: id, p_category: category, p_subject: subject, p_body: body, p_context: context,
    p_organization_id: organizationId || null, p_site_id: siteId || null, p_attachments: paths,
  });
  if (error) throw new Error(error.message);
  return id;
}

async function supportReply(ticket, body, files) {
  const paths = await supportUpload(ticket.user_id, ticket.id, files);
  const { error } = await sb.from('support_messages').insert({ ticket_id: ticket.id, body, attachment_paths: paths });
  if (error) throw new Error(error.message);
}

async function supportSetStatus(ticketId, status) {
  const { data, error } = await sb.from('support_tickets').update({ status }).eq('id', ticketId).select('id');
  if (error) throw new Error(error.message);
  if (!data || !data.length) throw new Error('אין הרשאה');
}

// The database replaces the time with its own clock; any value marks it read.
async function supportMarkSeen(ticketId, asOperator) {
  const now = new Date().toISOString();
  await sb.from('support_tickets').update(asOperator ? { operator_seen_at: now } : { user_seen_at: now }).eq('id', ticketId);
}

async function supportLoadThread(ticketId) {
  const { data, error } = await sb.from('support_messages').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const paths = (data || []).flatMap(m => m.attachment_paths || []);
  const fileUrls = {};
  if (paths.length) {
    const { data: signed } = await sb.storage.from('support').createSignedUrls(paths, 3600);
    (signed || []).forEach(s => { if (s.signedUrl) fileUrls[s.path] = s.signedUrl; });
  }
  return { messages: data || [], fileUrls };
}
