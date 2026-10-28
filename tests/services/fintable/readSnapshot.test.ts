// [FINTABLE Lot 1] Orchestration de lecture : contrats non négociables du snapshot.

import { describe, it, expect, vi } from 'vitest';
import { readFintableSnapshot } from '../../../services/fintable/readSnapshot';
import { FintableError } from '../../../services/fintable/types';
import type { FintableClient } from '../../../services/fintable/client';

const ACCOUNT = {
    id: 'acc_1',
    connection_id: 'conn_plaid_1',
    name: 'Chase Total Checking',
    display_name: null,
    type: 'depository / checking',
    currency: 'CAD',
    balance: '5240.12',
    balance_available: '5190.12',
    sync_start_date: null,
    last_tx_date: '2026-07-25',
    enabled: true,
};

const HOLDING = {
    id: 'hol_1',
    name: 'Vanguard Total Stock Market ETF',
    symbol: 'VTI',
    quantity: '42.0000',
    price: '279.35',
    value: '11732.70',
    cost_basis: '9450.00',
    currency: 'USD',
};

const TX = {
    id: 'tx_1',
    account_id: 'acc_1',
    date: '2026-07-24',
    amount: '-4.50',
    currency: 'CAD',
    description: 'BLUE BOTTLE COFFEE',
    merchant: 'Blue Bottle Coffee',
    pending: false,
    category: { id: 'dining-out_x', name: 'Dining Out', header: 'Expenses' },
    updated_at: '2026-07-25T06:14:09Z',
};

interface Stub {
    client: FintableClient;
    get: ReturnType<typeof vi.fn>;
    getAllPages: ReturnType<typeof vi.fn>;
}

function makeStub(overrides: {
    accounts?: unknown[];
    holdings?: (accountId: string) => { data: unknown[]; snapshotDate: string | null } | Error;
    transactions?: unknown[];
} = {}): Stub {
    const get = vi.fn(async (path: string) => {
        if (path === '/accounts') {
            return { data: overrides.accounts ?? [ACCOUNT], nextCursor: null, snapshotDate: null };
        }
        const m = /^\/accounts\/([^/]+)\/holdings$/.exec(path);
        if (m) {
            const r = overrides.holdings
                ? overrides.holdings(decodeURIComponent(m[1]))
                : { data: [HOLDING], snapshotDate: '2026-07-26' };
            if (r instanceof Error) throw r;
            return { data: r.data, nextCursor: null, snapshotDate: r.snapshotDate };
        }
        throw new Error(`chemin inattendu : ${path}`);
    });
    const getAllPages = vi.fn(async () => overrides.transactions ?? [TX]);
    return { client: { get, getAllPages } as unknown as FintableClient, get, getAllPages };
}

describe('readFintableSnapshot — contrat « pending exclues »', () => {
    it('force TOUJOURS pending=false sur les transactions', async () => {
        // Non négociable : `applyDocument` déduplique mais ne SUPPRIME jamais. Une pending importée
        // puis repostée (nouvel id, montant ajusté) resterait à VIE comme doublon et fausserait le
        // cash dérivé. La doc Fintable recommande explicitement pending=false pour un miroir.
        const stub = makeStub();
        await readFintableSnapshot(stub.client, { dateFrom: '2026-01-01' });

        const [path, query] = stub.getAllPages.mock.calls[0] as unknown as [string, Record<string, unknown>];
        expect(path).toBe('/transactions');
        expect(query.pending).toBe(false);
    });

    it('aucune option ne permet de réactiver les pending', async () => {
        const stub = makeStub();
        // Même en passant une option inconnue qui tenterait de forcer la main.
        await readFintableSnapshot(stub.client, { updatedSince: '2026-07-01T00:00:00Z' } as never);
        const [, query] = stub.getAllPages.mock.calls[0] as unknown as [string, Record<string, unknown>];
        expect(query.pending).toBe(false);
    });
});

describe('readFintableSnapshot — filtres de requête', () => {
    it('mode DATE : date_from/date_to, sans order=updated', async () => {
        const stub = makeStub();
        await readFintableSnapshot(stub.client, { dateFrom: '2026-01-01', dateTo: '2026-07-29' });
        const [, q] = stub.getAllPages.mock.calls[0] as unknown as [string, Record<string, unknown>];
        expect(q.date_from).toBe('2026-01-01');
        expect(q.date_to).toBe('2026-07-29');
        expect(q.order).toBeUndefined();
    });

    it('mode INCRÉMENTAL : order=updated + updated_since, et PAS de filtre de date', async () => {
        // Le curseur est lié à son ordre de tri : mélanger les deux modes ferait rejeter le curseur
        // par l'API (400 invalid_cursor) au milieu d'une pagination.
        const stub = makeStub();
        await readFintableSnapshot(stub.client, {
            updatedSince: '2026-07-25T00:00:00Z',
            dateFrom: '2026-01-01',
        });
        const [, q] = stub.getAllPages.mock.calls[0] as unknown as [string, Record<string, unknown>];
        expect(q.order).toBe('updated');
        expect(q.updated_since).toBe('2026-07-25T00:00:00Z');
        expect(q.date_from).toBeUndefined();
        expect(q.date_to).toBeUndefined();
    });
});

