(() => {
  try {
    const storedSettings = window.localStorage.getItem('lolrogue-settings');
    if (!storedSettings) return;

    const parsed = JSON.parse(storedSettings);
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
