// tests/components/privacyRatiosDurees.test.tsx
//
// [PRIVACY-RATIOS-DUREES-UNIFORMES] Décision de Marc (2026-09-29) : en mode discret, les RATIOS et
// DURÉES dérivés du dossier se masquent comme des montants — part du budget, écart réel/prévu, taux
// d'épargne, mois de coussin, progression FIRE, poids des abonnements, largeur des barres qui les
// dessinent. Les hypothèses saisies, les barèmes légaux et les variations de prix de marché des titres
// restent visibles.
//
// Chaque cas porte son TÉMOIN hors mode discret : sans lui, « la valeur est absente » ne distinguerait
// pas « masquée » de « jamais rendue ».
import { describe, it, expect, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { DualKPIStat } from '../../components/budget/DualKPIStat';
import { tendanceSparkline } from '../../components/budget/BudgetGroupTable';
import { healthRawText, computeHealthMetrics } from '../../utils/healthScore';
import { MASKED_AMOUNT_LABEL } from '../../utils/privacyAria';

afterEach(() => {
    act(() => { useFinanceStore.setState({ isPrivacyMode: false }); });
});

describe('DualKPIStat — l\'écart réel/prévu en % et la barre suivent le mode discret', () => {
    const rendre = () => render(<DualKPIStat label="Dépenses" prevu={2000} reel={2600} invertGoodBad />);
    const barre = (c: HTMLElement) => c.querySelector('[aria-hidden="true"] > span') as HTMLElement | null;

    it('hors mode discret : +30,0 % visible et barre remplie (témoin)', () => {
        const { container } = rendre();
        expect(container.textContent ?? '').toMatch(/30,0\s*%/);
        expect(barre(container)?.style.width).toBe('100%');
    });

    it('mode discret : ni pourcentage ni largeur de barre', () => {
        act(() => { useFinanceStore.setState({ isPrivacyMode: true }); });
        const { container } = rendre();
        expect(container.textContent ?? '').not.toMatch(/30,0\s*%/);
        expect(barre(container)?.style.width).toBe('0%');
    });
});

describe('tendanceSparkline — nom accessible sans pourcentage en mode discret', () => {
    it('le pourcentage n\'est dit que hors mode discret ; le SENS reste dans les deux cas', () => {
        expect(tendanceSparkline([100, 110])).toMatch(/en hausse de/);
        expect(tendanceSparkline([100, 110], true)).toBe('2 mois, en hausse');
        expect(tendanceSparkline([200, 150], true)).toBe('2 mois, en baisse');
    });
});

describe('santé financière — les ratios du détail sont des segments MASQUÉS', () => {
    // Dossier minimal SANS donnée réelle : un salaire net et un poste de dépense, rien d'autre.
    const metrics = computeHealthMetrics({
        config: { users: [{ name: 'A', netSalary: 4500 }], splitMode: '50/50' },
        budgetItems: [{ id: 'b1', name: 'Loyer', target: 3000, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' }],
        debts: [], assets: [], initialBalances: {}, transactions: [], subscriptions: [], fxRates: {},
        projectionFireTarget: null, ecartAutoritePlacements: null, aujourdhuiIso: '2026-09-29',
    } as never);

    it('le taux d\'épargne et les mois de coussin sont des segments `ratio`', () => {
        const parSaut = (id: string) => metrics.find((m) => m.id === id);
        for (const id of ['savingsRate', 'emergencyFund']) {
            const m = parSaut(id);
            expect(m, `métrique ${id} absente`).toBeDefined();
            expect(m!.raw.some((p) => p.type === 'ratio'), `${id} : aucun segment ratio`).toBe(true);
        }
    });

    it('healthRawText masque les ratios (et garde le texte d\'accompagnement)', () => {
        const parts = [
            { type: 'ratio' as const, texte: '33,3 %' },
            { type: 'texte' as const, texte: ' (revenus − dépenses)' },
        ];
        expect(healthRawText(parts, false)).toBe('33,3 % (revenus − dépenses)');
        expect(healthRawText(parts, true)).toBe(`${MASKED_AMOUNT_LABEL} (revenus − dépenses)`);
    });
});
