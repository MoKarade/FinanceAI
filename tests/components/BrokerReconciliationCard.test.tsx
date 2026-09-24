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
        // 2 comptes (plus de 100 k$) sans régime déclaré : l'ancien code affichait « 0 $ » avec
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

// ── [FINTABLE-DISNAT-USD-SOLDE-IGNORE] La CHAÎNE service → composant ────────────────────────────
//
// ⚠️ [revue panel] Le service était bien couvert (`brokerBalances.test.ts`), le composant aussi —
// mais le CHAÎNON ne l'était pas : aucun test ne posait un `fintableBrokerBalances` portant
// `missingRate`. C'est exactement le trou où « un trou entre deux moitiés testées n'appartient à
// personne » : le lot pouvait être vert de bout en bout et ne rien changer à l'écran.

describe('[FINTABLE-DISNAT-USD-SOLDE-IGNORE] un compte sans taux est NOMMÉ là où Marc regarde', () => {
    const SANS_TAUX: FintableBrokerBalance[] = [
        { accountId: 'acc_usd', label: 'Disnat (L7B1)', balanceCad: 0, missingRate: 'USD', taxRegime: 'NON-ENREG', at: Date.now() },
    ];

    it('variante FULL : le compte est nommé, la raison est dite, et AUCUN 0 $ n\'est affiché', () => {
        useFinanceStore.setState({ fintableBrokerBalances: SANS_TAUX, assets: [ASSET] } as never);
        const { container } = render(<BrokerReconciliationCard variant="full" />);
        const texte = textOf(container as HTMLElement);
        expect(texte).toContain('Disnat (L7B1) (USD)');
        expect(texte).toContain('Taux de change inconnu');
        // ⚠️ LA garde du chaînon : le `balanceCad: 0` de l'entrée ne doit JAMAIS être affiché comme
        // un total — il ne signifie rien. Un « 0 $ » ici serait le no-fake-data violé.
        expect(texte).not.toMatch(/\b0 \$/);
    });

    it('variante FULL : la carte se RÉVEILLE pour ce seul motif (sinon écran muet)', () => {
        // Contrôle du ship-dark : un utilisateur dont TOUS les comptes sont en devise verrait
        // l'écran vide — la panne la plus silencieuse possible.
        useFinanceStore.setState({ fintableBrokerBalances: SANS_TAUX, assets: [] } as never);
        const { container } = render(<BrokerReconciliationCard variant="full" />);
        expect(container.textContent ?? '').not.toBe('');
    });

    it('variante COMPACT : le remède nommé est celui de la VRAIE cause, pas le régime fiscal', () => {
        // ⚠️ Le défaut que le panel a trouvé : envoyer déclarer un régime fiscal à quelqu'un dont
        // le seul problème est un taux de change pas encore connu.
        useFinanceStore.setState({ fintableBrokerBalances: SANS_TAUX, assets: [] } as never);
        const { container } = render(<BrokerReconciliationCard variant="compact" />);
        const texte = textOf(container as HTMLElement);
        expect(texte).toContain('taux de change');
        expect(texte).not.toContain('régime fiscal');
    });

    it('CONTRÔLE NÉGATIF : deux causes DIFFÉRENTES → aucun remède particulier n\'est prescrit', () => {
        // Sans lui, « le bon remède s'affiche » serait indiscernable de « un remède s'affiche
        // toujours » — et prescrire au hasard est précisément le défaut corrigé.
        useFinanceStore.setState({
            fintableBrokerBalances: [
                SANS_TAUX[0],
                { accountId: 'acc_x', label: 'Compte mystère', balanceCad: 5_000, at: Date.now() },
            ],
            assets: [],
        } as never);
        const { container } = render(<BrokerReconciliationCard variant="compact" />);
        const texte = textOf(container as HTMLElement);
        expect(texte).toContain('plusieurs raisons');
        expect(texte).not.toContain('Le taux arrive');
    });
});
