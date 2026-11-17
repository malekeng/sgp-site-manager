// "קליטת מסמכים במייל" (2026-11-04): the company's inbox address, an address per site, and the
// approved senders. Mounted in org-settings.html (owner) and in inbox.html (owner and admin).
// Every change goes through a database function; the values are checked here first so a typo
// never reaches it. Needs js/inbox-core.js.

const INBOX_ERRORS = {
  inbox_forbidden: 'אין הרשאה לפעולה הזאת',
  inbox_bad_code: 'קוד לא תקין: אותיות אנגליות קטנות, ספרות ומקף, 2–20 תווים',
  inbox_code_taken: 'הקוד כבר בשימוש באתר אחר',
  inbox_bad_pattern: 'כתובת או דומיין לא תקינים, לדוגמה lab@isotop.co.il או @isotop.co.il',
  inbox_bad_state: 'אי אפשר לבצע את הפעולה במצב הנוכחי',
};
function inboxErrorText(err) {
  const msg = (err && err.message) || '';
  const key = Object.keys(INBOX_ERRORS).find(k => msg.includes(k));
  return key ? INBOX_ERRORS[key] : (msg || 'שגיאה');
}

async function inboxSaveSiteCode(siteId, code) {
  const c = String(code || '').trim().toLowerCase();
  if (c && !inboxValidSiteCode(c)) return { error: INBOX_ERRORS.inbox_bad_code };
  const { error } = await sb.rpc('inbox_set_site_code', { p_site: siteId, p_code: c });
  return error ? { error: inboxErrorText(error) } : { code: c };
}

async function inboxAddSenderChecked(orgId, pattern) {
  const p = String(pattern || '').trim().toLowerCase();
  if (!inboxValidSenderPattern(p)) return { error: INBOX_ERRORS.inbox_bad_pattern };
  const { data, error } = await sb.rpc('inbox_add_sender', { p_org: orgId, p_pattern: p });
  return error ? { error: inboxErrorText(error) } : { id: data, pattern: p };
}

async function inboxCopy(text) {
  try { await navigator.clipboard.writeText(text); toast('הכתובת הועתקה', 'success'); }
  catch (_) { toast('לא ניתן להעתיק — סמנו והעתיקו ידנית', 'error'); }
}

const INBOX_MONO = "font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12.5px;word-break:break-all;direction:ltr;unicode-bidi:plaintext;";

