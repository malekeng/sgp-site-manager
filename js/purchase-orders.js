// ===== הזמנות רכש — the site's purchase orders: list, editor, lines and receiving =====
// Sums and checks come from purchase-core.js, the PDF from purchase-pdf.js; the sender's details and
// the numbering from rebar-orders-core.js. The database locks an issued order (guard triggers), so the
// buttons here only offer what the status allows.

const PO_LOCK_MSG = 'ההזמנה עודכנה על ידי משתמש אחר — רעננו';
const PO_REOPEN_Q = 'לפתוח את ההזמנה לעריכה? היא תחזור לטיוטה עד שתישלח שוב. אחרי השינויים לחצו "הפק PDF וסמן כנשלחה" ושלחו לספק את ה-PDF החדש.';
const PO_STATUS_TONE = { draft: 'open', sent: 'progress', partial: 'progress', complete: 'done', closed: 'open' };
const PO_TEXT_FIELDS = ['order_no', 'supplier', 'supplier_tax_id', 'supplier_contact', 'supplier_phone', 'supplier_email', 'payment_terms', 'delivery_address', 'notes'];
const PO_SUPPLIER_FIELDS = ['supplier_tax_id', 'supplier_contact', 'supplier_phone', 'supplier_email'];
const PO_GAP_LABEL = { tax_id: 'ח.פ', address: 'כתובת', phone: 'טלפון' };

const state = {
  ctx: null, company: null, orders: [], order: null, items: [], removedIds: [],
  dirty: false, loadedUpdatedAt: null, noTouched: true, senderFrom: null, senderOpen: null,
  supplierOrders: [], vendors: [], supplierFrom: null, supplierAuto: false,
  receipts: [], receiptItems: [], receiptDocs: {},
};
const rc = { file: null };

function poNowIso() { return new Date().toISOString(); }
function poToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// record ownership: an order is edited, sent, reopened, closed or deleted by its author or a project
// manager; anyone on the site may receive deliveries for it or copy it. A new order is the writer's own.
function poMine() { return !state.order || !state.order.id || canChangeRecord(state.order, window.sgpWho); }
function poIsDraft() { return (!state.order || state.order.status === 'draft') && poMine(); }
function poStatusPill(o) {
  const pill = `<span class="lic-status lic-status-${PO_STATUS_TONE[o.status] || 'open'}">${esc(REBAR_STATUS_LABELS[o.status] || o.status)}</span>`;
  return pill + (isOverdue(o, poToday()) ? ' <span class="lic-status lic-status-fail">באיחור</span>' : '');
}
function poMsg(text, type) { const el = document.getElementById('edMsg'); text ? showMsg(el, text, type || 'error') : hideMsg(el); }
function poNewLine() { return { sku: '', description: '', unit: PO_UNITS[0], qty: null, unit_price: null, discount_pct: 0, _dirty: true }; }
function poSuppliedHtml(pct) {
  return `<span class="supplied"><span class="supplied-bar"><i style="width:${pct}%"></i></span>${pct}%</span>`;
}

// ===== the two views =====
function poShow(view) {
  document.getElementById('listWrap').style.display = view === 'list' ? 'block' : 'none';
  document.getElementById('statsRow').style.display = view === 'list' ? '' : 'none';
  document.getElementById('editorWrap').style.display = view === 'editor' ? 'block' : 'none';
  window.scrollTo(0, 0);
}

function poLeaveOk() { return !state.dirty || confirm('יש שינויים שלא נשמרו — לצאת?'); }

async function poGo() {
  const route = poRoute(location.hash);
  if (!poLeaveOk()) {   // stay: the address goes back to the order on screen
    history.replaceState(null, '', state.order && state.order.id ? '#o=' + state.order.id : '#new');
    return;
  }
  state.dirty = false;
  if (route.mode === 'new') return poNewOrder();
  if (route.mode === 'open') return poOpenOrder(route.id);
  return poShowList();
}

// ===== the list =====
async function poShowList() {
  const site = state.ctx.site;
  const [{ data: orders, error }, { data: items }, { data: arrived }] = await Promise.all([
    sb.from('purchase_orders').select('*').eq('site_id', site.id).order('created_at', { ascending: false }),
    sb.from('purchase_order_items').select('id, order_id, qty, unit_price, discount_pct').eq('site_id', site.id),
    sb.from('purchase_receipt_items').select('item_id, qty_received').eq('site_id', site.id),
  ]);
  if (error) { toast(poDbError(error), 'error'); return; }
  state.order = null;
  const byOrder = {};
  for (const it of items || []) (byOrder[it.order_id] ||= []).push(it);
  const today = poToday();
  const rows = (orders || []).map(o => {
    const lines = byOrder[o.id] || [];
    return { o, total: poTotals(lines, o.vat_pct).total, pct: poProgress(lines, arrived || []) };
  });
  const open = rows.filter(r => ['sent', 'partial'].includes(r.o.status));
  document.getElementById('statsRow').innerHTML = [
    statCardHtml({ ico: 'outgoing', label: 'הזמנות פתוחות', value: open.length }),
    statCardHtml({ ico: 'prices', label: 'סה"כ בהזמנות פתוחות (₪)', value: esc(poMoney(open.reduce((a, r) => a + r.total, 0))) }),
    statCardHtml({ ico: 'tasks', label: 'טיוטות', value: rows.filter(r => r.o.status === 'draft').length }),
    statCardHtml({ ico: 'exceptions', label: 'באיחור', value: rows.filter(r => isOverdue(r.o, today)).length }),
  ].join('');
  document.getElementById('listBody').innerHTML = rows.map(({ o, total, pct }) => `
    <tr data-open="${o.id}" class="${isOverdue(o, today) ? 'is-overdue' : ''}">
      <td><a href="#o=${o.id}">${esc(o.order_no)}</a></td>
      <td>${o.supplier ? esc(o.supplier) : '<span class="cell-muted">—</span>'}</td>
      <td>${esc(fmtDate(o.order_date))}</td>
      <td>${o.required_date ? esc(fmtDate(o.required_date)) : '<span class="cell-muted">—</span>'}</td>
      <td class="num-cell">${esc(poMoney(total))}</td>
      <td>${o.status === 'draft' ? '<span class="cell-muted">—</span>' : poSuppliedHtml(pct)}</td>
      <td>${poStatusPill(o)}</td>
    </tr>`).join('') || '<tr class="empty-row"><td colspan="7">עדיין אין הזמנות רכש באתר הזה</td></tr>';
  document.getElementById('newBtn').style.display = inSupportMode() ? 'none' : '';
  poShow('list');
}

