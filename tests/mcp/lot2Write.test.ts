// tests/mcp/lot2Write.test.ts
//
// Lot 2 — écriture sûre depuis un document. Trois niveaux :
//   1. applyDocument (fusion PURE) : paie annuelle → mensuelle, ciblage, immutabilité.
//   2. saveAppStateToFile : sauvegarde horodatée, enveloppe { payload }, purge, atomicité.
//   3. apply_payslip (bout en bout) : tool → fichier réel → relecture voit le changement.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { applyDocument } from '../../mcp/ingest/applyDocument';
import { saveAppStateToFile } from '../../mcp/state/writeAppState';
import { FileStateSource, buildDefaultAppState, loadAppStateFromSource } from '../../mcp/state/loadAppState';
import { makeStateStore, type StateStore } from '../../mcp/state/stateStore';
import { registerApplyPayslip } from '../../mcp/tools/applyPayslip.tool';
import { annualSalaryToMonthly } from '../../utils/salary';
import type { AppState } from '../../types';

function baseState(): AppState {
    const s = buildDefaultAppState();
    const [u0, u1] = s.config.users;
    s.config = {
        ...s.config,
        users: [
            { ...u0, name: 'Moi', grossSalary: 5000, netSalary: 4000 },
            { ...u1, name: 'Anna', grossSalary: 0, netSalary: 0 },
        ],
        splitMode: 'prorata',
    };
    return s;
}

// ── 1) Fusion pure ───────────────────────────────────────────────────────────
describe('Lot 2 — applyDocument (paie, pur)', () => {
    it('brut/net ANNUELS → stockés MENSUELS, user 0 par défaut', () => {
        const r = applyDocument(baseState(), { kind: 'payslip', grossAnnual: 84000, netAnnual: 60000 });
        expect(r.nextState.config.users[0].grossSalary).toBe(7000); // 84000/12
        expect(r.nextState.config.users[0].netSalary).toBe(5000); // 60000/12
        expect(r.changes.length).toBe(2);
    });

    it('cible par nom (insensible à la casse), sans toucher l\'autre user', () => {
        const r = applyDocument(baseState(), { kind: 'payslip', userName: 'anna', grossAnnual: 120000 });
        expect(r.nextState.config.users[1].grossSalary).toBe(annualSalaryToMonthly(120000));
        expect(r.nextState.config.users[0].grossSalary).toBe(5000);
    });

    it('valeur identique → 1er apply estampille la PROVENANCE, le retry est inerte ([INCOME-PROVENANCE])', () => {
        // Nouvelle spec 2026-07-15 (finding panel) : une vraie paie vient d'être appliquée même si
        // les montants matchent déjà une saisie manuelle → salarySource écrit UNE fois (sinon le
        // bandeau de l'onglet Impôt dirait « saisie manuelle » à tort). Le retry reste sans écriture.
        const first = applyDocument(baseState(), { kind: 'payslip', grossAnnual: 60000 }); // 60000/12 = 5000 déjà
        expect(first.changes.length).toBe(1);
        expect(first.changes[0].field).toContain('salarySource');
        const retry = applyDocument(first.nextState, { kind: 'payslip', grossAnnual: 60000 });
        expect(retry.changes.length).toBe(0);
    });

    it('rrspContributedAnnual écrit', () => {
        const r = applyDocument(baseState(), { kind: 'payslip', rrspContributedAnnual: 8000 });
        expect(r.nextState.config.users[0].rrspContributed).toBe(8000);
    });

    it('immutabilité : l\'état d\'origine n\'est pas muté', () => {
        const s = baseState();
        const r = applyDocument(s, { kind: 'payslip', grossAnnual: 84000 });
        expect(s.config.users[0].grossSalary).toBe(5000);
        expect(r.nextState).not.toBe(s);
    });

    it('type inconnu → erreur claire', () => {
        // @ts-expect-error type non supporté volontairement
        expect(() => applyDocument(baseState(), { kind: 'mystere' })).toThrow(/non support/i);
    });
});

