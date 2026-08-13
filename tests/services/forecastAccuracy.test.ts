// tests/services/forecastAccuracy.test.ts
//
// [PASSE-REEL-2] « À quel point mon passé correspond au futur qui était estimé ? » (Marc, 2026-08-13)
//
// ⚠️ La RÉFÉRENCE est la courbe VERROUILLÉE, jamais une projection recalculée. Une projection
// recalculée PART des soldes réels du jour : elle colle au passé par construction, l'écart serait
// nul, et l'indicateur dirait éternellement « tout va bien ». Un indicateur qui ne peut pas être
// mauvais ne vaut rien. Ces tests verrouillent surtout les cas où la fonction doit rendre `null` —
// c'est là que se joue le no-fake-data : `null` s'affiche « — », jamais « 0 % d'écart », qui se
// lirait « ta prévision était parfaite ».
import { describe, it, expect } from 'vitest';
import { computeForecastAccuracy } from '../../services/projection/forecastAccuracy';
import type { ProjectionChartPoint } from '../../services/projection/types';

/**
 * Un point de passé RÉEL, tel que `dailyCurve.ts` le construit quand une MESURE existe : il porte
 * le marqueur `dayIsReal: true`. C'est le seul champ qui distingue une mesure d'une prévision.
 */
const jour = (dayIso: string, hostMonthIndex: number, NetWorth: number) =>
    ({ dayIso, hostMonthIndex, NetWorth, monthIndex: hostMonthIndex, dayIsReal: true } as unknown as ProjectionChartPoint);

/**
 * Un jour FUTUR projeté, tel que `dailyCurve.ts` le construit quand aucune mesure n'existe :
 * `{ ...d, monthIndex }` — il charrie `dayIso`, `hostMonthIndex` et un `NetWorth` parfaitement
 * fini, et n'a PAS `dayIsReal`. Indiscernable d'une mesure pour qui garde sur `dayIso`.
 */
const jourProjete = (dayIso: string, hostMonthIndex: number, NetWorth: number) =>
    ({ dayIso, hostMonthIndex, NetWorth, monthIndex: hostMonthIndex } as unknown as ProjectionChartPoint);

describe('[PASSE-REEL-2] computeForecastAccuracy — quand il n\'y a RIEN à dire, il ne dit rien', () => {
    it('pas de courbe verrouillée → null (et surtout pas « 0 % »)', () => {
        expect(computeForecastAccuracy([jour('2026-01-31', 0, 100)], null)).toBeNull();
    });

    it('verrou vide → null', () => {
        expect(computeForecastAccuracy([jour('2026-01-31', 0, 100)], new Map())).toBeNull();
    });

    it('aucun passé mesuré → null', () => {
        expect(computeForecastAccuracy([], new Map([[0, 100]]))).toBeNull();
    });

    it('passé et verrou sans AUCUN mois commun → null', () => {
        // Le verrou ne couvre que le mois 5, le passé que le mois 0 : rien de comparable.
        expect(computeForecastAccuracy([jour('2026-01-31', 0, 100)], new Map([[5, 100]]))).toBeNull();
    });

    it('un point mensuel SANS marqueur de mesure est ignoré : rien ne prouve qu\'il vient d\'une mesure', () => {
        const pointMensuel = { hostMonthIndex: 0, NetWorth: 999, monthIndex: 0 } as unknown as ProjectionChartPoint;
        expect(computeForecastAccuracy([pointMensuel], new Map([[0, 100]]))).toBeNull();
    });

    // ── LE test discriminant : il ÉCHOUE sur la garde d'avant (`typeof dayIso === 'string'`). ──
    it('une série de jours FUTURS projetés ne produit AUCUN écart — ce n\'est pas du passé mesuré', () => {
        // `dailyAll` (le vrai argument d'appel) contient les 30 ans de projection quotidienne. Ces
        // points portent `dayIso` : une garde sur `dayIso` les prenait pour des mesures et
        // comparait la prévision COURANTE à la prévision VERROUILLÉE — un écart entre deux
        // prévisions, présenté à Marc comme « ton réel ». Sans mesure, il n'y a rien à dire.
        const futur = [jourProjete('2030-01-31', 48, 500_000), jourProjete('2030-02-28', 49, 510_000)];
        expect(computeForecastAccuracy(futur, new Map([[48, 400_000], [49, 405_000]]))).toBeNull();
    });
});

