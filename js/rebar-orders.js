// ===== הזמנות ברזל — the site's rebar orders: list, editor, lines and summary =====
// Weights come from rebar-calc.js, shapes from rebar-shapes.js, rows and checks from
// rebar-orders-core.js; the PDF from rebar-pdf.js. The database locks an issued order
// (guard triggers), so the buttons here only offer what the status allows.

const RO_LOCK_MSG = 'ההזמנה עודכנה על ידי משתמש אחר — רעננו';
const RO_REOPEN_Q = 'לפתוח את ההזמנה לעריכה? היא תחזור לטיוטה ותצא ממעקב האספקה עד שתישלח שוב. אחרי השינויים לחצו "הפק PDF וסמן כנשלחה" ושלחו לספק את ה-PDF החדש.';
const RO_STATUS_TONE = { draft: 'open', sent: 'progress', partial: 'progress', complete: 'done', closed: 'open' };
const RO_SECTIONS = {
  bar: { title: 'מוטות', add: '+ הוספת מוט', item: 'מוט' },
  mesh: { title: 'רשתות', add: '+ הוספת רשת', item: 'רשת' },
  pile: { title: 'כלונסאות', add: '+ הוספת כלונס', item: 'כלונס' },
  element: { title: 'אלמנטים', add: '+ הוספת אלמנט', item: 'אלמנט' },
};
// the add-items window's tabs: a ליפט is a quick way to a straight-bar line
const RO_WINDOW_TABS = [['bar', 'מוט'], ['lift', 'ליפט'], ['mesh', 'רשת'], ['pile', 'כלונס'], ['element', 'אלמנט']];
const RO_KIND_RANK = { bar: 0, mesh: 1, pile: 2, element: 3 };
const RO_PILE_ADDITIONS = ['אוזניים', 'טבעות', 'צינורות גמא'];
const RO_ITEM_COLS = ['kind', 'line_no', 'alias', 'note', 'steel', 'diameter_mm', 'qty', 'length_cm', 'shape', 'params', 'unit_kg', 'total_kg'];

const state = {
  ctx: null, orders: [], order: null, items: [], removedIds: [],
  dirty: false, loadedUpdatedAt: null, noTouched: true,
  receipts: [], receiptItems: [], receiptDocs: {},   // phase 2: what arrived
};

function roNowIso() { return new Date().toISOString(); }
function roToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function roIsDraft() { return !state.order || state.order.status === 'draft'; }
function roStatusPill(o) {
  const pill = `<span class="lic-status lic-status-${RO_STATUS_TONE[o.status] || 'open'}">${esc(REBAR_STATUS_LABELS[o.status] || o.status)}</span>`;
  return pill + (isOverdue(o, roToday()) ? ` <span class="lic-status lic-status-fail">באיחור</span>` : '');
}
function roTons(kg) { return fmtNum((Number(kg) || 0) / 1000, 2); }
function roMsg(text, type) { const el = document.getElementById('edMsg'); text ? showMsg(el, text, type || 'error') : hideMsg(el); }

// ===== open / new / duplicate =====
// the order screen only shows one order; the orders themselves are listed in the ברזל page
function roShow(view) {
  document.getElementById('editorWrap').style.display = view === 'editor' ? 'block' : 'none';
  window.scrollTo(0, 0);
}

function roLeaveOk() {
  return !state.dirty || confirm('יש שינויים שלא נשמרו — לצאת?');
}

function roBackToRebar(query = '') {
  if (!roLeaveOk()) return;
  state.dirty = false;
  location.href = 'rebar.html' + query;
}

async function roOpenOrder(id) {
  const [{ data: order, error }, { data: items, error: e2 }] = await Promise.all([
    sb.from('rebar_orders').select('*').eq('id', id).single(),
    sb.from('rebar_order_items').select('*').eq('order_id', id).order('line_no'),
  ]);
  if (error || e2) { toast(rebarDbError(error || e2), 'error'); return; }
  Object.assign(state, {
    order, items: (items || []).sort((a, b) => RO_KIND_RANK[a.kind] - RO_KIND_RANK[b.kind] || a.line_no - b.line_no),
    removedIds: [], dirty: false, loadedUpdatedAt: order.updated_at, noTouched: false,
  });
  await roLoadReceipts(id);
  history.replaceState(null, '', '#o=' + id);
  roShow('editor');
  roRenderEditor();
}

async function roSiteOrderNos() {
  const { data } = await sb.from('rebar_orders').select('order_no').eq('site_id', state.ctx.site.id);
  return (data || []).map(r => r.order_no);
}

async function roNewOrder() {
  const { profile, site } = state.ctx;
  const orderer = { name: profile.full_name || profile.username || '', phone: profile.phone || '', email: profile.email || '' };
  state.order = {
    status: 'draft', order_no: nextOrderNo(await roSiteOrderNos(), new Date()), name: '', supplier: '', required_date: null,
    delivery_address: site.location || '', driver_notes: '', waste_pct: 3, orderer,
    contacts: [{ name: orderer.name, phone: orderer.phone, role: 'מזמין' }],
  };
  Object.assign(state, { items: [], removedIds: [], dirty: false, loadedUpdatedAt: null, noTouched: true, receipts: [], receiptItems: [], receiptDocs: {} });
  history.replaceState(null, '', '#new');
  roShow('editor');
  roRenderEditor();
}

async function roDuplicate(id) {
  if (state.order && state.order.id !== id && !roLeaveOk()) return;
  const [{ data: order }, { data: items }] = await Promise.all([
    sb.from('rebar_orders').select('*').eq('id', id).single(),
    sb.from('rebar_order_items').select('*').eq('order_id', id).order('line_no'),
  ]);
  if (!order) { toast('ההזמנה לא נמצאה', 'error'); return; }
  const copy = duplicateOrder(order, items || [], nextOrderNo(await roSiteOrderNos(), new Date()));
  copy.order.name = order.name;
  Object.assign(state, { order: copy.order, items: copy.items, removedIds: [], loadedUpdatedAt: null, noTouched: true, receipts: [], receiptItems: [], receiptDocs: {} });
  state.dirty = true;
  history.replaceState(null, '', '#new');
  roShow('editor');
  roRenderEditor();
  toast(`נוצר עותק של הזמנה ${order.order_no} — בדקו ושמרו`, 'success');
}

// ===== the editor =====
function roRenderEditor() {
  const o = state.order, draft = roIsDraft();
  document.getElementById('edTitle').textContent = o.id ? `הזמנה ${o.order_no}` : 'הזמנה חדשה';
  document.getElementById('edStatus').innerHTML = o.id ? roStatusPill(o) : '';
  const set = (k, v) => { const el = document.getElementById('f-' + k); el.value = v ?? ''; el.disabled = !draft; };
  set('name', o.name); set('order_no', o.order_no); set('supplier', o.supplier); set('required_date', o.required_date);
  set('delivery_address', o.delivery_address); set('driver_notes', o.driver_notes); set('waste_pct', o.waste_pct ?? 3);
  const who = o.orderer || {};
  document.getElementById('ordererLine').textContent = [who.name, who.phone, who.email].filter(Boolean).join(' · ') || '—';
  roRenderContacts();
  document.getElementById('addContactBtn').style.display = draft ? '' : 'none';
  roRenderActions();
  roRenderSections();
  roRenderReceipts();
  roRenderSummary();
  roMsg('');
}

function roRenderActions() {
  const o = state.order, s = o.status;
  const pdf = label => `<img class="ico3d" src="icons/nav/pdf.webp" alt="" aria-hidden="true" width="20" height="20">${label}`;
  const b = [];
  if (s === 'draft') {
    b.push(`<button class="btn btn-primary" data-act="save">שמור</button>`);
    b.push(`<button class="btn btn-outline" data-act="issue">${pdf('הפק PDF וסמן כנשלחה')}</button>`);
  } else {
    b.push(`<button class="btn btn-outline" data-act="pdf">${pdf('PDF')}</button>`);
  }
  if (['sent', 'partial', 'complete'].includes(s)) b.unshift(`<button class="btn btn-primary" data-act="receive">${ico3d('incoming', 20)} קבלת משלוח</button>`);
  if (s === 'sent' && !state.receipts.length) b.push(`<button class="btn btn-outline" data-act="reopen">${uiIcon('lock-open')} פתח לעריכה</button>`);
  if (s === 'sent' || s === 'partial') b.push(`<button class="btn btn-outline" data-act="close">${uiIcon('lock')} סגור הזמנה</button>`);
  if (o.id) b.push(`<button class="btn btn-outline" data-act="dup">${uiIcon('copy')} שכפול</button>`);
  // an order that received nothing can be deleted (its tracking row goes with it); otherwise it is closed
  if (o.id && !state.receipts.length) b.push(`<button class="btn btn-danger" data-act="delete">${uiIcon('trash')} מחק</button>`);
  b.push(`<button class="btn btn-outline" data-act="back">חזרה לברזל</button>`);
  document.getElementById('edActions').innerHTML = b.join('');
}

function roRenderContacts() {
  const draft = roIsDraft();
  const list = state.order.contacts || [];
  document.getElementById('contactsList').innerHTML = list.map((c, i) => `
    <div class="contact-row" data-i="${i}">
      <input data-k="name" placeholder="שם" value="${esc(c.name || '')}" ${draft ? '' : 'disabled'}>
      <input data-k="phone" placeholder="טלפון" inputmode="tel" value="${esc(c.phone || '')}" ${draft ? '' : 'disabled'}>
      <input data-k="role" placeholder="תפקיד" value="${esc(c.role || '')}" ${draft ? '' : 'disabled'}>
      ${draft ? `<button type="button" class="icon-btn danger" data-del-contact="${i}" title="הסרה" aria-label="הסרה">${uiIcon('trash')}</button>` : '<span></span>'}
    </div>`).join('') || '<div class="cell-muted">—</div>';
}

function roMarkDirty() {
  state.dirty = true;
}

// header inputs → state.order (called on every input, so the order object is always current)
function roReadHeader() {
  const o = state.order, v = k => document.getElementById('f-' + k).value;
  o.name = v('name').trim();
  o.order_no = v('order_no').trim();
  o.supplier = v('supplier').trim() || null;
  o.required_date = v('required_date') || null;
  o.delivery_address = v('delivery_address').trim() || null;
  o.driver_notes = v('driver_notes').trim() || null;
  o.waste_pct = parseNum(v('waste_pct'));
  o.contacts = [...document.querySelectorAll('#contactsList .contact-row')].map(row => ({
    name: row.querySelector('[data-k=name]').value.trim(),
    phone: row.querySelector('[data-k=phone]').value.trim(),
    role: row.querySelector('[data-k=role]').value.trim(),
  })).filter(c => c.name || c.phone);
}

function roHeaderErrors() {
  const o = state.order, e = [];
  if (!o.name) e.push('חסר שם להזמנה');
  if (!o.order_no) e.push('חסר מספר הזמנה');
  if (o.waste_pct === null || o.waste_pct < 0 || o.waste_pct > 20) e.push('פחת — מספר בין 0 ל-20');
  return e;
}