// ===== open / new / duplicate =====
async function poOpenOrder(id) {
  const [{ data: order, error }, { data: items, error: e2 }] = await Promise.all([
    sb.from('purchase_orders').select('*').eq('id', id).single(),
    sb.from('purchase_order_items').select('*').eq('order_id', id).order('line_no'),
  ]);
  if (error || e2) { toast(poDbError(error || e2), 'error'); return poShowList(); }
  Object.assign(state, { order, items: items || [], removedIds: [], dirty: false, loadedUpdatedAt: order.updated_at, noTouched: false,
    senderFrom: null, senderOpen: null, supplierFrom: null, supplierAuto: false });
  if (poIsDraft() && !state.items.length) state.items = [poNewLine()];
  await poLoadReceipts(id);
  poShow('editor');
  poRenderEditor();
}

async function poSiteNos() {
  const site = state.ctx.site;
  const [{ data: a }, { data: b }] = await Promise.all([
    sb.from('rebar_orders').select('order_no').eq('site_id', site.id),
    sb.from('purchase_orders').select('order_no').eq('site_id', site.id),
  ]);
  return { rebar: (a || []).map(r => r.order_no), purchase: (b || []).map(r => r.order_no) };
}
async function poFreshNo() {
  const nos = await poSiteNos();
  return poNextNo(nos.rebar, nos.purchase, new Date());
}

// Suppliers the company already ordered from: their names for the field, their details for the next order.
async function poLoadSuppliers() {
  const { site, org } = state.ctx;
  const cols = 'order_no, supplier, supplier_tax_id, supplier_contact, supplier_phone, supplier_email, payment_terms, created_at';
  const [{ data: pos }, { data: rebar }, { data: deliveries }, { data: vendors }] = await Promise.all([
    sb.from('purchase_orders').select(cols + ', sites!inner(organization_id)').eq('sites.organization_id', org.id),
    sb.from('rebar_orders').select('supplier').eq('site_id', site.id),
    sb.from('rebar_deliveries').select('supplier').eq('site_id', site.id),
    sb.from('vendor_submissions').select('name, reg_number, contact_person, phone, email').eq('site_id', site.id).eq('submission_type', 'supplier'),
  ]);
  state.supplierOrders = pos || [];
  state.vendors = vendors || [];
  document.getElementById('supplierList').innerHTML = poSupplierNames(pos || [], rebar || [], deliveries || [], vendors || [])
    .map(n => `<option value="${esc(n)}">`).join('');
}

// A new order fills itself: the orderer from the account, the delivery from the site's last order of
// either kind (or the site's address the first time).
async function poNewOrder() {
  const { profile, site } = state.ctx;
  const lastOf = table => sb.from(table).select('order_no, delivery_address, contacts').eq('site_id', site.id).order('created_at', { ascending: false }).limit(1);
  const [{ data: a }, { data: b }] = await Promise.all([lastOf('purchase_orders'), lastOf('rebar_orders')]);
  const d = rebarOrderDefaults({ last: (a || [])[0] || (b || [])[0] || null, site, profile });
  state.order = {
    status: 'draft', order_no: await poFreshNo(), order_date: poToday(), required_date: null, supplier: '', supplier_tax_id: '',
    supplier_contact: '', supplier_phone: '', supplier_email: '', payment_terms: PO_PAYMENT_TERMS, delivery_address: d.delivery_address,
    notes: '', vat_pct: PO_VAT_PCT, orderer: d.orderer, contacts: d.contacts,
  };
  Object.assign(state, { items: [poNewLine()], removedIds: [], dirty: false, loadedUpdatedAt: null, noTouched: true,
    receipts: [], receiptItems: [], receiptDocs: {}, senderFrom: d.from_order, senderOpen: null, supplierFrom: null, supplierAuto: false });
  await poLoadSuppliers();
  poShow('editor');
  poRenderEditor();
}

async function poCopyOrder() {
  const source = state.order;
  const copy = poDuplicate(source, state.items.filter(it => !poLineBlank(it)), await poFreshNo());
  copy.order.order_date = poToday();
  copy.order.required_date = null;
  Object.assign(state, { order: copy.order, items: copy.items.map(it => ({ ...it, _dirty: true })), removedIds: [], loadedUpdatedAt: null, noTouched: true,
    receipts: [], receiptItems: [], receiptDocs: {}, senderFrom: null, senderOpen: null, supplierFrom: null, supplierAuto: false });
  state.dirty = true;
  history.replaceState(null, '', '#new');
  poRenderEditor();
  toast(`נוצר עותק של הזמנה ${source.order_no} — בדקו ושמרו`, 'success');
}

// ===== the editor =====
function poRenderEditor() {
  const o = state.order, draft = poIsDraft();
  document.getElementById('edTitle').textContent = o.id ? `הזמנה ${o.order_no}` : 'הזמנה חדשה';
  document.getElementById('edStatus').innerHTML = o.id ? poStatusPill(o) : '';
  const set = (k, v) => { const el = document.getElementById('f-' + k); el.value = v ?? ''; el.disabled = !draft; };
  PO_TEXT_FIELDS.forEach(k => set(k, o[k]));
  set('order_date', o.order_date); set('required_date', o.required_date); set('vat_pct', o.vat_pct ?? PO_VAT_PCT);
  document.getElementById('supplierTitle').innerHTML = `${ico3d('suppliers', 26)}פרטי הספק`;
  document.getElementById('linesTitle').innerHTML = `${ico3d('materials', 26)}פריטים`;
  document.getElementById('addLineWrap').style.display = draft ? '' : 'none';
  document.getElementById('addContactBtn').style.display = draft ? '' : 'none';
  document.getElementById('notesField').style.display = draft || o.notes ? '' : 'none';
  poRenderSupplierHint();
  poRenderContacts();
  poRenderSender();
  poRenderActions();
  poRenderLines();
  poRenderTotals();
  poRenderReceipts();
  poMsg('');
}

