// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteAccessibility } from '@/App';
import { documentContent } from '@/i18n/documentContent';
import { useSettingsStore } from '@/stores/settingsStore';

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

function expectDocumentContent(locale: 'fr-FR' | 'en-US', routeTitle: string): void {
  const copy = documentContent[locale];
  const pageTitle = `${routeTitle} — LoL Rogue`;

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
  });

  it('synchronizes the HTML language and every SEO/social field when the locale changes', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <RouteAccessibility />
      </MemoryRouter>,
    );

    expectDocumentContent('fr-FR', 'Réglages');

    act(() => useSettingsStore.getState().setLanguage('en-US'));

    expectDocumentContent('en-US', 'Settings');
  });

  it('ships complete French fallback metadata before the application starts', () => {
    const source = readFileSync('index.html', 'utf8');
    const fallbackDocument = new DOMParser().parseFromString(source, 'text/html');
    const copy = documentContent['fr-FR'];
    const fallbackMeta = (selector: string) =>
      fallbackDocument.head.querySelector<HTMLMetaElement>(selector)?.content;

    expect(fallbackDocument.documentElement.getAttribute('lang')).toBe(copy.htmlLanguage);
    expect(fallbackMeta('meta[name="description"]')).toBe(copy.description);
    expect(fallbackMeta('meta[property="og:locale"]')).toBe(copy.openGraphLocale);
    expect(fallbackMeta('meta[property="og:description"]')).toBe(copy.socialDescription);
    expect(fallbackMeta('meta[property="og:image:alt"]')).toBe(copy.imageAlt);
    expect(fallbackMeta('meta[name="twitter:description"]')).toBe(copy.socialDescription);
    expect(fallbackMeta('meta[name="twitter:image:alt"]')).toBe(copy.imageAlt);
  });
});
