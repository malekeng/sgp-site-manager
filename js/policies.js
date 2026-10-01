// ===== Platform documents: the links to them, their versions, and the acceptance gate =====
// Loaded by every page — the app pages (before app.js) and the public ones (sign-in,
// contractor pages, support) — so the links and versions live in exactly one place.

// The platform's own pages, in the order they are shown wherever a page lists them.
const TADOK_LEGAL_LINKS = [
  { href: 'terms.html', label: 'תנאי שימוש' },
  { href: 'privacy.html', label: 'פרטיות' },
  { href: 'dpa.html', label: 'עיבוד מידע' },
  { href: 'support.html', label: 'תמיכה' },
];

// The documents alone, for pages that show their own support link (the contractor pages).
const TADOK_DOCUMENT_LINKS = TADOK_LEGAL_LINKS.filter(l => l.href !== 'support.html');

function tadokLegalLinksHtml(sep = ' <span aria-hidden="true">·</span> ', links = TADOK_LEGAL_LINKS) {
  return links.map(l => `<a href="${l.href}">${l.label}</a>`).join(sep);
}

// The line at the bottom of a page. The platform's name, not the company's: the copyright
// is the operator's, while the company's name stays in the menu and on its own reports.
function tadokFooterHtml(year = new Date().getFullYear()) {
  return `© ${year} TADOK <span aria-hidden="true">·</span> ${tadokLegalLinksHtml()}`;
}

function tadokFillLegalLinks(root = document) {
  root.querySelectorAll('[data-legal-links]').forEach(el => {
    el.innerHTML = tadokLegalLinksHtml(undefined, el.dataset.legalLinks === 'documents' ? TADOK_DOCUMENT_LINKS : TADOK_LEGAL_LINKS);
  });
  root.querySelectorAll('[data-app-footer]').forEach(el => { el.innerHTML = tadokFooterHtml(); });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => tadokFillLegalLinks());
  else tadokFillLegalLinks();
}

// Versions of the documents in force. When a text changes materially, set the new date here
// and in the page's "עודכן לאחרונה" line: every user is then asked to accept again.
const TADOK_POLICY = { terms: '2026-09-30', privacy: '2026-09-30' };

// A material change announced in advance (the terms promise owners 30 days' notice):
// { terms: 'YYYY-MM-DD', privacy: 'YYYY-MM-DD', effective: 'YYYY-MM-DD', summary: 'מה משתנה' }, or null.
const TADOK_POLICY_UPCOMING = null;

function tadokLocalIso(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Which versions must a user have accepted today: the upcoming ones once they take effect.
function tadokRequiredPolicy(today = new Date(), upcoming = TADOK_POLICY_UPCOMING) {
  return upcoming && upcoming.effective <= tadokLocalIso(today)
    ? { terms: upcoming.terms, privacy: upcoming.privacy }
    : { terms: TADOK_POLICY.terms, privacy: TADOK_POLICY.privacy };
}

// Is the user's latest acceptance (a policy_acceptances row, or null) enough?
function tadokAcceptanceIsCurrent(last, required = tadokRequiredPolicy()) {
  return !!last && last.terms_version === required.terms && last.privacy_version === required.privacy;
}

// The advance notice owners see, while a change is announced but not yet in force.
function tadokUpcomingNotice(today = new Date(), upcoming = TADOK_POLICY_UPCOMING) {
  return upcoming && upcoming.effective > tadokLocalIso(today) ? upcoming : null;
}

// Shown once per user, and again whenever the documents change. Resolves true when the user
// accepted or nothing is needed, false when they chose to sign out. A failed read never locks
// anyone out (the check repeats on the next page); a failed write is shown and can be retried.
async function tadokEnsureAccepted(userId, organizationId, signOutTo = 'index.html') {
  const required = tadokRequiredPolicy();
  const { data, error } = await sb.from('policy_acceptances')
    .select('terms_version, privacy_version')
    .eq('user_id', userId).order('accepted_at', { ascending: false }).limit(1);
  if (error) { console.error('policy acceptance check failed:', error); return true; }
  const last = (data && data[0]) || null;
  if (tadokAcceptanceIsCurrent(last, required)) return true;

  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop open';
    wrap.id = 'policyGate';
    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="policyGateTitle">
        <h3 id="policyGateTitle">לפני שממשיכים</h3>
        <p style="font-size:13.5px;line-height:1.7;margin-bottom:12px;">
          השימוש ב-TADOK כפוף ל<a href="terms.html" target="_blank" rel="noopener">תנאי השימוש</a>,
          ל<a href="privacy.html" target="_blank" rel="noopener">מדיניות הפרטיות</a>
          ול<a href="dpa.html" target="_blank" rel="noopener">נספח עיבוד המידע</a>.
          ${last ? 'המסמכים עודכנו מאז שאישרתם אותם.' : ''}
        </p>
        <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;margin-bottom:14px;cursor:pointer;">
          <input type="checkbox" id="policyGateCheck" style="margin-top:3px;flex-shrink:0;">
          <span>קראתי ואני מסכים/ה לתנאי השימוש ולמדיניות הפרטיות.</span>
        </label>
        <div class="msg" id="policyGateMsg"></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-primary" id="policyGateOk" disabled>אישור והמשך</button>
          <button type="button" class="btn btn-outline" id="policyGateOut">יציאה</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const ok = wrap.querySelector('#policyGateOk');
    const msg = wrap.querySelector('#policyGateMsg');
    wrap.querySelector('#policyGateCheck').addEventListener('change', e => { ok.disabled = !e.target.checked; });
    ok.addEventListener('click', async () => {
      ok.disabled = true;
      msg.className = 'msg';
      const { error: insErr } = await sb.from('policy_acceptances').insert({
        user_id: userId,
        organization_id: organizationId || null,
        terms_version: required.terms,
        privacy_version: required.privacy,
        user_agent: String(navigator.userAgent || '').slice(0, 500),
      });
      if (insErr) {
        msg.textContent = 'השמירה נכשלה, נסו שוב: ' + insErr.message;
        msg.className = 'msg show error';
        ok.disabled = false;
        return;
      }
      wrap.remove();
      resolve(true);
    });
    wrap.querySelector('#policyGateOut').addEventListener('click', async () => {
      await sb.auth.signOut();
      resolve(false);
      location.href = signOutTo;
    });
  });
}

