// tests/mcp/applyDebt.test.ts
// [MCP-APPLY-DEBT] — ajout/mise à jour de dette via l'ingestion pure (applyDocument kind 'debt').
// Spec : ajout avec catégorie inférée, mise à jour PAR NOM (idempotente au retry — jamais de doublon),
// bornes anti-injection (leçon D9) et gardes non-fini côté MÉTIER (un appel direct du handler
// bypasse Zod — leçon MCP-WHATIF : le schéma est la bretelle, la logique est la ceinture).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { applyDocument, type DebtPayload } from '../../mcp/ingest/applyDocument';
import { FileStateSource, buildDefaultAppState, loadAppStateFromSource } from '../../mcp/state/loadAppState';
import { makeStateStore, type StateStore } from '../../mcp/state/stateStore';
import { registerApplyDebt } from '../../mcp/tools/applyDebt.tool';
import type { AppState, Debt } from '../../types';

const baseState = (): AppState => buildDefaultAppState();

const carDebt = (over: Partial<DebtPayload> = {}): DebtPayload => ({
    kind: 'debt',
    name: 'Prêt auto Honda Civic',
    balance: 32000,
    interestRate: 7.49,
    minimumPayment: 620,
    ...over,
});

describe('applyDocument — kind debt (ajout)', () => {
    it('ajoute la dette avec tous les champs, catégorie INFÉRÉE du nom (« auto » → Car)', () => {
        const { nextState, changes, summary } = applyDocument(baseState(), carDebt());
        expect(nextState.debts).toHaveLength(1);
        const d = nextState.debts[0] as Debt;
        expect(d.name).toBe('Prêt auto Honda Civic');
        expect(d.balance).toBe(32000);
        expect(d.interestRate).toBe(7.49);
        expect(d.minimumPayment).toBe(620);
        expect(d.category).toBe('Car');
        expect(d.id).toMatch(/^debt_\d+_[a-z0-9]{6}$/); // suffixe anti-collision même-milliseconde
        expect(changes).toHaveLength(1);
        expect(summary).toContain('ajoutée');
        expect(summary).toContain('Servie dès maintenant'); // sémantique moteur explicitée
    });

    it('inférence de catégorie : études → Student, carte → CreditCard, sinon Personal ; category explicite PRIME', () => {
        const cat = (name: string, category?: DebtPayload['category']): Debt['category'] =>
            (applyDocument(baseState(), carDebt({ name, category })).nextState.debts[0] as Debt).category;
        expect(cat('Prêt étudiant fédéral')).toBe('Student');
        expect(cat('Carte Visa TD')).toBe('CreditCard');
        expect(cat('Marge personnelle')).toBe('Personal');
        expect(cat('Prêt auto Honda', 'Other')).toBe('Other'); // explicite > inférence
    });

    it('inférence robuste : accents (« véhicule ») et mots courts ancrés (« Chargex »/« recharge » ≠ char)', () => {
        const cat = (name: string): Debt['category'] =>
            (applyDocument(baseState(), carDebt({ name })).nextState.debts[0] as Debt).category;
        expect(cat('Prêt véhicule Toyota')).toBe('Car');           // accent strippé → vehic matche
        expect(cat('Financement de mon char')).toBe('Car');        // québécisme, mot entier
        expect(cat('Carte Chargex Desjardins')).toBe('CreditCard'); // « char » NU matchait Chargex (faux positif panel)
        expect(cat('Marge recharge mobile')).toBe('Personal');      // « recharge » ne doit pas donner Car
    });

    it("préserve les dettes existantes (ajout, pas d'écrasement du tableau)", () => {
        const s = baseState();
        s.debts = [{ id: 'x1', name: 'Marge CIBC', balance: 5000, interestRate: 9, minimumPayment: 100, category: 'Personal' } as Debt];
        const { nextState } = applyDocument(s, carDebt());
        expect(nextState.debts).toHaveLength(2);
        expect((nextState.debts[0] as Debt).name).toBe('Marge CIBC'); // intacte
    });
});

describe('applyDocument — kind debt (mise à jour PAR NOM, idempotente)', () => {
    it('re-soumettre la MÊME dette (retry) → mise à jour, JAMAIS de doublon', () => {
        const first = applyDocument(baseState(), carDebt());
        const second = applyDocument(first.nextState, carDebt()); // mêmes valeurs
        expect(second.nextState.debts).toHaveLength(1);           // pas de doublon
        expect(second.changes).toHaveLength(0);                   // rien à changer
        expect(second.summary).toContain('aucune modification');
    });

    it('même nom (insensible à la casse/espaces) + nouvelles valeurs → champs mis à jour avec before/after', () => {
        const first = applyDocument(baseState(), carDebt());
        const { nextState, changes } = applyDocument(first.nextState, carDebt({
            name: '  prêt auto honda civic ',
            balance: 30500, // un paiement est passé
        }));
        expect(nextState.debts).toHaveLength(1);
        expect((nextState.debts[0] as Debt).balance).toBe(30500);
        const ch = changes.find(c => c.field.endsWith('.balance'))!;
        expect(ch.before).toBe(32000);
        expect(ch.after).toBe(30500);
    });

    it('mise à jour PARTIELLE : seul le champ fourni change, les autres restent INTACTS (jamais forcer l\'IA à inventer)', () => {
        const first = applyDocument(baseState(), carDebt());
        const { nextState, changes } = applyDocument(first.nextState, {
            kind: 'debt', name: 'Prêt auto Honda Civic', balance: 29000, // taux/paiement OMIS
        });
        const d = nextState.debts[0] as Debt;
        expect(d.balance).toBe(29000);
        expect(d.interestRate).toBe(7.49);   // intact
        expect(d.minimumPayment).toBe(620);  // intact
        expect(changes).toHaveLength(1);
    });

    it('en mise à jour, un champ FOURNI reste validé (« si fourni, alors valide »)', () => {
        const first = applyDocument(baseState(), carDebt());
        expect(() => applyDocument(first.nextState, { kind: 'debt', name: 'Prêt auto Honda Civic', balance: Infinity }))
            .toThrow(/invalide|aberrant/i);
        expect(() => applyDocument(first.nextState, { kind: 'debt', name: 'Prêt auto Honda Civic', interestRate: 150 }))
            .toThrow();
    });
});

