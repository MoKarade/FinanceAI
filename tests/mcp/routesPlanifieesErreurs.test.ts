// tests/mcp/routesPlanifieesErreurs.test.ts
//
// [CODEQL-37] Une panne interne ne sort JAMAIS dans la réponse HTTP des routes planifiées
// (/refresh, /fintable-sync, /vehicule/bail) : l'appelant reçoit un code FIXE, le détail
// reste dans le journal du serveur. Le store est une fausse version qui échoue avant tout
// appel réseau (lecture refusée, ou écriture impossible pour Fintable), avec un texte TÉMOIN
// qu'on cherche ensuite dans le corps de la réponse.

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
    handleRefresh, handleFintableSync, handleVehiculeBail,
    ERREUR_CONFLIT_ETAT, ERREUR_PANNE_ETAT,
} from '../../mcp/http/routesPlanifiees';
import type { ResolvedState } from '../../mcp/bootstrap';
import { StateConflictError } from '../../mcp/state/stateErrors';

const SECRET = 'un-secret-de-test-assez-long';
const TEMOIN = 'detail-interne-temoin-7f3a';

type StoreEtat = ResolvedState['store'];

/** Store dont chaque lecture échoue avec `erreur` ; `canWrite` pilote la garde Fintable. */
function storeEnPanne(erreur: Error, canWrite = true): StoreEtat {
    const refus = () => Promise.reject(erreur);
    return { canWrite, get: refus, getWithVersion: refus, save: refus } as unknown as StoreEtat;
}

function requete(method: string): IncomingMessage {
    return { method, headers: { authorization: `Bearer ${SECRET}` } } as unknown as IncomingMessage;
}

/** Réponse factice qui capture le code et le corps, et résout quand `end` est appelé. */
function reponse(): { res: ServerResponse; fin: Promise<{ status: number; corps: string }> } {
    let status = 0;
    let resoudre!: (v: { status: number; corps: string }) => void;
    const fin = new Promise<{ status: number; corps: string }>((r) => { resoudre = r; });
    const res = {
        headersSent: false,
        writeHead(s: number) { status = s; return this; },
        end(corps: string) { resoudre({ status, corps }); },
    } as unknown as ServerResponse;
    return { res, fin };
}

afterEach(() => vi.restoreAllMocks());

describe('[CODEQL-37] routes planifiées : code fixe, jamais le détail interne', () => {
    it('/refresh en panne : 503 { error: code fixe }, le détail va au journal seulement', async () => {
        const journal = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { res, fin } = reponse();
        handleRefresh(requete('POST'), res, storeEnPanne(new Error(TEMOIN)), SECRET);
        const { status, corps } = await fin;
        expect(status).toBe(503);
        expect(corps).not.toContain(TEMOIN);
        expect(JSON.parse(corps)).toEqual({ ok: false, error: ERREUR_PANNE_ETAT });
        expect(journal.mock.calls.flat().join(' ')).toContain(TEMOIN);
    });

    it('/refresh en conflit : 200 { conflict, error: code fixe } (le cron ne rougit pas)', async () => {
        const { res, fin } = reponse();
        handleRefresh(requete('POST'), res, storeEnPanne(new StateConflictError(TEMOIN)), SECRET);
        const { status, corps } = await fin;
        expect(status).toBe(200);
        expect(corps).not.toContain(TEMOIN);
        expect(JSON.parse(corps)).toEqual({ ok: false, conflict: true, error: ERREUR_CONFLIT_ETAT });
    });

    it('/fintable-sync en panne : 503 { error: code fixe }, sans aucun appel réseau', async () => {
        const journal = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { res, fin } = reponse();
        // canWrite=false : runFintableSync refuse AVANT toute lecture Fintable (aucun réseau).
        handleFintableSync(requete('POST'), res, storeEnPanne(new Error(TEMOIN), false), SECRET, 'jeton-factice', {});
        const { status, corps } = await fin;
        expect(status).toBe(503);
        expect(JSON.parse(corps)).toEqual({ ok: false, error: ERREUR_PANNE_ETAT });
        expect(journal).toHaveBeenCalled();
    });

    it('/fintable-sync en conflit : 200 { conflict, error: code fixe }', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { res, fin } = reponse();
        handleFintableSync(requete('POST'), res, storeEnPanne(new StateConflictError(TEMOIN)), SECRET, 'jeton-factice', {});
        const { status, corps } = await fin;
        expect(status).toBe(200);
        expect(corps).not.toContain(TEMOIN);
        expect(JSON.parse(corps)).toEqual({ ok: false, conflict: true, error: ERREUR_CONFLIT_ETAT });
    });

    it('/vehicule/bail état illisible : 503 { error: code fixe }, le détail va au journal seulement', async () => {
        const journal = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { res, fin } = reponse();
        handleVehiculeBail(requete('GET'), res, storeEnPanne(new Error(TEMOIN)), SECRET, undefined);
        const { status, corps } = await fin;
        expect(status).toBe(503);
        expect(corps).not.toContain(TEMOIN);
        expect(JSON.parse(corps)).toEqual({ ok: false, error: ERREUR_PANNE_ETAT });
        expect(journal.mock.calls.flat().join(' ')).toContain(TEMOIN);
    });
});