// Saves the header (with the edit lock) and then the lines. The header is always written
// first: its updated_at check is the lock for the whole order, so a second editor's save
// stops before touching any line.
async function saveOrder() {
  roReadHeader();
  const errs = roHeaderErrors();
  if (errs.length) { roMsg(errs.join(' · ')); return false; }
  const { user, site } = state.ctx, o = state.order;
  const head = {
    order_no: o.order_no, name: o.name, supplier: o.supplier, required_date: o.required_date,
    delivery_address: o.delivery_address, driver_notes: o.driver_notes, waste_pct: o.waste_pct,
    orderer: o.orderer || {}, contacts: o.contacts || [], updated_by: user.id, updated_at: roNowIso(),
  };
  let saved;
  if (!o.id) {
    const insert = () => sb.from('rebar_orders').insert({ ...head, site_id: site.id, created_by: user.id, status: 'draft', source: 'tadok' }).select('*').single();
    let res = await insert();
    if (res.error && res.error.code === '23505' && state.noTouched) {   // someone took this number a moment ago
      head.order_no = nextOrderNo(await roSiteOrderNos(), new Date());
      res = await insert();
    }
    if (res.error) { roMsg(rebarDbError(res.error)); return false; }
    saved = res.data;
  } else {
    const { data, error } = await sb.from('rebar_orders').update(head).eq('id', o.id).eq('updated_at', state.loadedUpdatedAt).select('*');
    if (error) { roMsg(rebarDbError(error)); return false; }
    if (!data || !data.length) { roMsg(RO_LOCK_MSG); toast(RO_LOCK_MSG, 'error'); return false; }
    saved = data[0];
  }
  state.order = { ...saved };
  state.loadedUpdatedAt = saved.updated_at;
  history.replaceState(null, '', '#o=' + saved.id);

  // the lines: removed, changed, new — numbered 1..n within each section
  try {
    if (state.removedIds.length) {
      const { error } = await sb.from('rebar_order_items').delete().in('id', state.removedIds);
      if (error) throw error;
      state.removedIds = [];
    }
    const counters = { bar: 0, mesh: 0, pile: 0, element: 0 };
    for (const it of state.items) {
      const no = ++counters[it.kind];
      if (it.line_no !== no) { it.line_no = no; it._dirty = true; }
      const row = Object.fromEntries(RO_ITEM_COLS.map(k => [k, it[k] ?? null]));
      if (it.id) {
        if (!it._dirty) continue;
        const { error } = await sb.from('rebar_order_items').update({ ...row, updated_by: user.id, updated_at: roNowIso() }).eq('id', it.id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from('rebar_order_items').insert({ ...row, site_id: site.id, order_id: saved.id, created_by: user.id }).select('id').single();
        if (error) throw error;
        it.id = data.id;
      }
      it._dirty = false;
    }
  } catch (err) {
    roMsg(rebarDbError(err));
    roRenderEditor();
    return false;
  }
  state.dirty = false;
  roRenderEditor();
  toast('ההזמנה נשמרה', 'success');
  return true;
}

// a status change, under the same edit lock
async function roSetStatus(patch, okText) {
  const { user } = state.ctx;
  const { data, error } = await sb.from('rebar_orders').update({ ...patch, updated_by: user.id, updated_at: roNowIso() })
    .eq('id', state.order.id).eq('updated_at', state.loadedUpdatedAt).select('*');
  if (error) { toast(rebarDbError(error), 'error'); return false; }
  if (!data || !data.length) { toast(RO_LOCK_MSG, 'error'); return false; }
  state.order = data[0];
  state.loadedUpdatedAt = data[0].updated_at;
  roRenderEditor();
  if (okText) toast(okText, 'success');
  return true;
}

async function roDelete() {
  const o = state.order;
  const question = o.status === 'draft' ? `למחוק את הטיוטה ${o.order_no}? הפעולה אינה הפיכה.`
    : `למחוק את ההזמנה ${o.order_no}? היא תימחק גם ממעקב אספקת הברזל. הפעולה אינה הפיכה.`;
  if (!confirm(question)) return;
  const { data, error } = await sb.from('rebar_orders').delete().eq('id', o.id).eq('updated_at', state.loadedUpdatedAt).select('id');
  if (error) { toast(rebarDeleteError(error), 'error'); return; }
  if (!data || !data.length) { toast(RO_LOCK_MSG, 'error'); return; }
  state.dirty = false;
  roBackToRebar('?deleted=' + encodeURIComponent(o.order_no));
}

function roOpenClose() {
  document.getElementById('closeReason').value = '';
  hideMsg(document.getElementById('closeMsg'));
  document.getElementById('closeBackdrop').classList.add('open');
}

async function roConfirmClose() {
  const reason = document.getElementById('closeReason').value.trim();
  if (!reason) { showMsg(document.getElementById('closeMsg'), 'יש לכתוב סיבת סגירה', 'error'); return; }
  if (await roSetStatus({ status: 'closed', close_reason: reason }, 'ההזמנה נסגרה')) {
    document.getElementById('closeBackdrop').classList.remove('open');
  }
}

async function roAction(act) {
  if (act === 'save') return saveOrder();
  if (act === 'back') return roBackToRebar();
  if (act === 'dup') return roDuplicate(state.order.id);
  if (act === 'delete') return roDelete();
  if (act === 'close') return roOpenClose();
  if (act === 'reopen') {
    if (!confirm(RO_REOPEN_Q)) return;
    return roSetStatus({ status: 'draft' }, 'ההזמנה חזרה לטיוטה');
  }
  if (act === 'receive') return roOpenReceiptDialog();
  if (act === 'issue') {
    if (typeof rebarIssue === 'function') return rebarIssue();
    return toast('הפקת PDF אינה זמינה כרגע', 'error');
  }
  if (act === 'pdf') {
    if (typeof rebarDownloadPdf === 'function') return rebarDownloadPdf();
    return toast('הפקת PDF אינה זמינה כרגע', 'error');
  }
}

// ===== lines: sections and summary =====
function roSectionRows(kind) {
  return state.items.map((it, idx) => ({ it, idx })).filter(x => x.it.kind === kind);
}

function roLineCells(it) {
  const c = itemCalc(it);
  const approx = c.approx ? ' <span class="approx-badge">חישוב משוער</span>' : '';
  if (it.kind === 'bar') {
    const drawing = it.shape ? `<span class="shape-thumb">${shapeSvg(it.shape, { w: 150, h: 60, stroke: 1.6 })}</span>` : '<span class="cell-muted">כמו בקובץ</span>';
    const note = it.note ? `<div class="cell-note">${esc(it.note)}</div>` : '';   // a lift: "2 ליפטים × 632"
    return `<td>${drawing}</td><td>${it.alias ? esc(it.alias) : '<span class="cell-muted">—</span>'}${note}</td><td>${esc(it.steel)}</td>
      <td class="num-cell">${esc(fmtNum(it.diameter_mm, 1))}</td><td class="num-cell">${esc(fmtNum(it.length_cm, 1))}${approx}</td>`;
  }
  if (it.kind === 'mesh') {
    const p = it.params || {};
    const step = p.type === 'asym' ? `@${p.s} / @${p.s_x}` : `@${p.s}`;
    const d = p.type === 'asym' ? `${fmtNum(it.diameter_mm, 1)} / ${fmtNum(p.d_y, 1)}` : fmtNum(it.diameter_mm, 1);
    return `<td>${it.alias ? esc(it.alias) : '<span class="cell-muted">—</span>'}</td><td>${p.type === 'asym' ? 'א-סימטרי' : 'סימטרי'}${approx}</td>
      <td class="num-cell"><bdi dir="ltr">${esc(`${p.x}×${p.y}`)}</bdi></td><td class="num-cell"><bdi dir="ltr">${esc(d)}</bdi></td><td class="num-cell"><bdi dir="ltr">${esc(step)}</bdi></td><td>${esc(it.steel)}</td>`;
  }
  if (it.kind === 'element') {
    const svg = elementSvg(it.params, { w: 150, h: 60, stroke: 1.6 });
    return `<td>${svg ? `<span class="shape-thumb">${svg}</span>` : '<span class="cell-muted">—</span>'}</td>
      <td>${it.alias ? esc(it.alias) : '<span class="cell-muted">—</span>'}</td><td>${esc(elementLabel(it))}${approx}</td>
      <td>${it.params && it.params.type === 'kranz' ? `<bdi dir="ltr">${esc(elementDesc(it))}</bdi>` : esc(elementDesc(it))}</td>`;
  }
  const p = it.params || {};
  return `<td>${it.alias ? esc(it.alias) : '<span class="cell-muted">—</span>'}</td><td>${esc(p.pile_type || 'בסיס')}</td>
    <td class="num-cell"><bdi dir="ltr">${esc(`${p.d}/${p.D}`)}</bdi></td><td class="num-cell"><bdi dir="ltr">${esc(`${p.n}×Ø${fmtNum(it.diameter_mm, 1)}`)}</bdi></td>
    <td class="num-cell">${esc(fmtNum(it.length_cm, 1))}</td><td class="num-cell"><bdi dir="ltr">${esc(`Ø${p.d_spiral} @${p.p1}/@${p.p2}`)}</bdi></td>`;
}

const RO_SECTION_HEADS = {
  bar: ['שרטוט', 'כינוי', 'סוג פלדה', 'קוטר (מ״מ)', 'אורך (ס״מ)'],
  mesh: ['כינוי', 'סוג רשת', 'X×Y (ס״מ)', 'קוטר (מ״מ)', 'פסיעה (ס״מ)', 'סוג פלדה'],
  pile: ['כינוי', 'סוג כלונס', 'd/D (ס״מ)', 'מוטות', 'אורך (ס״מ)', 'ספירלה'],
  element: ['שרטוט', 'כינוי', 'סוג', 'פירוט'],
};

function roRenderSections() {
  const draft = roIsDraft();
  const sum = orderSummary(state.items, state.order.waste_pct ?? 3);
  const track = !draft;                                     // issued orders show what arrived per line
  const prog = track ? orderProgress(state.items, state.receiptItems) : null;
  document.getElementById('sectionsHost').innerHTML = Object.entries(RO_SECTIONS).map(([kind, sec]) => {
    const rows = roSectionRows(kind);
    const heads = RO_SECTION_HEADS[kind];
    const cols = heads.length + 5 + (track ? 1 : 0);
    const totals = sum.sections[kind];
    const body = rows.length ? rows.map(({ it, idx }, n) => {
      const c = itemCalc(it);
      return `<tr>
        <td class="num-cell">${n + 1}</td>${roLineCells(it)}
        <td class="num-cell">${esc(fmtNum(it.qty, 0))}</td>
        <td class="num-cell">${c.weighed ? esc(fmtNum(c.unit_kg, 2)) : '<span class="cell-muted">—</span>'}</td>
        <td class="num-cell"><strong>${c.weighed ? esc(fmtNum(c.total_kg, 2)) : '—'}</strong></td>
        ${track ? roLineSupplied(prog.lines[it.id]) : ''}
        <td class="row-actions">${draft ? `<div class="row-actions-inner">
          <button class="icon-btn" data-edit-line="${idx}" title="עריכה" aria-label="עריכה">${uiIcon('pencil')}</button>
          <button class="icon-btn" data-copy-line="${idx}" title="שכפול שורה" aria-label="שכפול שורה">${uiIcon('copy')}</button>
          <button class="icon-btn danger" data-del-line="${idx}" title="מחיקה" aria-label="מחיקה">${uiIcon('trash')}</button>
        </div>` : ''}</td>
      </tr>`;
    }).join('') : `<tr class="empty-row"><td colspan="${cols}">אין ${sec.title === 'מוטות' ? 'מוטות' : sec.title} בהזמנה</td></tr>`;
    return `
      <div class="card">
        <div class="card-header">
          <h2>${sec.title}</h2>
          <div class="header-actions">
            <div class="unit-totals"><span class="unit-pill">${esc(fmtNum(totals.units, 0))} יח׳</span><span class="unit-pill">${roTons(totals.kg)} טון</span></div>
            ${draft && kind === 'bar' ? '<button class="btn btn-outline" data-add="lift">+ ליפט</button>' : ''}
            ${draft ? `<button class="btn btn-primary" data-add="${kind}">${sec.add}</button>` : ''}
          </div>
        </div>
        <div class="table-wrap">
          <table class="items-table">
            <thead><tr><th>מס'</th>${heads.map(h => `<th>${h}</th>`).join('')}<th>כמות</th><th>משקל יחידה (ק״ג)</th><th>סה״כ (ק״ג)</th>${track ? '<th>סופק</th>' : ''}<th><span class="sr-only">פעולות</span></th></tr></thead>
            <tbody>${body}</tbody>
            ${rows.length ? `<tfoot><tr><td colspan="${heads.length + 1}" style="text-align:left;font-weight:800;">סה״כ ${sec.title}</td>
              <td class="num-cell" style="font-weight:800;">${esc(fmtNum(totals.units, 0))}</td><td></td>
              <td class="num-cell" style="font-weight:800;">${esc(fmtNum(totals.kg, 2))}</td>${track ? '<td></td>' : ''}<td></td></tr></tfoot>` : ''}
          </table>
        </div>
      </div>`;
  }).join('');
}

// a line's delivered share: received / ordered, with a small bar
function roLineSupplied(line) {
  const l = line || { ordered: 0, received: 0 };
  const pct = l.ordered ? Math.round(100 * Math.min(l.received, l.ordered) / l.ordered) : 0;
  return `<td><span class="supplied"><span class="supplied-bar"><i style="width:${pct}%"></i></span>${esc(fmtNum(l.received, 0))} / ${esc(fmtNum(l.ordered, 0))}</span></td>`;
}

function roRenderSummary() {
  const pct = state.order.waste_pct ?? 3;
  const s = orderSummary(state.items, pct);
  const n4 = v => fmtNum(v, 4), n2 = v => fmtNum(v, 2);
  // the page's stat cards follow the open order
  document.getElementById('statsRow').innerHTML =
    statCardHtml({ ico: 'rebar', label: 'משקל ההזמנה (טון)', value: n2(s.total_t) }) +
    statCardHtml({ ico: 'materials', label: `כולל פחת ${esc(fmtNum(pct, 2))}% (טון)`, value: n2(s.with_waste_t) }) +
    statCardHtml({ ico: 'quantity', label: 'יחידות', value: esc(fmtNum(s.units, 0)) }) +
    statCardHtml({ ico: 'tasks', label: 'שורות', value: state.items.length });
  if (!state.items.length) { document.getElementById('summaryHost').innerHTML = ''; return; }
  const row = (label, v) => `<tr><td>${label}</td><td class="num-cell">${v}</td></tr>`;
  document.getElementById('summaryHost').innerHTML = `
    <div class="card">
      <div class="card-header"><h2>סיכום הזמנה</h2></div>
      <div class="summary-grid">
        <div class="table-wrap"><table>
          <thead><tr><th>עיבוד ופחת</th><th class="num-cell"></th></tr></thead>
          <tbody>
            ${row('חיתוך (ק״ג)', esc(fmtNum(s.cut_kg, 1)))}
            ${row('כיפוף (ק״ג)', esc(fmtNum(s.bend_kg, 1)))}
            ${row('יחידות', esc(fmtNum(s.kal_units, 0)))}
            ${row(`פחת ${esc(fmtNum(pct, 2))}% (טון)`, esc(n4(s.waste_t)))}
            ${row('<strong>סה״כ כולל פחת (טון)</strong>', `<strong>${esc(n4(s.with_waste_t))}</strong>`)}
          </tbody>
        </table></div>
        <div class="table-wrap"><table>
          <thead><tr><th>קוטר (מ״מ)</th><th class="num-cell">אורך (מטר)</th><th class="num-cell">משקל (ק״ג)</th></tr></thead>
          <tbody>${s.by_d.map(r => `<tr><td>${esc(fmtNum(r.d, 1))}</td><td class="num-cell">${esc(fmtNum(r.m, 1))}</td><td class="num-cell">${esc(n2(r.kg))}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td style="font-weight:800;">סה״כ</td>
            <td class="num-cell" style="font-weight:800;">${esc(fmtNum(s.by_d.reduce((a, r) => a + r.m, 0), 1))}</td>
            <td class="num-cell" style="font-weight:800;">${esc(n2(s.by_d.reduce((a, r) => a + r.kg, 0)))}</td></tr></tfoot>
        </table></div>
        <div class="table-wrap"><table>
          <thead><tr><th>הזמנה</th><th class="num-cell">יחידות</th><th class="num-cell">משקל (טון)</th></tr></thead>
          <tbody>${Object.entries(RO_SECTIONS).map(([k, sec]) => `<tr><td>${sec.title}</td><td class="num-cell">${esc(fmtNum(s.sections[k].units, 0))}</td><td class="num-cell">${roTons(s.sections[k].kg)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td style="font-weight:800;">סה״כ</td><td class="num-cell" style="font-weight:800;">${esc(fmtNum(s.units, 0))}</td><td class="num-cell" style="font-weight:800;">${esc(n2(s.total_t))}</td></tr></tfoot>
        </table></div>
      </div>
    </div>`;
}

function roRefreshLines() {
  roRenderSections();
  roRenderSummary();
}

function roCopyLine(idx) {
  const copy = JSON.parse(JSON.stringify(state.items[idx]));
  delete copy.id;
  copy._dirty = true;
  state.items.splice(idx + 1, 0, copy);
  roMarkDirty();
  roRefreshLines();
}

function roDeleteLine(idx) {
  if (!confirm('למחוק את השורה?')) return;
  const [gone] = state.items.splice(idx, 1);
  if (gone && gone.id) state.removedIds.push(gone.id);
  roMarkDirty();
  roRefreshLines();
}

// ===== the add-items window: bar (drawing), mesh, pile =====
// One window for every line; while adding, the kind (מוט / רשת / כלונס) switches inside it.
// A bar is edited on its drawing: every leg carries its length box and can be dragged, and
// the card beside it holds the same lengths by letter, the diameter, steel, name and the
// quantity. "הוסף" adds the line and keeps the window open for the next one; the lines
// added so far wait in the tray at the bottom until "סיום". Editing a line closes on "עדכון".
const dlg = { kind: null, idx: null, f: null, gallery: false, family: 'all', freehand: false, points: [], tried: false, added: [], hl: null, lay: null, drag: null };
const RO_BENDS_LABEL = n => n === 0 ? 'ללא כיפוף' : n === 1 ? 'כיפוף אחד' : `${n} כיפופים`;
const RO_FREE_PX_CM = 2.5;   // one pixel of the drawing grid in cm (a 20 px cell = 50 cm); lengths are typed after
const RO_STAGE_PAD = 84;     // room around the drawing for the length boxes and the letters (70 on a phone)
const RO_STRIP_DEFAULTS = ['S', 'L', 'U', 'UW', 'K', 'Z', 'HT', 'H'];
const RO_RECENT_KEY = 'tadok_rebar_recent_shapes';
const roClamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const roLetter = i => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i] || String(i + 1);
let roStageObserver = null;

function roRecentShapes() {
  try { const v = JSON.parse(localStorage.getItem(RO_RECENT_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function roRecentSave(list) {
  try { localStorage.setItem(RO_RECENT_KEY, JSON.stringify(list)); } catch { /* private window: the strip shows the usual shapes */ }
}

function roFormFromItem(kind, it) {
  if (kind === 'lift') return { diameter_mm: 12, length: '600', lifts: 1, steel: 'מצולע' };
  if (kind === 'element') return rebarElementForm(it);
  const base = { alias: it ? it.alias || '' : '', steel: it ? it.steel : 'מצולע', note: it ? it.note || '' : '', qty: it ? it.qty : '' };
  if (kind === 'bar') {
    if (!it) return { ...base, code: 'S', shape: null, lens: ['600'], diameter_mm: 8, hook_cm: '' };
    const sh = it.shape || { code: 'S', family: 'straight', segments: [{ len: it.length_cm, turn: 0 }] };
    let lens, shape = null;
    if (sh.family === 'hoop') lens = [sh.D, sh.overlap];
    else if (sh.code === 'F') { shape = { ...sh, inputs: sh.segments.map((_, i) => i), equal: [] }; lens = sh.segments.map(s => s.len); }
    else {
      const cat = rebarShape(sh.code);
      if (sh.segments.length === cat.segments.length && !shapeKeepsEqual(sh, cat.equal)) {
        // saved with "סימטרי" off: every leg keeps its own length
        shape = shapeUnlinked({ ...cat, segments: sh.segments });
        lens = sh.segments.map(s => s.len);
      } else lens = cat.inputs.map(i => sh.segments[i] ? sh.segments[i].len : '');
    }
    return { ...base, code: sh.code, shape, lens: lens.map(v => v ?? ''), diameter_mm: it.diameter_mm, hook_cm: sh.hook_cm ?? '' };
  }
  if (kind === 'mesh') {
    const p = it ? it.params : {};
    return { ...base, type: p.type || 'sym', x: p.x ?? 600, y: p.y ?? 250, s: p.s ?? 20, d_y: p.d_y ?? '', s_x: p.s_x ?? '', diameter_mm: it ? it.diameter_mm : 8 };
  }
  const p = it ? it.params : {};
  return {
    ...base, pile_type: p.pile_type || 'בסיס', d: p.d ?? 70, D: p.D ?? 80, n: p.n ?? 14, diameter_mm: it ? it.diameter_mm : 16,
    L1: p.L1 ?? 70, L2: p.L2 ?? 200, L3: p.L3 ?? 1350, p1: p.p1 ?? 10, p2: p.p2 ?? 20, d_spiral: p.d_spiral ?? 10,
    steel_spiral: p.steel_spiral || 'מצולע', additions: p.additions || [],
  };
}

function roOpenItemDialog(kind, idx) {
  Object.assign(dlg, {
    kind, idx, f: roFormFromItem(kind, idx === null ? null : state.items[idx]),
    gallery: false, family: 'all', freehand: false, points: [], tried: false, added: [], hl: null, drag: null,
  });
  document.getElementById('itemBackdrop').classList.add('open');   // open first: the drawing measures its box
  roRenderItemDialog();
  const first = document.querySelector('#itemModal [data-k="qty"], #itemModal [data-k="lifts"]');
  if (first && idx === null) first.focus({ preventScroll: true });
}

function roCloseItemDialog() {
  document.getElementById('itemBackdrop').classList.remove('open');
  if (roStageObserver) roStageObserver.disconnect();
  dlg.added = [];
}

// The lengths the drawing edits: a bar's typed values, or a corner mesh's two legs a and b.
function roLens() {
  return dlg.kind === 'element' ? [dlg.f.a, dlg.f.b] : dlg.f.lens;
}

function roDialogShape() {
  const f = dlg.f;
  if (dlg.kind === 'element') {   // the corner mesh's cross bar, drawn and edited like a bar's legs
    return { code: 'KR', family: 'figura', hooks: 0, equal: [], inputs: [0, 1],
      segments: [{ len: parseNum(f.a) ?? 0, turn: f.variant === 'lower' ? -90 : 90 }, { len: parseNum(f.b) ?? 0, turn: 0 }] };
  }
  const base = rebarBaseShape(f);
  if (!base) return null;
  const s = shapeSetLengths(base, (f.lens || []).map(v => parseNum(v) ?? 0));
  const hook = parseNum(f.hook_cm);
  if (hook !== null) s.hook_cm = hook;
  return s;
}

// one form field; `opts` is a list for a select ([value, text] pairs or plain values)
function roField(label, k, value, opts, extra = '') {
  const v = value ?? '';
  const input = opts
    ? `<select data-k="${k}">${opts.map(o => { const [val, text] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(text)}</option>`; }).join('')}</select>`
    : `<input data-k="${k}" value="${esc(v)}" ${extra}>`;
  return `<div class="field" data-field="${k}"><label>${label}</label>${input}<div class="field-error-msg"></div></div>`;
}

// the same field on one line (label beside the control), for the narrow card
function roRow(label, k, value, opts, extra = '') {
  const id = 'iw-' + k, v = value ?? '';
  const control = opts
    ? `<select id="${id}" data-k="${k}">${opts.map(o => { const [val, text] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(text)}</option>`; }).join('')}</select>`
    : `<input id="${id}" data-k="${k}" value="${esc(v)}" ${extra}>`;
  return `<div class="field iw-row" data-field="${k}"><label for="${id}">${label}</label>${control}<div class="field-error-msg"></div></div>`;
}

// a shape's outline without its numbers, for the strip, the gallery and the tray
function roMini(shape, w = 46, h = 26) {
  return shapeSvg(shape, { w, h, stroke: 1.6 }).replace(/<text[\s\S]*?<\/text>/g, '');
}

function roStripHtml() {
  const cur = dlg.f.code;
  const codes = rebarStripCodes(cur === 'F' ? roRecentShapes() : [cur, ...roRecentShapes()], RO_STRIP_DEFAULTS, 8);
  const btn = (attrs, on, title, svg) => `<button type="button" class="iw-shape ${on ? 'is-on' : ''}" ${attrs} title="${esc(title)}" aria-label="${esc(title)}" aria-pressed="${on}">${svg}</button>`;
  const free = cur === 'F' && dlg.f.shape ? btn('data-keep', !dlg.freehand, 'שרטוט חופשי', roMini(roDialogShape())) : '';
  return free + codes.map(c => { const s = rebarShape(c); return btn(`data-code="${c}"`, c === cur && !dlg.freehand, s.label, roMini(s)); }).join('')
    + `<button type="button" class="btn btn-outline btn-sm iw-all" data-gallery aria-expanded="${dlg.gallery}">כל הצורות</button>`;
}

function roGalleryHtml() {
  const fams = ['all', ...REBAR_FAMILIES.filter(fm => REBAR_SHAPES.some(s => s.family === fm))];
  const chips = fams.map(fm => `<button type="button" class="iw-chip ${dlg.family === fm ? 'is-on' : ''}" data-family="${fm}">${fm === 'all' ? 'הכל' : REBAR_FAMILY_LABELS[fm]}</button>`).join('')
    + `<button type="button" class="iw-chip" data-free>${uiIcon('pencil', 13)} שרטוט חופשי</button>`;
  const shown = REBAR_SHAPES.filter(s => dlg.family === 'all' || s.family === dlg.family);
  const groups = [...new Set(shown.map(s => s.bends))].sort((a, b) => a - b).map(n => `
    <div class="iw-gal-group"><div class="iw-gal-label">${RO_BENDS_LABEL(n)}</div><div class="iw-gal-row">
      ${shown.filter(s => s.bends === n).map(s => `<button type="button" class="iw-gal-btn ${dlg.f.code === s.code ? 'is-on' : ''}" data-code="${s.code}">${roMini(s, 84, 40)}<span>${esc(s.label)}</span></button>`).join('')}
    </div></div>`).join('');
  return `<div class="iw-gallery" role="dialog" aria-label="מאגר צורות">
    <div class="iw-gal-head"><div class="iw-chips">${chips}</div>
      <button type="button" class="icon-btn" data-gallery aria-label="סגירת מאגר הצורות">${uiIcon('x', 16)}</button></div>
    ${groups}</div>`;
}

function roSymHtml() {
  if (dlg.freehand || dlg.f.code === 'F' || !(rebarShape(dlg.f.code).equal || []).length) return '';
  return `<label class="iw-badge iw-badge-sym"><input type="checkbox" data-sym ${dlg.f.shape ? '' : 'checked'}> סימטרי</label>`;
}

function roBarCardHtml() {
  const f = dlg.f, shape = roDialogShape();
  let lens;
  if (dlg.freehand) lens = '<div class="field-hint">סמנו נקודות על הרשת לפי כיווני המוט, ולחיצה כפולה לסיום. אחר כך כתבו את האורכים.</div>';
  else if (shape.family === 'hoop') {
    lens = [['D', 'קוטר', 0], ['', 'חפיפה *', 1]].map(([letter, label, k]) => `<div class="field iw-lrow" data-field="len${k}">
      <span class="iw-letter">${letter}</span><input data-len="${k}" inputmode="decimal" value="${esc(f.lens[k] ?? '')}" aria-label="${label} (ס״מ)" placeholder="${label}">
      <span class="iw-ang"></span><div class="field-error-msg"></div></div>`).join('');
  } else {
    const n = shape.segments.length, firstOf = {};
    shape.segments.forEach((_, i) => { const k = shapeInputIndex(shape, i); if (firstOf[k] === undefined) firstOf[k] = i; });
    lens = shape.segments.map((g, i) => {
      const k = shapeInputIndex(shape, i);
      return `<div class="field iw-lrow" ${firstOf[k] === i ? `data-field="len${k}"` : ''}>
        <span class="iw-letter">${roLetter(i)}</span>
        <input data-len="${k}" data-seg="${i}" inputmode="decimal" value="${esc(f.lens[k] ?? '')}" aria-label="צלע ${roLetter(i)} (ס״מ)">
        <span class="iw-ang">${i < n - 1 ? esc(String(Math.abs(Number(g.turn) || 0))) + '°' : ''}</span><div class="field-error-msg"></div></div>`;
    }).join('');
  }
  const hooks = !dlg.freehand && shape.hooks > 0
    ? roRow('אורך וו (ס״מ)', 'hook_cm', f.hook_cm, null, `inputmode="decimal" placeholder="${esc(String(parseNum(f.diameter_mm) || ''))}"`) : '';
  return `<div class="iw-sec"><span>אורכים (ס״מ)</span><span>זווית</span></div>${lens}${hooks}
    <div class="iw-sep"></div>
    ${roRow('קוטר (מ״מ)', 'diameter_mm', f.diameter_mm, REBAR_BAR_D.map(d => [d, 'Ø' + d]))}
    ${roRow('סוג פלדה', 'steel', f.steel, REBAR_STEELS)}
    ${roRow('כינוי', 'alias', f.alias, null, 'maxlength="60" placeholder="ליפט, חיתים"')}`;
}

function roMeshFieldsHtml() {
  const f = dlg.f, asym = f.type === 'asym';
  return `<div class="form-grid">
    ${roField('סוג רשת', 'type', f.type, [['sym', 'סימטרי'], ['asym', 'א-סימטרי']])}
    ${roField('כינוי', 'alias', f.alias, null, 'maxlength="60"')}
    ${roField('X — רוחב (ס״מ)', 'x', f.x, null, 'inputmode="decimal"')}
    ${roField('Y — גובה (ס״מ)', 'y', f.y, null, 'inputmode="decimal"')}
    ${roField(asym ? 'קוטר מוטות לאורך X (מ״מ)' : 'קוטר (מ״מ)', 'diameter_mm', f.diameter_mm, REBAR_MESH_D)}
    ${roField(asym ? 'פסיעה בין מוטות X (ס״מ)' : 'פסיעה (ס״מ)', 's', f.s, REBAR_STEPS)}
    ${asym ? roField('קוטר מוטות לאורך Y (מ״מ)', 'd_y', f.d_y || f.diameter_mm, REBAR_MESH_D) + roField('פסיעה בין מוטות Y (ס״מ)', 's_x', f.s_x || f.s, REBAR_STEPS) : ''}
    ${roField('סוג פלדה', 'steel', f.steel, REBAR_STEELS)}
    ${roField('כמות (יח׳)', 'qty', f.qty, null, 'inputmode="numeric"')}
  </div>`;
}

function roPileFieldsHtml() {
  const f = dlg.f;
  const adds = RO_PILE_ADDITIONS.map(a => `<label class="check-line"><input type="checkbox" data-addition="${esc(a)}" ${f.additions.includes(a) ? 'checked' : ''}> ${esc(a)}</label>`).join('');
  return `<div class="form-grid">
    ${roField('סוג כלונס', 'pile_type', f.pile_type, ['בסיס', 'דיפון'])}
    ${roField('כינוי', 'alias', f.alias, null, 'maxlength="60"')}
    ${roField('d — קוטר הכלוב (ס״מ)', 'd', f.d, null, 'inputmode="decimal"')}
    ${roField('D — קוטר הכלונס (ס״מ)', 'D', f.D, null, 'inputmode="decimal"')}
    ${roField('מוטות אורך — מספר', 'n', f.n, null, 'inputmode="numeric"')}
    ${roField('מוטות אורך — קוטר (מ״מ)', 'diameter_mm', f.diameter_mm, REBAR_PILE_D)}
    ${roField('סוג פלדה', 'steel', f.steel, REBAR_STEELS)}
    ${roField('L1 — ללא ספירלה (ס״מ)', 'L1', f.L1, null, 'inputmode="decimal"')}
    ${roField('L2 (ס״מ)', 'L2', f.L2, null, 'inputmode="decimal"')}
    ${roField('L3 (ס״מ)', 'L3', f.L3, null, 'inputmode="decimal"')}
    ${roField('פסיעה ב-L2 (ס״מ)', 'p1', f.p1, REBAR_STEPS)}
    ${roField('פסיעה ב-L3 (ס״מ)', 'p2', f.p2, REBAR_STEPS)}
    ${roField('ספירלה — קוטר (מ״מ)', 'd_spiral', f.d_spiral, REBAR_SPIRAL_D)}
    ${roField('ספירלה — סוג פלדה', 'steel_spiral', f.steel_spiral, REBAR_STEELS)}
    <div class="field full"><label>תוספות</label><div class="check-row">${adds}</div>
      <div class="field-hint">התוספות מודפסות בהזמנה ואינן נכללות במשקל</div></div>
    ${roField('הערה', 'note', f.note, null, 'maxlength="200"')}
    ${roField('כמות (יח׳)', 'qty', f.qty, null, 'inputmode="numeric"')}
  </div>`;
}

// the bottom of the card: quantity (a bar's), the weight, and the button
function roFootHtml(withQty) {
  const editing = dlg.idx !== null;
  return `<div class="iw-foot">
    ${withQty ? roRow('כמות (יח׳)', 'qty', dlg.f.qty, null, 'inputmode="numeric" autocomplete="off"') : ''}
    <div class="iw-totals" id="itemPreview" aria-live="polite"></div>
    <div class="iw-actions">${editing
      ? '<button type="button" class="btn btn-primary" data-save-line>עדכון</button><button type="button" class="btn btn-outline" data-x>ביטול</button>'
      : '<button type="button" class="btn btn-primary" data-save-line>הוסף</button>'}</div>
  </div>`;
}

function roItemShort(r) {
  const d = 'Ø' + fmtNum(r.diameter_mm, 1);
  if (r.kind === 'mesh') return `${fmtNum(r.params.x, 0)}×${fmtNum(r.params.y, 0)} ${d} × ${r.qty}`;
  if (r.kind === 'pile') return `כלונס ${d} × ${r.qty}`;
  if (r.kind === 'element') return `${elementLabel(r)} × ${r.qty}`;
  return `${r.alias === 'ליפט' ? 'ליפט ' : ''}${d} × ${r.qty}`;
}

// a segmented choice: one button per [value, text], the chosen one pressed
function roSeg(key, value, opts) {
  return `<div class="iw-seg" role="group">${opts.map(([v, t]) =>
    `<button type="button" data-set="${key}" data-val="${esc(v)}" aria-pressed="${String(v) === String(value)}">${esc(t)}</button>`).join('')}</div>`;
}

// ---- ליפט: a closed bundle of straight bars, each lift up to 1,500 kg ----
function roLiftBodyHtml() {
  const f = dlg.f;
  return `<div class="iw-body iw-body-form"><div class="iw-card iw-card-narrow">
    ${roRow('קוטר (מ״מ)', 'diameter_mm', f.diameter_mm, REBAR_BAR_D.map(d => [d, 'Ø' + d]))}
    <div class="field iw-row" data-field="length"><label>אורך (ס״מ)</label>${roSeg('length', f.length, REBAR_STOCK_LENGTHS.map(l => [l, String(l)]))}<div class="field-error-msg"></div></div>
    ${roRow('מספר ליפטים', 'lifts', f.lifts, null, 'inputmode="numeric" autocomplete="off"')}
    ${roRow('סוג פלדה', 'steel', f.steel, REBAR_STEELS)}
    <div class="field-hint">ליפט סגור — עד ${fmtNum(REBAR_LIFT_KG, 0)} ק״ג. נרשם כמוט ישר בכינוי "ליפט".</div>
    ${roFootHtml(false)}
  </div></div>`;
}

// ---- אלמנט: a corner mesh (drawn), a spacer, or another ready element ----
function roElementBodyHtml() {
  const f = dlg.f;
  const types = `<div class="iw-typebar">${roSeg('type', f.type, REBAR_ELEMENT_TYPES)}</div>`;
  if (f.type === 'kranz') {
    const lens = [['A', 'a', 0], ['B', 'b', 1]].map(([letter, key, k]) => `<div class="field iw-lrow" data-field="${key}">
      <span class="iw-letter">${letter}</span><input data-len="${k}" data-seg="${k}" inputmode="decimal" value="${esc(f[key] ?? '')}" aria-label="צלע ${letter} (ס״מ)">
      <span class="iw-ang">${k ? '' : '90°'}</span><div class="field-error-msg"></div></div>`).join('');
    return `${types}<div class="iw-body">
      <div class="iw-stage" id="iwStage"><svg id="iwSvg" class="iw-svg" aria-hidden="true"></svg><span class="iw-badge iw-badge-len" id="iwLen"></span></div>
      <div class="iw-card">
        ${roSeg('variant', f.variant, REBAR_KRANZ_VARIANTS)}
        <div class="iw-sec" style="margin-top:10px;"><span>מוט רוחב (ס״מ)</span><span>זווית</span></div>${lens}
        <div class="iw-sep"></div>
        ${roRow('אורך הרשת L (ס״מ)', 'L', f.L, null, 'inputmode="decimal"')}
        <div class="field-hint" style="margin:-4px 0 8px;">בדרך כלל 350–600</div>
        ${roRow('מוטות רוחב — קוטר', 'diameter_mm', f.diameter_mm, REBAR_BAR_D.map(d => [d, 'Ø' + d]))}
        ${roRow('מוטות רוחב — פסיעה', 's', f.s, REBAR_STEPS.map(s => [s, '@' + s]))}
        ${roRow('מוטות אורך — מספר', 'n_long', f.n_long, null, 'inputmode="numeric"')}
        ${roRow('מוטות אורך — קוטר', 'd_long', f.d_long, REBAR_BAR_D.map(d => [d, 'Ø' + d]))}
        ${roRow('כינוי', 'alias', f.alias, null, 'maxlength="60"')}
        ${roFootHtml(true)}
      </div></div>`;
  }
  const fields = f.type === 'spacer'
    ? `${roRow('גובה (מ״מ)', 'height_mm', f.height_mm, REBAR_SPACER_HEIGHTS)}
       ${roRow('כינוי', 'alias', f.alias, null, 'maxlength="60"')}
       <div class="field-hint">נספר ביחידות, לא נכלל במשקל · אורך 2 מ׳</div>`
    : `${roRow('שם האלמנט', 'name', f.name, null, 'maxlength="120"')}
       ${roRow('ק״ג ליחידה', 'unit_kg', f.unit_kg, null, 'inputmode="decimal" placeholder="לא חובה"')}
       ${roRow('כינוי', 'alias', f.alias, null, 'maxlength="60"')}`;
  return `${types}<div class="iw-body iw-body-form"><div class="iw-card iw-card-narrow">${fields}${roFootHtml(true)}</div></div>`;
}

function roTrayHtml() {
  const n = dlg.added.length, kg = dlg.added.reduce((a, r) => a + (Number(r.total_kg) || 0), 0);
  const items = dlg.added.map((r, j) => {
    const el = r.kind === 'element' ? elementSvg(r.params, { w: 40, h: 22, stroke: 1.6 }) : null;
    const pic = r.shape ? roMini(r.shape, 40, 22) : el ? el.replace(/<text[\s\S]*?<\/text>/g, '') : `<span class="iw-item-kind">${esc(RO_SECTIONS[r.kind].item)}</span>`;
    return `<div class="iw-item">
      ${pic}
      <span>${esc(roItemShort(r))}</span>
      <button type="button" class="iw-item-del" data-undo="${j}" title="הסרת השורה" aria-label="הסרת השורה ${esc(roItemShort(r))}">${uiIcon('x', 12)}</button></div>`;
  }).join('');
  return `<span class="iw-tray-count">${n ? `נוספו ${n} ${n === 1 ? 'שורה' : 'שורות'} · ${esc(fmtNum(kg, 2))} ק״ג` : 'השורות שתוסיפו יופיעו כאן'}</span>
    <div class="iw-items">${items}</div>
    <button type="button" class="btn btn-outline" data-x>סיום</button>`;
}

function roRenderItemDialog() {
  const sec = RO_SECTIONS[dlg.kind], editing = dlg.idx !== null;
  const modal = document.getElementById('itemModal');
  modal.className = 'modal item-win';
  const kinds = editing ? '' : `<div class="iw-kinds" role="tablist" aria-label="סוג הפריט">${RO_WINDOW_TABS.map(([k, t]) =>
    `<button type="button" role="tab" aria-selected="${k === dlg.kind}" data-kind="${k}">${t}</button>`).join('')}</div>`;
  const body = dlg.kind === 'lift' ? roLiftBodyHtml()
    : dlg.kind === 'element' ? roElementBodyHtml()
    : dlg.kind === 'bar'
    ? `<div class="iw-strip">${roStripHtml()}</div>
       <div class="iw-body">
         <div class="iw-stage ${dlg.freehand ? 'is-free' : ''}" id="iwStage">
           <svg id="iwSvg" class="iw-svg" aria-hidden="true"></svg>
           <span class="iw-badge iw-badge-len" id="iwLen"></span>
           ${roSymHtml()}
           ${dlg.freehand ? '<button type="button" class="iw-badge iw-badge-clear" data-free-clear>ניקוי</button>' : ''}
           ${dlg.gallery ? roGalleryHtml() : ''}
         </div>
         <div class="iw-card">${roBarCardHtml()}${roFootHtml(true)}</div>
       </div>`
    : `<div class="iw-body iw-body-form"><div class="iw-card">${dlg.kind === 'mesh' ? roMeshFieldsHtml() : roPileFieldsHtml()}${roFootHtml(false)}</div></div>`;
  modal.innerHTML = `
    <button class="icon-btn modal-close" data-x aria-label="סגירה">${uiIcon('x', 18)}</button>
    <div class="iw-head"><h3>${editing ? 'עריכת ' + sec.item : 'הוספת פריטים'}</h3>${kinds}</div>
    <div id="itemMsg" class="msg"></div>
    ${body}
    ${editing ? '' : `<div class="iw-tray" id="iwTray">${roTrayHtml()}</div>`}`;
  if (document.getElementById('iwStage')) roStageMount();
  roItemPreview();
}

// ---- the drawing ----
function roStageMount() {
  const stage = document.getElementById('iwStage');
  if (!stage) return;
  stage.querySelectorAll('.iw-box').forEach(b => b.remove());
  if (!dlg.freehand) {
    const shape = roDialogShape();
    const boxes = shape.family === 'hoop' ? [{ seg: 'D', k: 0, label: 'קוטר החישוק' }]
      : shape.segments.map((_, i) => ({ seg: i, k: shapeInputIndex(shape, i), label: 'צלע ' + roLetter(i) }));
    for (const b of boxes) {
      const el = document.createElement('input');
      el.className = 'iw-box';
      el.inputMode = 'decimal';
      el.autocomplete = 'off';
      el.dataset.len = b.k;
      el.dataset.seg = b.seg;
      el.value = roLens()[b.k] ?? '';
      el.setAttribute('aria-label', b.label + ' (ס״מ)');
      stage.appendChild(el);
    }
  }
  if (!roStageObserver) roStageObserver = new ResizeObserver(() => roStageDraw());
  roStageObserver.disconnect();
  roStageObserver.observe(stage);
  roStageDraw();
}

function roStageDraw() {
  const stage = document.getElementById('iwStage'), svg = document.getElementById('iwSvg');
  if (!stage || !svg) return;
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const badge = document.getElementById('iwLen');
  if (dlg.freehand) {
    let g = '';
    for (let x = 0; x <= w; x += 20) g += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" class="iw-grid"/>`;
    for (let y = 0; y <= h; y += 20) g += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" class="iw-grid"/>`;
    if (dlg.points.length) g += `<polyline points="${dlg.points.map(p => `${p.x},${p.y}`).join(' ')}" class="iw-bar"/>`;
    g += dlg.points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="4" class="iw-dot"/>`).join('');
    svg.innerHTML = g;
    badge.textContent = 'לחיצה כפולה לסיום';
    return;
  }
  const shape = roDialogShape();
  const d = parseNum(dlg.f.diameter_mm), complete = !(roLens() || []).some(v => !(parseNum(v) > 0));
  badge.textContent = dlg.kind === 'element'
    ? (complete ? `אורך פרוס ${fmtNum(parseNum(dlg.f.a) + parseNum(dlg.f.b), 1)} ס״מ` : '')
    : !complete && shape.family !== 'hoop' ? '' : `אורך ${fmtNum(shapeLength(shape, d), 1)} ס״מ`;
  if (shape.family === 'hoop') {
    const r = Math.max(20, Math.min(w, h) / 2 - 40);
    svg.innerHTML = `<circle cx="${w / 2}" cy="${h / 2}" r="${r}" class="iw-bar"/>`;
    const box = stage.querySelector('.iw-box');
    if (box) { box.style.left = w / 2 + 'px'; box.style.top = h / 2 + 'px'; }
    return;
  }
  const lay = shapeLayout(shape, w, h, w < 480 ? 70 : RO_STAGE_PAD), P = lay.points;
  dlg.lay = lay;
  const line = (a, b, cls, extra = '') => `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" class="${cls}" ${extra}/>`;
  let g = `<polyline points="${P.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ')}" class="iw-bar"/>`;
  if (shape.hooks > 0 && P.length > 1) {
    const tick = (p, q, rot) => {
      const a = Math.atan2(q.y - p.y, q.x - p.x) + rot * Math.PI / 180;
      return line(p, { x: p.x + 14 * Math.cos(a), y: p.y + 14 * Math.sin(a) }, 'iw-bar');
    };
    g += tick(P[0], P[1], 45);
    if (shape.hooks > 1) g += tick(P[P.length - 1], P[P.length - 2], -45);
  }
  if (dlg.kind === 'element') {   // the corner mesh's longitudinal bars, 10, 30, 50 … cm from the free end
    const a = parseNum(dlg.f.a), n = parseNum(dlg.f.n_long) || 0, side = dlg.f.variant === 'lower' ? -1 : 1;
    for (let i = 0; a > 0 && i < n && 10 + 20 * i < a; i++) {
      const x = P[0].x + (10 + 20 * i) / a * (P[1].x - P[0].x);
      g += `<circle cx="${x.toFixed(1)}" cy="${(P[0].y + side * 10).toFixed(1)}" r="6" class="iw-ring"/>`;
    }
  }
  if (dlg.hl !== null && dlg.hl !== 'D') g += shapeLinkedSegs(shape, dlg.hl).map(i => line(P[i], P[i + 1], 'iw-hl')).join('');
  lay.labels.forEach((l, i) => {
    const o = 18 + Math.abs(l.nx) * 18 + 28;
    g += `<text x="${roClamp(l.x + l.nx * o, 8, w - 8).toFixed(1)}" y="${roClamp(l.y + l.ny * o, 8, h - 8).toFixed(1)}" class="iw-letter-svg">${roLetter(i)}</text>`;
  });
  g += shape.segments.map((_, i) => line(P[i], P[i + 1], 'iw-hit', `data-hit="${i}"`)).join('');
  svg.innerHTML = g;
  stage.querySelectorAll('.iw-box').forEach(box => {
    const l = lay.labels[Number(box.dataset.seg)];
    if (!l) return;
    const o = 18 + Math.abs(l.nx) * 18;
    box.style.left = roClamp(l.x + l.nx * o, 36, w - 36) + 'px';   // a box never leaves the drawing
    box.style.top = roClamp(l.y + l.ny * o, 18, h - 18) + 'px';
  });
}

// a typed or dragged length: the form, every box of that value (drawing and card), the weight
function roSetLen(k, value, from) {
  if (dlg.kind === 'element') dlg.f[k === 0 ? 'a' : 'b'] = value;
  else dlg.f.lens[k] = value;
  document.querySelectorAll(`#itemModal [data-len="${k}"]`).forEach(el => { if (el !== from) el.value = value; });
  roStageDraw();
  roItemPreview();
}

function roReadItemForm() {
  const f = dlg.f, m = document.getElementById('itemModal');
  m.querySelectorAll('[data-k]').forEach(el => { f[el.dataset.k] = el.value; });
  if (dlg.kind === 'pile') f.additions = [...m.querySelectorAll('[data-addition]')].filter(c => c.checked).map(c => c.dataset.addition);
}

function roItemErrors() {
  if (dlg.kind === 'lift') return validateLift(dlg.f);
  const f = { ...dlg.f };
  if (dlg.kind === 'mesh' && f.type !== 'asym') { delete f.d_y; delete f.s_x; }
  return validateItem(dlg.kind, f);
}

function roShowItemErrors(errs) {
  const m = document.getElementById('itemModal');
  m.querySelectorAll('.field').forEach(el => { el.classList.remove('field-error'); const msg = el.querySelector('.field-error-msg'); if (msg) msg.textContent = ''; });
  m.querySelectorAll('.iw-box').forEach(b => b.classList.toggle('is-bad', dlg.tried && !(parseNum(b.value) > 0) && !(b.dataset.len === '1' && rebarBaseShape(dlg.f)?.family === 'hoop')));
  const msgEl = document.getElementById('itemMsg');
  if (!dlg.tried) { if (msgEl) hideMsg(msgEl); return; }
  const put = (key, text) => {
    const el = m.querySelector(`[data-field="${key}"]`);
    if (!el) return false;
    el.classList.add('field-error');
    const msg = el.querySelector('.field-error-msg');
    if (msg) msg.textContent = text;
    return true;
  };
  const rest = [];
  for (const [k, text] of Object.entries(errs)) {
    let ok;
    if (k === 'lens') ok = (dlg.f.lens || []).map((v, i) => parseNum(v) > 0 ? false : put('len' + i, text)).some(Boolean);
    else if (k === 'overlap') ok = put('len1', text);
    else if (k === 'L' && dlg.kind === 'pile') ok = ['L1', 'L2', 'L3'].map(key => put(key, text)).some(Boolean);
    else ok = put(k, text);
    if (!ok) rest.push(text);
  }
  rest.length ? showMsg(msgEl, rest.join(' · '), 'error') : hideMsg(msgEl);
}

// the weight: per unit as soon as the shape is complete, the total once there is a quantity
function roItemPreview() {
  const box = document.getElementById('itemPreview');
  const errs = roItemErrors();
  roShowItemErrors(errs);
  if (!box) return;
  const shapeErrs = Object.keys(errs).filter(k => k !== 'qty');
  if (shapeErrs.length || (dlg.kind === 'bar' && dlg.freehand)) {
    box.innerHTML = '<div class="iw-tot-hint">השלימו את השדות כדי לראות את המשקל</div>';
    return;
  }
  if (dlg.kind === 'lift') {
    const f = dlg.f, q = rebarLiftQty(parseNum(f.diameter_mm), parseNum(f.length), parseNum(f.lifts));
    box.innerHTML = `<div class="iw-tot"><span>ליפט אחד</span><span>${esc(fmtNum(q.per_lift, 0))} מוטות · ${esc(fmtNum(q.lift_kg, 2))} ק״ג</span></div>
      <div class="iw-tot iw-tot-sum"><span>סה״כ ${esc(fmtNum(q.qty, 0))} מוטות</span><b>${esc(fmtNum(q.total_kg, 2))} ק״ג</b></div>`;
    return;
  }
  if (dlg.kind === 'element' && dlg.f.type === 'spacer') {
    box.innerHTML = '<div class="iw-tot-hint">נספר ביחידות, לא נכלל במשקל</div>';
    return;
  }
  const qtyOk = !errs.qty;
  const row = buildItem(dlg.kind, { ...dlg.f, qty: qtyOk ? dlg.f.qty : 1 }, 1), c = itemCalc(row);
  const unit = `${row.length_cm ? fmtNum(row.length_cm, 1) + ' ס״מ · ' : ''}${fmtNum(row.unit_kg, 2)} ק״ג`;
  const perMetre = dlg.kind === 'element' && row.length_cm
    ? `<div class="iw-tot"><span>ק״ג למ״א</span><span>${esc(fmtNum(row.unit_kg / (row.length_cm / 100), 2))}</span></div>` : '';
  box.innerHTML = `<div class="iw-tot"><span>ליחידה</span><span>${esc(unit)}</span></div>${perMetre}
    <div class="iw-tot iw-tot-sum"><span>סה״כ${c.approx ? ' <span class="approx-badge">חישוב משוער</span>' : ''}</span>
      <b>${qtyOk ? esc(fmtNum(row.total_kg, 2)) + ' ק״ג' : '— ק״ג'}</b></div>`;
}

// keep line numbers 1..n within a section after a line leaves (the save does the same)
function roRenumber(kind) {
  let no = 0;
  for (const it of state.items) {
    if (it.kind !== kind) continue;
    no += 1;
    if (it.line_no !== no) { it.line_no = no; it._dirty = true; }
  }
}

function roSaveLine() {
  roReadItemForm();
  dlg.tried = true;
  const errs = roItemErrors();
  if (Object.keys(errs).length) {
    roShowItemErrors(errs);
    const bad = document.querySelector('#itemModal .field-error input, #itemModal .field-error select, #itemModal .iw-box.is-bad');
    if (bad) bad.focus();
    return;
  }
  const f = { ...dlg.f };
  if (dlg.kind === 'mesh' && f.type !== 'asym') { delete f.d_y; delete f.s_x; }
  if (dlg.idx !== null) {
    const old = state.items[dlg.idx];
    state.items[dlg.idx] = { ...buildItem(dlg.kind, f, old.line_no), id: old.id, _dirty: true };
    roCloseItemDialog();
    roMarkDirty();
    roRefreshLines();
    return;
  }
  const kind = dlg.kind === 'lift' ? 'bar' : dlg.kind;   // a lift is saved as a straight bar
  const n = state.items.filter(i => i.kind === kind).length + 1;
  const row = { ...(dlg.kind === 'lift' ? buildLiftItem(f, n) : buildItem(kind, f, n)), _dirty: true };
  state.items.push(row);
  dlg.added.push(row);
  if (dlg.kind === 'bar' && f.code !== 'F') roRecentSave(rebarRecentPush(roRecentShapes(), f.code));
  roMarkDirty();
  roRefreshLines();
  // the window stays: same shape, diameter and steel; the next line needs its own quantity
  if (dlg.kind !== 'lift') Object.assign(dlg.f, { qty: '', alias: '', note: '' });
  dlg.tried = false;
  roRenderItemDialog();
  const qty = document.querySelector('#itemModal [data-k="qty"], #itemModal [data-k="lifts"]');
  if (qty) qty.focus({ preventScroll: true });
}

function roUndoAdded(j) {
  const row = dlg.added[j];
  if (!row) return;
  dlg.added.splice(j, 1);
  const idx = state.items.indexOf(row);
  if (idx >= 0) { state.items.splice(idx, 1); roRenumber(row.kind); }
  roMarkDirty();
  roRefreshLines();
  document.getElementById('iwTray').innerHTML = roTrayHtml();
}

function roPickShape(code) {
  roReadItemForm();
  const s = rebarShape(code);
  Object.assign(dlg.f, { code: s.code, shape: null, lens: s.family === 'hoop' ? [String(s.D), ''] : s.inputs.map(i => String(s.segments[i].len)) });
  Object.assign(dlg, { gallery: false, freehand: false, points: [], hl: null });
  roRenderItemDialog();
}

function roItemDialogEvents() {
  const modal = document.getElementById('itemModal');
  modal.addEventListener('click', e => {
    if (e.target.closest('[data-x]')) { roCloseItemDialog(); return; }
    if (e.target.closest('[data-save-line]')) { roSaveLine(); return; }
    const undo = e.target.closest('[data-undo]');
    if (undo) { roUndoAdded(Number(undo.dataset.undo)); return; }
    const kind = e.target.closest('[data-kind]');
    if (kind) {
      if (kind.dataset.kind === dlg.kind) return;
      Object.assign(dlg, { kind: kind.dataset.kind, f: roFormFromItem(kind.dataset.kind, null), gallery: false, freehand: false, points: [], tried: false, hl: null });
      roRenderItemDialog();
      return;
    }
    const set = e.target.closest('[data-set]');
    if (set) { roReadItemForm(); dlg.f[set.dataset.set] = set.dataset.val; dlg.hl = null; roRenderItemDialog(); return; }
    if (e.target.closest('[data-gallery]')) { roReadItemForm(); dlg.gallery = !dlg.gallery; roRenderItemDialog(); return; }
    const fam = e.target.closest('[data-family]');
    if (fam) { roReadItemForm(); dlg.family = fam.dataset.family; roRenderItemDialog(); return; }
    if (e.target.closest('[data-free]')) { roReadItemForm(); Object.assign(dlg, { freehand: true, gallery: false, points: [], hl: null }); roRenderItemDialog(); return; }
    if (e.target.closest('[data-keep]')) { if (dlg.freehand) { dlg.freehand = false; roRenderItemDialog(); } return; }
    if (e.target.closest('[data-free-clear]')) { dlg.points = []; roStageDraw(); return; }
    const pick = e.target.closest('[data-code]');
    if (pick) { roPickShape(pick.dataset.code); return; }
    if (dlg.freehand && e.target.closest('#iwSvg')) {
      const r = e.target.closest('#iwSvg').getBoundingClientRect();
      dlg.points.push({ x: Math.round((e.clientX - r.left) / 20) * 20, y: Math.round((e.clientY - r.top) / 20) * 20 });
      roStageDraw();
    }
  });
  modal.addEventListener('dblclick', e => {
    if (!dlg.freehand || !e.target.closest('#iwSvg')) return;
    const shape = shapeFromPoints(dlg.points.map(p => ({ x: p.x * RO_FREE_PX_CM, y: p.y * RO_FREE_PX_CM })));
    if (!shape) { toast('סמנו לפחות שתי נקודות', 'error'); return; }
    roReadItemForm();
    Object.assign(dlg.f, { code: 'F', shape, lens: shape.segments.map(s => String(s.len)) });
    Object.assign(dlg, { freehand: false, points: [] });
    roRenderItemDialog();
  });
  modal.addEventListener('input', e => {
    const len = e.target.closest('[data-len]');
    if (len) { roSetLen(Number(len.dataset.len), len.value, len); return; }
    roReadItemForm();
    if (document.getElementById('iwStage')) roStageDraw();
    roItemPreview();
  });
  modal.addEventListener('change', e => {
    if (e.target.matches('[data-sym]')) {
      const shape = roDialogShape(), cat = rebarShape(dlg.f.code);
      if (e.target.checked) Object.assign(dlg.f, { shape: null, lens: cat.inputs.map(i => String(shape.segments[i].len)) });
      else Object.assign(dlg.f, { shape: shapeUnlinked(cat), lens: shape.segments.map(g => String(g.len)) });
      roRenderItemDialog();
      return;
    }
    const k = e.target.dataset && e.target.dataset.k;
    if (k === 'type' || k === 'diameter_mm') { roReadItemForm(); roRenderItemDialog(); }
  });
  // the leg being edited lights up on the drawing
  modal.addEventListener('focusin', e => {
    const el = e.target.closest('[data-seg]');
    if (!el || !document.getElementById('iwStage')) return;
    dlg.hl = el.dataset.seg === 'D' ? 'D' : Number(el.dataset.seg);
    roStageDraw();
    if (el.select) el.select();
  });
  modal.addEventListener('focusout', e => {
    if (!e.target.closest('[data-seg]') || dlg.drag) return;
    dlg.hl = null;
    roStageDraw();
  });
  modal.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.target.type === 'checkbox') return;
    e.preventDefault();
    roSaveLine();
  });
  // dragging a leg lengthens or shortens it in 5 cm steps; pulling the end you grabbed
  modal.addEventListener('pointerdown', e => {
    const hit = e.target.closest('[data-hit]');
    if (!hit || !dlg.lay) return;
    e.preventDefault();
    const svg = document.getElementById('iwSvg'), r = svg.getBoundingClientRect();
    const i = Number(hit.dataset.hit), l = dlg.lay.labels[i], shape = roDialogShape();
    const side = ((e.clientX - r.left - l.x) * l.ux + (e.clientY - r.top - l.y) * l.uy) >= 0 ? 1 : -1;
    dlg.drag = { i, k: shapeInputIndex(shape, i), x0: e.clientX, y0: e.clientY, v0: Number(shape.segments[i].len), scale: dlg.lay.scale, dir: { ux: l.ux * side, uy: l.uy * side } };
    svg.setPointerCapture(e.pointerId);
    dlg.hl = i;
    roStageDraw();
  });
  modal.addEventListener('pointermove', e => {
    const d = dlg.drag;
    if (!d) return;
    const v = String(shapeDragLen(d.v0, e.clientX - d.x0, e.clientY - d.y0, d.dir, d.scale));
    if (v !== String(roLens()[d.k])) roSetLen(d.k, v, null);
  });
  const endDrag = () => { if (!dlg.drag) return; dlg.drag = null; dlg.hl = null; roStageDraw(); };
  modal.addEventListener('pointerup', endDrag);
  modal.addEventListener('pointercancel', endDrag);
}

// ===== receipts: what arrived on site (phase 2) =====
// A receipt is one delivery: the lines that came (all or part), the delivery note and the
// check against it. The database sets the order's status from the receipts.
const RO_LEVEL_ICON = { ok: 'check', warn: 'triangle-alert', bad: 'triangle-alert', info: 'file-text' };
const rc = { file: null, note: null, reading: false };

async function roLoadReceipts(orderId) {
  state.receipts = []; state.receiptItems = []; state.receiptDocs = {};
  if (!orderId) return;
  const { data: receipts } = await sb.from('rebar_receipts').select('*').eq('order_id', orderId).order('received_on').order('created_at');
  state.receipts = receipts || [];
  const ids = state.receipts.map(r => r.id);
  if (!ids.length) return;
  const [{ data: lines }, { data: docs }] = await Promise.all([
    sb.from('rebar_receipt_items').select('*').in('receipt_id', ids),
    sb.from('documents').select('id, file_name, file_path, linked_record_id').eq('linked_table', 'rebar_receipts').in('linked_record_id', ids),
  ]);
  state.receiptItems = lines || [];
  for (const d of docs || []) (state.receiptDocs[d.linked_record_id] ||= []).push(d);
}

function roChecksHtml(checks) {
  if (!checks || !checks.length) return '';
  return `<ul class="di-checks">${checks.map(c => `<li class="di-${c.level}">${uiIcon(RO_LEVEL_ICON[c.level] || 'file-text', 15)}<span>${esc(c.text)}</span></li>`).join('')}</ul>`;
}

function roRenderReceipts() {
  const host = document.getElementById('receiptsHost');
  if (!host) return;
  const o = state.order;
  if (!o || o.status === 'draft') { host.innerHTML = ''; return; }
  const byReceipt = {};
  for (const l of state.receiptItems) (byReceipt[l.receipt_id] ||= []).push(l);
  const unitKg = Object.fromEntries(state.items.map(it => [it.id, Number(it.unit_kg) || 0]));
  const canDelete = o.status !== 'closed';
  const rows = state.receipts.map(r => {
    const lines = byReceipt[r.id] || [];
    const kg = lines.reduce((a, l) => a + l.qty_received * (unitKg[l.item_id] || 0), 0);
    const checks = Array.isArray(r.check) ? r.check : [];
    const top = checks.find(c => c.level === 'warn') ? 'warn' : checks.find(c => c.level === 'ok') ? 'ok' : checks.length ? 'info' : null;
    const docs = (state.receiptDocs[r.id] || []).map(d => `<button class="btn btn-ghost btn-sm" data-rc-doc="${esc(d.file_path)}">${uiIcon('paperclip', 13)} ${esc(d.file_name)}</button>`).join('');
    return `<tr class="receipt-row">
      <td>${esc(fmtDate(r.received_on))}</td>
      <td>${(r.note_numbers || []).length ? esc(r.note_numbers.join(', ')) : '<span class="cell-muted">—</span>'}</td>
      <td class="num-cell">${r.note_kg != null ? esc(fmtNum(r.note_kg, 0)) : '<span class="cell-muted">—</span>'}</td>
      <td class="num-cell">${esc(fmtNum(kg, 0))}</td>
      <td>${top ? `<details><summary>${top === 'warn' ? '<span class="lic-status lic-status-progress">לבדיקה</span>' : top === 'ok' ? '<span class="lic-status lic-status-done">תואם</span>' : '<span class="lic-status lic-status-open">מידע</span>'}</summary>${roChecksHtml(checks)}</details>` : '<span class="cell-muted">—</span>'}</td>
      <td>${docs || '<span class="cell-muted">—</span>'}</td>
      <td class="row-actions">${canDelete ? `<div class="row-actions-inner"><button class="icon-btn danger" data-rc-del="${r.id}" title="מחיקת הקבלה" aria-label="מחיקת הקבלה">${uiIcon('trash')}</button></div>` : ''}</td>
    </tr>`;
  }).join('');
  host.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2 class="with-ico">${ico3d('incoming', 26)}קבלות</h2>
        <div class="header-actions">
          <div class="unit-totals"><span class="unit-pill">סופק ${orderProgress(state.items, state.receiptItems).pct}%</span></div>
          ${['sent', 'partial', 'complete'].includes(o.status) ? '<button class="btn btn-primary" data-act="receive">+ קבלת משלוח</button>' : ''}
        </div>
      </div>
      <div class="table-wrap">
        <table class="items-table">
          <thead><tr><th>תאריך</th><th>תעודות</th><th>לפי התעודה (ק״ג)</th><th>סומן (ק״ג)</th><th>בדיקה</th><th>קובץ</th><th><span class="sr-only">פעולות</span></th></tr></thead>
          <tbody>${rows || '<tr class="empty-row"><td colspan="7">עדיין לא נקלט משלוח להזמנה הזו</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

async function roDeleteReceipt(id) {
  const r = state.receipts.find(x => x.id === id);
  if (!r || !confirm('למחוק את הקבלה? השורות שסומנו בה יחזרו ל"נותר", והתעודה המצורפת תימחק.')) return;
  const docs = state.receiptDocs[id] || [];
  const { error } = await sb.from('rebar_receipts').delete().eq('id', id);
  if (error) { toast(rebarDbError(error), 'error'); return; }
  if (docs.length) {
    await sb.from('documents').delete().in('id', docs.map(d => d.id));
    await sb.storage.from('documents').remove(docs.map(d => d.file_path));
  }
  toast('הקבלה נמחקה', 'success');
  await roOpenOrder(state.order.id);
}

async function roOpenReceiptDoc(path) {
  const { data, error } = await sb.storage.from('documents').createSignedUrl(path, 3600);
  if (error || !data) { toast('לא ניתן לפתוח את הקובץ', 'error'); return; }
  window.open(data.signedUrl, '_blank', 'noopener');
}

// ---- the "קבלת משלוח" dialog ----
function roReceiptPrior() { return receivedByItem(state.receiptItems); }

function roOpenReceiptDialog() {
  Object.assign(rc, { file: null, note: null, reading: false });
  const prior = roReceiptPrior();
  const lines = state.items.map(it => {
    const left = Math.max(0, Number(it.qty) - (prior[it.id] || 0));
    const elSvg = it.kind === 'element' ? elementSvg(it.params, { w: 110, h: 44, stroke: 1.4 }) : null;
    const desc = it.kind === 'bar'
      ? (it.shape ? `<span class="shape-thumb" style="width:110px;height:44px">${shapeSvg(it.shape, { w: 110, h: 44, stroke: 1.4 })}</span>` : '')
      : it.kind === 'element' ? (elSvg ? `<span class="shape-thumb" style="width:110px;height:44px">${elSvg}</span>` : esc(elementDesc(it)))
      : it.kind === 'mesh' ? `<bdi dir="ltr">${esc(`${it.params.x}×${it.params.y}`)}</bdi>` : `<bdi dir="ltr">${esc(`${it.params.d}/${it.params.D}`)}</bdi>`;
    return `<tr data-rc-item="${it.id}">
      <td>${esc(RO_SECTIONS[it.kind].item)} ${it.line_no}${it.alias ? ' · ' + esc(it.alias) : ''}</td>
      <td class="num-cell">${esc(fmtNum(left, 0))}</td>
      <td><input type="checkbox" data-rc-all="${it.id}" aria-label="הגיע הכל" ${left ? '' : 'disabled'}></td>
      <td><input inputmode="numeric" data-rc-qty="${it.id}" placeholder="0" aria-label="כמות שהגיעה"></td>
      <td class="num-cell">${it.diameter_mm ? `<bdi dir="ltr">Ø${esc(fmtNum(it.diameter_mm, 1))}</bdi>` : '—'}</td>
      <td class="num-cell">${esc(fmtNum(it.qty, 0))}</td>
      <td>${desc}</td>
    </tr>`;
  }).join('');
  document.getElementById('receiptModal').innerHTML = `
    <button class="icon-btn modal-close" data-rc-x aria-label="סגירה">${uiIcon('x', 18)}</button>
    <h3>קבלת משלוח — הזמנה ${esc(state.order.order_no)}</h3>
    <div id="rcMsg" class="msg"></div>
    <div class="ocr-zone" id="rcZone">
      <img class="zone-ico" src="icons/nav/scan.webp" alt="" aria-hidden="true" width="44" height="44">
      <div>צלמו או גררו כאן את תעודת המשלוח (תמונה או PDF)</div>
      <div style="font-size:11px;color:var(--steel);margin-top:4px;">התעודה נקראת אוטומטית ונבדקת מול השורות שתסמנו</div>
      <input type="file" id="rcFile" accept="image/*,.pdf" style="display:none;">
    </div>
    <div class="ocr-progress" id="rcProgress"><div class="spinner"></div><span id="rcProgressText">מעבד...</span></div>
    <div id="rcRead"></div>
    <div class="form-grid">
      <div class="field"><label for="rcDate">תאריך קבלה</label><input type="date" id="rcDate" value="${roToday()}"></div>
      <div class="field"><label for="rcNotes">הערות</label><input id="rcNotes" maxlength="300"></div>
    </div>
    <div class="card-header" style="margin-top:14px;padding:0;"><h2 style="font-size:15px;">מה הגיע</h2>
      <div class="header-actions"><button type="button" class="btn btn-outline btn-sm" data-rc-mark>סמן הכל</button></div></div>
    <div class="table-wrap"><table class="items-table rc-lines">
      <thead><tr><th>שורה</th><th>נותר</th><th>הגיע הכל</th><th>כמות שהגיעה</th><th>קוטר</th><th>הוזמן</th><th>שרטוט / מידות</th></tr></thead>
      <tbody>${lines}</tbody></table></div>
    <div id="rcChecks" style="margin-top:12px;"></div>
    <div class="modal-actions">
      <button type="button" class="btn btn-primary" data-rc-save>שמור</button>
      <button type="button" class="btn btn-outline" data-rc-x>ביטול</button>
    </div>`;
  document.getElementById('receiptBackdrop').classList.add('open');
  roReceiptChecks();
}

function roReceiptTicked() {
  return [...document.querySelectorAll('#receiptModal [data-rc-qty]')]
    .map(el => ({ item_id: el.dataset.rcQty, qty: parseNum(el.value) }))
    .filter(t => t.qty !== null && t.qty > 0);
}

function roReceiptChecks() {
  const host = document.getElementById('rcChecks');
  if (!host) return;
  const ticked = roReceiptTicked();
  if (!ticked.length) { host.innerHTML = ''; return []; }
  const checks = receiptCheck({
    order: state.order, items: state.items, ticked, note: rc.note,
    priorNotes: state.receipts.flatMap(r => r.note_numbers || []), prior: roReceiptPrior(),
  });
  host.innerHTML = roChecksHtml(checks);
  return checks;
}

async function roReadReceiptFile(file) {
  rc.file = file; rc.note = null; rc.reading = true;
  const prog = document.getElementById('rcProgress'), txt = document.getElementById('rcProgressText');
  prog.classList.add('show');
  try {
    const doc = await sgpReadDocument(file, { onProgress: t => { txt.textContent = t; } });
    const ex = sgpExtract(doc, file.name) || {};
    rc.note = ex.kind === 'rebar_note' ? ex : null;
    const read = document.getElementById('rcRead');
    if (rc.note) {
      const parts = [
        (rc.note.notes || []).length ? `תעודה <b>${esc(rc.note.notes.join(', '))}</b>` : '',
        rc.note.date ? esc(fmtDate(rc.note.date)) : '',
        rc.note.total_kg ? `<b>${esc(fmtNum(rc.note.total_kg, 0))}</b> ק״ג` : 'המשקל לא נקרא',
        (rc.note.orders || []).length ? `הזמנה ${esc(rc.note.orders.join(', '))}` : '',
      ].filter(Boolean);
      const groups = [...new Set((rc.note.rows || []).filter(r => !r.unread).map(r => r.group))];
      read.innerHTML = `<div class="rc-read">${ico3d('scan', 18)} ${parts.join(' · ')}${groups.length ? `<div class="unit-totals" style="justify-content:flex-start;margin-top:6px;">${groups.map(g => `<span class="unit-pill">${esc(g)}</span>`).join('')}</div>` : ''}</div>`;
      if (rc.note.date) document.getElementById('rcDate').value = rc.note.date;
    } else {
      read.innerHTML = `<div class="rc-read">הקובץ לא זוהה כתעודת משלוח ברזל — הוא יצורף לקבלה, והבדיקה תהיה לפי הסימון בלבד</div>`;
    }
    toast('התעודה נקראה — סמנו מה הגיע', 'success');
  } catch (err) {
    console.error(err);
    toast('שגיאה בקריאת התעודה: ' + err.message, 'error');
  } finally {
    rc.reading = false;
    prog.classList.remove('show');
    roReceiptChecks();
  }
}

async function roSaveReceipt() {
  const msg = document.getElementById('rcMsg');
  if (rc.reading) { showMsg(msg, 'התעודה עדיין נקראת — רגע אחד', 'error'); return; }
  const bad = [...document.querySelectorAll('#receiptModal [data-rc-qty]')].filter(el => el.value.trim() && !(Number.isInteger(parseNum(el.value)) && parseNum(el.value) > 0));
  if (bad.length) { showMsg(msg, 'כמות — מספר שלם גדול מ-0', 'error'); bad[0].focus(); return; }
  const ticked = roReceiptTicked();
  if (!ticked.length) { showMsg(msg, 'סמנו לפחות שורה אחת שהגיעה', 'error'); return; }
  const checks = roReceiptChecks();
  const { user, site } = state.ctx, o = state.order;
  const btn = document.querySelector('#receiptModal [data-rc-save]');
  btn.disabled = true;
  let receiptId = null, path = null;
  try {
    const { data: receipt, error } = await sb.from('rebar_receipts').insert({
      site_id: site.id, order_id: o.id, received_on: document.getElementById('rcDate').value || roToday(),
      note_numbers: rc.note ? rc.note.notes || [] : [], note_kg: rc.note && rc.note.total_kg ? rc.note.total_kg : null,
      check: checks, notes: document.getElementById('rcNotes').value.trim() || null, created_by: user.id,
    }).select('id').single();
    if (error) throw error;
    receiptId = receipt.id;
    const { error: e2 } = await sb.from('rebar_receipt_items').insert(ticked.map(t => ({
      site_id: site.id, receipt_id: receiptId, item_id: t.item_id, qty_received: t.qty, created_by: user.id,
    })));
    if (e2) throw e2;
    if (rc.file) {
      const ext = (rc.file.name.split('.').pop() || 'pdf').toLowerCase();
      path = `${site.id}/rebar_receipts/${receiptId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: up } = await sb.storage.from('documents').upload(path, rc.file);
      if (up) { path = null; throw up; }
      const { error: e3 } = await sb.from('documents').insert({
        site_id: site.id, doc_type: 'delivery_note', title: rc.file.name, file_path: path, file_name: rc.file.name,
        file_size: rc.file.size, linked_table: 'rebar_receipts', linked_record_id: receiptId, uploaded_by: user.id,
        document_date: rc.note && rc.note.date ? rc.note.date : null,
        ...(rc.note ? { extracted: rc.note, extracted_at: new Date().toISOString() } : {}),
      });
      if (e3) throw e3;
    }
  } catch (err) {
    // no half receipt: take back what was written
    if (path) await sb.storage.from('documents').remove([path]);
    if (receiptId) await sb.from('rebar_receipts').delete().eq('id', receiptId);
    btn.disabled = false;
    showMsg(msg, rebarDbError(err), 'error');
    return;
  }
  document.getElementById('receiptBackdrop').classList.remove('open');
  toast('הקבלה נשמרה', 'success');
  await roOpenOrder(o.id);
}

function roReceiptEvents() {
  const modal = document.getElementById('receiptModal');
  modal.addEventListener('click', e => {
    if (e.target.closest('[data-rc-x]')) { document.getElementById('receiptBackdrop').classList.remove('open'); return; }
    if (e.target.closest('[data-rc-save]')) { roSaveReceipt(); return; }
    if (e.target.closest('#rcZone')) { document.getElementById('rcFile').click(); return; }
    if (e.target.closest('[data-rc-mark]')) {
      modal.querySelectorAll('[data-rc-all]:not(:disabled)').forEach(cb => { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
    }
  });
  modal.addEventListener('change', e => {
    if (e.target.id === 'rcFile' && e.target.files[0]) { roReadReceiptFile(e.target.files[0]); e.target.value = ''; return; }
    const all = e.target.closest('[data-rc-all]');
    if (all) {
      const prior = roReceiptPrior(), it = state.items.find(i => i.id === all.dataset.rcAll);
      const input = modal.querySelector(`[data-rc-qty="${all.dataset.rcAll}"]`);
      input.value = all.checked ? String(Math.max(0, Number(it.qty) - (prior[it.id] || 0))) : '';
      roReceiptChecks();
    }
  });
  modal.addEventListener('input', e => { if (e.target.closest('[data-rc-qty]')) roReceiptChecks(); });
  modal.addEventListener('dragover', e => { const z = e.target.closest('#rcZone'); if (z) { e.preventDefault(); z.classList.add('dragover'); } });
  modal.addEventListener('dragleave', e => { const z = e.target.closest('#rcZone'); if (z) z.classList.remove('dragover'); });
  modal.addEventListener('drop', e => {
    const z = e.target.closest('#rcZone');
    if (!z) return;
    e.preventDefault(); z.classList.remove('dragover');
    if (e.dataTransfer.files[0]) roReadReceiptFile(e.dataTransfer.files[0]);
  });
}

// ===== start =====
(async function () {
  const auth = await requireAuth('rebar.html');   // the order screen belongs to the ברזל page
  if (!auth) return;
  state.ctx = auth;

  document.getElementById('edActions').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (b) roAction(b.dataset.act);
  });
  document.getElementById('headerForm').addEventListener('input', e => {
    if (!roIsDraft()) return;
    if (e.target.id === 'f-order_no') state.noTouched = false;
    roReadHeader();
    roMarkDirty();
    if (e.target.id === 'f-waste_pct') roRenderSummary();
  });
  document.getElementById('headerForm').addEventListener('submit', e => e.preventDefault());
  document.getElementById('addContactBtn').addEventListener('click', () => {
    roReadHeader();
    state.order.contacts = [...(state.order.contacts || []), { name: '', phone: '', role: '' }];
    roRenderContacts();
    roMarkDirty();
  });
  document.getElementById('contactsList').addEventListener('click', e => {
    const del = e.target.closest('[data-del-contact]');
    if (!del) return;
    roReadHeader();
    const rows = [...document.querySelectorAll('#contactsList .contact-row')];
    rows[Number(del.dataset.delContact)].remove();
    roReadHeader();
    roRenderContacts();
    roMarkDirty();
  });
  document.getElementById('sectionsHost').addEventListener('click', e => {
    const t = e.target.closest('[data-add],[data-edit-line],[data-copy-line],[data-del-line]');
    if (!t || !roIsDraft()) return;
    if (t.dataset.add) roOpenItemDialog(t.dataset.add, null);
    else if (t.dataset.editLine !== undefined) roOpenItemDialog(state.items[Number(t.dataset.editLine)].kind, Number(t.dataset.editLine));
    else if (t.dataset.copyLine !== undefined) roCopyLine(Number(t.dataset.copyLine));
    else if (t.dataset.delLine !== undefined) roDeleteLine(Number(t.dataset.delLine));
  });
  document.getElementById('closeConfirm').addEventListener('click', roConfirmClose);
  for (const id of ['closeCancel', 'closeX']) {
    document.getElementById(id).addEventListener('click', () => document.getElementById('closeBackdrop').classList.remove('open'));
  }
  roItemDialogEvents();
  roReceiptEvents();
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  document.getElementById('receiptsHost').addEventListener('click', e => {
    const del = e.target.closest('[data-rc-del]');
    if (del) { roDeleteReceipt(del.dataset.rcDel); return; }
    const doc = e.target.closest('[data-rc-doc]');
    if (doc) { roOpenReceiptDoc(doc.dataset.rcDoc); return; }
    const act = e.target.closest('[data-act]');
    if (act) roAction(act.dataset.act);
  });
  window.addEventListener('beforeunload', e => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

  // suppliers already used on this site, for the supplier field
  const [{ data: a }, { data: b }] = await Promise.all([
    sb.from('rebar_orders').select('supplier').eq('site_id', auth.site.id),
    sb.from('rebar_deliveries').select('supplier').eq('site_id', auth.site.id),
  ]);
  const names = [...new Set([...(a || []), ...(b || [])].map(r => (r.supplier || '').trim()).filter(Boolean))].sort();
  document.getElementById('supplierList').innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');

  const route = rebarOrderRoute(location.hash);
  if (route.mode === 'new') await roNewOrder();
  else if (route.mode) {
    await roOpenOrder(route.id);
    // the pencil of the tracking table: a sent order that received nothing goes back to editing
    if (route.mode === 'edit' && state.order && state.order.id === route.id && state.order.status === 'sent') {
      if (state.receipts.length) toast(rebarDbError({ message: 'rebar_order_has_receipts' }), 'error');
      else if (confirm(RO_REOPEN_Q)) await roSetStatus({ status: 'draft' }, 'ההזמנה פתוחה לעריכה');
    }
  } else location.replace('rebar.html');   // the orders are listed in the ברזל page
})();
