/**
 * [PASSE-REEL-VARIATION-DU-JOUR] La variation du patrimoine d'une journée, ventilée par source.
 *
 * Demande de Marc : « je veux voir la variabilité d'argent pour la journée (tout compris mais
 * détaillé) ». Le panneau montrait le NET ENCAISSÉ — pas la variation du patrimoine.
 *
 * ⚠️ CE QUE CES TESTS PROTÈGENT. Une ventilation est fausse de deux façons, et les deux sont
 * silencieuses : compter un montant DEUX FOIS (le dépôt, qui sort des liquidités et entre dans un
 * régime), ou fermer le total avec un poste fourre-tout qui encaisse l'écart. La seconde est la
 * pire : elle rend la vérification CIRCULAIRE — le total colle toujours, donc ne prouve plus rien.
 * D'où le résiduel EXPOSÉ, et les tests ci-dessous qui l'exigent non nul quand il l'est vraiment.
 */
import { describe, it, expect } from 'vitest';
import { dayVariation } from '../../services/history/dayVariation';
import type { DailyPastRow } from '../../services/history/dailyPastLedger';

const ZERO = { CELI: 0, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0 };

const row = (o: Partial<DailyPastRow>): DailyPastRow =>
    ({
        date: '2026-08-10', Liquidites: 0, CELI: 0, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0,
        Immobilier: 0, DettesNonImmo: 0, NetWorth: 0, Income: 0, Expenses: 0, Savings: 0,
        NetTransferLiquid: 0, deposits: { ...ZERO }, growth: { ...ZERO }, labels: [], isDated: false,
        priceAgeMaxDays: 0, hasEstimatedPrice: false,
        ...o,
    }) as DailyPastRow;

const montant = (r: ReturnType<typeof dayVariation>, cle: string): number =>
    r!.sources.find((s) => s.cle === cle)!.montant;

describe('[PASSE-REEL-VARIATION-DU-JOUR] la ventilation explique la variation', () => {
    it('une journée de pur RENDEMENT : la courbe monte sans aucune transaction', () => {
        // Le cas qui motive le ticket : le net encaissé vaut 0 pendant que le patrimoine grimpe.
        const v = dayVariation(
            row({ NetWorth: 1_500, growth: { ...ZERO, CELI: 1_500 } }),
            row({ NetWorth: 0 }),
        )!;
        expect(v.deltaNetWorth).toBe(1_500);
        expect(montant(v, 'rendement')).toBe(1_500);
        expect(montant(v, 'tresorerie')).toBe(0);
        expect(v.residuel).toBe(0);
    });

    it('un DÉPÔT s’annule dans le total, mais reste montré à part', () => {
        // 5 000 $ quittent les liquidités pour le CELI : le patrimoine ne bouge PAS.
        // ⚠️ Le test qui empêche le double comptage — l'erreur la plus facile à commettre ici.
        const v = dayVariation(
            row({ NetWorth: 0, deposits: { ...ZERO, CELI: 5_000 }, NetTransferLiquid: 0 }),
            row({ NetWorth: 0 }),
        )!;
        expect(v.deltaNetWorth).toBe(0);
        expect(v.residuel, 'un dépôt compté dans le total créerait un résiduel de 5 000 $').toBe(0);
        expect(v.depotsInternes, 'mais il doit rester VISIBLE').toBe(5_000);
    });

    it('une DETTE qui baisse fait MONTER le patrimoine (contribution opposée au delta)', () => {
        const v = dayVariation(
            row({ NetWorth: 300, DettesNonImmo: 700 }),
            row({ NetWorth: 0, DettesNonImmo: 1_000 }),
        )!;
        expect(montant(v, 'dettes')).toBe(+300);
        expect(v.residuel).toBe(0);
    });

    it('un palier IMMOBILIER est signalé comme tel (annuel, pas journalier)', () => {
        const v = dayVariation(
            row({ NetWorth: 12_000, Immobilier: 12_000 }),
            row({ NetWorth: 0, Immobilier: 0 }),
        )!;
        expect(montant(v, 'immobilier')).toBe(12_000);
        expect(v.immobilierEstPalier, 'sinon Marc croit à un gain immobilier du jour').toBe(true);
    });

    it('plusieurs sources se COMBINENT sans résiduel', () => {
        const v = dayVariation(
            row({ NetWorth: 900, NetTransferLiquid: -100, growth: { ...ZERO, NonReg: 1_000 } }),
            row({ NetWorth: 0 }),
        )!;
        expect(v.deltaNetWorth).toBe(900);
        expect(v.residuel).toBe(0);
    });
});

describe('[PASSE-REEL-VARIATION-DU-JOUR] le résiduel est AFFICHÉ, jamais absorbé', () => {
    // ⚠️ LE test du lot. Si un jour une source manque à l'appel, le résiduel doit le RÉVÉLER.
    // Un poste « autre » qui encaisserait l'écart fermerait le total par construction : la garde
    // deviendrait circulaire et ne pourrait plus jamais détecter une source oubliée.
    it('une variation INEXPLIQUÉE ressort en résiduel, elle n’est pas noyée', () => {
        const v = dayVariation(row({ NetWorth: 4_200 }), row({ NetWorth: 0 }))!;
        expect(v.sources.every((s) => s.montant === 0), 'aucune source ne la justifie').toBe(true);
        expect(v.residuel).toBe(4_200);
    });

    it('le résiduel vaut EXACTEMENT delta − Σ(sources)', () => {
        const v = dayVariation(
            row({ NetWorth: 1_000, NetTransferLiquid: 400, growth: { ...ZERO, REER: 100 } }),
            row({ NetWorth: 0 }),
        )!;
        expect(v.residuel).toBe(1_000 - (400 + 100));
    });
});

describe('[PASSE-REEL-VARIATION-DU-JOUR] refus d’affirmer sans mesure', () => {
    // Une variation est une DIFFÉRENCE : sans la veille, il n'y a rien à dire. Rendre 0 serait un
    // chiffre crédible et faux — exactement ce que no-fake-data interdit.
    it.each([
        ['sans veille', row({ NetWorth: 10 }), null],
        ['sans jour', null, row({ NetWorth: 10 })],
    ])('%s → null, jamais un zéro crédible', (_nom, jour, veille) => {
        expect(dayVariation(jour as DailyPastRow | null, veille as DailyPastRow | null)).toBeNull();
    });

    it('un patrimoine NON FINI ne produit pas une ventilation bidon', () => {
        expect(dayVariation(row({ NetWorth: Number.NaN }), row({ NetWorth: 0 }))).toBeNull();
    });

    it('un champ de source non fini est ÉCARTÉ et se voit dans le résiduel', () => {
        // Il ne devient PAS 0 en silence : le total ne colle plus, et ça se voit.
        const v = dayVariation(
            row({ NetWorth: 1_000, growth: { ...ZERO, CELI: Number.NaN } }),
            row({ NetWorth: 0 }),
        )!;
        expect(v.residuel).toBe(1_000);
    });
});
