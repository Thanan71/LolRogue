import { expect, type Page, test } from '@playwright/test';

async function enterGuest(page: Page) {
  await page.goto('/auth');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await expect(page).toHaveURL('/');
}

test('le guide explique la boucle, les modes et filtre les règles actives', async ({ page }) => {
  await enterGuest(page);
  await expect(page.getByRole('region', { name: 'Boucle de jeu' })).toContainText(
    'Choisir → avancer → résoudre → améliorer → combattre → terminer et sauvegarder',
  );
  await page.getByRole('button', { name: 'Comprendre les règles' }).click();
  await expect(page).toHaveURL('/rules');
  await expect(page.getByRole('heading', { name: 'Guide et règles' })).toBeVisible();
  await expect(page.getByText('Run normale', { exact: true })).toBeVisible();
  await expect(page.getByText('Défi quotidien', { exact: true })).toBeVisible();

  await page.getByLabel('Catégorie').selectOption('Combat');
  await expect(page.getByText('5 règle(s) affichée(s)')).toBeVisible();
  await page.getByLabel('Rechercher une règle').fill('autoplay');
  await expect(page.getByText('1 règle(s) affichée(s)')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Autoplay' })).toBeVisible();
});

test('le tutoriel carte apparaît une fois puis reste réouvrable', async ({ page }) => {
  await enterGuest(page);
  await page.evaluate(async () => {
    const { useRunStore } = await import('/src/stores/runStore.ts');
    await useRunStore.getState().startRun(['Garen'], { seed: 20260801 });
  });
  await page.goto('/run');

  const dialog = page.getByRole('dialog', { name: 'Comprendre la carte' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Étape 1 sur 4');
  await dialog.getByRole('button', { name: 'Suivant' }).click();
  await expect(dialog).toContainText('Résoudre la rencontre');
  await dialog.getByRole('button', { name: 'Fermer le tutoriel' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Tutoriel carte' }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Fermer le tutoriel' }).click();

  const startNode = page.getByRole('button', { name: /départ du biome.*accessible/i }).first();
  await startNode.click();
  await expect(page).toHaveURL('/combat');
  const combatDialog = page.getByRole('dialog', { name: 'Ton premier combat' });
  await expect(combatDialog).toBeVisible();
  await expect(combatDialog).toContainText('Ordre des tours');
  await combatDialog.getByRole('button', { name: 'Suivant' }).click();
  await expect(combatDialog).toContainText('Action et cible');
  await combatDialog.getByRole('button', { name: 'Fermer le tutoriel' }).click();
  await page.getByRole('button', { name: 'Règles du combat' }).click();
  await expect(combatDialog).toBeVisible();
});
