// @vitest-environment jsdom

import { readdirSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { en } from '@/i18n/en';
import { fr } from '@/i18n/fr';
import {
  formatAdminCount,
  formatAdminDate,
  formatAdminDay,
  formatAdminNumber,
  formatAdminPercent,
} from '@/pages/adminPageUtils';
import { scanUserCopyFile } from './helpers/userCopyScanner';

const ADMIN_PAGE_FILES = [
  'src/pages/AdminPage.tsx',
  ...readdirSync('src/pages/admin')
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => `src/pages/admin/${file}`),
].sort();

function catalogPaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    catalogPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('admin i18n contract', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.resetModules();
  });

  it('keeps every admin catalog key in strict French and English parity', () => {
    expect(catalogPaths(fr.admin).sort()).toEqual(catalogPaths(en.admin).sort());
    expect(en.admin.sectionsLabel).toBe('Admin sections');
    expect(en.admin.invalidateScore).toBe('Invalidate score');
  });

  it('contains no raw user copy in the admin page components', () => {
    const findings = ADMIN_PAGE_FILES.flatMap((file) => scanUserCopyFile(file));
    expect(findings, JSON.stringify(findings, null, 2)).toEqual([]);
  });

  it('formats admin dates, numbers, percentages and plurals with the selected locale', () => {
    expect(formatAdminNumber(12_345.6, {}, 'fr-FR')).toBe('12 345,6');
    expect(formatAdminNumber(12_345.6, {}, 'en-US')).toBe('12,345.6');
    expect(formatAdminPercent(0.125, 'fr-FR')).toMatch(/^12,5\s%$/u);
    expect(formatAdminPercent(0.125, 'en-US')).toBe('12.5%');
    expect(formatAdminDay('2026-08-09', 'fr-FR')).toBe('09/08/2026');
    expect(formatAdminDay('2026-08-09', 'en-US')).toBe('08/09/2026');
    expect(formatAdminDate('2026-08-09T12:10:00.000Z', 'fr-FR')).not.toBe(
      formatAdminDate('2026-08-09T12:10:00.000Z', 'en-US'),
    );
    expect(formatAdminCount(1, en.admin.displayedRun, en.admin.displayedRuns, 'en-US')).toBe(
      '1 run shown',
    );
    expect(formatAdminCount(2, en.admin.displayedRun, en.admin.displayedRuns, 'en-US')).toBe(
      '2 runs shown',
    );
  });

  it('renders admin feedback from the active English catalog', async () => {
    window.localStorage.setItem(
      'lolrogue-settings',
      JSON.stringify({ state: { language: 'en-US' } }),
    );
    vi.resetModules();
    const { AdminErrorNotice } = await import('@/pages/admin/AdminErrorNotice');

    render(
      createElement(AdminErrorNotice, {
        message: 'Request unavailable',
        onRetry: vi.fn(),
        retrying: false,
      }),
    );

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
