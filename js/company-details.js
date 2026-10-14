// ===== A company's details: ח.פ / ע.מ (2026-10-14) =====
// Used by the join form, the operator console and הגדרות החברה. The database keeps the
// number as 9 digits and refuses anything else, so the pages normalize what was typed first.

const TAX_ID_ERROR = 'ח.פ / ע.מ — 9 ספרות';

// "51-234567-8" → "512345678"; blank → no value; anything that is not 9 digits → the error
function normalizeTaxId(v) {
  const raw = String(v ?? '').trim();
  if (!raw) return { value: null, error: null };
  const digits = raw.replace(/[\s.\/-]/g, '');
  return /^[0-9]{9}$/.test(digits) ? { value: digits, error: null } : { value: null, error: TAX_ID_ERROR };
}
