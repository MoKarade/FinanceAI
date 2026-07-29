// [FINTABLE Lot 1b] Docteur : décodage prudent + raisonnement sur les causes d'absence de données.

import { describe, it, expect, vi } from 'vitest';
import {
    decodeConnection,
    decodeIntegrations,
    decodeProfile,
    explainMissingData,
    readFintableDiagnostics,
} from '../../../services/fintable/readDiagnostics';
import { FintableError, type FintableDiagnostics } from '../../../services/fintable/types';
import type { FintableClient } from '../../../services/fintable/client';

const PROFILE = {
    name: 'Marc', tier: 'personal', plan_period: 'monthly',
    connection_limit: 10, connections_used: 3, can_sync: true, expires_at: '2026-08-14T00:00:00Z',
};

const CONNECTION = {
    id: 'conn_plaid_1', provider: 'PLAID', institution_name: 'Desjardins',
    healthy: true, status_text: 'OK', needs_reconnect: false,
    last_successful_update: '2026-07-28T09:12:44Z', accounts_count: 3,
    sync_status: { state: 'finished', stage: 'Sync complete', started_at: 'x', finished_at: 'y' },
};

function makeClient(routes: Record<string, unknown | Error>): FintableClient {
    const get = vi.fn(async (path: string) => {
        const r = routes[path];
        if (r === undefined) throw new FintableError(`route non stubée : ${path}`, 'NOT_FOUND');
        if (r instanceof Error) throw r;
        return { data: r, nextCursor: null, snapshotDate: null };
    });
    return { get } as unknown as FintableClient;
}

describe('decodeProfile — défauts PRUDENTS', () => {
    it('décode l\'exemple documenté', () => {
        const p = decodeProfile(PROFILE);
        expect(p.tier).toBe('personal');
        expect(p.canSync).toBe(true);
        expect(p.connectionsUsed).toBe(3);
    });

    it('`can_sync` absent → false, JAMAIS un « oui » optimiste', () => {
        // Un docteur qui suppose que la sync marche quand il ne sait pas est pire qu'inutile :
        // il écarte la cause la plus probable.
        const { can_sync: _drop, ...sansCanSync } = PROFILE;
        expect(decodeProfile(sansCanSync).canSync).toBe(false);
        expect(decodeProfile({ ...PROFILE, can_sync: 'yes' }).canSync).toBe(false);
    });
});

describe('decodeConnection — défauts PRUDENTS', () => {
    it('décode l\'exemple documenté', () => {
        const c = decodeConnection(CONNECTION, 0);
        expect(c.provider).toBe('PLAID');
        expect(c.healthy).toBe(true);
        expect(c.needsReconnect).toBe(false);
        expect(c.syncStatus?.state).toBe('finished');
    });

    it('`healthy` absent → PROBLÈME, pas « OK »', () => {
        const { healthy: _drop, ...sansHealthy } = CONNECTION;
        expect(decodeConnection(sansHealthy, 0).healthy).toBe(false);
    });

    it('une sync jamais réussie se lit `null`, pas une date bidon', () => {
        expect(decodeConnection({ ...CONNECTION, last_successful_update: null }, 0).lastSuccessfulUpdate).toBeNull();
    });
});

describe('decodeIntegrations', () => {
    it('lit les onglets configurés et repère ceux qui ne le sont pas', () => {
        const i = decodeIntegrations({
            airtable: null,
            google_sheets: [{
                title: 'Family finances', healthy: true, error: null,
                tabs: {
                    accounts: { sheet: 'Accounts', range: 'A1:Z' },
                    transactions: { sheet: 'Transactions', range: 'A1:Z' },
                    holdings: { sheet: null, range: null },
                },
            }],
        });
        expect(i.airtable).toBeNull();
        expect(i.googleSheets[0].tabs.accounts).toBe('Accounts');
        expect(i.googleSheets[0].tabs.holdings).toBeNull();
    });
});

