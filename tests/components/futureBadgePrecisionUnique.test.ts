/**
 * [S5-REFONTE-FUTUR] Le badge de précision de la prévision (écart prévu / réel, [PASSE-REEL-2]) est
 * rendu UNE fois, juste sous la courbe. La restructuration de la carte l'avait dupliqué (deux
 * rendus consécutifs, relevé par la revue automatique de la PR #1063) : invisible sur le persona
 * de test, où le badge rend `null`, mais doublé dès qu'une comparaison a du sens.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripCommentsJsx } from '../../utils/stripComments';

describe('[S5-REFONTE-FUTUR] badge de précision de la prévision', () => {
    it('un seul rendu dans FutureProjection', () => {
        const src = stripCommentsJsx(readFileSync(resolve(__dirname, '../../components/FutureProjection.tsx'), 'utf8'));
        expect(src.match(/<ForecastAccuracyBadge\b/g) ?? []).toHaveLength(1);
    });
});
