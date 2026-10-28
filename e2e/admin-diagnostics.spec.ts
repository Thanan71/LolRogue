import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import type {
  DiagnosticsRequest,
  DiagnosticsSection,
} from '../src/features/administration/domain/diagnostics/adminDiagnosticsTypes';
import { validateDiagnosticsFilters } from '../src/features/administration/domain/diagnostics/adminDiagnosticsValidation';
import {
  DIAGNOSTICS_TEST_SNAPSHOT,
  DIAGNOSTICS_TEST_UUID,
  diagnosticsAggregate,
  diagnosticsAttempt,
  diagnosticsLog,
  diagnosticsResponse,
} from '../tests/helpers/adminDiagnosticsUiFixtures';
import { enterAdminExplorer } from './helpers/admin-explorer';

// Controlled responses prove browser interactions; the connected gate proves real Auth/PostgreSQL.
async function diagnosticsBackend(page: Page) {
  // Keep rolling date filters aligned with the fixed diagnostics snapshot.
  await page.clock.setFixedTime(new Date(DIAGNOSTICS_TEST_SNAPSHOT));
  const logs = Array.from({ length: 101 }, (_, index) =>
    diagnosticsLog({
      id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      method: index === 0 ? 'oldestLog' : 'sealRunAttempt',
    }),
  ).reverse();
  const api = {
    logs,
    reads: [] as Record<string, unknown>[],
    failLogs: false,
    deny: false,
  };
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    if (name !== 'admin_diagnostics') {
      if (name?.startsWith('admin_search_'))
        await route.fulfill({
          json: {
            items: [],
            total: 0,
            hasMore: false,
            nextCursor: null,
            snapshotAt: '2026-10-18T12:15:30.123456Z',
          },
        });
      else
        await route.fulfill({
          json: [],
          headers: {
            'access-control-expose-headers': 'content-range',
            'content-range': '*/0',
          },
        });
      return;
    }
    const input = route.request().postDataJSON() as Record<string, unknown>;
    api.reads.push(input);
    if (api.deny) {
      await route.fulfill({
        status: 403,
        json: { code: '42501', message: 'permission denied' },
      });
      return;
    }
    const section = input.p_section as DiagnosticsSection;
    function request<S extends DiagnosticsSection>(value: S): DiagnosticsRequest<S> {
      return {
        section: value,
        filters: validateDiagnosticsFilters(value, input.p_filters),
        cursor: input.p_cursor as DiagnosticsRequest<S>['cursor'],
        snapshotAt: input.p_snapshot as string | null,
        limit: Number(input.p_limit),
      };
    }
    if (section === 'logs') {
      if (api.failLogs) {
        await route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'fixture failure' },
        });
        return;
      }
      const req = request('logs');
      const filtered = logs.filter(
        (row) =>
          (!req.filters.level || row.level === req.filters.level) &&
          (!req.filters.operation || row.operation === req.filters.operation) &&
          (!req.filters.correlationId || row.correlationId === req.filters.correlationId) &&
          (!req.filters.attemptId || row.attemptId === req.filters.attemptId) &&
          row.createdAt.slice(0, 10) >= req.filters.from &&
          row.createdAt.slice(0, 10) <= req.filters.to,
      );
      const start = req.cursor ? filtered.findIndex((row) => row.id === req.cursor?.id) + 1 : 0;
      const rows = filtered.slice(start, start + 25);
      const last = rows[rows.length - 1];
      await route.fulfill({
        json: diagnosticsResponse(req, {
          rows,
          total: filtered.length,
          nextCursor:
            last && start + rows.length < filtered.length
              ? { at: last.createdAt, id: last.id }
              : null,
        }),
      });
      return;
    }
    if (section === 'authority') {
      const req = request('authority');
      const row = diagnosticsAttempt();
      const rows =
        (!req.filters.status || row.status === req.filters.status) &&
        (!req.filters.rejectionCode || row.rejectionCode === req.filters.rejectionCode) &&
        (!req.filters.engineVersion || row.engineVersion === req.filters.engineVersion) &&
        (!req.filters.gameplayRulesetVersion ||
          row.gameplayRulesetVersion === req.filters.gameplayRulesetVersion)
          ? [row]
          : [];
      const result = diagnosticsResponse(req, {
        rows,
        total: rows.length,
        counts: {
          started: 0,
          finished: 0,
          verified: 0,
          rejected: rows.length,
          expired: 0,
        },
      });
      result.data.alerts = {
        from: '2026-10-18T12:00:00Z',
        to: '2026-10-18T12:15:00Z',
        totalGroups: 1,
        complete: true,
        aggregates: [diagnosticsAggregate()],
      };
      await route.fulfill({ json: result });
      return;
    }
    if (section === 'service') {
      await route.fulfill({ json: diagnosticsResponse(request('service')) });
      return;
    }
    await route.fulfill({
      json: diagnosticsResponse(request('correlation'), {
        attempt: diagnosticsAttempt(),
        logs: {
          rows: [diagnosticsLog()],
          total: 1,
          nextCursor: null,
          retentionDays: 14,
        },
      }),
    });
  });
  return api;
}
async function openLogs(page: Page, language: 'fr-FR' | 'en-US' = 'fr-FR') {
  await enterAdminExplorer(page, language);
  await page.getByRole('tab', { name: /Monitoring|Surveillance/ }).click();
  await page.getByRole('tab', { name: /Logs|Journaux/ }).click();
  const panel = page.locator('#admin-panel-logs');
  await expect(panel.getByRole('table').first()).toBeVisible();
  return panel;
}

