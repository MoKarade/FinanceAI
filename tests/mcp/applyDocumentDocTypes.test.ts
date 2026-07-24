// tests/mcp/applyDocumentDocTypes.test.ts
// Lot 2 (suite) — fusion pure des 3 nouveaux types : relevé bancaire (dédup), courtage, feuillet fiscal.

import { describe, it, expect } from 'vitest';
import { applyDocument } from '../../mcp/ingest/applyDocument';
import { buildDefaultAppState } from '../../mcp/state/loadAppState';
import type { AppState } from '../../types';

function state(): AppState {
    const s = buildDefaultAppState();
    const [u0, u1] = s.config.users;
    s.config = { ...s.config, users: [{ ...u0, name: 'Marc' }, { ...u1, name: 'Anna' }] };
    return s;
}

describe('applyDocument — relevé bancaire', () => {
    it('ajoute avec id/status, dédup intra-lot ET vs existant', () => {
        const s = state();
        s.transactions = [{ id: 5, date: '2026-01-01', payee: 'Loyer', amount: -1000, category: 'Logement', status: 'processed' }] as unknown as AppState['transactions'];
        const r = applyDocument(s, {
            kind: 'bank_statement',
            accountName: 'Chèque',
            transactions: [
                { date: '2026-02-01', payee: 'Metro', amount: -50 },
                { date: '2026-02-01', payee: 'Metro', amount: -50 }, // doublon intra-lot
                { date: '2026-01-01', payee: 'Loyer', amount: -1000 }, // doublon vs existant
                { date: '2026-02-02', payee: 'Salaire', amount: 3000 },
            ],
        });
        expect(r.nextState.transactions.length).toBe(3); // 1 existant + 2 nouveaux
        const added = r.nextState.transactions.filter((t) => t.id > 5);
        expect(added.map((t) => t.id)).toEqual([6, 7]); // ids incrémentés
        expect(added.every((t) => t.status === 'processed')).toBe(true);
        expect(added.find((t) => t.payee === 'Metro')?.accountName).toBe('Chèque');
        expect(r.summary).toMatch(/2 transaction/);
    });

    it('tout en doublon → 0 changement (rien écrit)', () => {
        const s = state();
        s.transactions = [{ id: 1, date: '2026-01-01', payee: 'X', amount: -10, category: 'a', status: 'processed' }] as unknown as AppState['transactions'];
        const r = applyDocument(s, { kind: 'bank_statement', transactions: [{ date: '2026-01-01', payee: 'X', amount: -10 }] });
        expect(r.changes.length).toBe(0);
    });

    // [MCP-CATEGORY-ALLOWLIST] La catégorie du tool est du texte LIBRE écrit par l'IA : hors du
    // jeu canonique (postes existants + RULE_CATEGORIES), elle serait absorbée par le fuzzy
    // partagé (« Sport » ⊂ « Tran-sport ») sans trace (finding silent-failure-hunter PR #501).
    describe('[MCP-CATEGORY-ALLOWLIST] catégorie validée à l\'écriture', () => {
        it('canonique acceptée verbatim ; variante casse/accents REMAPPÉE vers la canonique', () => {
            const r = applyDocument(state(), {
                kind: 'bank_statement',
                transactions: [
                    { date: '2026-02-01', payee: 'IGA', amount: -50, category: 'Épicerie' },
                    { date: '2026-02-02', payee: 'IGA', amount: -60, category: 'epicerie' }, // remap casse/accents
                ],
            });
            const cats = r.nextState.transactions.map((t) => t.category);
            expect(cats).toEqual(['Épicerie', 'Épicerie']);
            // Un remap de casse vers la canonique n'est PAS compté « non canonique » dans le résumé.
            expect(r.summary).not.toMatch(/re-catégorisée/);
        });

        it('collision poste↔RULE_CATEGORY : le POSTE impose sa forme (cible réelle de réconciliation)', () => {
            const s = state();
            s.budgetItems = [{ id: 'b1', name: 'épicerie', target: 400, frequency: 'Monthly', type: 'Commun', nature: 'Besoin' }] as unknown as AppState['budgetItems'];
            const r = applyDocument(s, {
                kind: 'bank_statement',
                transactions: [{ date: '2026-02-01', payee: 'IGA', amount: -50, category: 'Épicerie' }],
            });
            // Le poste « épicerie » (minuscule) écrase la forme canonique des règles.
            expect(r.nextState.transactions[0].category).toBe('épicerie');
        });

        it('le nom d\'un poste de budget EXISTANT est accepté', () => {
            const s = state();
            s.budgetItems = [{ id: 'b1', name: 'Gym', target: 50, frequency: 'Monthly', type: 'Commun', nature: 'Envie' }] as unknown as AppState['budgetItems'];
            const r = applyDocument(s, {
                kind: 'bank_statement',
                transactions: [{ date: '2026-02-01', payee: 'Energie Cardio', amount: -45, category: 'Gym' }],
            });
            expect(r.nextState.transactions[0].category).toBe('Gym');
        });

        it('catégorie INVENTÉE (« Sport ») → re-catégorisée par règles sur le payee, et le résumé le DIT', () => {
            const r = applyDocument(state(), {
                kind: 'bank_statement',
                transactions: [
                    // « Sport » n'est PAS canonique — sans allowlist elle serait absorbée par le
                    // poste « Transport » via le fuzzy (« sport » ⊂ « tran-sport »).
                    { date: '2026-02-01', payee: 'UBERTRIP 8XZK4', amount: -20, category: 'Sport' },
                    // Payee sans règle → « Non catégorisé » (repli honnête, pas la catégorie inventée).
                    { date: '2026-02-02', payee: 'ZZZZZ INCONNU', amount: -30, category: 'Sport' },
                ],
            });
            const cats = r.nextState.transactions.map((t) => t.category);
            expect(cats[0]).toBe('Transport'); // règle UBER → Transport (déterministe, pas le fuzzy)
            expect(cats[1]).toBe('Non catégorisé');
            expect(cats).not.toContain('Sport'); // la catégorie inventée n'entre JAMAIS
            expect(r.summary).toMatch(/2 catégorie\(s\) non canonique\(s\) re-catégorisée\(s\)/);
        });
    });
});

