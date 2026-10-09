import { expect, type Page, test } from '@playwright/test';
import {
  CHAMPION_CATALOG_VERSION,
  CHAMPION_ECONOMY_CATALOG,
  CHAMPION_ECONOMY_VERSION,
  getRotationForInstant,
} from '../src/domain/championEconomy';
import { gameOverContent } from '../src/i18n/gameOverContent';
import { runErrorContent } from '../src/i18n/runErrorContent';

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';

async function openGuest(page: Page, language: 'fr-FR' | 'en-US' = 'fr-FR') {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/rpc/get_champion_economy_snapshot')) {
      const serverNow = new Date().toISOString();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          enabled: true,
          economyVersion: CHAMPION_ECONOMY_VERSION,
          catalogVersion: CHAMPION_CATALOG_VERSION,
          gameplayRulesetVersion: 21,
          serverNow,
          rotation: getRotationForInstant(serverNow, 21),
          catalog: [...CHAMPION_ECONOMY_CATALOG],
          wallet: null,
          ownedChampionIds: [],
          firstWinChampionIds: [],
        },
      });
      return;
    }
    const host = url.hostname;
    if (host === '127.0.0.1' || host === 'localhost') await route.continue();
    else await route.abort('blockedbyclient');
  });
  await page.goto('/auth');
  if (language === 'en-US') await page.getByLabel('Langue').selectOption(language);
  await page.waitForFunction(async () => {
    const { useAuthStore } = await import('/src/stores/authStore.ts');
    return useAuthStore.getState().isInitialized;
  });
  await page
    .getByRole('button', { name: language === 'fr-FR' ? 'Jouer en invité' : 'Play as guest' })
    .click();
  await expect(page).toHaveURL('/');
}

// Exercise the production finalization and persistence paths; only the remote
// authority boundary is substituted so these journeys need no database writes.
async function finishWithRejection(page: Page, retryable = false) {
  return page.evaluate(
    async ({ attemptId, canRetry }) => {
      const [{ useRunStore }, { useAuthStore }, { runAuthorityService }, errors, { runError }] =
        await Promise.all([
          import('/src/stores/runStore.ts'),
          import('/src/stores/authStore.ts'),
          import('/src/services/runAuthorityService.ts'),
          import('/src/services/runAttemptService.ts'),
          import('/src/i18n/runErrorContent.ts'),
        ]);
      const started = await useRunStore.getState().startRun(['Annie', 'Ashe'], { seed: 20261004 });
      if (!started.success) throw new Error(`Unable to start rejection fixture: ${started.code}`);
      const run = useRunStore.getState();
      const userId = '22222222-2222-4222-8222-222222222222';
      useAuthStore.setState({
        user: {
          id: userId,
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        },
      });
      useRunStore.setState({
        authorityAttempt: {
          attemptId,
          runUuid: run.runId,
          ownerUserId: userId,
          seed: run.seed!,
          rulesetVersion: 1,
          engineVersion: 'run-engine-v1',
          difficulty: 'normal',
          mode: 'normal',
          initialTeam: ['Annie', 'Ashe'],
          runeIds: [],
          enhancementSnapshot: { Annie: {}, Ashe: {} },
          startedAt: run.startedAt!,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          status: 'started',
          commands: [],
          nextSequence: 1,
          lastAcknowledgedSequence: 0,
          journalHash: 'initial-journal',
          finishCommandId: null,
        },
      });
      let verificationCount = 0;
      let firstSeal: string | null = null;
      runAuthorityService.appendCommands = async (_, commands) => ({
        data: {
          attemptId,
          status: 'started',
          lastSequence: commands.at(-1)!.sequence,
          journalHash: 'sealed-journal',
          accepted: commands.length,
          replayed: false,
        },
        error: null,
      });
      runAuthorityService.sealAttempt = async (...args) => {
        const current = JSON.stringify(args);
        if (firstSeal !== null && firstSeal !== current)
          throw new Error('The retry rebuilt its finish command');
        firstSeal = current;
        return {
          data: {
            attemptId,
            runUuid: run.runId,
            status: 'finished',
            lastSequence: args[2],
            journalHash: 'sealed-journal',
            accepted: true,
            replayed: verificationCount > 0,
          },
          error: null,
        };
      };
      runAuthorityService.verifyAttempt = async () => {
        verificationCount++;
        document.documentElement.dataset.verificationRequests = String(verificationCount);
        return {
          data: null,
          error:
            canRetry && verificationCount === 1
              ? new errors.RunVerificationRetryableError(
                  'verification_in_progress',
                  runError.verificationInProgress(1),
                  1,
                )
              : new errors.RunVerificationRejectedError('pending_choice', runError.missingChoice),
        };
      };
      await useRunStore.getState().endRun(false, run.runId);
      const snapshot = JSON.stringify(useRunStore.getState().completedRunSnapshot);
      const finishCommand = useRunStore.getState().authorityAttempt?.finishCommandId;
      window.history.pushState(null, '', '/game-over');
      window.dispatchEvent(new PopStateEvent('popstate'));
      return { snapshot, finishCommand };
    },
    { attemptId: ATTEMPT_ID, canRetry: retryable },
  );
}