// host: an empty element; org: { id, slug }; sites: [{ id, name }]; onChange: called after the
// addresses changed (enable, new address, a site code), so a page showing them can refresh
async function inboxSettingsMount(host, { org, sites, onChange }) {
  async function changed() {
    await load();
    if (onChange) onChange();
  }

  async function load() {
    const [st, codes, senders] = await Promise.all([
      sb.from('inbox_settings').select('token').eq('org_id', org.id).maybeSingle(),
      sb.from('inbox_site_codes').select('site_id, code').eq('org_id', org.id),
      sb.from('inbox_senders').select('id, pattern').eq('org_id', org.id).order('pattern'),
    ]);
    const err = st.error || codes.error || senders.error;
    if (err) { host.innerHTML = `<p style="color:var(--danger);">שגיאה בטעינה: ${esc(err.message)}</p>`; return; }
    render(st.data ? st.data.token : null, codes.data || [], senders.data || []);
  }

  function render(token, codes, senders) {
    if (!token) {
      host.innerHTML = `
        <p style="font-size:13px;color:var(--steel);margin-bottom:10px;">
          כתובת מייל של החברה: מה שמעבדות וספקים שולחים אליה מופיע ב"דואר נכנס", כבר נקרא ומוכן לצירוף.
        </p>
        <button class="btn btn-primary" data-inbox-enable>הפעלה</button>`;
      const enable = host.querySelector('[data-inbox-enable]');
      enable.addEventListener('click', async () => {
        enable.disabled = true;
        const { error } = await sb.rpc('inbox_enable', { p_org: org.id });
        if (error) { toast(inboxErrorText(error), 'error'); enable.disabled = false; return; }
        await changed();
      });
      return;
    }
    const codeOf = Object.fromEntries(codes.map(c => [c.site_id, c.code]));
    host.innerHTML = `
      <p style="font-size:13px;color:var(--steel);margin-bottom:10px;">
        מה שנשלח לכתובת הזאת מופיע ב"דואר נכנס". אפשר לבקש מהמעבדה להוסיף אותה לנמענים, או להעביר אליה מייל (Forward).
      </p>
      <div class="attach-item">
        <span style="${INBOX_MONO}">${esc(inboxAddress(org.slug, token))}</span>
        <button class="btn btn-sm btn-outline" data-inbox-copy="${esc(inboxAddress(org.slug, token))}">העתקה</button>
        <button class="btn btn-sm btn-ghost" data-inbox-rotate>כתובת חדשה</button>
      </div>

      <h3 style="font-size:14px;margin:18px 0 6px;">כתובת לכל אתר</h3>
      <p style="font-size:12.5px;color:var(--steel);margin-bottom:8px;">מה שמגיע לכתובת של אתר שייך לאתר מהרגע הראשון, וצוות האתר רואה אותו.</p>
      ${sites.length ? sites.map(s => `
        <div class="attach-item" style="flex-wrap:wrap;gap:8px;">
          <span style="min-width:110px;font-weight:600;">${esc(s.name)}</span>
          <input type="text" dir="ltr" maxlength="20" placeholder="atech" aria-label="קוד לאתר ${esc(s.name)}"
                 value="${esc(codeOf[s.id] || '')}" data-inbox-code="${esc(s.id)}" style="width:110px;">
          ${codeOf[s.id] ? `<span style="${INBOX_MONO}">${esc(inboxAddress(org.slug, token, codeOf[s.id]))}</span>
            <button class="btn btn-sm btn-outline" data-inbox-copy="${esc(inboxAddress(org.slug, token, codeOf[s.id]))}">העתקה</button>` : ''}
        </div>`).join('') : '<p class="empty-state">אין אתרים</p>'}

      <h3 style="font-size:14px;margin:18px 0 6px;">שולחים מאושרים</h3>
      <p style="font-size:12.5px;color:var(--steel);margin-bottom:8px;">כתובות של אנשי החברה מאושרות תמיד. מייל משולח אחר ממתין לאישור.</p>
      ${senders.map(s => `
        <div class="attach-item">
          <span style="${INBOX_MONO}">${esc(s.pattern)}</span>
          <button class="btn btn-sm btn-ghost" data-inbox-remove="${esc(s.id)}">הסרה</button>
        </div>`).join('')}
      <form data-inbox-add style="display:flex;gap:8px;margin-top:8px;">
        <input type="text" dir="ltr" placeholder="@isotop.co.il" aria-label="שולח לאישור" style="flex:1;">
        <button class="btn btn-sm btn-primary" type="submit">הוספה</button>
      </form>`;

    host.querySelectorAll('[data-inbox-copy]').forEach(b => b.addEventListener('click', () => inboxCopy(b.dataset.inboxCopy)));
    host.querySelector('[data-inbox-rotate]').addEventListener('click', async () => {
      if (!confirm('הכתובת הנוכחית תפסיק לעבוד מיד, וגם כתובות האתרים. להמשיך?')) return;
      const { error } = await sb.rpc('inbox_rotate', { p_org: org.id });
      if (error) { toast(inboxErrorText(error), 'error'); return; }
      toast('נוצרה כתובת חדשה', 'success');
      await changed();
    });
    host.querySelectorAll('[data-inbox-code]').forEach(inp => inp.addEventListener('change', async () => {
      const r = await inboxSaveSiteCode(inp.dataset.inboxCode, inp.value);
      if (r.error) { toast(r.error, 'error'); inp.value = codeOf[inp.dataset.inboxCode] || ''; return; }
      toast(r.code ? 'הקוד נשמר' : 'כתובת האתר הוסרה', 'success');
      await changed();
    }));
    host.querySelectorAll('[data-inbox-remove]').forEach(b => b.addEventListener('click', async () => {
      const { error } = await sb.rpc('inbox_remove_sender', { p_id: b.dataset.inboxRemove });
      if (error) { toast(inboxErrorText(error), 'error'); return; }
      await load();
    }));
    host.querySelector('[data-inbox-add]').addEventListener('submit', async e => {
      e.preventDefault();
      const r = await inboxAddSenderChecked(org.id, e.target.querySelector('input').value);
      if (r.error) { toast(r.error, 'error'); return; }
      await load();
    });
  }

  host.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  await load();
}
