import { describe, expect, it } from 'vitest';
import { ROUTE_TITLE_PATHS, routeTitle } from '@/i18n/routeTitles';

describe('route titles', () => {
  it('covers every routed page in both locales without a cross-locale fallback', () => {
    expect(ROUTE_TITLE_PATHS.length).toBeGreaterThan(0);

    for (const pathname of ROUTE_TITLE_PATHS) {
      expect(routeTitle('fr-FR', pathname)).not.toBe('Page introuvable');
      expect(routeTitle('en-US', pathname)).not.toBe('Page not found');
    }
  });

  it('uses a locale-specific title for unknown routes', () => {
    expect(routeTitle('fr-FR', '/unknown')).toBe('Page introuvable');
    expect(routeTitle('en-US', '/unknown')).toBe('Page not found');
  });
});
