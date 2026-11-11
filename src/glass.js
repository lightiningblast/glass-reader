// Liquid Glass engine.
// Every .glass element gets its own SVG filter used as a backdrop-filter:
//  - a lens-shaped displacement map bends what is behind the element near its edges (refraction),
//  - red, green and blue are displaced by slightly different amounts (dispersion, the rainbow fringe),
//  - a light-reactive rim (CSS, driven by --la / --li) brightens the edge facing the pointer.
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
  const defs = document.createElementNS(NS, 'defs');
  svg.append(defs);
  document.body.append(svg);

  const items = new Map();
  const mapCache = new Map();
  let uid = 0;
  let quality = 'high'; // 'high' | 'balanced' | 'off'
  // Chromium (Electron) supports SVG filters in backdrop-filter; other browsers fall back to CSS blur.
  const supported = /Chrome\//.test(navigator.userAgent) && CSS.supports('backdrop-filter', 'url(#a)');

  /* Displacement map for a rounded rectangle: zero in the flat middle, rising to full strength
     at the rim, pointing inward so the edge shows content pulled from inside (a convex lens). */
  function makeMap(w, h, r, bezel) {
    const key = `${w}x${h}r${r}b${bezel}`;
    if (mapCache.has(key)) return mapCache.get(key);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h), d = img.data;
    const hw = w / 2, hh = h / 2; r = Math.min(r, hw, hh);
    for (let y = 0, i = 0; y < h; y++) {
      const py = y + .5 - hh, ay = Math.abs(py), sy = py < 0 ? -1 : 1;
      for (let x = 0; x < w; x++, i += 4) {
        const px = x + .5 - hw, ax = Math.abs(px), sx = px < 0 ? -1 : 1;
        const qx = ax - (hw - r), qy = ay - (hh - r);
        let dist, nx, ny;
        if (qx > 0 && qy > 0) { const L = Math.hypot(qx, qy) || 1; dist = r - L; nx = qx / L; ny = qy / L; }
        else if (qx > qy) { dist = r - qx; nx = 1; ny = 0; }
        else { dist = r - qy; nx = 0; ny = 1; }
        const t = Math.max(0, Math.min(1, dist / bezel));
        const mag = Math.pow(1 - t, 2.4) * (1 - t * .15);
        d[i] = 128 - sx * nx * mag * 127;
        d[i + 1] = 128 - sy * ny * mag * 127;
        d[i + 2] = 128; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const url = c.toDataURL();
    if (mapCache.size > 60) mapCache.delete(mapCache.keys().next().value);
    mapCache.set(key, url);
    return url;
  }

  function filterMarkup(it, url) {
    const { w, h } = it;
    const big = w * h > 150000;
    const chroma = false; // color splitting smeared text behind the glass; kept off
    const s = it.strength, blur = it.blur;
    const img = `<feImage href="${url}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>`;
    const base = `<feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" result="soft"/>`;
    const disp = (sc, res) => `<feDisplacementMap in="soft" in2="map" scale="${sc}" xChannelSelector="R" yChannelSelector="G" result="${res}"/>`;
    const body = chroma
      ? disp(s, 'dr') + `<feColorMatrix in="dr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>` +
        disp(s * .93, 'dg') + `<feColorMatrix in="dg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"/>` +
        disp(s * .86, 'db') + `<feColorMatrix in="db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/>` +
        `<feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen" result="lens"/>`
      : disp(s, 'lens');
    return img + base + body + `<feColorMatrix in="lens" type="saturate" values="${it.saturate}"/>`;
  }

  function build(it) {
    const r = it.el.getBoundingClientRect();
    const w = Math.max(2, Math.round(r.width)), h = Math.max(2, Math.round(r.height));
    if (!w || !h) return;
    const cs = getComputedStyle(it.el);
    const radius = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, w / 2, h / 2);
    it.w = w; it.h = h;
    const bezel = Math.max(5, Math.min(it.bezel || 9, radius || 9, Math.min(w, h) * .22));
    const url = makeMap(w, h, Math.round(radius), Math.round(bezel));
    let f = it.filter;
    if (!f) {
      f = document.createElementNS(NS, 'filter'); f.id = it.id;
      f.setAttribute('filterUnits', 'userSpaceOnUse'); f.setAttribute('primitiveUnits', 'userSpaceOnUse');
      f.setAttribute('color-interpolation-filters', 'sRGB'); f.setAttribute('x', '0'); f.setAttribute('y', '0');
      defs.append(f); it.filter = f;
    }
    f.setAttribute('width', w); f.setAttribute('height', h);
    f.innerHTML = filterMarkup(it, url);
    apply(it);
  }

  function apply(it) {
    if (!supported || quality === 'off') { it.el.style.backdropFilter = ''; it.el.classList.remove('lg-live'); return; }
    it.el.style.backdropFilter = `url(#${it.id})`;
    it.el.classList.add('lg-live');
  }

  // Rebuild on resize: stretch the current map at once, regenerate it once the size settles.
  const pending = new Set(); let raf = 0;
  const ro = new ResizeObserver(entries => {
    for (const e of entries) { const it = items.get(e.target); if (it) pending.add(it); }
    if (!raf) raf = requestAnimationFrame(flush);
  });
  function flush() {
    raf = 0;
    for (const it of pending) {
      if (it.filter) {
        const r = it.el.getBoundingClientRect();
        it.filter.setAttribute('width', Math.round(r.width)); it.filter.setAttribute('height', Math.round(r.height));
        const im = it.filter.firstElementChild; if (im) { im.setAttribute('width', Math.round(r.width)); im.setAttribute('height', Math.round(r.height)); }
      }
      clearTimeout(it.t); it.t = setTimeout(() => build(it), 90);
    }
    pending.clear();
  }

  function attach(el) {
    if (items.has(el) || !el.isConnected) return;
    const ds = el.dataset;
    const it = {
      el, id: 'lg' + (++uid),
      strength: Math.min(+ds.lgStrength || 14, 14), bezel: +ds.lgBezel || 9,
      blur: ds.lgBlur != null ? +ds.lgBlur : 8, saturate: +ds.lgSaturate || 1.6
    };
    items.set(el, it);
    ro.observe(el);
    build(it);
  }
  function scan(root = document) {
    if (root.classList && root.classList.contains('glass')) attach(root);
    root.querySelectorAll && root.querySelectorAll('.glass').forEach(attach);
  }
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n); })
    .observe(document.body, { childList: true, subtree: true });


  window.LiquidGlass = {
    get supported() { return supported; },
    get quality() { return quality; },
    setQuality(q) {
      quality = q;
      document.documentElement.dataset.glass = supported ? q : 'off';
      for (const it of items.values()) build(it);
    },
    refresh(el) { const it = items.get(el); if (it) build(it); },
    attach, scan
  };
  document.documentElement.dataset.glass = supported ? quality : 'off';
  scan();
})();