// ── 2) Écriture sûre ─────────────────────────────────────────────────────────
describe('Lot 2 — saveAppStateToFile (sûr)', () => {
    let dir: string;
    let file: string;
    beforeEach(async () => {
        dir = await fs.mkdtemp(join(tmpdir(), 'fai-'));
        file = join(dir, 'state.json');
    });
    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('sauvegarde horodatée de l\'ancien contenu + écrit le nouveau', async () => {
        await fs.writeFile(file, JSON.stringify({ marker: 'OLD' }), 'utf8');
        const { backupPath } = await saveAppStateToFile(file, baseState());
        expect(backupPath).toBeTruthy();
        expect(JSON.parse(await fs.readFile(backupPath as string, 'utf8')).marker).toBe('OLD');
        expect(JSON.parse(await fs.readFile(file, 'utf8')).config.users[0].name).toBe('Moi');
    });

    it('préserve l\'enveloppe { payload }', async () => {
        await fs.writeFile(file, JSON.stringify({ payload: baseState(), updatedAt: 1 }), 'utf8');
        const next = baseState();
        next.config.users[0].grossSalary = 9999;
        await saveAppStateToFile(file, next);
        const written = JSON.parse(await fs.readFile(file, 'utf8'));
        expect(written).toHaveProperty('payload');
        expect(written.payload.config.users[0].grossSalary).toBe(9999);
    });

    it('premier write (fichier absent) → pas de sauvegarde', async () => {
        const { backupPath } = await saveAppStateToFile(file, baseState());
        expect(backupPath).toBeNull();
        expect(await fs.readFile(file, 'utf8')).toContain('"name": "Moi"');
    });

    it('purge : garde au plus keepBackups sauvegardes', async () => {
        await fs.writeFile(file, JSON.stringify(baseState()), 'utf8');
        for (let i = 0; i < 8; i++) {
            await saveAppStateToFile(file, baseState(), { keepBackups: 3 });
            await new Promise((r) => setTimeout(r, 3));
        }
        const baks = (await fs.readdir(dir)).filter((n) => n.endsWith('.bak'));
        expect(baks.length).toBeLessThanOrEqual(3);
    });
});

// ── 3) Tool bout en bout ─────────────────────────────────────────────────────
type Handler = (a: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
function captureApply(store: StateStore): Handler {
    let cap: Handler | null = null;
    const fake = { tool: (_n: string, _d: string, _s: unknown, cb: Handler) => { cap = cb; } } as unknown as McpServer;
    registerApplyPayslip(fake, store);
    if (!cap) throw new Error('aucun handler capturé');
    return cap;
}

describe('Lot 2 — apply_payslip (bout en bout, fichier réel)', () => {
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

    it('écrit (annuel→mensuel) + sauvegarde, et la relecture du FICHIER voit le changement', async () => {
        const store = makeStateStore(new FileStateSource(file), { ttlMs: 0 });
        const out = JSON.parse((await captureApply(store)({ grossAnnual: 96000 })).content[0].text);
        expect(out.applied).toBe(true);
        expect(out.backupPath).toBeTruthy();
        const reloaded = await loadAppStateFromSource(new FileStateSource(file));
        expect(reloaded.config.users[0].grossSalary).toBe(8000); // 96000/12
    });

    it('valeurs identiques → 1er apply écrit la PROVENANCE (1 backup), le retry est applied:false sans backup', async () => {
        // Nouvelle spec 2026-07-15 ([INCOME-PROVENANCE], finding panel) — cf. test pur ci-dessus.
        const store = makeStateStore(new FileStateSource(file), { ttlMs: 0 });
        const out = JSON.parse((await captureApply(store)({ grossAnnual: 60000 })).content[0].text); // = 5000/mois déjà
        expect(out.applied).toBe(true); // provenance estampillée
        const retry = JSON.parse((await captureApply(store)({ grossAnnual: 60000 })).content[0].text);
        expect(retry.applied).toBe(false); // idempotent dès la 2e passe
        const baks = (await fs.readdir(dir)).filter((n) => n.endsWith('.bak'));
        expect(baks.length).toBe(1); // une seule écriture, un seul backup
    });

    it('source non inscriptible → erreur claire, pas de crash', async () => {
        const res = await captureApply(makeStateStore(null))({ grossAnnual: 96000 });
        expect(res.isError).toBe(true);
    });
});
