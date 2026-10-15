// tests/mcp/verrouEcritureIntegration.test.ts
//
// [VERROU-ECRITURE] Étape 2 — matrice complète sur les 8 outils d'écriture : le verrou (fermé/ouvert/
// expiré/lecture Drive en échec) se vérifie AVANT le jeton d'aperçu de #1076 (C1), les deux se
// cumulent (C5), aucune régression sur les outils de LECTURE (C6), et aucun tool MCP n'expose de
// moyen de créer/prolonger le verrou (C2 — vérifié structurellement, pas seulement par absence de test).
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer } from '../../mcp/server';
import { FileStateSource, buildDefaultAppState } from '../../mcp/state/loadAppState';
import type { WritableStateSource, StateVersion } from '../../mcp/state/loadAppState';
import { makeStateStore, type StateStore } from '../../mcp/state/stateStore';
import { makeStateProvider } from '../../mcp/state/stateProvider';
import type { SaveResult } from '../../mcp/state/writeAppState';
import type { AppState } from '../../types';
import { registerSetCash } from '../../mcp/tools/setCash.tool';
import { registerApplyDebt } from '../../mcp/tools/applyDebt.tool';
import { registerApplyPayslip } from '../../mcp/tools/applyPayslip.tool';
import { registerApplyBankStatement } from '../../mcp/tools/applyBankStatement.tool';
import { registerApplyBrokerStatement } from '../../mcp/tools/applyBrokerStatement.tool';
import { registerApplyTaxSlip } from '../../mcp/tools/applyTaxSlip.tool';
import { registerSetBudgetItem } from '../../mcp/tools/setBudgetItem.tool';
import { registerDeleteItem } from '../../mcp/tools/deleteItem.tool';
import { capturer, confirmer, type ToolResult } from './_ecritureMcp';

const json = (r: ToolResult): Record<string, unknown> => JSON.parse(r.content[0].text) as Record<string, unknown>;

/** Enveloppe une `FileStateSource` réelle (lecture/écriture véritables sur un fichier temporaire) en y
 *  ajoutant un `checkWriteLock` CONTRÔLABLE par le test — imite une `DriveStateSource` dont le verrou
 *  serait ouvert/fermé, sans réseau. */
class SourceAvecVerrouControlable implements WritableStateSource {
    verrouOuvert: boolean | (() => boolean | Promise<boolean>) = true;
    private readonly inner: FileStateSource;
    constructor(filePath: string) {
        this.inner = new FileStateSource(filePath);
    }
    get description(): string {
        return this.inner.description;
    }
    loadRaw(): Promise<string> {
        return this.inner.loadRaw();
    }
    saveState(state: AppState, expectedVersion?: StateVersion): Promise<SaveResult> {
        return this.inner.saveState(state, expectedVersion);
    }
    async checkWriteLock(): Promise<boolean> {
        return typeof this.verrouOuvert === 'function' ? this.verrouOuvert() : this.verrouOuvert;
    }
}

const CAS: Array<[string, (s: McpServer, st: StateStore) => void, Record<string, unknown>]> = [
    ['apply_debt', registerApplyDebt, { name: 'Dette générée', balance: 1234, interestRate: 5, minimumPayment: 50 }],
    ['apply_payslip', registerApplyPayslip, { grossAnnual: 96000 }],
    ['apply_bank_statement', registerApplyBankStatement, { transactions: [{ date: '2026-01-05', payee: 'Marchand généré', amount: -12.5 }] }],
    ['apply_broker_statement', registerApplyBrokerStatement, { holdings: [{ symbol: 'TEST.TO', quantity: 3, currentPrice: 10 }] }],
    ['apply_tax_slip', registerApplyTaxSlip, { employmentIncomeAnnual: 70000 }],
    ['set_cash', registerSetCash, { targetCad: 4321 }],
    ['set_budget_item', registerSetBudgetItem, { name: 'Poste généré', targetCad: 100 }],
];

