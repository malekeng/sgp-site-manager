// ===== Platform documents: the links to them, their versions, and the acceptance gate =====
// Loaded by every page — the app pages (before app.js) and the public ones (sign-in,
// contractor pages, support) — so the links and versions live in exactly one place.

// The platform's own pages, in the order they are shown wherever a page lists them.
const TADOK_LEGAL_LINKS = [
  { href: 'terms.html', label: 'תנאי שימוש' },
  { href: 'privacy.html', label: 'פרטיות' },
];

function tadokLegalLinksHtml(sep = ' <span aria-hidden="true">·</span> ') {
  return TADOK_LEGAL_LINKS.map(l => `<a href="${l.href}">${l.label}</a>`).join(sep);
}

// The line at the bottom of a page. The platform's name, not the company's: the copyright
// is the operator's, while the company's name stays in the menu and on its own reports.
function tadokFooterHtml(year = new Date().getFullYear()) {
  return `© ${year} TADOK <span aria-hidden="true">·</span> ${tadokLegalLinksHtml()}`;
}

function tadokFillLegalLinks(root = document) {
  root.querySelectorAll('[data-legal-links]').forEach(el => { el.innerHTML = tadokLegalLinksHtml(); });
  root.querySelectorAll('[data-app-footer]').forEach(el => { el.innerHTML = tadokFooterHtml(); });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => tadokFillLegalLinks());
  else tadokFillLegalLinks();
}
