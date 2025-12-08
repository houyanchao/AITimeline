(() => {
  const hasWindow = typeof window !== 'undefined';
  if (!hasWindow) return;

  const hasBrowser = typeof window.browser !== 'undefined';
  const hasChrome = typeof window.chrome !== 'undefined';
  const base = hasBrowser ? window.browser : hasChrome ? window.chrome : null;
  if (!base) return;

  const wrapArea = (area) => {
    if (!area) return undefined;
    return {
      get(keys, cb) {
        const p = area.get(keys);
        if (typeof cb === 'function') p.then((res) => cb(res));
        return p;
      },
      set(items, cb) {
        const p = area.set(items);
        if (typeof cb === 'function') p.then(() => cb());
        return p;
      },
      remove(keys, cb) {
        const p = area.remove(keys);
        if (typeof cb === 'function') p.then(() => cb());
        return p;
      },
      clear(cb) {
        const p = area.clear();
        if (typeof cb === 'function') p.then(() => cb());
        return p;
      },
    };
  };

  // If only browser exists (Firefox), create a chrome-like surface with callback compatibility.
  if (hasBrowser && !hasChrome) {
    const storageSync = base.storage?.sync || base.storage?.local;
    window.chrome = {
      runtime: base.runtime,
      i18n: base.i18n,
      storage: {
        local: wrapArea(base.storage?.local),
        sync: wrapArea(storageSync),
        onChanged: base.storage?.onChanged,
      },
    };
  }

  // If only chrome exists, expose it as browser for code that prefers `browser`.
  if (!hasBrowser && hasChrome) {
    window.browser = window.chrome;
  }
})();

