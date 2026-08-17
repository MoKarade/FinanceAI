/**
 * [FUTUR-INFOBULLE-EPUREE] La largeur de l'infobulle est écrite DEUX FOIS, et rien au runtime ne
 * les confronte :
 *   1. une classe Tailwind dans `ExpertTooltip` (`w-80`) — ce qui est réellement peint ;
 *   2. `TOOLTIP_WIDTH` dans `utils/chartTooltip.ts` — ce qui sert à borner la position au viewport.
 *
 * ⚠️ Une divergence est SILENCIEUSE : l'app compile, les tests passent, et l'infobulle déborde du
 * bord droit uniquement sur un écran assez étroit pour que la borne serve. C'est exactement la
 * classe « garde qui lit la même source que ce qu'elle vérifie » retournée dans le bon sens : ici
 * la garde lit la CLASSE (la vérité peinte) et la confronte à la constante, pas l'inverse.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOOLTIP_WIDTH } from '../../utils/chartTooltip';

const SOURCE = readFileSync(
    resolve(__dirname, '../../components/projection/ProjectionTooltip.tsx'),
    'utf8',
);

describe('[FUTUR-INFOBULLE-EPUREE] largeur : classe Tailwind et constante d’accord', () => {
    it('la classe `w-<N>` du conteneur correspond à TOOLTIP_WIDTH', () => {
        // La branche NON-`sheet` (bureau) est la seule à largeur fixe : en bottom sheet c'est `w-full`.
        const m = SOURCE.match(/'w-(\d+) max-h-\[(\d+)px\] rounded-2xl'/);
        expect(m, 'classe de largeur du conteneur introuvable — le format a changé ?').not.toBeNull();
        // Échelle Tailwind : `w-N` = N/4 rem = N×4 px (base 16 px, non modifiée dans tailwind.config.js).
        expect(Number(m![1]) * 4).toBe(TOOLTIP_WIDTH);
    });

    it('l’infobulle est bien PLUS GRANDE qu’avant (demande Marc), pas juste différente', () => {
        // Ancien format : 288 × 480. Une « épuration » qui rétrécirait au passage raterait la demande.
        const m = SOURCE.match(/'w-(\d+) max-h-\[(\d+)px\] rounded-2xl'/)!;
        expect(Number(m[1]) * 4).toBeGreaterThan(288);
        expect(Number(m[2])).toBeGreaterThan(480);
    });
});
