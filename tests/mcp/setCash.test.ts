// tests/mcp/setCash.test.ts
// [MCP-DIRECT-EDIT] set_cash — ajuste le solde de LIQUIDITÉS (cash) à une cible « juste en le demandant ».
// Le cash est DÉRIVÉ (computeStartingCash = Σ initialBalances + Σ transactions non-dup/transfert) → l'ajustement
// se fait par DELTA sur initialBalances.LIQUIDITE. Spec money-critical :
//   • round-trip : computeStartingCash(nextState) === target EXACTEMENT (le vrai invariant, impl-agnostique) ;
//   • idempotence : re-demander la même cible = 0 changement (discriminant delta vs écrasement) ;
//   • préserve les AUTRES soldes/transactions (delta ciblé, jamais d'écrasement de la map) ;
//   • bornes anti-injection + gardes non-fini côté MÉTIER (appel direct = bypass Zod, leçon MCP-WHATIF) ;
//   • confirmation à 2 temps : 1er appel = APERÇU (rien écrit), 2ᵉ avec confirm:true = écriture.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { applyDocument, type CashBalancePayload } from '../../mcp/ingest/applyDocument';
import { computeStartingCash } from '../../services/projection/buildSimulationParams';
import { FileStateSource, buildDefaultAppState, loadAppStateFromSource } from '../../mcp/state/loadAppState';
import { makeStateStore, type StateStore } from '../../mcp/state/stateStore';
import { registerSetCash } from '../../mcp/tools/setCash.tool';
import type { AppState, Transaction } from '../../types';

const baseState = (): AppState => buildDefaultAppState();
const setCash = (targetCad: number): CashBalancePayload => ({ kind: 'cash_balance', targetCad });

// État avec d'AUTRES soldes de départ + des transactions (dont un doublon et un transfert à EXCLURE).
function richState(): AppState {
    const s = baseState();
    s.initialBalances = { REER: 12000, 'Compte chèque BMO': 3000 };
    s.transactions = [
        { id: 1, date: '2026-01-05', amount: 500, category: 'Salaire', payee: 'Paie', accountName: 'Compte chèque BMO', status: 'processed' },
        { id: 2, date: '2026-01-06', amount: -120, category: 'Épicerie', payee: 'Metro', accountName: 'Compte chèque BMO', status: 'processed' },
        { id: 3, date: '2026-01-07', amount: 9999, category: 'Transfert', payee: 'Vir interne', accountName: 'Compte chèque BMO', status: 'processed', isTransfer: true },
        { id: 4, date: '2026-01-08', amount: 7777, category: 'Doublon', payee: 'Dup', accountName: 'Compte chèque BMO', status: 'processed', isDuplicate: true },
    ] satisfies Transaction[];
    return s;
}

describe('applyCashBalance — round-trip exact (le cash calculé atteint la cible)', () => {
    it('depuis un état vierge : crée le compte LIQUIDITE, cash calculé === cible', () => {
        const { nextState, changes, summary } = applyDocument(baseState(), setCash(50000));
        expect(computeStartingCash(nextState.initialBalances, nextState.transactions ?? [])).toBeCloseTo(50000, 6);
        expect(nextState.initialBalances.LIQUIDITE).toBeCloseTo(50000, 6); // visible dans Réglages → Comptes
        expect(changes).toHaveLength(1);
        expect(changes[0].after).toBe(50000);
        expect(summary).toContain('LIQUIDITE');
    });

    it('avec d\'AUTRES soldes + transactions (transfert/doublon EXCLUS) : DELTA ciblé, cash total === cible', () => {
        const s = richState();
        const before = computeStartingCash(s.initialBalances, s.transactions ?? []); // 12000+3000+500-120 = 15380
        expect(before).toBe(15380);
        const { nextState } = applyDocument(s, setCash(20000));
        // Le round-trip est l'invariant fort : peu importe l'impl, le cash calculé DOIT valoir la cible.
        expect(computeStartingCash(nextState.initialBalances, nextState.transactions ?? [])).toBeCloseTo(20000, 6);
        // Les autres soldes sont INTACTS (delta appliqué à LIQUIDITE seulement) — discriminant vs écrasement.
        expect(nextState.initialBalances.REER).toBe(12000);
        expect(nextState.initialBalances['Compte chèque BMO']).toBe(3000);
        expect(nextState.initialBalances.LIQUIDITE).toBeCloseTo(20000 - 15380, 6); // le delta exact
    });

    it('cible INFÉRIEURE au cash actuel : delta négatif, round-trip toujours exact', () => {
        const s = richState(); // cash = 15380
        const { nextState, changes } = applyDocument(s, setCash(10000));
        expect(computeStartingCash(nextState.initialBalances, nextState.transactions ?? [])).toBeCloseTo(10000, 6);
        expect(nextState.initialBalances.LIQUIDITE).toBeCloseTo(10000 - 15380, 6); // négatif : le compte d'ajustement absorbe
        expect(changes[0].before).toBe(15380);
        expect(changes[0].after).toBe(10000);
    });

    it('cible 0 est valide (vider les liquidités)', () => {
        const s = richState();
        const { nextState } = applyDocument(s, setCash(0));
        expect(computeStartingCash(nextState.initialBalances, nextState.transactions ?? [])).toBeCloseTo(0, 6);
    });
});

