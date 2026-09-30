// ===== Operator console (platform-admin.html): formatting and rendering =====
// The data comes from the op_* database functions, which refuse anyone but a platform admin
// and return metadata only (counts, names, roles, dates) — never the content of records.

const OP_ROLE_LABELS = { owner: 'בעלים', admin: 'מנהל', site_user: 'משתמש אתר', contractor: 'קבלן' };
const OP_TABLE_LABELS = {
  concrete_pours: 'יציקות בטון', rebar_deliveries: 'משלוחי ברזל', prestressed_slabs: 'לוח״דים',
  vendor_submissions: 'הגשות לאישור', quality_controls: 'בקרת איכות', facility_file_items: 'תיק מתקן',
  exceptions: 'חריגים', tasks: 'משימות', weekly_work_plans: 'תכנית עבודה', weekly_meetings: 'סיכומי ישיבות',
  correspondence: 'יועצים ומתכננים', quantity_sheets: 'גיליונות כמויות', quantity_items: 'סעיפי כמויות',
  quantity_takeoffs: 'חישובי כמויות', price_quotes: 'הצעות מחיר', site_notices: 'הודעות', documents: 'מסמכים מצורפים',
};
const OP_ACTION_LABELS = {
  'company.suspend': 'השעיית חברה', 'company.activate': 'הפעלת חברה',
  'company.transfer_ownership': 'העברת בעלות', 'company.closing_scheduled': 'הודעת סגירה',
  'company.closing_cancelled': 'ביטול הודעת סגירה', 'user.block': 'חסימת משתמש',
  'user.unblock': 'שחרור חסימה', 'user.send_code': 'שליחת קוד כניסה',
};

function opEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function opFmtBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function opDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d}.${m}.${y}`;
}

function opAgo(iso, now = Date.now()) {
  if (!iso) return 'אף פעם';
  const days = Math.floor((now - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  if (days < 30) return `לפני ${days} ימים`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? 'לפני חודש' : `לפני ${months} חודשים`;
  const years = Math.floor(months / 12);
  return years === 1 ? 'לפני שנה' : `לפני ${years} שנים`;
}

function opFilterUsers(users, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return users;
  return users.filter(u => [u.full_name, u.username, u.email, ...(u.memberships || []).map(m => m.org)]
    .some(v => String(v || '').toLowerCase().includes(needle)));
}

// New records per week, as plain SVG bars (no chart library).
function opWeeklyChartSvg(weeks) {
  const max = Math.max(0, ...weeks.map(w => w.n));
  if (!max) return '<p class="empty-state">אין נתונים לתקופה</p>';
  const W = 36, gap = 8, H = 120, width = weeks.length * (W + gap);
  const bars = weeks.map((w, i) => {
    const h = Math.max(2, Math.round((w.n / max) * H));
    const x = i * (W + gap);
    return `<g><rect x="${x}" y="${H - h}" width="${W}" height="${h}" rx="4" class="op-bar"><title>${opEsc(w.n)}</title></rect>
      <text x="${x + W / 2}" y="${H + 16}" text-anchor="middle" class="op-bar-label">${opEsc(opDate(w.week).split('.').slice(0, 2).join('.'))}</text></g>`;
  }).join('');
  return `<svg class="op-chart" viewBox="0 0 ${width} ${H + 22}" role="img" aria-label="רשומות חדשות לפי שבוע">${bars}</svg>`;
}

function opMetric(label, value, hint = '') {
  return `<div class="op-metric"><span class="op-metric-label">${opEsc(label)}</span><strong>${opEsc(value)}</strong>${hint ? `<small>${opEsc(hint)}</small>` : ''}</div>`;
}

function opOverviewHtml(d) {
  const p = d.pending || {};
  const waiting = [
    [p.company_requests, 'בקשות לפתיחת חברה', '#companies'],
    [p.support_unread, 'פניות תמיכה עם הודעה חדשה', '#support'],
    [p.support_open, 'פניות תמיכה פתוחות', '#support'],
    [p.not_accepted, 'משתמשים שלא אישרו את התנאים', '#users'],
    [d.closing, 'חברות עם הודעת סגירה', '#companies'],
    [p.access_requests, 'בקשות גישה (מטופלות אצל בעלי החברות)', ''],
  ].filter(([n]) => n);
  const roles = Object.entries(d.roles || {}).map(([r, n]) => `${OP_ROLE_LABELS[r] || r}: ${n}`).join(' · ');
  return `
    <div class="op-metrics">
      ${opMetric('חברות', d.companies.total, `${d.companies.active} פעילות · ${d.companies.suspended} מושעות`)}
      ${opMetric('אתרים', d.sites)}
      ${opMetric('משתמשים', d.users, roles)}
      ${opMetric('נכנסו ב-7 ימים', d.active_7d, `${d.active_30d} ב-30 יום · ${d.never_signed_in} לא נכנסו מעולם`)}
      ${opMetric('רשומות', d.records)}
      ${opMetric('מסמכים', d.documents)}
      ${opMetric('אחסון', opFmtBytes(d.storage_bytes))}
      ${opMetric('חסומים', d.blocked)}
    </div>
    <div class="op-two">
      <section class="card"><div class="card-header"><h2>ממתין לך</h2></div>
        ${waiting.length ? `<ul class="op-waiting">${waiting.map(([n, label, href]) =>
          `<li>${href ? `<a href="${href}">` : ''}<strong>${opEsc(n)}</strong> ${opEsc(label)}${href ? '</a>' : ''}</li>`).join('')}</ul>`
          : '<p class="empty-state">אין דבר שממתין לך</p>'}
      </section>
      <section class="card"><div class="card-header"><h2>רשומות חדשות לפי שבוע</h2></div>${opWeeklyChartSvg(d.weekly || [])}</section>
    </div>`;
}

function opStatusPill(status, closingOn) {
  const base = status === 'active' ? '<span class="status-badge active">פעילה</span>' : '<span class="status-badge suspended">מושעית</span>';
  return closingOn ? `${base} <span class="status-badge closing">נסגרת ${opEsc(opDate(closingOn))}</span>` : base;
}

function opCompaniesHtml(rows) {
  if (!rows.length) return '<p class="empty-state">אין חברות עדיין</p>';
  return `<div class="table-wrap"><table class="op-table">
    <thead><tr><th>חברה</th><th>סטטוס</th><th>אתרים</th><th>משתמשים</th><th>רשומות</th><th>אחסון</th><th>פעילות אחרונה</th><th><span class="sr-only">פעולות</span></th></tr></thead>
    <tbody>${rows.map(o => {
      const last = [o.last_record_at, o.last_sign_in_at].filter(Boolean).sort().pop() || null;
      return `<tr>
        <td><strong>${opEsc(o.name)}</strong><br><span class="slug-chip">${opEsc(o.slug)}</span></td>
        <td>${opStatusPill(o.status, o.closing_on)}</td>
        <td class="num-cell">${opEsc(o.sites)}</td><td class="num-cell">${opEsc(o.users)}</td>
        <td class="num-cell">${opEsc(o.records)}</td><td class="num-cell">${opEsc(opFmtBytes(o.storage_bytes))}</td>
        <td>${opEsc(opAgo(last))}</td>
        <td><button class="btn btn-sm btn-outline" data-company="${opEsc(o.id)}">פרטים</button></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function opAuditHtml(rows) {
  if (!rows || !rows.length) return '<p class="empty-state">אין פעולות רשומות</p>';
  return `<ul class="op-audit">${rows.map(a => `<li>
      <time>${opEsc(new Date(a.at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</time>
      <strong>${opEsc(OP_ACTION_LABELS[a.action] || a.action)}</strong>${a.reason ? ` — ${opEsc(a.reason)}` : ''}
    </li>`).join('')}</ul>`;
}

function opCompanyHtml(c) {
  const o = c.org;
  const suspended = o.status !== 'active';
  const members = c.members || [];
  return `
    <div class="op-company-head">
      <div><h3>${opEsc(o.name)}</h3><span class="slug-chip">${opEsc(o.slug)}</span> ${opStatusPill(o.status, c.closing?.closing_on)}</div>
      <div class="header-actions">
        <button class="btn btn-sm btn-outline" data-act="support" title="צפייה בנתוני החברה לשעה, לצורך טיפול בפנייה">כניסה כתמיכה</button>
        ${suspended ? '<button class="btn btn-sm btn-primary" data-act="activate">הפעלה</button>'
                    : '<button class="btn btn-sm btn-outline" data-act="suspend">השעיה</button>'}
        <button class="btn btn-sm btn-outline" data-act="transfer">העברת בעלות</button>
        ${c.closing ? '<button class="btn btn-sm btn-outline" data-act="cancel-close">ביטול הודעת סגירה</button>'
                    : '<button class="btn btn-sm btn-outline" data-act="close">הודעת סגירה</button>'}
      </div>
    </div>
    ${c.closing ? `<p class="op-closing">הודעת סגירה: החברה נסגרת ב-${opEsc(opDate(c.closing.closing_on))}. ${opEsc(c.closing.reason || '')}</p>` : ''}
    <h4>אתרים (${(c.sites || []).length})</h4>
    <div class="table-wrap"><table class="op-table"><thead><tr><th>אתר</th><th>מיקום</th><th>רשומות</th><th>נוצר</th></tr></thead>
      <tbody>${(c.sites || []).map(s => `<tr><td>${opEsc(s.name)}</td><td>${opEsc(s.location || '')}</td><td class="num-cell">${opEsc(s.records)}</td><td>${opEsc(opDate(s.created_at))}</td></tr>`).join('')}</tbody></table></div>
    <h4>משתמשים (${members.length})</h4>
    <div class="table-wrap"><table class="op-table"><thead><tr><th>שם</th><th>תפקיד</th><th>כניסה אחרונה</th><th>מצב</th></tr></thead>
      <tbody>${members.map(m => `<tr>
        <td>${opEsc(m.full_name || m.username || '')}<br><small>${opEsc(m.email || '')}</small></td>
        <td>${opEsc(OP_ROLE_LABELS[m.role] || m.role)}</td><td>${opEsc(opAgo(m.last_sign_in_at))}</td>
        <td>${m.blocked ? '<span class="status-badge suspended">חסום</span> ' : ''}${m.accepted === false ? '<span class="status-badge closing">לא אישר תנאים</span>' : ''}</td>
      </tr>`).join('')}</tbody></table></div>
    <h4>שימוש לפי נושא</h4>
    ${(c.modules || []).length ? `<ul class="op-modules">${c.modules.map(m => `<li>${opEsc(OP_TABLE_LABELS[m.tbl] || m.tbl)}: <strong>${opEsc(m.n)}</strong> <small>(אחרון ${opEsc(opAgo(m.last_at))})</small></li>`).join('')}</ul>` : '<p class="empty-state">אין רשומות</p>'}
    <h4>פעולות אחרונות</h4>
    ${opAuditHtml(c.audit)}`;
}

function opUsersHtml(users, meId) {
  if (!users.length) return '<p class="empty-state">לא נמצאו משתמשים</p>';
  return `<div class="table-wrap"><table class="op-table">
    <thead><tr><th>משתמש</th><th>חברה ותפקיד</th><th>כניסה אחרונה</th><th>מצב</th><th><span class="sr-only">פעולות</span></th></tr></thead>
    <tbody>${users.map(u => {
      const canBlock = !u.platform_admin && u.id !== meId;
      const chips = [
        u.platform_admin ? '<span class="status-badge active">מנהל פלטפורמה</span>' : '',
        u.blocked ? '<span class="status-badge suspended">חסום</span>' : '',
        u.confirmed === false ? '<span class="status-badge closing">טרם הצטרף</span>' : '',
        u.accepted === false ? '<span class="status-badge closing">לא אישר תנאים</span>' : '',
      ].join(' ');
      return `<tr>
        <td><strong>${opEsc(u.full_name || u.username || '')}</strong><br><small>${opEsc(u.email || '')}</small></td>
        <td>${(u.memberships || []).map(m => `${opEsc(m.org)} — ${opEsc(OP_ROLE_LABELS[m.role] || m.role)}`).join('<br>') || '—'}</td>
        <td>${opEsc(opAgo(u.last_sign_in_at))}</td>
        <td>${chips}</td>
        <td class="row-actions"><div class="row-actions-inner">
          ${u.email ? `<button class="btn btn-sm btn-outline" data-code="${opEsc(u.id)}">קוד כניסה</button>` : ''}
          ${canBlock ? (u.blocked ? `<button class="btn btn-sm btn-outline" data-unblock="${opEsc(u.id)}">שחרור חסימה</button>`
                                  : `<button class="btn btn-sm btn-ghost" data-block="${opEsc(u.id)}">חסימה</button>`) : ''}
        </div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

// The database refuses in English; the operator reads Hebrew.
const OP_ERRORS = [
  [/cannot suspend a company you belong to/, 'לא ניתן להשעות חברה שאתה חבר בה'],
  [/a reason is required/, 'נדרשת סיבה'],
  [/new owner must be a member/, 'הבעלים החדש חייב להיות חבר בחברה (מנהל או משתמש אתר, לא קבלן)'],
  [/organization_closures_open_idx|duplicate key/, 'כבר קיימת הודעת סגירה פתוחה לחברה הזו'],
  [/no open closing notice/, 'אין הודעת סגירה פתוחה'],
  [/closing date must be in the future/, 'תאריך הסגירה חייב להיות בעתיד'],
  [/platform operator only/, 'פעולה למנהל הפלטפורמה בלבד'],
  [/company not found/, 'החברה לא נמצאה'],
];
function opErrorText(msg) {
  const hit = OP_ERRORS.find(([re]) => re.test(String(msg || '')));
  return hit ? hit[1] : String(msg || '');
}

// ---- monitoring tab ----
const OP_EVENT_KINDS = { permission: 'הרשאה', save: 'שמירה', load: 'טעינה', script: 'שגיאת קוד', other: 'אחר' };
Object.assign(OP_ACTION_LABELS, { 'announcement.create': 'פרסום הודעה', 'announcement.end': 'סיום הודעה' });

function opTime(iso) {
  return new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function opEventsHtml(d) {
  if (!d || !d.groups || !d.groups.length) return '<p class="empty-state">אין תקלות בתקופה הזו</p>';
  return `<div class="table-wrap"><table class="op-table">
    <thead><tr><th>סוג</th><th>דף</th><th>הודעה</th><th>פעמים</th><th>משתמשים</th><th>אחרונה</th></tr></thead>
    <tbody>${d.groups.map(g => `<tr>
      <td>${opEsc(OP_EVENT_KINDS[g.kind] || g.kind)}</td><td>${opEsc(g.page || '')}</td><td>${opEsc(g.message)}</td>
      <td class="num-cell">${opEsc(g.n)}</td><td class="num-cell">${opEsc(g.users)}</td><td>${opEsc(opAgo(g.last_at))}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function opAuditTableHtml(rows) {
  if (!rows || !rows.length) return '<p class="empty-state">אין פעולות רשומות</p>';
  return `<div class="table-wrap"><table class="op-table">
    <thead><tr><th>מתי</th><th>פעולה</th><th>חברה</th><th>מי</th><th>סיבה</th></tr></thead>
    <tbody>${rows.map(a => `<tr>
      <td>${opEsc(opTime(a.at))}</td><td>${opEsc(OP_ACTION_LABELS[a.action] || a.action)}</td>
      <td>${opEsc(a.org || '—')}</td><td>${opEsc(a.actor || '—')}</td><td>${opEsc(a.reason || '')}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function opPeopleListsHtml(users) {
  const never = users.filter(u => !u.last_sign_in_at);
  const notAccepted = users.filter(u => u.accepted === false);
  const list = rows => rows.length
    ? `<ul class="op-audit">${rows.map(u => `<li>${opEsc(u.full_name || u.username || '')} <small>${opEsc(u.email || '')}</small></li>`).join('')}</ul>`
    : '<p class="empty-state">אין</p>';
  return `<div class="op-two">
    <div><h4>לא נכנסו מעולם (${never.length})</h4>${list(never)}</div>
    <div><h4>לא אישרו את התנאים (${notAccepted.length})</h4>${list(notAccepted)}</div>
  </div>`;
}

// ---- announcements tab ----
function opAnnouncementsHtml(rows, orgNames = {}, now = Date.now()) {
  if (!rows || !rows.length) return '<p class="empty-state">עדיין לא פורסמו הודעות</p>';
  return `<ul class="op-ann-list">${rows.map(a => {
    const starts = Date.parse(a.starts_at), ends = Date.parse(a.ends_at);
    const status = ends <= now ? 'הסתיימה' : starts > now ? 'מתוזמנת' : 'פעילה';
    return `<li class="op-ann-item">
      <div><span class="status-badge ${status === 'פעילה' ? 'active' : status === 'מתוזמנת' ? 'closing' : 'suspended'}">${status}</span>
        ${a.level === 'warn' ? '<span class="status-badge closing">חשוב</span>' : ''}
        <strong>${opEsc(a.title)}</strong>
        <div><small>${opEsc(a.organization_id ? (orgNames[a.organization_id] || 'חברה') : 'כל המשתמשים')} · ${opEsc(opTime(a.starts_at))} — ${opEsc(opTime(a.ends_at))}</small></div>
        ${a.body ? `<div style="font-size:13px;">${opEsc(a.body)}</div>` : ''}</div>
      ${ends > now ? `<button class="btn btn-sm btn-outline" data-ann-end="${opEsc(a.id)}">סיום</button>` : ''}
    </li>`;
  }).join('')}</ul>`;
}

// ---- support access (op_start_support_session / op_end_support_session) ----
Object.assign(OP_ACTION_LABELS, { 'support.start': 'כניסת תמיכה', 'support.end': 'סיום כניסת תמיכה' });
OP_ERRORS.push(
  [/reason required/, 'נדרשת סיבה (3 תווים לפחות)'],
  [/ticket does not belong to this company/, 'הפנייה שנבחרה לא שייכת לחברה הזו'],
  [/company not found/, 'החברה לא נמצאה'],
);
