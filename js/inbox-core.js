// "דואר נכנס" (2026-11-04): documents emailed to a company address ({slug}-{token}@in.tadok.app)
// or a site address (…+{code}@…). Everything between the shared markers is copied word for word
// into the inbound-email Edge Function and the Cloudflare Worker; tests/inbox-*.test.mjs check it.

// ---- shared: inbox-core (word for word in inbound-email and the Worker) ----
const INBOX_DOMAIN = 'in.tadok.app';
// letters and digits that cannot be read as one another (no i l o 0 1)
const INBOX_TOKEN_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const INBOX_MAX_FILE_BYTES = 10 * 1024 * 1024;
const INBOX_MAX_FILES = 20;
// pictures in a signature (logos, icons) are inline and small
const INBOX_INLINE_SKIP_BYTES = 30 * 1024;
// Word, CSV and macro-enabled Excel since 2026-11-17 (shown in the app; macros never run there)
const INBOX_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroenabled.12', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
const INBOX_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'xlsx', 'xls', 'xlsm', 'csv', 'docx', 'doc'];
const INBOX_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const INBOX_TOKEN_RE = /^[abcdefghjkmnpqrstuvwxyz23456789]{6}$/;

// rand(n) gives n random whole numbers
function inboxNewToken(rand) {
  const r = rand(6);
  let t = '';
  for (let i = 0; i < 6; i++) t += INBOX_TOKEN_CHARS[r[i] % INBOX_TOKEN_CHARS.length];
  return t;
}

function inboxAddress(slug, token, siteCode) {
  return `${slug}-${token}${siteCode ? '+' + siteCode : ''}@${INBOX_DOMAIN}`;
}

function inboxValidSiteCode(code) {
  return typeof code === 'string' && /^[a-z0-9][a-z0-9-]{0,18}[a-z0-9]$/.test(code);
}

// the bare address of "Name <a@b.c>", lower case
function inboxBareEmail(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/<([^<>]*)>\s*$/);
  return (m ? m[1] : s).trim().toLowerCase();
}

// "sgp-k7m2qx+atech@in.tadok.app" → { slug: 'sgp', token: 'k7m2qx', siteCode: 'atech' }; anything else → null
function inboxParseAddress(raw) {
  const email = inboxBareEmail(raw);
  const at = email.lastIndexOf('@');
  if (at < 0 || email.slice(at + 1) !== INBOX_DOMAIN) return null;
  const [base, code, extra] = email.slice(0, at).split('+');
  if (extra !== undefined) return null;
  if (code !== undefined && !inboxValidSiteCode(code)) return null;
  const dash = base.lastIndexOf('-');
  if (dash < 1) return null;
  const slug = base.slice(0, dash), token = base.slice(dash + 1);
  if (!INBOX_SLUG_RE.test(slug) || !INBOX_TOKEN_RE.test(token)) return null;
  return { slug, token, siteCode: code === undefined ? null : code };
}

// Short addresses (2026-11-17), no token: "sgp@in.tadok.app" (company), "sgp-atech@…" (site).
// Without the token the sender must be proven (DKIM/DMARC), so only verified mail counts as
// from the company or an approved sender; the long addresses above keep working as before.
function inboxShortAddress(slug, siteCode) {
  return `${slug}${siteCode ? '-' + siteCode : ''}@${INBOX_DOMAIN}`;
}

// Every way to read a short address: the company with that whole slug first, then each split
// into a company slug and a site code (both may hold dashes). [] when it is not one.
function inboxShortCandidates(raw) {
  const email = inboxBareEmail(raw);
  const at = email.lastIndexOf('@');
  if (at < 1 || email.slice(at + 1) !== INBOX_DOMAIN) return [];
  const local = email.slice(0, at);
  const out = [];
  if (INBOX_SLUG_RE.test(local)) out.push({ slug: local, siteCode: null });
  for (let i = local.indexOf('-'); i > 0; i = local.indexOf('-', i + 1)) {
    const slug = local.slice(0, i), code = local.slice(i + 1);
    if (INBOX_SLUG_RE.test(slug) && inboxValidSiteCode(code)) out.push({ slug, siteCode: code });
  }
  return out;
}

