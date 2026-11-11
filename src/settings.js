// Settings: graphics (GPU acceleration, glass quality), motion and scrolling, updates, default app.
(() => {
  'use strict';
  const GR = window.GR, D = window.desktop, LG = window.LiquidGlass;
  if (!GR) return;
  const $ = (s, r = document) => r.querySelector(s);
  const icon = n => `<svg class="i"><use href="#i-${n}"/></svg>`;
  const local = {
    get(k, d) { try { const v = localStorage.getItem('glassreader:set:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('glassreader:set:' + k, JSON.stringify(v)); } catch {} }
  };
  const DEFAULTS = { hardwareAcceleration: true, autoUpdate: true, smoothScroll: true, glass: 'high', reduceMotion: false };
  let S = { ...DEFAULTS };
  const panel = $('#settingsPanel'), sheet = $('#settingsSheet');
  let gpu = null, version = '', upd = { state: 'idle' }, restartNeeded = false;

  async function load() {
    if (D && D.getSettings) S = { ...DEFAULTS, ...(await D.getSettings()) };
    else for (const k in DEFAULTS) S[k] = local.get(k, DEFAULTS[k]);
    applyLive();
  }
  function setS(k, v) {
    S[k] = v;
    if (D && D.setSetting) D.setSetting(k, v); else local.set(k, v);
    applyLive();
  }
  function applyLive() {
    GR.prefs.smoothScroll = S.smoothScroll;
    GR.setReduceMotion(S.reduceMotion);
    if (LG && LG.quality !== S.glass) LG.setQuality(S.glass);
  }

  const sw = (k, on) => `<button class="switch" role="switch" aria-checked="${!!on}" data-k="${k}" aria-label="${k}"></button>`;
  const choice = (k, opts) => `<div class="choice" data-k="${k}">${opts.map(([v, l]) => `<button data-v="${v}" class="${S[k] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const row = (ico, color, title, desc, ctl) => `<div class="srow"><span class="sico" style="background:${color}">${icon(ico)}</span><span class="stxt"><b>${title}</b>${desc ? `<span>${desc}</span>` : ''}</span>${ctl || ''}</div>`;

  function gpuText() {
    if (!D) return 'Your browser decides how pages are drawn.';
    if (!gpu) return 'Checking your graphics card…';
    const name = gpu.renderer ? gpu.renderer.replace(/^ANGLE \(|\)$/g, '').split(',').slice(0, 2).join(' ·').trim() : 'Graphics card';
    if (!S.hardwareAcceleration) return `<span class="warn">Off. Pages and glass are drawn by the processor.</span>`;
    return gpu.active ? `<span class="good">Active</span> · ${name}` : `<span class="warn">Not available on this graphics driver.</span> Try updating it.`;
  }
  function updText() {
    switch (upd.state) {
      case 'checking': return 'Checking for updates…';
      case 'downloading': return `Downloading ${upd.version || 'update'} in the background… ${upd.percent ? Math.round(upd.percent) + '%' : ''}`;
      case 'ready': return `<span class="good">Version ${upd.version} is ready.</span> It installs silently when you close or restart Glass Reader.`;
      case 'none': return `<span class="good">You’re up to date.</span>`;
      case 'error': return 'Couldn’t check for updates. Check your internet connection.';
      default: return S.autoUpdate ? 'Updates download and install in the background.' : 'Automatic updates are off.';
    }
  }

  function render() {
    panel.innerHTML = `
      <header class="sh-head"><span class="sh-badge">${icon('gear')}</span><h2>Settings</h2><button class="ib" data-act="close" aria-label="Close">${icon('x')}</button></header>
      <div class="sglabel">Graphics</div>
      <div class="sgroup">
        ${row('cpu', '#5e5ce6', 'Hardware acceleration', gpuText(), sw('hardwareAcceleration', S.hardwareAcceleration))}
        ${restartNeeded ? row('update', '#ff9f0a', 'Restart to apply', 'Graphics changes take effect after Glass Reader restarts.', `<button class="txtbtn primary" data-act="relaunch">Restart</button>`) : ''}
        ${row('sparkle', '#0a84ff', 'Liquid glass', LG && !LG.supported ? 'Refraction needs the desktop app; a frosted look is used here.' : 'High bends light at the edges like a lens. Balanced is lighter on older graphics cards.', '')}
        <div class="srow" style="padding-top:0">${choice('glass', [['high', 'High'], ['balanced', 'Balanced'], ['off', 'Frosted only']])}</div>
      </div>
      <div class="sglabel">Motion & scrolling</div>
      <div class="sgroup">
        ${row('scroll', '#30b0c7', 'Smooth scrolling', 'Mac-style momentum for mouse wheels and trackpads, with a rubber-band stretch at the ends.', sw('smoothScroll', S.smoothScroll))}
        ${row('motion', '#8e8e93', 'Reduce motion', 'Turns off springs, stretching and zoom animations.', sw('reduceMotion', S.reduceMotion))}
      </div>
      ${D ? `<div class="sglabel">Updates</div>
      <div class="sgroup">
        ${row('update', '#34c759', 'Automatic updates', updText(), sw('autoUpdate', S.autoUpdate))}
        <div class="srow"><span class="stxt"><span>Glass Reader ${version}</span></span><button class="txtbtn" data-act="check">Check now</button>${upd.state === 'ready' ? '<button class="txtbtn primary" data-act="install">Restart & update</button>' : ''}</div>
      </div>
      <div class="sglabel">Default app</div>
      <div class="sgroup">
        ${row('doc', '#ff375f', 'Open PDFs with Glass Reader', 'In Windows Settings, find .pdf and choose Glass Reader.', '<button class="txtbtn" data-act="defaults">Open Windows Settings</button>')}
      </div>` : ''}`;
  }

  panel.addEventListener('click', async e => {
    const s = e.target.closest('.switch');
    if (s) {
      const k = s.dataset.k, v = s.getAttribute('aria-checked') !== 'true';
      s.setAttribute('aria-checked', v); setS(k, v);
      if (k === 'hardwareAcceleration') restartNeeded = true;
      if (k === 'autoUpdate' && v && D) D.checkForUpdates();
      setTimeout(render, 220); return;
    }
    const c = e.target.closest('.choice[data-k] button');
    if (c) { setS(c.parentElement.dataset.k, c.dataset.v); render(); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    if (act === 'close') GR.closeSheets();
    if (act === 'relaunch' && D) D.relaunch();
    if (act === 'check' && D) { upd = { state: 'checking' }; render(); D.checkForUpdates(); }
    if (act === 'install' && D) D.restartToUpdate();
    if (act === 'defaults' && D) D.openDefaultApps();
  });

  function open() { render(); GR.showSheet(sheet); if (D && D.gpuInfo) D.gpuInfo().then(g => { gpu = g; if (sheet.classList.contains('show')) render(); }); }
  GR.openSettings = open;
  $('#btnSettings').addEventListener('click', open);

  // Update banner: downloads happen silently; the banner only offers an early restart.
  if (D) {
    D.version().then(v => { version = v; });
    D.onUpdateStatus(st => {
      upd = st;
      if (st.state === 'ready') {
        $('#updateText').textContent = `Glass Reader ${st.version} is ready. It installs when you close the app.`;
        $('#updateBar').classList.add('show');
      }
      if (sheet.classList.contains('show')) render();
    });
    $('#updateBtn').addEventListener('click', () => D.restartToUpdate());
    $('#updateLater').addEventListener('click', () => $('#updateBar').classList.remove('show'));
  }
  load();
})();
