// [FINTABLE Lot 2] Mapper pur : les garde-fous money-critical du passage Fintable → applyDocument.

import { describe, it, expect } from 'vitest';
import { mapFintableSnapshot, type FintableMappingConfig } from '../../../services/fintable/mapSnapshot';
import type { FintableAccount, FintableSnapshot, FintableTransaction } from '../../../services/fintable/types';

function account(over: Partial<FintableAccount> = {}): FintableAccount {
    return {
        id: 'acc_cash', connectionId: 'conn_1', label: 'PCA Everyday', rawType: 'depository / checking',
        currency: 'CAD', balance: 8066.18, balanceAvailable: null, lastTxDate: '2026-07-28', enabled: true,
        ...over,
    };
}

function tx(over: Partial<FintableTransaction> = {}): FintableTransaction {
    return {
        id: 'tx_1', accountId: 'acc_cash', date: '2026-07-28', amount: -4.5, currency: 'CAD',
        description: 'BLUE BOTTLE COFFEE', merchant: 'Blue Bottle Coffee', categoryName: null,
        updatedAt: null, ...over,
    };
}

function snap(over: Partial<FintableSnapshot> = {}): FintableSnapshot {
    return {
        readAt: 0, accounts: [account()], holdings: [], transactions: [tx()], holdingsSkipped: [], ...over,
    };
}

const CASH_ONLY: FintableMappingConfig = {
    roles: { acc_cash: { kind: 'cash' } },
    transactionsAfter: '2026-07-01',
};

describe('date de bascule — la vraie protection contre les doublons', () => {
    it('n\'émet QUE les transactions strictement postérieures à la bascule', () => {
        // La dédup d'applyDocument porte sur date|montant|PAYEE. Le payee de Fintable
        // (« Blue Bottle Coffee ») ne sera pas celui extrait d'un relevé PDF → même dépense, clé
        // différente, doublon accepté en silence. La date de bascule évite le recouvrement.
        const r = mapFintableSnapshot(snap({
            transactions: [
                tx({ id: 'a', date: '2026-06-15' }), // avant la bascule
                tx({ id: 'b', date: '2026-07-01' }), // PILE la bascule → exclue (strictement après)
                tx({ id: 'c', date: '2026-07-02' }), // après → retenue
            ],
        }), CASH_ONLY);

        expect(r.report.transactions.mapped).toBe(1);
        expect(r.report.transactions.skippedBeforeCutover).toBe(2);
        const bank = r.payloads.find((p) => p.kind === 'bank_statement');
        expect(bank && 'transactions' in bank && bank.transactions[0].date).toBe('2026-07-02');
    });

    it('sans bascule, tout passe MAIS le rapport avertit du risque', () => {
        const r = mapFintableSnapshot(snap(), { ...CASH_ONLY, transactionsAfter: null });
        expect(r.report.transactions.mapped).toBe(1);
        expect(r.report.warnings.some((w) => w.includes('date de bascule'))).toBe(true);
    });
});

