// tests/components/futureCourbeDette.test.ts
//
// [FUTUR-COURBE-DETTE] La dette est enfin TRACÉE — et elle ne se confond pas avec l'impôt latent.
//
// Marc, 2026-09-18 : « je veux voir la courbe de la dette même dans le passé ». Puis, dans la même
// réponse : « je vois pourtant bien qu'il y a une courbe rouge en dessous de zéro donc je veux que
// ce soit celle-ci qui continue SI c'est bien celle de la dette ». Ce n'en était pas une — c'était
// l'impôt latent. Ces gardes tiennent les deux moitiés : la dette EXISTE comme série, et elle reste
// DISTINCTE de l'impôt latent à l'œil (couleur ET forme).

import { describe, it, expect } from 'vitest';
import { FUTURE_LEGEND_ITEMS } from '../../components/future/seriesConfig';
import { detteSousZero, COULEUR_DETTE } from '../../components/future/detteSerie';

describe('[FUTUR-COURBE-DETTE] la dette est une série du graphe', () => {
    it('elle figure dans la légende, en AIRE', () => {
        const dette = FUTURE_LEGEND_ITEMS.find(i => i.key === 'DettesNonImmo');
        expect(dette).toBeTruthy();
        expect(dette!.shape).toBe('area');
        expect(dette!.color).toBe(COULEUR_DETTE);
        // ⚠️ Anti-vacuité : la légende doit VRAIMENT porter les autres séries, sinon « la dette y
        // est » serait vrai d'une légende à une seule entrée.
        expect(FUTURE_LEGEND_ITEMS.length).toBeGreaterThan(10);
    });

    it('elle ne peut pas être CONFONDUE avec l’impôt latent : ni la couleur, ni la forme', () => {
        // C'est LE défaut que ce lot répare — Marc lisait l'impôt latent comme sa dette.
        const dette = FUTURE_LEGEND_ITEMS.find(i => i.key === 'DettesNonImmo')!;
        const latent = FUTURE_LEGEND_ITEMS.find(i => i.key === 'ImpotLatent')!;
        expect(dette.color).not.toBe(latent.color);
        expect(dette.shape).not.toBe(latent.shape);
        // …et pas non plus avec les deux AUTRES oranges du graphe (Non-Enreg, objectif FIRE).
        for (const k of ['NonReg', 'fire']) {
            expect(dette.color).not.toBe(FUTURE_LEGEND_ITEMS.find(i => i.key === k)!.color);
        }
    });
});

describe('[FUTUR-COURBE-DETTE] la valeur tracée', () => {
    it('une dette de 31 275 $ se trace à −31 275 : SOUS zéro', () => {
        expect(detteSousZero({ DettesNonImmo: 31_275 })).toBe(-31_275);
    });

    it('une dette ÉTEINTE vaut zéro — c’est un fait, il se trace', () => {
        expect(detteSousZero({ DettesNonImmo: 0 })).toBe(0);
    });

    it('un champ ABSENT ou non fini rend `null`, JAMAIS zéro', () => {
        // ⚠️ Le cœur du no-fake-data ici : un zéro tracé AFFIRME « aucune dette à cette date ».
        // L'absence du champ ne dit que « je ne sais pas » — Recharts saute le point.
        expect(detteSousZero({})).toBeNull();
        expect(detteSousZero({ DettesNonImmo: NaN })).toBeNull();
        expect(detteSousZero({ DettesNonImmo: Infinity })).toBeNull();
        expect(detteSousZero({ DettesNonImmo: '31275' })).toBeNull();
        expect(detteSousZero(null)).toBeNull();
        expect(detteSousZero(undefined)).toBeNull();
    });
});
