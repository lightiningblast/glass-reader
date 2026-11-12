// The split view's right pane is an iframe, and Electron doesn't inject the app bridge
// (window.desktop) into iframes. The right pane borrows the window's bridge instead, with
// the few calls that must target this pane (not the window's left pane) redirected.
(() => {
  if (window.desktop || window === parent) return;
  let pd;
  try { pd = parent.desktop; } catch { return; }
  if (!pd) return;
  const d = {};
  for (const k of Object.keys(pd)) d[k] = pd[k];
  const noop = () => {};
  Object.assign(d, {
    // These events belong to the window's left pane; listening here would handle them twice.
    initialFile: () => Promise.resolve(null),
    onOpenFile: noop, onUpdateStatus: noop, onGiveTab: noop, onTakeTab: noop,
    // Files chosen here open here.
    openDialog: async () => {
      const files = await pd.pickFiles();
      for (const f of files || []) window.GR.openPdf(new Uint8Array(f.data), f.name, null, { path: f.path });
    },
    // A tab dropped here from another window: the left pane fetches it and passes it on.
    pullTab: src => parent.postMessage({ type: 'gr-pull-for-right', src }, '*')
  });
  window.desktop = d;
})();