// The notice owners see when the operator has scheduled their company's closing
// (organization_closures): the date, the reason, and where to export everything first.
function tadokClosingNoticeHtml(closure) {
  if (!closure) return '';
  const e = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const [y, m, d] = String(closure.closing_on).slice(0, 10).split('-').map(Number);
  return `<strong>החשבון של החברה ייסגר ב-${d}.${m}.${y}.</strong> ${e(closure.reason || '')}
    עד אז הכול עובד כרגיל. כדאי לשמור עותק של כל המידע: <a href="org-settings.html">הגדרות החברה ← ייצוא כל המידע</a>.`;
}

// ---- error reports (app_events) ----
// What an error toast or a script error becomes when reported: the kind (for grouping), the
// message cut to 500 characters, and the page's file name only.
function tadokEventFromError(message, page) {
  const text = String(message || '').trim();
  const kind = /הרשאה|permission|row-level security|42501/i.test(text) ? 'permission'
             : /נכשל/.test(text) ? 'save' : 'other';
  return { kind, message: text.slice(0, 500) || '—', page: String(page || '').split('/').pop().slice(0, 80) };
}

// ---- announcements from the platform operator ----
function tadokActiveAnnouncements(rows, dismissedIds = [], now = Date.now()) {
  return (rows || [])
    .filter(a => Date.parse(a.starts_at) <= now && Date.parse(a.ends_at) > now && !dismissedIds.includes(a.id))
    .sort((x, y) => (x.level === 'warn' ? 0 : 1) - (y.level === 'warn' ? 0 : 1) || Date.parse(y.starts_at) - Date.parse(x.starts_at));
}