test('diagnostics : pagination serveur complète, corrélation et filtres UTC exacts', async ({
  page,
}) => {
  const api = await diagnosticsBackend(page);
  const panel = await openLogs(page);
  await expect(panel.getByText(/Total serveur correspondant aux filtres: 101/)).toBeVisible();
  for (let index = 0; index < 4; index++)
    await panel.getByRole('button', { name: 'Page suivante', exact: true }).click();
  await expect(panel.getByRole('table')).toContainText('oldestLog');
  expect(api.reads.filter((read) => read.p_section === 'logs')).toHaveLength(5);
  await panel.getByRole('button', { name: 'Diagnostiquer cette tentative' }).click();
  await expect(
    panel.getByRole('heading', {
      name: 'Corrélation d’une tentative',
      level: 2,
    }),
  ).toBeFocused();
  await expect(panel.getByText('Journal client facultatif, couverture partielle')).toBeVisible();
  await panel.getByRole('button', { name: 'Fermer le diagnostic' }).click();
  await panel
    .getByLabel('Identifiant exact de corrélation')
    .fill('00000000-0000-4000-8000-000000000001');
  await panel.getByLabel('Depuis le (UTC, inclus)').fill('2026-10-18');
  await panel.getByLabel('Jusqu’au (UTC, inclus)').fill('2026-10-18');
  await panel.getByRole('button', { name: 'Appliquer les filtres' }).click();
  await expect.poll(() => api.reads.filter((read) => read.p_section === 'logs').length).toBe(6);
  expect(api.reads.filter((read) => read.p_section === 'logs').at(-1)?.p_filters).toMatchObject({
    from: '2026-10-18',
    to: '2026-10-18',
    correlationId: '00000000-0000-4000-8000-000000000001',
  });
  await page.getByRole('tab', { name: /Authority|Autorité/ }).click();
  await expect(page.locator('#admin-panel-authority')).toContainText('Vérification et incidents');
  await page.getByRole('tab', { name: /Logs|Journaux/ }).click();
  await expect(page.getByLabel('Identifiant exact de corrélation')).toHaveValue(
    '00000000-0000-4000-8000-000000000001',
  );
});

test('diagnostics : erreur indépendante, données périmées puis réessai', async ({ page }) => {
  const api = await diagnosticsBackend(page);
  const panel = await openLogs(page);
  api.failLogs = true;
  await panel.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Lecture indisponible');
  await expect(panel.getByRole('button', { name: 'Page suivante' })).toBeDisabled();
  await expect(panel.getByRole('table')).toBeVisible();
  api.failLogs = false;
  await panel.getByRole('button', { name: 'Réessayer la lecture' }).click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Page suivante' })).toBeEnabled();
  await page.getByRole('tab', { name: /Authority|Autorité/ }).click();
  const authority = page.locator('#admin-panel-authority');
  await expect(authority.getByText('Investigation à ouvrir')).toBeVisible();
  await page.getByRole('tab', { name: /État du service/ }).click();
  const service = page.locator('#admin-panel-service');
  await expect(service.getByText('Non instrumenté')).toHaveCount(3);
  await expect(service.getByText('Aucun signal instrumenté pour cette période.')).toBeVisible();
});

test('diagnostics EN 320px : clavier, régions défilantes et accessibilité', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await diagnosticsBackend(page);
  const panel = await openLogs(page, 'en-US');
  await expect(panel.getByText('Off', { exact: true })).toBeVisible();
  await panel.getByRole('region', { name: 'Technical logs, horizontal scroll' }).focus();
  await expect(
    panel.getByRole('region', { name: 'Technical logs, horizontal scroll' }),
  ).toBeFocused();
  await page.getByRole('tab', { name: /Logs|Journaux/ }).focus();
  await page.keyboard.press('ArrowRight');
  const authority = page.locator('#admin-panel-authority');
  await expect(authority.getByText('Verification and incidents')).toBeVisible();
  await expect(page.getByRole('tab', { name: /Authority|Autorité/ })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  const audit = await new AxeBuilder({ page }).include('#admin-panel-authority').analyze();
  expect(audit.violations).toEqual([]);
  if (process.env.E2E_CAPTURE_UI === '1')
    await page.screenshot({
      path: '/tmp/lolrogue-adm-s6-mobile-diagnostics.png',
      fullPage: true,
      animations: 'disabled',
    });
});

test('diagnostics : retrait des droits purge journaux, tentative et corrélations', async ({
  page,
}) => {
  const api = await diagnosticsBackend(page);
  const panel = await openLogs(page);
  await panel.getByRole('button', { name: 'Diagnostiquer cette tentative' }).first().click();
  await expect(
    panel.getByRole('heading', {
      name: 'Corrélation d’une tentative',
      level: 2,
    }),
  ).toBeVisible();
  api.deny = true;
  await panel.getByRole('button', { name: 'Actualiser', exact: true }).first().click();
  await expect(panel.getByRole('alert')).toContainText('Accès refusé');
  await expect(panel.getByRole('table')).toHaveCount(0);
  await expect(panel.getByText(DIAGNOSTICS_TEST_UUID, { exact: true })).toHaveCount(0);
});
