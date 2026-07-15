// tests/services/personaSanitizer.test.ts
// [PERSONA-PURGE] — garde-fous « plus jamais de données de test dans les vraies données »
// (incident 2026-07-15 : ~600 transactions du persona Karim + kar-fg1 mélangées aux vraies
// données de Marc). Trois étages :
//   1. PARITÉ (scan) : tout id de fixture de TOUT persona est reconnu par le registre
//      artifactIds — un futur persona à ids non enregistrés fait ÉCHOUER ce test.
//   2. DIRECTION : les conventions d'ids RÉELS ne sont JAMAIS flaggées (zéro faux positif).
//   3. SANITIZER + STORE : purge chirurgicale, pureté, no-op propre, sortie de mode test.

import { describe, it, expect, beforeEach } from 'vitest';
import { TEST_PERSONAS } from '../../services/testPersonas';
import { isPersonaArtifactId, PERSONA_EXACT_IDS, PERSONA_ID_PREFIXES } from '../../services/testPersonas/artifactIds';
import { sanitizePersonaArtifacts, sanitizePersistEnvelope } from '../../services/personaSanitizer';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { AppState, Transaction, Debt, FinancialGoal } from '../../types';

// ——— 1. PARITÉ registre ↔ fixtures (leçon FISC-CONST-LINT : prouver le VOLUME) ———

describe('artifactIds — parité avec les fixtures de TOUS les personas', () => {
    it('reconnaît 100 % des ids plantés par chaque persona (registre à jour)', () => {
        expect(TEST_PERSONAS.length).toBeGreaterThanOrEqual(7); // volume : les 7 personas connus
        let idsScanned = 0;
        const misses: string[] = [];
        for (const persona of TEST_PERSONAS) {
            const fixtures = persona.build() as Record<string, unknown>;
            for (const [slice, value] of Object.entries(fixtures)) {
                if (!Array.isArray(value)) continue;
                for (const item of value) {
                    const id = (item as { id?: unknown })?.id;
                    if (typeof id !== 'string') continue;
                    idsScanned++;
                    if (!isPersonaArtifactId(id)) misses.push(`${persona.id}/${slice}/${id}`);
                }
            }
            // Singulier legacy : childGoal
            const childGoal = (fixtures as { childGoal?: { id?: unknown } }).childGoal;
            if (childGoal && typeof childGoal.id === 'string') {
                idsScanned++;
                if (!isPersonaArtifactId(childGoal.id)) misses.push(`${persona.id}/childGoal/${childGoal.id}`);
            }
        }
        expect(idsScanned).toBeGreaterThan(100); // volume : fixtures + transactions générées
        expect(misses).toEqual([]); // un miss = nouveau persona/fixture à enregistrer dans artifactIds.ts
    });

    it('le registre est non-vide et cohérent (volume prouvé)', () => {
        expect(PERSONA_EXACT_IDS.size).toBeGreaterThan(80);
        expect(PERSONA_ID_PREFIXES.length).toBeGreaterThanOrEqual(3);
    });
});

// ——— 2. DIRECTION : zéro faux positif sur les ids réels ———

describe('artifactIds — ne flagge JAMAIS les conventions d\'ids réels', () => {
    it.each([
        String(Date.now()),            // DebtManager / imports legacy
        `${Date.now()}`,               // parseBankCsv importIdCounter
        'debt_1752585600000',          // MCP apply_debt
        'cat_1752585600000',           // Budget.tsx nouvelle catégorie
        'rule_1752585600000',          // règles de catégorisation
        'child_1',                     // défaut app (underscore ≠ fixture « child-1 »)
        'main_property',               // défaut app (≠ fixture « re-1 »)
        'x1', 'b11', 'd3', 'tr-3',     // voisins IMMÉDIATS des ids de fixtures, absents du registre
    ])('id réel « %s » → non flaggé', (id) => {
        expect(isPersonaArtifactId(id)).toBe(false);
    });

    it('flagge les artefacts connus (exacts + préfixes générés)', () => {
        for (const id of ['persona-tx-1', 'persona-tx-612', 'test-tx-40', 'test-asset-3', 'kar-fg1', 'kar-b9', 'b1', 'd2', 're-1', 'child-1']) {
            expect(isPersonaArtifactId(id), id).toBe(true);
        }
    });
});

