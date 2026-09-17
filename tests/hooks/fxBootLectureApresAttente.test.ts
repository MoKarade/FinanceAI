// tests/hooks/fxBootLectureApresAttente.test.ts
//
// [FX-OBSERVATION-COHORTE, revue panel 2026-09-17] L'effet FX du boot lit l'état APRÈS l'attente
// réseau, jamais avant.
//
// ⚠️ CE QUE LE DÉFAUT COÛTAIT : `getState()` appelé AVANT `await fetchFxRates()` fige une photo
// vieille de la durée du réseau (jusqu'à 8 s). Si Marc saisit son taux à la main pendant ce temps —
// le cas EXACT où la saisie sert, puisqu'elle sert quand la Banque du Canada ne répond pas — la
// branche « diagnostic » réécrit par-dessus les valeurs d'AVANT sa saisie, sans erreur ni
// notification. Sa saisie disparaît en silence.
//
// ⚠️ SCAN DE SOURCE, ASSUMÉ. Ce hook monte l'app entière : un rendu réel coûterait plus qu'il ne
// prouverait (précédent posé et justifié par `tests/hooks/appBootStoragePersistence.test.ts`). Ce
// test prouve donc l'ORDRE des deux appels dans le bloc FX, pas l'absence de toute course — et il
// le dit plutôt que de le laisser croire.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../../utils/stripComments';

const SRC = stripComments(readFileSync(resolve(__dirname, '../../hooks/useAppBootEffects.ts'), 'utf8'));

describe('l\'effet FX du boot relit l\'état après l\'attente', () => {
    it('`getState()` vient APRÈS `await fetchFxRates()`', () => {
        const attente = SRC.indexOf('await fetchFxRates(');
        expect(attente, 'l\'appel attendu a disparu : ce test ne garde plus rien').toBeGreaterThan(0);
        const lecture = SRC.indexOf('useFinanceStore.getState()', attente);
        expect(lecture, 'aucune lecture d\'état après l\'attente — le hook a changé de forme').toBeGreaterThan(0);

        // Aucune lecture d'état ne doit précéder l'attente DANS le bloc de l'effet FX. On borne le
        // balayage au début du bloc pour ne pas confondre avec les autres effets du même fichier.
        const debutBloc = SRC.lastIndexOf('doUpdateFxRates', attente);
        expect(debutBloc, 'le bloc FX est introuvable').toBeGreaterThan(0);
        const avant = SRC.slice(debutBloc, attente);
        expect(avant).not.toContain('useFinanceStore.getState()');
    });

    it('anti-vacuité : la source décommentée porte encore la décision d\'écriture', () => {
        expect(SRC).toContain('decisionEcritureFx');
        expect(SRC).toContain('runBootSync');
    });
});
