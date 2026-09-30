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
