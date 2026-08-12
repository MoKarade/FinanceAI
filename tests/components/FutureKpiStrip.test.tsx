/**
 * @vitest-environment jsdom
 *
 * [REFONTE-NAV-L2a] Bandeau KPI du Futur — ce qu'on verrouille :
 *  - la tuile « Variation 30 j » : $ signé + % en sous-libellé quand la couverture suffit,
 *    « — » + sr-only NO_DATA_LABEL quand le hook rend `null` (JAMAIS un 0 $ crédible) ;
 *  - la parité patrimoine avec l'ex-Accueil : équité immo AJOUTÉE à la valeur ET étiquetée
 *    « équité immo incluse » ENSEMBLE (l'étiquette seule mentirait, la valeur seule referait
 *    la classe « deux patrimoines à l'écran ») — sans immobilier, ni l'une ni l'autre ;
 *  - les tuiles du Lot 1 (liquidités, épargne/mois) toujours rendues.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { FutureKpiStrip } from '../../components/FutureKpiStrip';
import { useFinanceStore } from '../../store/useFinanceStore';
import { formatCAD, formatPercent } from '../../utils/format';
import { NO_DATA_LABEL } from '../../components/ui/emptyAware';
import type { NetWorthVariation } from '../../hooks/useNetWorthVariation';
import type { RealEstateGoal } from '../../types';

// Le hook est testé pour lui-même dans tests/hooks/useNetWorthVariation.test.ts — ici on pilote
// sa SORTIE pour verrouiller le rendu de la tuile dans chaque état.
const mockVariation = vi.fn<() => NetWorthVariation | null>(() => null);
vi.mock('../../hooks/useNetWorthVariation', () => ({
    useNetWorthVariation: () => mockVariation(),
}));

/** Bien passé à équité EXPLICITE 100 000 $ (currentValue − mortgageBalance). */
const goal: RealEstateGoal = {
    id: 'g1', name: 'Maison', isActive: true, purchaseDate: '2020-01-01',
    price: 350_000, downPayment: 70_000, mortgageRate: 4, amortization: 25,
    totalClosingCosts: 0, monthlyPayment: 1_500, unrecoverableMonthly: 0,
    isPrimaryResidence: true, currentValue: 400_000, mortgageBalance: 300_000,
};

const renderStrip = () =>
    render(<FutureKpiStrip netWorth={50_000} liquidity={12_000} monthlySavings={800} />);

/** La tuile entière (conteneur) à partir de son libellé.
 *  ⚠️ Les montants s'assertent via `textContent.toContain(formatCAD(...))`, PAS `getByText` :
 *  le normaliseur de testing-library remplace les espaces insécables de `fr-CA` par des
 *  espaces simples côté DOM mais pas côté matcher → faux négatif systématique. */
const tile = (label: string): HTMLElement => {
    const el = screen.getByText(label).closest('div');
    if (!el) throw new Error(`Tuile « ${label} » introuvable`);
    return el as HTMLElement;
};

beforeEach(() => {
    mockVariation.mockReturnValue(null);
    useFinanceStore.setState({ isPrivacyMode: false, realEstateGoals: [] });
});

describe('FutureKpiStrip — tuile « Variation 30 j »', () => {
    it('couverture insuffisante (hook → null) : « — » + sr-only, aucun 0 $ crédible', () => {
        renderStrip();
        const t = tile('Variation 30 j');
        expect(within(t).getByText('—')).toBeInTheDocument();
        expect(within(t).getByText(NO_DATA_LABEL)).toBeInTheDocument();
        expect(t.textContent).not.toMatch(/0\s*\$/);
        expect(t.textContent).not.toMatch(/%/);
    });

    it('variation positive : montant signé « + » et % en sous-libellé', () => {
        mockVariation.mockReturnValue({ diff: 1_234, pct: 4.5454 });
        renderStrip();
        const t = tile('Variation 30 j');
        expect(t.textContent).toContain(`+${formatCAD(1_234)}`);
        expect(t.textContent).toContain(formatPercent(4.5454));
    });

    it('variation négative : montant négatif tel que formaté, % négatif', () => {
        mockVariation.mockReturnValue({ diff: -500, pct: -2.1 });
        renderStrip();
        const t = tile('Variation 30 j');
        expect(t.textContent).toContain(formatCAD(-500));
        expect(t.textContent).not.toContain(`+${formatCAD(-500)}`);
        expect(t.textContent).toContain(formatPercent(-2.1));
    });

    it('pct null (départ ≤ 0) : le $ s\'affiche, aucun % (pas de 0 % trompeur)', () => {
        mockVariation.mockReturnValue({ diff: 100, pct: null });
        renderStrip();
        const t = tile('Variation 30 j');
        expect(t.textContent).toContain(`+${formatCAD(100)}`);
        expect(t.textContent).not.toMatch(/%/);
    });
});

describe('FutureKpiStrip — patrimoine net et équité immo', () => {
    it('sans immobilier : valeur = prop netWorth, PAS d\'étiquette « équité immo incluse »', () => {
        renderStrip();
        const t = tile('Patrimoine net');
        expect(t.textContent).toContain(formatCAD(50_000));
        expect(screen.queryByText(/équité immo incluse/i)).not.toBeInTheDocument();
    });

    it('avec immobilier : équité AJOUTÉE à la valeur ET étiquetée (jamais l\'une sans l\'autre)', () => {
        useFinanceStore.setState({ realEstateGoals: [goal] });
        renderStrip();
        const t = tile('Patrimoine net');
        expect(t.textContent).toContain(formatCAD(150_000));
        expect(within(t).getByText('équité immo incluse')).toBeInTheDocument();
    });
});

describe('FutureKpiStrip — tuiles du Lot 1 conservées', () => {
    it('liquidités et épargne/mois toujours rendues (épargne signée)', () => {
        renderStrip();
        expect(tile('Liquidités').textContent).toContain(formatCAD(12_000));
        expect(tile('Épargne / mois').textContent).toContain(`+${formatCAD(800)}`);
    });
});
