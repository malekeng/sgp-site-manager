// ===== Shared app shell: auth guard, header, nav, toast, helpers =====

(function ensureProfileStyles() {
  if (document.querySelector('link[data-sgp-profile-ui]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/profile-ui.css';
  link.setAttribute('data-sgp-profile-ui', '1');
  document.head.appendChild(link);
})();

const NAV_ITEMS = [
  { href: 'dashboard.html', label: 'לוח בקרה', icon: '🏠' },
  { href: 'concrete.html',  label: 'יומני יציקות בטון', icon: '🧱' },
  { href: 'rebar.html',     label: 'משלוחי ברזל', icon: '🔩' },
  { href: 'slabs.html',     label: 'לוח״דים', icon: '🏗️' },
  { href: 'exceptions.html', label: 'חריגים', icon: '⚠️' },
  { href: 'quantity.html',  label: 'כתבי כמויות', icon: '📐' },
  { href: 'prices.html',    label: 'השוואת מחירים', icon: '💰' },
  { href: 'reports.html',   label: 'דוחות', icon: '📊' },
];
const ADMIN_NAV_ITEM = { href: 'users.html', label: 'משתמשים', icon: '👥' };
const PROFILE_NAV_ITEM = { href: 'profile.html', label: 'הפרופיל שלי', icon: '👤' };

const JOB_TITLE_OPTIONS = [
  'מנהל עבודה',
  'מנהל פרויקט',
  'מהנדס ביצוע',
  'מהנדס קונסטרוקציה',
  'מפקח',
  'מודד',
  'קבלן',
  'מהנדס בטיחות',
];

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

function systemRoleLabel(role) {
  if (role === 'owner') return 'בעלים';
  if (role === 'admin') return 'מנהל מערכת';
  if (role === 'site_user') return 'משתמש אתר';
  return role || '';
}

function profileDisplayName(profile) {
  return profile?.full_name || profile?.username || profile?.email || 'משתמש';
}

function profileInitials(profile) {
  const n = profileDisplayName(profile).trim();
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

async function getStorageUrl(path) {
  if (!path) return null;
  try {
    const { data, error } = await sb.storage.from('documents').createSignedUrl(path, 3600);
    if (error) return null;
    return data?.signedUrl || null;
  } catch {
    return null;
  }
}

async function renderHeader(activePage, profile, site) {
  const host = document.getElementById('app-header');
  if (!host) return;

  const items = [...NAV_ITEMS];
  if (profile && (profile.role === 'owner' || profile.role === 'admin')) {
    items.push(ADMIN_NAV_ITEM);
  }
  items.push(PROFILE_NAV_ITEM);

  const navHtml = items.map(item =>
    `<a href="${item.href}" class="${item.href === activePage ? 'active' : ''}"><span class="nav-icon">${item.icon}</span>${item.label}</a>`
  ).join('');

  const allSites = site?.__allSites;
  const siteControl = (allSites && allSites.length > 1)
    ? `<select class="site-badge" id="siteSwitcher" style="cursor:pointer;">
        ${allSites.map(s => `<option value="${s.id}" ${s.id === site.id ? 'selected' : ''}>${s.name}</option>`).join('')}
      </select>`
    : `<span class="site-badge">${site?.name || ''}</span>`;

  const name = profileDisplayName(profile);
  const job = profile?.job_title || systemRoleLabel(profile?.role);

  host.innerHTML = `
    <div class="brand">
      <img src="icons/logo.svg" alt="SGP">
    </div>
    <nav id="mainNav">${navHtml}</nav>
    <div class="sidebar-footer">
      <a href="profile.html" class="user-chip" id="userChip">
        <div class="avatar-sm" id="sidebarAvatar">
          <span>${profileInitials(profile)}</span>
        </div>
        <div class="user-chip-text">
          <div class="user-chip-name">${name}</div>
          <div class="user-chip-role">${job}</div>
        </div>
      </a>
      ${siteControl}
      <button class="logout-btn" id="logoutBtn">יציאה</button>
    </div>
  `;

  if (profile?.avatar_path) {
    getStorageUrl(profile.avatar_path).then(url => {
      if (!url) return;
      const box = document.getElementById('sidebarAvatar');
      if (!box) return;
      box.innerHTML = `<img src="${url}" alt="">`;
    });
  }

  let toggle = document.getElementById('menuToggle');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.id = 'menuToggle';
    toggle.className = 'header-menu-btn';
    toggle.textContent = '☰';
    document.body.appendChild(toggle);
  }
  let backdrop = document.getElementById('sidebarBackdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'sidebarBackdrop';
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
  }

  toggle.onclick = () => {
    host.classList.toggle('open');
    backdrop.classList.toggle('open');
  };
  backdrop.onclick = () => {
    host.classList.remove('open');
    backdrop.classList.remove('open');
  };
  host.querySelectorAll('nav a').forEach(a => a.addEventListener('click', () => {
    host.classList.remove('open');
    backdrop.classList.remove('open');
  }));

  document.getElementById('siteSwitcher')?.addEventListener('change', e => {
    sessionStorage.setItem('sgp_active_site_id', e.target.value);
    location.reload();
  });

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.href = 'index.html';
  });
}

async function resolveActiveSite(profile) {
  if (profile.role === 'site_user') {
    const { data: assigned, error } = await sb
      .from('profile_sites')
      .select('site_id, sites(*)')
      .eq('profile_id', profile.id);
    if (error) { console.error(error); return null; }
    const mySites = (assigned || []).map(r => r.sites).filter(Boolean);
    if (!mySites.length) return null;

    if (mySites.length === 1) return mySites[0];

    const savedId = sessionStorage.getItem('sgp_active_site_id');
    let site = savedId ? mySites.find(s => s.id === savedId) : null;
    if (!site) site = mySites[0];
    sessionStorage.setItem('sgp_active_site_id', site.id);
    return { ...site, __allSites: mySites };
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
