// tests/mcp/applyDebt.test.ts
// [MCP-APPLY-DEBT] — ajout/mise à jour de dette via l'ingestion pure (applyDocument kind 'debt').
// Spec : ajout avec catégorie inférée, mise à jour PAR NOM (idempotente au retry — jamais de doublon),
// bornes anti-injection (leçon D9) et gardes non-fini côté MÉTIER (un appel direct du handler
// bypasse Zod — leçon MCP-WHATIF : le schéma est la bretelle, la logique est la ceinture).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { applyDocument, type DebtPayload } from '../../mcp/ingest/applyDocument';
import { FileStateSource, buildDefaultAppState, loadAppStateFromSource } from '../../mcp/state/loadAppState';
import { makeStateStore, type StateStore } from '../../mcp/state/stateStore';
import { registerApplyDebt } from '../../mcp/tools/applyDebt.tool';
import { applyDebtSpec } from '../../mcp/tools/applyDebt.spec';
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

// [DEBT-MCP-PARITE] `debtKind`/`startDate`/`termEndDate` sont câblés dans le moteur
// (`[DETTE-DATES]`) et l'UI DebtManager depuis un mois — jusqu'ici absents de l'import PDF ET du
// tool MCP direct. ⚠️ Le champ payload s'appelle `debtKind`, PAS `kind` : `DebtPayload.kind` porte
// déjà le discriminant `'debt'` du routage `applyDocument` — un second `kind` de même nom
// l'écraserait silencieusement (`{ kind: 'debt', ...args }`), cassant le routage de TOUS les
// documents. `debtKind` alimente bien le champ `Debt.kind` une fois sur l'entité.
describe('applyDocument — kind debt : parité debtKind/startDate/termEndDate [DEBT-MCP-PARITE]', () => {
    it('AJOUT : debtKind/startDate/termEndDate sont posés sur la nouvelle dette (sous Debt.kind)', () => {
        const { nextState } = applyDocument(baseState(), carDebt({
            debtKind: 'auto-lease', startDate: '2026-07-20', termEndDate: '2029-07-20',
        }));
        const d = nextState.debts[0] as Debt;
        expect(d.kind).toBe('auto-lease');
        expect(d.startDate).toBe('2026-07-20');
        expect(d.termEndDate).toBe('2029-07-20');
    });

    it('AJOUT sans ces champs : absents de la dette créée (rétrocompat, rien n\'est inventé)', () => {
        const { nextState } = applyDocument(baseState(), carDebt());
        const d = nextState.debts[0] as Debt;
        expect(d.kind).toBeUndefined();
        expect(d.startDate).toBeUndefined();
        expect(d.termEndDate).toBeUndefined();
    });

    it('MISE À JOUR PARTIELLE : debtKind seul, puis startDate seul, chacun sans toucher aux autres champs', () => {
        const first = applyDocument(baseState(), carDebt());
        const withKind = applyDocument(first.nextState, {
            kind: 'debt', name: 'Prêt auto Honda Civic', debtKind: 'auto',
        });
        expect((withKind.nextState.debts[0] as Debt).kind).toBe('auto');
        const withDate = applyDocument(withKind.nextState, {
            kind: 'debt', name: 'Prêt auto Honda Civic', startDate: '2025-01-15',
        });
        const d = withDate.nextState.debts[0] as Debt;
        expect(d.startDate).toBe('2025-01-15');
        expect(d.balance).toBe(32000); // intact
        expect(d.kind).toBe('auto');   // intact (posé au tour précédent)
    });

    it('REJETTE un `debtKind` inconnu (halluciné par un import PDF/IA)', () => {
        expect(() => applyDocument(baseState(), carDebt({ debtKind: 'crypto-loan' as unknown as DebtPayload['debtKind'] })))
            .toThrow(/type de dette inconnu/i);
    });

    it('REJETTE une date malformée (startDate ET termEndDate)', () => {
        expect(() => applyDocument(baseState(), carDebt({ startDate: '20-07-2026' })))
            .toThrow(/date de début invalide/i);
        expect(() => applyDocument(baseState(), carDebt({ termEndDate: 'juillet 2026' })))
            .toThrow(/date de fin invalide/i);
    });

    it('REJETTE une date au bon FORMAT mais calendairement invalide (mois 13, 30 février) [MOYEN panel]', () => {
        expect(() => applyDocument(baseState(), carDebt({ startDate: '2026-13-01' })))
            .toThrow(/date de début invalide/i);
        expect(() => applyDocument(baseState(), carDebt({ termEndDate: '2026-02-30' })))
            .toThrow(/date de fin invalide/i);
    });

    it('REJETTE termEndDate antérieure à startDate (incohérence chronologique)', () => {
        expect(() => applyDocument(baseState(), carDebt({ startDate: '2026-07-20', termEndDate: '2026-01-01' })))
            .toThrow(/précède/i);
    });

    it('REJETTE termEndDate antérieure à startDate même en MISE À JOUR PARTIELLE, contre la valeur DÉJÀ STOCKÉE [ÉLEVÉ panel]', () => {
        // La dette existante a startDate 2030 (future) ; un 2e appel ne fournit QUE termEndDate au
        // passé — sans fusion avec l'existant, cette incohérence passerait inaperçue (mesuré par
        // le panel : la dette ne devient alors JAMAIS 'active', phases 'a-venir' → 'terminee').
        const first = applyDocument(baseState(), carDebt({ name: 'Prêt futur', startDate: '2030-01-01' }));
        expect(() => applyDocument(first.nextState, { kind: 'debt', name: 'Prêt futur', termEndDate: '2026-01-01' }))
            .toThrow(/précède/i);
    });

    it('accepte termEndDate == startDate (terme d\'un seul mois, cas limite)', () => {
        const { nextState } = applyDocument(baseState(), carDebt({ startDate: '2026-07-20', termEndDate: '2026-07-20' }));
        expect((nextState.debts[0] as Debt).termEndDate).toBe('2026-07-20');
    });

    it('le résumé annonce le vrai début quand startDate est FUTUR, pas "servie dès maintenant" [ÉLEVÉ panel]', () => {
        const future = applyDocument(baseState(), carDebt({ startDate: '2099-01-01' }));
        expect(future.summary).not.toContain('Servie dès maintenant');
        expect(future.summary).toContain('2099-01-01');
        const now = applyDocument(baseState(), carDebt());
        expect(now.summary).toContain('Servie dès maintenant');
    });

    it('les rejets debtKind/date ne mutent pas l\'état d\'entrée (fonction pure)', () => {
        const s = baseState();
        try { applyDocument(s, carDebt({ debtKind: 'bogus' as unknown as DebtPayload['debtKind'] })); } catch { /* attendu */ }
        expect(s.debts ?? []).toHaveLength(0);
    });

    it('le schéma Zod du tool MCP (ceinture À L\'ENTRÉE, avant même applyDocument) accepte les 3 champs valides et rejette un debtKind/une date invalide', () => {
        const schema = z.object(applyDebtSpec.inputSchema);
        const valid = schema.safeParse({
            name: 'Bail auto', debtKind: 'auto-lease', startDate: '2026-07-20', termEndDate: '2029-07-20',
        });
        expect(valid.success).toBe(true);
        expect(schema.safeParse({ name: 'Bail auto', debtKind: 'bogus' }).success).toBe(false);
        expect(schema.safeParse({ name: 'Bail auto', startDate: '20-07-2026' }).success).toBe(false);
        // [MOYEN panel] Même ceinture calendaire côté Zod que côté applyDocument (source unique
        // utils/isoDate.ts) : le bon FORMAT ne suffit pas.
        expect(schema.safeParse({ name: 'Bail auto', startDate: '2026-13-01' }).success).toBe(false);
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
