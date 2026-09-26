// tests/mcp/confirmationEcritureMcp.test.ts
//
// [MCP-CONFIRM-TOKEN] TESTS D'ATTAQUE de la confirmation à deux temps liée côté serveur. Le scénario visé :
// un document importé (relevé, feuillet…) contient une consigne, le modèle de claude.ai l'exécute et appelle un
// outil d'ÉCRITURE de l'état réel. Chaque test ci-dessous est une variante de cette attaque ; tous doivent
// échouer à écrire. Données 100 % générées (aucune valeur réelle).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../mcp/server';
import { FileStateSource, buildDefaultAppState } from '../../mcp/state/loadAppState';
import { makeStateStore, type StateStore } from '../../mcp/state/stateStore';
import { createConfirmVault, digest, canonicalJson, type ConfirmVault } from '../../mcp/tools/confirmVault';
import { MAX_CHANGES_PER_CALL } from '../../mcp/tools/_writeHelper';
import { registerSetCash } from '../../mcp/tools/setCash.tool';
import { registerApplyDebt } from '../../mcp/tools/applyDebt.tool';
import { registerApplyPayslip } from '../../mcp/tools/applyPayslip.tool';
import { registerApplyBankStatement } from '../../mcp/tools/applyBankStatement.tool';
import { registerApplyBrokerStatement } from '../../mcp/tools/applyBrokerStatement.tool';
import { registerApplyTaxSlip } from '../../mcp/tools/applyTaxSlip.tool';
import { registerSetBudgetItem } from '../../mcp/tools/setBudgetItem.tool';
import { registerDeleteItem } from '../../mcp/tools/deleteItem.tool';
import { capturer, type Handler, type ToolResult } from './_ecritureMcp';

type Register = (s: McpServer, st: StateStore, v?: ConfirmVault) => void;

/** Comme `capturer`, mais avec un coffre injecté (horloge maîtrisée, coffre partagé entre « sessions »). */
function capturerAvecCoffre(register: Register, store: StateStore, vault: ConfirmVault): Handler {
    let cap: Handler | null = null;
    const fake = { tool: (..._a: unknown[]) => { cap = _a[_a.length - 1] as Handler; } } as unknown as McpServer;
    register(fake, store, vault);
    if (!cap) throw new Error('aucun handler capturé');
    return cap;
}

const json = (r: ToolResult): Record<string, unknown> => JSON.parse(r.content[0].text) as Record<string, unknown>;

