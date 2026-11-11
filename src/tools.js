// PDF tools: merge, split, organize, compress, convert, watermark, page numbers,
// and "Save a copy" which writes your markup into the PDF.
(() => {
  'use strict';
  const GR = window.GR, D = window.desktop;
  if (!GR || !window.PDFLib) return;
  const { PDFDocument, StandardFonts, rgb, degrees, LineCapStyle, BlendMode, PDFHexString } = PDFLib;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const state = GR.state;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (n, cls = 'i') => `<svg class="${cls}"><use href="#i-${n}"/></svg>`;
  const fmt = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(n < 10485760 ? 2 : 1) + ' MB';
  const hexRgb = h => { const n = parseInt(h.slice(1), 16); return rgb((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
  const baseName = () => (state.name || 'Document').replace(/\.pdf$/i, '');

  /* ---------- Files ---------- */
  async function saveBytes(bytes, name) {
    if (D && D.saveFile) { const r = await D.saveFile(name, bytes); if (r) GR.toast('Saved ' + r); return r; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes])); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000); return name;
  }
  async function saveMany(files, what) {
    if (D && D.saveFiles) { const r = await D.saveFiles(files); if (r) GR.toast(`Saved ${files.length} ${what} to ${r}`); return r; }
    for (const f of files) await saveBytes(f.data, f.name);
  }
  function pickFiles(accept, multiple = true) {
    return new Promise(res => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.multiple = multiple;
      inp.onchange = () => res([...inp.files]); inp.click();
    });
  }
  const readFile = f => f.arrayBuffer().then(b => new Uint8Array(b));
  const loadLib = bytes => PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });

  /* ---------- Save a copy with markup ---------- */
  async function withMarkup(bytes, annots) {
    const doc = await loadLib(bytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const clean = s => [...s].map(ch => { try { font.encodeText(ch); return ch; } catch { return '?'; } }).join('');
    const pages = doc.getPages();
    for (const [n, items] of Object.entries(annots || {})) {
      const page = pages[+n - 1]; if (!page) continue;
      for (const a of items) {
        const color = hexRgb(a.color || '#FFD60A');
        if (a.type === 'rect') {
          const [x1, y1, x2, y2] = a.r;
          page.drawRectangle({ x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), color, opacity: .4, blendMode: BlendMode.Multiply });
        } else if (a.type === 'ink' && a.pts.length) {
          const p = a.pts; let d = `M ${p[0][0]} ${-p[0][1]}`;
          if (p.length === 1) d += ` L ${p[0][0] + .01} ${-p[0][1]}`;
          for (let i = 1; i < p.length - 1; i++) d += ` Q ${p[i][0]} ${-p[i][1]} ${(p[i][0] + p[i + 1][0]) / 2} ${-(p[i][1] + p[i + 1][1]) / 2}`;
          if (p.length > 1) d += ` L ${p[p.length - 1][0]} ${-p[p.length - 1][1]}`;
          page.drawSvgPath(d, { x: 0, y: 0, borderColor: color, borderWidth: a.w, borderLineCap: LineCapStyle.Round });
        } else if (a.type === 'text' && a.text) {
          a.text.split('\n').forEach((line, i) => page.drawText(clean(line), { x: a.at[0], y: a.at[1] - i * a.size * 1.25, size: a.size, font, color }));
        } else if (a.type === 'note') {
          const [x, y] = a.at, c = color;
          const annot = doc.context.obj({
            Type: 'Annot', Subtype: 'Text', Rect: [x - 10, y - 10, x + 10, y + 10], Name: 'Comment', Open: false, F: 4,
            Contents: PDFHexString.fromText(a.text || ''), C: [c.red, c.green, c.blue]
          });
          page.node.addAnnot(doc.context.register(annot));
        }
      }
    }
    return doc.save();
  }
  async function saveCopy() {
    if (!state.bytes) return;
    try {
      GR.loader(true, 'Preparing your copy…');
      const out = await withMarkup(state.bytes, state.annots);
      GR.loader(false);
      await saveBytes(out, baseName() + ' (marked up).pdf');
    } catch (e) { GR.loader(false); GR.toast('This PDF couldn’t be saved. It may be protected.'); }
  }
  GR.saveCopy = saveCopy;
  $('#btnSave').addEventListener('click', saveCopy);

  /* ---------- Sheet ---------- */
  const sheet = $('#toolsSheet'), panel = $('#toolsPanel');
  function show(s) { GR.closePops(); s.classList.add('show'); s.setAttribute('aria-hidden', 'false'); }
  function closeSheets() { $$('.sheet-scrim.show').forEach(s => { s.classList.remove('show'); s.setAttribute('aria-hidden', 'true'); }); }
  GR.closeSheets = closeSheets;
  GR.showSheet = show;
  $$('.sheet-scrim').forEach(s => s.addEventListener('pointerdown', e => { if (e.target === s) closeSheets(); }));

  const TOOLS = [
    { id: 'merge', icon: 'merge', title: 'Merge', desc: 'Combine several PDFs into one' },
    { id: 'split', icon: 'scissors', title: 'Split & extract', desc: 'Pull out pages or ranges' },
    { id: 'organize', icon: 'pages', title: 'Organize pages', desc: 'Reorder, rotate or delete pages' },
    { id: 'compress', icon: 'compress', title: 'Compress', desc: 'Make the file smaller' },
    { id: 'convert', icon: 'convert', title: 'Convert', desc: 'PDF to images or text, images to PDF' },
    { id: 'watermark', icon: 'drop', title: 'Watermark', desc: 'Stamp text across every page' },
    { id: 'numbers', icon: 'number', title: 'Page numbers', desc: 'Number the pages' }
  ];
  function header(title, back) {
    return `<header class="sh-head">${back ? `<button class="ib" data-act="home" aria-label="All tools">${icon('left')}</button>` : `<span class="sh-badge">${icon('grid')}</span>`}
      <h2>${esc(title)}</h2><button class="ib" data-act="close" aria-label="Close">${icon('x')}</button></header>`;
  }
  function home() {
    panel.innerHTML = header('PDF Tools') + `
      <p class="sh-sub">Working on <b>${esc(baseName())}</b> · ${state.pages.length} page${state.pages.length === 1 ? '' : 's'}</p>
      <div class="tgrid">${TOOLS.map(t => `<button class="tcard" data-tool="${t.id}"><span class="tico">${icon(t.icon)}</span><span class="tt">${t.title}</span><span class="td">${t.desc}</span></button>`).join('')}
        <button class="tcard" data-tool="save"><span class="tico">${icon('save')}</span><span class="tt">Save a copy</span><span class="td">With your highlights, drawings, text and notes</span></button>
      </div>
      <p class="sh-foot">To edit, add text and drawings with the dock at the bottom, then save a copy (Ctrl S).</p>`;
  }
  panel.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (a) { if (a.dataset.act === 'close') closeSheets(); else if (a.dataset.act === 'home') home(); return; }
    const t = e.target.closest('.tcard[data-tool]'); if (!t) return;
    if (t.dataset.tool === 'save') { closeSheets(); saveCopy(); return; }
    VIEWS[t.dataset.tool]();
  });
  function openTools() { if (!state.pdf) return; home(); show(sheet); }
  GR.openTools = openTools;
  $('#btnTools').addEventListener('click', openTools);

  // Result card shared by the tools.
  function result(bytes, name, note) {
    const box = $('.sh-result', panel); if (!box) return;
    box.innerHTML = `<div class="res glass-inner">${icon('check', 'i ok')}<div class="res-t"><b>${esc(name)}</b><span>${note || fmt(bytes.length)}</span></div>
      <button class="txtbtn" data-r="open">Open</button><button class="txtbtn primary" data-r="save">Save…</button></div>`;
    box.querySelector('[data-r="open"]').onclick = () => { closeSheets(); GR.openPdf(bytes.slice(), name.replace(/\.pdf$/i, '')); };
    box.querySelector('[data-r="save"]').onclick = () => saveBytes(bytes, name);
  }
  async function run(btn, label, fn) {
    btn.disabled = true; const old = btn.textContent; btn.textContent = label;
    try { await fn(); } catch (e) { console.error(e); GR.toast('That didn’t work: ' + (e.message || 'unknown error')); }
    finally { btn.disabled = false; btn.textContent = old; GR.loader(false); }
  }
  const progress = (t) => GR.loader(true, t);

  /* ---------- Merge ---------- */
  function merge() {
    const files = [{ name: baseName(), bytes: state.bytes, pages: state.pages.length, current: true }];
    panel.innerHTML = header('Merge', true) + `
      <p class="sh-sub">Files are combined in this order. Use the arrows to reorder.</p>
      <ul class="flist" id="mList"></ul>
      <div class="sh-row"><button class="pill-btn" id="mAdd">${icon('plus')}Add PDFs</button></div>
      <div class="sh-actions"><button class="txtbtn primary big" id="mGo">Merge</button></div><div class="sh-result"></div>`;
    const draw = () => {
      $('#mList').innerHTML = files.map((f, i) => `<li><span class="fi">${icon('doc')}</span><span class="fn"><b>${esc(f.name)}</b><span>${f.pages} page${f.pages === 1 ? '' : 's'}${f.current ? ' · open now' : ''}</span></span>
        <button class="ib" data-m="up" data-i="${i}" ${i ? '' : 'disabled'} aria-label="Move up">${icon('up')}</button>
        <button class="ib" data-m="down" data-i="${i}" ${i < files.length - 1 ? '' : 'disabled'} aria-label="Move down">${icon('down')}</button>
        <button class="ib" data-m="rm" data-i="${i}" aria-label="Remove">${icon('x')}</button></li>`).join('');
      $('#mGo').disabled = files.length < 2;
    };
    $('#mList').onclick = e => {
      const b = e.target.closest('[data-m]'); if (!b) return; const i = +b.dataset.i;
      if (b.dataset.m === 'up') [files[i - 1], files[i]] = [files[i], files[i - 1]];
      if (b.dataset.m === 'down') [files[i + 1], files[i]] = [files[i], files[i + 1]];
      if (b.dataset.m === 'rm') files.splice(i, 1);
      draw();
    };
    $('#mAdd').onclick = async () => {
      for (const f of await pickFiles('application/pdf,.pdf')) {
        try { const bytes = await readFile(f); const d = await loadLib(bytes); files.push({ name: f.name.replace(/\.pdf$/i, ''), bytes, pages: d.getPageCount() }); }
        catch { GR.toast(`“${f.name}” isn’t a PDF that can be read.`); }
      }
      draw();
    };
    $('#mGo').onclick = e => run(e.target, 'Merging…', async () => {
      const out = await PDFDocument.create();
      for (const f of files) { const src = await loadLib(f.bytes); (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p)); }
      const bytes = await out.save();
      result(bytes, `${files[0].name} (merged).pdf`, `${out.getPageCount()} pages · ${fmt(bytes.length)}`);
    });
    draw();
  }

  /* ---------- Split ---------- */
  function parseRanges(s, max) {
    const out = [];
    for (const part of s.split(/[,;]+/).map(x => x.trim()).filter(Boolean)) {
      const m = part.match(/^(\d+)(?:\s*-\s*(\d+|end))?$/i); if (!m) throw new Error(`“${part}” isn’t a page or range`);
      const a = +m[1], b = m[2] ? (/end/i.test(m[2]) ? max : +m[2]) : a;
      if (a < 1 || b > max || a > b) throw new Error(`“${part}” is outside pages 1–${max}`);
      out.push(Array.from({ length: b - a + 1 }, (_, i) => a + i - 1));
    }
    if (!out.length) throw new Error('Enter at least one page');
    return out;
  }
  function split() {
    const N = state.pages.length;
    panel.innerHTML = header('Split & extract', true) + `
      <div class="choice" id="sMode"><button data-v="extract" class="on">Extract pages</button><button data-v="ranges">Split by ranges</button><button data-v="each">Every page</button></div>
      <label class="fld" id="sRangeF"><span>Pages</span><input id="sRange" value="1-${Math.min(3, N)}" placeholder="e.g. 1-3, 5, 8-end" spellcheck="false"></label>
      <p class="sh-sub" id="sHelp">Pages 1 to ${N}. Separate with commas, like 1-3, 5, 8-end.</p>
      <div class="sh-actions"><button class="txtbtn primary big" id="sGo">Extract</button></div><div class="sh-result"></div>`;
    let mode = 'extract';
    $('#sMode').onclick = e => {
      const b = e.target.closest('button'); if (!b) return; mode = b.dataset.v;
      $$('#sMode button').forEach(x => x.classList.toggle('on', x === b));
      $('#sRangeF').hidden = mode === 'each';
      $('#sGo').textContent = mode === 'extract' ? 'Extract' : 'Split';
      $('#sHelp').textContent = mode === 'each' ? `Saves ${N} files, one per page, into a folder you choose.` : mode === 'ranges' ? 'Each range becomes its own file, like 1-3, 4-6, 7-end.' : `Pages 1 to ${N}. Separate with commas, like 1-3, 5, 8-end.`;
    };
    $('#sGo').onclick = e => run(e.target, 'Working…', async () => {
      const src = await loadLib(state.bytes);
      const groups = mode === 'each' ? Array.from({ length: N }, (_, i) => [i]) : parseRanges($('#sRange').value, N);
      const make = async idx => { const d = await PDFDocument.create(); (await d.copyPages(src, idx)).forEach(p => d.addPage(p)); return d.save(); };
      if (mode === 'extract') {
        const bytes = await make(groups.flat());
        result(bytes, `${baseName()} (pages ${$('#sRange').value.replace(/\s+/g, '')}).pdf`, `${groups.flat().length} pages · ${fmt(bytes.length)}`);
      } else {
        const files = [];
        for (const g of groups) files.push({ name: `${baseName()} - ${g.length > 1 ? `pages ${g[0] + 1}-${g[g.length - 1] + 1}` : `page ${g[0] + 1}`}.pdf`, data: await make(g) });
        await saveMany(files, 'PDFs');
      }
    });
  }

  /* ---------- Organize ---------- */
  async function organize() {
    const N = state.pages.length;
    let order = Array.from({ length: N }, (_, i) => ({ src: i, rot: 0 }));
    panel.innerHTML = header('Organize pages', true) + `
      <p class="sh-sub">Drag pages to reorder. Rotate or delete with the buttons on each page.</p>
      <div class="ogrid" id="oGrid"></div>
      <div class="sh-actions"><button class="txtbtn" id="oReset">Reset</button><button class="txtbtn primary big" id="oGo">Apply</button></div><div class="sh-result"></div>`;
    const thumbs = [];
    const grid = $('#oGrid');
    const draw = () => {
      grid.innerHTML = '';
      order.forEach((o, i) => {
        const card = document.createElement('div'); card.className = 'ocard'; card.draggable = true; card.dataset.i = i;
        card.innerHTML = `<div class="oth" style="transform:rotate(${o.rot}deg)"></div><div class="obar"><span>${o.src + 1}</span>
          <button class="ib" data-o="rot" aria-label="Rotate">${icon('rotr')}</button><button class="ib" data-o="del" aria-label="Delete">${icon('trash')}</button></div>`;
        if (thumbs[o.src]) card.firstChild.append(thumbs[o.src].cloneNode ? cloneCanvas(thumbs[o.src]) : '');
        grid.append(card);
      });
      $('#oGo').disabled = !order.length;
    };
    const cloneCanvas = c => { const n = document.createElement('canvas'); n.width = c.width; n.height = c.height; n.getContext('2d').drawImage(c, 0, 0); return n; };
    let dragI = null;
    grid.addEventListener('dragstart', e => { const c = e.target.closest('.ocard'); if (!c) return; dragI = +c.dataset.i; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    grid.addEventListener('dragend', () => { dragI = null; $$('.ocard', grid).forEach(c => c.classList.remove('dragging', 'over')); });
    grid.addEventListener('dragover', e => { if (dragI == null) return; e.preventDefault(); e.stopPropagation(); const c = e.target.closest('.ocard'); $$('.ocard.over', grid).forEach(x => x !== c && x.classList.remove('over')); if (c) c.classList.add('over'); });
    grid.addEventListener('drop', e => {
      if (dragI == null) return; e.preventDefault(); e.stopPropagation();
      const c = e.target.closest('.ocard'); const to = c ? +c.dataset.i : order.length - 1;
      const [m] = order.splice(dragI, 1); order.splice(to, 0, m); dragI = null; draw();
    });
    grid.addEventListener('click', e => {
      const b = e.target.closest('[data-o]'); if (!b) return; const i = +b.closest('.ocard').dataset.i;
      if (b.dataset.o === 'rot') order[i].rot = (order[i].rot + 90) % 360; else order.splice(i, 1);
      draw();
    });
    $('#oReset').onclick = () => { order = Array.from({ length: N }, (_, i) => ({ src: i, rot: 0 })); draw(); };
    $('#oGo').onclick = e => run(e.target, 'Applying…', async () => {
      const src = await loadLib(state.bytes), out = await PDFDocument.create();
      const pages = await out.copyPages(src, order.map(o => o.src));
      pages.forEach((p, i) => { if (order[i].rot) p.setRotation(degrees((p.getRotation().angle + order[i].rot) % 360)); out.addPage(p); });
      const bytes = await out.save();
      result(bytes, `${baseName()} (organized).pdf`, `${order.length} pages · ${fmt(bytes.length)}`);
    });
    draw();
    // Thumbnails render in the background.
    for (let i = 0; i < N; i++) {
      const page = await state.pdf.getPage(i + 1), v = page.getViewport({ scale: 1 });
      const s = 220 / Math.max(v.width, v.height), vp = page.getViewport({ scale: s });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      thumbs[i] = c;
      $$('.ocard', grid).forEach(card => { const o = order[+card.dataset.i]; if (o && o.src === i && !card.firstChild.firstChild) card.firstChild.append(cloneCanvas(c)); });
      if (!grid.isConnected) return;
    }
  }

  /* ---------- Compress ---------- */
  async function rasterize(levelDpi, quality, label) {
    const out = await PDFDocument.create(), N = state.pages.length;
    for (let i = 1; i <= N; i++) {
      progress(`${label} page ${i} of ${N}…`);
      const page = await state.pdf.getPage(i), base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: levelDpi / 72 });
      const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
      const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      const p = out.addPage([base.width, base.height]);
      p.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
      c.width = 0;
    }
    return out.save();
  }
  function compress() {
    const before = state.bytes.length;
    panel.innerHTML = header('Compress', true) + `
      <p class="sh-sub">Current size: <b>${fmt(before)}</b></p>
      <div class="opts" id="cOpts">
        <button class="opt on" data-v="light"><b>Light</b><span>Keeps text sharp and selectable. Best for documents that are mostly text.</span></button>
        <button class="opt" data-v="strong"><b>Strong</b><span>Turns pages into images at 120 DPI. Big savings for scans and photos; text is no longer selectable.</span></button>
        <button class="opt" data-v="max"><b>Maximum</b><span>Images at 90 DPI with lower quality. Smallest file, good for sharing on screen.</span></button>
      </div>
      <div class="sh-actions"><button class="txtbtn primary big" id="cGo">Compress</button></div><div class="sh-result"></div>`;
    let level = 'light';
    $('#cOpts').onclick = e => { const b = e.target.closest('.opt'); if (!b) return; level = b.dataset.v; $$('#cOpts .opt').forEach(x => x.classList.toggle('on', x === b)); };
    $('#cGo').onclick = e => run(e.target, 'Compressing…', async () => {
      let bytes;
      if (level === 'light') {
        const d = await loadLib(state.bytes);
        d.setProducer('Glass Reader'); d.setCreator('Glass Reader');
        bytes = await d.save({ useObjectStreams: true });
      } else bytes = level === 'strong' ? await rasterize(120, .62, 'Compressing') : await rasterize(90, .45, 'Compressing');
      const pct = Math.round((1 - bytes.length / before) * 100);
      if (bytes.length >= before) { result(state.bytes, `${baseName()}.pdf`, `${level === 'light' ? `Already as small as it gets without losing text (${fmt(before)}). Try Strong.` : `This file is already smaller than its image version (${fmt(before)}). Keep the original.`}`); return; }
      result(bytes, `${baseName()} (compressed).pdf`, `${fmt(before)} → ${fmt(bytes.length)} · ${pct}% smaller`);
    });
  }

  /* ---------- Convert ---------- */
  function convert() {
    panel.innerHTML = header('Convert', true) + `
      <div class="choice" id="vMode"><button data-v="img" class="on">PDF to images</button><button data-v="txt">PDF to text</button><button data-v="pdf">Images to PDF</button></div>
      <div id="vBody"></div><div class="sh-result"></div>`;
    const body = $('#vBody');
    const views = {
      img: () => {
        body.innerHTML = `<div class="sh-grid2">
          <label class="fld"><span>Format</span><div class="choice" id="iFmt"><button data-v="png" class="on">PNG</button><button data-v="jpeg">JPG</button></div></label>
          <label class="fld"><span>Resolution</span><div class="choice" id="iDpi"><button data-v="72">72</button><button data-v="150" class="on">150</button><button data-v="300">300 DPI</button></div></label></div>
          <p class="sh-sub">Saves one image per page (${state.pages.length}) into a folder you choose.</p>
          <div class="sh-actions"><button class="txtbtn primary big" id="iGo">Convert</button></div>`;
        const pick = id => { $(id).onclick = e => { const b = e.target.closest('button'); if (b) $$(id + ' button').forEach(x => x.classList.toggle('on', x === b)); }; };
        pick('#iFmt'); pick('#iDpi');
        $('#iGo').onclick = e => run(e.target, 'Converting…', async () => {
          const fmtV = $('#iFmt .on').dataset.v, dpi = +$('#iDpi .on').dataset.v, N = state.pages.length, files = [];
          for (let i = 1; i <= N; i++) {
            progress(`Rendering page ${i} of ${N}…`);
            const page = await state.pdf.getPage(i), vp = page.getViewport({ scale: dpi / 72 });
            const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
            const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
            const blob = await new Promise(r => c.toBlob(r, 'image/' + fmtV, .9));
            files.push({ name: `${baseName()} - page ${String(i).padStart(String(N).length, '0')}.${fmtV === 'png' ? 'png' : 'jpg'}`, data: new Uint8Array(await blob.arrayBuffer()) });
            c.width = 0;
          }
          GR.loader(false);
          await saveMany(files, 'images');
        });
      },
      txt: () => {
        body.innerHTML = `<p class="sh-sub">Saves all the document’s text as a .txt file, page by page. Scanned pages have no text to extract.</p>
          <div class="sh-actions"><button class="txtbtn primary big" id="tGo">Extract text</button></div>`;
        $('#tGo').onclick = e => run(e.target, 'Extracting…', async () => {
          const parts = [];
          for (const p of state.pages) {
            const tc = await GR.getText(p);
            parts.push(`--- Page ${p.n} ---\n` + tc.items.map(it => (it.str || '') + (it.hasEOL ? '\n' : '')).join('').replace(/[ \t]+\n/g, '\n').trim());
          }
          await saveBytes(new TextEncoder().encode(parts.join('\n\n') + '\n'), baseName() + '.txt');
        });
      },
      pdf: () => {
        const imgs = [];
        body.innerHTML = `<ul class="flist" id="pList"></ul>
          <div class="sh-row"><button class="pill-btn" id="pAdd">${icon('image')}Add images</button></div>
          <label class="fld"><span>Page size</span><div class="choice" id="pSize"><button data-v="fit" class="on">Fit image</button><button data-v="a4">A4</button><button data-v="letter">Letter</button></div></label>
          <div class="sh-actions"><button class="txtbtn primary big" id="pGo" disabled>Create PDF</button></div>`;
        $('#pSize').onclick = e => { const b = e.target.closest('button'); if (b) $$('#pSize button').forEach(x => x.classList.toggle('on', x === b)); };
        const draw = () => {
          $('#pList').innerHTML = imgs.map((f, i) => `<li><span class="fi">${icon('image')}</span><span class="fn"><b>${esc(f.name)}</b><span>${fmt(f.size)}</span></span><button class="ib" data-i="${i}" aria-label="Remove">${icon('x')}</button></li>`).join('');
          $('#pGo').disabled = !imgs.length;
        };
        $('#pList').onclick = e => { const b = e.target.closest('[data-i]'); if (b) { imgs.splice(+b.dataset.i, 1); draw(); } };
        $('#pAdd').onclick = async () => { imgs.push(...await pickFiles('image/*')); draw(); };
        $('#pGo').onclick = e => run(e.target, 'Creating…', async () => {
          const out = await PDFDocument.create(), size = $('#pSize .on').dataset.v;
          for (const f of imgs) {
            let bytes = await readFile(f), img;
            if (/png$/i.test(f.type)) img = await out.embedPng(bytes);
            else if (/jpe?g$/i.test(f.type)) img = await out.embedJpg(bytes);
            else { // other formats (WebP, GIF, BMP…) go through a canvas
              const bmp = await createImageBitmap(f); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
              c.getContext('2d').drawImage(bmp, 0, 0); const b = await new Promise(r => c.toBlob(r, 'image/png'));
              img = await out.embedPng(new Uint8Array(await b.arrayBuffer()));
            }
            const iw = img.width * .75, ih = img.height * .75;
            if (size === 'fit') { out.addPage([iw, ih]).drawImage(img, { x: 0, y: 0, width: iw, height: ih }); continue; }
            const [pw, ph] = size === 'a4' ? [595.28, 841.89] : [612, 792], m = 36;
            const k = Math.min((pw - 2 * m) / iw, (ph - 2 * m) / ih, 1), w = iw * k, h = ih * k;
            out.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
          }
          const bytes = await out.save();
          result(bytes, `Images (${imgs.length}).pdf`, `${imgs.length} page${imgs.length === 1 ? '' : 's'} · ${fmt(bytes.length)}`);
        });
        draw();
      }
    };
    $('#vMode').onclick = e => { const b = e.target.closest('button'); if (!b) return; $$('#vMode button').forEach(x => x.classList.toggle('on', x === b)); $('.sh-result', panel).innerHTML = ''; views[b.dataset.v](); };
    views.img();
  }

  /* ---------- Watermark ---------- */
  const SW = ['#8E8E93', '#FF3B30', '#0A84FF', '#34C759', '#1C1C1E'];
  function swatchRow(id, cur) { return `<div class="swrow" id="${id}">${SW.map(c => `<button class="sw${c === cur ? ' on' : ''}" style="--c:${c}" data-c="${c}" aria-label="Color ${c}"><i></i></button>`).join('')}</div>`; }
  function bindSw(id) { $(id).onclick = e => { const b = e.target.closest('.sw'); if (b) $$(id + ' .sw').forEach(x => x.classList.toggle('on', x === b)); }; }
  function watermark() {
    panel.innerHTML = header('Watermark', true) + `
      <label class="fld"><span>Text</span><input id="wText" value="CONFIDENTIAL" maxlength="60"></label>
      <div class="sh-grid2">
        <label class="fld"><span>Size <output id="wSizeV">60</output></span><input type="range" id="wSize" min="16" max="140" value="60"></label>
        <label class="fld"><span>Opacity <output id="wOpV">18%</output></span><input type="range" id="wOp" min="5" max="80" value="18"></label>
      </div>
      <div class="sh-grid2">
        <label class="fld"><span>Angle</span><div class="choice" id="wAng"><button data-v="45" class="on">Diagonal</button><button data-v="0">Flat</button></div></label>
        <label class="fld"><span>Color</span>${swatchRow('wCol', SW[0])}</label>
      </div>
      <div class="sh-actions"><button class="txtbtn primary big" id="wGo">Add watermark</button></div><div class="sh-result"></div>`;
    $('#wSize').oninput = e => $('#wSizeV').textContent = e.target.value;
    $('#wOp').oninput = e => $('#wOpV').textContent = e.target.value + '%';
    $('#wAng').onclick = e => { const b = e.target.closest('button'); if (b) $$('#wAng button').forEach(x => x.classList.toggle('on', x === b)); };
    bindSw('#wCol');
    $('#wGo').onclick = e => run(e.target, 'Stamping…', async () => {
      const text = $('#wText').value.trim(); if (!text) throw new Error('Enter some text');
      const d = await loadLib(state.bytes), font = await d.embedFont(StandardFonts.HelveticaBold);
      const size = +$('#wSize').value, opacity = +$('#wOp').value / 100, ang = +$('#wAng .on').dataset.v, color = hexRgb($('#wCol .on').dataset.c);
      const safe = [...text].map(ch => { try { font.encodeText(ch); return ch; } catch { return '?'; } }).join('');
      const tw = font.widthOfTextAtSize(safe, size), th = font.heightAtSize(size) * .7, rad = ang * Math.PI / 180;
      for (const page of d.getPages()) {
        const { width, height } = page.getSize(), box = page.getMediaBox();
        const cx = box.x + width / 2, cy = box.y + height / 2;
        const x = cx - Math.cos(rad) * tw / 2 + Math.sin(rad) * th / 2, y = cy - Math.sin(rad) * tw / 2 - Math.cos(rad) * th / 2;
        page.drawText(safe, { x, y, size, font, color, opacity, rotate: degrees(ang) });
      }
      const bytes = await d.save();
      result(bytes, `${baseName()} (watermarked).pdf`, `${d.getPageCount()} pages · ${fmt(bytes.length)}`);
    });
  }

  /* ---------- Page numbers ---------- */
  function numbers() {
    panel.innerHTML = header('Page numbers', true) + `
      <label class="fld"><span>Position</span><div class="choice" id="nPos"><button data-v="bl">Bottom left</button><button data-v="bc" class="on">Bottom center</button><button data-v="br">Bottom right</button><button data-v="tr">Top right</button></div></label>
      <label class="fld"><span>Format</span><div class="choice" id="nFmt"><button data-v="n" class="on">1</button><button data-v="pn">Page 1</button><button data-v="pnn">Page 1 of 9</button><button data-v="nn">1 / 9</button></div></label>
      <div class="sh-grid2">
        <label class="fld"><span>Start at</span><input type="number" id="nStart" value="1" min="0" max="9999"></label>
        <label class="fld"><span>Size <output id="nSizeV">10</output></span><input type="range" id="nSize" min="7" max="24" value="10"></label>
      </div>
      <label class="chk"><input type="checkbox" id="nSkip"> Skip the first page (cover)</label>
      <div class="sh-actions"><button class="txtbtn primary big" id="nGo">Add page numbers</button></div><div class="sh-result"></div>`;
    ['#nPos', '#nFmt'].forEach(id => $(id).onclick = e => { const b = e.target.closest('button'); if (b) $$(id + ' button').forEach(x => x.classList.toggle('on', x === b)); });
    $('#nSize').oninput = e => $('#nSizeV').textContent = e.target.value;
    $('#nGo').onclick = e => run(e.target, 'Numbering…', async () => {
      const d = await loadLib(state.bytes), font = await d.embedFont(StandardFonts.Helvetica);
      const pos = $('#nPos .on').dataset.v, f = $('#nFmt .on').dataset.v, size = +$('#nSize').value, skip = $('#nSkip').checked;
      const start = Math.max(0, parseInt($('#nStart').value, 10) || 1), pages = d.getPages();
      const total = start + pages.length - (skip ? 2 : 1);
      pages.forEach((page, i) => {
        if (skip && i === 0) return;
        const n = start + i - (skip ? 1 : 0);
        const label = f === 'n' ? `${n}` : f === 'pn' ? `Page ${n}` : f === 'pnn' ? `Page ${n} of ${total}` : `${n} / ${total}`;
        const { width, height } = page.getSize(), box = page.getMediaBox(), w = font.widthOfTextAtSize(label, size), m = 28;
        const x = box.x + (pos === 'bl' ? m : pos === 'bc' ? (width - w) / 2 : width - m - w);
        const y = box.y + (pos === 'tr' ? height - m - size : m);
        page.drawText(label, { x, y, size, font, color: rgb(.25, .25, .28) });
      });
      const bytes = await d.save();
      result(bytes, `${baseName()} (numbered).pdf`, `${pages.length} pages · ${fmt(bytes.length)}`);
    });
  }

  const VIEWS = { merge, split, organize, compress, convert, watermark, numbers };
})();
