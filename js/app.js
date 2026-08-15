// ===== Shared app shell: auth guard, header, nav, toast, helpers =====

const NAV_ITEMS = [
  { href: 'dashboard.html', label: 'לוח בקרה' },
  { href: 'concrete.html',  label: 'יומני יציקות בטון' },
  { href: 'rebar.html',     label: 'משלוחי ברזל' },
  { href: 'slabs.html',     label: 'פלטות טרום' },
  { href: 'quantity.html',  label: 'כתבי כמויות' },
  { href: 'prices.html',    label: 'השוואת מחירים' },
  { href: 'reports.html',   label: 'דוחות' },
];
const ADMIN_NAV_ITEM = { href: 'users.html', label: 'משתמשים' };

function toast(message, type = '') {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.innerHTML = type === 'success' ? `<span class="toast-check">✓</span> ${message}` : message;
  host.appendChild(el);
  setTimeout(() => el.remove(), type === 'success' ? 4500 : 3500);
}

function showMsg(el, text, type) {
  if (!el) return;
  el.textContent = text;
  el.className = 'msg show ' + type;
}
function hideMsg(el) {
  if (!el) return;
  el.className = 'msg';
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('he-IL');
}
function fmtNum(n, digits = 2) {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if (isNaN(num)) return n;
  return num.toLocaleString('he-IL', { maximumFractionDigits: digits });
}

// Renders the shared header + nav into #app-header, wires up mobile toggle & logout.
async function renderHeader(activePage, profile, site) {
  const host = document.getElementById('app-header');
  if (!host) return;

  const items = [...NAV_ITEMS];
  if (profile && (profile.role === 'owner' || profile.role === 'admin')) {
    items.push(ADMIN_NAV_ITEM);
  }

  const navHtml = items.map(item =>
    `<a href="${item.href}" class="${item.href === activePage ? 'active' : ''}">${item.label}</a>`
  ).join('');

  const allSites = site?.__allSites;
  const siteControl = (allSites && allSites.length > 1)
    ? `<select class="site-badge" id="siteSwitcher" style="cursor:pointer;">
        ${allSites.map(s => `<option value="${s.id}" ${s.id === site.id ? 'selected' : ''}>${s.name}</option>`).join('')}
      </select>`
    : `<span class="site-badge">${site?.name || ''}</span>`;

  host.innerHTML = `
    <div class="brand">
      <img src="icons/logo.svg" alt="SGP">
    </div>
    <nav id="mainNav">${navHtml}</nav>
    <div style="display:flex;align-items:center;gap:10px;">
      ${siteControl}
      <button class="logout-btn" id="logoutBtn">יציאה</button>
      <button class="header-menu-btn" id="menuToggle">☰</button>
    </div>
  `;

  document.getElementById('menuToggle')?.addEventListener('click', () => {
    document.getElementById('mainNav')?.classList.toggle('open');
  });

  document.getElementById('siteSwitcher')?.addEventListener('change', e => {
    sessionStorage.setItem('sgp_active_site_id', e.target.value);
    location.reload();
  });

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.href = 'index.html';
  });
}

// Resolves which site is "active" for this session.
// Regular users: fixed to profile.site_id.
// Owner/admin with no fixed site_id: pick a remembered site, or default to the first one,
// and expose the full list so the header can offer a switcher.
async function resolveActiveSite(profile) {
  if (profile.site_id) {
    const { data: siteData, error } = await sb
      .from('sites')
      .select('*')
      .eq('id', profile.site_id)
      .single();
    if (error) { console.error(error); return null; }
    return siteData;
  }

  const { data: allSites, error } = await sb.from('sites').select('*').order('name', { ascending: true });
  if (error) { console.error(error); return null; }
  if (!allSites || !allSites.length) return null;

  const savedId = sessionStorage.getItem('sgp_active_site_id');
  let site = savedId ? allSites.find(s => s.id === savedId) : null;
  if (!site) site = allSites[0];
  sessionStorage.setItem('sgp_active_site_id', site.id);

  return { ...site, __allSites: allSites };
}

// Guards a page: requires a logged-in user with a profile + site.
// Returns { user, profile, site } or redirects to index.html.
async function requireAuth(activePage) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }

  const { data: profile, error: profErr } = await sb
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (profErr || !profile) {
    console.error(profErr);
    await sb.auth.signOut();
    window.location.href = 'index.html';
    return null;
  }

  const site = await resolveActiveSite(profile);

  if (!site) {
    document.body.innerHTML = `
      <div style="padding:40px;text-align:center;font-family:sans-serif;">
        <h2 style="color:#e0453f;">לא נמצא אתר פעיל במערכת</h2>
        <p>יש ליצור אתר (Site) אחד לפחות בטבלת sites לפני שימוש במערכת.</p>
        <button onclick="sb.auth.signOut().then(()=>location.href='index.html')" style="margin-top:16px;padding:10px 20px;">יציאה</button>
      </div>`;
    return null;
  }

  await renderHeader(activePage, profile, site);

  return { user: session.user, profile, site };
}
