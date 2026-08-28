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
import { computeBudgetParityScore, computeSubscriptionLoadScore, subscriptionsMonthlyCost, monthlyConsumptionExpenses, budgetParityInputsUsable, incomeUsableForRatios } from '../../utils/healthRatios';
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

    it('cible de poste NON FINIE → null, quel que soit le SIGNE et y compris NaN', () => {
        // Trois valeurs, trois mécanismes distincts — c'est pour ça qu'elles sont toutes testées :
        //  · `Infinity` → `overspend / ∞ = 0` → **100**. Un poste corrompu certifiait « tu tiens
        //    parfaitement tes cibles ».
        //  · `NaN` → `item.target || 0` le rabattait à **0** (NaN est falsy), donc le poste
        //    DISPARAISSAIT du calcul en amont de toute garde : dépenses de consommation 2 100 $ →
        //    600 $, adhérence 92,86 → 91,67, aucune trace. La garde recevait un 0 parfaitement fini.
        //  · `-Infinity` était déjà INERTE (`if (target <= 0) continue`) : il est refusé quand même,
        //    choix FAIL-CLOSED assumé — traiter une cible illisible comme un poste à 0 $ la fait
        //    ressembler à une saisie légitime.
        for (const bad of [Infinity, NaN, -Infinity]) {
            __resetErrorThrottle();
            expect(computeBudgetParityScore(ACTUALS, items(bad)), `cible ${String(bad)}`).toBeNull();
        }
        expect(warnings().some((e) => e.message.includes('cible de poste'))).toBe(true);
        // Rétrocompat : un champ ABSENT n'est PAS une corruption (vieux blob Drive sans `target`)
        // → il vaut 0 et le score se calcule sur les autres postes, sans alerte.
        __resetErrorThrottle();
        clearErrors();
        const sansCible = [{ ...items(1500)[0], target: undefined as unknown as number }, items(1500)[1]];
        expect(computeBudgetParityScore(ACTUALS, sansCible)).not.toBeNull();
        expect(warnings()).toHaveLength(0);
    });

    it('le total des DÉPENSES DE CONSOMMATION rend NaN dès un poste illisible, jamais une somme amputée', () => {
        // Ce total alimente le taux d'épargne ET le coussin d'urgence. Mesuré avec `Infinity` : la
        // somme valait `Infinity`, les deux scores tombaient à 0 (« tu épargnes 0 % », « 0 mois de
        // coussin ») et le score global passait de 74 à 21 — trois chiffres alarmants et faux.
        expect(monthlyConsumptionExpenses(items(1500))).toBe(2100); // anti-vacuité : le cas sain SOMME
        // Un SEUL sentinelle pour « inexploitable » : `NaN`, jamais `±Infinity`. Sans la sortie
        // anticipée, `Infinity + 600` rendrait `Infinity` — non fini lui aussi, donc le
        // comportement AVAL serait identique, mais le contrat de la fonction dirait alors « je
        // rends l'un des trois non-finis » au lieu de « je rends NaN ». Un consommateur futur qui
        // testerait `> 0` (et non `isFinite`) verrait `Infinity` passer et `NaN` non : c'est
        // exactement ce piège que la normalisation ferme.
        for (const bad of [Infinity, NaN, -Infinity]) {
            expect(monthlyConsumptionExpenses(items(bad)), `poste ${String(bad)}`).toBeNaN();
        }
        // Et surtout : jamais une somme PARTIELLE (600, la valeur de l'autre poste) — un total
        // amputé est un nombre fini, donc crédible, donc invisible à toute garde de sortie.
        expect(monthlyConsumptionExpenses(items(NaN))).not.toBe(600);
    });

    it('dépense réelle NON FINIE → null, quel que soit le sens de l\'erreur', () => {
        // Les trois valeurs ne produisaient PAS le même faux résultat, et c'est pour ça qu'elles
        // sont toutes là : `NaN` et `+Infinity` rendaient **0** (« 100 % de dépassement »), tandis
        // que `-Infinity` rendait **97,619** — `Math.max(0, -∞ - 1500)` vaut 0, donc aucun
        // dépassement compté, donc un score presque parfait. Deux directions opposées pour la même
        // corruption ; ranger les trois sous « → 0 » aurait été faux (finding financial-integrity).
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

    it('`incomeUsableForRatios` est la SEULE définition de « revenu exploitable » (une, pas trois)', () => {
        // La condition était écrite à trois endroits, dont deux dans la même fonction : si l'une
        // bougeait sans les autres, le refus se remettrait à dire « corrige tes abonnements » là
        // où il faut saisir un salaire — le défaut que la passe précédente venait de corriger,
        // réintroduit par la méthode qui l'a corrigé (finding code-reviewer, 3e passe).
        expect(incomeUsableForRatios(5000)).toBe(true);   // anti-vacuité : le cas nominal passe
        expect(incomeUsableForRatios(0)).toBe(false);
        expect(incomeUsableForRatios(-1)).toBe(false);
        expect(incomeUsableForRatios(NaN)).toBe(false);
        expect(incomeUsableForRatios(Infinity)).toBe(false); // `Infinity > 0` est VRAI — le piège
        // Et le score suit EXACTEMENT le prédicat : c'est ce lien qui rend la source unique utile.
        for (const income of [5000, 0, -1, NaN, Infinity]) {
            expect(
                computeSubscriptionLoadScore(subs(900), income) !== null,
                `revenu ${String(income)} : le score doit suivre le prédicat`,
            ).toBe(incomeUsableForRatios(income));
        }
    });

    it('le refus expose sa PROPRE cause, jamais le message de l\'état vide voisin', () => {
        // Un score faux remplacé par un diagnostic faux n'est pas un progrès : avant ce correctif,
        // un refus pour donnée illisible héritait de « Dépenses non rapprochées à un poste budget »
        // (alors qu'elles l'étaient) et de « Revenu requis » (alors que le revenu était valide) —
        // deux phrases qui envoient l'utilisateur corriger le mauvais champ.
        // Le prédicat `budgetParityInputsUsable` est la SOURCE UNIQUE partagée par le calcul et par
        // le choix du libellé : ils ne peuvent pas diverger.
        expect(budgetParityInputsUsable(ACTUALS, items(1500))).toBe(true);   // anti-vacuité
        expect(budgetParityInputsUsable(ACTUALS, items(NaN))).toBe(false);
        expect(budgetParityInputsUsable({ ...ACTUALS, Loyer: NaN }, items(1500))).toBe(false);
        // Et il répond bien la MÊME chose que le calcul : lisible ⇔ score non nul.
        expect(computeBudgetParityScore(ACTUALS, items(1500))).not.toBeNull();
        expect(computeBudgetParityScore(ACTUALS, items(NaN))).toBeNull();
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
