/**
 * Tests E2E — [FUTUR-MOBILE-PR5] Amorçage, Plan d'action, Historique et feuille du jour, en
 * géométrie RÉELLE (viewport 390×844 tactile). Complète les tests de composant (classes
 * `min-h-[…]`, jsdom ne calcule aucun layout) par la mesure en PIXELS des cibles tactiles, seule
 * preuve qu'une classe Tailwind fait bien ce qu'elle promet.
 *
 * Desktop reste un contrôle négatif systématique (mandat Marc #13, « zéro changement visuel »).
 */
import { test, expect, type Page } from '@playwright/test';
import { scriptBypassOnboarding, activateTestMode } from './helpers/setup';

const localChromium = process.env.PW_LOCAL_CHROMIUM;
if (localChromium) test.use({ launchOptions: { executablePath: localChromium } });

const TARGET = 43; // tolérance d'arrondi navigateur, cf. futureMobileSheet.spec.ts

async function ouvrirFutur(page: Page) {
    await page.addInitScript(scriptBypassOnboarding());
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await activateTestMode(page);
    await page.goto('/#FUTURE');
    await page.waitForLoadState('domcontentloaded');
}

async function revelerCourbe(page: Page) {
    const voirDirect = page.getByRole('button', { name: /projection actuelle.*sans optimiser/i });
    await voirDirect.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    if (await voirDirect.isVisible().catch(() => false)) await voirDirect.click();
    await expect(page.getByRole('img', { name: /Courbe de vie/ })).toBeVisible({ timeout: 20_000 });
}

test.describe('Futur mobile — amorçage (PR5)', () => {
    test.setTimeout(60_000);

    test('[FUTUR-MOBILE-PR5] mobile : levier, CTA et lien atteignent leur cible tactile', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await ouvrirFutur(page);
        // Écran d'amorçage = état PAR DÉFAUT du sous-onglet Projection, avant révélation.
        // Sélecteur robuste : première option du premier levier (nom stable, LEVER_LIBRARY).
        const leverBtn = page.getByRole('button', { name: 'Auto (taux marginal)' });
        await expect(leverBtn).toBeVisible();
        const leverBox = (await leverBtn.boundingBox())!;
        expect(leverBox.height).toBeGreaterThanOrEqual(TARGET);

        const cta = page.getByRole('button', { name: 'Trouver la meilleure stratégie' });
        await expect(cta).toBeVisible();
        const ctaBox = (await cta.boundingBox())!;
        expect(ctaBox.height).toBeGreaterThanOrEqual(55);

        const lien = page.getByRole('button', { name: /projection actuelle.*sans optimiser/i });
        const lienBox = (await lien.boundingBox())!;
        expect(lienBox.height).toBeGreaterThanOrEqual(TARGET);
    });

    test('[FUTUR-MOBILE-PR5] desktop (contrôle négatif) : levier et CTA restent à leur taille d\'origine', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await ouvrirFutur(page);
        const leverBtn = page.getByRole('button', { name: 'Auto (taux marginal)' });
        await expect(leverBtn).toBeVisible();
        const leverBox = (await leverBtn.boundingBox())!;
        expect(leverBox.height).toBeLessThan(TARGET);

        const cta = page.getByRole('button', { name: 'Trouver la meilleure stratégie' });
        const ctaBox = (await cta.boundingBox())!;
        expect(ctaBox.height).toBeLessThan(50);
    });
});

test.describe('Futur mobile — Plan d\'action (PR5)', () => {
    test.setTimeout(60_000);

    test('[FUTUR-MOBILE-PR5] mobile : « Pourquoi ? » et la case « Marquer comme fait » atteignent 44 px', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await ouvrirFutur(page);
        await revelerCourbe(page);
        await page.getByRole('tab', { name: 'Plan d\'action' }).click();

        const pourquoi = page.getByRole('button', { name: /Pourquoi/ }).first();
        await expect(pourquoi).toBeVisible({ timeout: 10_000 });
        const pBox = (await pourquoi.boundingBox())!;
        expect(pBox.height).toBeGreaterThanOrEqual(TARGET);

        const checkbox = page.getByRole('checkbox').first();
        if (await checkbox.isVisible().catch(() => false)) {
            // La case elle-même reste visuellement 14 px : c'est le CONTENEUR enveloppant (span
            // `min-h-[44px] min-w-[44px]`) qui porte la cible tactile agrandie.
            const wrapper = checkbox.locator('..');
            const cBox = (await wrapper.boundingBox())!;
            expect(cBox.height).toBeGreaterThanOrEqual(TARGET);
            expect(cBox.width).toBeGreaterThanOrEqual(TARGET);
        }
    });
});