function poRenderActions() {
  const o = state.order, s = o.status, mine = poMine(), canWrite = !inSupportMode();
  const pdf = label => `<img class="ico3d" src="icons/nav/pdf.webp" alt="" aria-hidden="true" width="20" height="20">${label}`;
  const b = [];
  if (s === 'draft' && mine) {
    b.push('<button class="btn btn-primary" data-act="save">שמור</button>');
    b.push(`<button class="btn btn-outline" data-act="issue">${pdf('הפק PDF וסמן כנשלחה')}</button>`);
  }
  if (o.id) b.push(`<button class="btn btn-outline" data-act="pdf">${pdf(s === 'draft' ? 'PDF טיוטה' : 'PDF')}</button>`);
  if (canWrite && ['sent', 'partial', 'complete'].includes(s)) b.unshift(`<button class="btn btn-primary" data-act="receive">${ico3d('incoming', 20)} קבלת משלוח</button>`);
  if (canWrite && (s === 'sent' || s === 'partial')) b.splice(1, 0, `<button class="btn btn-outline" data-act="receive-all">${uiIcon('check')} התקבלה כל ההזמנה</button>`);
  if (mine && s === 'sent' && !state.receipts.length) b.push(`<button class="btn btn-outline" data-act="reopen">${uiIcon('lock-open')} פתח לעריכה</button>`);
  if (mine && (s === 'sent' || s === 'partial')) b.push(`<button class="btn btn-outline" data-act="close">${uiIcon('lock')} סגור הזמנה</button>`);
  if (canWrite && o.id) b.push(`<button class="btn btn-outline" data-act="dup">${uiIcon('copy')} שכפול</button>`);
  // an order that received nothing can be deleted; otherwise it is closed
  if (mine && o.id && !state.receipts.length) b.push(`<button class="btn btn-danger" data-act="delete">${uiIcon('trash')} מחק</button>`);
  if (!mine) b.push(`<span class="cell-muted" style="align-self:center;font-size:12px;">${uiIcon('lock', 13)} רק מי שרשם את ההזמנה או מנהל הפרויקט יכולים לשנות אותה</span>`);
  b.push('<button class="btn btn-outline" data-act="back">חזרה לרשימה</button>');
  document.getElementById('edActions').innerHTML = b.join('');
}

function poRenderSupplierHint() {
  const from = state.supplierFrom;
  document.getElementById('supplierHint').textContent = from ? `הפרטים מההזמנה הקודמת לספק הזה (${from})` : '';
}

function poRenderContacts() {
  const draft = poIsDraft(), list = state.order.contacts || [];
  document.getElementById('contactsList').innerHTML = list.map((c, i) => `
    <div class="contact-row" data-i="${i}">
      <input data-k="name" placeholder="שם" value="${esc(c.name || '')}" ${draft ? '' : 'disabled'}>
      <input data-k="phone" placeholder="טלפון" inputmode="tel" value="${esc(c.phone || '')}" ${draft ? '' : 'disabled'}>
      <input data-k="role" placeholder="תפקיד" value="${esc(c.role || '')}" ${draft ? '' : 'disabled'}>
      ${draft ? `<button type="button" class="icon-btn danger" data-del-contact="${i}" title="הסרה" aria-label="הסרה">${uiIcon('trash')}</button>` : '<span></span>'}
    </div>`).join('') || '<div class="cell-muted">—</div>';
}

// ---- "המזמין והאספקה": three summary lines; the fields open under them for a draft ----
function poRenderSender() {
  const o = state.order, draft = poIsDraft(), c = state.company || {}, who = o.orderer || {}, { profile } = state.ctx;
  const gaps = rebarSenderGaps({ company: c, orderer: who, order: o });
  const join = parts => parts.filter(x => String(x || '').trim()).map(esc).join(' · ');
  const companyGap = gaps.company.length
    ? `<span class="sender-gap">חסרים פרטי חברה: ${gaps.company.map(k => PO_GAP_LABEL[k]).join(', ')} · ${profile.role === 'owner' ? '<a href="org-settings.html">להשלמה בהגדרות החברה</a>' : 'בעל החברה ישלים'}</span>` : '';
  const contacts = (o.contacts || []).map(x => [x.name, x.phone].filter(Boolean).join(' ')).filter(Boolean).join(', ');
  const deliveryGap = draft && gaps.delivery.length
    ? `<span class="sender-gap">חסר: ${gaps.delivery.map(k => (k === 'address' ? 'כתובת לאספקה' : 'איש קשר עם טלפון')).join(', ')}</span>` : '';
  const from = state.senderFrom ? `<span class="sender-from">מההזמנה הקודמת באתר ${esc(state.senderFrom)}</span>` : '';
  document.getElementById('senderSummary').innerHTML = `
    <div class="sender-line"><span class="sender-k">חברה</span><span class="sender-v">${join([c.name, c.tax_id ? 'ח.פ ' + c.tax_id : '', c.address, c.phone]) || '—'}${companyGap}</span></div>
    <div class="sender-line"><span class="sender-k">מזמין</span><span class="sender-v">${join([who.name, who.phone, who.email]) || '—'}</span></div>
    <div class="sender-line"><span class="sender-k">אספקה</span><span class="sender-v">${join([o.delivery_address, contacts]) || '—'}${from}${deliveryGap}</span></div>`;
  // the card opens by itself once per order, when the delivery lacks what the supplier needs
  if (state.senderOpen === null || state.senderOpen === undefined) state.senderOpen = draft && gaps.delivery.length > 0;
  const open = !!(draft && state.senderOpen);
  document.getElementById('senderCard').classList.toggle('is-open', open);
  const t = document.getElementById('senderToggle');
  t.style.display = draft ? '' : 'none';
  t.textContent = open ? 'סגירה' : 'עריכה';
  t.setAttribute('aria-expanded', String(open));
}