describe('rôles de compte — jamais devinés', () => {
    it('un compte sans rôle est SIGNALÉ et ses transactions écartées', () => {
        // `Account.type` est du texte libre (« display it, don't switch on it ») : ranger une carte
        // de crédit dans les liquidités gonflerait le patrimoine du montant dû.
        const r = mapFintableSnapshot(snap({
            accounts: [account({ id: 'acc_inconnu', label: 'Compte mystère' })],
            transactions: [tx({ accountId: 'acc_inconnu', date: '2026-07-20' })],
        }), { roles: {}, transactionsAfter: '2026-07-01' });

        expect(r.report.accountsWithoutRole).toEqual([
            { id: 'acc_inconnu', label: 'Compte mystère', rawType: 'depository / checking' },
        ]);
        expect(r.report.transactions.skippedUnroutedAccount).toBe(1);
        expect(r.report.transactions.mapped).toBe(0);
        expect(r.payloads).toHaveLength(0);
    });

    it('les transactions d\'un compte de placement sont écartées', () => {
        const r = mapFintableSnapshot(snap({
            accounts: [account({ id: 'acc_disnat', label: 'Disnat (L7A3)', rawType: 'investment / brokerage', balance: 136863.18 })],
            transactions: [tx({ accountId: 'acc_disnat', date: '2026-07-20' })],
        }), { roles: { acc_disnat: { kind: 'investment' } }, transactionsAfter: '2026-07-01' });

        expect(r.report.transactions.skippedInvestmentAccount).toBe(1);
        // [FINTABLE-6] Le solde du courtier fait AUTORITÉ (ex-« référence »), et porte désormais
        // `accountId` — clé STABLE d'appariement (un compte renommé côté banque ne doit rien casser).
        expect(r.report.investmentBalances).toEqual([
            { accountId: 'acc_disnat', label: 'Disnat (L7A3)', currency: 'CAD', balance: 136863.18 },
        ]);
        // …mais n'entre JAMAIS dans les liquidités.
        expect(r.report.cashTargetCad).toBeNull();
    });

    it('[FINTABLE-6] régime fiscal DÉCLARÉ → propagé ; ABSENT → signalé, jamais deviné', () => {
        const declare = mapFintableSnapshot(snap({
            accounts: [account({ id: 'acc_celi', label: 'CELI Disnat', rawType: 'brokerage', balance: 40_000 })],
        }), { roles: { acc_celi: { kind: 'investment', taxRegime: 'CELI' } }, transactionsAfter: '2026-07-01' });
        expect(declare.report.investmentBalances[0].taxRegime).toBe('CELI');
        expect(declare.report.warnings.some((w) => w.includes('régime fiscal'))).toBe(false);

        const silent = mapFintableSnapshot(snap({
            accounts: [account({ id: 'acc_x', label: 'Compte mystère', rawType: 'brokerage', balance: 40_000 })],
        }), { roles: { acc_x: { kind: 'investment' } }, transactionsAfter: '2026-07-01' });
        expect(silent.report.investmentBalances[0].taxRegime).toBeUndefined();
        // Le solde reste AFFICHABLE, mais l'absence de régime est dite — jamais rangée au hasard.
        expect(silent.report.warnings.some((w) => w.includes('régime fiscal non déclaré'))).toBe(true);
    });

    it('[FINTABLE-6] un placement en devise ≠ CAD ou sans solde est signalé (jamais 0 $ silencieux)', () => {
        const usd = mapFintableSnapshot(snap({
            accounts: [account({ id: 'a', label: 'Compte USD', rawType: 'brokerage', balance: 10_000, currency: 'USD' })],
        }), { roles: { a: { kind: 'investment', taxRegime: 'NON-ENREG' } }, transactionsAfter: '2026-07-01' });
        expect(usd.report.warnings.some((w) => w.includes('conversion non') && w.includes('Compte USD'))).toBe(true);

        const noBal = mapFintableSnapshot(snap({
            accounts: [account({ id: 'b', label: 'Compte muet', rawType: 'brokerage', balance: null })],
        }), { roles: { b: { kind: 'investment', taxRegime: 'CELI' } }, transactionsAfter: '2026-07-01' });
        expect(noBal.report.warnings.some((w) => w.includes('solde absent') && w.includes('Compte muet'))).toBe(true);
    });
});