describe('readFintableDiagnostics — tolérance aux pannes partielles', () => {
    it('rassemble profil, connexions et intégrations', async () => {
        const client = makeClient({
            '/me': PROFILE,
            '/connections': [CONNECTION],
            '/integrations': { airtable: null, google_sheets: [] },
        });
        const d = await readFintableDiagnostics(client);
        expect(d.profile.tier).toBe('personal');
        expect(d.connections).toHaveLength(1);
        expect(d.failures).toHaveLength(0);
    });

    it('une section illisible est TRACÉE, le reste du diagnostic survit', async () => {
        // Un docteur qui refuse de parler quand une pièce manque est inutile pile quand on en a besoin.
        const client = makeClient({
            '/me': PROFILE,
            '/connections': new FintableError('boom', 'SERVER'),
            '/integrations': { airtable: null, google_sheets: [] },
        });
        const d = await readFintableDiagnostics(client);
        expect(d.profile.tier).toBe('personal');
        expect(d.failures).toEqual([{ section: '/connections', reason: 'SERVER — boom' }]);
    });

    it('une erreur AUTH interrompt tout (elle invalide chaque section)', async () => {
        const client = makeClient({ '/me': new FintableError('jeton révoqué', 'AUTH') });
        await expect(readFintableDiagnostics(client)).rejects.toMatchObject({ code: 'AUTH' });
    });
});

describe('explainMissingData — le raisonnement, testable sans réseau', () => {
    const base: FintableDiagnostics = {
        readAt: 0,
        profile: { name: 'Marc', tier: 'personal', planPeriod: 'monthly', connectionLimit: 10, connectionsUsed: 3, canSync: true, expiresAt: null },
        connections: [],
        integrations: null,
        failures: [],
    };

    it('un compte sans droit de sync est signalé en priorité', () => {
        const causes = explainMissingData({ ...base, profile: { ...base.profile, tier: 'free', canSync: false } });
        expect(causes[0]).toContain('can_sync=false');
        expect(causes[0]).toContain('free');
    });

    it('une connexion à ré-authentifier est signalée', () => {
        const causes = explainMissingData({
            ...base,
            connections: [{
                id: 'c1', provider: 'PLAID', institutionName: 'Desjardins', healthy: false,
                statusText: 'ITEM_LOGIN_REQUIRED', needsReconnect: true,
                lastSuccessfulUpdate: '2026-07-01T00:00:00Z', accountsCount: 3, syncStatus: null,
            }],
        });
        expect(causes.some((c) => c.includes('RÉ-AUTHENTIFICATION'))).toBe(true);
    });

    it('une connexion qui n\'a JAMAIS synchronisé est signalée', () => {
        const causes = explainMissingData({
            ...base,
            connections: [{
                id: 'c1', provider: 'PLAID', institutionName: 'Disnat', healthy: true, statusText: 'OK',
                needsReconnect: false, lastSuccessfulUpdate: null, accountsCount: 2, syncStatus: null,
            }],
        });
        expect(causes.some((c) => c.includes('JAMAIS'))).toBe(true);
    });

    it('l\'absence de connexion SNAPTRADE est signalée comme piste pour les positions', () => {
        // Cas réel 2026-07-29 : 3 comptes de placement, 0 position. Chez Fintable le courtage passe
        // par SnapTrade ; un compte de placement lié via un provider BANCAIRE peut exposer son solde
        // sans jamais exposer ses positions.
        const causes = explainMissingData({
            ...base,
            connections: [{
                id: 'c1', provider: 'PLAID', institutionName: 'Desjardins', healthy: true, statusText: 'OK',
                needsReconnect: false, lastSuccessfulUpdate: '2026-07-28T00:00:00Z', accountsCount: 6, syncStatus: null,
            }],
        });
        expect(causes.some((c) => c.includes('SNAPTRADE'))).toBe(true);
    });

    it('une connexion SNAPTRADE présente ne déclenche PAS cette piste', () => {
        const causes = explainMissingData({
            ...base,
            connections: [{
                id: 'c1', provider: 'SNAPTRADE', institutionName: 'Disnat', healthy: true, statusText: 'OK',
                needsReconnect: false, lastSuccessfulUpdate: '2026-07-28T00:00:00Z', accountsCount: 2, syncStatus: null,
            }],
        });
        expect(causes.some((c) => c.includes('SNAPTRADE'))).toBe(false);
    });

    it('un compte parfaitement sain ne fabrique AUCUNE cause', () => {
        // Sinon le docteur crie au loup et on cesse de le lire.
        const causes = explainMissingData({
            ...base,
            connections: [{
                id: 'c1', provider: 'SNAPTRADE', institutionName: 'Disnat', healthy: true, statusText: 'OK',
                needsReconnect: false, lastSuccessfulUpdate: '2026-07-28T00:00:00Z', accountsCount: 2,
                syncStatus: { state: 'finished', stage: 'Sync complete', startedAt: 'x', finishedAt: 'y' },
            }],
        });
        expect(causes).toEqual([]);
    });
});
