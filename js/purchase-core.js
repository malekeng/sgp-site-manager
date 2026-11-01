// ===== Purchase orders: the sums of the company's form, what arrived, and an order's rows =====
// Pure helpers for purchase-orders.html (no DOM, no database), tested in Node.
// The numbering and the sender's details are the rebar orders' own: needs rebar-orders-core.js before it.

const PO_UNITS = ["יח'", 'טון', 'ק"ג', 'מ"ר', 'מ"ק', 'מ"א', "קומפ'", 'יום עבודה', 'שעה'];
const PO_VAT_PCT = 18;
const PO_PAYMENT_TERMS = 'שוטף + 60';
const PO_ITEM_COLS = ['sku', 'description', 'unit', 'qty', 'unit_price', 'discount_pct'];
const PO_ORDER_RESET = ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'sent_at', 'sent_by', 'closed_at', 'closed_by', 'close_reason'];
const PO_ITEM_RESET = ['id', 'order_id', 'created_at', 'created_by', 'updated_at', 'updated_by'];

// Excel's ROUND: half up on the decimal digits, not on their binary approximation (1474.875 → 1474.88)
function poRound(x, n = 2) {
  const v = Number(x);
  if (!Number.isFinite(v)) return 0;
  return Number(Math.round(Number(v.toFixed(6) + 'e' + n)) + 'e-' + n);
}
function poMoney(n) {
  return Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function poQty(n) {
  return Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 3 });
}

function poLineTotal(line) {
  const l = line || {};
  return poRound((Number(l.qty) || 0) * (Number(l.unit_price) || 0) * (1 - (Number(l.discount_pct) || 0) / 100));
}

function poTotals(items, vatPct) {
  const net = poRound((items || []).reduce((a, l) => a + poLineTotal(l), 0));
  const vat = poRound(net * (Number(vatPct) || 0) / 100);
  return { net, vat, total: poRound(net + vat) };
}

function poBlankText(v) { return !String(v ?? '').trim(); }

// a row nobody filled is not a line (the unit always holds its default)
function poLineBlank(line) {
  const l = line || {};
  return poBlankText(l.description) && poBlankText(l.sku) && (l.qty === null || l.qty === undefined || l.qty === '')
    && (l.unit_price === null || l.unit_price === undefined || l.unit_price === '');
}

function poLineErrors(line) {
  const l = line || {}, e = [];
  if (poBlankText(l.description)) e.push('חסר תיאור');
  if (poBlankText(l.unit)) e.push('חסרה יחידה');
  if (!(Number(l.qty) > 0)) e.push('כמות גדולה מ-0');
  if (l.unit_price === null || l.unit_price === undefined || l.unit_price === '' || !(Number(l.unit_price) >= 0)) e.push('חסר מחיר');
  const d = l.discount_pct;
  if (d !== null && d !== undefined && d !== '' && !(Number(d) >= 0 && Number(d) <= 100)) e.push('הנחה בין 0 ל-100');
  return e;
}

// one run with the rebar orders: a delivery note quotes the number, so a site must not have it twice
function poNextNo(rebarNos, purchaseNos, date) {
  return nextOrderNo([...(rebarNos || []), ...(purchaseNos || [])], date);
}

function poSupplierKey(name) { return String(name || '').replace(/\s+/g, ' ').trim(); }

// A supplier already used fills its own details: from its latest order, else from the ספקים page.
function poSupplierDetails(name, orders, vendors) {
  const key = poSupplierKey(name);
  if (!key) return null;
  const mine = (orders || []).filter(o => poSupplierKey(o.supplier) === key)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  if (mine.length) {
    const o = mine[0];
    return { supplier_tax_id: o.supplier_tax_id || '', supplier_contact: o.supplier_contact || '', supplier_phone: o.supplier_phone || '',
      supplier_email: o.supplier_email || '', payment_terms: o.payment_terms || '', from_order: o.order_no || null };
  }
  const v = (vendors || []).find(x => poSupplierKey(x.name) === key);
  if (!v) return null;
  return { supplier_tax_id: v.reg_number || '', supplier_contact: v.contact_person || '', supplier_phone: v.phone || '',
    supplier_email: v.email || '', from_order: null };
}

