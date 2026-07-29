// [FINTABLE Lot 1] Décodage strict des payloads Fintable.
//
// Le cœur de ces tests : « Money is a string » côté API, `number` côté FinanceAI — et la conversion
// ne doit JAMAIS fabriquer un 0. `Number('')` et `Number(null)` valent 0 en JS : sans garde
// explicite, un champ vide deviendrait un montant de 0 $ parfaitement crédible (no-fake-data).

import { describe, it, expect } from 'vitest';
import {
    decodeAccount,
    decodeHolding,
    decodeTransaction,
    parseMoneyOptional,
    parseMoneyRequired,
} from '../../../services/fintable/decode';
import { FintableError } from '../../../services/fintable/types';

describe('parseMoney — un montant illisible ne devient jamais 0', () => {
    it('convertit les chaînes décimales documentées', () => {
        expect(parseMoneyRequired('-4.50', 'x')).toBe(-4.5);
        expect(parseMoneyRequired('5240.12', 'x')).toBe(5240.12);
        expect(parseMoneyRequired('0', 'x')).toBe(0);
        expect(parseMoneyRequired('42.0000', 'x')).toBe(42);
    });

    it('REFUSE la chaîne vide (piège Number("") === 0)', () => {
        // Discriminant : sans la garde, ce cas rendrait 0 — un montant faux, pas une erreur.
        expect(Number('')).toBe(0); // le piège, prouvé
        expect(() => parseMoneyRequired('', 'tx.amount')).toThrow(FintableError);
    });

    it('REFUSE null/undefined sur un champ obligatoire (piège Number(null) === 0)', () => {
        expect(Number(null)).toBe(0); // le piège, prouvé
        expect(() => parseMoneyRequired(null, 'tx.amount')).toThrow(FintableError);
        expect(() => parseMoneyRequired(undefined, 'tx.amount')).toThrow(FintableError);
    });

    it('REFUSE un nombre déjà typé, un booléen, un objet', () => {
        // L'API documente des CHAÎNES ; recevoir autre chose = contrat rompu, pas à « rattraper ».
        expect(() => parseMoneyRequired(4.5, 'x')).toThrow(FintableError);
        expect(() => parseMoneyRequired(true, 'x')).toThrow(FintableError);
        expect(() => parseMoneyRequired({}, 'x')).toThrow(FintableError);
    });

    it('REFUSE les valeurs non finies déguisées en chaîne', () => {
        // `.positive()`/`.min()` de Zod ne les excluraient pas non plus (leçon MCP-WHATIF).
        expect(() => parseMoneyRequired('Infinity', 'x')).toThrow(FintableError);
        expect(() => parseMoneyRequired('-Infinity', 'x')).toThrow(FintableError);
        expect(() => parseMoneyRequired('NaN', 'x')).toThrow(FintableError);
        expect(() => parseMoneyRequired('abc', 'x')).toThrow(FintableError);
    });

    it('classe l\'erreur en MALFORMED et NOMME le champ fautif', () => {
        try {
            parseMoneyRequired('', 'transactions[12].amount');
            expect.unreachable('aurait dû jeter');
        } catch (e) {
            expect(e).toBeInstanceOf(FintableError);
            expect((e as FintableError).code).toBe('MALFORMED');
            expect((e as FintableError).message).toContain('transactions[12].amount');
            expect((e as FintableError).isTransient).toBe(false);
        }
    });

    it('optionnel : absence → null (absence honnête, pas 0)', () => {
        expect(parseMoneyOptional(null, 'x')).toBeNull();
        expect(parseMoneyOptional(undefined, 'x')).toBeNull();
        // …mais une valeur PRÉSENTE et illisible reste une erreur, pas un null silencieux.
        expect(() => parseMoneyOptional('', 'x')).toThrow(FintableError);
    });
});

describe('decodeAccount', () => {
    const raw = {
        id: 'acc_01J9V5R9WQD3M8Y2KXN4T7PB6C',
        connection_id: 'conn_plaid_1771845993762884095',
        name: 'Chase Total Checking',
        display_name: 'Household checking',
        type: 'depository / checking',
        currency: 'USD',
        balance: '5240.12',
        balance_available: '5190.12',
        sync_start_date: '2026-01-01',
        last_tx_date: '2026-07-25',
        enabled: true,
    };

    it('décode l\'exemple documenté', () => {
        const a = decodeAccount(raw, 0);
        expect(a.id).toBe('acc_01J9V5R9WQD3M8Y2KXN4T7PB6C');
        expect(a.balance).toBe(5240.12);
        expect(a.balanceAvailable).toBe(5190.12);
        expect(a.currency).toBe('USD');
        expect(a.enabled).toBe(true);
    });

    it('le nom PERSONNALISÉ prime sur celui de la banque', () => {
        expect(decodeAccount(raw, 0).label).toBe('Household checking');
        expect(decodeAccount({ ...raw, display_name: null }, 0).label).toBe('Chase Total Checking');
    });

    it('un solde absent reste null (la banque n\'en rend pas) — jamais 0', () => {
        const a = decodeAccount({ ...raw, balance: null, balance_available: null }, 0);
        expect(a.balance).toBeNull();
        expect(a.balanceAvailable).toBeNull();
    });

    it('conserve `type` en texte libre sans l\'interpréter', () => {
        // La doc dit « display it, don't switch on it » : on l'expose brut, sous un nom qui le dit.
        expect(decodeAccount({ ...raw, type: 'investment / brokerage' }, 0).rawType)
            .toBe('investment / brokerage');
    });

    it('`enabled` absent → compte considéré ACTIF (défaut sûr)', () => {
        const { enabled: _drop, ...sansEnabled } = raw;
        expect(decodeAccount(sansEnabled, 0).enabled).toBe(true);
        expect(decodeAccount({ ...raw, enabled: false }, 0).enabled).toBe(false);
    });
});

