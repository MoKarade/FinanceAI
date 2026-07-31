/**
 * @vitest-environment jsdom
 *
 * [FINTABLE-6 Lot 2] Carte « le montant du courtier fait autorité ».
 *
 * Ce qui est verrouillé : (a) ship dark — RIEN n'est rendu tant que la sync Fintable n'a jamais
 * écrit de soldes ; (b) le total affiché est celui du COURTIER, l'écart est matérialisé (Σ titres
 * + écart == total courtier, reconstructibilité) ; (c) mode discret : AUCUN montant dans le DOM
 * (PrivateAmount) ; (d) un compte sans régime déclaré est SIGNALÉ, jamais rangé d'office.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrokerReconciliationCard } from '../../components/investments/BrokerReconciliationCard';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { Asset, FintableBrokerBalance } from '../../types';

// formatCAD rend des espaces insécables (U+00A0/U+202F) → normaliser avant tout matching de texte
// (leçon BUDGET-3-VUES : le matcher string de testing-library compare BRUT).
const textOf = (el: HTMLElement): string => (el.textContent ?? '').replace(/[  ]/g, ' ');

const ASSET: Asset = {
    symbol: 'VFV.TO', name: 'Vanguard S&P 500', quantity: 100, currentPrice: 1000,
    buyPrice: 900, currency: 'CAD', accountType: 'NON-ENREG',
} as Asset;

const BALANCES: FintableBrokerBalance[] = [
    { accountId: 'acc_broker', label: 'Disnat L7B1', balanceCad: 136_863, taxRegime: 'NON-ENREG', at: Date.now() - 3600_000 },
];

beforeEach(() => {
    useFinanceStore.setState({
        fintableBrokerBalances: undefined,
        assets: [],
        fxRates: { USD: 1.35, EUR: 1.5, CAD: 1 },
        isPrivacyMode: false,
    });
});

describe('BrokerReconciliationCard — ship dark', () => {
    it('ne rend RIEN sans soldes courtier (sync jamais passée : comportement d\'avant intact)', () => {
        const { container } = render(<BrokerReconciliationCard variant="full" />);
        expect(container.innerHTML).toBe('');
    });
});

describe('BrokerReconciliationCard — variant full (Investissements)', () => {
    it('affiche le total COURTIER (autorité), les titres saisis et l\'écart — reconstructible', () => {
        useFinanceStore.setState({ fintableBrokerBalances: BALANCES, assets: [ASSET] });
        const { container } = render(<BrokerReconciliationCard variant="full" />);
        const text = textOf(container);
        expect(text).toMatch(/136 863/);            // total courtier (autorité)
        expect(text).toMatch(/100 000/);            // titres saisis (100 × 1000 CAD)
        expect(text).toMatch(/\+36 863/);           // écart matérialisé : Σ titres + écart == courtier
        expect(text).toMatch(/Disnat L7B1/);
        expect(text).toMatch(/vu il y a 1h/);       // badge de fraîcheur honnête
    });

    it('signale un compte SANS régime déclaré au lieu de le ranger d\'office', () => {
        useFinanceStore.setState({
            fintableBrokerBalances: [{ accountId: 'a1', label: 'Compte mystère', balanceCad: 5000, at: Date.now() }],
        });
        const { container } = render(<BrokerReconciliationCard variant="full" />);
        expect(textOf(container)).toMatch(/Régime fiscal non déclaré.*Compte mystère/);
    });

    it('fraîcheur INCONNUE quand un compte du panier n\'a pas d\'horodatage lisible (jamais « à jour » promis)', () => {
        useFinanceStore.setState({
            fintableBrokerBalances: [
                { accountId: 'a1', label: 'A', balanceCad: 100, taxRegime: 'CELI', at: Number.NaN },
            ],
        });
        const { container } = render(<BrokerReconciliationCard variant="full" />);
        expect(textOf(container)).toMatch(/fraîcheur inconnue/);
    });
});

describe('BrokerReconciliationCard — variant compact (Accueil)', () => {
    it('affiche le total courtier + l\'écart en une ligne', () => {
        useFinanceStore.setState({ fintableBrokerBalances: BALANCES, assets: [ASSET] });
        const { container } = render(<BrokerReconciliationCard variant="compact" />);
        const text = textOf(container);
        expect(text).toMatch(/total courtier/i);
        expect(text).toMatch(/136 863/);
        expect(text).toMatch(/\+36 863/);
    });

    it('[panel #543 CRITIQUE] AUCUN panier déclaré → PAS de « 0 $ » fabriqué, un état honnête à la place', () => {
        // 2 comptes réels (~171 k$) sans régime déclaré : l'ancien code affichait « 0 $ » avec
        // l'autorité du mot « courtier » (no-fake-data violé, mesuré par financial-integrity).
        useFinanceStore.setState({
            fintableBrokerBalances: [
                { accountId: 'a1', label: 'Disnat L7B1', balanceCad: 136_863, at: Date.now() },
                { accountId: 'a2', label: 'Disnat L7A3', balanceCad: 34_112, at: Date.now() },
            ],
        });
        const { container } = render(<BrokerReconciliationCard variant="compact" />);
        const text = textOf(container);
        expect(text).not.toMatch(/0 \$/);           // aucun montant — surtout pas un zéro crédible
        expect(text).toMatch(/2 comptes courtier/); // l'état réel, dit
        expect(text).toMatch(/sans régime fiscal déclaré/);
    });

    it('[panel #543 ÉLEVÉ] des comptes EXCLUS du total sont signalés à côté du total (jamais omis en silence)', () => {
        useFinanceStore.setState({
            fintableBrokerBalances: [
                ...BALANCES,
                { accountId: 'a9', label: 'Compte mystère', balanceCad: 99_999, at: Date.now() },
            ],
            assets: [ASSET],
        });
        const { container } = render(<BrokerReconciliationCard variant="compact" />);
        const text = textOf(container);
        expect(text).toMatch(/136 863/);            // le total des paniers déclarés reste affiché
        expect(text).toMatch(/\+ 1 compte hors total/); // …mais l'omission est DITE
    });
});

describe('BrokerReconciliationCard — mode discret (Loi 25)', () => {
    it('AUCUN montant dans le DOM quand le mode discret est actif', () => {
        useFinanceStore.setState({ fintableBrokerBalances: BALANCES, assets: [ASSET], isPrivacyMode: true });
        const { container } = render(<BrokerReconciliationCard variant="full" />);
        const text = textOf(container);
        // La vraie valeur SORT du DOM (PrivateAmount rend •••) — pas un blur CSS.
        expect(text).not.toMatch(/136/);
        expect(text).not.toMatch(/100 000/);
        expect(screen.getAllByText('•••').length).toBeGreaterThan(0);
    });
});