describe('[MCP-CONFIRM-TOKEN] attaques sur l\'écriture MCP', () => {
    let dir: string;
    let file: string;
    let store: StateStore;
    const lire = async (): Promise<string> => fs.readFile(file, 'utf8');

    beforeEach(async () => {
        dir = await fs.mkdtemp(join(tmpdir(), 'fai-confirm-'));
        file = join(dir, 'state.json');
        await fs.writeFile(file, JSON.stringify(buildDefaultAppState()), 'utf8');
        store = makeStateStore(new FileStateSource(file), { ttlMs: 0 });
    });
    afterEach(async () => {
        vi.restoreAllMocks();
        await fs.rm(dir, { recursive: true, force: true });
    });

    // ── 1) écriture sans jeton : AUCUN des outils d'écriture n'écrit au premier appel ──────────────
    const CAS: Array<[string, Register, Record<string, unknown>]> = [
        ['apply_debt', registerApplyDebt, { name: 'Dette générée', balance: 1234, interestRate: 5, minimumPayment: 50 }],
        ['apply_payslip', registerApplyPayslip, { grossAnnual: 96000 }],
        ['apply_bank_statement', registerApplyBankStatement, { transactions: [{ date: '2026-01-05', payee: 'Marchand généré', amount: -12.5 }] }],
        ['apply_broker_statement', registerApplyBrokerStatement, { holdings: [{ symbol: 'TEST.TO', quantity: 3, currentPrice: 10 }] }],
        ['apply_tax_slip', registerApplyTaxSlip, { employmentIncomeAnnual: 70000 }],
        ['set_cash', registerSetCash, { targetCad: 4321 }],
        ['set_budget_item', registerSetBudgetItem, { name: 'Poste généré', targetCad: 100 }],
    ];

    it.each(CAS)('%s : 1er appel = aperçu + jeton, RIEN écrit', async (_nom, reg, args) => {
        const avant = await lire();
        const out = json(await capturer(reg, store)(args));
        expect(out.applied).toBe(false);
        expect(out.preview).toBe(true);
        expect(typeof out.confirmToken).toBe('string');
        expect(await lire()).toBe(avant);
    });

    it.each(CAS)('%s : `confirm:true` SEUL (le vieux contournement) n\'écrit rien', async (_nom, reg, args) => {
        const avant = await lire();
        const out = json(await capturer(reg, store)({ ...args, confirm: true }));
        expect(out.applied).toBe(false);
        expect(out.preview).toBe(true);
        expect(await lire()).toBe(avant);
    });

    it('delete_item : `confirm:true` seul ne supprime rien', async () => {
        const s = buildDefaultAppState();
        s.debts = [{ id: 1, name: 'Dette à garder', balance: 100, interestRate: 1, minimumPayment: 5, category: 'Personal' } as never];
        await fs.writeFile(file, JSON.stringify(s), 'utf8');
        const avant = await lire();
        const out = json(await capturer(registerDeleteItem, store)({ entity: 'debt', name: 'Dette à garder', confirm: true }));
        expect(out.applied).toBe(false);
        expect(await lire()).toBe(avant);
    });

    // ── 2) jeton inventé / malformé / trafiqué ─────────────────────────────────────────────────────
    it.each([
        ['inventé', 'a'.repeat(32) + '.' + 'b'.repeat(64)],
        ['malformé', 'pas-un-jeton'],
        ['vide de sens', '0.0'],
    ])('jeton %s : refusé, rien écrit', async (_n, faux) => {
        const avant = await lire();
        const res = await capturer(registerSetCash, store)({ targetCad: 4321, confirmToken: faux });
        expect(res.isError).toBe(true);
        expect(await lire()).toBe(avant);
    });

    it('jeton trafiqué (un caractère du MAC modifié) : refusé', async () => {
        const h = capturer(registerSetCash, store);
        const t = String(json(await h({ targetCad: 4321 })).confirmToken);
        const trafique = t.slice(0, -1) + (t.endsWith('0') ? '1' : '0');
        const avant = await lire();
        expect((await h({ targetCad: 4321, confirmToken: trafique })).isError).toBe(true);
        expect(await lire()).toBe(avant);
    });

    // ── 3) jeton rejoué ────────────────────────────────────────────────────────────────────────────
    it('jeton rejoué après usage : refusé (usage unique), même si l\'état est revenu en arrière', async () => {
        const h = capturer(registerSetCash, store);
        const initial = await lire();
        const t = String(json(await h({ targetCad: 4321 })).confirmToken);
        expect(json(await h({ targetCad: 4321, confirmToken: t })).applied).toBe(true);
        await fs.writeFile(file, initial, 'utf8'); // l'attaquant compte sur un état identique à l'aperçu
        const res = await h({ targetCad: 4321, confirmToken: t });
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toMatch(/déjà utilisé|inconnu/);
        expect(await lire()).toBe(initial);
    });

    // ── 4) jeton d'AUTRES arguments ────────────────────────────────────────────────────────────────
    it('jeton émis pour X, présenté avec Y : refusé ET brûlé', async () => {
        const h = capturer(registerSetCash, store);
        const t = String(json(await h({ targetCad: 4321 })).confirmToken);
        const avant = await lire();
        const res = await h({ targetCad: 999999, confirmToken: t });
        expect(res.isError).toBe(true);
        expect(await lire()).toBe(avant);
        // brûlé : même avec les BONS arguments ensuite, il ne sert plus (un nouvel aperçu est requis)
        expect((await h({ targetCad: 4321, confirmToken: t })).isError).toBe(true);
        expect(await lire()).toBe(avant);
    });

    it('jeton émis pour un OUTIL, présenté à un autre : refusé', async () => {
        const vault = createConfirmVault();
        const cash = capturerAvecCoffre(registerSetCash, store, vault);
        const budget = capturerAvecCoffre(registerSetBudgetItem, store, vault);
        const t = String(json(await cash({ targetCad: 4321 })).confirmToken);
        const avant = await lire();
        expect((await budget({ name: 'Poste généré', targetCad: 4321, confirmToken: t })).isError).toBe(true);
        expect(await lire()).toBe(avant);
    });

    // ── 5) jeton expiré ────────────────────────────────────────────────────────────────────────────
    it('jeton expiré (> 5 min) : refusé', async () => {
        let t0 = 1_000_000;
        const vault = createConfirmVault({ now: () => t0 });
        const h = capturerAvecCoffre(registerSetCash, store, vault);
        const t = String(json(await h({ targetCad: 4321 })).confirmToken);
        t0 += 5 * 60 * 1000 + 1;
        const avant = await lire();
        const res = await h({ targetCad: 4321, confirmToken: t });
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toMatch(/expiré/);
        expect(await lire()).toBe(avant);
    });

    it('jeton encore valide juste avant l\'échéance : accepté', async () => {
        let t0 = 1_000_000;
        const vault = createConfirmVault({ now: () => t0 });
        const h = capturerAvecCoffre(registerSetCash, store, vault);
        const t = String(json(await h({ targetCad: 4321 })).confirmToken);
        t0 += 5 * 60 * 1000 - 1;
        expect(json(await h({ targetCad: 4321, confirmToken: t })).applied).toBe(true);
    });

    // ── 6) autre session ───────────────────────────────────────────────────────────────────────────
    it('jeton d\'une AUTRE session (même coffre, sessionId différent) : refusé', async () => {
        const vault = createConfirmVault();
        const h = capturerAvecCoffre(registerSetCash, store, vault);
        const t = String(json(await h({ targetCad: 4321 }, { sessionId: 'session-A' })).confirmToken);
        const avant = await lire();
        const res = await h({ targetCad: 4321, confirmToken: t }, { sessionId: 'session-B' });
        expect(res.isError).toBe(true);
        expect(await lire()).toBe(avant);
    });

    it('jeton d\'une AUTRE instance de serveur (coffre + clé différents) : refusé', async () => {
        const a = capturer(registerSetCash, store);
        const b = capturer(registerSetCash, store); // autre coffre, autre clé HMAC
        const t = String(json(await a({ targetCad: 4321 })).confirmToken);
        const avant = await lire();
        expect((await b({ targetCad: 4321, confirmToken: t })).isError).toBe(true);
        expect(await lire()).toBe(avant);
    });

    // ── 7) l'état a bougé entre l'aperçu et la confirmation ────────────────────────────────────────
    it('l\'état change entre l\'aperçu et la confirmation → refus (les changements ne sont plus ceux vus)', async () => {
        const h = capturer(registerSetCash, store);
        const t = String(json(await h({ targetCad: 4321 })).confirmToken);
        const s = buildDefaultAppState();
        s.initialBalances = { ...s.initialBalances, REER: 777 }; // un autre écrivain passe entre-temps
        await fs.writeFile(file, JSON.stringify(s), 'utf8');
        const avant = await lire();
        const res = await h({ targetCad: 4321, confirmToken: t });
        expect(res.isError).toBe(true);
        expect(await lire()).toBe(avant);
    });

    // ── 8) chemin nominal ──────────────────────────────────────────────────────────────────────────
    it.each(CAS)('%s : aperçu puis MÊMES arguments + jeton → écrit, sauvegarde créée', async (_nom, reg, args) => {
        const h = capturer(reg, store);
        const t = String(json(await h(args)).confirmToken);
        const out = json(await h({ ...args, confirmToken: t }));
        expect(out.applied).toBe(true);
        expect(out.backupPath).toBeTruthy();
    });

    // ── 9) plafonds ────────────────────────────────────────────────────────────────────────────────
    it('trop d\'éléments en entrée : refusé avant tout calcul', async () => {
        const lignes = Array.from({ length: MAX_CHANGES_PER_CALL + 1 }, (_, i) => ({
            date: '2026-01-05', payee: `Marchand ${i}`, amount: -1,
        }));
        const avant = await lire();
        const res = await capturer(registerApplyBankStatement, store)({ transactions: lignes });
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toMatch(/Trop d'éléments/);
        expect(await lire()).toBe(avant);
    });

    // ── 10) journal d'audit sans montant ni nom ────────────────────────────────────────────────────
    it('le journal d\'audit ne contient ni montant ni nom, seulement outil / phase / nombre / résultat', async () => {
        const espion = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const h = capturer(registerApplyDebt, store);
        const initial = await lire();
        const args = { name: 'NOM-SENTINELLE-XYZ', balance: 987654, interestRate: 4.321, minimumPayment: 55 };
        const t = String(json(await h(args)).confirmToken);
        await h({ ...args, confirmToken: t });
        await fs.writeFile(file, initial, 'utf8');
        await h({ ...args, confirmToken: t }); // rejeu sur un état identique → ligne « refus »
        const audit = espion.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('[mcp:audit]'));
        expect(audit.length).toBeGreaterThanOrEqual(3);
        for (const l of audit) {
            expect(l).toMatch(/^\[mcp:audit\] outil=\w+ phase=(apercu|ecriture|refus) elements=\d+ resultat=\w+$/);
            expect(l).not.toMatch(/SENTINELLE|987654|4\.321/);
        }
        expect(audit.some((l) => l.includes('phase=refus'))).toBe(true);
    });

    // ── 11) bout en bout via le vrai serveur MCP (schéma zod, annotations) ─────────────────────────
    it('serveur MCP complet : `confirm` est retiré du schéma, `confirmToken` publié, annotations posées', async () => {
        const server = createServer({ store });
        const client = new Client({ name: 'test-confirm', version: '0' });
        const [c, s] = InMemoryTransport.createLinkedPair();
        await Promise.all([server.connect(s), client.connect(c)]);
        const { tools } = await client.listTools();
        const ecritures = ['apply_payslip', 'apply_bank_statement', 'apply_broker_statement', 'apply_tax_slip', 'apply_debt',
            'set_cash', 'set_budget_item', 'delete_item'];
        for (const nom of ecritures) {
            const t = tools.find((x) => x.name === nom)!;
            const props = Object.keys((t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {});
            expect(props, nom).toContain('confirmToken');
            expect(props, nom).not.toContain('confirm');
            expect(t.annotations?.readOnlyHint, nom).toBe(false);
            expect(t.annotations?.destructiveHint, nom).toBe(nom === 'delete_item');
            expect(t.description, nom).toMatch(/DEUX TEMPS/);
        }
        // Une écriture qui passe `confirm:true` par le vrai serveur : le champ est ignoré, on reçoit un aperçu.
        const avant = await lire();
        const rep = await client.callTool({ name: 'set_cash', arguments: { targetCad: 4321, confirm: true } });
        const texte = (rep.content as Array<{ text: string }>)[0].text;
        expect(JSON.parse(texte).preview).toBe(true);
        expect(await lire()).toBe(avant);
        await client.close();
    });
});

// ── Coffre : propriétés de base ────────────────────────────────────────────────────────────────────
describe('[MCP-CONFIRM-TOKEN] confirmVault', () => {
    const liaison = { scope: 's', tool: 't', argsHash: digest({ a: 1 }), changesHash: digest([]) };

    it('empreinte canonique : indépendante de l\'ordre des clés', () => {
        expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
        expect(digest({ x: 1, y: 2 })).toBe(digest({ y: 2, x: 1 }));
        expect(digest({ x: 1 })).not.toBe(digest({ x: 2 }));
    });

    it('émettre puis consommer : ok une fois, « inconnu_ou_rejoue » ensuite', () => {
        const v = createConfirmVault();
        const { token } = v.issue(liaison);
        expect(v.consume(token, liaison)).toBe('ok');
        expect(v.consume(token, liaison)).toBe('inconnu_ou_rejoue');
    });

    it('plafond de jetons en attente : les plus anciens sont évincés (pas de croissance mémoire non bornée)', () => {
        const v = createConfirmVault();
        const premier = v.issue(liaison).token;
        for (let i = 0; i < 150; i++) v.issue(liaison);
        expect(v.consume(premier, liaison)).toBe('inconnu_ou_rejoue');
    });
});

// ── Garde structurelle : on ne peut pas OUBLIER un outil d'écriture ───────────────────────────────
describe('[MCP-CONFIRM-TOKEN] garde structurelle', () => {
    const DOSSIER = resolve(__dirname, '../../mcp/tools');
    const fichiersTool = readdirSync(DOSSIER).filter((f) => f.endsWith('.tool.ts'));

    it('aucun `*.tool.ts` n\'appelle runApply directement (tout passe par registerWriteTool)', () => {
        const sansCommentaires = (f: string): string =>
            readFileSync(join(DOSSIER, f), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
        const fautes = fichiersTool.filter((f) => /\brunApply\b/.test(sansCommentaires(f)));
        expect(fautes, `écriture hors registerWriteTool : ${fautes.join(', ')}`).toEqual([]);
    });

    it('les 8 outils d\'écriture passent par registerWriteTool (anti-vacuité)', () => {
        const passent = fichiersTool.filter((f) => /registerWriteTool\(/.test(readFileSync(join(DOSSIER, f), 'utf8')));
        expect(passent.length).toBe(8);
    });

    it('`confirm:true` n\'a plus aucun effet dans runApply (option retirée)', () => {
        const src = readFileSync(join(DOSSIER, '_writeHelper.ts'), 'utf8');
        expect(src).not.toMatch(/requireConfirm|confirmed/);
    });
});
