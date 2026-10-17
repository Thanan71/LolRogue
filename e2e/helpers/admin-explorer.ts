import { expect, type Page, type TestInfo } from '@playwright/test';

// UI fixture only. Database tests independently prove authorization and RPC projections.
export async function enterAdminExplorer(page: Page, language: 'fr-FR' | 'en-US' = 'fr-FR') {
  await page.addInitScript((selected) => {
    localStorage.clear();
    localStorage.setItem('lolrogue-settings', JSON.stringify({ state: { language: selected } }));
  }, language);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/auth');
  await page
    .getByRole('button', {
      name: language === 'fr-FR' ? 'Jouer en invité' : 'Play as guest',
      exact: true,
    })
    .click();
  await expect(page).toHaveURL('/');
  await page.evaluate(async () => {
    const { useAuthStore } = await import('/src/stores/authStore.ts');
    const user = { id: '00000000-0000-4000-8000-000000000099' } as NonNullable<
      ReturnType<typeof useAuthStore.getState>['user']
    >;
    const session = {
      user,
      access_token: 'admin-ui-fixture',
      refresh_token: 'admin-ui-fixture',
      token_type: 'bearer',
    } as NonNullable<ReturnType<typeof useAuthStore.getState>['session']>;
    useAuthStore.setState({
      user,
      session,
      isAdmin: true,
      isAuthenticated: true,
      isGuest: false,
      isInitialized: true,
      isLoading: false,
      authStatus: 'ready',
      player: {
        id: user.id,
        username: 'admin-ui-fixture',
        display_name: 'Admin UI fixture',
        is_admin: true,
        level: 1,
        total_candies: 0,
        total_runs_completed: 0,
        total_wins: 0,
      } as NonNullable<ReturnType<typeof useAuthStore.getState>['player']>,
    });
  });
  await page
    .getByRole('button', {
      name: language === 'fr-FR' ? "Panneau d'administration" : 'Admin panel',
      exact: true,
    })
    .click();
  await expect(page).toHaveURL('/admin');
}

export async function captureLoadedAdminPage(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
  });
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await info.attach(name, { path, contentType: 'image/png' });
}