describe('[VERROU-ECRITURE] matrice des 8 outils d\'écriture', () => {
    let dir: string;
    let file: string;
    let source: SourceAvecVerrouControlable;
    let store: StateStore;
    const lire = async (): Promise<string> => fs.readFile(file, 'utf8');

    const nouvelEtat = async (): Promise<void> => {
        dir = await fs.mkdtemp(join(tmpdir(), 'fai-verrou-'));
        file = join(dir, 'state.json');
        await fs.writeFile(file, JSON.stringify(buildDefaultAppState()), 'utf8');
        source = new SourceAvecVerrouControlable(file);
        store = makeStateStore(source, { ttlMs: 0 });
    };

    it.each(CAS)('%s : verrou FERMÉ dès le 1er appel (aperçu) → refusé, rien écrit', async (_nom, reg, args) => {
        await nouvelEtat();
        source.verrouOuvert = false;
        const avant = await lire();
        const res = await capturer(reg, store)(args);
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toMatch(/verrouillé/i);
        expect(await lire()).toBe(avant);
    });

    it.each(CAS)('%s : verrou OUVERT, aperçu puis confirmToken → écrit (chemin nominal inchangé)', async (_nom, reg, args) => {
        await nouvelEtat();
        source.verrouOuvert = true;
        const out = json(await confirmer(capturer(reg, store), args));
        expect(out.applied).toBe(true);
    });

    it('delete_item : verrou FERMÉ → refusé, rien supprimé', async () => {
        await nouvelEtat();
        const s = buildDefaultAppState();
        s.debts = [{ id: 1, name: 'Dette à garder', balance: 100, interestRate: 1, minimumPayment: 5, category: 'Personal' } as never];
        await fs.writeFile(file, JSON.stringify(s), 'utf8');
        source.verrouOuvert = false;
        const avant = await lire();
        const res = await capturer(registerDeleteItem, store)({ entity: 'debt', name: 'Dette à garder' });
        expect(res.isError).toBe(true);
        expect(await lire()).toBe(avant);
    });

    // ── C1 : le verrou passe AVANT le jeton, même avec un jeton D'APERÇU VALIDE émis pendant une
    // fenêtre encore ouverte à ce moment-là (le cas réel : Marc ouvre, un aperçu est émis, PUIS il
    // referme avant de confirmer — la confirmation doit être refusée). ──────────────────────────────
    it('jeton d\'aperçu valide émis PENDANT une fenêtre ouverte, verrou refermé avant la confirmation → refusé', async () => {
        await nouvelEtat();
        source.verrouOuvert = true;
        const h = capturer(registerSetCash, store);
        const apercu = json(await h({ targetCad: 4321 }));
        expect(apercu.preview).toBe(true);
        const token = String(apercu.confirmToken);
        source.verrouOuvert = false; // Marc referme (ou la fenêtre expire) avant que le modèle confirme
        const avant = await lire();
        const res = await h({ targetCad: 4321, confirmToken: token });
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toMatch(/verrouillé/i);
        expect(await lire()).toBe(avant);
    });

    // ── C5 : verrou ouvert MAIS jeton absent/invalide → toujours refusé (défense en profondeur,
    // le verrou ne remplace pas le jeton de #1076). ────────────────────────────────────────────────
    it('verrou OUVERT mais SANS jeton de confirmation : 1er appel = aperçu seulement, rien écrit', async () => {
        await nouvelEtat();
        source.verrouOuvert = true;
        const avant = await lire();
        const out = json(await capturer(registerSetCash, store)({ targetCad: 4321 }));
        expect(out.applied).toBe(false);
        expect(out.preview).toBe(true);
        expect(await lire()).toBe(avant);
    });

    it('verrou OUVERT, confirmToken INVALIDE (inventé) : refusé, rien écrit', async () => {
        await nouvelEtat();
        source.verrouOuvert = true;
        const avant = await lire();
        const res = await capturer(registerSetCash, store)({ targetCad: 4321, confirmToken: 'a'.repeat(32) + '.' + 'b'.repeat(64) });
        expect(res.isError).toBe(true);
        expect(await lire()).toBe(avant);
    });

    // ── verrou qui EXPIRE entre l'aperçu et la confirmation (simulé par le prédicat dynamique) ──────
    it('verrou expiré entre l\'aperçu et la confirmation (fonction dynamique) : refusé', async () => {
        await nouvelEtat();
        let appelsVerrou = 0;
        source.verrouOuvert = () => {
            appelsVerrou += 1;
            return appelsVerrou === 1; // ouvert à l'aperçu, fermé à la confirmation
        };
        const h = capturer(registerSetCash, store);
        const t = String(json(await h({ targetCad: 4321 })).confirmToken);
        const avant = await lire();
        const res = await h({ targetCad: 4321, confirmToken: t });
        expect(res.isError).toBe(true);
        expect(await lire()).toBe(avant);
    });

    // ── lecture Drive en échec (le prédicat lève) : traité comme fermé, jamais une exception qui sort. ─
    it('checkWriteLock() qui lève une exception : traité comme fermé, pas de crash', async () => {
        await nouvelEtat();
        source.verrouOuvert = (() => {
            throw new Error('panne réseau simulée');
        }) as unknown as () => boolean;
        const avant = await lire();
        const res = await capturer(registerSetCash, store)({ targetCad: 4321 });
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toMatch(/verrouillé/i);
        expect(await lire()).toBe(avant);
    });

    // ── C6 : aucune régression sur les outils de LECTURE — jamais concernés par le verrou. ───────────
    it('un outil de LECTURE (get_financial_overview) fonctionne verrou FERMÉ, sans même consulter checkWriteLock', async () => {
        await nouvelEtat();
        source.verrouOuvert = false;
        let consulte = false;
        const original = source.checkWriteLock.bind(source);
        source.checkWriteLock = async () => {
            consulte = true;
            return original();
        };
        const server = createServer({ store, getState: makeStateProvider(source, { ttlMs: 0 }) });
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
        const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
        const client = new Client({ name: 'test-lecture', version: '0' });
        const [c, s] = InMemoryTransport.createLinkedPair();
        await Promise.all([server.connect(s), client.connect(c)]);
        const rep = await client.callTool({ name: 'get_financial_overview', arguments: {} });
        expect(rep.isError).not.toBe(true);
        expect(consulte).toBe(false); // les tools de LECTURE ne passent jamais par checkWriteLock
        await client.close();
    });
});

