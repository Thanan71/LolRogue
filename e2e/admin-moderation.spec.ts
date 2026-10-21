import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import type {
  ModerationDecisionRequest,
  ModerationQueueRow,
  ModerationStatus,
} from '../src/features/administration/domain/moderation/moderationTypes';
import {
  moderationFixtureIds,
  moderationHistoryFixture,
  moderationQueueFixture,
  moderationQueueRowFixture,
  moderationReceiptFixture,
} from '../tests/helpers/adminModerationFixtures';
import { enterAdminExplorer } from './helpers/admin-explorer';

// Controlled UI responses supplement the real Auth/PostgreSQL connected gate.
async function moderationBackend(page: Page) {
  const rows: ModerationQueueRow[] = Array.from({ length: 101 }, (_, index) =>
    moderationQueueRowFixture({
      reportId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      createdAt: new Date(Date.UTC(2020, 0, 2, 12, 0, index)).toISOString(),
      reason: `Ancien dossier ${index + 1}, à examiner sans limite de date implicite.`,
      reportsForScore: 101,
    }),
  );
  const api = {
    rows,
    reads: [] as Record<string, unknown>[],
    requests: [] as ModerationDecisionRequest[],
    failQueue: false,
    loseDecisionResponse: false,
    denyDecision: false,
    applied: false,
  };
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    if (name === 'admin_moderation_queue') {
      const input = route.request().postDataJSON() as Record<string, unknown>;
      api.reads.push(input);
      if (api.failQueue) {
        await route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'Fixture read failure' },
        });
        return;
      }
      const status = input.p_status as ModerationStatus;
      const from = input.p_from as string | null;
      const to = input.p_to as string | null;
      const target = input.p_daily_run_id as string | null;
      const filtered = rows.filter(
        (row) =>
          (!from || row.createdAt.slice(0, 10) >= from) &&
          (!to || row.createdAt.slice(0, 10) <= to) &&
          (!target || row.dailyRunId === target),
      );
      const matching = filtered.filter((row) => row.status === status);
      const cursor = input.p_cursor as { createdAt: string; id: string } | null;
      const offset = cursor ? matching.findIndex((row) => row.reportId === cursor.id) + 1 : 0;
      const limit = Number(input.p_limit);
      const pageRows = matching.slice(offset, offset + limit);
      const last = pageRows.at(-1);
      await route.fulfill({
        json: moderationQueueFixture({
          status,
          rows: pageRows,
          total: matching.length,
          counts: {
            open: filtered.filter((row) => row.status === 'open').length,
            resolved: filtered.filter((row) => row.status === 'resolved').length,
            dismissed: filtered.filter((row) => row.status === 'dismissed').length,
          },
          nextCursor:
            last && offset + pageRows.length < matching.length
              ? { createdAt: last.createdAt, id: last.reportId }
              : null,
        }),
      });
      return;
    }
    if (name === 'admin_moderation_history') {
      await route.fulfill({
        json: moderationHistoryFixture({ rows: [], total: 0 }),
      });
      return;
    }
    if (name === 'admin_moderation_decide') {
      const input = route.request().postDataJSON() as ModerationDecisionRequest;
      api.requests.push(input);
      if (api.denyDecision) {
        await route.fulfill({
          json: moderationReceiptFixture(input, {
            outcome: 'rejected',
            code: 'admin_access_denied',
          }),
        });
        return;
      }
      const replayed = api.applied;
      api.applied = true;
      for (const row of rows) {
        if (input.p_action === 'invalidate_score' || row.reportId === input.p_report_id) {
          row.status = input.p_action === 'invalidate_score' ? 'resolved' : 'dismissed';
          row.reviewedAt = '2026-10-18T08:00:00.000001Z';
          if (input.p_action === 'invalidate_score') row.target.invalidatedAt = row.reviewedAt;
        }
      }
      if (api.loseDecisionResponse) {
        api.loseDecisionResponse = false;
        await route.abort('failed');
        return;
      }
      await route.fulfill({
        json: moderationReceiptFixture(input, {
          outcome: replayed ? 'replayed' : 'applied',
        }),
      });
      return;
    }
    if (name?.startsWith('admin_search_')) {
      await route.fulfill({
        json: {
          items: [],
          total: 0,
          hasMore: false,
          nextCursor: null,
          snapshotAt: '2026-10-18T08:00:00Z',
        },
      });
      return;
    }
    await route.fulfill({
      json: [],
      headers: {
        'access-control-expose-headers': 'content-range',
        'content-range': '*/0',
      },
    });
  });
  return api;
}

async function openModeration(page: Page, language: 'fr-FR' | 'en-US' = 'fr-FR') {
  await enterAdminExplorer(page, language);
  await page.getByRole('tab', { name: /Modération|Moderation/ }).click();
  const panel = page.locator('#admin-panel-moderation');
  await expect(panel.getByRole('table').first()).toBeVisible();
  return panel;
}

async function prepareDecision(page: Page, english = false) {
  const panel = page.locator('#admin-panel-moderation');
  await panel
    .getByRole('button', { name: /Examiner le dossier|Review case/ })
    .first()
    .click();
  await panel
    .getByRole('combobox', { name: 'Action', exact: true })
    .selectOption('invalidate_score');
  await panel
    .getByLabel(english ? 'Decision reason' : 'Justification de la décision')
    .fill('La revue du dossier confirme une anomalie vérifiable du score.');
  await panel
    .getByRole('button', {
      name: english ? 'Prepare decision' : 'Préparer la décision',
      exact: true,
    })
    .click();
  await panel
    .getByLabel(
      english
        ? 'Type the exact score identifier to confirm'
        : 'Recopiez l’identifiant exact du score pour confirmer',
    )
    .fill(moderationFixtureIds.dailyRun);
  return panel.getByRole('button', {
    name: english ? 'Confirm and record decision' : 'Confirmer et enregistrer la décision',
    exact: true,
  });
}

