// Split view: a second, fully independent Glass Reader on the right (its own tabs, tools and
// Home page), with a draggable divider. The right pane is this same page loaded with ?pane=right.
(() => {
  'use strict';
  const GR = window.GR; if (!GR) return;
  const $ = (s, r = document) => r.querySelector(s);
  const root = document.documentElement, app = $('#app');
  const isRight = new URLSearchParams(location.search).get('pane') === 'right';
  const icon = n => `<svg class="i"><use href="#i-${n}"/></svg>`;

  /* ---------- Right pane ---------- */
  if (isRight) {
    root.classList.add('pane-right');
    const btn = document.createElement('button');
    btn.className = 'tab-new split-close'; btn.title = 'Close split view'; btn.setAttribute('aria-label', 'Close split view');
    btn.innerHTML = icon('x');
    btn.onclick = () => parent.postMessage({ type: 'gr-close-split' }, '*');
    $('#tabstrip').append(btn);
    addEventListener('message', e => {
      const m = e.data; if (!m || e.source !== parent) return;
      if (m.type === 'gr-open') GR.openPdf(new Uint8Array(m.data), m.name, m.seeds || null, { path: m.path });
    });
    addEventListener('DOMContentLoaded', () => parent.postMessage({ type: 'gr-pane-ready' }, '*'));
    GR.split = { right: true, open() {}, close() { parent.postMessage({ type: 'gr-close-split' }, '*'); }, get on() { return true; } };
    return;
  }

  /* ---------- Left pane (the window) ---------- */
  let frame = null, divider = null, ready = false, queue = [];
  let ratio = 0.5;
  try { ratio = Math.min(.8, Math.max(.2, +localStorage.getItem('glassreader:split') || .5)); } catch {}

  function apply() {
    const pct = (ratio * 100).toFixed(3);
    app.style.width = `calc(${pct}% - 3px)`;
    divider.style.left = `calc(${pct}% - 3px)`;
    frame.style.left = `calc(${pct}% + 3px)`;
    frame.style.width = `calc(${(100 - ratio * 100).toFixed(3)}% - 3px)`; // iframes don't stretch between left/right
    frame.style.height = '100%';
    dispatchEvent(new Event('resize'));
  }
  function send(m) { if (ready) frame.contentWindow.postMessage(m, '*'); else queue.push(m); }

  function open(doc) {
    if (!frame) {
      root.classList.add('split');
      divider = document.createElement('div'); divider.id = 'splitDivider'; divider.setAttribute('role', 'separator'); divider.setAttribute('aria-label', 'Resize split view');
      divider.innerHTML = '<span class="grip glass" data-lg-strength="10"></span>';
      frame = document.createElement('iframe'); frame.id = 'splitFrame'; frame.title = 'Right pane';
      frame.src = 'index.html?pane=right';
      document.body.append(divider, frame);
      ready = false;
      bindDivider();
      apply();
      requestAnimationFrame(() => root.classList.add('split-in'));
    }
    if (doc) send({ type: 'gr-open', data: doc.data, name: doc.name, path: doc.path, seeds: doc.seeds });
    else frame.focus();
  }
  function close() {
    if (!frame) return;
    frame.remove(); divider.remove(); frame = divider = null; ready = false; queue = [];
    root.classList.remove('split', 'split-in');
    app.style.width = '';
    dispatchEvent(new Event('resize'));
  }
  function bindDivider() {
    divider.addEventListener('pointerdown', e => {
      e.preventDefault(); divider.setPointerCapture(e.pointerId); root.classList.add('split-drag');
      const move = ev => { ratio = Math.min(.8, Math.max(.2, ev.clientX / innerWidth)); apply(); };
      const up = () => {
        root.classList.remove('split-drag');
        divider.removeEventListener('pointermove', move); divider.removeEventListener('pointerup', up); divider.removeEventListener('pointercancel', up);
        try { localStorage.setItem('glassreader:split', String(ratio)); } catch {}
      };
      divider.addEventListener('pointermove', move); divider.addEventListener('pointerup', up); divider.addEventListener('pointercancel', up);
    });
    divider.addEventListener('dblclick', () => { ratio = .5; apply(); });
  }
  addEventListener('message', e => {
    const m = e.data; if (!m || !frame || e.source !== frame.contentWindow) return;
    if (m.type === 'gr-pane-ready') { ready = true; queue.forEach(q => frame.contentWindow.postMessage(q, '*')); queue = []; }
    if (m.type === 'gr-close-split') close();
  });
  // Split button in the tab strip.
  const btn = document.createElement('button');
  btn.className = 'tab-new'; btn.id = 'splitBtn'; btn.title = 'Split view (Ctrl \\)'; btn.setAttribute('aria-label', 'Split view');
  btn.innerHTML = icon('split');
  btn.onclick = () => frame ? close() : open(null);
  $('#tabNew').after(btn);
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === '\\') { e.preventDefault(); frame ? close() : open(null); } });

  GR.split = { right: false, open, close, get on() { return !!frame; } };
})();
