// tests/utils/healthScoreSourceUnique.test.tsx
// [NAV-MERGE-SANTE-FUTUR] Garde de SOURCE UNIQUE du score de santé.
//
// Le calcul a été extrait de `HealthIndicator.tsx` vers `utils/healthScore.ts` précisément pour que
// la carte détaillée (Budget → Santé) et le résumé condensé (tête de Futur) ne puissent PAS diverger.
// Rien ne garantissait ça : les deux composants lisent le store CHACUN de leur côté, et un futur
// consommateur qui oublierait un repli (`?? EMPTY_SUBS`) ou un sélecteur ferait re-diverger les deux
// chiffres en silence — l'utilisateur verrait deux scores différents pour la même chose, sur deux
// écrans, sans qu'aucun test ne rougisse (finding financial-integrity, panel PR #755).
//
// Ce test monte les DEUX composants sur le MÊME état et compare le nombre RENDU, pas le retour de la
// fonction partagée : viser la fonction serait tautologique (elle est partagée par construction),
// c'est le CÂBLAGE de chaque consommateur qui peut diverger.

import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { HealthIndicator } from '../../components/dashboard/HealthIndicator';
import { FutureHealthSummary } from '../../components/future/FutureHealthSummary';

const initialState = useFinanceStore.getState();

/** Extrait le score entier affiché (`NN` du donut, ou `NN/100` du résumé condensé). */
function scoreRendu(container: HTMLElement): number {
    const m = (container.textContent ?? '').match(/(\d{1,3})\s*\/?\s*100/);
    expect(m, 'aucun score /100 rendu').not.toBeNull();
    return Number(m![1]);
}

describe('[NAV-MERGE-SANTE-FUTUR] le score de santé est le MÊME aux deux endroits', () => {
    beforeEach(() => {
        useFinanceStore.setState(initialState, true);
    });

    // Trois profils volontairement CONTRASTÉS : un score identique par coïncidence (deux fois 0,
    // deux fois 100) ne prouverait rien — il faut que le nombre soit non trivial et qu'il BOUGE
    // d'un cas à l'autre, sinon la comparaison est vacueuse.
    const profils: Array<{ nom: string; patch: () => void }> = [
        {
            nom: 'salarié sans dette ni actif',
            patch: () => useFinanceStore.setState({
                config: {
                    ...initialState.config,
                    users: [
                        { ...initialState.config.users[0], name: 'Marc', grossSalary: 7000, netSalary: 5000 },
                        { ...initialState.config.users[1], name: '' },
                    ],
                },
            }),
        },
        {
            nom: 'endetté avec budget chargé',
            patch: () => useFinanceStore.setState({
                config: {
                    ...initialState.config,
                    users: [
                        { ...initialState.config.users[0], name: 'Marc', grossSalary: 4000, netSalary: 3000 },
                        { ...initialState.config.users[1], name: '' },
                    ],
                },
                budgetItems: [
                    { id: 'b1', name: 'Loyer', target: 2200, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
                ],
                debts: [
                    { id: 'd1', name: 'Prêt auto', balance: 30000, interestRate: 7, minimumPayment: 500, category: 'Car' },
                ],
            } as never),
        },
        {
            nom: 'épargnant avec liquidités',
            patch: () => useFinanceStore.setState({
                config: {
                    ...initialState.config,
                    users: [
                        { ...initialState.config.users[0], name: 'Marc', grossSalary: 12000, netSalary: 9000 },
                        { ...initialState.config.users[1], name: '' },
                    ],
                },
                budgetItems: [
                    { id: 'b1', name: 'Loyer', target: 1500, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' },
                ],
                initialBalances: { 'Compte chèque': 60000 },
            } as never),
        },
    ];

    const vus = new Set<number>();

    for (const { nom, patch } of profils) {
        it(`${nom} : carte détaillée et résumé condensé affichent le même score`, () => {
            patch();
            const detail = render(<HealthIndicator />);
            const scoreDetail = scoreRendu(detail.container);
            detail.unmount();

            const condense = render(<FutureHealthSummary />);
            const scoreCondense = scoreRendu(condense.container);

            expect(scoreCondense).toBe(scoreDetail);
            vus.add(scoreDetail);
        });
    }

    // Anti-vacuité : si les trois profils rendaient le MÊME score, l'égalité ci-dessus serait
    // satisfaite par une constante et ne prouverait rien du câblage.
    it('les profils testés produisent des scores DIFFÉRENTS (la comparaison n\'est pas vacueuse)', () => {
        expect(vus.size).toBeGreaterThan(1);
    });
});
