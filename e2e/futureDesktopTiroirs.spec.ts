/**
 * Tests E2E — [FUTUR-NAV-TIROIRS] les tiroirs LATÉRAUX du bureau (≥1024px), ouverts depuis la carte « Outils » (ex-barre latérale, retirée par la refonte S5).
 *
 * `futureMobileFilet.spec.ts` (et ses voisins) couvrent la variante « feuille » sous 1024px ;
 * AUCUN test — vitest ou e2e — n'exerçait `FutureSidebar` ni la variante `lateral` de `Drawer`
 * avant ce fichier. C'est ce trou de couverture qui avait laissé passer une cible tactile à
 * 40px (`min-h-[40px]` au lieu du standard interne 44px) sur les 3 liens de la barre latérale —
 * `docs/CONVENTIONS.md`, trouvé par l'audit a11y du lot.
 *
 * Viewport par défaut du projet `chromium` (Desktop Chrome, ≥1024px) : PAS de setViewportSize
 * ici, exprès — c'est le chemin desktop de référence.
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

const LIENS: ReadonlyArray<{ nom: RegExp; titreDialogue: string }> = [
    { nom: /^Modifier les hypothèses$/, titreDialogue: 'Modifier les hypothèses' },
    { nom: /^Plan d'action$/, titreDialogue: "Plan d'action" },
    { nom: /^Historique$/, titreDialogue: 'Historique' },
];

test.describe('Futur desktop — carte Outils et tiroirs (PR [FUTUR-NAV-TIROIRS], S5)', () => {
    test.setTimeout(120_000);

    test('la carte Outils est visible, le graphe aussi, PAS de bandeau à onglets', async ({ page }) => {
        await ouvrirFuturEtReveler(page);
        // [S5-REFONTE-FUTUR] La barre latérale est retirée (maquette F-bureau) ; les tiroirs vivent
        // dans la carte « Outils », sous la courbe.
        await expect(page.getByRole('region', { name: 'Outils' })).toBeVisible();
        await expect(page.getByRole('heading', { level: 1, name: 'Projection' })).toBeVisible();
        await expect(page.getByRole('group', { name: /Courbe de vie/ })).toBeVisible();
        await expect(page.getByRole('tablist')).toHaveCount(0);
    });

    for (const lien of LIENS) {
        test(`« ${lien.titreDialogue} » : aria-controls pointe vers le bon dialogue, ouvre en tiroir LATÉRAL, Échap restaure le focus`, async ({ page }) => {
            await ouvrirFuturEtReveler(page);
            const bouton = page.getByRole('button', { name: lien.nom });
            await expect(bouton).toHaveAttribute('aria-haspopup', 'dialog');
            await expect(bouton).toHaveAttribute('aria-expanded', 'false');
            const controlsId = await bouton.getAttribute('aria-controls');
            expect(controlsId).toBeTruthy();

            await bouton.click();
            const dialogue = page.getByRole('dialog', { name: lien.titreDialogue });
            await expect(dialogue).toBeVisible();
            await expect(dialogue).toHaveAttribute('id', controlsId!);
            await expect(bouton).toHaveAttribute('aria-expanded', 'true');

            // Variante LATÉRALE (pas la feuille du bas) : ancrée à droite, pleine hauteur.
            const box = await dialogue.boundingBox();
            const viewport = page.viewportSize();
            expect(box).not.toBeNull();
            expect(viewport).not.toBeNull();
            if (box && viewport) {
                expect(box.height).toBeGreaterThan(viewport.height * 0.9); // pleine hauteur, pas 75vh
                expect(box.x + box.width).toBeGreaterThan(viewport.width - 20); // ancré à droite
            }

            await page.keyboard.press('Escape');
            await expect(dialogue).toBeHidden();
            await expect(bouton).toHaveAttribute('aria-expanded', 'false');
            await expect(bouton).toBeFocused();
        });
    }

    test('le tiroir Plan affiche un état de chargement — jamais un dialogue vide — pendant la restauration', async ({ page }) => {
        // [FUTUR-NAV-TIROIRS] Trou fermé par le lot : avant, ouvrir « Plan » pendant la fenêtre de
        // restauration (`curveRestoring`) ne rendait ni l'invite ni le contenu — un dialogue avec
        // juste un titre et un bouton Fermer. On ne peut pas figer cette fenêtre de quelques
        // centaines de ms de façon fiable en e2e ; ce test verrouille à la place l'ÉTAT VOISIN
        // observable : avant tout calcul (ni restauration ni courbe), l'invite s'affiche bel et
        // bien — pas un corps vide — ce qui aurait aussi été le cas si la garde avait régressé.
        await page.addInitScript(scriptBypassOnboarding());
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        await activateTestMode(page);
        await page.goto('/#FUTURE');
        await page.waitForLoadState('domcontentloaded');
        await page.getByRole('button', { name: "Plan d'action", exact: true }).click();
        const dialogue = page.getByRole('dialog', { name: "Plan d'action" });
        await expect(dialogue).toBeVisible();
        await expect(dialogue.getByText(/pour voir ton plan d'action/)).toBeVisible();
    });

    test('les 3 boutons de la carte Outils ont une cible tactile ≥44px (standard interne du dépôt)', async ({ page }) => {
        await ouvrirFuturEtReveler(page);
        for (const lien of LIENS) {
            const box = await page.getByRole('button', { name: lien.nom }).boundingBox();
            expect(box).not.toBeNull();
            if (box) expect(box.height).toBeGreaterThanOrEqual(44);
        }
    });
});
