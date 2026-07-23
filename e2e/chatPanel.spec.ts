// e2e/chatPanel.spec.ts
//
// [CHAT-PANEL-LAYOUT] Repro du bug signalé par Marc (captures 2026-07-22) : « le petit chat de
// coté bug parfois et je vois pas le chat » — la zone de saisie apparaît en HAUT du panneau et la
// conversation est invisible. Mesure les bounding boxes réelles (header / fil de messages / zone
// de saisie) dans un vrai viewport Chromium.

import { test, expect } from '@playwright/test';
import { scriptBypassOnboarding } from './helpers/setup';

// Environnement cloud : le Chromium pré-installé (PLAYWRIGHT_BROWSERS_PATH) est en révision 1194
// alors que le @playwright/test du repo en attend une plus récente → pointer l'exécutable présent.
// Sans effet ailleurs : scope de CE fichier seulement (la CI télécharge ses navigateurs).
if (process.env.PW_LOCAL_CHROMIUM) {
    test.use({ launchOptions: { executablePath: process.env.PW_LOCAL_CHROMIUM } });
}

test.describe('Panneau de chat flottant — layout', () => {
    test('header en haut, fil de messages au milieu (hauteur > 0), saisie en BAS', async ({ page }) => {
        await page.addInitScript(scriptBypassOnboarding());
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const fab = page.getByRole('button', { name: 'Ouvrir le conseiller IA' });
        await fab.waitFor({ state: 'visible' });
        await fab.click();

        const dialog = page.getByRole('dialog', { name: 'Assistant IA' });
        await dialog.waitFor({ state: 'visible' });
        await page.screenshot({ path: 'test-results/chat-panel-layout.png' });

        const dialogBox = (await dialog.boundingBox())!;
        const header = dialog.getByRole('heading', { name: 'Assistant' });
        await expect(header).toBeVisible();
        const headerBox = (await header.boundingBox())!;
        const input = dialog.getByLabel('Question au conseiller IA');
        await expect(input).toBeVisible();
        const inputBox = (await input.boundingBox())!;

        // Le message d'accueil (conversation vide) doit être VISIBLE dans le panneau.
        const greeting = dialog.getByText(/conseiller financier personnel/);
        await expect(greeting).toBeVisible();
        const greetingBox = (await greeting.boundingBox())!;

        // Ordre vertical attendu : header < fil de messages < saisie.
        expect(headerBox.y).toBeLessThan(greetingBox.y);
        expect(greetingBox.y).toBeLessThan(inputBox.y);
        // La saisie colle au BAS du panneau (pas en haut — le bug des captures).
        expect(inputBox.y + inputBox.height).toBeGreaterThan(dialogBox.y + dialogBox.height * 0.7);
        // Le header colle au HAUT.
        expect(headerBox.y).toBeLessThan(dialogBox.y + dialogBox.height * 0.3);
    });
});
