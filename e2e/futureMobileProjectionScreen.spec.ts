/**
 * Tests E2E — [FUTUR-MOBILE-PR2] Écran Projection mobile : en-tête compact, sélecteur de période en
 * `<select>` natif (+ bouton plein écran). Aucun changement d'horizon ni de calcul (décision Marc :
 * la vue change, jamais `projection.years`) — le test 1 ci-dessous est le garde-fou money-critical
 * explicitement requis par l'architecte pour ce risque.
 *
 * ⚠️ [S5-REFONTE-FUTUR] Titre « Projection » aux deux largeurs, tuiles KPI retirées (maquettes).
 * ⚠️ [FUTUR-NAV-TIROIRS] (2026-09-21) « courbe AVANT les KPI » n'est plus vrai : Marc a demandé
 * l'inverse (KPI avant le graphe, mobile ET desktop) au lot qui a retiré les sous-onglets. Voir le
 * test d'ordre plus bas, retourné plutôt que supprimé.
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

/**
 * [S5-REFONTE-FUTUR] Les tuiles KPI (`.kpi-label`) ont quitté l'écran (maquettes F-bureau /
 * F-mobile). La garde money-critical lit désormais la ligne « Fin de l'horizon » du tableau des
 * jalons — présente aux DEUX largeurs, même libellé : elle porte l'année, l'âge et le patrimoine
 * de fin de courbe, soit exactement ce qu'un changement d'horizon ferait bouger.
 */
function ligneFinHorizon(page: Page) {
    return page.getByRole('row', { name: /Fin de l'horizon/ }).innerText();
}

test.describe('Futur mobile — écran Projection (PR2)', () => {
    test.setTimeout(120_000);

    test('[FUTUR-MOBILE-PR2] money-critical : le patrimoine affiché est IDENTIQUE à 390 px et à 1440 px (même page, même store)', async ({ page }) => {
        // Départ en LARGE (desktop) — mesure de référence.
        await page.setViewportSize({ width: 1440, height: 900 });
        await ouvrirFuturEtReveler(page);
        const desktop = await ligneFinHorizon(page);
        // Anti-vacuité : le conteneur doit VRAIMENT porter un montant (chiffres) — sinon un
        // sélecteur cassé qui n'atteint que le libellé statique rendrait ce test vert à tort,
        // exactement le défaut trouvé par la revue code-reviewer sur le premier jet.
        expect(desktop, `Le conteneur lu ne contient aucun chiffre : ${desktop}`).toMatch(/\d/);

        // Rétrécir la MÊME page (pas un nouveau contexte) : si un correctif de ce lot avait touché
        // `projection.years` au lieu d'une simple fenêtre de vue, ce redimensionnement ferait diverger
        // le chiffre — c'est exactement ce que ce test interdit.
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(300); // laisse `useViewportBelowLg` (matchMedia réactif) se poser
        const mobile = await ligneFinHorizon(page);
        expect(mobile, `Le conteneur lu ne contient aucun chiffre : ${mobile}`).toMatch(/\d/);

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

    test('[FUTUR-MOBILE-PR2 → S5-REFONTE-FUTUR] ordre : chiffres de tête AVANT la courbe en DOM, mobile ET desktop', async ({ page }) => {
        // [FUTUR-NAV-TIROIRS] (choix Marc « Avant le graphe »), conservé par les maquettes S5 : le
        // bandeau « Indicateurs clés » précède la courbe. Ordre DOM (`compareDocumentPosition`),
        // pas les pixels — robuste à toute mise en page.
        await page.setViewportSize({ width: 390, height: 844 });
        await ouvrirFuturEtReveler(page);
        const domOrder = () => page.evaluate(() => {
            const chart = Array.from(document.querySelectorAll('[role="group"]')).find((e) => (e.getAttribute('aria-label') || '').includes('Courbe de vie'));
            const kpi = document.querySelector('section[aria-label="Indicateurs clés"]');
            if (!chart || !kpi) return 'introuvable';
            return (kpi.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING) ? 'kpi-avant-courbe' : 'kpi-apres-courbe';
        });
        expect(await domOrder()).toBe('kpi-avant-courbe');

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForTimeout(300);
        expect(await domOrder()).toBe('kpi-avant-courbe');
        // Un seul bandeau de tête à la fois — jamais les deux variantes montées ensemble.
        await expect(page.locator('section[aria-label="Indicateurs clés"]')).toHaveCount(1);
    });

    test('[S5-REFONTE-FUTUR] en-tête : « Projection » aux deux largeurs (maquettes F-bureau / F-mobile)', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await ouvrirFuturEtReveler(page);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Projection');

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForTimeout(300);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Projection');
    });
});
