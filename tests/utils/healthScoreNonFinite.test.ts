// tests/utils/healthScoreNonFinite.test.ts
//
// [HEALTH-SCORE-NAN-SILENCIEUX] Une métrique au score non fini contaminait le score pondéré :
// `clamp01` ne neutralise pas `NaN` (`Math.max(0, Math.min(100, NaN))` = `NaN`) et
// `computeHealthTotalScore` sommait sans garde → les DEUX surfaces (carte détaillée du sous-onglet
// Santé, résumé condensé de Futur) affichaient littéralement « NaN/100 », sans aucune trace.
//
// Le chemin est MESURÉ, pas supposé : parmi les entrées sondées (montant de poste NaN/Infinity,
// solde NaN, prix d'actif NaN, cible FIRE Infinity — toutes absorbées en amont), une SEULE
// contamine encore le total : `netSalary: Infinity`. `|| 0` ne la rattrape pas (Infinity est
// truthy) et `JSON.parse` la PRODUIT à partir d'un blob Drive/backup contenant `1e999`.
//
// Contrat vérifié : jamais un score inventé (règle no-fake-data — `0` serait CRÉDIBLE et faux),
// mais l'état « — » déjà rendu par l'UI (`available: false`), le reste des métriques INTACT,
// et une trace `logError` au lieu du silence.

import { describe, it, expect, beforeEach } from 'vitest';
import { computeHealthMetrics, computeHealthTotalScore, colorForHealthScore, HEALTH_SCORE_UNKNOWN_COLORS, type HealthMetricRow, type HealthScoreInputs } from '../../utils/healthScore';
import { clearErrors, filterErrors, __resetErrorThrottle } from '../../services/errorLogger';
import type { HealthWeights } from '../../types';

const WEIGHTS: HealthWeights = {
    savingsRate: 25, emergencyFund: 25, debtRatio: 20,
    fireProgress: 15, budgetParity: 10, subscriptionLoad: 5,
};

