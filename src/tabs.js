// Tabs (like Edge) and the Home page (recent files, left menu).
// Each tab keeps its own parsed PDF and view; switching tabs just shows it again.
(() => {
  'use strict';
  const GR = window.GR, D = window.desktop;
  if (!GR) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $('#app'), strip = $('#tabs'), homeEl = $('#home');
  const icon = (n, c = 'i') => `<svg class="${c}"><use href="#i-${n}"/></svg>`;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const tabs = [];
  let active = null, uid = 0, homeView = 'home', recents = [], recentQuery = '';
  let moveToWindow = () => {};

  /* ---------- Tabs ---------- */
  const make = () => ({ id: ++uid, kind: 'home', doc: null, view: null, title: 'Home' });
  function renderTabs() {
    strip.innerHTML = tabs.map(t => `
      <div class="tab${t === active ? ' on glass' : ''}" role="tab" aria-selected="${t === active}" draggable="true" data-id="${t.id}" title="${esc(t.doc ? (t.doc.path || t.title) : 'Home')}" data-lg-strength="16">
        <span class="tab-ico">${icon(t.kind === 'home' ? 'home' : 'doc')}</span>
        <span class="tab-t">${esc(t.title)}</span>
        <button class="tab-x" data-close aria-label="Close ${esc(t.title)}">${icon('x')}</button>
      </div>`).join('');
    document.title = active ? (active.kind === 'home' ? 'Glass Reader' : active.title + ' – Glass Reader') : 'Glass Reader';
  }
  async function activate(t) {
    if (!t || t === active) return;
    if (active && active.kind === 'doc' && tabs.includes(active)) active.view = GR.captureView();
    active = t; renderTabs();
    if (t.kind === 'home') { GR.clearDoc(); showHome(); }
    else { hideHome(); await GR.showDoc(t.doc, t.view); }
  }
  async function open(data, name, seeds, meta = {}) {
    // The same file is already open: just switch to it.
    if (meta.path) { const same = tabs.find(t => t.doc && t.doc.path && t.doc.path.toLowerCase() === meta.path.toLowerCase()); if (same) { await activate(same); return; } }
    const doc = await GR.loadDoc(data, name, seeds, meta);
    if (!doc) return;
    let t = active && active.kind === 'home' ? active : null; // opening from Home replaces the Home tab
    if (!t) { t = make(); tabs.splice(tabs.indexOf(active) + 1, 0, t); }
    t.kind = 'doc'; t.doc = doc; t.view = null; t.title = doc.title || doc.name;
    if (t === active) { renderTabs(); hideHome(); await GR.showDoc(doc, null); }
    else await activate(t);
    remember(doc);
  }
  async function close(t) {
    const i = tabs.indexOf(t); if (i < 0) return;
    tabs.splice(i, 1);
    const wasActive = t === active;
    if (wasActive) active = null;
    if (t.doc) setTimeout(() => t.doc.pdf.destroy().catch(() => {}), 500);
    if (!tabs.length) { tabs.push(make()); await activate(tabs[0]); return; }
    if (wasActive) await activate(tabs[Math.min(i, tabs.length - 1)]);
    else renderTabs();
  }
  function newTab() { const t = make(); tabs.splice(tabs.indexOf(active) + 1, 0, t); activate(t); }
  function home() {
    const h = tabs.find(t => t.kind === 'home');
    if (h) activate(h); else newTab();
  }

  strip.addEventListener('click', e => {
    const tabEl = e.target.closest('.tab'); if (!tabEl) return;
    const t = tabs.find(x => x.id === +tabEl.dataset.id);
    if (e.target.closest('[data-close]')) close(t); else activate(t);
  });
  strip.addEventListener('auxclick', e => { if (e.button !== 1) return; const el = e.target.closest('.tab'); if (el) close(tabs.find(x => x.id === +el.dataset.id)); });
  /* ---------- Dragging tabs ----------
     Within the strip: reorder. Onto the other split pane: move the tab there.
     Out of the window: the tab becomes its own window (ready for Windows Snap). */
  const pane = () => (GR.split && GR.split.right) ? 'right' : 'left';
  const otherPane = () => pane() === 'left' ? 'right' : 'left';
  const TAB_TYPE = p => 'application/x-gr-tab-' + p;
  const docOf = t => ({ data: t.doc.bytes.slice(), name: t.doc.name, path: t.doc.path, seeds: t.doc.seeds });
  let dragId = null;
  strip.addEventListener('dragstart', e => {
    const el = e.target.closest('.tab'); if (!el) return;
    dragId = +el.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(TAB_TYPE(pane()), String(dragId));
    e.dataTransfer.setData('text/plain', el.querySelector('.tab-t').textContent);
    el.classList.add('dragging');
  });
  strip.addEventListener('dragend', async e => {
    const t = tabs.find(x => x.id === dragId); dragId = null; renderTabs();
    if (!t || !t.doc || !D || !D.tearOff || e.dataTransfer.dropEffect !== 'none') return;
    // Dropped outside every Glass Reader pane? Check where the pointer ended up.
    const at = await D.cursor();
    const inside = at.x >= screenX && at.x < screenX + outerWidth && at.y >= screenY && at.y < screenY + outerHeight;
    if (inside) return;
    D.tearOff(docOf(t), at);
    close(t);
  });
  moveToWindow = t => { if (t && t.doc && D && D.tearOff) { D.tearOff(docOf(t), null); close(t); } };
  // Accept a tab dragged from the other split pane.
  document.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes(TAB_TYPE(otherPane()))) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'; app.classList.add('tab-drop');
  }, true);
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) app.classList.remove('tab-drop'); }, true);
  document.addEventListener('drop', e => {
    app.classList.remove('tab-drop');
    const id = e.dataTransfer.getData(TAB_TYPE(otherPane())); if (!id) return;
    e.preventDefault(); e.stopPropagation();
    const target = pane() === 'right' ? parent : ($('#splitFrame') || {}).contentWindow;
    if (target) target.postMessage({ type: 'gr-give-tab', id: +id }, '*');
  }, true);
  addEventListener('message', e => {
    const m = e.data; if (!m || !m.type) return;
    const frame = $('#splitFrame');
    const fromPane = e.source === parent && parent !== window || (frame && e.source === frame.contentWindow);
    if (!fromPane) return;
    if (m.type === 'gr-give-tab') {
      const t = tabs.find(x => x.id === m.id); if (!t || !t.doc) return;
      e.source.postMessage({ type: 'gr-take-tab', doc: docOf(t) }, '*');
      close(t);
    }
    if (m.type === 'gr-take-tab') { const d = m.doc; GR.openPdf(new Uint8Array(d.data), d.name, d.seeds, { path: d.path }); }
  });
  strip.addEventListener('dragover', e => {
    if (dragId == null) return; e.preventDefault(); e.stopPropagation();
    const over = e.target.closest('.tab'); if (!over || +over.dataset.id === dragId) return;
    const from = tabs.findIndex(t => t.id === dragId), to = tabs.findIndex(t => t.id === +over.dataset.id);
    const [m] = tabs.splice(from, 1); tabs.splice(to, 0, m);
    const dragEl = strip.querySelector(`[data-id="${dragId}"]`);
    if (from < to) over.after(dragEl); else over.before(dragEl);
  });
  strip.addEventListener('drop', e => { if (dragId != null) { e.preventDefault(); e.stopPropagation(); } });
  $('#tabNew').addEventListener('click', newTab);

  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey; if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === 't') { e.preventDefault(); newTab(); }
    else if (k === 'w') { e.preventDefault(); close(active); }
    else if (k === 'tab') { e.preventDefault(); const i = tabs.indexOf(active); activate(tabs[(i + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length]); }
    else if (/^[1-9]$/.test(k)) { e.preventDefault(); activate(k === '9' ? tabs[tabs.length - 1] : tabs[+k - 1]); }
  }, true);

  /* ---------- Recent files ---------- */
  async function loadRecents() {
    if (D && D.getRecents) recents = await D.getRecents();
    else recents = [];
  }
  async function remember(doc) {
    if (!doc.path || !D || !D.updateRecent) return;
    let thumb = null;
    try {
      const page = await doc.pdf.getPage(1), v = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 220 / v.width });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      thumb = c.toDataURL('image/jpeg', .72);
    } catch {}
    await D.updateRecent(doc.path, { name: doc.name, title: doc.title, pages: doc.pdf.numPages, thumb });
  }
  async function openRecent(r) {
    const f = D && await D.openPath(r.path);
    if (!f) { GR.toast('That file was moved or deleted. It’s been removed from Recent.'); await D.removeRecent(r.path); await loadRecents(); renderHome(); return; }
    await GR.openPdf(new Uint8Array(f.data), f.name, null, { path: f.path });
  }
  const ago = t => {
    const s = (Date.now() - t) / 1000;
    if (s < 60) return 'Just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago'; if (s < 172800) return 'Yesterday';
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  };
  const folder = p => { const parts = p.split(/[\\/]/); parts.pop(); return parts.slice(-2).join(' › ') || p; };

  /* ---------- Home page ---------- */
  function greeting() { const h = new Date().getHours(); return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
  function card(r) {
    return `<button class="rcard" data-path="${esc(r.path)}" title="${esc(r.path)}">
      <span class="rthumb">${r.thumb ? `<img src="${r.thumb}" alt="">` : icon('doc')}</span>
      <span class="rmeta"><b>${esc(r.title || r.name)}</b><span>${esc(ago(r.openedAt))}${r.pages ? ` · ${r.pages} page${r.pages === 1 ? '' : 's'}` : ''}</span></span>
    </button>`;
  }
  function row(r) {
    return `<div class="rrow" data-path="${esc(r.path)}" role="button" tabindex="0" title="${esc(r.path)}">
      <span class="rthumb sm">${r.thumb ? `<img src="${r.thumb}" alt="">` : icon('doc')}</span>
      <span class="rmeta"><b>${esc(r.title || r.name)}</b><span>${esc(folder(r.path))}</span></span>
      <span class="rwhen">${esc(ago(r.openedAt))}</span>
      <button class="ib" data-remove aria-label="Remove from Recent">${icon('x')}</button>
    </div>`;
  }
  function renderHome() {
    $$('.hnav [data-view]', homeEl).forEach(b => b.classList.toggle('on', b.dataset.view === homeView));
    const main = $('.hmain', homeEl);
    if (homeView === 'home') {
      main.innerHTML = `
        <header class="hhead"><h1>${greeting()}</h1><p>Pick up where you left off, or open something new.</p></header>
        <div class="hactions">
          <button class="hact primary" data-act="open"><span class="hico">${icon('folder')}</span><span><b>Open a PDF</b><span>Or drop files anywhere · Ctrl O</span></span></button>
          <button class="hact" data-act="sample"><span class="hico alt">${icon('doc')}</span><span><b>Sample guide</b><span>A tour of everything Glass Reader does</span></span></button>
        </div>
        <section class="hsec"><div class="hsec-h"><h2>Recent</h2>${recents.length > 8 ? '<button class="txtbtn" data-view-link="recent">See all</button>' : ''}</div>
          ${recents.length ? `<div class="rgrid">${recents.slice(0, 8).map(card).join('')}</div>` : `<div class="hempty">${icon('clock')}<b>No recent files yet</b><span>PDFs you open will show up here.</span></div>`}
        </section>`;
    } else {
      const q = recentQuery.toLowerCase(), list = recents.filter(r => !q || (r.title || r.name || '').toLowerCase().includes(q) || r.path.toLowerCase().includes(q));
      main.innerHTML = `
        <header class="hhead row"><h1>Recent</h1>
          <label class="hsearch">${icon('search')}<input id="recentSearch" placeholder="Search recent files" value="${esc(recentQuery)}" spellcheck="false"></label>
          ${recents.length ? '<button class="txtbtn" data-act="clear">Clear list</button>' : ''}</header>
        ${list.length ? `<div class="rlist">${list.map(row).join('')}</div>` : `<div class="hempty">${icon('clock')}<b>${recents.length ? 'No matches' : 'No recent files yet'}</b><span>${recents.length ? 'Try a different name.' : 'PDFs you open will show up here.'}</span></div>`}`;
      const inp = $('#recentSearch'); if (inp) { inp.oninput = () => { recentQuery = inp.value; renderHome(); const n = $('#recentSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }; }
    }
  }
  async function showHome() {
    app.classList.add('home-mode'); homeEl.hidden = false;
    await loadRecents(); renderHome();
  }
  function hideHome() { app.classList.remove('home-mode'); homeEl.hidden = true; }

  homeEl.addEventListener('click', async e => {
    const nav = e.target.closest('[data-view]'); if (nav) { homeView = nav.dataset.view; renderHome(); return; }
    const link = e.target.closest('[data-view-link]'); if (link) { homeView = link.dataset.viewLink; renderHome(); return; }
    const a = e.target.closest('[data-act]');
    if (a) {
      const act = a.dataset.act;
      if (act === 'open') GR.chooseFile();
      if (act === 'sample') { const s = GR.buildSample(); GR.openPdf(s.bytes, 'The Glass Handbook', s.seeds); }
      if (act === 'settings') GR.openSettings && GR.openSettings();
      if (act === 'clear' && D) { await D.clearRecents(); await loadRecents(); renderHome(); }
      return;
    }
    const rm = e.target.closest('[data-remove]');
    if (rm) { const p = rm.closest('[data-path]').dataset.path; await D.removeRecent(p); await loadRecents(); renderHome(); return; }
    const r = e.target.closest('[data-path]');
    if (r) openRecent(recents.find(x => x.path === r.dataset.path));
  });
  homeEl.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('.rrow')) e.target.click(); });

  /* ---------- Right-click menu on a tab ---------- */
  const menu = document.createElement('div');
  menu.id = 'tabMenu'; menu.className = 'glass panel pop'; menu.setAttribute('role', 'menu');
  app.append(menu);
  const hideMenu = () => menu.classList.remove('show');
  strip.addEventListener('contextmenu', e => {
    const el = e.target.closest('.tab'); if (!el) return;
    e.preventDefault();
    const t = tabs.find(x => x.id === +el.dataset.id);
    const canSplit = t.doc && GR.split && !GR.split.right;
    menu.innerHTML = `
      ${canSplit ? `<button data-m="split">${icon('split')}Open in split view</button>` : ''}
      ${t.doc && D && D.tearOff ? `<button data-m="window">${icon('expand')}Move to new window</button>` : ''}
      ${t.doc ? '<hr>' : ''}
      <button data-m="close">${icon('x')}Close tab</button>
      ${tabs.length > 1 ? `<button data-m="others">${icon('x')}Close other tabs</button>` : ''}`;
    const ar = app.getBoundingClientRect();
    menu.style.left = Math.min(e.clientX - ar.left, ar.width - 240) + 'px';
    menu.style.top = (e.clientY - ar.top + 4) + 'px';
    menu.onclick = async ev => {
      const b = ev.target.closest('[data-m]'); if (!b) return; hideMenu();
      if (b.dataset.m === 'close') close(t);
      if (b.dataset.m === 'window') moveToWindow(t);
      if (b.dataset.m === 'others') { for (const x of tabs.slice()) if (x !== t) await close(x); activate(t); }
      if (b.dataset.m === 'split') {
        // Like Edge: the tab moves to the right pane.
        GR.split.open({ data: t.doc.bytes.slice(), name: t.doc.name, path: t.doc.path, seeds: t.doc.seeds });
        close(t);
      }
    };
    requestAnimationFrame(() => menu.classList.add('show'));
  });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#tabMenu')) hideMenu(); });
  addEventListener('blur', hideMenu);

  GR.tabs = { open, home, newTab, close: () => close(active), get active() { return active; }, get list() { return tabs.slice(); } };
})();
