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
  { href: 'dashboard.html', label: 'לוח בקרה', icon: '🏠', ico: 'dashboard' },
  { group: 'מעקב ציוד וחומר', key: 'materials', icon: '📦', ico: 'group-materials', items: [
    { href: 'concrete.html', label: 'בטון', icon: '🧱', ico: 'concrete' },
    { href: 'rebar.html',    label: 'ברזל', icon: '🔩', ico: 'rebar' },
    { href: 'slabs.html',    label: 'לוח״דים', icon: '🏗️', ico: 'slabs' },
  ]},
  { group: 'הגשות לאישור', key: 'vendor-submissions', icon: '📥', ico: 'group-submissions', items: [
    { href: 'vendor-contractors.html', label: 'קבלנים', icon: '👷', ico: 'contractors' },
    { href: 'vendor-suppliers.html',   label: 'ספקים', icon: '🚚', ico: 'suppliers' },
    { href: 'vendor-equipment.html',   label: 'ציוד', icon: '🛠️', ico: 'equipment' },
    { href: 'vendor-materials.html',   label: 'חומר', icon: '🧰', ico: 'materials' },
  ]},
  { group: 'בקרת איכות', key: 'quality-control', icon: '✅', ico: 'quality', items: [
    { href: 'qc-preliminary.html', label: 'בקרה מוקדמת', icon: '🔍', ico: 'qc-preliminary' },
    { href: 'qc-inprocess.html',   label: 'בקרה שוטפת', icon: '🔄', ico: 'qc-inprocess' },
  ]},
  { href: 'facility-file.html', label: 'תיק מתקן / טופס 4', icon: '📜', ico: 'facility-file' },
  { href: 'exceptions.html', label: 'חריגים', icon: '⚠️', ico: 'exceptions' },
  { href: 'tasks.html', label: 'משימות', icon: '📋', ico: 'tasks' },
  { href: 'work-plan.html', label: 'תכנית עבודה שבועית', icon: '🗓️', ico: 'work-plan' },
  { href: 'weekly-meeting.html', label: 'סיכומי ישיבות', icon: '📝', ico: 'meetings' },
  { href: 'correspondence.html', label: 'יועצים ומתכננים', icon: '✉️', ico: 'correspondence' },
  { href: 'quantity.html',  label: 'כתבי כמויות', icon: '📐', ico: 'quantity' },
  { href: 'prices.html',    label: 'השוואת מחירים', icon: '💰', ico: 'prices' },
  { href: 'reports.html',   label: 'דוחות', icon: '📊', ico: 'reports' },
];
const ADMIN_NAV_ITEM = { href: 'users.html', label: 'משתמשים', icon: '👥', ico: 'users' };
const ORG_SETTINGS_NAV_ITEM = { href: 'org-settings.html', label: 'הגדרות החברה', icon: '🏢', ico: 'org-settings' };
const PLATFORM_NAV_ITEM = { href: 'platform-admin.html', label: 'ניהול הפלטפורמה', icon: '🛠️', ico: 'platform', count: true };
const PROFILE_NAV_ITEM = { href: 'profile.html', label: 'הפרופיל שלי', icon: '👤', ico: 'profile' };
const SUPPORT_NAV_ITEM = { href: 'support.html', label: 'תמיכה', icon: '🛟', ico: 'support', count: true };

// The icon a page has in the sidebar, so the page itself can reuse it (e.g. on its stat cards).
function pageIco(href) {
  const all = [...NAV_ITEMS.flatMap(i => i.items ? [i, ...i.items] : [i]),
    ADMIN_NAV_ITEM, ORG_SETTINGS_NAV_ITEM, PLATFORM_NAV_ITEM, PROFILE_NAV_ITEM, SUPPORT_NAV_ITEM];
  return all.find(i => i.href === href)?.ico || null;
}