// header inputs → state.order (called on every input, so the order object is always current)
function poReadHeader() {
  const o = state.order, v = k => document.getElementById('f-' + k).value;
  for (const k of PO_TEXT_FIELDS) o[k] = v(k).trim() || (k === 'order_no' ? '' : null);
  o.order_date = v('order_date') || null;
  o.required_date = v('required_date') || null;
  o.vat_pct = parseNum(v('vat_pct'));
  o.contacts = [...document.querySelectorAll('#contactsList .contact-row')].map(row => ({
    name: row.querySelector('[data-k=name]').value.trim(),
    phone: row.querySelector('[data-k=phone]').value.trim(),
    role: row.querySelector('[data-k=role]').value.trim(),
  })).filter(c => c.name || c.phone);
}

function poHeaderErrors() {
  const o = state.order, e = [];
  if (!o.order_no) e.push('חסר מספר הזמנה');
  if (!o.order_date) e.push('חסר תאריך הזמנה');
  if (o.vat_pct === null || o.vat_pct < 0 || o.vat_pct > 100) e.push('מע"מ — מספר בין 0 ל-100');
  return e;
}

// A supplier known from before fills its details. Moving on to an unknown one clears what was filled,
// so one supplier's phone never goes out on another's order; details somebody typed stay.
function poApplySupplier() {
  const o = state.order, found = poSupplierDetails(o.supplier, state.supplierOrders, state.vendors);
  const put = (k, v) => { o[k] = v || null; document.getElementById('f-' + k).value = v || ''; };
  if (found) {
    PO_SUPPLIER_FIELDS.forEach(k => put(k, found[k]));
    if (found.payment_terms) put('payment_terms', found.payment_terms);
    state.supplierFrom = found.from_order;
    state.supplierAuto = true;
  } else if (state.supplierAuto) {
    PO_SUPPLIER_FIELDS.forEach(k => put(k, ''));
    state.supplierFrom = null;
    state.supplierAuto = false;
  }
  poRenderSupplierHint();
}

// ===== lines =====
function poLineRow(it, i, draft, got) {
  const v = x => (x === null || x === undefined ? '' : esc(String(x)));
  const total = `<td class="num-cell po-c-total" data-l='סה"כ (₪)' data-total="${i}">${esc(poMoney(poLineTotal(it)))}</td>`;
  if (draft) {
    const units = [...new Set([...PO_UNITS, it.unit].filter(Boolean))].map(u => `<option value="${esc(u)}"${u === it.unit ? ' selected' : ''}>${esc(u)}</option>`).join('');
    return `<tr data-i="${i}">
      <td class="po-c-no">${i + 1}</td>
      <td class="po-c-sku" data-l='מק"ט'><input data-f="sku" maxlength="40" value="${v(it.sku)}" aria-label='מק"ט שורה ${i + 1}'></td>
      <td class="po-c-desc" data-l="תיאור הפריט"><input data-f="description" maxlength="300" value="${v(it.description)}" aria-label="תיאור שורה ${i + 1}"></td>
      <td class="po-c-unit" data-l="יחידה"><select data-f="unit" aria-label="יחידה שורה ${i + 1}">${units}</select></td>
      <td class="po-c-qty" data-l="כמות"><input data-f="qty" inputmode="decimal" value="${v(it.qty)}" aria-label="כמות שורה ${i + 1}"></td>
      <td class="po-c-price" data-l="מחיר ליחידה (₪)"><input data-f="unit_price" inputmode="decimal" value="${v(it.unit_price)}" aria-label="מחיר שורה ${i + 1}"></td>
      <td class="po-c-disc" data-l="הנחה %"><input data-f="discount_pct" inputmode="decimal" value="${Number(it.discount_pct) ? v(it.discount_pct) : ''}" placeholder="0" aria-label="הנחה שורה ${i + 1}"></td>
      ${total}
      <td class="po-c-del"><button type="button" class="icon-btn danger" data-del-line="${i}" title="מחיקת השורה" aria-label="מחיקת שורה ${i + 1}">${uiIcon('trash')}</button></td>
    </tr>`;
  }
  const arrived = got[it.id] || 0;
  return `<tr>
    <td class="po-c-no">${i + 1}</td>
    <td class="po-c-sku" data-l='מק"ט'>${it.sku ? esc(it.sku) : '<span class="cell-muted">—</span>'}</td>
    <td class="po-c-desc" data-l="תיאור הפריט">${esc(it.description)}</td>
    <td class="po-c-unit" data-l="יחידה">${esc(it.unit)}</td>
    <td class="num-cell po-c-qty" data-l="כמות">${esc(poQty(it.qty))}</td>
    <td class="num-cell po-c-price" data-l="מחיר ליחידה (₪)">${esc(poMoney(it.unit_price))}</td>
    <td class="num-cell po-c-disc" data-l="הנחה %">${Number(it.discount_pct) ? esc(poQty(it.discount_pct)) : '<span class="cell-muted">—</span>'}</td>
    ${total}
    <td class="num-cell" data-l="סופק">${esc(poQty(arrived))}</td>
  </tr>`;
}

function poRenderLines() {
  const draft = poIsDraft(), got = poReceived(state.receiptItems);
  const heads = ["מס'", 'מק"ט', 'תיאור הפריט', 'יחידה', 'כמות', 'מחיר ליחידה (₪)', 'הנחה %', 'סה"כ (₪)'];
  document.getElementById('linesHost').innerHTML = `
    <table class="po-table po-lines">
      <thead><tr>${heads.map(h => `<th>${esc(h)}</th>`).join('')}<th>${draft ? '<span class="sr-only">פעולות</span>' : 'סופק'}</th></tr></thead>
      <tbody>${state.items.map((it, i) => poLineRow(it, i, draft, got)).join('') || '<tr class="empty-row"><td colspan="9">אין שורות</td></tr>'}</tbody>
    </table>`;
}

function poRenderTotals() {
  const t = poTotals(state.items, state.order.vat_pct);
  document.getElementById('totNet').textContent = poMoney(t.net) + ' ₪';
  document.getElementById('totVat').textContent = poMoney(t.vat) + ' ₪';
  document.getElementById('totSum').textContent = poMoney(t.total) + ' ₪';
}