describe('applyDocument — kind debt (bornes anti-injection + gardes non-fini)', () => {
    it('REJETTE en bloc (throw, rien d\'écrit) : solde aberrant/non fini/≤0', () => {
        for (const balance of [Infinity, NaN, 0, -100, 60_000_000]) {
            expect(() => applyDocument(baseState(), carDebt({ balance }))).toThrow(/invalide|aberrant/i);
        }
    });

    it('REJETTE : taux hors [0,100] ou non fini ; paiement négatif/non fini ; amortissement absurde', () => {
        expect(() => applyDocument(baseState(), carDebt({ interestRate: 150 }))).toThrow();
        expect(() => applyDocument(baseState(), carDebt({ interestRate: Infinity }))).toThrow();
        expect(() => applyDocument(baseState(), carDebt({ interestRate: -1 }))).toThrow();
        expect(() => applyDocument(baseState(), carDebt({ minimumPayment: NaN }))).toThrow();
        expect(() => applyDocument(baseState(), carDebt({ minimumPayment: -50 }))).toThrow();
        expect(() => applyDocument(baseState(), carDebt({ amortizationYears: 99 }))).toThrow();
        expect(() => applyDocument(baseState(), carDebt({ amortizationYears: Infinity }))).toThrow();
    });

    it('REJETTE : nom vide (aucune dette anonyme)', () => {
        expect(() => applyDocument(baseState(), carDebt({ name: '   ' }))).toThrow(/Nom de dette requis/);
    });

    it('REJETTE un AJOUT incomplet : les 3 champs financiers sont requis quand la dette n\'existe pas', () => {
        expect(() => applyDocument(baseState(), { kind: 'debt', name: 'Nouvelle marge', balance: 5000 }))
            .toThrow(/introuvable.*requis/s);
        expect(() => applyDocument(baseState(), { kind: 'debt', name: 'Nouvelle marge' }))
            .toThrow(/requis/);
    });

    it('les rejets ne MUTENT pas l\'état d\'entrée (fonction pure, échec = zéro écriture)', () => {
        const s = baseState();
        try { applyDocument(s, carDebt({ balance: Infinity })); } catch { /* attendu */ }
        expect(s.debts ?? []).toHaveLength(0);
    });
});

// ── Tool bout en bout (registerApplyDebt → runApply → store fichier) ─────────
// Même harnais que lot2Write.test.ts : prouve que le tool est branché sur runApply
// (applied/backupPath/lecture seule), pas seulement la fusion pure.
type Handler = (a: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
function captureApply(store: StateStore): Handler {
    let cap: Handler | null = null;
    const fake = { tool: (_n: string, _d: string, _s: unknown, cb: Handler) => { cap = cb; } } as unknown as McpServer;
    registerApplyDebt(fake, store);
    if (!cap) throw new Error('aucun handler capturé');
    return cap;
}

describe('apply_debt — tool bout en bout', () => {
    let dir: string;
    let file: string;
    beforeEach(async () => {
        dir = await fs.mkdtemp(join(tmpdir(), 'fai-'));
        file = join(dir, 'state.json');
        await fs.writeFile(file, JSON.stringify(baseState()), 'utf8');
    });
    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('écrit la dette + sauvegarde horodatée, et la relecture du FICHIER la voit', async () => {
        const store = makeStateStore(new FileStateSource(file), { ttlMs: 0 });
        const out = JSON.parse((await captureApply(store)({
            name: 'Prêt auto Honda Civic', balance: 32000, interestRate: 7.49, minimumPayment: 620,
        })).content[0].text);
        expect(out.applied).toBe(true);
        expect(out.backupPath).toBeTruthy();
        const reloaded = await loadAppStateFromSource(new FileStateSource(file));
        expect(reloaded.debts).toHaveLength(1);
        expect((reloaded.debts[0] as Debt).category).toBe('Car');
    });

    it('retry identique → applied:false (idempotent au niveau tool aussi)', async () => {
        const store = makeStateStore(new FileStateSource(file), { ttlMs: 0 });
        const args = { name: 'Prêt auto Honda Civic', balance: 32000, interestRate: 7.49, minimumPayment: 620 };
        await captureApply(store)(args);
        const out = JSON.parse((await captureApply(store)(args)).content[0].text);
        expect(out.applied).toBe(false);
    });

    it('source non inscriptible → erreur claire, pas de crash', async () => {
        const res = await captureApply(makeStateStore(null))({
            name: 'Prêt auto', balance: 32000, interestRate: 7.49, minimumPayment: 620,
        });
        expect(res.isError).toBe(true);
    });
});