describe('applyDocument — relevé de courtage', () => {
    it('ajoute une nouvelle position', () => {
        const r = applyDocument(state(), { kind: 'broker_statement', accountType: 'CELI', holdings: [{ symbol: 'aapl', quantity: 10, currentPrice: 150, name: 'Apple', currency: 'USD' }] });
        const a = r.nextState.assets.find((x) => x.symbol === 'AAPL');
        expect(a?.quantity).toBe(10);
        expect(a?.currentPrice).toBe(150);
        expect(a?.accountType).toBe('CELI');
        expect(a?.purchases?.[0].quantity).toBe(10);
    });

    it('met à jour une position existante (quantité + prix), sans doublon', () => {
        const s = state();
        const existing = { symbol: 'XEQT.TO', name: 'XEQT', quantity: 5, currency: 'CAD', currentPrice: 30, performance: 0, dateBought: '2025-01-01', buyPrice: 28, purchases: [{ date: '2025-01-01', quantity: 5, price: 28 }], accountType: 'CELI' };
        s.assets = [existing] as unknown as AppState['assets'];
        const r = applyDocument(s, { kind: 'broker_statement', accountType: 'CELI', holdings: [{ symbol: 'XEQT.TO', quantity: 12, currentPrice: 33 }] });
        const a = r.nextState.assets.find((x) => x.symbol === 'XEQT.TO');
        expect(a?.quantity).toBe(12);
        expect(a?.currentPrice).toBe(33);
        expect(r.nextState.assets.length).toBe(1);
    });
});

describe('applyDocument — feuillet fiscal', () => {
    it('revenu d\'emploi annuel → brut mensuel + REER, sur l\'utilisateur ciblé', () => {
        const r = applyDocument(state(), { kind: 'tax_slip', userName: 'Anna', slipType: 'T4', employmentIncomeAnnual: 84000, rrspContributedAnnual: 6000 });
        expect(r.nextState.config.users[1].grossSalary).toBe(7000); // 84000/12
        expect(r.nextState.config.users[1].rrspContributed).toBe(6000);
        expect(r.nextState.config.users[0].grossSalary).not.toBe(7000); // l'autre user intact
        expect(r.summary).toMatch(/T4/);
    });
});

describe('applyDocument — bornes de plausibilité (D9, sécurité)', () => {
    it('fiche de paie : un brut annuel ABERRANT (1e12) est ignoré, pas appliqué', () => {
        const s = state();
        const before = s.config.users[0].grossSalary;
        const r = applyDocument(s, { kind: 'payslip', userIndex: 0, grossAnnual: 1e12 });
        expect(r.nextState.config.users[0].grossSalary).toBe(before); // inchangé
        expect(r.changes.find((c) => String(c.field).includes('grossSalary'))).toBeUndefined();
        expect(r.summary).toMatch(/aberrant/i);
    });

    it('fiche de paie : un brut annuel élevé mais PLAUSIBLE (40 M$) est bien appliqué', () => {
        const r = applyDocument(state(), { kind: 'payslip', userIndex: 0, grossAnnual: 40_000_000 });
        expect(r.nextState.config.users[0].grossSalary).toBe(Math.round(40_000_000 / 12));
    });

    it('relevé bancaire : un montant aberrant est rejeté, la transaction normale passe', () => {
        const s = state();
        const before = (s.transactions ?? []).length;
        const r = applyDocument(s, {
            kind: 'bank_statement',
            transactions: [
                { date: '2026-03-01', payee: 'Normal', amount: -120 },
                { date: '2026-03-02', payee: 'INJECTION', amount: -1e12 },
            ],
        });
        expect(r.nextState.transactions.length).toBe(before + 1); // seul le normal
        expect(r.nextState.transactions.some((t) => t.payee === 'Normal')).toBe(true);
        expect(r.nextState.transactions.some((t) => t.payee === 'INJECTION')).toBe(false);
        expect(r.summary).toMatch(/aberrant/i);
    });

    it('relevé de courtage : une quantité aberrante est rejetée', () => {
        const r = applyDocument(state(), { kind: 'broker_statement', holdings: [{ symbol: 'EVIL', quantity: 1e12 }] });
        expect(r.nextState.assets.find((a) => a.symbol === 'EVIL')).toBeUndefined();
        expect(r.summary).toMatch(/aberrant/i);
    });
});
