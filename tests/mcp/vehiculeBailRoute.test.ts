// tests/mcp/vehiculeBailRoute.test.ts
//
// [VEHICULE-BAIL] — la ROUTE de bout en bout : vrai serveur node:http sur port éphémère,
// vraies requêtes fetch. Le module pur est éprouvé ailleurs (`vehiculeBail.test.ts`) ;
// ici on éprouve ce qu'un appelant RÉEL observe — le code HTTP, la garde, les en-têtes.
//
// ⚠️ Le cas qui compte le plus est le 404 SANS secret : une route gardée qui répondrait 401
// confirmerait son existence à qui la sonde. Un `expect(401)` mal placé passerait pour un
// durcissement alors qu'il serait une fuite.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startHttpServer, type RunningHttpServer } from '../../mcp/http';
import type { ResolvedState } from '../../mcp/bootstrap';
import { buildDefaultAppState, normalizeAppState, type StateSource } from '../../mcp/state/loadAppState';
import { makeStateStore } from '../../mcp/state/stateStore';
import type { AppState, Debt } from '../../types';

const SECRET = 'un-secret-de-test-assez-long';

// ⚠️ L'id des dettes de fixture suit la convention HORODATÉE des ids réels, et ce n'est pas
// cosmétique : le store DÉSINFECTE ce qu'il lit (`sanitizePersonaArtifacts`), et `'d1'` figure
// dans `PERSONA_EXACT_IDS` — une dette portant cet id est PURGÉE à la lecture. Mesuré ici :
// `store.get()` rendait `debts: []` et la route répondait 404 sur une fixture qui « avait »
// pourtant une dette. Le sanitizer avait raison ; c'est la fixture qui mentait.

const dette = (over: Partial<Debt> = {}): Debt => ({
    id: 'debt_1789480000000', name: 'Civic', balance: 30000, interestRate: 0, minimumPayment: 650, category: 'Car', ...over,
});

function fixture(debts: Debt[]): ResolvedState {
    const state: AppState = normalizeAppState({ ...buildDefaultAppState(), debts });
    const source: StateSource = { description: 'fixture bail', loadRaw: async () => JSON.stringify(state) };
    return { source, store: makeStateStore(source), isDrive: false, driveEmail: null, describe: () => 'fixture bail' };
}

async function avecServeur(
    opts: { debts: Debt[]; secret?: string; nom?: string },
    fn: (base: string) => Promise<void>,
): Promise<void> {
    const running: RunningHttpServer = await startHttpServer({
        port: 0, host: '127.0.0.1', state: fixture(opts.debts),
        vehiculeSecret: opts.secret, vehiculeNomDette: opts.nom,
    });
    try {
        await fn(`http://127.0.0.1:${running.port}`);
    } finally {
        await running.close();
    }
}

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('GET /vehicule/bail — la garde', () => {
    it('la route N’EXISTE PAS sans secret : 404, jamais 401 (ne pas confirmer le endpoint)', async () => {
        await avecServeur({ debts: [dette()] }, async (base) => {
            const res = await fetch(`${base}/vehicule/bail`, { headers: bearer(SECRET) });
            expect(res.status).toBe(404);
            const body = await res.json() as { error?: string; endpoints?: string[] };
            expect(body.error).toBe('introuvable');
            // Et elle ne s'annonce pas non plus dans la liste des endpoints connus.
            expect(body.endpoints ?? []).not.toContain('/vehicule/bail');
        });
    });

    it('401 sans jeton, 401 avec un mauvais jeton', async () => {
        await avecServeur({ debts: [dette()], secret: SECRET }, async (base) => {
            expect((await fetch(`${base}/vehicule/bail`)).status).toBe(401);
            expect((await fetch(`${base}/vehicule/bail`, { headers: bearer('mauvais') })).status).toBe(401);
        });
    });

    it('405 sur une autre méthode que GET, même avec le bon jeton', async () => {
        await avecServeur({ debts: [dette()], secret: SECRET }, async (base) => {
            const res = await fetch(`${base}/vehicule/bail`, { method: 'POST', headers: bearer(SECRET) });
            expect(res.status).toBe(405);
        });
    });
});

describe('GET /vehicule/bail — les réponses', () => {
    it('200 avec le bail, et `no-store` (un solde est un instantané)', async () => {
        await avecServeur({ debts: [dette()], secret: SECRET }, async (base) => {
            const res = await fetch(`${base}/vehicule/bail`, { headers: bearer(SECRET) });
            expect(res.status).toBe(200);
            expect(res.headers.get('cache-control')).toBe('no-store');
            const body = await res.json() as { ok: boolean; bail: { nom: string; mensualite: number; champsAbsents: string[] } };
            expect(body.ok).toBe(true);
            expect(body.bail.nom).toBe('Civic');
            expect(body.bail.mensualite).toBe(650);
            expect(body.bail.champsAbsents).toContain('debut');
        });
    });

    it('404 quand aucune dette n’est un véhicule', async () => {
        await avecServeur({ debts: [dette({ category: 'CreditCard' })], secret: SECRET }, async (base) => {
            const res = await fetch(`${base}/vehicule/bail`, { headers: bearer(SECRET) });
            expect(res.status).toBe(404);
            expect((await res.json() as { statut: string }).statut).toBe('introuvable');
        });
    });

    it('409 quand deux véhicules coexistent — on REFUSE de choisir, et on nomme', async () => {
        const deux = [dette({ id: 'a', name: 'Civic' }), dette({ id: 'b', name: 'Corolla' })];
        await avecServeur({ debts: deux, secret: SECRET }, async (base) => {
            const res = await fetch(`${base}/vehicule/bail`, { headers: bearer(SECRET) });
            expect(res.status).toBe(409);
            const body = await res.json() as { statut: string; candidates: string[] };
            expect(body.statut).toBe('ambigu');
            expect(body.candidates).toEqual(['Civic', 'Corolla']);
        });
    });

    it('le nom configuré LÈVE l’ambiguïté — c’est à ça qu’il sert', async () => {
        const deux = [dette({ id: 'a', name: 'Civic' }), dette({ id: 'b', name: 'Corolla' })];
        await avecServeur({ debts: deux, secret: SECRET, nom: 'Corolla' }, async (base) => {
            const res = await fetch(`${base}/vehicule/bail`, { headers: bearer(SECRET) });
            expect(res.status).toBe(200);
            expect((await res.json() as { bail: { nom: string } }).bail.nom).toBe('Corolla');
        });
    });
});