function tadokAnnouncementHtml(a) {
  const e = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<div class="tadok-ann ${a.level === 'warn' ? 'warn' : 'info'}" role="status">
    <div><strong>${e(a.title)}</strong>${a.body ? ` <span>${e(a.body)}</span>` : ''}</div>
    <button type="button" class="tadok-ann-x" data-ann-dismiss="${e(a.id)}" aria-label="סגירת ההודעה">×</button>
  </div>`;
}

// Sends one report per distinct message per page load. Never throws and never shows anything:
// reporting is for the operator, the user already saw the error.
const TADOK_REPORTED = new Set();
async function tadokReportError(message, kind = null, details = {}) {
  try {
    const ev = tadokEventFromError(message, location.pathname);
    if (kind) ev.kind = kind;
    if (typeof activeOrg !== 'undefined' && activeOrg && activeOrg.__support) return; // support mode: not the company's error
    const key = ev.kind + '|' + ev.message;
    if (TADOK_REPORTED.has(key) || TADOK_REPORTED.size >= 20) return;
    TADOK_REPORTED.add(key);
    const { data } = await sb.auth.getSession();
    if (!data || !data.session) return;
    const org = typeof activeOrg !== 'undefined' && activeOrg ? activeOrg.id : null;
    await sb.from('app_events').insert({ organization_id: org, page: ev.page, kind: ev.kind, message: ev.message, details });
  } catch (_) { /* the report itself failing must never bother the user */ }
}

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('error', e => { if (e && e.message) tadokReportError(e.message, 'script', { source: String(e.filename || '').split('/').pop(), line: e.lineno || null }); });
  window.addEventListener('unhandledrejection', e => tadokReportError(String(e && e.reason && (e.reason.message || e.reason)), 'script'));
}

// Banner(s) under the header for active announcements. Row security already limits what the
// user can read to everyone's and their own company's; the time window is checked here too.
const TADOK_DISMISSED_KEY = 'tadok_dismissed_announcements';
function tadokDismissed() {
  try { return JSON.parse(localStorage.getItem(TADOK_DISMISSED_KEY) || '[]'); } catch (_) { return []; }
}
async function tadokShowAnnouncements() {
  try {
    const main = document.querySelector('main.page');
    if (!main) return;
    const { data } = await sb.from('platform_announcements')
      .select('id, title, body, level, starts_at, ends_at').order('starts_at', { ascending: false }).limit(20);
    const active = tadokActiveAnnouncements(data || [], tadokDismissed());
    if (!active.length) return;
    const host = document.createElement('div');
    host.id = 'tadokAnnouncements';
    host.innerHTML = active.map(tadokAnnouncementHtml).join('');
    main.prepend(host);
    host.addEventListener('click', e => {
      const id = e.target.closest('[data-ann-dismiss]')?.dataset.annDismiss;
      if (!id) return;
      try { localStorage.setItem(TADOK_DISMISSED_KEY, JSON.stringify([...tadokDismissed(), id].slice(-50))); } catch (_) {}
      e.target.closest('.tadok-ann')?.remove();
    });
  } catch (_) { /* announcements are a convenience; never break the page */ }
}

// ---- support mode: the platform operator viewing one company, read only, for up to an hour ----
function tadokSupportRemaining(expiresAt, now = Date.now()) {
  const s = Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function tadokSupportBarHtml(session, now = Date.now()) {
  const e = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<div class="tadok-support-bar" role="status">
    <span><strong>מצב תמיכה — צפייה בלבד</strong> · ${e(session.organizations?.name)}</span>
    <span>נותרו <b id="tadokSupportLeft">${tadokSupportRemaining(session.expires_at, now)}</b></span>
    <button type="button" class="btn btn-sm" id="tadokSupportExit">יציאה ממצב תמיכה</button>
  </div>`;
}

// The database refuses every write in support mode; say so instead of a raw policy error.
function tadokSupportErrorText(message) {
  return tadokEventFromError(message).kind === 'permission' ? 'מצב תמיכה: צפייה בלבד — אי אפשר לשמור שינויים' : message;
}

// The owner's "יומן גישת תמיכה": every time TADOK support viewed the company.
function tadokSupportLogHtml(rows, now = Date.now()) {
  if (!rows || !rows.length) return '<p style="color:var(--steel);margin:0;">עדיין לא הייתה כניסת תמיכה לנתוני החברה.</p>';
  const e = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const t = iso => new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const body = rows.map(r => {
    const active = !r.ended_at && Date.parse(r.expires_at) > now;
    const until = r.ended_at && Date.parse(r.ended_at) < Date.parse(r.expires_at) ? r.ended_at : r.expires_at;
    return `<tr><td>${t(r.started_at)}</td><td>${active ? 'עד ' : ''}${t(until)}</td><td>${e(r.reason)}</td>
      <td>${r.ticket_id ? 'פנייה ' + e(String(r.ticket_id).slice(0, 8)) : '—'}</td><td>צוות התמיכה של TADOK</td>
      <td><span class="support-log-state${active ? ' on' : ''}">${active ? 'פעילה' : 'הסתיימה'}</span></td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="support-log"><thead><tr><th>מתי</th><th>עד</th><th>סיבה</th><th>פנייה</th><th>מי</th><th>מצב</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

// The platform operator's home is the control panel. Coming into the site — a typed address, a
// bookmark, the home-screen icon, a link from elsewhere, or straight after signing in — opens
// platform-admin.html instead of the company dashboard. Moving inside the site ('לוח בקרה' in the
// menu, 'בית' in the tab bar) still reaches the dashboard.
function tadokOpensConsole(page, isOperator, referrer, inSupport, origin) {
  if (page !== 'dashboard.html' || !isOperator || inSupport) return false;
  let from = null;
  try { from = referrer ? new URL(referrer) : null; } catch (_) { from = null; }
  if (!from || from.origin !== origin) return true;
  return /\/(index\.html)?$/.test(from.pathname); // the sign-in page, or the bare address
}