describe('applyCashBalance — idempotence (discriminant delta vs écrasement)', () => {
    it('re-demander la MÊME cible → 0 changement (aucune dérive au retry)', () => {
        const first = applyDocument(richState(), setCash(20000));
        const second = applyDocument(first.nextState, setCash(20000));
        expect(second.changes).toHaveLength(0);
        expect(second.summary).toMatch(/déjà à|aucune modification/i);
        // Le cash reste EXACTEMENT la cible (pas d'accumulation de delta).
        expect(computeStartingCash(second.nextState.initialBalances, second.nextState.transactions ?? [])).toBeCloseTo(20000, 6);
    });

    it('cible déjà atteinte à l\'euro près (< 0.005) → no-op', () => {
        const s = richState(); // cash = 15380
        const { changes } = applyDocument(s, setCash(15380.004));
        expect(changes).toHaveLength(0);
    });

    it('cibles ENCHAÎNÉES A → B (différentes) : le delta s\'ACCUMULE sur LIQUIDITE existant, round-trip exact à chaque étape', () => {
        const a = applyDocument(richState(), setCash(20000)); // 15380 → 20000
        expect(computeStartingCash(a.nextState.initialBalances, a.nextState.transactions ?? [])).toBeCloseTo(20000, 6);
        const liqAfterA = a.nextState.initialBalances.LIQUIDITE;
        const b = applyDocument(a.nextState, setCash(33000)); // 20000 → 33000
        expect(computeStartingCash(b.nextState.initialBalances, b.nextState.transactions ?? [])).toBeCloseTo(33000, 6);
        // Discriminant vs « écrase LIQUIDITE = target » : la 2ᵉ écriture ajoute (33000−20000) à la valeur EXISTANTE.
        expect(b.nextState.initialBalances.LIQUIDITE).toBeCloseTo(liqAfterA + 13000, 6);
    });
});

describe('applyCashBalance — bornes anti-injection + gardes non-fini (throw, rien écrit)', () => {
    it('REJETTE : négatif, non fini (Infinity/NaN), au-delà de la borne', () => {
        for (const t of [-1, -100, Infinity, -Infinity, NaN, 200_000_000]) {
            expect(() => applyDocument(baseState(), setCash(t))).toThrow(/invalide|aberrant/i);
        }
    });

    it('REJETTE si le CASH ACTUEL est non calculable (solde/transaction corrompu = non fini) — pas d\'écriture de NaN', () => {
        // [HARDEN-NETWORTH-NAN] Zod laisse passer ±Infinity dans initialBalances / transactions non validées.
        const s1 = baseState();
        s1.initialBalances = { LIQUIDITE: Infinity, REER: 1000 };
        expect(() => applyDocument(s1, setCash(50000))).toThrow(/non calculable|corrompu/i);

        const s2 = baseState();
        s2.transactions = [{ id: 1, date: '2026-01-05', amount: Infinity, category: 'Salaire', payee: 'x', status: 'processed' }] satisfies Transaction[];
        expect(() => applyDocument(s2, setCash(50000))).toThrow(/non calculable|corrompu/i);
    });

    it('le rejet ne MUTE pas l\'état d\'entrée (fonction pure)', () => {
        const s = richState();
        const snapshot = JSON.stringify(s.initialBalances);
        try { applyDocument(s, setCash(Infinity)); } catch { /* attendu */ }
        expect(JSON.stringify(s.initialBalances)).toBe(snapshot);
    });
});

// ── Tool bout en bout (registerSetCash → runApply → store fichier) + confirmation à 2 temps ──
type Handler = (a: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
function captureSetCash(store: StateStore): Handler {
    let cap: Handler | null = null;
    const fake = { tool: (_n: string, _d: string, _s: unknown, cb: Handler) => { cap = cb; } } as unknown as McpServer;
    registerSetCash(fake, store);
    if (!cap) throw new Error('aucun handler capturé');
    return cap;
}

describe('set_cash — tool bout en bout + confirmation à 2 temps', () => {
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

    it('1er appel SANS confirm → APERÇU (preview:true, applied:false) et RIEN n\'est écrit au fichier', async () => {
        const store = makeStateStore(new FileStateSource(file), { ttlMs: 0 });
        const out = JSON.parse((await captureSetCash(store)({ targetCad: 50000 })).content[0].text);
        expect(out.applied).toBe(false);
        expect(out.preview).toBe(true);
        expect(out.changes).toHaveLength(1);
        expect(out.note).toMatch(/APERÇU|confirm/i);
        // Le fichier NE contient PAS la modification (aucune écriture en dry-run).
        const reloaded = await loadAppStateFromSource(new FileStateSource(file));
        expect(reloaded.initialBalances.LIQUIDITE ?? 0).toBe(0);
    });

    it('2ᵉ appel AVEC confirm:true → écrit (applied:true, backupPath), la relecture du FICHIER le voit', async () => {
        const store = makeStateStore(new FileStateSource(file), { ttlMs: 0 });
        const out = JSON.parse((await captureSetCash(store)({ targetCad: 50000, confirm: true })).content[0].text);
        expect(out.applied).toBe(true);
        expect(out.backupPath).toBeTruthy();
        const reloaded = await loadAppStateFromSource(new FileStateSource(file));
        expect(computeStartingCash(reloaded.initialBalances, reloaded.transactions ?? [])).toBeCloseTo(50000, 6);
    });

    it('cible déjà atteinte + confirm:true → applied:false (idempotent au niveau tool)', async () => {
        const store = makeStateStore(new FileStateSource(file), { ttlMs: 0 });
        await captureSetCash(store)({ targetCad: 50000, confirm: true });
        const out = JSON.parse((await captureSetCash(store)({ targetCad: 50000, confirm: true })).content[0].text);
        expect(out.applied).toBe(false);
    });

    it('source non inscriptible → erreur claire, pas de crash', async () => {
        const res = await captureSetCash(makeStateStore(null))({ targetCad: 50000, confirm: true });
        expect(res.isError).toBe(true);
    });
});
