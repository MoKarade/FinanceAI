/**
 * Tests E2E — [S5-REFONTE-FUTUR] Légende de la courbe Futur en étiquettes (maquettes F-bureau /
 * F-mobile) : en ligne sous la courbe à TOUTES les largeurs — le tiroir « Séries » replié du
 * téléphone ([FUTUR-MOBILE-PR3]) cède la place à la maquette. Ce qui reste verrouillé : cibles
 * ≥ 44 px au téléphone, une série masquée reste découvrable (« Tout afficher » visible dès qu'une
 * série est masquée), état annoncé (`aria-pressed`).
 */
import { test, expect, type Page } from '@playwright/test';
import { scriptBypassOnboarding, activateTestMode } from './helpers/setup';

const localChromium = process.env.PW_LOCAL_CHROMIUM;
if (localChromium) test.use({ launchOptions: { executablePath: localChromium } });

async function ouvrirFuturEtReveler(page: Page) {
    await page.addInitScript(scriptBypassOnboarding());
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await activateTestMode(page);
    await page.goto('/#FUTURE');
    await page.waitForLoadState('domcontentloaded');
    const voirDirect = page.getByRole('button', { name: /projection actuelle.*sans optimiser/i });
    await voirDirect.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    if (await voirDirect.isVisible().catch(() => false)) await voirDirect.click();
    await expect(page.getByRole('group', { name: /Courbe de vie/ })).toBeVisible({ timeout: 20_000 });
}

const groupeSeries = (page: Page) => page.locator('[role="group"][aria-label="Séries du graphique"]');

for (const { nom, largeur, hauteur, cibleMin } of [
    { nom: 'téléphone', largeur: 390, hauteur: 844, cibleMin: 44 },
    { nom: 'bureau', largeur: 1440, hauteur: 900, cibleMin: 32 },
]) {
    test.describe(`Futur — légende en étiquettes (${nom})`, () => {
        test.setTimeout(120_000);

        test('étiquettes en ligne, sans tiroir ; masquer puis « Tout afficher »', async ({ page }) => {
            await page.setViewportSize({ width: largeur, height: hauteur });
            await ouvrirFuturEtReveler(page);
            await expect(groupeSeries(page)).toBeVisible();
            await expect(page.getByRole('button', { name: /Séries · / })).toHaveCount(0);

            const celi = groupeSeries(page).getByRole('button', { name: 'CELI', exact: true });
            await expect(celi).toHaveAttribute('aria-pressed', 'true');
            const tout = groupeSeries(page).getByRole('button', { name: 'Tout afficher' });
            await expect(tout).toHaveCount(0);

            await celi.click();
            await expect(celi).toHaveAttribute('aria-pressed', 'false');
            await expect(tout).toBeVisible();
            await tout.click();
            await expect(celi).toHaveAttribute('aria-pressed', 'true');
            await expect(tout).toHaveCount(0);
        });

        test(`cibles tactiles ≥ ${cibleMin} px`, async ({ page }) => {
            await page.setViewportSize({ width: largeur, height: hauteur });
            await ouvrirFuturEtReveler(page);
            const box = (await groupeSeries(page).getByRole('button', { name: 'Cash', exact: true }).boundingBox())!;
            expect(box.width, 'étiquette trop étroite').toBeGreaterThanOrEqual(44);
            expect(box.height, 'étiquette trop basse').toBeGreaterThanOrEqual(cibleMin);
        });
    });
}
