/**
 * Tests E2E — [FUTUR-MOBILE-PR2] Écran Projection mobile : en-tête compact, sélecteur de période en
 * `<select>` natif (+ bouton plein écran), courbe AVANT les KPI. Aucun changement d'horizon ni de
 * calcul (décision Marc : la vue change, jamais `projection.years`) — le test 1 ci-dessous est le
 * garde-fou money-critical explicitement requis par l'architecte pour ce risque.
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

function kpiPatrimoineTexte(page: Page) {
    // KPIStat rend le libellé dans `.kpi-label` puis la valeur juste après — on lit le conteneur
    // entier (label + valeur + sous-libellé) pour capturer un éventuel écart sur N'IMPORTE lequel
    // des trois, pas seulement la valeur en gros caractères.
    return page.locator('.kpi-label', { hasText: 'Patrimoine' }).locator('..').locator('..').innerText();
}

test.describe('Futur mobile — écran Projection (PR2)', () => {
    test.setTimeout(120_000);

    test('[FUTUR-MOBILE-PR2] money-critical : le patrimoine affiché est IDENTIQUE à 390 px et à 1440 px (même page, même store)', async ({ page }) => {
        // Départ en LARGE (desktop) — mesure de référence.
        await page.setViewportSize({ width: 1440, height: 900 });
        await ouvrirFuturEtReveler(page);
        const desktop = await kpiPatrimoineTexte(page);

        // Rétrécir la MÊME page (pas un nouveau contexte) : si un correctif de ce lot avait touché
        // `projection.years` au lieu d'une simple fenêtre de vue, ce redimensionnement ferait diverger
        // le chiffre — c'est exactement ce que ce test interdit.
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(300); // laisse `useViewportBelowSm` (matchMedia réactif) se poser
        const mobile = await kpiPatrimoineTexte(page);

        expect(mobile, 'Le patrimoine affiché doit être IDENTIQUE quelle que soit la largeur — seule la VUE change, jamais le calcul').toBe(desktop);
    });

    test('[FUTUR-MOBILE-PR2] mobile : sélecteur de période en <select> natif, « Aujourd\'hui » en premier, atteignable au clavier', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await ouvrirFuturEtReveler(page);
        const select = page.getByRole('combobox', { name: 'Période affichée' });
        await expect(select).toBeVisible();
        const box = (await select.boundingBox())!;
        expect(box.width, 'sélecteur trop étroit').toBeGreaterThanOrEqual(44);
        expect(box.height, 'sélecteur trop bas').toBeGreaterThanOrEqual(44);

        const options = await select.locator('option').allTextContents();
        expect(options[0]).toBe("Aujourd'hui");
        expect(options).toContain("Tout l'horizon");

        // Atteignable au clavier : focus direct (élément natif, aucun piège de focus à contourner),
        // puis sélection au clavier — pas de souris.
        await select.focus();
        await expect(select).toBeFocused();
        await select.selectOption({ label: "Aujourd'hui" });
        await expect(select).toHaveValue('today');
    });

    test('[FUTUR-MOBILE-PR2] mobile : bouton plein écran en 44×44, un SEUL bouton (pas de doublon avec la variante desktop)', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await ouvrirFuturEtReveler(page);
        const fs = page.getByRole('button', { name: 'Plein écran' });
        await expect(fs).toHaveCount(1);
        const box = (await fs.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
    });

    test('[FUTUR-MOBILE-PR2] ordre : courbe AVANT les KPI sur mobile, KPI AVANT la courbe sur desktop (contrôle négatif)', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await ouvrirFuturEtReveler(page);
        const mobileOrder = await page.evaluate(() => {
            const chart = Array.from(document.querySelectorAll('[role="img"]')).find((e) => (e.getAttribute('aria-label') || '').includes('Courbe de vie'));
            const kpi = Array.from(document.querySelectorAll('.kpi-label')).find((e) => e.textContent?.includes('Objectif FIRE'));
            if (!chart || !kpi) return 'introuvable';
            return kpi.getBoundingClientRect().top > chart.getBoundingClientRect().top ? 'kpi-apres-courbe' : 'kpi-avant-courbe';
        });
        expect(mobileOrder).toBe('kpi-apres-courbe');

        // Contrôle négatif — MÊME page, élargie : l'ordre desktop est celui d'AVANT ce lot.
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForTimeout(300);
        const desktopOrder = await page.evaluate(() => {
            const chart = Array.from(document.querySelectorAll('[role="img"]')).find((e) => (e.getAttribute('aria-label') || '').includes('Courbe de vie'));
            const kpi = Array.from(document.querySelectorAll('.kpi-label')).find((e) => e.textContent?.includes('Objectif FIRE'));
            if (!chart || !kpi) return 'introuvable';
            return kpi.getBoundingClientRect().top > chart.getBoundingClientRect().top ? 'kpi-apres-courbe' : 'kpi-avant-courbe';
        });
        expect(desktopOrder).toBe('kpi-avant-courbe');
        // Un seul strip de KPI visible à la fois — jamais les deux (perturbation possible : oublier de
        // désactiver le site du haut ferait apparaître DEUX « Objectif FIRE »).
        const count = await page.evaluate(() => Array.from(document.querySelectorAll('.kpi-label')).filter((e) => e.textContent?.includes('Objectif FIRE')).length);
        expect(count).toBe(1);
    });

    test('[FUTUR-MOBILE-PR2] en-tête : titre compact sur mobile, titre complet inchangé sur desktop (contrôle négatif)', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await ouvrirFuturEtReveler(page);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Projection');

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForTimeout(300);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Projection Future');
    });
});