function poSupplierNames(...lists) {
  const names = lists.flat().map(r => poSupplierKey(r && (r.supplier || r.name))).filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'he'));
}

// ---- what arrived; a line can be 2.5 טון, so quantities are decimals ----
function poReceived(receiptItems) {
  const out = {};
  for (const r of receiptItems || []) out[r.item_id] = poRound((out[r.item_id] || 0) + Number(r.qty_received || 0), 3);
  return out;
}

function poRemaining(item, receiptItems) {
  return Math.max(0, poRound(Number(item.qty) - (poReceived(receiptItems)[item.id] || 0), 3));
}

// "התקבלה כל ההזמנה": what is still owed on each line
function poReceiveAllLines(items, receiptItems) {
  return (items || []).map(it => ({ item_id: it.id, qty: poRemaining(it, receiptItems) })).filter(l => l.qty > 0);
}

// Units differ from line to line, so the share is of the lines, each counted up to what it ordered.
function poProgress(items, receiptItems) {
  const list = items || [];
  if (!list.length) return 0;
  const got = poReceived(receiptItems);
  return Math.round(100 * list.reduce((a, it) => a + Math.min(1, (got[it.id] || 0) / Number(it.qty)), 0) / list.length);
}

// "שכפול": a new draft with the same details and lines, under a new number.
function poDuplicate(order, items, orderNo) {
  const o = { ...order, order_no: orderNo, status: 'draft' };
  for (const k of PO_ORDER_RESET) delete o[k];
  const lines = (items || []).map(i => {
    const c = { ...i };
    for (const k of PO_ITEM_RESET) delete c[k];
    return c;
  });
  return { order: o, items: lines };
}

const PO_DB_ERRORS = {
  purchase_order_locked: 'ההזמנה נשלחה ולכן נעולה — פתחו אותה לעריכה',
  purchase_order_needs_items: 'אי אפשר לשלוח הזמנה בלי שורות',
  purchase_order_needs_supplier: 'אי אפשר לשלוח הזמנה בלי ספק',
  purchase_order_has_receipts: 'כבר נקלטו משלוחים להזמנה — סגרו אותה במקום',
  purchase_close_needs_reason: 'יש לכתוב סיבת סגירה',
  purchase_bad_transition: 'הפעולה אינה אפשרית במצב הנוכחי של ההזמנה',
  purchase_site_immutable: 'אי אפשר להעביר הזמנה לאתר אחר',
  purchase_receipt_order_state: 'אפשר לקלוט משלוח רק להזמנה שנשלחה ולא נסגרה',
  purchase_receipt_wrong_order: 'השורה אינה שייכת להזמנה הזו',
};

function poDbError(err) {
  if (!err) return '';
  if (err.code === '23505') return 'מספר ההזמנה כבר קיים באתר';
  const key = Object.keys(PO_DB_ERRORS).find(k => String(err.message || '').startsWith(k));
  return key ? PO_DB_ERRORS[key] : (err.message || String(err));
}

// The page's address: #o=<id> opens an order, #new starts one, anything else is the list.
function poRoute(hash) {
  const m = /^#o=([0-9a-f-]{36})$/.exec(hash || '');
  if (m) return { mode: 'open', id: m[1] };
  return hash === '#new' ? { mode: 'new', id: null } : { mode: 'list', id: null };
}

function poFileName(order) {
  const supplier = poSupplierKey(order.supplier).replace(/[\\/:*?"<>|]/g, '_');
  return `הזמנת רכש ${order.order_no}${supplier ? ' - ' + supplier : ''}.pdf`;
}

// The rows flow over the pages in order; the closing block (sums, notes, signatures) stays whole
// after the last row. Heights are measured; a row taller than a page still lands somewhere.
function poPaginate(rows, tail, firstRoom, restRoom) {
  const pages = [{ rows: [], tail: false }];
  let room = firstRoom;
  (rows || []).forEach((h, i) => {
    const page = pages[pages.length - 1];
    if (page.rows.length && h > room) {
      pages.push({ rows: [i], tail: false });
      room = restRoom - h;
    } else {
      page.rows.push(i);
      room -= h;
    }
  });
  if (tail > room) pages.push({ rows: [], tail: true });
  else pages[pages.length - 1].tail = true;
  return pages;
}