// ——— 3. SANITIZER ———

const realTx = (id: string): Transaction => ({
    id, date: '2026-06-04', payee: 'Paie / ROBOVIC INC.', amount: 837.31, category: 'Salaire',
} as unknown as Transaction);
const personaTx = (n: number): Transaction => ({
    id: `persona-tx-${n}`, date: '2026-06-01', payee: 'Shopify - Dépôt paie', amount: 3200, category: 'Salaire',
} as unknown as Transaction);

describe('sanitizePersonaArtifacts', () => {
    it('retire les artefacts (transactions, objectif kar-fg1, budgets kar-b*) et PRÉSERVE le réel', () => {
        const state: Partial<AppState> = {
            transactions: [realTx('1752585600001'), personaTx(1), personaTx(2), realTx('1752585600002')],
            financialGoals: [
                { id: 'kar-fg1', name: 'Indépendance financière (1 M$)' } as unknown as FinancialGoal,
                { id: '1752585600003', name: 'Mise de fonds' } as unknown as FinancialGoal,
            ],
            budgetItems: [{ id: 'kar-b1', name: 'Loyer (condo)' }, { id: 'cat_1752585600004', name: 'Épicerie' }] as AppState['budgetItems'],
            debts: [{ id: '1752585600005', name: 'VOiture', balance: 49787 } as unknown as Debt],
        };
        const { state: cleaned, report } = sanitizePersonaArtifacts(state);
        expect(report.removedTotal).toBe(4);
        expect(report.bySlice).toEqual({ transactions: 2, financialGoals: 1, budgetItems: 1 });
        expect(cleaned.transactions!.map(t => t.id)).toEqual(['1752585600001', '1752585600002']);
        expect(cleaned.financialGoals!.map(g => g.id)).toEqual(['1752585600003']);
        expect(cleaned.budgetItems!.map(b => b.id)).toEqual(['cat_1752585600004']);
        expect(cleaned.debts).toBe(state.debts); // tranche intacte = MÊME référence (pas de re-render parasite)
    });

    it('est PUR (l\'entrée n\'est pas mutée) et no-op propre (même référence si rien à retirer)', () => {
        const polluted: Partial<AppState> = { transactions: [personaTx(9), realTx('42')] };
        const before = JSON.parse(JSON.stringify(polluted));
        sanitizePersonaArtifacts(polluted);
        expect(polluted).toEqual(before); // pas de mutation

        const clean: Partial<AppState> = { transactions: [realTx('43')] };
        const res = sanitizePersonaArtifacts(clean);
        expect(res.state).toBe(clean); // même référence
        expect(res.report.removedTotal).toBe(0);
    });

    it('neutralise les SINGULIERS de fixture (childGoal, weddingGoal) — retirés du patch', () => {
        const state = {
            childGoal: { id: 'child-1', name: 'Études' },
            weddingGoal: { id: 'kar-tr1', name: 'Mariage' },
        } as unknown as Partial<AppState>;
        const { state: cleaned, report } = sanitizePersonaArtifacts(state);
        expect(report.bySlice.childGoal).toBe(1);
        expect(report.bySlice.weddingGoal).toBe(1);
        expect('childGoal' in cleaned).toBe(false);
        expect('weddingGoal' in cleaned).toBe(false);
    });

    it('couvre categorizationRules (finding panel : tranche à id oubliée)', () => {
        const state = {
            categorizationRules: [
                { id: 'kar-b1', pattern: 'x' },
                { id: 'rule_1752585600000', pattern: 'y' },
            ],
        } as unknown as Partial<AppState>;
        const { state: cleaned, report } = sanitizePersonaArtifacts(state);
        expect(report.bySlice.categorizationRules).toBe(1);
        expect((cleaned.categorizationRules as Array<{ id: string }>).map(r => r.id)).toEqual(['rule_1752585600000']);
    });
});