describe('liquidités — tout ou rien', () => {
    it('somme les comptes cash et émet cash_balance', () => {
        const r = mapFintableSnapshot(snap({
            accounts: [
                account({ id: 'a1', balance: 8066.18 }),
                account({ id: 'a2', label: 'TS1 Savings', rawType: 'depository / savings', balance: 30000 }),
            ],
            transactions: [],
        }), { roles: { a1: { kind: 'cash' }, a2: { kind: 'cash' } }, transactionsAfter: null });

        expect(r.report.cashTargetCad).toBeCloseTo(38066.18, 2);
        const cash = r.payloads.find((p) => p.kind === 'cash_balance');
        expect(cash && 'targetCad' in cash && cash.targetCad).toBeCloseTo(38066.18, 2);
    });

    it('un seul solde manquant SUSPEND toute la mise à jour du cash', () => {
        // `cash_balance` écrit un DELTA sur initialBalances pour atteindre la cible : une cible
        // partielle déplacerait durablement le cash de l'écart, en silence.
        const r = mapFintableSnapshot(snap({
            accounts: [account({ id: 'a1', balance: 8066.18 }), account({ id: 'a2', balance: null })],
            transactions: [],
        }), { roles: { a1: { kind: 'cash' }, a2: { kind: 'cash' } }, transactionsAfter: null });

        expect(r.report.cashTargetCad).toBeNull();
        expect(r.payloads.find((p) => p.kind === 'cash_balance')).toBeUndefined();
        expect(r.report.warnings.some((w) => w.includes('NON mis à jour'))).toBe(true);
    });

    it('un compte cash en devise étrangère est EXCLU et signalé, jamais additionné brut', () => {
        const r = mapFintableSnapshot(snap({
            accounts: [account({ id: 'a1', balance: 100, currency: 'USD' })],
            transactions: [],
        }), { roles: { a1: { kind: 'cash' } }, transactionsAfter: null });

        expect(r.report.cashTargetCad).toBeNull();
        expect(r.report.warnings.some((w) => w.includes('USD'))).toBe(true);
    });
});

describe('dette carte de crédit', () => {
    const cardCfg: FintableMappingConfig = {
        roles: { acc_mc: { kind: 'debt', debtName: 'Desjardins Cash Back Mastercard' } },
        transactionsAfter: '2026-07-01',
    };
    const card = account({ id: 'acc_mc', label: 'Desjardins Cash Back Mastercard', rawType: 'credit / credit card', balance: 379.99 });

    it('émet une mise à jour de SOLDE seulement (ni taux ni paiement minimum inventés)', () => {
        const r = mapFintableSnapshot(snap({ accounts: [card], transactions: [] }), cardCfg);
        const debt = r.payloads.find((p) => p.kind === 'debt');
        expect(debt).toEqual({ kind: 'debt', name: 'Desjardins Cash Back Mastercard', balance: 379.99 });
        // Aucun taux fabriqué : la dette doit préexister, et le rapport le dit.
        expect(debt && 'interestRate' in debt).toBe(false);
        expect(r.report.warnings.some((w) => w.includes('doivent déjà exister'))).toBe(true);
    });

    it('un solde de carte NÉGATIF (crédit en ta faveur) ne devient pas une dette négative', () => {
        // Une dette négative gonflerait le patrimoine au lieu de le réduire.
        const r = mapFintableSnapshot(snap({ accounts: [account({ ...card, balance: -50 })], transactions: [] }), cardCfg);
        expect(r.report.debts).toEqual([{ name: 'Desjardins Cash Back Mastercard', balanceCad: 50 }]);
        const negWarning = r.report.warnings.find((w) => w.includes('négatif'));
        expect(negWarning).toBeDefined();
        // ⚠️ [finding panel, PR #531] ce warning finit dans FintableSyncReport.warnings, rendu SANS gate
        // mode discret dans SystemView.tsx ET dumpé en clair dans les logs GitHub Actions (fintable-sync.yml)
        // — le montant ($50) ne doit JAMAIS y être interpolé, même si le vrai solde (`report.debts[0]
        // .balanceCad`) reste, lui, correctement gardé par le mode discret dans Réglages → Dettes.
        expect(negWarning).not.toMatch(/\b50\b/);
    });

    it('les transactions de la carte SONT importées (ce sont des dépenses)', () => {
        const r = mapFintableSnapshot(snap({
            accounts: [card],
            transactions: [tx({ accountId: 'acc_mc', date: '2026-07-20', amount: -42.5 })],
        }), cardCfg);
        expect(r.report.transactions.mapped).toBe(1);
    });
});