// ── C2 : structurel — aucun tool MCP n'expose un moyen de créer/prolonger le verrou ──────────────────
describe('[VERROU-ECRITURE] garde structurelle — aucun tool ne peut influencer le verrou', () => {
    const DOSSIER_TOOLS = resolve(__dirname, '../../mcp/tools');
    const fichiersTool = readdirSync(DOSSIER_TOOLS).filter((f) => f.endsWith('.tool.ts'));

    it('aucun `*.tool.ts` n\'importe writeLockStore (seul driveStateSource.ts y accède)', () => {
        const fautes = fichiersTool.filter((f) => /writeLockStore/.test(readFileSync(join(DOSSIER_TOOLS, f), 'utf8')));
        expect(fautes, `tool avec accès direct au verrou : ${fautes.join(', ')}`).toEqual([]);
    });

    it('aucun schéma d\'outil MCP (lecture ou écriture) n\'expose un paramètre lié au verrou', async () => {
        const dir = await fs.mkdtemp(join(tmpdir(), 'fai-verrou-schema-'));
        const file = join(dir, 'state.json');
        await fs.writeFile(file, JSON.stringify(buildDefaultAppState()), 'utf8');
        const store = makeStateStore(new FileStateSource(file));
        const server = createServer({ store });
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
        const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
        const client = new Client({ name: 'test-schema', version: '0' });
        const [c, s] = InMemoryTransport.createLinkedPair();
        await Promise.all([server.connect(s), client.connect(c)]);
        const { tools } = await client.listTools();
        for (const t of tools) {
            const props = Object.keys((t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {});
            const suspects = props.filter((p) => /verrou|lock|deverrouille/i.test(p));
            expect(suspects, `${t.name} expose un paramètre lié au verrou : ${suspects.join(', ')}`).toEqual([]);
        }
        await client.close();
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('les 8 outils d\'écriture passent tous par le même point d\'entrée (registerWriteTool), garde déjà en place réutilisée', () => {
        const passent = fichiersTool.filter((f) => /registerWriteTool\(/.test(readFileSync(join(DOSSIER_TOOLS, f), 'utf8')));
        expect(passent.length).toBe(8);
    });
});
