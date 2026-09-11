/**
 * Tests E2E — [FUTUR-MOBILE-PR3] Tiroir « Séries » de la courbe Futur : replié par défaut sur
 * téléphone, compte des séries visibles et bouton « Tout réafficher » TOUJOURS visibles (risque
 * MOYEN #7 de l'architecte : une série masquée lors d'une session passée doit rester découvrable
 * SANS ouvrir le tiroir), chips ≥ 44 px par axe une fois ouvert, desktop inchangé (légende inline,
 * jamais de tiroir).
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
    await expect(page.getByRole('img', { name: /Courbe de vie/ })).toBeVisible({ timeout: 20_000 });
}

const groupeSeries = (page: Page) => page.locator('[role="group"][aria-label="Séries du graphique"]');

test.describe('Futur mobile — tiroir Séries (PR3)', () => {
    test.setTimeout(120_000);

    test('[FUTUR-MOBILE-PR3] mobile : tiroir FERMÉ par défaut, le compte et « Tout réafficher » restent visibles sans l\'ouvrir', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await ouvrirFuturEtReveler(page);

        const bascule = page.getByRole('button', { name: /Séries · /});
        await expect(bascule).toBeVisible();
        await expect(bascule).toHaveAttribute('aria-expanded', 'false');
        // Le compte est lisible SANS ouvrir — c'est le seul filet contre une série masquée oubliée.
        await expect(bascule).toContainText(/\d+ visibles? sur \d+/);
        await expect(groupeSeries(page)).toHaveCount(0);

        // Masquer une série (CELI) via le tiroir OUVERT, puis le refermer : le badge doit rester lisible fermé.
        await bascule.click();
        await expect(bascule).toHaveAttribute('aria-expanded', 'true');
        await page.getByRole('button', { name: 'CELI', exact: true }).click();
        await bascule.click(); // referme
        await expect(bascule).toHaveAttribute('aria-expanded', 'false');
        await expect(page.getByRole('button', { name: 'Tout réafficher (1 masqué)' })).toBeVisible();
    });

    test('[FUTUR-MOBILE-PR3] mobile : chips ≥ 44 px par axe une fois le tiroir ouvert, « Tout réafficher » n\'est pas imbriqué dans le bouton de bascule', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await ouvrirFuturEtReveler(page);
        const bascule = page.getByRole('button', { name: /Séries · /});
        await bascule.click();
        const premiereChip = page.getByRole('button', { name: 'Cash', exact: true });
        await expect(premiereChip).toBeVisible();
        const box = (await premiereChip.boundingBox())!;
        expect(box.width, 'chip trop étroite').toBeGreaterThanOrEqual(44);
        expect(box.height, 'chip trop basse').toBeGreaterThanOrEqual(44);

        // Masquer une série puis vérifier que le badge « Tout réafficher » est un bouton INDÉPENDANT
        // (un bouton imbriqué dans un bouton est invalide en HTML et déclenche les deux gestionnaires).
        await page.getByRole('button', { name: 'CELI', exact: true }).click();
        const reafficher = page.getByRole('button', { name: /Tout réafficher/ });
        await expect(reafficher).toBeVisible();
        // ⚠️ Discriminant du bug de bouton imbriqué : cliquer sur « Tout réafficher » referme le
        // tiroir SI (et seulement si) il est imbriqué dans le bouton de bascule (les deux
        // gestionnaires se déclenchent). Correctement posé en FRÈRE, le tiroir reste OUVERT.
        await reafficher.click();
        await expect(bascule).toHaveAttribute('aria-expanded', 'true');
        await expect(groupeSeries(page)).toBeVisible();
    });

    test('[FUTUR-MOBILE-PR3] desktop : légende INLINE inchangée, jamais de tiroir (contrôle négatif)', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await ouvrirFuturEtReveler(page);
        await expect(page.getByText('Légende — clique pour afficher / masquer')).toBeVisible();
        await expect(page.getByRole('button', { name: /Séries · /})).toHaveCount(0);
        // La légende est déjà déployée (pas de bascule) : les chips sont visibles sans interaction.
        await expect(groupeSeries(page)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Cash', exact: true })).toBeVisible();
    });
});
