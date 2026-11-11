(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app'), viewer = $('#viewer'), pagesEl = $('#pages');
const CSS_UNITS = 96 / 72, GAP = 28;
let reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get(k, d) { try { const v = localStorage.getItem('glassreader:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('glassreader:' + k, JSON.stringify(v)); } catch {} }
};
const COLORS = ['#FFD60A', '#34C759', '#5AC8FA', '#FF6FAE', '#FF453A', '#1C1C1E'];
const WIDTHS = [1.2, 2.4, 4.5];

const state = {
  pdf: null, pages: [], zoom: 1, fit: 'auto', rotation: 0, tool: 'select',
  color: store.get('color', COLORS[0]), width: store.get('width', 1), annots: {}, undo: [], redo: [],
  fp: null, current: 1, search: { q: '', matches: [], idx: -1, token: 0 }, loadId: 0
};

/* =================== Sample document (built as real PDF bytes) =================== */
function buildSample() {
  const W = 612, H = 792;
  const esc = s => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const f = n => +n.toFixed(2);
  const rgb = h => [1, 3, 5].map(i => f(parseInt(h.substr(i, 2), 16) / 255)).join(' ');
  const cw = (s, size, bold) => { let w = 0; for (const ch of s) w += /[il.,:;'!|]/.test(ch) ? .25 : /[fjrtI\-() /]/.test(ch) ? .3 : /[mwMW]/.test(ch) ? .84 : /[A-Z]/.test(ch) ? .68 : /[0-9]/.test(ch) ? .556 : .53; return w * size * (bold ? 1.06 : 1); };
  const pages = [], seeds = [];
  function Page() {
    const ops = [];
    const o = {
      ops,
      rect(x, y, w, h, c) { ops.push(`${rgb(c)} rg ${f(x)} ${f(y)} ${f(w)} ${f(h)} re f`); },
      rr(x, y, w, h, r, c, stroke) {
        const k = .5523 * r;
        const p = `${f(x + r)} ${f(y)} m ${f(x + w - r)} ${f(y)} l ${f(x + w - r + k)} ${f(y)} ${f(x + w)} ${f(y + r - k)} ${f(x + w)} ${f(y + r)} c ${f(x + w)} ${f(y + h - r)} l ${f(x + w)} ${f(y + h - r + k)} ${f(x + w - r + k)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)} c ${f(x + r)} ${f(y + h)} l ${f(x + r - k)} ${f(y + h)} ${f(x)} ${f(y + h - r + k)} ${f(x)} ${f(y + h - r)} c ${f(x)} ${f(y + r)} l ${f(x)} ${f(y + r - k)} ${f(x + r - k)} ${f(y)} ${f(x + r)} ${f(y)} c h`;
        ops.push(stroke ? `${rgb(stroke)} RG 1 w ${p} S` : `${rgb(c)} rg ${p} f`);
      },
      circle(cx, cy, r, c) {
        const k = .5523 * r;
        ops.push(`${rgb(c)} rg ${f(cx + r)} ${f(cy)} m ${f(cx + r)} ${f(cy + k)} ${f(cx + k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} c ${f(cx - k)} ${f(cy + r)} ${f(cx - r)} ${f(cy + k)} ${f(cx - r)} ${f(cy)} c ${f(cx - r)} ${f(cy - k)} ${f(cx - k)} ${f(cy - r)} ${f(cx)} ${f(cy - r)} c ${f(cx + k)} ${f(cy - r)} ${f(cx + r)} ${f(cy - k)} ${f(cx + r)} ${f(cy)} c f`);
      },
      text(x, y, size, s, { bold = false, color = '#1C1C1E' } = {}) { ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgb(color)} rg ${f(x)} ${f(y)} Td (${esc(s)}) Tj ET`); },
      wrap(s, size, width, bold) {
        const words = s.split(' '), lines = []; let line = '';
        for (const w of words) { const t = line ? line + ' ' + w : w; if (cw(t, size, bold) > width && line) { lines.push(line); line = w; } else line = t; }
        if (line) lines.push(line); return lines;
      },
      para(x, y, width, s, { size = 12, lead = 18, color = '#3A3F4B', bold = false } = {}) {
        for (const l of o.wrap(s, size, width, bold)) { o.text(x, y, size, l, { color, bold }); y -= lead; }
        return y;
      }
    };
    pages.push(o); return o;
  }
  // Cover
  const c = Page();
  c.rect(0, 0, W, H, '#F4F6FA');
  c.ops.push('q /G1 gs');
  c.circle(440, 610, 210, '#8FB2FF'); c.circle(565, 420, 150, '#FFA9CC'); c.circle(140, 170, 185, '#8FE3C8'); c.circle(250, 740, 120, '#C3B0FF');
  c.ops.push('Q q /G2 gs'); c.rr(60, 236, 492, 316, 30, '#FFFFFF'); c.ops.push('Q');
  c.rr(60, 236, 492, 316, 30, null, '#FFFFFF');
  c.text(96, 502, 10, 'SAMPLE DOCUMENT', { bold: true, color: '#5B606D' });
  c.text(96, 440, 46, 'The Glass', { bold: true });
  c.text(96, 388, 46, 'Handbook', { bold: true });
  c.para(96, 340, 400, 'Everything this reader can do, in six short pages. Scroll, search, highlight and leave notes right here on the page.', { size: 14.5, lead: 21 });
  c.text(96, 268, 10, 'Version 1.0   |   November 2026', { color: '#8B909B' });
  c.text(72, 52, 9, 'Glass Reader sample. Open your own PDF with the folder button in the top bar.', { color: '#8B909B' });

  const chapters = [
    ['Opening documents', [
      ['p', 'Glass Reader opens any PDF on your device. Click the folder button in the top right, or drag a file from your desktop anywhere onto the window.'],
      ['lead', 'Files are read locally and are never uploaded.'],
      ['p', 'Password-protected PDFs work too. When a document is locked, you are asked for its password before the first page appears.'],
      ['b', 'Open: the folder button, or Ctrl/Cmd + O'],
      ['b', 'Drag and drop: release a PDF anywhere on the window'],
      ['b', 'The title in the top bar comes from the document itself when it has one'],
      ['tip', 'Your highlights, drawings and notes are remembered in this browser for each document, so you can close the tab and pick up where you left off.']]],
    ['Moving around', [
      ['p', 'Pages scroll as one continuous column. While you scroll, a page scrubber appears on the right edge. Drag it to travel through long documents quickly.'],
      ['p', 'Open the sidebar to see page thumbnails or the document outline. Click any thumbnail or heading to jump straight there.'],
      ['b', 'Zoom: pinch on a trackpad or touch screen, or hold Ctrl/Cmd and scroll'],
      ['b', 'Fit width, fit page and actual size live in the View menu'],
      ['b', 'Type a page number in the top bar and press Return'],
      ['b', 'Rotate pages left or right from the View menu, or press R'],
      ['tip', 'The tool dock at the bottom tucks itself away while you read, and comes back as soon as you scroll up.']]],
    ['Marking up', [
      ['p', 'Select any text with the pointer and a small palette appears. Pick a color to highlight the selection, or copy the text.'],
      ['b', 'Highlighter: drag across text, or drag a box over images and scans'],
      ['b', 'Pen: draw freely with the current color and stroke width'],
      ['b', 'Note: click anywhere on a page to pin a note'],
      ['b', 'Eraser: drag over any mark to remove it'],
      ['b', 'Undo and redo with Ctrl/Cmd + Z and Shift + Ctrl/Cmd + Z'],
      ['tip', 'Try it on this sentence: choose the highlighter in the dock, then drag across these words.']]],
    ['Searching', [
      ['p', 'Press Ctrl/Cmd + F to search the whole document. Matches are highlighted on every page, and the counter shows where you are.'],
      ['b', 'Return moves to the next match'],
      ['b', 'Shift + Return moves to the previous one'],
      ['b', 'Escape closes the search field'],
      ['p', 'Practice here. Search for the word glass and step through the results. Glass is made from sand, soda ash and limestone, heated until they flow like honey. As it cools, the liquid stiffens without forming crystals, which is why glass lets light straight through.'],
      ['tip', 'Search works on documents that contain real text. Scanned pages are pictures of text, so there is nothing to find on them.']]],
    ['Keyboard shortcuts', 'keys']
  ];
  const KEYS = [['V', 'Select text'], ['H', 'Pan'], ['M', 'Highlighter'], ['P', 'Pen'], ['N', 'Note'], ['E', 'Eraser'], ['S', 'Show or hide the sidebar'], ['F', 'Focus mode'], ['R  /  Shift R', 'Rotate right / left'], ['Left  /  Right', 'Previous / next page'], ['Ctrl/Cmd F', 'Search'], ['Ctrl/Cmd + / -', 'Zoom in / out'], ['Ctrl/Cmd 0', 'Fit width'], ['Ctrl/Cmd Z', 'Undo']];
  chapters.forEach(([title, blocks], ci) => {
    const p = Page(), n = ci + 2, X = 72, CW = 468;
    p.text(X, 740, 8.5, 'THE GLASS HANDBOOK', { bold: true, color: '#8B909B' });
    const lab = 'CHAPTER ' + (ci + 1); p.text(W - X - cw(lab, 8.5, true), 740, 8.5, lab, { bold: true, color: '#8B909B' });
    p.rect(X, 728, CW, .6, '#DFE3EA');
    p.text(X, 672, 30, title, { bold: true });
    if (n === 3) seeds.push({ page: 3, item: { type: 'ink', color: '#5AC8FA', w: 2.4, pts: Array.from({ length: 24 }, (_, i) => [X + i * (cw(title, 30, true) / 23), 660 + Math.sin(i / 1.6) * 2.4]) } });
    let y = 630;
    if (blocks === 'keys') {
      y = p.para(X, y, CW, 'Single-letter shortcuts work whenever you are not typing in a field.') - 12;
      for (const [k, a] of KEYS) {
        const kw = cw(k, 10, true) + 20;
        p.rr(X, y - 7, kw, 22, 6, '#EEF0F4'); p.rr(X, y - 7, kw, 22, 6, null, '#D5D9E1');
        p.text(X + 10, y, 10, k, { bold: true, color: '#3A3F4B' });
        p.text(X + 150, y, 12, a, { color: '#3A3F4B' });
        p.rect(X, y - 15, CW, .5, '#E8EBF0');
        y -= 32;
      }
    } else for (const [kind, s] of blocks) {
      if (kind === 'p') y = p.para(X, y, CW, s) - 12;
      else if (kind === 'lead') {
        p.text(X, y, 13.5, s, { bold: true, color: '#1C1C1E' });
        seeds.push({ page: n, item: { type: 'rect', color: '#FFD60A', r: [X - 2, y - 4, X + 2 + cw(s, 13.5, true), y + 13] } });
        y -= 30;
      } else if (kind === 'b') {
        p.circle(X + 4, y + 4, 2.2, '#0A7AFF');
        y = p.para(X + 18, y, CW - 18, s) - 8;
      } else if (kind === 'tip') {
        y -= 8;
        const lines = p.wrap(s, 11.5, CW - 40), h = lines.length * 17 + 44;
        p.rr(X, y - h + 14, CW, h, 14, '#EAF2FF');
        p.text(X + 20, y - 8, 8.5, 'TIP', { bold: true, color: '#2A63D4' });
        let ty = y - 28; for (const l of lines) { p.text(X + 20, ty, 11.5, l, { color: '#2450B0' }); ty -= 17; }
        y -= h + 10;
      }
    }
    if (n === 4) seeds.push({ page: 4, item: { type: 'note', color: '#FFD60A', at: [520, 690], text: 'Example note. Tap the pin to edit it, or use the trash button to delete it.' } });
    p.text(W / 2 - 3, 40, 9, String(n), { color: '#8B909B' });
  });

  // Serialize
  const N = pages.length, objs = [];
  const set = (n, body) => { objs[n] = body; };
  const pageObj = i => 6 + i * 2, outBase = 6 + N * 2;
  const titles = ['Cover', ...chapters.map(c => c[0])];
  set(1, `<< /Type /Catalog /Pages 2 0 R /Outlines 5 0 R >>`);
  set(2, `<< /Type /Pages /Kids [${pages.map((_, i) => pageObj(i) + ' 0 R').join(' ')}] /Count ${N} >>`);
  set(3, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
  set(4, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
  set(5, `<< /Type /Outlines /First ${outBase} 0 R /Last ${outBase + N - 1} 0 R /Count ${N} >>`);
  pages.forEach((p, i) => {
    const s = p.ops.join('\n');
    set(pageObj(i), `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${pageObj(i) + 1} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /ExtGState << /G1 << /ca 0.55 >> /G2 << /ca 0.72 >> >> >> >>`);
    set(pageObj(i) + 1, `<< /Length ${s.length} >>\nstream\n${s}\nendstream`);
  });
  titles.forEach((t, i) => {
    const n = outBase + i;
    set(n, `<< /Title (${esc(t)}) /Parent 5 0 R /Dest [${pageObj(i)} 0 R /Fit]${i > 0 ? ` /Prev ${n - 1} 0 R` : ''}${i < N - 1 ? ` /Next ${n + 1} 0 R` : ''} >>`);
  });
  const info = outBase + N;
  set(info, `<< /Title (The Glass Handbook) /Author (Glass Reader) >>`);
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const off = [];
  for (let n = 1; n <= info; n++) { off[n] = out.length; out += `${n} 0 obj\n${objs[n]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${info + 1}\n0000000000 65535 f \n` + off.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${info + 1} /Root 1 0 R /Info ${info} 0 R /ID [<9E1B4C2A77D04F3B8A6C1E5D2F3A4B5C> <9E1B4C2A77D04F3B8A6C1E5D2F3A4B5C>] >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return { bytes, seeds };
}

/* =================== UI helpers =================== */
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }
function loader(on, text) { $('#loader').classList.toggle('show', on); if (text) $('#loaderText').textContent = text; }

const pops = ['#searchPanel', '#viewMenu', '#colorPop', '#selPop', '#notePop'].map(s => $(s));
function closePops(except) { for (const p of pops) if (p !== except) p.classList.remove('show'); $('#btnView').classList.toggle('on', $('#viewMenu').classList.contains('show')); }
document.addEventListener('pointerdown', e => {
  if (e.noteOpened || e.target.closest('.pop') || e.target.closest('#btnView,#btnColor,#btnSearch,.note-pin')) return;
  for (const p of pops) if (p.id !== 'searchPanel') p.classList.remove('show');
  $('#btnView').classList.remove('on');
  if (state.notePopFor) closeNote();
});

/* =================== Scrolling =================== */
// Mac-style scrolling, driven by momentum physics:
//  - Mouse wheel: each notch adds speed; spinning faster builds more (wheel acceleration).
//  - Trackpad: the page follows your fingers exactly, then keeps gliding after you lift them.
//  - Reversing direction stops the glide at once.
//  - At either end the page stretches like a rubber band and springs back.
const prefs = { smoothScroll: store.get('smoothScroll', true) };
const FRICTION = 4.2; // per second: a flick glides for about half a second, like macOS
const M = { raf: 0, last: 0, y: 0, x: 0, vy: 0, vx: 0, over: 0, touching: false, lastInput: 0, lastNotch: 0, streak: 0, samples: [] };
const rubber = (o, d) => Math.sign(o) * (1 - 1 / (Math.abs(o) * .55 / d + 1)) * d;
function glideStop() {
  cancelAnimationFrame(M.raf); M.raf = 0; M.vy = M.vx = 0; M.touching = false;
  if (M.over) { M.over = 0; pagesEl.style.removeProperty('--el'); }
}
function mStart() {
  if (M.raf) return;
  M.y = M.wy = viewer.scrollTop; M.x = viewer.scrollLeft; M.last = performance.now();
  M.raf = requestAnimationFrame(mStep);
}
function mStep(now) {
  const dt = Math.min(.05, (now - M.last) / 1000); M.last = now;
  const maxY = Math.max(0, viewer.scrollHeight - viewer.clientHeight), maxX = Math.max(0, viewer.scrollWidth - viewer.clientWidth);
  if (M.touching && now - M.lastInput > 70) M.touching = false; // fingers lifted: momentum takes over
  if (!M.touching) {
    M.y += M.vy * dt; M.x += M.vx * dt;
    const f = Math.exp(-FRICTION * dt); M.vy *= f; M.vx *= f;
  }
  // Past an end, the excess becomes stretch and the glide brakes hard.
  if (M.y < 0 || M.y > maxY) {
    const ex = M.y < 0 ? M.y : M.y - maxY;
    M.over += ex; M.y -= ex;
    if (!M.touching) M.vy *= Math.exp(-9 * dt);
  }
  M.x = Math.max(0, Math.min(maxX, M.x));
  if (!M.touching && M.over) {
    M.over *= Math.exp(-11 * dt);
    if (Math.abs(M.over) < .5) M.over = 0;
  }
  viewer.scrollTop = M.y; viewer.scrollLeft = M.x; M.wy = viewer.scrollTop;
  if (M.over) pagesEl.style.setProperty('--el', (-rubber(M.over, viewer.clientHeight * .5)).toFixed(2) + 'px');
  else pagesEl.style.removeProperty('--el');
  const moving = M.touching || Math.abs(M.vy) > 6 || Math.abs(M.vx) > 6 || M.over;
  if (moving) M.raf = requestAnimationFrame(mStep);
  else { M.raf = 0; M.vy = M.vx = 0; }
}
function wheelScroll(e) {
  if (!prefs.smoothScroll || reduceMotion) return;
  e.preventDefault(); cancelAnimationFrame(anim);
  const now = performance.now(), unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? viewer.clientHeight : 1;
  let dy = e.deltaY * unit, dx = e.deltaX * unit;
  if (e.shiftKey && !dx) { dx = dy; dy = 0; }
  const notch = e.deltaMode !== 0 || (e.wheelDelta && Math.abs(e.wheelDelta) % 120 === 0 && Math.abs(dy || dx) >= 40);
  mStart();
  M.lastInput = now;
  if (notch) {
    // Mouse wheel: add speed. One notch travels about 130px; quick spins accelerate.
    M.touching = false;
    M.streak = now - M.lastNotch < 170 ? Math.min(M.streak + 1, 12) : 0; M.lastNotch = now;
    const accel = 1 + M.streak * .3;
    if (dy && Math.sign(dy) !== Math.sign(M.vy)) M.vy = 0;
    if (dx && Math.sign(dx) !== Math.sign(M.vx)) M.vx = 0;
    M.vy = Math.max(-12000, Math.min(12000, M.vy + dy * 1.3 * FRICTION * accel));
    M.vx = Math.max(-12000, Math.min(12000, M.vx + dx * 1.3 * FRICTION * accel));
  } else {
    // Trackpad: follow the fingers 1:1 and measure their speed for the glide afterwards.
    if (!M.touching) { M.vy = M.vx = 0; M.samples = []; }
    M.touching = true;
    if (M.over && dy && Math.sign(dy) === -Math.sign(M.over)) {
      const left = M.over + dy;
      if (Math.sign(left) === Math.sign(M.over)) { M.over = left; dy = 0; } else { M.over = 0; dy = left; }
    }
    M.y += dy; M.x += dx;
    M.samples.push([now, dy, dx]);
    while (M.samples.length && now - M.samples[0][0] > 90) M.samples.shift();
    const span = Math.max(.016, (now - M.samples[0][0]) / 1000);
    M.vy = M.samples.reduce((s, q) => s + q[1], 0) / span;
    M.vx = M.samples.reduce((s, q) => s + q[2], 0) / span;
  }
}

let anim = null;
function animateScroll(top, left = viewer.scrollLeft) {
  cancelAnimationFrame(anim); glideStop();
  const maxT = viewer.scrollHeight - viewer.clientHeight; top = Math.max(0, Math.min(maxT, top));
  if (reduceMotion) { viewer.scrollTop = top; viewer.scrollLeft = left; return; }
  let from = viewer.scrollTop; const fromL = viewer.scrollLeft, ch = viewer.clientHeight;
  if (Math.abs(top - from) > ch * 2.5) { from = top - Math.sign(top - from) * ch * 1.4; viewer.scrollTop = from; }
  const dist = Math.abs(top - from), dur = Math.min(720, 320 + dist * .22), t0 = performance.now();
  const step = now => {
    // Spring-like ease: fast start, long gentle settle.
    const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 5);
    viewer.scrollTop = from + (top - from) * e; viewer.scrollLeft = fromL + (left - fromL) * e;
    if (t < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}
viewer.addEventListener('touchstart', () => { cancelAnimationFrame(anim); glideStop(); }, { passive: true });

function goToPage(n, smooth = true) {
  const p = state.pages[Math.max(1, Math.min(state.pages.length, n)) - 1]; if (!p) return;
  const top = p.top - 76;
  smooth ? animateScroll(top) : (viewer.scrollTop = top);
}

let lastST = 0, scrubT, scrollRaf;
viewer.addEventListener('scroll', () => {
  if (M.raf && !M.over && Math.abs(viewer.scrollTop - M.wy) > 3) { M.y = viewer.scrollTop; M.x = viewer.scrollLeft; M.vy = M.vx = 0; M.touching = false; } // moved by something else
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0;
    updateCurrent(); updateScrubber();
    const st = viewer.scrollTop, d = st - lastST;
    if (d > 8 && st > 160 && !dockHover) $('#dock').classList.add('compact');
    else if (d < -8) $('#dock').classList.remove('compact');
    lastST = st;
    const sc = $('#scrubber'); sc.classList.add('active'); clearTimeout(scrubT); scrubT = setTimeout(() => sc.classList.remove('active'), 1100);
    if (state.notePopFor) closeNote();
    $('#selPop').classList.remove('show');
  });
}, { passive: true });

function updateCurrent() {
  const ps = state.pages; if (!ps.length) return;
  const y = viewer.scrollTop + viewer.clientHeight * .4;
  let lo = 0, hi = ps.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ps[mid].top <= y) lo = mid; else hi = mid - 1; }
  const n = lo + 1;
  if (n !== state.current) {
    state.current = n;
    $$('.thumb.on').forEach(t => t.classList.remove('on'));
    const th = ps[n - 1].thumb; th.classList.add('on');
    if (app.classList.contains('side-open')) {
      const sc = $('#thumbs'), r = th.offsetTop - sc.clientHeight / 2 + th.offsetHeight / 2;
      sc.scrollTo({ top: r, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }
  if (document.activeElement !== $('#pageInput')) $('#pageInput').value = state.current;
}

/* Scrubber */
const scrub = $('#scrubber'), sThumb = $('#scrubThumb'), sBubble = $('#scrubBubble');
function updateScrubber() {
  const sh = viewer.scrollHeight, ch = viewer.clientHeight, th = scrub.clientHeight;
  const h = Math.max(44, th * ch / sh), max = th - h, t = sh > ch ? viewer.scrollTop / (sh - ch) * max : 0;
  sThumb.style.height = h + 'px'; sThumb.style.transform = `translateY(${t}px)`;
  sBubble.style.transform = ''; sBubble.style.top = Math.max(0, Math.min(th - 34, t + h / 2 - 17)) + 'px';
  sBubble.innerHTML = `${state.current}<span>of ${state.pages.length}</span>`;
  scrub.style.display = sh > ch + 4 ? '' : 'none';
}
scrub.addEventListener('pointerdown', e => {
  e.preventDefault(); scrub.setPointerCapture(e.pointerId); scrub.classList.add('drag'); cancelAnimationFrame(anim); glideStop();
  const r = scrub.getBoundingClientRect(), h = sThumb.offsetHeight;
  const onThumb = e.target === sThumb; const grab = onThumb ? e.clientY - sThumb.getBoundingClientRect().top : h / 2;
  const move = ev => {
    const max = r.height - h, t = Math.max(0, Math.min(max, ev.clientY - r.top - grab));
    viewer.scrollTop = t / max * (viewer.scrollHeight - viewer.clientHeight);
  };
  move(e);
  const up = () => { scrub.classList.remove('drag'); scrub.removeEventListener('pointermove', move); scrub.removeEventListener('pointerup', up); scrub.removeEventListener('pointercancel', up); };
  scrub.addEventListener('pointermove', move); scrub.addEventListener('pointerup', up); scrub.addEventListener('pointercancel', up);
});

/* =================== Layout & zoom =================== */
function renderKey() { return state.zoom.toFixed(4) + '|' + state.rotation; }
function isWide() { return innerWidth > 760; }
function layout(anchor) {
  const z = state.zoom * CSS_UNITS;
  for (const p of state.pages) {
    p.vp = p.page.getViewport({ scale: z, rotation: (p.page.rotate + state.rotation) % 360 });
    p.el.style.width = p.vp.width + 'px'; p.el.style.height = p.vp.height + 'px';
    p.el.style.setProperty('--scale-factor', z);
  }
  for (const p of state.pages) { p.top = p.el.offsetTop; p.h = p.el.offsetHeight; }
  if (anchor) restoreAnchor(anchor);
  for (const p of state.pages) { if ((state.annots[p.n] || []).length || p.anno.width) drawAnnots(p); renderNotes(p); }
  const zl = Math.round(state.zoom * 100) + '%'; $('#zoomLabel').textContent = zl; $('#mZoomVal').textContent = zl;
  $$('#fitChoice button').forEach(b => b.classList.toggle('on', b.dataset.fit === state.fit));
  updateScrubber(); updateCurrent();
  scheduleRender(90);
}
function getAnchor(cx = viewer.clientWidth / 2, cy = viewer.clientHeight / 2) {
  const ps = state.pages; if (!ps.length) return null;
  const y = viewer.scrollTop + cy, x = viewer.scrollLeft + cx;
  const p = ps.find(p => y < p.top + p.h + GAP / 2) || ps[ps.length - 1];
  return { i: p.n - 1, fy: (y - p.top) / p.h, fx: (x - p.el.offsetLeft) / p.el.offsetWidth, cx, cy };
}
function restoreAnchor(a) {
  const p = state.pages[a.i];
  viewer.scrollTop = p.top + a.fy * p.h - a.cy;
  viewer.scrollLeft = p.el.offsetLeft + a.fx * p.el.offsetWidth - a.cx;
}
function fitZoom(mode) {
  const p = state.pages[state.current - 1] || state.pages[0]; if (!p) return 1;
  const v = p.page.getViewport({ scale: CSS_UNITS, rotation: (p.page.rotate + state.rotation) % 360 });
  const padL = app.classList.contains('side-open') && isWide() ? 252 : 0;
  const aw = viewer.clientWidth - padL - (isWide() ? 72 : 28), ah = viewer.clientHeight - 170;
  const zw = aw / v.width, zh = ah / v.height;
  if (!(aw > 50) || !(ah > 50)) return mode === 'actual' ? 1 : Math.max(.25, Math.min(1, aw / v.width || 1));
  const z = mode === 'width' ? zw : mode === 'page' ? Math.min(zw, zh) : mode === 'actual' ? 1 : Math.min(zw, 1.3);
  return Math.max(.25, Math.min(6, z));
}
function setZoom(z, anchor, fit = null) {
  z = Math.max(.25, Math.min(6, z));
  if (Math.abs(z - state.zoom) < 1e-4 && fit === state.fit) return;
  const a = anchor || getAnchor();
  state.zoom = z; state.fit = fit;
  layout(a);
}
/* Zoom preview: gestures scale the page column with a GPU transform at once; the real
   layout and sharp re-render happen once, when the gesture settles. */
let zp = null, zpT = 0, zoomAnim = 0;
const clampZ = z => Math.max(.25, Math.min(6, z));
function zoomLabels(z) { const zl = Math.round(z * 100) + '%'; $('#zoomLabel').textContent = zl; $('#mZoomVal').textContent = zl; }
function previewZoom(z, cx = viewer.clientWidth / 2, cy = viewer.clientHeight / 2) {
  z = clampZ(z);
  if (!state.pages.length) return;
  if (!zp) {
    glideStop(); cancelAnimationFrame(anim);
    zp = { z0: state.zoom, z, fit: null, anchor: getAnchor(cx, cy) };
    pagesEl.style.transformOrigin = `${viewer.scrollLeft + cx}px ${viewer.scrollTop + cy}px`;
  }
  zp.z = z;
  pagesEl.style.setProperty('--zs', (z / zp.z0).toFixed(5));
  zoomLabels(z);
  clearTimeout(zpT); zpT = setTimeout(commitZoom, 150);
}
function commitZoom() {
  clearTimeout(zpT); if (!zp) return;
  const { z, anchor, fit } = zp; zp = null;
  pagesEl.style.removeProperty('--zs');
  setZoom(z, anchor, fit);
}
function animateZoom(target, fit = null) {
  target = clampZ(target);
  cancelAnimationFrame(zoomAnim);
  if (reduceMotion || !state.pages.length) { setZoom(target, null, fit); return; }
  const from = zp ? zp.z : state.zoom, t0 = performance.now(), dur = 340;
  const step = now => {
    const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 4);
    previewZoom(from + (target - from) * e);
    if (t < 1) zoomAnim = requestAnimationFrame(step);
    else { zp.fit = fit; commitZoom(); }
  };
  zoomAnim = requestAnimationFrame(step);
}
function applyFit(mode) { animateZoom(fitZoom(mode), mode); }
function zoomStep(dir) {
  const steps = [.25, .33, .5, .67, .75, .9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6];
  const z = zp ? zp.z : state.zoom;
  const next = dir > 0 ? steps.find(s => s > z + .01) : [...steps].reverse().find(s => s < z - .01);
  animateZoom(next ?? z);
}
let resizeT;
addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { app.classList.toggle('wide', isWide()); if (state.fit) setZoom(fitZoom(state.fit), null, state.fit); else layout(getAnchor()); }, 120); });

viewer.addEventListener('wheel', e => {
  if (!(e.ctrlKey || e.metaKey)) { wheelScroll(e); return; }
  e.preventDefault(); cancelAnimationFrame(zoomAnim);
  const r = viewer.getBoundingClientRect(), k = e.deltaMode ? .06 : .0032;
  previewZoom((zp ? zp.z : state.zoom) * Math.exp(-e.deltaY * k), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });
let pinch = null;
const tDist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
viewer.addEventListener('touchstart', e => { if (e.touches.length === 2) { pinch = { d: tDist(e.touches[0], e.touches[1]), z: zp ? zp.z : state.zoom }; e.preventDefault(); } }, { passive: false });
viewer.addEventListener('touchmove', e => {
  if (!pinch || e.touches.length !== 2) return; e.preventDefault();
  const [a, b] = e.touches, d = tDist(a, b), r = viewer.getBoundingClientRect();
  previewZoom(pinch.z * d / pinch.d, (a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top);
}, { passive: false });
viewer.addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null; });
let gz = 1;
viewer.addEventListener('gesturestart', e => { e.preventDefault(); gz = zp ? zp.z : state.zoom; });
viewer.addEventListener('gesturechange', e => { e.preventDefault(); const r = viewer.getBoundingClientRect(); previewZoom(gz * e.scale, e.clientX - r.left, e.clientY - r.top); });

/* =================== Rendering =================== */
let renderTimer, rendering = false;
const visible = new Set();
let io;
function scheduleRender(delay = 0) { clearTimeout(renderTimer); renderTimer = setTimeout(pump, delay); }
async function pump() {
  if (rendering) return; rendering = true;
  try {
    for (let guard = 0; guard < 200; guard++) {
      const key = renderKey();
      const c = [...visible].map(i => state.pages[i]).filter(p => p && p.key !== key)
        .sort((a, b) => Math.abs(a.n - state.current) - Math.abs(b.n - state.current));
      if (!c.length) break;
      await renderPage(c[0], key);
    }
  } finally { rendering = false; }
  freeFar();
}
async function renderPage(p, key) {
  const id = state.loadId, vp = p.vp;
  const dpr = Math.min(devicePixelRatio || 1, 2.5);
  let os = dpr; const max = 14e6;
  if (vp.width * vp.height * os * os > max) os = Math.sqrt(max / (vp.width * vp.height));
  const cv = document.createElement('canvas'); cv.className = 'pdf';
  cv.width = Math.floor(vp.width * os); cv.height = Math.floor(vp.height * os);
  try {
    await p.page.render({ canvasContext: cv.getContext('2d', { alpha: false }), viewport: vp, transform: os !== 1 ? [os, 0, 0, os, 0, 0] : null }).promise;
  } catch (e) { if (id === state.loadId) p.key = key; return; }
  if (id !== state.loadId) return;
  if (p.canvas) { cv.style.animation = 'none'; p.canvas.replaceWith(cv); } else p.el.prepend(cv);
  p.canvas = cv; p.el.classList.add('ready');
  p.key = key;
  try {
    const tc = await getText(p);
    if (id !== state.loadId || p.key !== key) return;
    const div = document.createElement('div'); div.className = 'textLayer';
    const textDivs = [], strs = [];
    await pdfjsLib.renderTextLayer({ textContentSource: tc, container: div, viewport: vp, textDivs, textContentItemsStr: strs }).promise;
    if (id !== state.loadId) return;
    if (p.textLayer) p.textLayer.replaceWith(div); else p.canvas.after(div);
    p.textLayer = div; p.textDivs = textDivs; p.strs = strs; p.hl = null;
    applyHighlights(p);
  } catch (e) { /* text layer is optional */ }
}
function freeFar() {
  const rendered = state.pages.filter(p => p.canvas);
  if (rendered.length <= 12) return;
  rendered.filter(p => !visible.has(p.n - 1)).sort((a, b) => Math.abs(b.n - state.current) - Math.abs(a.n - state.current))
    .slice(0, rendered.length - 12).forEach(p => {
      p.canvas.width = 0; p.canvas.remove(); p.canvas = null; p.key = null; p.el.classList.remove('ready');
      if (p.textLayer) { p.textLayer.remove(); p.textLayer = null; p.textDivs = null; }
    });
}
async function getText(p) { return p.text || (p.text = await p.page.getTextContent()); }

/* Thumbnails */
let tio, thumbBusy = false; const thumbQ = new Set();
async function thumbPump() {
  if (thumbBusy) return; thumbBusy = true;
  while (thumbQ.size) {
    const p = [...thumbQ][0]; thumbQ.delete(p);
    if (p.thumbKey === state.rotation) continue;
    const id = state.loadId, rot = (p.page.rotate + state.rotation) % 360;
    const v1 = p.page.getViewport({ scale: 1, rotation: rot }), s = 112 * Math.min(devicePixelRatio || 1, 2) / v1.width;
    const vp = p.page.getViewport({ scale: s, rotation: rot });
    const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    try { await p.page.render({ canvasContext: c.getContext('2d', { alpha: false }), viewport: vp }).promise; } catch { continue; }
    if (id !== state.loadId) break;
    const tf = p.thumb.firstChild; tf.replaceChildren(c); p.thumbKey = state.rotation;
  }
  thumbBusy = false;
}
function sizeThumbs() {
  for (const p of state.pages) {
    const v = p.page.getViewport({ scale: 1, rotation: (p.page.rotate + state.rotation) % 360 });
    p.thumb.firstChild.style.aspectRatio = v.width + ' / ' + v.height;
  }
}

/* =================== Loading =================== */
// A document is parsed once (loadDoc) and can then be shown any number of times (showDoc),
// which is what lets each tab keep its own PDF, zoom, scroll position and undo history.
async function loadDoc(data, name, seeds, meta = {}) {
  loader(true, 'Opening ' + (name || 'document') + '…');
  closePops();
  const original = data.slice(); // pdf.js takes ownership of `data`; the tools need the original bytes
  const task = pdfjsLib.getDocument({ data, isEvalSupported: false, useSystemFonts: true, cMapUrl: 'vendor/cmaps/', cMapPacked: true, standardFontDataUrl: 'vendor/standard_fonts/' });
  task.onPassword = (update, reason) => askPassword(update, reason, name, task);
  let pdf;
  try { pdf = await task.promise; }
  catch (e) {
    loader(false);
    if (e && e.name === 'PasswordException') return null;
    toast(e && e.name === 'InvalidPDFException' ? 'That file isn’t a valid PDF. Try another one.' : 'This PDF couldn’t be opened. Try another file.');
    return null;
  }
  hidePassword();
  let title = name;
  try { const md = await pdf.getMetadata(); if (md && md.info && md.info.Title && md.info.Title.trim()) title = md.info.Title.trim(); } catch {}
  loader(false);
  return { pdf, bytes: original, name: name || 'Document', title: title || name || 'Untitled', seeds, path: meta.path || null };
}
function captureView() {
  if (!state.pdf || !state.pages.length) return null;
  return { zoom: state.zoom, fit: state.fit, rotation: state.rotation, anchor: getAnchor(), undo: state.undo, redo: state.redo };
}
function clearDoc() {
  ++state.loadId;
  if (state.notePopFor) closeNote();
  io && io.disconnect(); tio && tio.disconnect(); visible.clear(); thumbQ.clear();
  pagesEl.replaceChildren(); $('#thumbs').replaceChildren(); $('#outline').replaceChildren();
  state.pdf = null; state.pages = []; state.bytes = null; state.doc = null;
}
async function showDoc(doc, view) {
  clearDoc();
  const id = state.loadId, pdf = doc.pdf;
  closePops();
  state.pdf = pdf; state.bytes = doc.bytes; state.name = doc.name; state.doc = doc;
  state.rotation = view ? view.rotation : 0;
  state.undo = view ? view.undo : []; state.redo = view ? view.redo : []; updateUndo();
  state.search.matches = []; state.search.idx = -1; $('#searchCount').textContent = '';
  state.fp = pdf.fingerprints[0];
  const saved = store.get('annots:' + state.fp, null);
  state.annots = saved || {};
  if (!saved && doc.seeds) for (const s of doc.seeds) (state.annots[s.page] ||= []).push(s.item);

  const pages = await Promise.all(Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1)));
  if (id !== state.loadId) return;
  const frag = document.createDocumentFragment(), tfrag = document.createDocumentFragment();
  pages.forEach((page, i) => {
    const el = document.createElement('div'); el.className = 'page'; el.dataset.i = i;
    el.innerHTML = `<div class="loading">${i + 1}</div><canvas class="anno" width="0" height="0"></canvas><div class="notes"></div>`;
    const th = document.createElement('button'); th.className = 'thumb'; th.type = 'button'; th.setAttribute('aria-label', 'Page ' + (i + 1));
    th.innerHTML = `<div class="tf"></div><div class="tn">${i + 1}</div>`;
    th.addEventListener('click', () => { goToPage(i + 1); if (!isWide()) toggleSidebar(false); });
    const p = { n: i + 1, page, el, thumb: th, anno: el.querySelector('.anno'), notes: el.querySelector('.notes'), key: null };
    state.pages.push(p); frag.append(el); tfrag.append(th);
  });
  pagesEl.append(frag); $('#thumbs').append(tfrag);
  sizeThumbs();
  state.current = 0;
  if (view) { state.fit = view.fit; state.zoom = view.fit ? fitZoom(view.fit) : view.zoom; }
  else { state.fit = 'auto'; state.zoom = fitZoom('auto'); }
  layout(null);
  if (view && view.anchor) restoreAnchor(view.anchor); else { viewer.scrollTop = 0; viewer.scrollLeft = 0; }
  updateCurrent();
  $('#pageTotal').textContent = pdf.numPages;
  io = new IntersectionObserver(es => { for (const e of es) { const i = +e.target.dataset.i; e.isIntersecting ? visible.add(i) : visible.delete(i); } scheduleRender(); }, { root: viewer, rootMargin: '120% 40%' });
  state.pages.forEach(p => io.observe(p.el));
  tio = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) thumbQ.add(state.pages[+e.target.dataset.i]); thumbPump(); }, { root: $('#thumbs'), rootMargin: '200px' });
  state.pages.forEach((p, i) => { p.thumb.dataset.i = i; tio.observe(p.thumb); });
  $('#docTitle').textContent = doc.title;
  buildOutline(pdf, id);
  if (state.search.q) runSearch(state.search.q);
}
// Opening a PDF goes through the tabs (a new tab, or the Home tab it was opened from).
async function openPdf(data, name, seeds, meta) {
  if (window.GR && GR.tabs) return GR.tabs.open(data, name, seeds, meta);
  const doc = await loadDoc(data, name, seeds, meta); if (doc) await showDoc(doc);
}

function openFile(file) {
  if (!file) return;
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) { toast('Only PDF files can be opened here.'); return; }
  const path = window.desktop ? window.desktop.pathFor(file) : null;
  const r = new FileReader();
  r.onload = () => openPdf(new Uint8Array(r.result), file.name.replace(/\.pdf$/i, ''), null, { path });
  r.onerror = () => toast('The file couldn’t be read. Try again.');
  r.readAsArrayBuffer(file);
}
function openSample() { const s = buildSample(); openPdf(s.bytes, 'The Glass Handbook', s.seeds); }

/* Password */
let pwUpdate = null, pwTask = null;
function askPassword(update, reason, name, task) {
  pwUpdate = update; pwTask = task; loader(false);
  $('#pwName').textContent = (name ? `“${name}” is protected.` : 'This document is protected.') + ' Enter its password to open it.';
  $('#pwErr').textContent = reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD ? 'That password didn’t work. Try again.' : '';
  $('#pwInput').value = ''; $('#pwDialog').classList.add('show'); setTimeout(() => $('#pwInput').focus(), 60);
}
function hidePassword() { $('#pwDialog').classList.remove('show'); pwUpdate = null; }
$('#pwForm').addEventListener('submit', e => { e.preventDefault(); if (pwUpdate) { loader(true, 'Unlocking…'); pwUpdate($('#pwInput').value); } });
$('#pwCancel').addEventListener('click', () => { if (pwTask) pwTask.destroy(); hidePassword(); });

/* Outline */
async function buildOutline(pdf, id) {
  const box = $('#outline'); box.replaceChildren();
  let ol = null; try { ol = await pdf.getOutline(); } catch {}
  if (id !== state.loadId) return;
  if (!ol || !ol.length) { box.innerHTML = '<div class="empty">This document has no outline.<br>Use page thumbnails to move around.</div>'; return; }
  const build = items => {
    const ul = document.createElement('ul');
    for (const it of items) {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.textContent = it.title || 'Untitled';
      if (it.bold) b.style.fontWeight = '600';
      b.addEventListener('click', async () => {
        let d = it.dest; try { if (typeof d === 'string') d = await pdf.getDestination(d); } catch {}
        if (!Array.isArray(d)) { if (it.url) toast('That entry links to a website.'); return; }
        let n = null; try { n = typeof d[0] === 'object' ? await pdf.getPageIndex(d[0]) + 1 : d[0] + 1; } catch {}
        if (n) { goToPage(n); if (!isWide()) toggleSidebar(false); }
      });
      li.append(b); if (it.items && it.items.length) li.append(build(it.items)); ul.append(li);
    }
    return ul;
  };
  box.append(build(ol));
}

/* =================== Annotations =================== */
const list = n => (state.annots[n] ||= []);
let saveT;
function save() { clearTimeout(saveT); saveT = setTimeout(() => store.set('annots:' + state.fp, state.annots), 300); }
function drawAnnots(p) {
  const c = p.anno, vp = p.vp, items = state.annots[p.n] || [];
  if (!items.length && !p.live) { if (c.width) { c.width = 0; c.height = 0; } return; }
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = Math.round(vp.width * dpr), H = Math.round(vp.height * dpr);
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, vp.width, vp.height);
  const all = p.live ? items.concat([p.live]) : items;
  for (const a of all) {
    if (a.type === 'rect') {
      const [x1, y1] = vp.convertToViewportPoint(a.r[0], a.r[1]), [x2, y2] = vp.convertToViewportPoint(a.r[2], a.r[3]);
      ctx.globalAlpha = .4; ctx.fillStyle = a.color;
      const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1), r = Math.max(0, Math.min(3 * vp.scale / CSS_UNITS, h / 3, w / 2));
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); ctx.fill();
    } else if (a.type === 'ink') {
      const pts = a.pts.map(q => vp.convertToViewportPoint(q[0], q[1]));
      ctx.globalAlpha = 1; ctx.strokeStyle = a.color; ctx.lineWidth = a.w * vp.scale; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      if (pts.length === 1) ctx.lineTo(pts[0][0] + .01, pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); }
      if (pts.length > 1) ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      ctx.stroke();
    } else if (a.type === 'text' && a.text) {
      const [x, y] = vp.convertToViewportPoint(a.at[0], a.at[1]), fs = a.size * vp.scale;
      ctx.globalAlpha = 1; ctx.fillStyle = a.color; ctx.textBaseline = 'alphabetic';
      ctx.font = `${fs}px Arial, Helvetica, sans-serif`;
      a.text.split('\n').forEach((line, i) => ctx.fillText(line, x, y + i * fs * 1.25));
    }
  }
  ctx.globalAlpha = 1;
}
// Bounding box of a text item in PDF units (used for hit-testing).
function textBox(a) {
  const lines = a.text.split('\n'), w = Math.max(...lines.map(l => l.length)) * a.size * .55;
  return [a.at[0], a.at[1] - (lines.length - 1) * a.size * 1.25 - a.size * .25, a.at[0] + w, a.at[1] + a.size * .9];
}
function renderNotes(p) {
  const items = (state.annots[p.n] || []).filter(a => a.type === 'note');
  if (!items.length && !p.notes.childElementCount) return;
  p.notes.replaceChildren();
  for (const a of items) {
    const [x, y] = p.vp.convertToViewportPoint(a.at[0], a.at[1]);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'note-pin'; b.style.left = x + 'px'; b.style.top = y + 'px'; b.style.setProperty('--c', a.color);
    b.title = a.text || 'Empty note'; b.setAttribute('aria-label', 'Note: ' + (a.text || 'empty'));
    b.innerHTML = '<svg class="i"><use href="#i-note"/></svg>';
    b.addEventListener('click', e => { e.stopPropagation(); if (state.tool === 'eraser') { removeItems([{ page: p.n, item: a }]); return; } openNote(p, a, b); });
    b.addEventListener('pointerdown', e => e.stopPropagation());
    p.notes.append(b);
  }
}
function redraw(n) { const p = state.pages[n - 1]; if (p) { drawAnnots(p); renderNotes(p); } }
function commit(op) { state.undo.push(op); if (state.undo.length > 200) state.undo.shift(); state.redo = []; save(); updateUndo(); }
function addItems(items) { for (const { page, item } of items) list(page).push(item); items.forEach(i => redraw(i.page)); commit({ kind: 'add', items }); }
function removeItems(items) {
  for (const { page, item } of items) { const l = list(page), i = l.indexOf(item); if (i >= 0) l.splice(i, 1); }
  new Set(items.map(i => i.page)).forEach(redraw); commit({ kind: 'remove', items });
}
function applyOp(op, inverse) {
  const add = (op.kind === 'add') !== inverse;
  for (const { page, item } of op.items) { const l = list(page); if (add) l.push(item); else { const i = l.indexOf(item); if (i >= 0) l.splice(i, 1); } }
  new Set(op.items.map(i => i.page)).forEach(redraw); save(); updateUndo();
}
function undo() { const op = state.undo.pop(); if (!op) return; applyOp(op, true); state.redo.push(op); updateUndo(); closeNote(); }
function redo() { const op = state.redo.pop(); if (!op) return; applyOp(op, false); state.undo.push(op); updateUndo(); }
function updateUndo() { $('#btnUndo').disabled = !state.undo.length; $('#btnRedo').disabled = !state.redo.length; }

/* Highlight from text selection */
function selectionRects() {
  const sel = getSelection(); if (!sel.rangeCount || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const root = range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer;
  if (!root.closest || !(root.closest('.textLayer') || root.closest('#pages'))) return null;
  const rects = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = root.nodeType === 3 ? [root] : [];
  if (range.commonAncestorContainer.nodeType === 3) nodes.push(range.commonAncestorContainer);
  else while (walk.nextNode()) if (range.intersectsNode(walk.currentNode)) nodes.push(walk.currentNode);
  for (const n of nodes) {
    if (!n.parentNode.closest || !n.parentNode.closest('.textLayer')) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    if (n === range.startContainer) r.setStart(n, range.startOffset);
    if (n === range.endContainer) r.setEnd(n, range.endOffset);
    for (const cr of r.getClientRects()) if (cr.width > .5 && cr.height > .5) rects.push({ l: cr.left, t: cr.top, r: cr.right, b: cr.bottom });
  }
  // merge rects on the same line
  rects.sort((a, b) => a.t - b.t || a.l - b.l);
  const out = [];
  for (const r of rects) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.t - r.t) < 3 && Math.abs(last.b - r.b) < 3 && r.l <= last.r + 4) { last.r = Math.max(last.r, r.r); last.t = Math.min(last.t, r.t); last.b = Math.max(last.b, r.b); }
    else out.push({ ...r });
  }
  return out.length ? out : null;
}
function highlightSelection(color) {
  const rects = selectionRects(); if (!rects) return false;
  const items = [];
  for (const r of rects) {
    const cx = (r.l + r.r) / 2, cy = (r.t + r.b) / 2;
    const p = state.pages.find(p => { const b = p.el.getBoundingClientRect(); return cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom; });
    if (!p) continue; const b = p.el.getBoundingClientRect();
    const a = p.vp.convertToPdfPoint(r.l - b.left, r.t - b.top), c = p.vp.convertToPdfPoint(r.r - b.left, r.b - b.top);
    items.push({ page: p.n, item: { type: 'rect', color, r: [a[0], a[1], c[0], c[1]] } });
  }
  if (!items.length) return false;
  addItems(items); getSelection().removeAllRanges(); $('#selPop').classList.remove('show');
  return true;
}

/* Pointer drawing on pages */
let drag = null;
function local(e, p) { const b = p.el.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
pagesEl.addEventListener('pointerdown', e => {
  const el = e.target.closest('.page'); if (!el || e.button !== 0) return;
  const p = state.pages[+el.dataset.i], tool = state.tool;
  if (tool === 'select' || tool === 'hand') return;
  if (tool === 'highlight' && e.target.tagName === 'SPAN' && e.pointerType !== 'touch') return; // native text selection
  e.preventDefault();
  const pt = local(e, p), pdfPt = p.vp.convertToPdfPoint(...pt);
  if (tool === 'note') {
    e.noteOpened = true;
    if (state.notePopFor) closeNote();
    const item = { type: 'note', color: state.color === '#1C1C1E' ? '#FFD60A' : state.color, at: pdfPt, text: '' };
    addItems([{ page: p.n, item }]);
    const pin = [...p.notes.children].pop(); openNote(p, item, pin, true);
    return;
  }
  if (tool === 'text') {
    e.noteOpened = true;
    if (state.notePopFor) closeNote();
    const at = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY + 8 }) };
    const hit = list(p.n).slice().reverse().find(a => { if (a.type !== 'text') return false; const [x1, y1, x2, y2] = textBox(a); return pdfPt[0] >= x1 && pdfPt[0] <= x2 && pdfPt[1] >= y1 && pdfPt[1] <= y2; });
    if (hit) { openNote(p, hit, at, false); return; }
    const size = [11, 16, 24][state.width];
    const item = { type: 'text', color: state.color, at: [pdfPt[0], pdfPt[1] - size * .35], size, text: '' };
    addItems([{ page: p.n, item }]);
    openNote(p, item, at, true);
    return;
  }
  el.setPointerCapture(e.pointerId);
  drag = { p, tool, start: pt, pts: [pdfPt], removed: [] };
  if (tool === 'pen') { p.live = { type: 'ink', color: state.color, w: WIDTHS[state.width], pts: drag.pts }; drawAnnots(p); }
  if (tool === 'eraser') eraseAt(p, pdfPt);
});
pagesEl.addEventListener('pointermove', e => {
  if (!drag) return;
  const p = drag.p, pt = local(e, p), pdfPt = p.vp.convertToPdfPoint(...pt);
  if (drag.tool === 'pen') {
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs) drag.pts.push(p.vp.convertToPdfPoint(...local(ev, p)));
    drawAnnots(p);
  } else if (drag.tool === 'highlight') {
    const a = p.vp.convertToPdfPoint(...drag.start);
    p.live = { type: 'rect', color: state.color, r: [a[0], a[1], pdfPt[0], pdfPt[1]] }; drawAnnots(p);
  } else if (drag.tool === 'eraser') eraseAt(p, pdfPt);
});
function endDrag() {
  if (!drag) return; const d = drag, p = d.p; drag = null;
  if (d.tool === 'pen' && p.live) { const item = p.live; p.live = null; addItems([{ page: p.n, item }]); }
  else if (d.tool === 'highlight' && p.live) {
    const item = p.live; p.live = null;
    const [x1, y1] = p.vp.convertToViewportPoint(item.r[0], item.r[1]), [x2, y2] = p.vp.convertToViewportPoint(item.r[2], item.r[3]);
    if (Math.abs(x2 - x1) > 4 && Math.abs(y2 - y1) > 4) addItems([{ page: p.n, item }]); else drawAnnots(p);
  } else if (d.tool === 'eraser' && d.removed.length) { state.undo.push({ kind: 'remove', items: d.removed }); state.redo = []; save(); updateUndo(); }
}
pagesEl.addEventListener('pointerup', endDrag);
pagesEl.addEventListener('pointercancel', endDrag);
function eraseAt(p, [x, y]) {
  const tol = 9 / p.vp.scale, l = list(p.n); let hit = false;
  for (let i = l.length - 1; i >= 0; i--) {
    const a = l[i]; let h = false;
    if (a.type === 'rect' || a.type === 'text') {
      const [x1, y1, x2, y2] = a.type === 'rect' ? a.r : textBox(a);
      h = x >= Math.min(x1, x2) - tol && x <= Math.max(x1, x2) + tol && y >= Math.min(y1, y2) - tol && y <= Math.max(y1, y2) + tol;
    }
    else if (a.type === 'ink') {
      const t = tol + a.w / 2;
      for (let j = 0; j < a.pts.length && !h; j++) {
        const q = a.pts[j], r = a.pts[j + 1] || q;
        const dx = r[0] - q[0], dy = r[1] - q[1], L = dx * dx + dy * dy;
        const u = L ? Math.max(0, Math.min(1, ((x - q[0]) * dx + (y - q[1]) * dy) / L)) : 0;
        h = Math.hypot(x - (q[0] + u * dx), y - (q[1] + u * dy)) < t;
      }
    }
    if (h) { drag && drag.removed.push({ page: p.n, item: a }); l.splice(i, 1); hit = true; }
  }
  if (hit) { drawAnnots(p); renderNotes(p); }
}

/* Selection popover */
function buildSwatches(box, onPick, current) {
  box.replaceChildren();
  for (const c of COLORS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sw' + (c === current ? ' on' : ''); b.style.setProperty('--c', c);
    b.setAttribute('aria-label', 'Color ' + c); b.innerHTML = '<i></i>';
    b.addEventListener('click', () => onPick(c)); box.append(b);
  }
}
function showSelPop() {
  const rects = selectionRects(); const pop = $('#selPop');
  if (!rects) { pop.classList.remove('show'); return; }
  buildSwatches(pop, c => highlightSelection(c), null);
  const sep = document.createElement('span'); sep.className = 'sep';
  const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'txtbtn'; copy.innerHTML = '<svg class="i"><use href="#i-copy"/></svg>Copy';
  copy.addEventListener('click', () => {
    const t = getSelection().toString();
    const done = () => { toast('Copied'); pop.classList.remove('show'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => { document.execCommand && document.execCommand('copy') ? done() : toast('Press Ctrl/Cmd + C to copy'); });
    else toast('Press Ctrl/Cmd + C to copy');
  });
  pop.append(sep, copy);
  const top = Math.min(...rects.map(r => r.t)), l = Math.min(...rects.map(r => r.l)), r = Math.max(...rects.map(r => r.r));
  const ar = app.getBoundingClientRect();
  pop.style.visibility = 'hidden'; pop.classList.add('show'); const w = pop.offsetWidth; pop.classList.remove('show'); pop.style.visibility = '';
  const x = Math.max(12, Math.min(ar.width - w - 12, (l + r) / 2 - w / 2 - ar.left));
  const y = top - ar.top - 58;
  pop.style.left = x + 'px'; pop.style.top = (y < 70 ? Math.max(...rects.map(r => r.b)) - ar.top + 12 : y) + 'px';
  requestAnimationFrame(() => pop.classList.add('show'));
}
document.addEventListener('pointerup', e => {
  if (e.target.closest('.pop')) return;
  setTimeout(() => {
    if (state.tool === 'highlight') { if (selectionRects()) highlightSelection(state.color); }
    else if (state.tool === 'select') showSelPop();
  }, 0);
});
document.addEventListener('selectionchange', () => { const s = getSelection(); if (!s || s.isCollapsed) $('#selPop').classList.remove('show'); });

/* Notes popover */
function openNote(p, item, pin, fresh) {
  closePops($('#notePop'));
  state.notePopFor = { p, item, fresh };
  const pop = $('#notePop'), ta = $('#noteText');
  ta.value = item.text || '';
  ta.placeholder = item.type === 'text' ? 'Type the text to place on the page…' : 'Write a note…';
  $('#noteMeta').textContent = (item.type === 'text' ? 'Text · page ' : 'Note · page ') + p.n;
  const r = pin.getBoundingClientRect(), ar = app.getBoundingClientRect();
  const x = Math.max(12, Math.min(ar.width - 272, r.left - ar.left - 10));
  let y = r.bottom - ar.top + 10; if (y + 180 > ar.height) y = r.top - ar.top - 190;
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
  pop.classList.add('show'); setTimeout(() => ta.focus({ preventScroll: true }), 40);
}
function closeNote() {
  const f = state.notePopFor; $('#notePop').classList.remove('show'); state.notePopFor = null;
  if (!f) return;
  const t = $('#noteText').value.trim();
  if (f.fresh && !t) { const l = list(f.p.n), i = l.indexOf(f.item); if (i >= 0) l.splice(i, 1); state.undo.pop(); updateUndo(); }
  else f.item.text = t;
  redraw(f.p.n); save();
}
$('#noteText').addEventListener('input', e => { const f = state.notePopFor; if (f) { f.item.text = e.target.value; if (f.item.type === 'text') drawAnnots(f.p); save(); } });
$('#noteDone').addEventListener('click', closeNote);
$('#noteDel').addEventListener('click', () => { const f = state.notePopFor; if (!f) return; state.notePopFor = null; $('#notePop').classList.remove('show'); removeItems([{ page: f.p.n, item: f.item }]); toast(f.item.type === 'text' ? 'Text deleted' : 'Note deleted'); });

/* =================== Search =================== */
let searchT;
function openSearch() {
  closePops($('#searchPanel'));
  const sp = $('#searchPanel'); sp.classList.add('show'); $('#btnSearch').classList.add('on');
  const sel = getSelection().toString().trim();
  const inp = $('#searchInput'); if (sel && sel.length < 60 && !sel.includes('\n')) { inp.value = sel; runSearch(sel); }
  setTimeout(() => { inp.focus(); inp.select(); }, 30);
}
function closeSearch() {
  $('#searchPanel').classList.remove('show'); $('#btnSearch').classList.remove('on');
  state.search = { q: '', matches: [], idx: -1, token: state.search.token + 1 };
  state.pages.forEach(applyHighlights); $('#searchCount').textContent = '';
}
async function runSearch(q) {
  const token = ++state.search.token; q = q.trim();
  state.search.q = q; state.search.matches = []; state.search.idx = -1;
  if (!q) { state.pages.forEach(applyHighlights); $('#searchCount').textContent = ''; return; }
  $('#searchCount').textContent = '…';
  const needle = q.toLowerCase(), matches = [];
  for (const p of state.pages) {
    const tc = await getText(p); if (token !== state.search.token) return;
    const strs = tc.items.filter(it => it.str !== undefined).map(it => it.str);
    p.searchStrs = strs;
    const hay = strs.join('').toLowerCase(); let i = hay.indexOf(needle);
    while (i !== -1) { matches.push({ page: p.n, s: i, e: i + needle.length }); i = hay.indexOf(needle, i + needle.length); }
  }
  state.search.matches = matches;
  if (!matches.length) { $('#searchCount').textContent = 'No results'; state.pages.forEach(applyHighlights); return; }
  const first = matches.findIndex(m => m.page >= state.current);
  gotoMatch(first < 0 ? 0 : first);
}
function gotoMatch(i) {
  const m = state.search.matches; if (!m.length) return;
  i = (i + m.length) % m.length; state.search.idx = i;
  $('#searchCount').textContent = `${i + 1} of ${m.length}`;
  state.pages.forEach(applyHighlights);
  const p = state.pages[m[i].page - 1];
  const sel = p.el.querySelector('.highlight.selected');
  if (sel) scrollToEl(sel);
  else {
    goToPage(p.n);
    const key = renderKey();
    const wait = () => { if (state.search.idx !== i) return; const s = p.el.querySelector('.highlight.selected'); if (s) scrollToEl(s); else if (p.key !== key || !p.textLayer) setTimeout(wait, 80); };
    setTimeout(wait, 120);
  }
}
function scrollToEl(el) {
  const r = el.getBoundingClientRect(), v = viewer.getBoundingClientRect();
  const top = viewer.scrollTop + r.top - v.top - v.height * .35;
  let left = viewer.scrollLeft;
  if (r.left < v.left + 20 || r.right > v.right - 20) left = viewer.scrollLeft + r.left - v.left - v.width / 2;
  animateScroll(top, Math.max(0, left));
}
function applyHighlights(p) {
  if (!p.textDivs) return;
  if (p.hl) for (const i of p.hl) p.textDivs[i].textContent = p.strs[i];
  p.hl = null;
  const ms = state.search.matches.filter(m => m.page === p.n); if (!ms.length) return;
  const starts = []; let acc = 0; for (const s of p.strs) { starts.push(acc); acc += s.length; }
  const per = new Map();
  for (const m of ms) {
    const on = state.search.matches[state.search.idx] === m;
    for (let i = 0; i < p.strs.length; i++) {
      const a = starts[i], b = a + p.strs[i].length; if (b <= m.s) continue; if (a >= m.e) break;
      if (!per.has(i)) per.set(i, []); per.get(i).push([Math.max(m.s, a) - a, Math.min(m.e, b) - a, on]);
    }
  }
  p.hl = [...per.keys()];
  for (const [i, ranges] of per) {
    const div = p.textDivs[i], s = p.strs[i]; if (!div) continue;
    div.textContent = ''; let pos = 0;
    for (const [a, b, on] of ranges) {
      if (a > pos) div.append(s.slice(pos, a));
      const sp = document.createElement('span'); sp.className = 'highlight' + (on ? ' selected' : ''); sp.textContent = s.slice(a, b); div.append(sp); pos = b;
    }
    if (pos < s.length) div.append(s.slice(pos));
  }
}
$('#searchInput').addEventListener('input', e => { clearTimeout(searchT); const v = e.target.value; searchT = setTimeout(() => runSearch(v), 220); });
$('#searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); if (state.search.q !== e.target.value.trim()) { clearTimeout(searchT); runSearch(e.target.value); } else gotoMatch(state.search.idx + (e.shiftKey ? -1 : 1)); }
  if (e.key === 'Escape') { e.preventDefault(); closeSearch(); viewer.focus({ preventScroll: true }); }
});
$('#searchNext').addEventListener('click', () => gotoMatch(state.search.idx + 1));
$('#searchPrev').addEventListener('click', () => gotoMatch(state.search.idx - 1));
$('#searchClose').addEventListener('click', closeSearch);
$('#btnSearch').addEventListener('click', () => $('#searchPanel').classList.contains('show') ? closeSearch() : openSearch());

/* =================== Tools & dock =================== */
let dockHover = false;
const dock = $('#dock'), dockInd = $('#dockInd');
dock.addEventListener('pointerenter', () => { dockHover = true; dock.classList.remove('compact'); });
dock.addEventListener('pointerleave', () => { dockHover = false; });
// The selection pill is a liquid drop: it stretches along its path and settles with a spring.
let indX = null;
function moveInd(animate = true) {
  const b = dock.querySelector('.tool.on'); if (!b) return;
  const x = b.offsetLeft, w = b.offsetWidth;
  dockInd.style.width = w + 'px';
  if (indX == null || !animate || reduceMotion || Math.abs(x - indX) < 1) { dockInd.style.transform = `translateX(${x}px)`; indX = x; return; }
  const dx = x - indX, s = Math.min(1.7, 1 + Math.abs(dx) / 130);
  dockInd.animate([
    { transform: `translateX(${indX}px) scale(1,1)` },
    { transform: `translateX(${indX + dx * .5}px) scale(${s},${(1 / Math.sqrt(s)).toFixed(3)})`, offset: .38 },
    { transform: `translateX(${x + dx * .04}px) scale(.94,1.05)`, offset: .72 },
    { transform: `translateX(${x}px) scale(1,1)` }
  ], { duration: 560, easing: 'cubic-bezier(.25,.9,.3,1)' });
  dockInd.style.transform = `translateX(${x}px)`; indX = x;
}
new ResizeObserver(() => moveInd(false)).observe(dock);
function setTool(t) {
  state.tool = t;
  app.className = app.className.replace(/\bt-\w+/g, '').trim() + ' t-' + t;
  $$('#dock .tool').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  moveInd(); closePops(); if (state.notePopFor) closeNote();
  if (t !== 'select' && t !== 'highlight') getSelection().removeAllRanges();
}
$$('#dock .tool').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
function setColor(c) {
  state.color = c; store.set('color', c);
  app.style.setProperty('--tool-color', c);
  renderColorPop();
}
function renderColorPop() {
  const pop = $('#colorPop');
  buildSwatches(pop, c => { setColor(c); }, state.color);
  const sep = document.createElement('span'); sep.className = 'sep'; pop.append(sep);
  WIDTHS.forEach((w, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'wd' + (i === state.width ? ' on' : '');
    b.setAttribute('aria-label', ['Thin', 'Medium', 'Thick'][i] + ' stroke'); const s = 4 + i * 4;
    b.innerHTML = `<i style="width:${s}px;height:${s}px"></i>`;
    b.addEventListener('click', () => { state.width = i; store.set('width', i); renderColorPop(); });
    pop.append(b);
  });
}
$('#btnColor').addEventListener('click', () => {
  const pop = $('#colorPop'); if (pop.classList.contains('show')) { pop.classList.remove('show'); return; }
  closePops(pop);
  const r = $('#btnColor').getBoundingClientRect(), ar = app.getBoundingClientRect();
  pop.style.visibility = 'hidden'; pop.classList.add('show'); const w = pop.offsetWidth; pop.classList.remove('show'); pop.style.visibility = '';
  pop.style.left = Math.max(12, Math.min(ar.width - w - 12, r.left + r.width / 2 - w / 2 - ar.left)) + 'px';
  pop.style.top = (r.top - ar.top - 62) + 'px';
  requestAnimationFrame(() => pop.classList.add('show'));
});
$('#btnUndo').addEventListener('click', undo);
$('#btnRedo').addEventListener('click', redo);

/* Pan tool */
let pan = null;
viewer.addEventListener('pointerdown', e => {
  if (state.tool !== 'hand' || e.button !== 0 || e.pointerType === 'touch' || e.target.closest('.note-pin')) return;
  cancelAnimationFrame(anim);
  pan = { x: e.clientX, y: e.clientY, sl: viewer.scrollLeft, st: viewer.scrollTop }; viewer.setPointerCapture(e.pointerId); app.classList.add('panning'); e.preventDefault();
});
viewer.addEventListener('pointermove', e => { if (!pan) return; viewer.scrollLeft = pan.sl - (e.clientX - pan.x); viewer.scrollTop = pan.st - (e.clientY - pan.y); });
const endPan = () => { pan = null; app.classList.remove('panning'); };
viewer.addEventListener('pointerup', endPan); viewer.addEventListener('pointercancel', endPan);

/* =================== Top bar & view menu =================== */
function toggleSidebar(force) {
  const on = force ?? !app.classList.contains('side-open');
  const first = state.pages[0], before = first ? first.el.offsetLeft - viewer.scrollLeft : 0;
  app.classList.toggle('side-open', on); $('#btnSidebar').classList.toggle('on', on); $('#btnSidebar').setAttribute('aria-pressed', on);
  store.set('sidebar', on);
  if (!isWide() || !first) return;
  // FLIP: the padding changes once; a transform eases the pages from where they were.
  const shift = first.el.offsetLeft - viewer.scrollLeft - before;
  if (shift && !reduceMotion) {
    pagesEl.classList.remove('tx-anim');
    pagesEl.style.setProperty('--tx', -shift + 'px');
    void pagesEl.offsetWidth;
    pagesEl.classList.add('tx-anim');
    pagesEl.style.setProperty('--tx', '0px');
    setTimeout(() => pagesEl.classList.remove('tx-anim'), 600);
  }
  if (state.fit) animateZoom(fitZoom(state.fit), state.fit);
}
$('#btnSidebar').addEventListener('click', () => toggleSidebar());
$('#sideSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; const t = +b.dataset.tab;
  $('#sideSeg').dataset.on = t; $$('#sideSeg button').forEach(x => x.classList.toggle('on', x === b));
  $('#thumbs').hidden = t !== 0; $('#outline').hidden = t !== 1;
});
$('#btnZoomIn').addEventListener('click', () => zoomStep(1));
$('#btnZoomOut').addEventListener('click', () => zoomStep(-1));
$('#mZoomIn').addEventListener('click', () => zoomStep(1));
$('#mZoomOut').addEventListener('click', () => zoomStep(-1));
$('#zoomLabel').addEventListener('click', () => state.fit === 'width' ? applyFit('actual') : applyFit('width'));
$('#fitChoice').addEventListener('click', e => { const b = e.target.closest('button'); if (b) applyFit(b.dataset.fit); });
$('#btnView').addEventListener('click', () => { const m = $('#viewMenu'); const on = !m.classList.contains('show'); closePops(m); m.classList.toggle('show', on); $('#btnView').classList.toggle('on', on); });
const chooseFile = () => window.desktop ? window.desktop.openDialog() : $('#fileInput').click();
$('#btnOpen').addEventListener('click', chooseFile);
$('#fileInput').addEventListener('change', e => { openFile(e.target.files[0]); e.target.value = ''; });
$('#mSample').addEventListener('click', () => { closePops(); openSample(); });
function fullscreen() {
  if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
  const el = document.documentElement;
  if (!el.requestFullscreen) { toast('Full screen isn’t available here. Try focus mode (F).'); return; }
  el.requestFullscreen().catch(() => toast('Full screen isn’t available here. Try focus mode (F).'));
}
$('#btnFull').addEventListener('click', fullscreen);
function focusMode(on) { on = on ?? !app.classList.contains('focus'); app.classList.toggle('focus', on); closePops(); if (on) toast('Focus mode. Press Esc or F to show controls.'); }
$('#mFocus').addEventListener('click', () => focusMode(true));
$('#focusExit').addEventListener('click', () => focusMode(false));
function rotate(d) {
  const a = getAnchor();
  state.rotation = (state.rotation + d + 360) % 360;
  state.pages.forEach(p => { if (p.canvas) p.canvas.style.opacity = 0; });
  sizeThumbs(); state.pages.forEach(p => p.thumbKey = null);
  if (state.fit) state.zoom = fitZoom(state.fit);
  layout(a); scheduleRender(0);
  $$('.thumb').forEach((t, i) => { if (t.getBoundingClientRect().height) thumbQ.add(state.pages[i]); }); thumbPump();
}
$('#mRotL').addEventListener('click', () => rotate(-90));
$('#mRotR').addEventListener('click', () => rotate(90));
const tintChoice = $('#tintChoice');
function setTint(t) { pagesEl.classList.remove('tint-sepia', 'tint-night'); if (t !== 'white') pagesEl.classList.add('tint-' + t); $$('button', tintChoice).forEach(b => b.classList.toggle('on', b.dataset.tint === t)); store.set('tint', t); }
tintChoice.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTint(b.dataset.tint); });
const hostTheme = document.documentElement.getAttribute('data-theme');
function setTheme(t) {
  const root = document.documentElement;
  if (t === 'auto') { hostTheme ? root.setAttribute('data-theme', hostTheme) : root.removeAttribute('data-theme'); }
  else root.setAttribute('data-theme', t);
  $$('#themeChoice button').forEach(b => b.classList.toggle('on', b.dataset.themeSet === t)); store.set('theme', t);
  if (window.desktop) window.desktop.setTheme(t);
}
$('#themeChoice').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTheme(b.dataset.themeSet); });
const pageInput = $('#pageInput');
pageInput.addEventListener('keydown', e => { if (e.key === 'Enter') { const n = parseInt(pageInput.value, 10); if (n) goToPage(n); pageInput.blur(); } if (e.key === 'Escape') { pageInput.value = state.current; pageInput.blur(); } });
pageInput.addEventListener('focus', () => pageInput.select());
pageInput.addEventListener('blur', () => { pageInput.value = state.current; });

/* Drag & drop */
let dragDepth = 0;
addEventListener('dragenter', e => { if (![...(e.dataTransfer?.types || [])].includes('Files')) return; e.preventDefault(); dragDepth++; $('#dropZone').classList.add('show'); });
addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropZone').classList.remove('show'); } });
addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; $('#dropZone').classList.remove('show'); [...(e.dataTransfer?.files || [])].forEach(openFile); });

/* Keyboard */
document.addEventListener('keydown', e => {
  const mod = e.metaKey || e.ctrlKey, k = e.key, typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
  if (mod && k.toLowerCase() === 'f') { e.preventDefault(); openSearch(); return; }
  if (mod && k.toLowerCase() === 's') { e.preventDefault(); window.GR.saveCopy && window.GR.saveCopy(); return; }
  if (mod && k === ',') { e.preventDefault(); window.GR.openSettings && window.GR.openSettings(); return; }
  if (k === 'Escape') {
    if (document.querySelector('.sheet-scrim.show')) { window.GR.closeSheets && window.GR.closeSheets(); return; }
    if (state.notePopFor) { closeNote(); return; }
    if (app.classList.contains('focus')) { focusMode(false); return; }
    if (pops.some(p => p.classList.contains('show'))) { if ($('#searchPanel').classList.contains('show')) closeSearch(); closePops(); return; }
    if (state.tool !== 'select') setTool('select');
    return;
  }
  if (typing) return;
  if (mod && (k === '=' || k === '+')) { e.preventDefault(); zoomStep(1); return; }
  if (mod && k === '-') { e.preventDefault(); zoomStep(-1); return; }
  if (mod && k === '0') { e.preventDefault(); applyFit('width'); return; }
  if (mod && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod && k.toLowerCase() === 'o') { e.preventDefault(); chooseFile(); return; }
  if (mod || e.altKey) return;
  if (document.querySelector('.sheet-scrim.show')) return;
  const map = { v: 'select', h: 'hand', m: 'highlight', p: 'pen', x: 'text', n: 'note', e: 'eraser' };
  const lk = k.toLowerCase();
  if (map[lk]) { setTool(map[lk]); return; }
  if (lk === 't') { window.GR.openTools && window.GR.openTools(); return; }
  if (lk === 's') { toggleSidebar(); return; }
  if (lk === 'f') { focusMode(); return; }
  if (lk === 'r') { rotate(e.shiftKey ? -90 : 90); return; }
  const noH = viewer.scrollWidth <= viewer.clientWidth + 2;
  if ((k === 'ArrowRight' && noH) || k === 'PageDown') { e.preventDefault(); goToPage(state.current + 1); }
  else if ((k === 'ArrowLeft' && noH) || k === 'PageUp') { e.preventDefault(); goToPage(state.current - 1); }
  else if (k === 'Home') { e.preventDefault(); goToPage(1); }
  else if (k === 'End') { e.preventDefault(); goToPage(state.pages.length); }
});

/* =================== Boot =================== */
if (window.desktop) {
  const root = document.documentElement;
  root.classList.add('desktop');
  if (window.desktop.mica) root.classList.add('mica');
  // Use the Windows accent color for buttons, selection and the active tool.
  const applyAccent = c => {
    if (!c || !/^[0-9a-f]{6}/i.test(c)) return;
    const hex = '#' + c.slice(0, 6), n = parseInt(c.slice(0, 6), 16);
    root.style.setProperty('--accent', hex);
    root.style.setProperty('--accent-soft', `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},.2)`);
  };
  window.desktop.accent().then(applyAccent, () => {});
  window.desktop.version().then(v => { const el = $('#appVersion'); el.textContent = 'Glass Reader ' + v; el.hidden = false; }, () => {});
  window.desktop.onAccent(applyAccent);
}

// Shared with tools.js and settings.js.
window.GR = {
  state, prefs, CSS_UNITS, toast, loader, openPdf, loadDoc, showDoc, captureView, clearDoc, openFile, buildSample,
  chooseFile: () => chooseFile(), relayout: () => { if (state.pages.length) layout(getAnchor()); }, getText, closePops, setTool, redraw, list, textBox,
  get reduceMotion() { return reduceMotion; },
  setReduceMotion(v) { reduceMotion = v || matchMedia('(prefers-reduced-motion: reduce)').matches; document.documentElement.classList.toggle('reduce-motion', !!v); },
  openSample
};
app.classList.toggle('wide', isWide());
if (!store.get('sidebar', isWide()) || !isWide()) { app.classList.remove('side-open'); $('#btnSidebar').classList.remove('on'); $('#btnSidebar').setAttribute('aria-pressed', 'false'); }
setColor(state.color); setTint(store.get('tint', 'white')); setTheme(store.get('theme', 'auto'));
setTool('select');
if (!window.pdfjsLib) {
  const f = document.createElement('div'); f.id = 'fatal';
  f.innerHTML = '<div class="glass panel card"><h2>The PDF engine didn’t load</h2><p>Check your internet connection and reload the page.</p></div>';
  app.append(f); return;
}
pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
if (window.desktop) {
  const d = window.desktop;
  d.onOpenFile(f => openPdf(new Uint8Array(f.data), f.name, null, { path: f.path }));
}
// Start on the Home tab unless Glass Reader was opened with a PDF (tabs.js loads after this file).
addEventListener('DOMContentLoaded', () => {
  if (!window.desktop) { GR.tabs.home(); return; }
  window.desktop.initialFile().then(f => f ? openPdf(new Uint8Array(f.data), f.name, null, { path: f.path }) : GR.tabs.home(), () => GR.tabs.home());
});
})();