test('la file conserve les anciens dossiers et rend le 101e accessible par curseurs serveur', async ({
  page,
}) => {
  const api = await moderationBackend(page);
  const panel = await openModeration(page);
  await expect(panel).toContainText('2020-01-01');
  await expect(panel).toContainText('Total correspondant aux filtres: 101');
  expect(api.reads[0].p_from ?? null).toBeNull();
  expect(api.reads[0].p_to ?? null).toBeNull();
  expect(api.reads[0].p_cursor ?? null).toBeNull();
  for (let index = 0; index < 4; index++) {
    await panel.getByRole('button', { name: 'Page suivante', exact: true }).click();
    await expect(panel.getByText(`Page ${index + 2}`, { exact: true })).toBeVisible();
  }
  await expect(
    panel.getByText('Ancien dossier 101, à examiner sans limite de date implicite.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(api.reads.filter((input) => input.p_cursor)).toHaveLength(4);
  await panel.getByLabel('Signalé depuis (UTC, inclus)').fill('2021-01-01');
  await panel.getByRole('button', { name: 'Appliquer les filtres', exact: true }).click();
  await expect(panel).toContainText('Aucun signalement ne correspond aux filtres appliqués.');
  expect(api.reads.at(-1)).toMatchObject({
    p_from: '2021-01-01',
    p_cursor: null,
  });
  await page.getByRole('tab', { name: /Vue globale/ }).click();
  await page.getByRole('tab', { name: /Modération/ }).click();
  await expect(panel.getByLabel('Signalé depuis (UTC, inclus)')).toHaveValue('2021-01-01');
  await panel.getByRole('button', { name: 'Réinitialiser', exact: true }).click();
  await expect(panel.getByRole('table').first()).toBeVisible();
  api.failQueue = true;
  await panel.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await expect(panel.getByRole('alert').first()).toBeVisible();
  await expect(panel.getByRole('button', { name: /Examiner le dossier/ }).first()).toBeDisabled();
  api.failQueue = false;
  await panel.getByRole('button', { name: 'Réessayer la lecture', exact: true }).click();
  await expect(panel.getByRole('button', { name: /Examiner le dossier/ }).first()).toBeEnabled();
});

test('English moderation remains usable at320px with keyboard and explicit target confirmation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await moderationBackend(page);
  const panel = await openModeration(page, 'en-US');
  const review = panel.getByRole('button', { name: /Review case/ }).first();
  await review.focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('region', { name: 'Moderation case', exact: true })).toBeVisible();
  await panel
    .getByLabel('Decision reason')
    .fill('The report was reviewed and the evidence supports dismissal.');
  await panel.getByRole('button', { name: 'Prepare decision', exact: true }).click();
  const confirm = panel.getByRole('button', {
    name: 'Confirm and record decision',
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  const target = panel.getByLabel('Type the exact score identifier to confirm');
  await target.fill('wrong-target');
  await expect(confirm).toBeDisabled();
  await target.fill(moderationFixtureIds.dailyRun);
  await expect(confirm).toBeEnabled();
  await expect(panel).toContainText('Only this report.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  const accessibility = await new AxeBuilder({ page }).include('#admin-panel-moderation').analyze();
  expect(accessibility.violations).toEqual([]);
  if (process.env.E2E_CAPTURE_UI === '1') {
    await panel
      .getByRole('heading', {
        name: 'Review the decision before sending',
        exact: true,
      })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath('moderation-mobile-confirmation.png'),
      animations: 'disabled',
    });
  }
  await confirm.click();
  await expect(panel.getByRole('region', { name: 'Decision receipt', exact: true })).toBeVisible();
});

test('une réponse perdue est réconciliée avec le même identifiant et le même contenu', async ({
  page,
}) => {
  const api = await moderationBackend(page);
  await openModeration(page);
  const confirm = await prepareDecision(page);
  api.loseDecisionResponse = true;
  await confirm.click();
  const panel = page.locator('#admin-panel-moderation');
  await expect(panel).toContainText('Résultat réseau inconnu.');
  await panel.getByRole('button', { name: 'Réessayer la même demande', exact: true }).click();
  await expect(
    panel.getByRole('region', { name: 'Reçu de la décision', exact: true }),
  ).toBeVisible();
  expect(api.requests).toHaveLength(2);
  expect(api.requests[1]).toEqual(api.requests[0]);
  await expect(panel).toContainText(moderationFixtureIds.audit);
});

test('un refus de rôle dans un reçu200 purge dossiers historiques et actions', async ({ page }) => {
  const api = await moderationBackend(page);
  await openModeration(page);
  const confirm = await prepareDecision(page);
  api.denyDecision = true;
  await confirm.click();
  const panel = page.locator('#admin-panel-moderation');
  await expect(panel.getByRole('alert')).toContainText('Accès refusé.');
  await expect(panel.getByRole('table')).toHaveCount(0);
  await expect(panel.getByLabel('Justification de la décision')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Actualiser', exact: true })).toBeDisabled();
});
