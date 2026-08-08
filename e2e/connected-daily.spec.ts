import { expect, test } from '@playwright/test';

const onlineEnvironmentAvailable = Boolean(
  process.env.VITE_PUBLIC_SUPABASE_URL && process.env.VITE_PUBLIC_SUPABASE_ANON_KEY,
);

test('un compte démarre et reprend le Daily autoritaire uniquement par l’interface', async ({
  page,
}) => {
  test.skip(!onlineEnvironmentAvailable, 'Supabase local est requis pour ce parcours connecté.');
  test.setTimeout(90_000);

  const identity = `daily-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await page.goto('/auth');
  await page.getByRole('tab', { name: 'Créer un compte' }).click();
  await page.getByLabel("Nom d'utilisateur").fill(identity.slice(0, 28));
  await page.getByLabel("Nom d'affichage").fill('Daily E2E');
  await page.getByLabel('Adresse e-mail').fill(`${identity}@example.test`);
  await page.getByLabel('Mot de passe').fill('Daily-e2e-2026!');
  await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();

  await expect(page).toHaveURL('/', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Défi quotidien', exact: true }).click();
  await expect(page).toHaveURL('/daily-run');
  await expect(page.getByText(/UTC · (easy|normal|hard) · score v/)).toBeVisible();
  await page.getByRole('button', { name: 'Commencer le défi' }).click();

  await expect(page).toHaveURL('/starter-select');
  await page
    .getByRole('button', { name: /^Choisir / })
    .first()
    .click();
  await page.getByRole('button', { name: 'Confirmer le choix' }).click();
  await expect(page).toHaveURL('/run', { timeout: 30_000 });

  const tutorial = page.getByRole('dialog', { name: 'Comprendre la carte' });
  const tutorialOpened = await tutorial
    .waitFor({ state: 'visible', timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (tutorialOpened) {
    await tutorial.getByRole('button', { name: 'Fermer le tutoriel' }).click();
  }
  await page.getByRole('button', { name: '← Menu' }).click();
  await expect(page).toHaveURL('/');
  await page.getByRole('button', { name: 'Défi quotidien', exact: true }).click();

  await expect(page).toHaveURL('/run');
  await expect(page.getByText(/Niveau 1/)).toBeVisible();
});
