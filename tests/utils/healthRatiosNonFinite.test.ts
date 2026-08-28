// tests/utils/healthRatiosNonFinite.test.ts
//
// [HEALTH-RATIOS-NAN-ABSORBE-EN-AMONT] Deux métriques de santé traversaient des absorptions
// SILENCIEUSES avant d'atteindre la garde de sortie `sanitizeNonFinite` (`utils/healthScore.ts`) :
// le `clamp01` local rabattait un `NaN` à `0`, et `totalYearlyCost` JETAIT un coût annuel illisible.
// Dans les deux cas le résultat est un nombre FINI, donc crédible, donc structurellement invisible
// à une garde qui filtre le non-fini. Classe `TRACER-AU-LIEU-DE-JETER-DESARME-LA-GARDE-AVAL`.
//
// Les trois chemins ci-dessous sont MESURÉS sur le code d'avant, et ils vont dans les DEUX sens —
// c'est ce qui rend l'absorption dangereuse plutôt que seulement imprécise :
//   · cible de poste `Infinity`  → score 92,86 → **100**  (parfait, à partir d'un poste corrompu)
//   · dépense réelle `NaN`/`∞`   → score 92,86 → **0**    (« 100 % de dépassement »)
//   · coût d'abo `NaN`/`∞`       → 95 $/mois → 20 $/mois, score 87,3 → **97,3** (terme JETÉ)
//
// Le correctif expose DEUX portes : le total pour LIRE (l'écran Planning garde le droit d'afficher
// la somme des abos lisibles) et l'inventaire des termes écartés pour ÉCRIRE (un calcul qui publie
// un score REFUSE). Le refus est `null` — l'état « — » que l'UI rend déjà — jamais un nombre.

import { describe, it, expect, beforeEach } from 'vitest';
import { computeBudgetParityScore, computeSubscriptionLoadScore, subscriptionsMonthlyCost } from '../../utils/healthRatios';
import { totalYearlyCost, totalYearlyCostAudit } from '../../utils/subscriptions';
import { clearErrors, filterErrors, __resetErrorThrottle } from '../../services/errorLogger';
import type { BudgetCategory, RecurringItem } from '../../types';

const items = (target: number): BudgetCategory[] => ([
    { id: 'b1', name: 'Loyer', target, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
    { id: 'b2', name: 'Épicerie', target: 600, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
]);
const ACTUALS = { Loyer: 1600, 'Épicerie': 650 };
// Fixture COMPLÈTE au type (pas de `as` qui masquerait un champ manquant) : une fixture aux
// mauvais noms de champs est une fixture VIDE, absorbée en silence par les `|| 0` de production
// (leçon `UNE-FIXTURE-AUX-MAUVAIS-NOMS-DE-CHAMPS-EST-UNE-FIXTURE-VIDE`, payée au lot 30).
const sub = (payee: string, yearlyCost: number): RecurringItem => ({
    payee, yearlyCost, averageAmount: yearlyCost / 12, dayOfMonth: 5, category: 'Abonnements', lastDate: '2026-08-05',
});
const subs = (yearlyCost: number): RecurringItem[] => [sub('Netflix', 240), sub('Gym', yearlyCost)];

const warnings = () => filterErrors({ source: 'storage', severity: 'warning' });

beforeEach(() => {
    clearErrors();
    __resetErrorThrottle();
});

describe('[HEALTH-RATIOS-NAN-ABSORBE-EN-AMONT] les entrées non finies REFUSENT au lieu de se rabattre', () => {
    it('ANTI-VACUITÉ : sur les mêmes fixtures SAINES, les trois scores sont calculés et intermédiaires', () => {
        // Sans ce cas, tout ce qui suit serait satisfait par des fonctions qui rendent toujours null.
        const parity = computeBudgetParityScore(ACTUALS, items(1500));
        const load = computeSubscriptionLoadScore(subs(900), 5000);
        expect(parity).not.toBeNull();
        expect(parity!).toBeGreaterThan(0);
        expect(parity!).toBeLessThan(100); // il y a bien un dépassement mesuré, ni 0 ni 100
        expect(load).not.toBeNull();
        expect(load!).toBeGreaterThan(0);
        expect(load!).toBeLessThan(100);
        expect(subscriptionsMonthlyCost(subs(900))).toBeCloseTo(95, 5);
        expect(warnings()).toHaveLength(0); // aucune fausse alerte sur le cas nominal
    });

    it('cible de poste NON FINIE → null (elle rendait le score PARFAIT de 100)', () => {
        // `target: Infinity` → `overspend / ∞ = 0` → 100. Un poste corrompu certifiait
        // « tu tiens parfaitement tes cibles ».
        expect(computeBudgetParityScore(ACTUALS, items(Infinity))).toBeNull();
        expect(warnings().some((e) => e.message.includes('cible de poste'))).toBe(true);
    });

    it('dépense réelle NON FINIE → null (elle rendait 0, soit « 100 % de dépassement »)', () => {
        for (const bad of [NaN, Infinity, -Infinity]) {
            __resetErrorThrottle();
            expect(computeBudgetParityScore({ ...ACTUALS, Loyer: bad }, items(1500))).toBeNull();
        }
        expect(warnings().some((e) => e.message.includes('dépense réelle'))).toBe(true);
    });

    it('coût d\'abonnement NON FINI → null (le terme JETÉ allégeait le fardeau donc MONTAIT le score)', () => {
        for (const bad of [NaN, Infinity, -Infinity]) {
            __resetErrorThrottle();
            expect(computeSubscriptionLoadScore(subs(bad), 5000)).toBeNull();
        }
        expect(warnings().some((e) => e.message.includes('abonnement'))).toBe(true);
    });

    it('les DEUX portes existent : le total LIT (et écarte), l\'audit compte ce qui a été écarté', () => {
        // La porte de lecture reste inchangée — `Planning.tsx` affiche la somme des abos LISIBLES,
        // ce qui est le bon comportement pour un écran. C'est le CALCUL qui doit refuser.
        expect(totalYearlyCost(subs(900))).toBe(1140);
        expect(totalYearlyCostAudit(subs(900))).toEqual({ total: 1140, discarded: 0 });
        expect(totalYearlyCost(subs(Infinity))).toBe(240); // écarté, total plus PETIT
        expect(totalYearlyCostAudit(subs(Infinity))).toEqual({ total: 240, discarded: 1 });
        // Discriminant de la porte : sans `discarded`, ces deux cas sont indiscernables d'un abo
        // qui coûterait réellement 0 $ — c'est ça qui rendait l'absorption invisible.
        expect(totalYearlyCost(subs(0))).toBe(240);
        expect(totalYearlyCostAudit(subs(0)).discarded).toBe(0);
    });

    it('le dernier filet `clamp01` TRACE désormais s\'il tire (il ne devrait plus jamais)', () => {
        // Les gardes d'entrée le rendent inatteignable par les chemins connus. S'il tirait quand
        // même, ce serait un chemin NOUVEAU — il doit crier, pas rabattre en silence.
        // On vérifie le contrat par les gardes amont : aucun appel sain ne le déclenche.
        computeBudgetParityScore(ACTUALS, items(1500));
        computeSubscriptionLoadScore(subs(900), 5000);
        expect(warnings().some((e) => e.message.includes('rabattu à 0'))).toBe(false);
    });
});
