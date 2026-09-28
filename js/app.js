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
  { group: 'מעקב ציוד וחומר', key: 'materials', icon: '📦', items: [
    { href: 'concrete.html', label: 'בטון', icon: '🧱' },
    { href: 'rebar.html',    label: 'ברזל', icon: '🔩' },
    { href: 'slabs.html',    label: 'לוח״דים', icon: '🏗️' },
  ]},
  { group: 'הגשות לאישור', key: 'vendor-submissions', icon: '📥', items: [
    { href: 'vendor-contractors.html', label: 'קבלנים', icon: '👷' },
    { href: 'vendor-suppliers.html',   label: 'ספקים', icon: '🚚' },
    { href: 'vendor-equipment.html',   label: 'ציוד', icon: '🛠️' },
    { href: 'vendor-materials.html',   label: 'חומר', icon: '🧰' },
  ]},
  { group: 'בקרת איכות', key: 'quality-control', icon: '✅', items: [
    { href: 'qc-preliminary.html', label: 'בקרה מקדימה', icon: '🔍' },
    { href: 'qc-inprocess.html',   label: 'בקרה בתהליך', icon: '🔄' },
  ]},
  { href: 'facility-file.html', label: 'תיק מתקן / טופס 4', icon: '📜' },
  { href: 'exceptions.html', label: 'חריגים', icon: '⚠️' },
  { href: 'tasks.html', label: 'משימות', icon: '📋' },
  { href: 'work-plan.html', label: 'תכנית עבודה שבועית', icon: '🗓️' },
  { href: 'weekly-meeting.html', label: 'סיכומי ישיבות', icon: '📝' },
  { href: 'correspondence.html', label: 'יועצים ומתכננים', icon: '✉️' },
  { href: 'quantity.html',  label: 'כתבי כמויות', icon: '📐' },
  { href: 'prices.html',    label: 'השוואת מחירים', icon: '💰' },
  { href: 'reports.html',   label: 'דוחות', icon: '📊' },
];
const ADMIN_NAV_ITEM = { href: 'users.html', label: 'משתמשים', icon: '👥' };
const ORG_SETTINGS_NAV_ITEM = { href: 'org-settings.html', label: 'הגדרות החברה', icon: '🏢' };
const PLATFORM_NAV_ITEM = { href: 'platform-admin.html', label: 'ניהול הפלטפורמה', icon: '🛠️' };
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

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toast(message, type = '') {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.innerHTML = type === 'success' ? `<span class="toast-check">✓</span> ${esc(message)}` : esc(message);
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
  if (role === 'contractor') return 'קבלן';
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

async function renderHeader(activePage, profile, site, org) {
  const host = document.getElementById('app-header');
  if (!host) return;

  const items = [...NAV_ITEMS];
  if (profile && (profile.role === 'owner' || profile.role === 'admin')) {
    items.push(ADMIN_NAV_ITEM);
  }
  if (profile && profile.role === 'owner') {
    items.push(ORG_SETTINGS_NAV_ITEM);
  }
  // Platform operator link, shown only to operators. The page and the database check
  // this independently; hiding the link is only a convenience.
  // platform_admins is unreadable from the client on purpose, so ask the question
  // instead of reading the table.
  try {
    const { data: isPlatformAdmin } = await sb.rpc('am_i_platform_admin');
    if (isPlatformAdmin) items.push(PLATFORM_NAV_ITEM);
  } catch (_) { /* never block the header on this */ }
  items.push(PROFILE_NAV_ITEM);

  // Each company sees its own name in the tab title.
  if (org?.name) {
    const base = (document.title || '').split('|')[0].trim();
    document.title = base ? `${base} | ${org.name}` : org.name;
  }

  const NAV_GROUP_KEY_PREFIX = 'sgp_navgroup_';
  function navLinkHtml(item, extraClass) {
    return `<a href="${item.href}" class="${extraClass || ''} ${item.href === activePage ? 'active' : ''}"><span class="nav-icon">${item.icon}</span>${item.label}</a>`;
  }
  const navHtml = items.map(item => {
    if (item.group) {
      const groupActive = item.items.some(sub => sub.href === activePage);
      const stored = localStorage.getItem(NAV_GROUP_KEY_PREFIX + item.key);
      // The group containing the active page always shows expanded, even if the
      // user had previously collapsed it — otherwise the current page can end up
      // hidden inside a collapsed group with no visual trace of where you are.
      const expanded = groupActive || stored === '1';
      const subHtml = item.items.map(sub => navLinkHtml(sub, 'nav-sub')).join('');
      return `
        <div class="nav-group${expanded ? ' expanded' : ''}" data-group="${item.key}">
          <button type="button" class="nav-group-header"><span class="nav-icon">${item.icon}</span>${item.group}<span class="nav-chevron">▾</span></button>
          <div class="nav-group-items"><div class="nav-group-items-inner">${subHtml}</div></div>
        </div>`;
    }
    return navLinkHtml(item);
  }).join('');

  const allSites = site?.__allSites;
  const siteControl = (allSites && allSites.length > 1)
    ? `<select class="site-badge" id="siteSwitcher" style="cursor:pointer;">
        ${allSites.map(s => `<option value="${s.id}" ${s.id === site.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>`
    : `<span class="site-badge">${esc(site?.name || '')}</span>`;

  const name = esc(profileDisplayName(profile));
  const job = esc(profile?.job_title || systemRoleLabel(profile?.role));

  // A person can belong to more than one company; show a switcher only when they do.
  const allOrgs = org?.__allOrgs || [];
  const orgControl = allOrgs.length > 1
    ? `<select class="site-badge" id="orgSwitcher" style="cursor:pointer;font-weight:800;">
        ${allOrgs.map(o => `<option value="${o.id}" ${o.id === org.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}
       </select>`
    : (org?.name ? `<div class="brand-org">${esc(org.name)}</div>` : '');

  host.innerHTML = `
    <div class="brand">
      <img src="icons/logo-white.svg" alt="${esc(org?.name || '')}">
      ${orgControl}
    </div>
    <nav id="mainNav">${navHtml}</nav>
    <div class="sidebar-footer">
      <a href="profile.html" class="user-chip" id="userChip">
        <div class="avatar-sm" id="sidebarAvatar">
          <span>${esc(profileInitials(profile))}</span>
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

  const SIDEBAR_COLLAPSE_KEY = 'sgp_sidebar_collapsed';
  if (window.innerWidth > 900 && localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1') {
    host.classList.add('desktop-hidden');
    document.body.classList.add('sidebar-collapsed');
  }

  let toggle = document.getElementById('menuToggle');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.id = 'menuToggle';
    toggle.className = 'header-menu-btn';
    toggle.textContent = '☰';
    toggle.title = 'הצגה/הסתרה של התפריט';
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
    if (window.innerWidth > 900) {
      const collapsed = host.classList.toggle('desktop-hidden');
      document.body.classList.toggle('sidebar-collapsed', collapsed);
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? '1' : '0');
    } else {
      host.classList.toggle('open');
      backdrop.classList.toggle('open');
    }
  };
  backdrop.onclick = () => {
    host.classList.remove('open');
    backdrop.classList.remove('open');
  };

  // Re-sync desktop-collapse vs mobile-open state when crossing the 900px
  // breakpoint via window resize (not just page reload), so the two states
  // (host.desktop-hidden / host.open) don't drift out of sync with each other.
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) {
      host.classList.remove('open');
      backdrop.classList.remove('open');
      const collapsed = localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1';
      host.classList.toggle('desktop-hidden', collapsed);
      document.body.classList.toggle('sidebar-collapsed', collapsed);
    } else {
      host.classList.remove('desktop-hidden');
      document.body.classList.remove('sidebar-collapsed');
    }
  });
  host.querySelectorAll('nav a').forEach(a => a.addEventListener('click', () => {
    host.classList.remove('open');
    backdrop.classList.remove('open');
  }));

  host.querySelectorAll('.nav-group-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.nav-group');
      const expanded = group.classList.toggle('expanded');
      localStorage.setItem(NAV_GROUP_KEY_PREFIX + group.dataset.group, expanded ? '1' : '0');
    });
  });

  document.getElementById('orgSwitcher')?.addEventListener('change', e => {
    sessionStorage.setItem(SGP_ACTIVE_ORG_KEY, e.target.value);
    sessionStorage.removeItem('sgp_active_site_id'); // the old site belongs to the old company
    location.reload();
  });

  document.getElementById('siteSwitcher')?.addEventListener('change', e => {
    sessionStorage.setItem('sgp_active_site_id', e.target.value);
    location.reload();
  });

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    sessionStorage.removeItem(SGP_ACTIVE_ORG_KEY);
    sessionStorage.removeItem('sgp_active_site_id');
    await sb.auth.signOut();
    window.location.href = 'index.html';
  });
}

// Platform name — deliberately generic, since the platform now serves many companies.
// It is only a fallback: anywhere a tenant can see a name, the company's own name wins.
const PLATFORM_NAME = 'TADOK';

// Name printed on generated PDFs and footers. Set once the active company is known;
// that always happens before any report can be produced.
let activeOrgName = PLATFORM_NAME;
function orgDisplayName() { return activeOrgName; }

// A scanned delivery note shows our own company as the customer and the supplier as the
// sender. Used to tell them apart. Words of 1-2 letters are skipped: they appear inside
// unrelated Hebrew words too often to be a reliable signal.
function looksLikeOwnCompany(text) {
  if (!text) return false;
  return orgDisplayName()
    .split(/[^א-תA-Za-z0-9]+/)
    .filter(w => w.length >= 3)
    .some(w => text.includes(w));
}

const SGP_ACTIVE_ORG_KEY = 'sgp_active_org_id';

// Which company is the user acting in right now, and with which role there?
// Roles are per company (organization_members), not global — the same person can be an
// owner in one company and a site user in another.
async function resolveActiveOrg(userId) {
  const { data, error } = await sb
    .from('organization_members')
    .select('role, organization_id, organizations(id, name, slug, logo_path, status)')
    .eq('user_id', userId);
  if (error) { console.error('resolveActiveOrg failed:', error); return null; }

  const usable = (data || [])
    .filter(m => m.organizations && m.organizations.status === 'active')
    .map(m => ({ ...m.organizations, role: m.role }));
  if (!usable.length) return null;

  const savedId = sessionStorage.getItem(SGP_ACTIVE_ORG_KEY);
  let org = savedId ? usable.find(o => o.id === savedId) : null;
  if (!org) {
    org = usable[0];
    // Switching company invalidates the remembered site, which belongs to the old one.
    if (savedId) sessionStorage.removeItem('sgp_active_site_id');
  }
  sessionStorage.setItem(SGP_ACTIVE_ORG_KEY, org.id);
  return { ...org, __allOrgs: usable };
}

// Sites are always filtered by the active company explicitly, not left to row security
// alone — two independent checks, same as the database has two policy layers.
async function resolveActiveSite(profile, org) {
  let mySites;

  if (profile.role === 'site_user' || profile.role === 'contractor') {
    const { data: assigned, error } = await sb
      .from('profile_sites')
      .select('site_id, sites!inner(*)')
      .eq('profile_id', profile.id)
      .eq('sites.organization_id', org.id);
    if (error) { console.error(error); return null; }
    mySites = (assigned || []).map(r => r.sites).filter(Boolean);
  } else {
    const { data: allSites, error } = await sb
      .from('sites').select('*').eq('organization_id', org.id).order('name', { ascending: true });
    if (error) { console.error(error); return null; }
    mySites = allSites || [];
  }

  mySites = mySites.filter(s => s.organization_id === org.id);
  if (!mySites.length) return null;

  const savedId = sessionStorage.getItem('sgp_active_site_id');
  let site = savedId ? mySites.find(s => s.id === savedId) : null;
  if (!site) site = mySites[0];
  sessionStorage.setItem('sgp_active_site_id', site.id);

  return mySites.length === 1 ? { ...site } : { ...site, __allSites: mySites };
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

  const stop = (title, detail) => {
    document.body.innerHTML = `
      <div style="padding:40px;text-align:center;font-family:sans-serif;">
        <h2 style="color:#e0453f;">${esc(title)}</h2>
        <p>${esc(detail)}</p>
        <button onclick="sb.auth.signOut().then(()=>location.href='index.html')" style="margin-top:16px;padding:10px 20px;">יציאה</button>
      </div>`;
    return null;
  };

  const org = await resolveActiveOrg(session.user.id);
  if (!org) return stop('החשבון אינו משויך לחברה פעילה', 'פנו למנהל המערכת כדי לשייך את החשבון לחברה.');

  // The role that matters is the role IN THE ACTIVE COMPANY. Overlaying it onto
  // profile.role keeps every existing `profile.role === 'owner'` check working, but it
  // now means "owner of this company" rather than "owner of everything".
  activeOrgName = org.name || PLATFORM_NAME;

  profile.legacy_role = profile.role;
  profile.role = org.role;

  const site = await resolveActiveSite(profile, org);
  if (!site) return stop('לא נמצא אתר פעיל בחברה הזו', 'יש ליצור אתר אחד לפחות, או לשייך את המשתמש לאתר קיים.');

  await renderHeader(activePage, profile, site, org);

  return { user: session.user, profile, site, org };
}