for (const language of ['fr-FR', 'en-US'] as const) {
  test(`a final rejection survives Game Over, reload and menu in ${language}`, async ({
    page,
    context,
  }, testInfo) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width: 390, height: 844 });
    await openGuest(page, language);
    await finishWithRejection(page);
    const copy = gameOverContent[language].save;
    const alert = page.locator('.game-over-error');
    await expect(alert).toContainText(runErrorContent[language].missingChoice);
    await expect(alert).toContainText(copy.terminalOutcome);
    await expect(alert.getByRole('button', { name: /Retry|Relancer/ })).toHaveCount(0);
    await expect(page.locator('.game-over-rewards')).toHaveCount(0);
    await expect(page.locator('.notification-region')).toHaveCount(0);
    const details = alert.locator('details');
    await expect(details).not.toHaveAttribute('open', '');
    await alert.getByText(copy.supportDetails).click();
    await alert.getByRole('button', { name: copy.copyDiagnostic }).click();
    await expect(alert.getByRole('button', { name: copy.diagnosticCopied })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(ATTEMPT_ID);
    await page.reload();
    await expect(alert).toContainText(copy.terminalOutcome);
    await expect(alert).toContainText(runErrorContent[language].missingChoice);
    await expect(page.locator('.game-over-rewards')).toHaveCount(0);
    await expect(page.locator('.notification-region')).toHaveCount(0);
    await expect(
      page.locator('.notification-region button').filter({ hasText: /Retry|Réessayer/ }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`rejection-${language}.png`),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: language === 'fr-FR' ? 'Menu principal' : 'Main Menu' })
      .click();
    await expect(page).toHaveURL('/');
    await expect(page.locator('.notification-region')).toContainText(copy.terminalOutcome);
    await expect(
      page.locator('.notification-region button').filter({ hasText: /Retry|Réessayer/ }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(async () => {
        const { useRunStore } = await import('/src/stores/runStore.ts');
        const state = useRunStore.getState();
        return {
          kind: state.saveFailureKind,
          rewards: state.serverProgression,
          active: state.isActive,
        };
      }),
    ).toEqual({ kind: 'terminal', rewards: null, active: false });
    expect(runtimeErrors).toEqual([]);
  });
}

test('the retry button resends the same finish command and preserves the completed snapshot', async ({
  page,
}) => {
  await openGuest(page);
  const initial = await finishWithRejection(page, true);
  const alert = page.locator('.game-over-error');
  await expect(alert).toContainText(gameOverContent['fr-FR'].save.retryOutcome);
  await expect(alert.locator('details')).toContainText('verification_in_progress');
  await page.evaluate(async () => {
    const { useRunStore } = await import('/src/stores/runStore.ts');
    useRunStore.setState({ gold: 999, totalWavesCompleted: 99 });
  });
  await alert.getByRole('button', { name: 'Relancer la vérification' }).click();
  await expect(alert).toContainText(gameOverContent['fr-FR'].save.terminalOutcome);
  await expect(page.locator('html')).toHaveAttribute('data-verification-requests', '2');
  expect(
    await page.evaluate(async () => {
      const { useRunStore } = await import('/src/stores/runStore.ts');
      return JSON.stringify(useRunStore.getState().completedRunSnapshot);
    }),
  ).toBe(initial.snapshot);
  expect(initial.finishCommand).toBeTruthy();
  await expect(alert.getByRole('button', { name: 'Relancer la vérification' })).toHaveCount(0);
});
