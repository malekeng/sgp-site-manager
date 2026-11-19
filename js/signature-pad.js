// A box to sign in with a finger, a pen or the mouse (הדרכות בטיחות, 2026-11-19). The drawing is
// kept as a small PNG (at most 480×160) so a form with many signatures stays light.

const SIGNATURE_MAX_W = 480;
const SIGNATURE_MAX_H = 160;

// shrink (never grow) a w×h drawing to fit maxW×maxH, keeping its shape
function sgpSignatureScale(w, h, maxW, maxH) {
  const k = Math.min(1, maxW / w, maxH / h);
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

// canvas → { isEmpty(), clear(), toDataURL(), fit() }; onChange runs after each stroke and clear
function sgpSignaturePad(canvas, { onChange } = {}) {
  canvas.style.touchAction = 'none';
  const ctx = canvas.getContext('2d');
  let strokes = 0, drawing = false, moved = false, last = null;

  function fit() {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0E1A20';
    ctx.fillStyle = '#0E1A20';
    strokes = 0;
  }
  const pos = e => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing = true; moved = false;
    last = pos(e);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    for (const ev of events.length ? events : [e]) { last = pos(ev); ctx.lineTo(last.x, last.y); }
    ctx.stroke();
    moved = true;
  });
  const end = () => {
    if (!drawing) return;
    drawing = false;
    if (!moved) { ctx.beginPath(); ctx.arc(last.x, last.y, 1.4, 0, Math.PI * 2); ctx.fill(); }
    strokes++;
    if (onChange) onChange();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  fit();
  return {
    fit,
    isEmpty: () => strokes === 0,
    clear() {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore();
      strokes = 0;
      if (onChange) onChange();
    },
    toDataURL() {
      if (!strokes) return null;
      const { w, h } = sgpSignatureScale(canvas.width, canvas.height, SIGNATURE_MAX_W, SIGNATURE_MAX_H);
      const out = document.createElement('canvas');
      out.width = w; out.height = h;
      out.getContext('2d').drawImage(canvas, 0, 0, w, h);
      return out.toDataURL('image/png');
    },
  };
}