describe('sanitizePersistEnvelope (payload sync/backup)', () => {
    it('désinfecte un état RÉEL et SKIP un état en MODE TEST (fixtures légitimes)', () => {
        const pollutedReal = { state: { isTestMode: false, transactions: [personaTx(1), realTx('7')] }, version: 7 };
        const r1 = sanitizePersistEnvelope(pollutedReal);
        expect(r1.report.removedTotal).toBe(1);
        expect((r1.envelope as { state: { transactions: Transaction[] } }).state.transactions.map(t => t.id)).toEqual(['7']);

        const testMode = { state: { isTestMode: true, transactions: [personaTx(1)] }, version: 7 };
        const r2 = sanitizePersistEnvelope(testMode);
        expect(r2.report.removedTotal).toBe(0);
        expect(r2.envelope).toBe(testMode); // même référence
    });

    it('tolère les payloads malformés (null, non-objet, sans state)', () => {
        for (const bad of [null, undefined, 'x', 42, {}, { state: null }]) {
            const { report } = sanitizePersistEnvelope(bad);
            expect(report.removedTotal).toBe(0);
        }
    });
});

// ——— 4. STORE : purge en mode réel, no-op en mode test, sortie de mode test désinfectée ———

describe('useFinanceStore.purgePersonaArtifacts', () => {
    beforeEach(() => {
        useFinanceStore.getState().resetState();
    });

    it('purge le mode réel et rend le compte ; 0 au second appel (idempotent)', () => {
        useFinanceStore.setState({
            transactions: [personaTx(1), realTx('1752585600010')],
            financialGoals: [{ id: 'kar-fg1', name: 'Indépendance financière (1 M$)' } as unknown as FinancialGoal],
        });
        expect(useFinanceStore.getState().purgePersonaArtifacts()).toBe(2);
        const s = useFinanceStore.getState();
        expect(s.transactions.map(t => t.id)).toEqual(['1752585600010']);
        expect(s.financialGoals).toEqual([]);
        expect(useFinanceStore.getState().purgePersonaArtifacts()).toBe(0);
    });

    it('NO-OP en mode test (les fixtures du persona restent)', () => {
        const karim = TEST_PERSONAS.find(p => p.id === 'karim-immigre')!;
        useFinanceStore.getState().enableTestMode(karim.build(), karim.id);
        expect(useFinanceStore.getState().purgePersonaArtifacts()).toBe(0);
        expect(useFinanceStore.getState().transactions.length).toBeGreaterThan(0);
        useFinanceStore.getState().disableTestMode();
    });

    it('disableTestMode désinfecte un snapshot réel POLLUÉ (la sortie de mode test rend un état propre)', () => {
        useFinanceStore.setState({ transactions: [personaTx(5), realTx('1752585600011')] }); // réel pollué
        const karim = TEST_PERSONAS.find(p => p.id === 'karim-immigre')!;
        useFinanceStore.getState().enableTestMode(karim.build(), karim.id); // snapshot = réel pollué
        useFinanceStore.getState().disableTestMode();
        const s = useFinanceStore.getState();
        expect(s.isTestMode).toBe(false);
        expect(s.transactions.map(t => t.id)).toEqual(['1752585600011']); // persona-tx-5 purgé du snapshot
    });

    it('disableTestMode — childGoal SINGULIER pollué du snapshot ne laisse PAS fuiter celui du persona (bug spread, finding panel)', () => {
        // Réel pollué sur le singulier childGoal (id de fixture legacy).
        useFinanceStore.setState({ childGoal: { id: 'child-1', name: 'Études (fixture)' } } as unknown as Partial<ReturnType<typeof useFinanceStore.getState>>);
        const karim = TEST_PERSONAS.find(p => p.id === 'karim-immigre')!;
        useFinanceStore.getState().enableTestMode(karim.build(), karim.id);
        useFinanceStore.getState().disableTestMode();
        const s = useFinanceStore.getState();
        // Ni la fixture polluée ('child-1'), ni le childGoal du persona : le DÉFAUT app reprend.
        expect(s.childGoal?.id).toBe('child_1');
    });
});