// Line icons for small controls — row buttons, badges, toggles. Paths from Lucide
// (lucide.dev, ISC licence). The coloured 3D set in icons/nav/ is for titles and cards.
const UI_ICONS = {
  'pencil': '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  'trash': '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  'file-text': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  'mail': '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/>',
  'send': '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'paperclip': '<path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/>',
  'eye': '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
  'camera': '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>',
  'download': '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  'lock': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'lock-open': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  'menu': '<path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/>',
  'calendar': '<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>',
  'triangle-alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  'user': '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'map-pin': '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  'check': '<path d="M20 6 9 17l-5-5"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'house': '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  'list-checks': '<path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/>',
  'chart-column': '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
};
function uiIcon(name, size = 16) {
  return `<svg class="ui-ico ui-ico-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UI_ICONS[name] || ''}</svg>`;
}
// One of the 3D icons. Decorative: the text beside it already says what it is.
function ico3d(name, size = 22) {
  return `<img class="ico3d" src="icons/nav/${name}.webp" alt="" aria-hidden="true" width="${size}" height="${size}">`;
}

// One statistic card. `label` and `value` are inserted as-is, so pass only trusted text.
// With `ico` the card uses the icon layout (see .stat-card.has-ico); without, the plain one.
function statCardHtml({ ico, label, value, valueStyle = '' }) {
  const img = ico ? `<img class="stat-ico" src="icons/nav/${ico}.webp" alt="" aria-hidden="true" width="44" height="44">` : '';
  const style = valueStyle ? ` style="${valueStyle}"` : '';
  return `<div class="stat-card${ico ? ' has-ico' : ''}">${img}<div class="label">${label}</div><div class="value"${style}>${value}</div></div>`;
}

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
  // In support mode the database refuses every write: say so plainly, and don't report it.
  if (type === 'error' && inSupportMode()) message = tadokSupportErrorText(message);
  // errors the user sees are also reported to the operator (js/policies.js)
  else if (type === 'error' && typeof tadokReportError === 'function') tadokReportError(message);
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
  if (type === 'error' && inSupportMode()) text = tadokSupportErrorText(text);
  else if (type === 'error' && typeof tadokReportError === 'function') tadokReportError(text);
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
  if (role === 'support') return 'תמיכת TADOK — צפייה בלבד';
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
  items.push(SUPPORT_NAV_ITEM);

  // Each company sees its own name in the tab title.
  if (org?.name) {
    const base = (document.title || '').split('|')[0].trim();
    document.title = base ? `${base} | ${org.name}` : org.name;
  }

  const NAV_GROUP_KEY_PREFIX = 'sgp_navgroup_';
  // The generated icon when the item has one, the emoji otherwise. Decorative: the label
  // beside it already says what the link is, so screen readers skip the image.
  const navIcon = item => item.ico
    ? `<img class="nav-ico" src="icons/nav/${item.ico}.webp" alt="" aria-hidden="true" width="28" height="28">`
    : `<span class="nav-icon">${item.icon}</span>`;
  function navLinkHtml(item, extraClass) {
    // Support learns which page the user came from, to attach it to a new request.
    const href = item.href === 'support.html' && activePage !== 'support.html'
      ? `support.html?from=${encodeURIComponent(activePage)}` : item.href;
    const count = item.count ? `<span class="nav-count" data-nav-count="${item.href}" hidden></span>` : '';
    return `<a href="${href}" class="${extraClass || ''} ${item.href === activePage ? 'active' : ''}">${navIcon(item)}${item.label}${count}</a>`;
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
          <button type="button" class="nav-group-header">${navIcon(item)}${item.group}<span class="nav-chevron">▾</span></button>
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

  const logo = await orgLogo(org);
  const logoHtml = logo.isCompany
    ? `<img class="brand-logo company" src="${esc(logo.src)}" alt="${esc(org?.name || '')}" onerror="this.onerror=null;this.className='brand-logo';this.src='${PLATFORM_LOGO}'">`
    : `<img class="brand-logo" src="${PLATFORM_LOGO}" alt="TADOK">`;

  host.innerHTML = `
    <div class="brand">
      ${logoHtml}
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
      <div class="sidebar-legal">${typeof tadokLegalLinksHtml === 'function' ? tadokLegalLinksHtml() : '<a href="privacy.html">פרטיות</a><span aria-hidden="true">·</span><a href="terms.html">תנאי שימוש</a>'}</div>
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
    toggle.innerHTML = uiIcon('menu', 20);
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

  // Phones: a tab bar at the bottom, in thumb reach. "תפריט" opens the full sidebar, so
  // the floating menu button is hidden there (see .has-tab-bar in the stylesheet).
  let tabBar = document.getElementById('tabBar');
  if (!tabBar) {
    tabBar = document.createElement('nav');
    tabBar.id = 'tabBar';
    tabBar.className = 'tab-bar';
    tabBar.setAttribute('aria-label', 'ניווט מהיר');
    document.body.appendChild(tabBar);
    document.body.classList.add('has-tab-bar');
  }
  const TABS = [
    { href: 'dashboard.html', label: 'בית', icon: 'house' },
    { href: 'tasks.html', label: 'משימות', icon: 'list-checks', badge: 'tasks' },
    { href: 'reports.html', label: 'דוחות', icon: 'chart-column' },
  ];
  tabBar.innerHTML = TABS.map(t => `
    <a href="${t.href}" class="tab${t.href === activePage ? ' active' : ''}"${t.href === activePage ? ' aria-current="page"' : ''}>
      ${uiIcon(t.icon, 22)}<span>${t.label}</span>${t.badge ? `<span class="tab-badge" data-tab-badge="${t.badge}" hidden></span>` : ''}
    </a>`).join('') + `
    <button type="button" class="tab" id="tabMenuBtn" aria-label="פתיחת התפריט">${uiIcon('menu', 22)}<span>תפריט</span></button>`;
  document.getElementById('tabMenuBtn').onclick = () => {
    host.classList.add('open');
    backdrop.classList.add('open');
  };
  // open tasks on this site, like the red counts on BiltOn's tiles
  if (site?.id) {
    sb.from('tasks').select('id', { count: 'exact', head: true }).eq('site_id', site.id).neq('status', 'done')
      .then(({ count }) => {
        const b = tabBar.querySelector('[data-tab-badge="tasks"]');
        if (b && count) { b.textContent = count > 99 ? '99+' : count; b.hidden = false; b.setAttribute('aria-label', `${count} פתוחות`); }
      }, () => {});
  }
  refreshSupportCounts(profile?.id);
  if (typeof tadokShowAnnouncements === 'function') tadokShowAnnouncements();
  if (org?.__support) showSupportBar(org.__support);
  else if (sessionStorage.getItem('tadok_support_ended')) {
    sessionStorage.removeItem('tadok_support_ended');
    toast('מצב התמיכה הסתיים');
  }

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

// Red counts: replies waiting for this user, and — for the operator — requests waiting for an answer.
async function refreshSupportCounts(userId) {
  if (!userId) return;
  const set = (key, n) => document.querySelectorAll(`[data-nav-count="${key}"]`).forEach(b => {
    b.textContent = n > 99 ? '99+' : String(n); b.hidden = !n;
  });
  try {
    const mine = await sb.from('support_tickets').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('user_has_unread', true);
    set('support.html', mine.count || 0);
    let waiting = 0;
    if (document.querySelector('[data-nav-count="platform-admin.html"]')) {
      const op = await sb.from('support_tickets').select('id', { count: 'exact', head: true }).eq('operator_has_unread', true);
      waiting = op.count || 0;
      set('platform-admin.html', waiting);
    }
    const menuBtn = document.getElementById('tabMenuBtn');
    if (menuBtn) {
      let dot = menuBtn.querySelector('.tab-dot');
      if (!dot) { dot = document.createElement('span'); dot.className = 'tab-dot'; menuBtn.appendChild(dot); }
      dot.hidden = !((mine.count || 0) + waiting);
    }
  } catch (_) { /* counts are a convenience; never break the page */ }
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

// The platform's own logo, shown wherever a company hasn't uploaded one. It has light
// lettering and a transparent background, so it only ever goes on dark surfaces.
const PLATFORM_LOGO = 'brand/tadok-logo-transparent.png';

// The company the user is working in, for code that runs after sign-in (PDF export).
let activeOrg = null;

// A company's own logo if it uploaded one, otherwise the platform's.
async function orgLogo(org) {
  if (org?.logo_path) {
    const url = await getStorageUrl(org.logo_path);
    if (url) return { src: url, isCompany: true };
  }
  return { src: PLATFORM_LOGO, isCompany: false };
}

// The same, as markup for a PDF banner. A company logo is inlined as a data URL:
// html2canvas cannot paint a cross-origin image it isn't allowed to read, and one
// tainted image would abort the whole export.
async function pdfLogoHtml(height = 38) {
  const logo = await orgLogo(activeOrg);
  if (logo.isCompany) {
    try {
      const blob = await (await fetch(logo.src)).blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob);
      });
      return `<div style="background:#fff;border-radius:8px;padding:5px 8px;display:flex;align-items:center;"><img src="${dataUrl}" style="height:${height - 10}px;display:block;"></div>`;
    } catch (_) { /* fall back to the platform logo */ }
  }
  return `<img src="${PLATFORM_LOGO}" style="height:${height}px;display:block;">`;
}

const SGP_ACTIVE_ORG_KEY = 'sgp_active_org_id';

// ---- support mode: the platform operator viewing one company, read only (op_start_support_session) ----
// Looked up only when the console set the key, so ordinary page loads pay nothing for it.
const SUPPORT_SESSION_KEY = 'tadok_support_session';
function inSupportMode() { return !!(activeOrg && activeOrg.__support); }
function clearSupportMode() {
  sessionStorage.removeItem(SUPPORT_SESSION_KEY);
  sessionStorage.removeItem(SGP_ACTIVE_ORG_KEY);
  sessionStorage.removeItem('sgp_active_site_id');
}
async function tadokSupportSession(userId) {
  if (!sessionStorage.getItem(SUPPORT_SESSION_KEY)) return null;
  const { data, error } = await sb.from('support_sessions')
    .select('id, organization_id, expires_at, organizations(id, name, slug, logo_path, status)')
    .eq('operator_id', userId).is('ended_at', null).gt('expires_at', new Date().toISOString())
    .order('started_at', { ascending: false }).limit(1);
  const s = !error && data && data[0];
  if (s && s.organizations) return s;
  // ended elsewhere or timed out: back to the operator's own company, with a note
  clearSupportMode();
  sessionStorage.setItem('tadok_support_ended', '1');
  return null;
}
async function exitSupportMode() {
  try { await sb.rpc('op_end_support_session'); } catch (_) { /* the session also expires by itself */ }
  clearSupportMode();
  location.href = 'platform-admin.html#companies';
}
// The bar at the top of every page while in support mode, with the time left; at zero the page
// reloads and requireAuth finds no session.
function showSupportBar(session) {
  document.body.classList.add('support-mode');
  const host = document.querySelector('main.page') || document.body;
  let bar = document.getElementById('tadokSupportBar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'tadokSupportBar'; host.prepend(bar); }
  bar.innerHTML = tadokSupportBarHtml(session);
  document.getElementById('tadokSupportExit').onclick = exitSupportMode;
  const tick = setInterval(() => {
    if (Date.parse(session.expires_at) <= Date.now()) { clearInterval(tick); location.reload(); return; }
    const left = document.getElementById('tadokSupportLeft');
    if (left) left.textContent = tadokSupportRemaining(session.expires_at);
  }, 1000);
}
function supportNoSites(org) {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;direction:rtl;">
      <div class="card" style="max-width:440px;text-align:center;">
        <h2 style="margin:0 0 8px;color:var(--navy);">ל${esc(org.name)} אין עדיין אתרים</h2>
        <p style="color:var(--steel);">אין נתונים להציג במצב תמיכה.</p>
        <button type="button" class="btn btn-primary" id="tadokSupportExit">יציאה ממצב תמיכה</button>
      </div>
    </div>`;
  document.getElementById('tadokSupportExit').onclick = exitSupportMode;
  return null;
}

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

