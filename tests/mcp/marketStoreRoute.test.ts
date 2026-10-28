// tests/mcp/marketStoreRoute.test.ts
//
// [MARCHE-ROUTE] POST /market-store de bout en bout : vrai serveur node:http sur port éphémère, vraies requêtes.
// Ce qu'un appelant RÉEL observe : le code HTTP, la garde, et surtout ce que la réponse ne contient JAMAIS
// (clé EODHD, cours, ISIN, texte d'exception) — le journal du workflow qui l'appelle est public.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { startHttpServer, type RunningHttpServer } from '../../mcp/http';
import type { ResolvedState } from '../../mcp/bootstrap';
import { buildDefaultAppState, normalizeAppState, type StateSource } from '../../mcp/state/loadAppState';
import { makeStateStore } from '../../mcp/state/stateStore';
import { fichierVide, type FichierMarche } from '../../mcp/marche/fichierMarche';
import type { StoreMarche } from '../../mcp/marche/storeMarche';
import { StateConflictError } from '../../mcp/state/stateErrors';
import type { LecteursMarche } from '../../services/marche/passeMagasin';

const SECRET = 'un-secret-de-marche-assez-long';
const CLE = 'cle-eodhd-temoin-9d41';
const ISIN_TEST = 'XX0000000002';
const COURS_TEMOIN = 123.456789;
const TEMOIN = 'detail-interne-temoin-5c2e';

afterEach(() => vi.restoreAllMocks());

const avecCible = (): FichierMarche => ({
    ...fichierVide('2026-10-01T00:00:00.000Z'), rev: 4, cibles: [{ isin: ISIN_TEST, symboleEodhd: 'ABC.US', devise: 'USD' }],
});

function etat(marche: StoreMarche | null): ResolvedState {
    const s = normalizeAppState({ ...buildDefaultAppState() });
    const source: StateSource = { description: 'fixture marché', loadRaw: async () => JSON.stringify(s) };
    return { source, store: makeStateStore(source), isDrive: false, driveEmail: null, describe: () => 'fixture marché', marche };
}

function faussStore(lecture: () => Promise<FichierMarche | null>, ecriture?: StoreMarche['ecrire']) {
    const ecrits: FichierMarche[] = [];
    const store: StoreMarche = {
        lire: lecture,
        ecrire: ecriture ?? (async (f, rev) => { ecrits.push(f); return { ...f, rev: (rev ?? 0) + 1 }; }),
    };
    return { store, ecrits };
}

function lecteurs() {
    const appels: string[] = [];
    const l: LecteursMarche = {
        lireClotures: async (s) => { appels.push(`eod:${s}`); return { statut: 'ok', points: [['2026-10-27', COURS_TEMOIN]], ecartes: 0 }; },
        lireTaux: async (d) => { appels.push(`bdc:${d}`); return { statut: 'ok', points: [['2026-10-27', 1.4]], ecartes: 0 }; },
    };
    return { l, appels };
}

async function avecServeur(
    o: { marche: StoreMarche | null; secret?: string; cle?: string; live?: boolean; lecteurs?: LecteursMarche },
    fn: (base: string) => Promise<void>,
): Promise<void> {
    const running: RunningHttpServer = await startHttpServer({
        port: 0, host: '127.0.0.1', state: etat(o.marche),
        marketSecret: o.secret, eodhdKey: o.cle, marketLive: o.live,
        marketLecteurs: () => o.lecteurs ?? lecteurs().l,
        marketMaintenant: () => new Date('2026-10-28T20:00:00.000Z'),
    });
    try { await fn(`http://127.0.0.1:${running.port}`); } finally { await running.close(); }
}

const post = (base: string, jeton: string | null = SECRET) =>
    fetch(`${base}/market-store`, { method: 'POST', headers: jeton ? { Authorization: `Bearer ${jeton}` } : {} });

describe('POST /market-store — la garde', () => {
    it('la route N\'EXISTE PAS sans secret : 404, jamais 401', async () => {
        await avecServeur({ marche: null, cle: CLE }, async (base) => {
            const res = await post(base);
            expect(res.status).toBe(404);
            expect(((await res.json()) as { endpoints?: string[] }).endpoints ?? []).not.toContain('/market-store');
        });
    });

    it('405 hors POST, 401 sans jeton valide', async () => {
        await avecServeur({ marche: faussStore(async () => null).store, secret: SECRET, cle: CLE }, async (base) => {
            expect((await fetch(`${base}/market-store`, { headers: { Authorization: `Bearer ${SECRET}` } })).status).toBe(405);
            expect((await post(base, null)).status).toBe(401);
            expect((await post(base, 'mauvais-secret-mauvais-secret')).status).toBe(401);
        });
    });

    it('503 sans clé EODHD (et rien n\'est lu ni appelé)', async () => {
        const lire = vi.fn(async () => null);
        await avecServeur({ marche: faussStore(lire).store, secret: SECRET }, async (base) => {
            const res = await post(base);
            expect(res.status).toBe(503);
            expect(await res.json()).toEqual({ ok: false, error: 'cle-eodhd-absente' });
        });
        expect(lire).not.toHaveBeenCalled();
    });

    it('503 sans Drive (pas de store de marché)', async () => {
        await avecServeur({ marche: null, secret: SECRET, cle: CLE }, async (base) => {
            const res = await post(base);
            expect(res.status).toBe(503);
            expect(await res.json()).toEqual({ ok: false, error: 'store-marche-absent' });
        });
    });
});

