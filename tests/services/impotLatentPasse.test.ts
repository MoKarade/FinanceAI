/**
 * [PASSE-REEL-IMPOT-LATENT-DEBUT] Pourquoi la courbe « Impôt latent » démarre au premier mois projeté.
 *
 * Marc : « je vois impôt latent commencer le 1/09 mais jsp pourquoi ».
 *
 * FAIT MESURÉ, et c'est le cœur du ticket : `ImpotLatent` n'est émis NULLE PART dans le passé
 * reconstruit. Le passé ne porte que des soldes, des flux et le patrimoine net — reconstruire un
 * impôt latent exigerait l'historique des PRIX DE REVIENT, que l'app n'a pas. Sa série ne peut donc
 * commencer qu'au premier mois PROJETÉ.
 *
 * ⚠️ Le calcul est JUSTE ; c'est de ne pas le DIRE qui était le défaut — une courbe qui surgit à une
 * date arbitraire se lit comme un bug (classe `SILENCE-READS-AS-BROKEN`). Le correctif est une
 * phrase dans le bandeau, pas un changement de calcul.
 *
 * ⚠️ Ce test verrouille le FAIT, pas la phrase. Si un jour le passé se met à émettre `ImpotLatent`,
 * il ÉCHOUE — et c'est voulu : l'explication affichée deviendrait fausse, et il faudrait la retirer
 * en même temps que le fait change. Sans cette garde, l'app continuerait d'affirmer une limitation
 * qui n'existe plus.
 */
import { describe, it, expect } from 'vitest';
import { sourceFutureProjection } from '../helpers/futureSource';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (rel: string): string => readFileSync(resolve(__dirname, '../../', rel), 'utf8');

describe('[PASSE-REEL-IMPOT-LATENT-DEBUT] le passé n’émet PAS d’impôt latent', () => {
    it.each([
        'services/history/dailyPastLedger.ts',
        'services/history/buildPastPrefix.ts',
    ])('%s ne produit aucun `ImpotLatent`', (fichier) => {
        expect(
            lire(fichier).includes('ImpotLatent'),
            'si le passé se met à émettre ce champ, la phrase affichée à Marc devient FAUSSE',
        ).toBe(false);
    });

    it('l’écran EXPLIQUE l’absence au lieu de laisser la courbe surgir', () => {
        // ⚠️⚠️ GARDE INVERSÉE EN PLACE le 2026-09-21 (`[FUTUR-NOTES-COMPACTES]`), pas supprimée.
        // Marc a biffé le pavé qui portait cette phrase (« vire moi tout le texte que j'ai barré »),
        // donc elle n'est plus un paragraphe de `FutureProjection.tsx` — elle est une PASTILLE de
        // `components/future/notesGraphe.tsx` (libellé court + `title` + jumeau `sr-only`).
        // Ce qu'elle DÉFEND n'a pas changé d'un mot : une courbe qui surgit à une date arbitraire se
        // lit comme un bug, et le calcul, lui, est juste. Supprimer la garde avec le paragraphe
        // aurait laissé croire que la contrainte n'avait jamais existé
        // (`UN-TEST-DE-LIMITE-S-INVERSE-IL-NE-SE-SUPPRIME-PAS`).
        const src = lire('components/future/notesGraphe.tsx');
        expect(src).toContain('n’est pas reconstruit');
        // La note reste GATÉE sur la visibilité de la série : l'afficher en permanence serait du
        // bruit sur un écran déjà dense — et expliquerait une courbe que l'utilisateur a masquée.
        expect(src).toMatch(/o\.courbeAuJour\s*&&\s*o\.impotLatentVisible/);
        // Et le paragraphe d'origine ne doit PAS revenir : deux endroits qui expliquent la même
        // chose divergent, et c'est le pavé qui a été retiré.
        // ⚠️ Lecture DÉCOMMENTÉE — mon 1er jet lisait la source brute et rougissait sur un
        // commentaire sans rapport (« le cash/immo passé n'est pas reconstruit »),
        // `SCAN-QUI-MATCHE-LA-PROSE` re-payée dans la garde même qui la cite.
        expect(sourceFutureProjection()).not.toContain('pas reconstruit');
    });
});