// Shown in place of the page when a company's owner or admin has no site yet — the
// first sign-in of a newly opened company. Creates the site, then reloads into it.
// Returns null so the calling page stops, exactly like the other requireAuth exits.
function firstSiteSetup(org) {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:var(--bg);direction:rtl;">
      <div class="card" style="width:100%;max-width:440px;">
        <div class="auth-brand"><img src="${PLATFORM_LOGO}" alt="TADOK"></div>
        <h2 style="margin:0 0 6px;color:var(--navy);">ברוכים הבאים, ${esc(org.name)}</h2>
        <p style="margin:0 0 18px;color:var(--steel);line-height:1.6;">
          כדי להתחיל, צרו את אתר הבנייה הראשון של החברה. אתרים נוספים אפשר להוסיף אחר כך מעמוד המשתמשים.
        </p>
        <div id="firstSiteMsg" class="msg"></div>
        <form id="firstSiteForm" style="display:flex;flex-direction:column;gap:14px;">
          <div class="field"><label for="firstSiteName">שם האתר *</label>
            <input id="firstSiteName" name="name" required maxlength="120" autocomplete="off"></div>
          <div class="field"><label for="firstSiteLocation">מיקום</label>
            <input id="firstSiteLocation" name="location" maxlength="200" autocomplete="off"></div>
          <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;">יצירת האתר והמשך</button>
        </form>
        <button type="button" class="btn btn-ghost" id="firstSiteLogout" style="width:100%;justify-content:center;margin-top:10px;">יציאה</button>
      </div>
    </div>`;

  document.getElementById('firstSiteLogout').addEventListener('click', async () => {
    sessionStorage.removeItem(SGP_ACTIVE_ORG_KEY);
    sessionStorage.removeItem('sgp_active_site_id');
    await sb.auth.signOut();
    location.href = 'index.html';
  });

  document.getElementById('firstSiteForm').addEventListener('submit', async e => {
    e.preventDefault();
    const msgEl = document.getElementById('firstSiteMsg');
    hideMsg(msgEl);
    const fd = new FormData(e.target);
    const name = String(fd.get('name') || '').trim();
    if (!name) { showMsg(msgEl, 'יש להזין שם לאתר', 'error'); return; }

    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    // organization_id is always sent explicitly. The database would fill it in by itself,
    // but only when the user administers exactly one company, and the company fence
    // re-checks it either way.
    const { data, error } = await sb.from('sites')
      .insert({ name, location: String(fd.get('location') || '').trim() || null, organization_id: org.id })
      .select('id').single();
    if (error || !data) {
      btn.disabled = false;
      showMsg(msgEl, 'לא ניתן היה ליצור את האתר: ' + (error?.message || 'אין הרשאה'), 'error');
      return;
    }
    sessionStorage.setItem('sgp_active_site_id', data.id);
    location.reload();
  });

  document.getElementById('firstSiteName').focus();
  return null;
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

  // Support mode: the company comes from the operator's live support session, with role 'support'.
  // The database lets that role read the company and refuses every write.
  const support = await tadokSupportSession(session.user.id);
  const org = support ? { ...support.organizations, role: 'support', __support: support } : await resolveActiveOrg(session.user.id);
  if (!org) return stop('החשבון אינו משויך לחברה פעילה', 'פנו למנהל המערכת כדי לשייך את החשבון לחברה.');

  // The role that matters is the role IN THE ACTIVE COMPANY. Overlaying it onto
  // profile.role keeps every existing `profile.role === 'owner'` check working, but it
  // now means "owner of this company" rather than "owner of everything".
  activeOrgName = org.name || PLATFORM_NAME;
  activeOrg = org;

  // Terms and privacy acceptance: once per user and again after a change (js/policies.js).
  // (the operator accepted as themselves; nothing is recorded for a company viewed as support)
  if (!support && typeof tadokEnsureAccepted === 'function' && !(await tadokEnsureAccepted(session.user.id, org.id))) return null;

  profile.legacy_role = profile.role;
  profile.role = org.role;

  const site = await resolveActiveSite(profile, org);
  if (!site) {
    if (support) return supportNoSites(org);
    // A brand-new company has no sites yet. Every page — including users.html, where
    // sites are otherwise created — sits behind this check, so without this its owner
    // would be stopped at first sign-in with no way forward.
    if (profile.role === 'owner' || profile.role === 'admin') return firstSiteSetup(org);
    return stop('עדיין לא שויכת לאף אתר', 'פנו למנהל החברה כדי שישייך אתכם לאתר.');
  }

  await renderHeader(activePage, profile, site, org);

  return { user: session.user, profile, site, org };
}
