// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

function setStoredLocale(locale: 'fr-FR' | 'en-US'): void {
  window.localStorage.setItem('lolrogue-settings', JSON.stringify({ state: { language: locale } }));
}

afterEach(() => {
  window.localStorage.clear();
  vi.resetModules();
});

describe('localized presentation boundaries', () => {
  it.each([
    {
      locale: 'fr-FR' as const,
      goldError: "Pas assez d'or",
      commandError: "L'action n'a pas été confirmée. Rien n'a été dépensé.",
      adminError: 'La requête d’administration a échoué.',
    },
    {
      locale: 'en-US' as const,
      goldError: 'Not enough gold',
      commandError: 'The action was not confirmed. Nothing was spent.',
      adminError: 'The admin request failed.',
    },
  ])('localizes stable boundary errors in $locale', async (expected) => {
    setStoredLocale(expected.locale);
    vi.resetModules();

    const [{ localizeShopMutationError }, adminErrors] = await Promise.all([
      import('@/i18n/runMutationContent'),
      import('@/i18n/adminErrorContent'),
    ]);

    expect(localizeShopMutationError('insufficient_gold')).toBe(expected.goldError);
    expect(localizeShopMutationError('command_rejected')).toBe(expected.commandError);
    expect(adminErrors.localizeAdminRequestError('request_failed')).toBe(expected.adminError);
  });

  it('never connects raw store or PostgREST prose to presentation state', () => {
    const shopSource = readFileSync('src/pages/ShopPage.tsx', 'utf8');
    const adminSource = readFileSync('src/pages/admin/useAdminData.ts', 'utf8');

    expect(shopSource).not.toMatch(/setCommandError\(result\.error/u);
    expect(shopSource.match(/localizeShopMutationError\(result\.code\)/gu)).toHaveLength(2);
    expect(adminSource).not.toMatch(/error\.message|error instanceof Error/u);
    expect(adminSource).not.toMatch(/setSectionError\([^\n]+\.message/u);
  });
});