test.describe('Futur mobile — Historique (PR5)', () => {
    test.setTimeout(60_000);

    test('[FUTUR-MOBILE-PR5] mobile : une pastille de compte atteint 44 px', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await ouvrirFutur(page);
        await revelerCourbe(page);
        await page.getByRole('tab', { name: 'Historique' }).click();
        // Scope au groupe de pastilles (libellé « Affichage : ») — un sélecteur générique
        // `[aria-pressed]` matche aussi le bouton « Mode Discret » de la nav, hors sujet ici.
        const groupe = page.getByText('Affichage :').locator('..');
        const chip = groupe.getByRole('button').first();
        await expect(chip).toBeVisible({ timeout: 10_000 });
        const box = (await chip.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(TARGET);
    });
});

test.describe('Futur mobile — feuille du jour (PR5)', () => {
    test.setTimeout(120_000);

    async function chartBox(page: Page) {
        const chart = page.getByRole('img', { name: /Courbe de vie/ });
        await expect(chart).toBeVisible({ timeout: 15_000 });
        await chart.scrollIntoViewIfNeeded();
        await page.locator('.recharts-cartesian-grid').first().waitFor({ state: 'visible', timeout: 15_000 });
        const box = await chart.boundingBox();
        expect(box).not.toBeNull();
        return box!;
    }

    async function ouvrirDetailComplet(page: Page) {
        const sheet = page.locator('[data-frozen-tooltip]');
        const spots: Array<[number, number]> = [
            [0.5, 0.78], [0.3, 0.82], [0.65, 0.75], [0.45, 0.6],
        ];
        const box = await chartBox(page);
        for (const [fx, fy] of spots) {
            await page.touchscreen.tap(box.x + box.width * fx, box.y + box.height * fy);
            await page.waitForTimeout(500);
            if (await sheet.isVisible().catch(() => false)) break;
        }
        await expect(sheet).toBeVisible({ timeout: 5_000 });
        await sheet.getByRole('button', { name: /Détail complet/ }).click();
        await expect(page.getByRole('dialog', { name: 'Détail du mois' })).toBeVisible({ timeout: 5_000 });
    }

    test('[FUTUR-MOBILE-PR5] mobile : la feuille occupe ~3/4 de l\'écran, ancrée en bas', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await ouvrirFutur(page);
        await revelerCourbe(page);
        await ouvrirDetailComplet(page);

        const dialog = page.getByRole('dialog', { name: 'Détail du mois' });
        const panel = dialog.locator(':scope > div').first();
        const box = (await panel.boundingBox())!;
        const viewport = page.viewportSize()!;
        // ~75 % de la hauteur d'écran (tolérance large : bordures, arrondi navigateur).
        expect(box.height).toBeGreaterThan(viewport.height * 0.65);
        expect(box.height).toBeLessThan(viewport.height * 0.85);
        // Ancrée en BAS.
        expect(box.y + box.height).toBeGreaterThan(viewport.height - 4);
    });

    test('[FUTUR-MOBILE-PR5] mobile : le bouton « Détail complet » de la feuille atteint 44 px', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await ouvrirFutur(page);
        await revelerCourbe(page);
        await ouvrirDetailComplet(page);

        const btn = page.getByRole('dialog', { name: 'Détail du mois' }).getByRole('button', { name: 'Détail complet' });
        await expect(btn).toBeVisible();
        const box = (await btn.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(TARGET);
    });
});