function inputs(overrides: Partial<HealthScoreInputs> = {}): HealthScoreInputs {
    return {
        config: { users: [{ name: 'Moi', netSalary: 5000 }] } as unknown as HealthScoreInputs['config'],
        budgetItems: [{ id: 'b1', name: 'Loyer', target: 1500, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' }] as unknown as HealthScoreInputs['budgetItems'],
        debts: [],
        assets: [],
        initialBalances: { LIQUIDITE: 20000 },
        transactions: [],
        // ⚠️ Abonnements ÉPINGLÉS non vides (finding financial-integrity, panel PR #756) : avec
        // `subscriptions: []`, `subscriptionLoad` est `available:false` par construction et toute
        // assertion à son sujet est VACUEUSE — or c'est précisément la métrique qui fabriquait un
        // score parfait sous revenu `Infinity` (classe `UNE-GARDE-NE-COUVRE-QUE-CE-QUE-SA-FIXTURE-REND-NON-NUL`).
        subscriptions: [{ id: 's1', name: 'Netflix', yearlyCost: 240 }, { id: 's2', name: 'Gym', yearlyCost: 900 }] as unknown as HealthScoreInputs['subscriptions'],
        fxRates: { USD: 1.35 },
        projectionFireTarget: 1_000_000,
        ...overrides,
    };
}

const infiniteSalary = () => inputs({
    config: { users: [{ name: 'Moi', netSalary: Infinity }] } as unknown as HealthScoreInputs['config'],
});

beforeEach(() => {
    clearErrors();
    __resetErrorThrottle();
});

describe('[HEALTH-SCORE-NAN-SILENCIEUX] une métrique non finie n\'empoisonne plus le score', () => {
    it('anti-vacuité : sur la MÊME fixture saine, le total est fini et le taux d\'épargne est DISPONIBLE', () => {
        // Sans ce cas, tout ce qui suit serait satisfait par un code qui rend tout indisponible.
        const rows = computeHealthMetrics(inputs());
        const savings = rows.find((r) => r.id === 'savingsRate')!;
        expect(savings.available).toBe(true);
        expect(Number.isFinite(savings.value)).toBe(true);
        expect(Number.isFinite(computeHealthTotalScore(rows, WEIGHTS))).toBe(true);
        expect(filterErrors({ severity: 'warning' })).toHaveLength(0); // aucune fausse alerte sur le cas nominal
    });

    it('netSalary = Infinity : le total reste un NOMBRE affichable (le défaut rendait « NaN/100 »)', () => {
        const rows = computeHealthMetrics(infiniteSalary());
        const total = computeHealthTotalScore(rows, WEIGHTS);
        expect(Number.isFinite(total)).toBe(true);
        expect(total).toBeGreaterThanOrEqual(0);
        expect(total).toBeLessThanOrEqual(100);
    });

    it('la métrique contaminée passe à « — » (available:false), JAMAIS à un 0 crédible', () => {
        const rows = computeHealthMetrics(infiniteSalary());
        const savings = rows.find((r) => r.id === 'savingsRate')!;
        expect(savings.available).toBe(false); // l'UI rend « — » sur ce drapeau
        expect(savings.raw).toContain('Donnée invalide');
        expect(savings.help).toContain('n\'est pas un nombre exploitable');
    });

    it('les AUTRES métriques restent intactes (l\'assainissement est ciblé, pas un reset global)', () => {
        const sain = computeHealthMetrics(inputs());
        const pollue = computeHealthMetrics(infiniteSalary());
        for (const id of ['emergencyFund', 'debtRatio', 'fireProgress', 'budgetParity'] as const) {
            const a = sain.find((r) => r.id === id)!;
            const b = pollue.find((r) => r.id === id)!;
            expect(b.available, `${id} ne doit pas être dégradée`).toBe(a.available);
            expect(b.value, `${id} ne doit pas changer de valeur`).toBe(a.value);
        }
        // Et la mesure DISCRIMINE : ces métriques-là sont bien disponibles et non nulles.
        expect(pollue.find((r) => r.id === 'emergencyFund')!.available).toBe(true);
        expect(pollue.find((r) => r.id === 'emergencyFund')!.value).toBeGreaterThan(0);
    });

    it('le POIDS DES ABONNEMENTS ne fabrique plus un 100 parfait sous revenu Infinity', () => {
        // Finding financial-integrity MESURÉ : `Infinity > 0` est VRAI, donc
        // `computeSubscriptionLoadScore` calculait `95 / Infinity = 0` → score PARFAIT 100 (au lieu
        // de 87) avec le libellé « 0,0 % du revenu net », un fait FAUX. Valeur FINIE, donc
        // `sanitizeNonFinite` ne pouvait structurellement pas la voir : c'est la garde d'ENTRÉE
        // qui devait refuser.
        const sain = computeHealthMetrics(inputs()).find((r) => r.id === 'subscriptionLoad')!;
        const pollue = computeHealthMetrics(infiniteSalary()).find((r) => r.id === 'subscriptionLoad')!;
        // Anti-vacuité : sur le cas sain la métrique est bien COMPTÉE, avec un score strictement
        // intermédiaire (ni 0 ni 100) — sinon « ce n'est plus 100 » ne dirait rien.
        expect(sain.available).toBe(true);
        expect(sain.value).toBeGreaterThan(0);
        expect(sain.value).toBeLessThan(100);
        expect(sain.raw).toContain('du revenu net');
        // Sous corruption : exclue, et surtout PAS un 100 compté au dénominateur.
        expect(pollue.available).toBe(false);
        expect(pollue.raw).not.toContain('0,0 % du revenu net');
    });

    it('une trace est écrite (le silence était le vrai défaut), et une SEULE malgré N appels', () => {
        computeHealthMetrics(infiniteSalary());
        computeHealthMetrics(infiniteSalary());
        computeHealthMetrics(infiniteSalary());
        const traces = filterErrors({ source: 'storage', severity: 'warning' })
            .filter((e) => e.message.includes('non fini'));
        expect(traces).toHaveLength(1); // throttlé par signature : un re-rendu ne spamme pas le journal
        expect(traces[0].message).toContain('Santé financière');
        expect((traces[0].context as { metriques?: string[] })?.metriques).toEqual(['savingsRate']);
    });

    it('AUCUNE métrique mesurable → `null`, JAMAIS 0 (qui s\'afficherait « 0/100 » en ROUGE)', () => {
        // Chemin RENDU ATTEIGNABLE par sanitizeNonFinite : avant ce lot, les trois métriques de base
        // étaient `available: true` en dur, donc `counted` ne pouvait pas être vide et le repli
        // `: 0` était une branche MORTE. Une corruption large peut désormais les exclure toutes.
        const rows = computeHealthMetrics(inputs()).map((r) => ({ ...r, available: false }));
        expect(computeHealthTotalScore(rows, WEIGHTS)).toBeNull();
        // Et la contre-épreuve : `0` aurait été peint en DANGER (« santé critique » à tort).
        expect(colorForHealthScore(0).ring).toContain('danger');
        expect(HEALTH_SCORE_UNKNOWN_COLORS.ring).not.toContain('danger');
    });

    it('des poids TOUS à zéro rendent aussi `null` (dénominateur nul, rien de mesurable)', () => {
        const rows = computeHealthMetrics(inputs());
        expect(rows.some((r) => r.available)).toBe(true); // anti-vacuité : il y a bien des métriques
        const zero = { savingsRate: 0, emergencyFund: 0, debtRatio: 0, fireProgress: 0, budgetParity: 0, subscriptionLoad: 0 };
        expect(computeHealthTotalScore(rows, zero)).toBeNull();
    });

    it('un poste de budget illisible rend « — » le taux d\'épargne ET le coussin, pas des 0 alarmants', () => {
        // [HEALTH-RATIOS-NAN-ABSORBE-EN-AMONT] Le MÊME champ corrompu empoisonnait quatre métriques,
        // pas une. Mesuré sur `target: Infinity` avant correctif : taux d'épargne **0**
        // (« tu épargnes 0 % de ton revenu »), coussin **0** (« 0 mois »), et le score global
        // tombait de 74 à **21** — trois chiffres alarmants, plausibles et faux, sur les DEUX
        // surfaces qui affichent la santé.
        const sain = computeHealthMetrics(inputs());
        const g = (rows: HealthMetricRow[], id: string) => rows.find((r) => r.id === id)!;
        // Anti-vacuité : sur le cas sain, les deux métriques sont bien COMPTÉES et non nulles.
        expect(g(sain, 'savingsRate').available).toBe(true);
        expect(g(sain, 'emergencyFund').available).toBe(true);
        expect(g(sain, 'emergencyFund').value).toBeGreaterThan(0);

        for (const bad of [Infinity, NaN, -Infinity]) {
            const items = [{ ...inputs().budgetItems[0], target: bad }];
            const rows = computeHealthMetrics(inputs({ budgetItems: items }));
            expect(g(rows, 'savingsRate').available, `épargne sous target ${String(bad)}`).toBe(false);
            expect(g(rows, 'emergencyFund').available, `coussin sous target ${String(bad)}`).toBe(false);
            expect(Number.isFinite(computeHealthTotalScore(rows, WEIGHTS) ?? 0)).toBe(true);
        }
    });

    it('un refus affiche sa PROPRE cause, pas le message de l\'état vide voisin', () => {
        // [finding financial-integrity, panel PR #757] Le lot remplaçait un score faux par un
        // DIAGNOSTIC faux : « Revenu requis » alors que le revenu valait 5 000 $/mois, et
        // « Dépenses non rapprochées à un poste budget » alors qu'elles l'étaient. L'utilisateur
        // partait corriger le mauvais champ.
        const d = new Date();
        const prev = new Date(d.getFullYear(), d.getMonth() - 1, 10);
        const ym = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
        const transactions = [
            { id: 't1', date: `${ym}-05`, payee: 'Proprio', amount: -1600, category: 'Loyer' },
            { id: 't2', date: `${ym}-08`, payee: 'IGA', amount: -650, category: 'Épicerie' },
        ] as unknown as HealthScoreInputs['transactions'];
        const budgetItems = [
            { id: 'b1', name: 'Loyer', target: 1500, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
            { id: 'b2', name: 'Épicerie', target: 600, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
        ] as unknown as HealthScoreInputs['budgetItems'];
        const find = (rows: HealthMetricRow[], id: string) => rows.find((r) => r.id === id)!;

        // Anti-vacuité : sur la fixture SAINE, les deux métriques sont bien COMPTÉES — sans ça,
        // « le message a changé » serait satisfait par des métriques toujours indisponibles.
        const sain = computeHealthMetrics(inputs({ transactions, budgetItems }));
        expect(find(sain, 'budgetParity').available).toBe(true);
        expect(find(sain, 'subscriptionLoad').available).toBe(true);

        // Cible illisible → le libellé nomme la CIBLE, pas le rapprochement.
        const bad = budgetItems.map((b, i) => (i === 0 ? { ...b, target: NaN } : b)) as typeof budgetItems;
        const pollue = computeHealthMetrics(inputs({ transactions, budgetItems: bad }));
        const parity = find(pollue, 'budgetParity');
        expect(parity.available).toBe(false);
        expect(parity.raw).toContain('illisible');
        expect(parity.raw).not.toContain('non rapprochées');

        // Coût d'abo illisible → le libellé nomme l'ABONNEMENT, pas le revenu.
        const subsKo = [
            { payee: 'Netflix', yearlyCost: 240, averageAmount: 20, dayOfMonth: 5, category: 'Abo', lastDate: '2026-08-05' },
            { payee: 'Gym', yearlyCost: Infinity, averageAmount: 75, dayOfMonth: 5, category: 'Abo', lastDate: '2026-08-05' },
        ] as unknown as HealthScoreInputs['subscriptions'];
        const load = find(computeHealthMetrics(inputs({ transactions, budgetItems, subscriptions: subsKo })), 'subscriptionLoad');
        expect(load.available).toBe(false);
        expect(load.raw).toContain('illisible');
        expect(load.raw).not.toContain('Revenu requis');
    });

    it('[ceinture] computeHealthTotalScore ignore une ligne non finie venue d\'ailleurs', () => {
        // La fonction est exportée : elle ne peut pas supposer que ses lignes viennent
        // de `computeHealthMetrics`.
        const rows: HealthMetricRow[] = [
            { id: 'savingsRate', label: 'A', value: NaN, raw: '', help: '', available: true },
            { id: 'emergencyFund', label: 'B', value: 80, raw: '', help: '', available: true },
        ];
        expect(computeHealthTotalScore(rows, WEIGHTS)).toBe(80); // la ligne saine seule, pas NaN
    });
});
