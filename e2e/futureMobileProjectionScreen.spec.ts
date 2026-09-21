/**
 * Tests E2E — [FUTUR-MOBILE-PR2] Écran Projection mobile : en-tête compact, sélecteur de période en
 * `<select>` natif (+ bouton plein écran). Aucun changement d'horizon ni de calcul (décision Marc :
 * la vue change, jamais `projection.years`) — le test 1 ci-dessous est le garde-fou money-critical
 * explicitement requis par l'architecte pour ce risque.
 *
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
    await expect(page.getByRole('img', { name: /Courbe de vie/ })).toBeVisible({ timeout: 20_000 });
}

/**
 * [FUTUR-MOBILE-PR2, revue code-reviewer] Le PREMIER jet remontait deux `.locator('..')` depuis
 * `.kpi-label` — ça n'atteint que `<div className="flex items-center justify-between">`
 * (`components/ui/KPIStat.tsx:71-89`), qui contient le LABEL et l'icône, jamais la valeur : la
 * valeur en dollars (`<div className="text-kpi …">`) et le sous-libellé sont des FRÈRES de ce
 * conteneur, pas des descendants. Vérifié en lisant `KPIStat.tsx` : le libellé, la valeur et le
 * sous-libellé sont trois enfants directs du conteneur `bg-surface/60 … rounded-card`, donc il
 * faut TROIS remontées, pas deux. Avec deux, la garde money-critical comparait deux fois la MÊME
 * chaîne statique (« Patrimoine successoral, avec rentes ») et restait verte quel que soit le
 * montant réellement affiché — vacueuse pile sur le seul risque qu'elle devait couvrir.
 */
function kpiPatrimoineTexte(page: Page) {
    return page.locator('.kpi-label', { hasText: 'Patrimoine' }).locator('../../..').innerText();
}

test.describe('Futur mobile — écran Projection (PR2)', () => {
    test.setTimeout(120_000);

    test('[FUTUR-MOBILE-PR2] money-critical : le patrimoine affiché est IDENTIQUE à 390 px et à 1440 px (même page, même store)', async ({ page }) => {
        // Départ en LARGE (desktop) — mesure de référence.
        await page.setViewportSize({ width: 1440, height: 900 });
        await ouvrirFuturEtReveler(page);
        const desktop = await kpiPatrimoineTexte(page);
        // Anti-vacuité : le conteneur doit VRAIMENT porter un montant (chiffres) — sinon un
        // sélecteur cassé qui n'atteint que le libellé statique rendrait ce test vert à tort,
        // exactement le défaut trouvé par la revue code-reviewer sur le premier jet.
        expect(desktop, `Le conteneur lu ne contient aucun chiffre : ${desktop}`).toMatch(/\d/);

        // Rétrécir la MÊME page (pas un nouveau contexte) : si un correctif de ce lot avait touché
        // `projection.years` au lieu d'une simple fenêtre de vue, ce redimensionnement ferait diverger
        // le chiffre — c'est exactement ce que ce test interdit.
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(300); // laisse `useViewportBelowSm` (matchMedia réactif) se poser
        const mobile = await kpiPatrimoineTexte(page);
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

    test('[FUTUR-MOBILE-PR2 → FUTUR-NAV-TIROIRS] ordre : KPI AVANT la courbe en DOM, mobile ET desktop', async ({ page }) => {
        // [FUTUR-NAV-TIROIRS] (2026-09-21, choix Marc « Avant le graphe ») : ce test affirmait
        // « courbe AVANT les KPI sur mobile, contrôle négatif desktop » — la distinction entre les
        // deux viewports a disparu avec la barre à onglets qui la portait. Retourné, pas supprimé
        // (`UN-TEST-DE-LIMITE-S-INVERSE-IL-NE-SE-SUPPRIME-PAS`).
        //
        // ⚠️ Comparer `getBoundingClientRect().top` a semblé le bon geste (repris du test d'origine)
        // et mesurait en fait autre chose sur desktop : la barre latérale et la courbe sont deux
        // colonnes flex INDÉPENDANTES (`items-start`), pas un flux empilé — le KPI, enfoui après le
        // titre/bandeaux/santé DANS la sidebar, se retrouve plus bas en PIXELS que la Card du
        // graphe, qui démarre près du haut de SA colonne. Le `top` d'un élément dans une colonne ne
        // se compare pas au `top` d'un élément dans une autre. Mesuré : la comparaison en PIXELS
        // donnait `kpi-apres-courbe` sur desktop après ce lot, alors que le KPI précède bien le
        // graphe dans le MARKUP (la sidebar est rendue avant `<div className="flex-1">`). Le geste
        // juste est l'ordre DOM (`compareDocumentPosition`), qui reste correct dans les deux
        // dispositions — colonne unique empilée (mobile) ou deux colonnes côte à côte (desktop).
        await page.setViewportSize({ width: 390, height: 844 });
        await ouvrirFuturEtReveler(page);
        const domOrder = () => page.evaluate(() => {
            const chart = Array.from(document.querySelectorAll('[role="img"]')).find((e) => (e.getAttribute('aria-label') || '').includes('Courbe de vie'));
            const kpi = Array.from(document.querySelectorAll('.kpi-label')).find((e) => e.textContent?.includes('Objectif FIRE'));
            if (!chart || !kpi) return 'introuvable';
             
            return (kpi.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING) ? 'kpi-avant-courbe' : 'kpi-apres-courbe';
        });
        expect(await domOrder()).toBe('kpi-avant-courbe');

        // Même vérification élargie (barre latérale desktop).
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForTimeout(300);
        expect(await domOrder()).toBe('kpi-avant-courbe');
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