function poAddLine() {
  state.items.push(poNewLine());
  poRenderLines();
  const rows = document.querySelectorAll('#linesHost tbody tr');
  rows[rows.length - 1].querySelector('[data-f=description]').focus();
}

function poDeleteLine(i) {
  const [it] = state.items.splice(i, 1);
  if (it && it.id) state.removedIds.push(it.id);
  if (!state.items.length) state.items.push(poNewLine());
  state.dirty = true;
  poRenderLines();
  poRenderTotals();
}

// ===== save =====
// The header is always written first: its updated_at check is the lock for the whole order, so a
// second editor's save stops before touching any line.
async function poSave() {
  poReadHeader();
  const o = state.order, { user, site } = state.ctx;
  for (const it of state.items) if (poLineBlank(it) && it.id) state.removedIds.push(it.id);
  const lines = state.items.filter(it => !poLineBlank(it));
  const errs = poHeaderErrors();
  lines.forEach((it, i) => { const e = poLineErrors(it); if (e.length) errs.push(`שורה ${i + 1}: ${e.join(', ')}`); });
  if (errs.length) { poMsg(errs.join(' · ')); return false; }
  const head = {
    order_no: o.order_no, order_date: o.order_date, required_date: o.required_date, supplier: o.supplier, supplier_tax_id: o.supplier_tax_id,
    supplier_contact: o.supplier_contact, supplier_phone: o.supplier_phone, supplier_email: o.supplier_email, payment_terms: o.payment_terms,
    delivery_address: o.delivery_address, notes: o.notes, vat_pct: o.vat_pct, orderer: o.orderer || {}, contacts: o.contacts || [],
    updated_by: user.id, updated_at: poNowIso(),
  };
  let saved;
  if (!o.id) {
    const insert = () => sb.from('purchase_orders').insert({ ...head, site_id: site.id, created_by: user.id, status: 'draft' }).select('*').single();
    let res = await insert();
    if (res.error && res.error.code === '23505' && state.noTouched) {   // someone took this number a moment ago
      head.order_no = await poFreshNo();
      res = await insert();
    }
    if (res.error) { poMsg(poDbError(res.error)); return false; }
    saved = res.data;
  } else {
    const { data, error } = await sb.from('purchase_orders').update(head).eq('id', o.id).eq('updated_at', state.loadedUpdatedAt).select('*');
    if (error) { poMsg(poDbError(error)); return false; }
    if (!data || !data.length) { poMsg(PO_LOCK_MSG); toast(PO_LOCK_MSG, 'error'); return false; }
    saved = data[0];
  }
  state.order = { ...saved };
  state.loadedUpdatedAt = saved.updated_at;
  history.replaceState(null, '', '#o=' + saved.id);

  // the lines: removed, changed, new — numbered 1..n
  try {
    if (state.removedIds.length) {
      const { error } = await sb.from('purchase_order_items').delete().in('id', state.removedIds);
      if (error) throw error;
      state.removedIds = [];
    }
    let no = 0;
    for (const it of lines) {
      no++;
      if (it.line_no !== no) { it.line_no = no; it._dirty = true; }
      const row = { line_no: no, ...Object.fromEntries(PO_ITEM_COLS.map(k => [k, it[k] ?? null])), discount_pct: Number(it.discount_pct) || 0 };
      if (it.id) {
        if (!it._dirty) continue;
        const { error } = await sb.from('purchase_order_items').update({ ...row, updated_by: user.id, updated_at: poNowIso() }).eq('id', it.id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from('purchase_order_items').insert({ ...row, site_id: site.id, order_id: saved.id, created_by: user.id }).select('id').single();
        if (error) throw error;
        it.id = data.id;
      }
      it._dirty = false;
    }
  } catch (err) {
    state.items = lines.length ? lines : [poNewLine()];
    poRenderEditor();
    poMsg(poDbError(err));
    return false;
  }
  state.items = lines.length ? lines : [poNewLine()];
  state.dirty = false;
  poRenderEditor();
  toast('ההזמנה נשמרה', 'success');
  return true;
}

// a status change, under the same edit lock
async function poSetStatus(patch, okText) {
  const { user } = state.ctx;
  const { data, error } = await sb.from('purchase_orders').update({ ...patch, updated_by: user.id, updated_at: poNowIso() })
    .eq('id', state.order.id).eq('updated_at', state.loadedUpdatedAt).select('*');
  if (error) { toast(poDbError(error), 'error'); return false; }
  if (!data || !data.length) { toast(PO_LOCK_MSG, 'error'); return false; }
  state.order = data[0];
  state.loadedUpdatedAt = data[0].updated_at;
  if (poIsDraft() && !state.items.length) state.items = [poNewLine()];
  poRenderEditor();
  if (okText) toast(okText, 'success');
  return true;
}

async function poDelete() {
  const o = state.order;
  if (!confirm(`למחוק את ההזמנה ${o.order_no}? הפעולה אינה הפיכה.`)) return;
  const { data, error } = await sb.from('purchase_orders').delete().eq('id', o.id).eq('updated_at', state.loadedUpdatedAt).select('id');
  if (error) { toast(poDbError(error), 'error'); return; }
  if (!data || !data.length) { toast(PO_LOCK_MSG, 'error'); return; }
  state.dirty = false;
  toast('ההזמנה נמחקה', 'success');
  location.hash = '';
}

async function poConfirmClose() {
  const reason = document.getElementById('closeReason').value.trim();
  if (!reason) { showMsg(document.getElementById('closeMsg'), 'יש לכתוב סיבת סגירה', 'error'); return; }
  if (await poSetStatus({ status: 'closed', close_reason: reason }, 'ההזמנה נסגרה')) {
    document.getElementById('closeBackdrop').classList.remove('open');
  }
}

// "PDF" any time: the file again, nothing else changes (a draft says so on the sheet)
async function poDownloadPdf() {
  if (state.dirty && !(await poSave())) return;
  try {
    toast('מפיק PDF…');
    const items = state.items.filter(it => !poLineBlank(it));
    const blob = await poExportPdf({ order: state.order, items, site: state.ctx.site, company: state.company });
    await rebarShareOrDownload(blob, poFileName(state.order));
  } catch (err) {
    console.error(err);
    toast('שגיאה ביצירת ה-PDF: ' + err.message, 'error');
  }
}

// "הפק PDF וסמן כנשלחה": save, make the PDF, mark it sent, share
async function poIssue() {
  poReadHeader();
  if (!state.items.some(it => !poLineBlank(it))) { poMsg(poDbError({ message: 'purchase_order_needs_items' })); return; }
  if (!state.order.supplier) { poMsg(poDbError({ message: 'purchase_order_needs_supplier' })); document.getElementById('f-supplier').focus(); return; }
  if (!(await poSave())) return;
  try {
    toast('מפיק PDF…');
    const blob = await poExportPdf({ order: { ...state.order, status: 'sent' }, items: state.items, site: state.ctx.site, company: state.company });
    if (!(await poSetStatus({ status: 'sent' }, 'ההזמנה סומנה כנשלחה'))) return;
    await rebarShareOrDownload(blob, poFileName(state.order));
  } catch (err) {
    console.error(err);
    toast('שגיאה ביצירת ה-PDF: ' + (err.message || err), 'error');
  }
}

async function poAction(act) {
  if (act === 'save') return poSave();
  if (act === 'issue') return poIssue();
  if (act === 'pdf') return poDownloadPdf();
  if (act === 'back') { location.hash = ''; return; }
  if (act === 'dup') {
    if (!poLeaveOk()) return;
    return poCopyOrder();
  }
  if (act === 'delete') return poDelete();
  if (act === 'close') {
    document.getElementById('closeReason').value = '';
    hideMsg(document.getElementById('closeMsg'));
    document.getElementById('closeBackdrop').classList.add('open');
    return;
  }
  if (act === 'reopen') {
    if (!confirm(PO_REOPEN_Q)) return;
    return poSetStatus({ status: 'draft' }, 'ההזמנה חזרה לטיוטה');
  }
  if (act === 'receive') return poOpenReceiptDialog();
  if (act === 'receive-all') return poReceiveAll();
}

// ===== receiving =====
async function poLoadReceipts(id) {
  Object.assign(state, { receipts: [], receiptItems: [], receiptDocs: {} });
  const { data: receipts } = await sb.from('purchase_receipts').select('*').eq('order_id', id).order('received_on', { ascending: false });
  state.receipts = receipts || [];
  if (!state.receipts.length) return;
  const ids = state.receipts.map(r => r.id);
  const [{ data: lines }, { data: docs }] = await Promise.all([
    sb.from('purchase_receipt_items').select('*').in('receipt_id', ids),
    sb.from('documents').select('id, file_name, file_path, linked_record_id').eq('linked_table', 'purchase_receipts').in('linked_record_id', ids),
  ]);
  state.receiptItems = lines || [];
  for (const d of docs || []) (state.receiptDocs[d.linked_record_id] ||= []).push(d);
}

function poRenderReceipts() {
  const host = document.getElementById('receiptsHost'), o = state.order;
  if (!o || o.status === 'draft') { host.innerHTML = ''; return; }
  const byReceipt = {};
  for (const l of state.receiptItems) (byReceipt[l.receipt_id] ||= []).push(l);
  const canDelete = o.status !== 'closed';
  const rows = state.receipts.map(r => {
    const docs = (state.receiptDocs[r.id] || []).map(d => `<button class="btn btn-ghost btn-sm" data-rc-doc="${esc(d.file_path)}">${uiIcon('paperclip', 13)} ${esc(d.file_name)}</button>`).join('');
    return `<tr>
      <td>${esc(fmtDate(r.received_on))}</td>
      <td class="num-cell">${(byReceipt[r.id] || []).length}</td>
      <td>${r.notes ? esc(r.notes) : '<span class="cell-muted">—</span>'}</td>
      <td>${docs || '<span class="cell-muted">—</span>'}</td>
      <td class="row-actions">${canDelete && canChangeRecord(r, window.sgpWho) ? `<div class="row-actions-inner"><button class="icon-btn danger" data-rc-del="${r.id}" title="מחיקת הקבלה" aria-label="מחיקת הקבלה">${uiIcon('trash')}</button></div>` : ''}</td>
    </tr>`;
  }).join('');
  host.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2 class="with-ico">${ico3d('incoming', 26)}קבלות</h2>
        <div class="header-actions"><div class="unit-totals"><span class="unit-pill">סופק ${poProgress(state.items, state.receiptItems)}%</span></div></div>
      </div>
      <div class="table-wrap">
        <table class="po-table">
          <thead><tr><th>תאריך</th><th>שורות</th><th>הערות</th><th>קובץ</th><th><span class="sr-only">פעולות</span></th></tr></thead>
          <tbody>${rows || '<tr class="empty-row"><td colspan="5">עדיין לא נקלט משלוח להזמנה הזו</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

async function poDeleteReceipt(id) {
  const r = state.receipts.find(x => x.id === id);
  if (!r || !confirm('למחוק את הקבלה? השורות שסומנו בה יחזרו ל"נותר", והתעודה המצורפת תימחק.')) return;
  const docs = state.receiptDocs[id] || [];
  const { error } = await sb.from('purchase_receipts').delete().eq('id', id);
  if (error) { toast(poDbError(error), 'error'); return; }
  if (docs.length) {
    await sb.from('documents').delete().in('id', docs.map(d => d.id));
    await sb.storage.from('documents').remove(docs.map(d => d.file_path));
  }
  toast('הקבלה נמחקה', 'success');
  await poOpenOrder(state.order.id);
}

async function poOpenReceiptDoc(path) {
  const { data, error } = await sb.storage.from('documents').createSignedUrl(path, 3600);
  if (error || !data) { toast('לא ניתן לפתוח את הקובץ', 'error'); return; }
  window.open(data.signedUrl, '_blank', 'noopener');
}

function poOpenReceiptDialog() {
  rc.file = null;
  const lines = state.items.map(it => {
    const left = poRemaining(it, state.receiptItems);
    return `<tr>
      <td>${esc(it.description)}</td>
      <td class="num-cell">${esc(poQty(it.qty))} ${esc(it.unit)}</td>
      <td class="num-cell">${esc(poQty(left))}</td>
      <td><input type="checkbox" data-rc-all="${it.id}" aria-label="הגיע הכל" ${left ? '' : 'disabled'}></td>
      <td><input inputmode="decimal" data-rc-qty="${it.id}" placeholder="0" aria-label="כמות שהגיעה"></td>
    </tr>`;
  }).join('');
  document.getElementById('receiptModal').innerHTML = `
    <button class="icon-btn modal-close" data-rc-x aria-label="סגירה">${uiIcon('x', 18)}</button>
    <h3>קבלת משלוח — הזמנה ${esc(state.order.order_no)}</h3>
    <div id="rcMsg" class="msg"></div>
    <div class="ocr-zone" id="rcZone">
      <img class="zone-ico" src="icons/nav/scan.webp" alt="" aria-hidden="true" width="44" height="44">
      <div id="rcZoneText">צלמו או גררו כאן את תעודת המשלוח (תמונה או PDF)</div>
      <input type="file" id="rcFile" accept="image/*,.pdf" style="display:none;">
    </div>
    <div class="form-grid">
      <div class="field"><label for="rcDate">תאריך קבלה</label><input type="date" id="rcDate" value="${poToday()}"></div>
      <div class="field"><label for="rcNotes">הערות</label><input id="rcNotes" maxlength="300"></div>
    </div>
    <div class="card-header" style="margin-top:14px;padding:0;"><h2 style="font-size:15px;">מה הגיע</h2>
      <div class="header-actions"><button type="button" class="btn btn-outline btn-sm" data-rc-mark>סמן הכל</button></div></div>
    <div class="table-wrap"><table class="po-table rc-lines">
      <thead><tr><th>פריט</th><th>הוזמן</th><th>נותר</th><th>הגיע הכל</th><th>כמות שהגיעה</th></tr></thead>
      <tbody>${lines}</tbody></table></div>
    <div class="modal-actions">
      <button type="button" class="btn btn-primary" data-rc-save>שמור</button>
      <button type="button" class="btn btn-outline" data-rc-x>ביטול</button>
    </div>`;
  document.getElementById('receiptBackdrop').classList.add('open');
}

function poPickReceiptFile(file) {
  rc.file = file;
  document.getElementById('rcZoneText').textContent = file.name;
}

async function poSaveReceipt() {
  const msg = document.getElementById('rcMsg');
  const typed = [...document.querySelectorAll('#receiptModal [data-rc-qty]')].filter(el => el.value.trim());
  const bad = typed.filter(el => !(parseNum(el.value) > 0));
  if (bad.length) { showMsg(msg, 'כמות — מספר גדול מ-0', 'error'); bad[0].focus(); return; }
  if (!typed.length) { showMsg(msg, 'סמנו לפחות שורה אחת שהגיעה', 'error'); return; }
  const lines = typed.map(el => ({ item_id: el.dataset.rcQty, qty: parseNum(el.value) }));
  const { user, site } = state.ctx, o = state.order;
  const btn = document.querySelector('#receiptModal [data-rc-save]');
  btn.disabled = true;
  let receiptId = null, path = null;
  try {
    const { data: receipt, error } = await sb.from('purchase_receipts').insert({
      site_id: site.id, order_id: o.id, received_on: document.getElementById('rcDate').value || poToday(),
      notes: document.getElementById('rcNotes').value.trim() || null, created_by: user.id,
    }).select('id').single();
    if (error) throw error;
    receiptId = receipt.id;
    const { error: e2 } = await sb.from('purchase_receipt_items').insert(lines.map(l => ({
      site_id: site.id, receipt_id: receiptId, item_id: l.item_id, qty_received: l.qty, created_by: user.id,
    })));
    if (e2) throw e2;
    if (rc.file) {
      const ext = (rc.file.name.split('.').pop() || 'pdf').toLowerCase();
      path = `${site.id}/purchase_receipts/${receiptId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: up } = await sb.storage.from('documents').upload(path, rc.file);
      if (up) { path = null; throw up; }
      const { error: e3 } = await sb.from('documents').insert({
        site_id: site.id, doc_type: 'delivery_note', title: rc.file.name, file_path: path, file_name: rc.file.name,
        file_size: rc.file.size, linked_table: 'purchase_receipts', linked_record_id: receiptId, uploaded_by: user.id,
      });
      if (e3) throw e3;
    }
  } catch (err) {
    // no half receipt: take back what was written
    if (path) await sb.storage.from('documents').remove([path]);
    if (receiptId) await sb.from('purchase_receipts').delete().eq('id', receiptId);
    btn.disabled = false;
    showMsg(msg, poDbError(err), 'error');
    return;
  }
  document.getElementById('receiptBackdrop').classList.remove('open');
  toast('הקבלה נשמרה', 'success');
  await poOpenOrder(o.id);
}

// "התקבלה כל ההזמנה": one receipt, dated today, for everything still owed on the order
async function poReceiveAll() {
  const o = state.order;
  if (!o || !['sent', 'partial'].includes(o.status)) return;
  const lines = poReceiveAllLines(state.items, state.receiptItems);
  if (!lines.length) { toast('כל השורות כבר התקבלו'); return; }
  const rest = state.receipts.length ? 'כל מה שנשאר' : 'כל ההזמנה';
  if (!confirm(`לרשום ש${rest} בהזמנה ${o.order_no} התקבל היום (${lines.length} שורות)?

אפשר למחוק את הקבלה אחר כך אם נרשמה בטעות.`)) return;
  const { user, site } = state.ctx;
  let receiptId = null;
  try {
    const { data: receipt, error } = await sb.from('purchase_receipts').insert({
      site_id: site.id, order_id: o.id, received_on: poToday(), notes: 'התקבלה כל ההזמנה', created_by: user.id,
    }).select('id').single();
    if (error) throw error;
    receiptId = receipt.id;
    const { error: e2 } = await sb.from('purchase_receipt_items').insert(lines.map(l => ({
      site_id: site.id, receipt_id: receiptId, item_id: l.item_id, qty_received: l.qty, created_by: user.id,
    })));
    if (e2) throw e2;
  } catch (err) {
    if (receiptId) await sb.from('purchase_receipts').delete().eq('id', receiptId);   // no half receipt
    toast(poDbError(err), 'error');
    return;
  }
  toast('נרשם שכל ההזמנה התקבלה', 'success');
  await poOpenOrder(o.id);
}

function poReceiptEvents() {
  const modal = document.getElementById('receiptModal');
  modal.addEventListener('click', e => {
    if (e.target.closest('[data-rc-x]')) { document.getElementById('receiptBackdrop').classList.remove('open'); return; }
    if (e.target.closest('[data-rc-save]')) { poSaveReceipt(); return; }
    if (e.target.id === 'rcFile') return;
    if (e.target.closest('#rcZone')) { document.getElementById('rcFile').click(); return; }
    if (e.target.closest('[data-rc-mark]')) {
      modal.querySelectorAll('[data-rc-all]:not(:disabled)').forEach(cb => { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
    }
  });
  modal.addEventListener('change', e => {
    if (e.target.id === 'rcFile' && e.target.files[0]) { poPickReceiptFile(e.target.files[0]); return; }
    const all = e.target.closest('[data-rc-all]');
    if (all) {
      const it = state.items.find(i => i.id === all.dataset.rcAll);
      modal.querySelector(`[data-rc-qty="${all.dataset.rcAll}"]`).value = all.checked ? String(poRemaining(it, state.receiptItems)) : '';
    }
  });
  modal.addEventListener('dragover', e => { const z = e.target.closest('#rcZone'); if (z) { e.preventDefault(); z.classList.add('dragover'); } });
  modal.addEventListener('dragleave', e => { const z = e.target.closest('#rcZone'); if (z) z.classList.remove('dragover'); });
  modal.addEventListener('drop', e => {
    const z = e.target.closest('#rcZone');
    if (!z) return;
    e.preventDefault(); z.classList.remove('dragover');
    if (e.dataTransfer.files[0]) poPickReceiptFile(e.dataTransfer.files[0]);
  });
}

// ===== start =====
(async function () {
  const auth = await requireAuth('purchase-orders.html');
  if (!auth) return;
  state.ctx = auth;
  // the company's details for the summary and the PDF (the session's company holds only name and logo)
  const { data: company } = await sb.from('organizations').select('name, tax_id, address, phone, email').eq('id', auth.org.id).single();
  state.company = company || { name: auth.org.name };

  const wrap = document.getElementById('editorWrap');
  document.getElementById('edActions').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (b) poAction(b.dataset.act);
  });
  wrap.addEventListener('input', e => {
    if (!poIsDraft() || !e.target.id.startsWith('f-') && !e.target.closest('#contactsList')) return;
    if (e.target.id === 'f-order_no') state.noTouched = false;
    poReadHeader();
    state.dirty = true;
    if (e.target.id === 'f-vat_pct') poRenderTotals();
    if (e.target.closest('#senderEdit')) poRenderSender();
  });
  // on `change`, not `input`: a name being typed must not wipe or fill anything half-way
  document.getElementById('f-supplier').addEventListener('change', () => { if (poIsDraft()) { poReadHeader(); poApplySupplier(); } });
  for (const id of ['headerForm', 'supplierForm']) document.getElementById(id).addEventListener('submit', e => e.preventDefault());
  document.getElementById('senderToggle').addEventListener('click', () => {
    state.senderOpen = !state.senderOpen;
    poRenderSender();
  });
  document.getElementById('addContactBtn').addEventListener('click', () => {
    poReadHeader();
    state.order.contacts = [...(state.order.contacts || []), { name: '', phone: '', role: '' }];
    poRenderContacts();
    state.dirty = true;
    poRenderSender();
  });
  document.getElementById('contactsList').addEventListener('click', e => {
    const del = e.target.closest('[data-del-contact]');
    if (!del) return;
    document.querySelectorAll('#contactsList .contact-row')[Number(del.dataset.delContact)].remove();
    poReadHeader();
    poRenderContacts();
    state.dirty = true;
    poRenderSender();
  });

  document.getElementById('addLineBtn').addEventListener('click', poAddLine);
  const host = document.getElementById('linesHost');
  const typed = e => {
    const f = e.target.dataset.f, row = e.target.closest('tr[data-i]');
    if (!f || !row || !poIsDraft()) return;
    const i = Number(row.dataset.i), it = state.items[i];
    it[f] = ['qty', 'unit_price', 'discount_pct'].includes(f) ? parseNum(e.target.value) : e.target.value;
    it._dirty = true;
    state.dirty = true;
    host.querySelector(`[data-total="${i}"]`).textContent = poMoney(poLineTotal(it));
    poRenderTotals();
  };
  host.addEventListener('input', typed);
  host.addEventListener('change', typed);   // the unit is a select
  host.addEventListener('click', e => {
    const del = e.target.closest('[data-del-line]');
    if (del && poIsDraft()) poDeleteLine(Number(del.dataset.delLine));
  });

  document.getElementById('closeConfirm').addEventListener('click', poConfirmClose);
  for (const id of ['closeCancel', 'closeX']) {
    document.getElementById(id).addEventListener('click', () => document.getElementById('closeBackdrop').classList.remove('open'));
  }
  poReceiptEvents();
  document.getElementById('receiptsHost').addEventListener('click', e => {
    const del = e.target.closest('[data-rc-del]');
    if (del) { poDeleteReceipt(del.dataset.rcDel); return; }
    const doc = e.target.closest('[data-rc-doc]');
    if (doc) poOpenReceiptDoc(doc.dataset.rcDoc);
  });

  document.getElementById('newBtn').addEventListener('click', () => { location.hash = 'new'; });
  document.getElementById('listBody').addEventListener('click', e => {
    const row = e.target.closest('tr[data-open]');
    if (row && !e.target.closest('a')) location.hash = 'o=' + row.dataset.open;
  });
  window.addEventListener('hashchange', poGo);
  window.addEventListener('beforeunload', e => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });
  await poLoadSuppliers();
  await poGo();
})();