describe('decodeHolding', () => {
    const raw = {
        id: 'hol_01JB7Q2M5X8R4T6W9NKZP3VD1F',
        name: 'Vanguard Total Stock Market ETF',
        symbol: 'VTI',
        quantity: '42.0000',
        price: '279.35',
        value: '11732.70',
        cost_basis: '9450.00',
        currency: 'USD',
    };

    it('décode l\'exemple documenté et porte la date du snapshot', () => {
        const h = decodeHolding(raw, 0, 'acc_1', '2026-07-26');
        expect(h.symbol).toBe('VTI');
        expect(h.quantity).toBe(42);
        expect(h.price).toBe(279.35);
        expect(h.value).toBe(11732.7);
        expect(h.snapshotDate).toBe('2026-07-26');
        expect(h.accountId).toBe('acc_1');
    });

    it('`cost_basis` est le coût TOTAL — le champ normalisé le NOMME ainsi', () => {
        // Garde anti-bug d'échelle (classe FISC-RRQ-UNIT) : notre `Asset.buyPrice` est PAR PART.
        // 9450 / 42 = 225 par part ; confondre les deux gonflerait le prix de revient de 42×.
        const h = decodeHolding(raw, 0, 'acc_1', '2026-07-26');
        expect(h.costBasisTotal).toBe(9450);
        expect(h.costBasisTotal).not.toBe(225);
        expect(h).not.toHaveProperty('buyPrice');
        expect(h).not.toHaveProperty('costBasis');
    });

    it('un titre sans symbole reste lisible (symbol null)', () => {
        expect(decodeHolding({ ...raw, symbol: null }, 0, 'acc_1', null).symbol).toBeNull();
    });
});

describe('decodeTransaction', () => {
    const raw = {
        id: 'tx_01JB2M9QK4R7X3W8N5PDY6TF2H',
        account_id: 'acc_01J9V5R9WQD3M8Y2KXN4T7PB6C',
        date: '2026-07-24',
        amount: '-4.50',
        currency: 'USD',
        description: 'BLUE BOTTLE COFFEE',
        merchant: 'Blue Bottle Coffee',
        pending: false,
        category: { id: 'dining-out_aB3xY9k2Lm', name: 'Dining Out', header: 'Expenses' },
        category_manual_override: false,
        updated_at: '2026-07-25T06:14:09Z',
    };

    it('décode l\'exemple documenté ; négatif = argent sortant', () => {
        const t = decodeTransaction(raw, 0);
        expect(t.amount).toBe(-4.5);
        expect(t.date).toBe('2026-07-24');
        expect(t.categoryName).toBe('Dining Out');
        expect(t.merchant).toBe('Blue Bottle Coffee');
        expect(t.updatedAt).toBe('2026-07-25T06:14:09Z');
    });

    it('catégorie absente → null (le mapper décidera, l\'allowlist reste l\'arbitre)', () => {
        expect(decodeTransaction({ ...raw, category: null }, 0).categoryName).toBeNull();
        const { category: _drop, ...sansCat } = raw;
        expect(decodeTransaction(sansCat, 0).categoryName).toBeNull();
    });

    it('REFUSE une date hors format YYYY-MM-DD', () => {
        expect(() => decodeTransaction({ ...raw, date: '24/07/2026' }, 3)).toThrow(FintableError);
        expect(() => decodeTransaction({ ...raw, date: '2026-07-24T16:41:02Z' }, 3)).toThrow(FintableError);
    });

    it('REFUSE un montant manquant plutôt que de le lire 0', () => {
        expect(() => decodeTransaction({ ...raw, amount: null }, 7)).toThrow(/transactions\[7\]\.amount/);
    });

    it('tolère une description vide (certaines banques n\'en rendent pas)', () => {
        expect(decodeTransaction({ ...raw, description: '' }, 0).description).toBe('');
    });
});
