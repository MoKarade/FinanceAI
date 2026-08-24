// tests/a11y/ctaContrast.test.ts
//
// [A11Y-CTA-CONTRASTE-OFFENDERS 2026-08-24] Garde de contraste des CTA PLEINS.
//
// POURQUOI UN TEST ET PAS SEULEMENT LE SCRIPT. `npm run check-contrast` bascule en `exit(1)` avec
// ce lot — mais la CI ne le lance PAS : elle lance `lint`, `typecheck`, `test`, `build`. Une garde
// qui n'est branchée sur aucun point d'application ne protège de rien ; le point d'application de
// ce dépôt, c'est `npm run test`. Le script reste l'outil de DIAGNOSTIC (il imprime tous les
// ratios), ce fichier est la BARRIÈRE.
//
// L'extraction et le calcul viennent de `scripts/lib/ctaContrast.ts`, partagé avec le script :
// re-coder les couleurs ou le scan ici les ferait dériver en silence (leçon A11Y-CHECK-CONTRAST-DRIFT).
import { describe, it, expect } from 'vitest';
import {
    contrastRatio, extraireCtaPaires, hexDeClasse, SEUIL_AA_NORMAL,
} from '../../scripts/lib/ctaContrast.ts';

const { paires, attributsLus } = extraireCtaPaires();

describe('contraste WCAG AA des CTA pleins', () => {
    it('scanne un volume plausible de code peint (anti-vacuité)', () => {
        // Sans ce plancher, un motif cassé ou un déplacement de `components/` viderait le scan et
        // rendrait l'assertion suivante VACUEUSE — verte sur zéro paire testée.
        expect(attributsLus).toBeGreaterThan(200);
        expect(paires.length).toBeGreaterThanOrEqual(3);
    });

    it('couvre aussi les fonds de SURVOL, pas seulement le repos', () => {
        // WCAG 1.4.3 ne connaît pas d'exemption « état survolé ». Un scan qui ne lit que le fond de
        // repos laisserait passer `bg-danger-600 hover:bg-danger-500` (4,83 au repos, 3,76 au survol) —
        // ce qui était le cas de `DebtManager` avant ce lot.
        expect(paires.some((p) => p.bg.startsWith('hover:'))).toBe(true);
    });

    it('résout aussi bien les tokens plats que les échelles numériques', () => {
        // Contre-preuve du résolveur : s'il renvoyait `null` partout, aucune paire ne serait
        // construite et la garde principale serait verte sans rien vérifier. `text-dark` est un
        // token PLAT (`dark: '#07090D'`), `danger-600` une échelle — les deux doivent résoudre.
        expect(hexDeClasse('dark')).toBe('#07090D');
        expect(hexDeClasse('danger-600')).toBe('#dc2626');
        expect(hexDeClasse('meta')).toBeNull(); // `text-meta` est une TAILLE de police, pas une couleur
    });

    it('sait détecter une paire non conforme (le seuil discrimine)', () => {
        // Sans cette contre-preuve, un seuil mal branché (ou un `contrastRatio` qui renverrait une
        // grande valeur constante) rendrait la garde principale ininfalsifiable.
        expect(contrastRatio('#ffffff', '#f59e0b')).toBeLessThan(SEUIL_AA_NORMAL); // blanc sur warning-500 : 2,15
        expect(contrastRatio('#07090D', '#f59e0b')).toBeGreaterThanOrEqual(SEUIL_AA_NORMAL); // dark sur warning-500 : 9,28
    });

    it('aucun CTA peint sous le seuil AA texte normal', () => {
        const fautifs = paires
            .filter((p) => p.ratio < SEUIL_AA_NORMAL)
            .map((p) => `${p.text} sur ${p.bg} = ${p.ratio.toFixed(2)} (${p.sites.join(', ')})`);
        expect(fautifs).toEqual([]);
    });
});
