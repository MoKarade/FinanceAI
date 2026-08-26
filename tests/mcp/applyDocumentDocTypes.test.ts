// tests/mcp/applyDocumentDocTypes.test.ts
// Lot 2 (suite) — fusion pure des 3 nouveaux types : relevé bancaire (dédup), courtage, feuillet fiscal.

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { applyDocument } from '../../mcp/ingest/applyDocument';
import { buildDefaultAppState } from '../../mcp/state/loadAppState';
import { applyBankStatementSpec } from '../../mcp/tools/applyBankStatement.spec';
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

    // [BUDGET-DUPCOUNT-MESSAGE-FAUX] finding code-reviewer : la branche « aucune nouvelle
    // transaction » annonçait toujours « 0 doublon(s) ignoré(s) » même quand `dupCount === 0` (ex.
    // un lot rejeté pour une AUTRE raison, ici une date invalide) — au lieu de l'omettre comme la
    // branche « ajoutée(s) » le fait déjà.
    it('un rejet SANS aucun doublon ne mentionne pas "0 doublon(s)" dans le résumé', () => {
        const r = applyDocument(state(), {
            kind: 'bank_statement',
            transactions: [{ date: '2026-02-30', payee: 'IGA', amount: -50 }], // date invalide, 0 doublon
        });
        expect(r.summary).not.toMatch(/doublon/);
        expect(r.summary).toMatch(/1 date\(s\) invalide\(s\) ignorée/);
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

    // [BUDGET-TRANSACTIONS-SYNC-AUDIT] Un LLM produit spontanément plusieurs orthographes de date
    // (`2026-07-31T00:00:00Z`, `31/07/2026`, `2026-7-15`, `2026-02-30`) pour la même transaction —
    // chacune comptée différemment par le grand livre (`slice(0,7)`) et les KPI (comparaison de
    // chaîne). Deux ceintures : le schéma Zod du tool (à l'entrée) ET la garde runtime dans
    // `applyDocument` (un appel direct la contourne, leçon MCP-WHATIF).
    describe('[BUDGET-TRANSACTIONS-SYNC-AUDIT] date de transaction validée à l\'écriture', () => {
        it('REJETTE (runtime) une date calendairement invalide sans planter les autres lignes du lot', () => {
            const r = applyDocument(state(), {
                kind: 'bank_statement',
                transactions: [
                    { date: '2026-02-30', payee: 'IGA', amount: -50 }, // 30 février n'existe pas
                    { date: '2026-02-01', payee: 'Metro', amount: -40 },
                ],
            });
            expect(r.nextState.transactions).toHaveLength(1);
            expect(r.nextState.transactions[0].payee).toBe('Metro');
            expect(r.summary).toMatch(/1 date\(s\) invalide\(s\) ignorée/);
        });

        it('REJETTE (runtime) un format non-ISO (31/07/2026) même si "plausible" à l\'œil', () => {
            const r = applyDocument(state(), {
                kind: 'bank_statement',
                transactions: [{ date: '31/07/2026', payee: 'IGA', amount: -50 }],
            });
            expect(r.nextState.transactions).toHaveLength(0);
        });

        // [finding code-reviewer, MOYEN] Les DEUX causes de rejet (montant aberrant, date invalide)
        // dans le MÊME lot : verrouille que la concaténation `${rej}${rejDate}${rejMalformed}` du
        // résumé ne perd ni ne fusionne aucun des deux messages.
        it('un montant ABERRANT et une date INVALIDE dans le même lot sont rejetés SÉPARÉMENT, chacun nommé dans le résumé', () => {
            const r = applyDocument(state(), {
                kind: 'bank_statement',
                transactions: [
                    { date: '2026-02-01', payee: 'INJECTION', amount: -1e12 }, // montant aberrant
                    { date: '2026-02-30', payee: 'IGA', amount: -50 }, // date invalide
                    { date: '2026-02-02', payee: 'Metro', amount: -40 }, // normal
                ],
            });
            expect(r.nextState.transactions).toHaveLength(1);
            expect(r.nextState.transactions[0].payee).toBe('Metro');
            expect(r.summary).toMatch(/1 montant\(s\) aberrant\(s\) ignoré/);
            expect(r.summary).toMatch(/1 date\(s\) invalide\(s\) ignorée/);
        });

        // [finding silent-failure-hunter, ÉLEVÉ] Cette garde (ligne AVANT la validation de date)
        // filtrait déjà trois cas (ligne absente, montant non numérique, date ABSENTE) sans compter
        // AUCUN d'eux : un lot où TOUTES les lignes ont ce défaut rendait un résumé qui annonce
        // « aucune nouvelle transaction. » sans dire que N lignes avaient été soumises et rejetées.
        it('un lot où TOUTES les lignes sont incomplètes (date/montant manquant) le DIT dans le résumé, pas un silence total', () => {
            const r = applyDocument(state(), {
                kind: 'bank_statement',
                transactions: [
                    { date: '', payee: 'IGA', amount: -50 }, // date absente
                    { payee: 'Metro', amount: -40 } as unknown as { date: string; payee: string; amount: number }, // date absente
                ],
            });
            expect(r.nextState.transactions).toHaveLength(0);
            expect(r.summary).toMatch(/2 ligne\(s\) invalide\(s\) ou incomplète\(s\) ignorée/);
        });

        it('le schéma Zod du tool MCP (ceinture À L\'ENTRÉE) rejette un format non-ISO et une date calendaire invalide, accepte une vraie date', () => {
            const schema = z.object(applyBankStatementSpec.inputSchema);
            const base = { transactions: [{ payee: 'IGA', amount: -50, date: '2026-07-31' }] };
            expect(schema.safeParse(base).success).toBe(true);
            expect(schema.safeParse({ transactions: [{ ...base.transactions[0], date: '31/07/2026' }] }).success).toBe(false);
            expect(schema.safeParse({ transactions: [{ ...base.transactions[0], date: '2026-7-15' }] }).success).toBe(false);
            expect(schema.safeParse({ transactions: [{ ...base.transactions[0], date: '2026-02-30' }] }).success).toBe(false);
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
