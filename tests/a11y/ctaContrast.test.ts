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
    contrastRatio, extraireCtaPaires, extraireTextePaires, estFamilleParDefaut, hexDeClasse, SEUIL_AA_NORMAL,
} from '../../scripts/lib/ctaContrast.ts';

const { paires, attributsLus } = extraireCtaPaires();
const texte = extraireTextePaires();

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

    it('[A11Y-CONTRAST-ANGLE-MORT-541] résout la palette Tailwind PAR DÉFAUT, tokens du projet d\'abord', () => {
        // Avant le lot 208, `green-600` rendait `null` : un bouton `bg-green-600 text-white` (3,30) n'était
        // jamais une paire — 539 occurrences de la palette par défaut dans 70 fichiers, invisibles.
        expect(hexDeClasse('green-600')).toBe('#16a34a');
        expect(hexDeClasse('indigo-500')).toBe('#6366f1');
        expect(estFamilleParDefaut('green-600')).toBe(true);
        expect(estFamilleParDefaut('danger-600')).toBe(false); // token du projet
        expect(hexDeClasse('green-6000')).toBeNull();
    });

    it('au survol, le texte de SURVOL est apparié quand il existe (hover:text-*)', () => {
        // Témoin réel : `Investments.tsx` peint `text-violet-300 … hover:bg-violet-600 hover:text-white`.
        // Apparier le texte de REPOS au fond de survol fabriquait un faux offender (3,09) ; le blanc du
        // survol vaut 5,70. Les deux assertions se perturbent séparément (retirer l'appariement → la 1re rougit).
        expect(paires.some((p) => p.bg === 'hover:bg-violet-600' && p.text === 'hover:text-white')).toBe(true);
        expect(paires.some((p) => p.bg === 'hover:bg-violet-600' && p.text === 'text-violet-300')).toBe(false);
    });

    it('[A11Y-CONTRAST-ANGLE-MORT-541] le texte de la palette par défaut sur les fonds de page : volume plausible, aucun sous le seuil', () => {
        // Anti-vacuité : 38 classes distinctes mesurées le 2026-09-06 (114 combinaisons sur 3 fonds).
        expect(texte.classesLues).toBeGreaterThan(30);
        expect(texte.paires.length).toBeGreaterThan(60);
        // Un élément qui porte son PROPRE fond n'est pas sur le fond de page : `bg-white text-rose-700`
        // (SyncStatusBanner) vaut 5,9 sur son blanc et sortait à 2,83 sur `surfaceHighlight` avant ce filtre.
        expect(texte.paires.some((p) => p.text === 'text-rose-700')).toBe(false);
        const fautifs = texte.paires.filter((p) => p.ratio < SEUIL_AA_NORMAL)
            .map((p) => `${p.text} sur ${p.bg} = ${p.ratio.toFixed(2)} (${p.sites.slice(0, 3).join(', ')})`);
        expect(fautifs).toEqual([]);
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