describe('[PASSE-REEL-2] computeForecastAccuracy — l\'écart', () => {
    it('compare le DERNIER jour mesuré du mois à la prévision de ce mois', () => {
        // La prévision verrouillée est un point de FIN de mois : comparer un solde du 3 à une
        // prévision du 31 fabriquerait un écart qui n'est que du décalage de calendrier.
        const r = computeForecastAccuracy(
            [jour('2026-01-03', 0, 50), jour('2026-01-31', 0, 120)],
            new Map([[0, 100]]),
        );
        expect(r).not.toBeNull();
        expect(r!.latest.real, 'ce n\'est pas le DERNIER jour du mois qui a été retenu').toBe(120);
        expect(r!.latest.gap).toBe(20);
        expect(r!.latest.gapPct).toBeCloseTo(0.2, 6);
    });

    it('gap POSITIF = mieux que prévu, NÉGATIF = moins bien', () => {
        const mieux = computeForecastAccuracy([jour('2026-01-31', 0, 120)], new Map([[0, 100]]));
        const moins = computeForecastAccuracy([jour('2026-01-31', 0, 80)], new Map([[0, 100]]));
        expect(mieux!.latest.gap).toBeGreaterThan(0);
        expect(moins!.latest.gap).toBeLessThan(0);
        expect(mieux!.monthsAhead).toBe(1);
        expect(moins!.monthsAhead).toBe(0);
    });

    it('une prévision à 0 $ rend gapPct null — jamais Infinity, jamais 0', () => {
        const r = computeForecastAccuracy([jour('2026-01-31', 0, 500)], new Map([[0, 0]]));
        expect(r!.latest.gap).toBe(500);
        expect(r!.latest.gapPct, 'division par zéro : le pourcentage est INDÉFINI, pas nul').toBeNull();
    });

    it('meanAbsGap mesure la FIDÉLITÉ, pas la position — +50 puis −50 n\'est pas « juste en moyenne »', () => {
        const r = computeForecastAccuracy(
            [jour('2026-01-31', 0, 150), jour('2026-02-28', 1, 50)],
            new Map([[0, 100], [1, 100]]),
        );
        expect(r!.months).toHaveLength(2);
        // La moyenne SIGNÉE vaudrait 0 et masquerait deux erreurs de 50.
        expect(r!.meanAbsGap).toBe(50);
        expect(r!.latest.monthIndex, 'le « dernier » doit être le plus RÉCENT').toBe(1);
    });

    it('un NetWorth non fini est traité comme ABSENT, pas comme 0', () => {
        const r = computeForecastAccuracy(
            [jour('2026-01-31', 0, NaN), jour('2026-02-28', 1, 120)],
            new Map([[0, 100], [1, 100]]),
        );
        expect(r!.months, 'le mois au NetWorth NaN a été compté').toHaveLength(1);
        expect(r!.latest.monthIndex).toBe(1);
    });

    // Le cas d'appel RÉEL : `dailyAll` = passé mesuré PUIS futur projeté, dans la même série.
    it('série MIXTE : « le plus récent » est le dernier mois MESURÉ, pas le dernier de la projection', () => {
        const r = computeForecastAccuracy(
            [
                jour('2026-01-31', 0, 120),          // mesuré
                jour('2026-02-28', 1, 140),          // mesuré — c'est LUI, le plus récent réel
                jourProjete('2026-03-31', 2, 900),   // projeté : à ne PAS compter
                jourProjete('2030-12-31', 59, 9_000),
            ],
            new Map([[0, 100], [1, 100], [2, 100], [59, 100]]),
        );
        expect(r!.months.map((mo) => mo.monthIndex), 'un mois projeté a été compté').toEqual([0, 1]);
        expect(r!.latest.real).toBe(140);
        expect(r!.latest.gap).toBe(40);
        // Avec la garde d'avant, meanAbsGap intégrait des écarts à 4 chiffres venus de la projection.
        expect(r!.meanAbsGap).toBe(30);
    });

    it('les mois sont rendus du plus ANCIEN au plus récent, quel que soit l\'ordre d\'entrée', () => {
        const r = computeForecastAccuracy(
            [jour('2026-03-31', 2, 300), jour('2026-01-31', 0, 100), jour('2026-02-28', 1, 200)],
            new Map([[0, 100], [1, 100], [2, 100]]),
        );
        expect(r!.months.map((mo) => mo.monthIndex)).toEqual([0, 1, 2]);
    });
});
