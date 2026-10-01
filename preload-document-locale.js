(() => {
  try {
    const storedSettings = window.localStorage.getItem('lolrogue-settings');
    // Keep these bootstrap limits aligned with storagePolicy.ts (contract-tested).
    if (!storedSettings || storedSettings.length > 16 * 1024) return;

    const parsed = JSON.parse(storedSettings);
    const version = parsed?.version === undefined ? 0 : parsed.version;
    if (!Number.isInteger(version) || version < 0 || version > 3) return;
    if (!parsed?.state || typeof parsed.state !== 'object' || Array.isArray(parsed.state)) return;
    const validSetting = (key, choices) =>
      parsed.state[key] === undefined || choices.includes(parsed.state[key]);
    if (
      !validSetting('language', ['fr-FR', 'en-US']) ||
      !validSetting('textSize', ['small', 'medium', 'large']) ||
      !validSetting('battleSpeed', [1, 2, 3]) ||
      !validSetting('difficulty', ['easy', 'normal', 'hard']) ||
      !validSetting('particlesEnabled', [true, false]) ||
      !validSetting('keyboardShortcutsEnabled', [true, false])
    )
      return;
    const pending = [{ value: parsed, depth: 0 }];
    let nodes = 0;
    while (pending.length) {
      const { value, depth } = pending.pop();
      nodes += 1;
      if (depth > 48 || nodes > 150_000) return;
      if (typeof value === 'number' && !Number.isFinite(value)) return;
      if (value === null || typeof value !== 'object') continue;
      if (Array.isArray(value) && value.length > 20_000) return;
      for (const [key, child] of Object.entries(value)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') return;
        pending.push({ value: child, depth: depth + 1 });
      }
    }
    if (parsed?.state?.language !== 'en-US') return;

    const preloadScript = document.querySelector('script[data-document-locale-preload]');
    if (!preloadScript) return;

    const setMetaContent = (selector, content) => {
      if (content) document.head.querySelector(selector)?.setAttribute('content', content);
    };
    const { description, htmlLanguage, imageAlt, openGraphLocale, socialDescription, title } =
      preloadScript.dataset;

    if (htmlLanguage) document.documentElement.lang = htmlLanguage;
    if (title) document.title = title;
    setMetaContent('meta[name="description"]', description);
    setMetaContent('meta[property="og:locale"]', openGraphLocale);
    setMetaContent('meta[property="og:title"]', title);
    setMetaContent('meta[property="og:description"]', socialDescription);
    setMetaContent('meta[property="og:image:alt"]', imageAlt);
    setMetaContent('meta[name="twitter:title"]', title);
    setMetaContent('meta[name="twitter:description"]', socialDescription);
    setMetaContent('meta[name="twitter:image:alt"]', imageAlt);
  } catch {
    // Keep the complete French fallback when storage is unavailable or invalid.
  }
})();