// a whole address ("reports@lab.co.il") or a whole domain ("@isotop.co.il")
function inboxValidSenderPattern(p) {
  return typeof p === 'string' && /^([^\s@<>"]+)?@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(p.trim());
}

// member: an address of the company's own people; approved: matches a pattern; else unknown.
// "@isotop.co.il" approves that domain only, not mail.isotop.co.il.
function inboxSenderKind(from, memberEmails, patterns) {
  const email = inboxBareEmail(from);
  if (!email || !email.includes('@')) return 'unknown';
  if ((memberEmails || []).some(m => String(m || '').trim().toLowerCase() === email)) return 'member';
  const domain = email.slice(email.lastIndexOf('@') + 1);
  const ok = (patterns || []).some(p => {
    const q = String(p || '').trim().toLowerCase();
    return q.startsWith('@') ? q.slice(1) === domain : q === email;
  });
  return ok ? 'approved' : 'unknown';
}

// Is the From line proven? auth: { envelope_from, headers: [[position, name, value], …] } as the
// Worker passes it. Only the topmost check result counts, and only if Cloudflare's receiving
// server wrote it (a sender can forge one into its own mail, but below Cloudflare's). Proven =
// DMARC passed for the From domain, or DKIM passed for that domain or a subdomain of it, or SPF
// passed and the envelope sender (Cloudflare's runtime value, not text in the result) is in it.
// Quoted strings and comments are dropped first and only the first dkim= / dmarc= result counts:
// they can carry text the sender chose (an envelope address made to look like "dmarc=pass").
function inboxSenderVerified(auth, from) {
  const email = inboxBareEmail(from);
  const domain = email.slice(email.lastIndexOf('@') + 1);
  if (!domain || !auth || !Array.isArray(auth.headers)) return false;
  const top = auth.headers
    .filter(h => Array.isArray(h) && (h[1] === 'arc-authentication-results' || h[1] === 'authentication-results'))
    .sort((a, b) => a[0] - b[0])[0];
  if (!top) return false;
  const clean = String(top[2] || '').toLowerCase().replace(/"[^"]*"/g, '""').replace(/\([^()]*\)/g, ' ');
  const parts = clean.split(';').map(s => s.trim());
  if (!parts.slice(0, 2).includes('mx.cloudflare.net')) return false;
  const ours = d => !!d && (d === domain || d.endsWith('.' + domain));
  const value = (p, prop) => {
    const v = (p.match(new RegExp(`(?:^|\\s)${prop.replace('.', '\\.')}=([^\\s;]+)`)) || [])[1];
    return v && v.includes('@') ? v.slice(v.lastIndexOf('@') + 1) : v;
  };
  const dmarc = parts.find(p => p.startsWith('dmarc='));
  if (dmarc && /^dmarc=pass\b/.test(dmarc) && value(dmarc, 'header.from') === domain) return true;
  const dkim = parts.find(p => p.startsWith('dkim='));
  if (dkim && /^dkim=pass\b/.test(dkim) && ours(value(dkim, 'header.d'))) return true;
  const envelope = inboxBareEmail(auth.envelope_from);
  const envDomain = envelope.includes('@') ? envelope.slice(envelope.lastIndexOf('@') + 1) : '';
  return ours(envDomain) && parts.some(p => /^spf=pass\b/.test(p) && ours(value(p, 'smtp.mailfrom')));
}

function inboxAccepted(part) {
  const mime = String(part.mimeType || '').toLowerCase();
  const ext = String(part.filename || '').toLowerCase().split('.').pop();
  if (INBOX_TYPES.includes(mime)) return true;
  return (!mime || mime === 'application/octet-stream') && INBOX_EXTENSIONS.includes(ext);
}

// parts: { filename, mimeType, size, disposition } → { keep, skipped: [{ name, reason }] }
function inboxFilterAttachments(parts) {
  const keep = [], skipped = [];
  for (const p of parts || []) {
    const name = p.filename || '';
    const image = /^image\//i.test(p.mimeType || '');
    if (p.disposition === 'inline' && image && (p.size || 0) < INBOX_INLINE_SKIP_BYTES) skipped.push({ name, reason: 'inline' });
    else if (!inboxAccepted(p)) skipped.push({ name, reason: 'type' });
    else if ((p.size || 0) > INBOX_MAX_FILE_BYTES) skipped.push({ name, reason: 'size' });
    else if (keep.length >= INBOX_MAX_FILES) skipped.push({ name, reason: 'count' });
    else keep.push(p);
  }
  return { keep, skipped };
}
// ---- end shared ----

// What the reader found → where it goes: the table to suggest from, the document type, and the
// page that can make a new record from it.
const INBOX_TARGETS = {
  concrete_lab: { table: 'concrete_pours', docType: 'lab_test', page: 'concrete.html' },
  concrete_note: { table: 'concrete_pours', docType: 'delivery_note', page: 'concrete.html' },
  rebar_note: { table: 'rebar_deliveries', docType: 'delivery_note', page: 'rebar.html' },
  rebar_order: { table: 'rebar_deliveries', docType: 'order', page: 'rebar.html' },
  slab_note: { table: 'prestressed_slabs', docType: 'delivery_note', page: 'slabs.html' },
  slab_order: { table: 'prestressed_slabs', docType: 'order', page: 'slabs.html' },
};
function inboxTarget(kind, isImage) {
  const t = INBOX_TARGETS[kind];
  if (t) return { ...t };
  return { table: null, docType: isImage ? 'photo' : 'other', page: null };
}
