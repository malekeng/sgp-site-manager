// הדרכות בטיחות (2026-11-19): the training form as a sheet of paper — blank, to print and fill by
// hand (20 empty lines for the workers), or with what the contractor filled and signed through the
// link (training.html). One builder for both, so the printed copy and the signed copy look alike.
// Needs js/safety-core.js. Styles: css/safety-form.css (.sf-*).

const SAFETY_BLANK_ROWS = 20;
// TADOK's logo with navy lettering, for white paper
const SAFETY_TADOK_LOGO = 'brand/tadok-logo-dark.png';

// the company's logo goes into an attribute: only a picture inlined as data, or an https address
// with nothing in it that could close the attribute
function sfLogoOk(url) {
  return typeof url === 'string'
    && (/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(url) || /^https:\/\/[^\s"'<>`]+$/.test(url));
}

// values only ever go into text, never into an attribute, so & < > are all that need escaping
// (and the form's own texts keep their quotes: 'חלק א'', '"בעל מקצוע מתאים"')
function sfEsc(s) {
  return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
// '2026-11-19' → '19/11/2026', as the date is written on paper
function sfDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
// only a real PNG drawing becomes a picture; anything else is left out
function sfSig(sig) {
  return typeof sig === 'string' && SAFETY_SIGNATURE_RE.test(sig) ? `<img class="sf-sig" src="${sig}" alt="חתימה">` : '';
}
function sfSubmittedAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// data = { company, site, form: { ...columns, topics: [keys] }, people: [...] }; opts.blank → empty form
function sgpSafetyDocHtml(data, opts = {}) {
  const d = data || {}, blank = !!opts.blank;
  const f = blank ? {} : (d.form || {});
  const people = blank ? [] : (d.people || []);
  const topics = new Set(f.topics || []);
  const val = fld => {
    const v = f[fld.key];
    return fld.type === 'date' ? sfDate(v) : sfEsc(v);
  };
  // the long ones (an address, the instructor's role with its three options) get a whole row
  const FULL_ROW = ['site_name', 'instructor_role'];
  const line = fld => `<div class="sf-field${FULL_ROW.includes(fld.key) ? ' sf-full' : ''}"><span class="sf-label">${sfEsc(fld.label)}:</span><span class="sf-value">${val(fld)}</span></div>`;
  const partA = SAFETY_FIELDS.filter(x => x.part === 'A');
  const partC = SAFETY_FIELDS.filter(x => x.part === 'C');
  const byKey = k => SAFETY_FIELDS.find(x => x.key === k);

  // the company's logo when it has one, TADOK's always (every file the site produces, 2026-11-20)
  const head = `<header class="sf-head">
    <div class="sf-logos">${sfLogoOk(d.logo) ? `<img class="sf-logo" src="${d.logo}" alt="">` : '<span></span>'}
      <img class="sf-tadok" src="${SAFETY_TADOK_LOGO}" alt="TADOK"></div>
    ${d.company ? `<div class="sf-company">${sfEsc(d.company)}</div>` : ''}
    <h1 class="sf-title">${sfEsc(SAFETY_TITLE)}</h1>
  </header>`;

  const a = `<section class="sf-part">
    <h2>${sfEsc(SAFETY_PART_A)}</h2>
    <div class="sf-grid">
      ${partA.filter(x => !['start_time', 'end_time', 'training_date'].includes(x.key)).map(line).join('')}
      <div class="sf-field"><span class="sf-label">${sfEsc(byKey('training_date').label)}:</span><span class="sf-value">${val(byKey('training_date'))}</span></div>
      <div class="sf-field"><span class="sf-label">שעות ההדרכה:</span><span class="sf-value">${sfEsc(f.start_time)}${f.start_time || f.end_time ? ' – ' : ''}${sfEsc(f.end_time)}</span></div>
    </div>
    <div class="sf-field sf-wide"><span class="sf-label">אופן ההדרכה:</span><span class="sf-value">☒ ${sfEsc(SAFETY_FACE_TO_FACE)}</span></div>
  </section>`;

  const b = `<section class="sf-part">
    <h2>${sfEsc(SAFETY_PART_B)}</h2>
    <p class="sf-intro">${sfEsc(SAFETY_PART_B_INTRO)}</p>
    <ul class="sf-topics">
      ${SAFETY_TOPICS.map(t => `<li>${topics.has(t.key) ? '<span class="sf-box on">✓</span>' : '<span class="sf-box"></span>'}
        <div><strong>${sfEsc(t.title)}:</strong> ${sfEsc(t.text)}</div></li>`).join('')}
    </ul>
  </section>`;

  const c = `<section class="sf-part">
    <h2>${sfEsc(SAFETY_PART_C)}</h2>
    <p class="sf-intro">${sfEsc(SAFETY_PART_C_INTRO)}</p>
    <blockquote class="sf-declaration">"${sfEsc(SAFETY_DECLARATION)}"</blockquote>
    <div class="sf-grid">
      ${partC.filter(x => x.key !== 'instructor_signed_on').map(line).join('')}
      <div class="sf-field"><span class="sf-label">חתימה:</span><span class="sf-value sf-sign">${blank ? '' : sfSig(f.instructor_signature)}</span></div>
      ${line(byKey('instructor_signed_on'))}
    </div>
  </section>`;

  const rows = blank
    ? Array.from({ length: SAFETY_BLANK_ROWS }, (_, i) => ({ n: i + 1 }))
    : people.map((p, i) => ({ ...p, n: i + 1 }));
  const dPart = `<section class="sf-part sf-people-part">
    <h2>${sfEsc(SAFETY_PART_D)}</h2>
    <table class="sf-people">
      <thead><tr><th>#</th>${SAFETY_PEOPLE.map(col => `<th>${sfEsc(col.label)}</th>`).join('')}<th>קיבל תמצית בכתב</th><th>חתימה</th></tr></thead>
      <tbody>${rows.map(p => `<tr class="sf-person"><td>${p.n}</td>${SAFETY_PEOPLE.map(col => `<td>${sfEsc(p[col.key])}</td>`).join('')}`
        + `<td class="sf-c">${p.summary_received ? '✓' : ''}</td><td class="sf-sign">${blank ? '' : sfSig(p.signature)}</td></tr>`).join('')}</tbody>
    </table>
  </section>`;

  const when = sfSubmittedAt(f.submitted_at);
  const foot = `<footer class="sf-foot">${blank
    ? 'TADOK · טופס למילוי ידני'
    : `נחתם דרך TADOK${when ? ' ב-' + sfEsc(when) : ''} · ${people.length} משתתפים`}</footer>`;

  return `<article class="sf-doc" dir="rtl">${head}${a}${b}${c}${dPart}${foot}</article>`;
}