describe('readFintableSnapshot — comptes', () => {
    it('exclut les comptes désactivés par défaut, les inclut sur demande', async () => {
        const accounts = [ACCOUNT, { ...ACCOUNT, id: 'acc_2', enabled: false }];
        expect((await readFintableSnapshot(makeStub({ accounts }).client)).accounts).toHaveLength(1);
        expect(
            (await readFintableSnapshot(makeStub({ accounts }).client, { includeDisabled: true })).accounts,
        ).toHaveLength(2);
    });

    it('ne lit PAS les positions des comptes désactivés', async () => {
        const stub = makeStub({ accounts: [{ ...ACCOUNT, enabled: false }] });
        await readFintableSnapshot(stub.client);
        expect(stub.get.mock.calls.filter(([p]) => String(p).includes('/holdings'))).toHaveLength(0);
    });
});

describe('readFintableSnapshot — positions', () => {
    it('demande les positions de TOUS les comptes actifs sans interpréter `type`', async () => {
        // La doc dit « display it, don't switch on it » : deviner « c'est un compte chèque, pas de
        // positions » ferait manquer un compte de placement mal étiqueté par le provider.
        const accounts = [ACCOUNT, { ...ACCOUNT, id: 'acc_2', type: 'investment / brokerage' }];
        const stub = makeStub({ accounts, holdings: () => ({ data: [HOLDING], snapshotDate: '2026-07-26' }) });
        await readFintableSnapshot(stub.client);
        const calls = stub.get.mock.calls.filter(([p]) => String(p).includes('/holdings'));
        expect(calls).toHaveLength(2);
    });

    it('propage la date de snapshot et rattache la position à son compte', async () => {
        const snap = await readFintableSnapshot(makeStub().client);
        expect(snap.holdings).toHaveLength(1);
        expect(snap.holdings[0].snapshotDate).toBe('2026-07-26');
        expect(snap.holdings[0].accountId).toBe('acc_1');
        expect(snap.holdings[0].costBasisTotal).toBe(9450);
    });

    it('un 404 de positions est NOMINAL et tracé — pas une panne', async () => {
        const stub = makeStub({
            holdings: () => new FintableError('pas de positions', 'NOT_FOUND'),
        });
        const snap = await readFintableSnapshot(stub.client);
        expect(snap.holdings).toHaveLength(0);
        expect(snap.holdingsSkipped).toEqual([
            { accountId: 'acc_1', reason: 'aucune position exposée par ce compte' },
        ]);
    });

    it('une panne PARTIELLE est enregistrée avec sa raison, jamais avalée', async () => {
        // Un skip sans signal = classe « staleness silencieuse » (cf. HIST-MULTI-PROVIDER).
        const accounts = [ACCOUNT, { ...ACCOUNT, id: 'acc_2' }];
        const stub = makeStub({
            accounts,
            holdings: (id) => (id === 'acc_2'
                ? new FintableError('trop de requêtes', 'RATE_LIMIT')
                : { data: [HOLDING], snapshotDate: '2026-07-26' }),
        });
        const snap = await readFintableSnapshot(stub.client);
        expect(snap.holdings).toHaveLength(1); // acc_1 est passé
        expect(snap.holdingsSkipped).toHaveLength(1);
        expect(snap.holdingsSkipped[0].accountId).toBe('acc_2');
        expect(snap.holdingsSkipped[0].reason).toContain('RATE_LIMIT');
    });

    it('une erreur d\'AUTH interrompt TOUT (insister brûlerait le quota pour rien)', async () => {
        const stub = makeStub({ holdings: () => new FintableError('jeton révoqué', 'AUTH') });
        await expect(readFintableSnapshot(stub.client)).rejects.toMatchObject({ code: 'AUTH' });
    });

    it('skipHoldings évite tout appel de positions (dry-run rapide)', async () => {
        const stub = makeStub();
        const snap = await readFintableSnapshot(stub.client, { skipHoldings: true });
        expect(snap.holdings).toHaveLength(0);
        expect(stub.get.mock.calls.filter(([p]) => String(p).includes('/holdings'))).toHaveLength(0);
    });
});

describe('readFintableSnapshot — forme du snapshot', () => {
    it('rend un snapshot horodaté et complet', async () => {
        const before = Date.now();
        const snap = await readFintableSnapshot(makeStub().client, { dateFrom: '2026-01-01' });
        expect(snap.readAt).toBeGreaterThanOrEqual(before);
        expect(snap.accounts[0].label).toBe('Chase Total Checking');
        expect(snap.transactions[0].amount).toBe(-4.5);
        expect(snap.transactions[0].categoryName).toBe('Dining Out');
    });

    it('propage une erreur de DÉCODAGE des transactions (montant illisible = donnée cassée)', async () => {
        const stub = makeStub({ transactions: [{ ...TX, amount: '' }] });
        await expect(readFintableSnapshot(stub.client)).rejects.toMatchObject({ code: 'MALFORMED' });
    });
});