describe('POST /market-store — la passe', () => {
    it('par DÉFAUT : essai à blanc — ni appel réseau, ni écriture', async () => {
        const { store, ecrits } = faussStore(async () => avecCible());
        const { l, appels } = lecteurs();
        await avecServeur({ marche: store, secret: SECRET, cle: CLE, lecteurs: l }, async (base) => {
            const res = await post(base);
            expect(res.status).toBe(200);
            const corps = await res.json() as { ok: boolean; essaiABlanc: boolean; ecrit: boolean };
            expect(corps).toMatchObject({ ok: true, essaiABlanc: true, ecrit: false });
        });
        expect(appels).toEqual([]);
        expect(ecrits).toEqual([]);
    });

    it('en réel : lit, écrit avec le rev lu, et ne rend que des compteurs (ni clé, ni cours, ni ISIN)', async () => {
        const { store, ecrits } = faussStore(async () => avecCible());
        const { l, appels } = lecteurs();
        await avecServeur({ marche: store, secret: SECRET, cle: CLE, live: true, lecteurs: l }, async (base) => {
            const res = await post(base);
            expect(res.status).toBe(200);
            const texte = await res.text();
            expect(JSON.parse(texte)).toMatchObject({ ok: true, essaiABlanc: false, ecrit: true, cibles: 1 });
            expect(texte).not.toContain(CLE);
            expect(texte).not.toContain(String(COURS_TEMOIN));
            expect(texte).not.toContain(ISIN_TEST);
            expect(texte).not.toContain('ABC');
            expect(res.headers.get('cache-control')).toMatch(/no-store/);
        });
        expect(appels).toContain('eod:ABC.US');
        expect(ecrits).toHaveLength(1);
    });

    it('conflit d\'écriture : 200 { conflict } transitoire (le cron ne rougit pas)', async () => {
        const { store } = faussStore(async () => avecCible(), async () => { throw new StateConflictError(TEMOIN); });
        await avecServeur({ marche: store, secret: SECRET, cle: CLE, live: true }, async (base) => {
            const res = await post(base);
            expect(res.status).toBe(200);
            const texte = await res.text();
            expect(JSON.parse(texte)).toEqual({ ok: false, conflict: true, error: 'conflit-etat' });
            expect(texte).not.toContain(TEMOIN);
        });
    });

    it('panne réelle : 503 code fixe, le texte de l\'exception n\'est ni rendu ni journalisé', async () => {
        const journal = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { store } = faussStore(async () => { throw new Error(`Drive KO https://exemple/?api_token=${CLE} ${TEMOIN}`); });
        await avecServeur({ marche: store, secret: SECRET, cle: CLE, live: true }, async (base) => {
            const res = await post(base);
            expect(res.status).toBe(503);
            const texte = await res.text();
            expect(JSON.parse(texte)).toEqual({ ok: false, error: 'panne-etat' });
            expect(texte).not.toContain(TEMOIN);
        });
        const lignes = journal.mock.calls.flat().join(' ');
        expect(lignes).not.toContain(CLE);
        expect(lignes).not.toContain(TEMOIN);
    });

    it('une panne de source (réseau) est COMPTÉE dans le rapport, sans citer la cause', async () => {
        const { store } = faussStore(async () => avecCible());
        const casse: LecteursMarche = {
            lireClotures: async () => { throw new Error(`https://eodhd.com/?api_token=${CLE}`); },
            lireTaux: async () => { throw new Error(TEMOIN); },
        };
        await avecServeur({ marche: store, secret: SECRET, cle: CLE, live: true, lecteurs: casse }, async (base) => {
            const res = await post(base);
            const texte = await res.text();
            expect(texte).not.toContain(CLE);
            expect(texte).not.toContain(TEMOIN);
            const corps = JSON.parse(texte) as { rapport: { clotures: { echecsReseau: number }; taux: { echecsReseau: number } } };
            expect(corps.rapport.clotures.echecsReseau).toBe(1);
            expect(corps.rapport.taux.echecsReseau).toBe(1);
        });
    });
});
