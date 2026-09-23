// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteAccessibility } from '@/App';
import { documentContent } from '@/i18n/documentContent';
import { useSettingsStore } from '@/stores/settingsStore';

const INDEX_SOURCE = readFileSync('index.html', 'utf8');
const PRELOAD_SOURCE = readFileSync('preload-document-locale.js', 'utf8');

const META_MARKUP = `
  <meta name="description" content="" />
  <meta property="og:locale" content="" />
  <meta property="og:title" content="" />
  <meta property="og:description" content="" />
  <meta property="og:image:alt" content="" />
  <meta name="twitter:title" content="" />
  <meta name="twitter:description" content="" />
  <meta name="twitter:image:alt" content="" />
`;

function metaContent(selector: string): string | null | undefined {
  return document.head.querySelector<HTMLMetaElement>(selector)?.content;
}

function loadStaticFallback(): void {
  const fallbackDocument = new DOMParser().parseFromString(INDEX_SOURCE, 'text/html');
  document.documentElement.lang = fallbackDocument.documentElement.lang;
  document.head.innerHTML = fallbackDocument.head.innerHTML;
}

function runDocumentLocalePreload(): void {
  window.Function(PRELOAD_SOURCE)();
}

function expectDocumentContent(locale: 'fr-FR' | 'en-US', pageTitle: string): void {
  const copy = documentContent[locale];

  expect(document.documentElement).toHaveAttribute('lang', copy.htmlLanguage);
  expect(document.title).toBe(pageTitle);
  expect(metaContent('meta[name="description"]')).toBe(copy.description);
  expect(metaContent('meta[property="og:locale"]')).toBe(copy.openGraphLocale);
  expect(metaContent('meta[property="og:title"]')).toBe(pageTitle);
  expect(metaContent('meta[property="og:description"]')).toBe(copy.socialDescription);
  expect(metaContent('meta[property="og:image:alt"]')).toBe(copy.imageAlt);
  expect(metaContent('meta[name="twitter:title"]')).toBe(pageTitle);
  expect(metaContent('meta[name="twitter:description"]')).toBe(copy.socialDescription);
  expect(metaContent('meta[name="twitter:image:alt"]')).toBe(copy.imageAlt);
}

describe('document locale metadata', () => {
  beforeEach(() => {
    document.head.innerHTML = META_MARKUP;
    useSettingsStore.setState({ language: 'fr-FR' });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    useSettingsStore.setState({ language: 'fr-FR' });
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('synchronizes the HTML language and every SEO/social field when the locale changes', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <RouteAccessibility />
      </MemoryRouter>,
    );

    expectDocumentContent('fr-FR', 'Réglages — LoL Rogue');

    act(() => useSettingsStore.getState().setLanguage('en-US'));

    expectDocumentContent('en-US', 'Settings — LoL Rogue');
  });

  it('applies the persisted English locale before the React application starts', () => {
    loadStaticFallback();
    window.localStorage.setItem(
      'lolrogue-settings',
      JSON.stringify({ state: { language: 'en-US' } }),
    );

    runDocumentLocalePreload();

    expectDocumentContent('en-US', 'LoL Rogue');
  });

  it.each([
    ['missing settings', null],
    ['malformed settings', '{not-json'],
    ['unsupported locale', JSON.stringify({ state: { language: 'de-DE' } })],
  ])('keeps the French fallback for %s during document preload', (_case, storedSettings) => {
    loadStaticFallback();
    if (storedSettings) window.localStorage.setItem('lolrogue-settings', storedSettings);

    runDocumentLocalePreload();

    expectDocumentContent('fr-FR', 'LoL Rogue');
  });

  it('keeps the French fallback when the browser blocks localStorage access', () => {
    loadStaticFallback();
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    runDocumentLocalePreload();

    expectDocumentContent('fr-FR', 'LoL Rogue');
  });

  it('ships complete French fallback metadata and an external locale preload before React', () => {
    const fallbackDocument = new DOMParser().parseFromString(INDEX_SOURCE, 'text/html');
    const copy = documentContent['fr-FR'];
    const englishCopy = documentContent['en-US'];
    const fallbackMeta = (selector: string) =>
      fallbackDocument.head.querySelector<HTMLMetaElement>(selector)?.content;

    expect(fallbackDocument.documentElement.getAttribute('lang')).toBe(copy.htmlLanguage);
    expect(fallbackMeta('meta[name="description"]')).toBe(copy.description);
    expect(fallbackMeta('meta[property="og:locale"]')).toBe(copy.openGraphLocale);
    expect(fallbackMeta('meta[property="og:description"]')).toBe(copy.socialDescription);
    expect(fallbackMeta('meta[property="og:image:alt"]')).toBe(copy.imageAlt);
    expect(fallbackMeta('meta[name="twitter:description"]')).toBe(copy.socialDescription);
    expect(fallbackMeta('meta[name="twitter:image:alt"]')).toBe(copy.imageAlt);

    const preloadScript = fallbackDocument.querySelector<HTMLScriptElement>(
      'head script[src="/preload-document-locale.js"][data-document-locale-preload]',
    );
    const applicationScript = fallbackDocument.querySelector<HTMLScriptElement>(
      'body script[src="/src/main.tsx"]',
    );
    expect(preloadScript?.hasAttribute('async')).toBe(false);
    expect(preloadScript?.hasAttribute('defer')).toBe(false);
    expect(preloadScript?.hasAttribute('type')).toBe(false);
    expect(preloadScript?.hasAttribute('vite-ignore')).toBe(true);
    expect(preloadScript?.textContent).toBe('');
    expect(preloadScript?.dataset.htmlLanguage).toBe(englishCopy.htmlLanguage);
    expect(preloadScript?.dataset.openGraphLocale).toBe(englishCopy.openGraphLocale);
    expect(preloadScript?.dataset.title).toBe('LoL Rogue');
    expect(preloadScript?.dataset.description).toBe(englishCopy.description);
    expect(preloadScript?.dataset.socialDescription).toBe(englishCopy.socialDescription);
    expect(preloadScript?.dataset.imageAlt).toBe(englishCopy.imageAlt);
    expect(applicationScript).not.toBeNull();
    expect(preloadScript?.compareDocumentPosition(applicationScript as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(fallbackDocument.querySelectorAll('script:not([src])')).toHaveLength(0);
  });
});
