/**
 * Tests E2E — [FUTUR-MOBILE-PR4] Ordre Mode → macro → rendements → sections repliées (inflation
 * par poste, risques, rejeu, avancés), CTA « Recalculer » collant en pied, comptant les hypothèses
 * modifiées. Ordre et grille inchangés (mandat Marc « zéro changement visuel du contenu »).
 *
 * [FUTUR-NAV-TIROIRS] (2026-09-21) L'onglet Hypothèses n'existe plus : ce contenu s'ouvre dans un
 * tiroir (`ui/Drawer.tsx`) déclenché par un bouton — feuille du bas sur téléphone/tablette, tiroir
 * latéral sur desktop. Le CONTENU du formulaire (ProjectionControls) est inchangé ; seul le
 * déclencheur et le conteneur changent. `ouvrirHypotheses` accepte les deux libellés du bouton
 * (court « Hypothèses » en colonne empilée, complet « Modifier les hypothèses » dans la barre
 * latérale) — le TITRE du tiroir, lui, est fixe des deux côtés.
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

async function ouvrirHypotheses(page: Page) {
    // ⚠️ Insensible à la casse : le bouton court dit « Hypothèses » (seul mot, majuscule), le
    // bouton complet de la barre latérale dit « Modifier les hypothèses » (minuscule mi-phrase,
    // français correct) — un regex sensible à la casse ne matchait que le premier.
    await page.getByRole('button', { name: /Hypothèses/i }).click();
    await expect(page.getByRole('dialog', { name: 'Modifier les hypothèses' })).toBeVisible();
}

test.describe('Futur mobile — onglet Hypothèses (PR4)', () => {
    test.setTimeout(120_000);

    test('[FUTUR-MOBILE-PR4] mobile : quatre sections repliées DISTINCTES (inflation/risques/rejeu/avancés)', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await ouvrirFuturEtReveler(page);
        await ouvrirHypotheses(page);
        for (const titre of ['Inflation par poste', 'Risques & aléas', 'Rejeu krach historique', 'Paramètres avancés']) {
            await expect(page.getByRole('button', { name: new RegExp(titre) })).toBeVisible();
        }
    });

    test('[FUTUR-MOBILE-PR4] ordre mobile : Mode → macro (Flux Mensuels) → rendements (CELI) → sections repliées', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await ouvrirFuturEtReveler(page);
        await ouvrirHypotheses(page);
        const topOf = async (locator: ReturnType<Page['locator']> | ReturnType<Page['getByText']>) =>
            (await locator.first().boundingBox())?.y ?? Number.POSITIVE_INFINITY;
        const modeTop = await topOf(page.locator('fieldset', { has: page.locator('legend', { hasText: 'Mode de simulation' }) }));
        const fluxTop = await topOf(page.getByText('Flux Mensuels'));
        const rendementsTop = await topOf(page.getByRole('button', { name: /Rendements Estimés/ }));
        const inflationTop = await topOf(page.getByRole('button', { name: /Inflation par poste/ }));
        expect(modeTop).toBeLessThan(fluxTop);
        expect(fluxTop).toBeLessThan(rendementsTop);
        expect(rendementsTop).toBeLessThan(inflationTop);
    });

    test('[FUTUR-MOBILE-PR4] desktop (contrôle négatif) : UNE SEULE section « Risques & aléas », pas de section « Rejeu krach historique » séparée', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await ouvrirFuturEtReveler(page);
        await ouvrirHypotheses(page);
        await expect(page.getByRole('button', { name: /Risques & aléas/ })).toHaveCount(1);
        await expect(page.getByRole('button', { name: /Rejeu krach historique/ })).toHaveCount(0);
        // La grille desktop 4-colonnes existe toujours (Facteurs Macro ET Rendements Estimés côte à côte).
        await expect(page.getByText('Facteurs Macro')).toBeVisible();
        await expect(page.getByText('Rendements Estimés')).toBeVisible();
    });

    test('[FUTUR-MOBILE-PR4] CTA collant : visible sur mobile, absent sur desktop, compte les hypothèses modifiées', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await ouvrirFuturEtReveler(page);
        await ouvrirHypotheses(page);
        const cta = page.getByRole('button', { name: /Recalculer la projection/ });
        await expect(cta).toBeVisible();
        await expect(cta).toHaveText('Recalculer la projection'); // 0 modif juste après révélation

        // Change une hypothèse (curseur Horizon, champ numérique synchronisé) → le compte apparaît.
        const horizonField = page.getByRole('spinbutton', { name: 'Horizon (Années)' });
        await horizonField.fill('35');
        await horizonField.blur();
        await expect(cta).toHaveText(/Recalculer la projection \(1 hypothèse modifiée\)/);

        // Contrôle négatif desktop : le CTA collant n'existe PAS (l'utilisateur voit déjà la courbe
        // derrière le tiroir latéral).
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForTimeout(300);
        await expect(page.getByRole('button', { name: /Recalculer la projection/ })).toHaveCount(0);
    });

    test('[FUTUR-MOBILE-PR4] CTA collant : le clic recalcule ET referme le tiroir', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await ouvrirFuturEtReveler(page);
        await ouvrirHypotheses(page);
        const horizonField = page.getByRole('spinbutton', { name: 'Horizon (Années)' });
        await horizonField.fill('40');
        await horizonField.blur();
        await page.getByRole('button', { name: /Recalculer la projection/ }).click();
        // [FUTUR-NAV-TIROIRS] La courbe n'était jamais cachée (elle est TOUJOURS affichée derrière
        // le tiroir) : le clic n'a donc plus besoin de « revenir » nulle part, seulement de refermer.
        await expect(page.getByRole('dialog', { name: 'Modifier les hypothèses' })).toBeHidden();
        await expect(page.getByRole('img', { name: /Courbe de vie/ })).toBeVisible({ timeout: 20_000 });
    });
});