describe('forme des transactions émises', () => {
    it('garde le signe (négatif = sortant) et préfère le marchand au libellé brut', () => {
        const r = mapFintableSnapshot(snap({
            transactions: [tx({ date: '2026-07-20', amount: -4.5 })],
        }), CASH_ONLY);
        const bank = r.payloads.find((p) => p.kind === 'bank_statement');
        // [TX-TRANSFERS] `accountName` est émis par transaction : c'est la seule preuve de « deux
        // poches différentes » côté app, sans laquelle l'appariement des virements internes ne peut
        // que SUGGÉRER. Un lot Fintable couvre plusieurs comptes → le nom vit sur la LIGNE.
        expect(bank && 'transactions' in bank && bank.transactions[0]).toEqual({
            date: '2026-07-20', payee: 'Blue Bottle Coffee', amount: -4.5, accountName: 'PCA Everyday',
        });
    });

    it('retombe sur la description quand le marchand est absent', () => {
        const r = mapFintableSnapshot(snap({
            transactions: [tx({ date: '2026-07-20', merchant: null })],
        }), CASH_ONLY);
        const bank = r.payloads.find((p) => p.kind === 'bank_statement');
        expect(bank && 'transactions' in bank && bank.transactions[0].payee).toBe('BLUE BOTTLE COFFEE');
    });

    it('un revenu reste POSITIF (aucune inversion de signe)', () => {
        const r = mapFintableSnapshot(snap({
            transactions: [tx({ date: '2026-07-20', amount: 2500, merchant: 'Paie' })],
        }), CASH_ONLY);
        const bank = r.payloads.find((p) => p.kind === 'bank_statement');
        expect(bank && 'transactions' in bank && bank.transactions[0].amount).toBe(2500);
    });

    it('omet la catégorie quand Fintable n\'en fournit pas (ruleCategorize prendra le relais)', () => {
        const r = mapFintableSnapshot(snap({ transactions: [tx({ date: '2026-07-20' })] }), CASH_ONLY);
        const bank = r.payloads.find((p) => p.kind === 'bank_statement');
        expect(bank && 'transactions' in bank && 'category' in bank.transactions[0]).toBe(false);
    });

    it('une transaction en devise étrangère est écartée et signalée', () => {
        const r = mapFintableSnapshot(snap({
            transactions: [tx({ date: '2026-07-20', currency: 'USD' })],
        }), CASH_ONLY);
        expect(r.report.transactions.mapped).toBe(0);
        expect(r.report.transactions.skippedForeignCurrency).toBe(1);
        expect(r.report.warnings.some((w) => w.includes('devise'))).toBe(true);
    });
});

describe('scénario réel de Marc (6 comptes, mesuré 2026-07-29)', () => {
    it('route chaque compte selon les décisions prises, sans rien deviner', () => {
        const accounts = [
            account({ id: 'd1', label: 'Disnat (L7B1)', rawType: 'investment / brokerage', currency: 'USD', balance: 72040.19 }),
            account({ id: 'd2', label: 'Disnat (L7A3)', rawType: 'investment / brokerage', balance: 136863.18 }),
            account({ id: 'sv', label: 'TS1 Savings Account', rawType: 'depository / savings', balance: 30000 }),
            account({ id: 'shr', label: 'SHR Qualifying share', rawType: 'investment / rrsp', balance: 5 }),
            account({ id: 'ch', label: 'PCA Everyday', rawType: 'depository / checking', balance: 8066.18 }),
            account({ id: 'mc', label: 'Desjardins Cash Back Mastercard', rawType: 'credit / credit card', balance: 379.99 }),
        ];
        const r = mapFintableSnapshot(snap({ accounts, transactions: [] }), {
            roles: {
                d1: { kind: 'investment' }, d2: { kind: 'investment' }, shr: { kind: 'investment' },
                sv: { kind: 'cash' }, ch: { kind: 'cash' },
                mc: { kind: 'debt', debtName: 'Desjardins Cash Back Mastercard' },
            },
            transactionsAfter: '2026-07-28',
        });

        // Liquidités = épargne + chèque UNIQUEMENT (ni placements, ni carte).
        expect(r.report.cashTargetCad).toBeCloseTo(38066.18, 2);
        expect(r.report.debts).toEqual([{ name: 'Desjardins Cash Back Mastercard', balanceCad: 379.99 }]);
        expect(r.report.investmentBalances).toHaveLength(3);
        expect(r.report.accountsWithoutRole).toEqual([]);
        // Aucune position mappée : Disnat n'est pas couvert par SnapTrade (mesuré).
        expect(r.payloads.some((p) => p.kind === 'broker_statement')).toBe(false);
    });
});
