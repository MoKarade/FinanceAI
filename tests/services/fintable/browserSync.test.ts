/**
 * [FINTABLE-7] Sync Fintable exécutée dans le NAVIGATEUR.
 *
 * Ce chemin écrit de l'argent réel sans supervision de la même façon que le cron serveur — les
 * tests verrouillent donc les mêmes garanties : rapport TOUJOURS rendu, isolation par payload,
 * bascule plafonnée, et surtout « aucun état écrit à moitié » quand la passe échoue.
 */
import { describe, it, expect, vi } from 'vitest';
import { runFintableBrowserSync } from '../../../services/fintable/browserSync';
import { FintableClient } from '../../../services/fintable/client';
import { FintableError } from '../../../services/fintable/types';
import { buildDefaultAppState } from '../../../mcp/state/appStateDefaults';
import type { AppState, FintableAccountRoleConfig } from '../../../types';
import type { FintableAccountRole } from '../../../services/fintable/mapSnapshot';

vi.mock('../../../services/errorLogger', () => ({ logError: vi.fn() }));

const NOW = Date.parse('2026-07-30T12:00:00Z');
const now = () => NOW;

function stateWith(over: Partial<AppState> = {}): AppState {
    return { ...buildDefaultAppState(), transactions: [], ...over } as AppState;
}

/** Faux client : rend des comptes/transactions au FORMAT BRUT de l'API (décodeur strict en aval). */
function fakeClient(accounts: unknown[], transactions: unknown[] = []): FintableClient {
    return {
        get: vi.fn(async (path: string) => {
            if (path.startsWith('/accounts')) return { data: accounts };
            return { data: [] };
        }),
        getAllPages: vi.fn(async () => transactions),
    } as unknown as FintableClient;
}

const account = (o: Record<string, unknown> = {}) => ({
    id: 'acc_1', connection_id: 'conn_1', name: 'Compte chèque', type: 'depository',
    currency: 'CAD', balance: '1500.00', cash_balance: null, debt: null, ...o,
});

describe('runFintableBrowserSync — garanties de la passe', () => {
    it('jeton absent → rapport d\'échec explicite, AUCUN état rendu', async () => {
        const r = await runFintableBrowserSync(stateWith(), '  ', { now });
        expect(r.nextState).toBeNull();
        expect(r.report.error).toMatch(/[Jj]eton Fintable absent/);
        // Compteurs à 0 : sur un échec on ne fabrique aucune donnée (no-fake-data).
        expect(r.report.transactionsAdded).toBe(0);
        expect(r.report.accountsSeen).toBe(0);
    });

    it('panne réseau → rapport d\'échec, jamais de throw ni d\'état à moitié appliqué', async () => {
        const client = {
            get: vi.fn(async () => { throw new FintableError('panne réseau', 'NETWORK'); }),
            getAllPages: vi.fn(async () => []),
        } as unknown as FintableClient;

        const r = await runFintableBrowserSync(stateWith(), 'jeton', { client, now });
        expect(r.nextState).toBeNull(); // ← rien à écrire : l'appelant ne peut pas corrompre l'état
        expect(r.report.error).toContain('NETWORK');
        expect(r.report.error).toContain('panne réseau');
    });

    it('compte de liquidités avec rôle → cash mis à jour et soldes courtier persistés', async () => {
        const roles: Record<string, FintableAccountRoleConfig> = {
            acc_1: { kind: 'cash' },
            acc_2: { kind: 'investment', taxRegime: 'NON-ENREG' },
        };
        const client = fakeClient([
            account(),
            account({ id: 'acc_2', name: 'Disnat', type: 'brokerage', balance: '136863.18' }),
        ]);

        const r = await runFintableBrowserSync(stateWith({ fintableRoles: roles }), 'jeton', { client, now });

        expect(r.report.error).toBeNull();
        expect(r.nextState).not.toBeNull();
        expect(r.report.accountsSeen).toBe(2);
        expect(r.report.accountsWithoutRole).toBe(0);
        expect(r.nextState?.fintableBrokerBalances).toEqual([
            { accountId: 'acc_2', label: 'Disnat', balanceCad: 136863.18, taxRegime: 'NON-ENREG', at: NOW },
        ]);
        // Le rapport voyage dans l'état → la carte de diagnostic affiche la même chose que le cron.
        expect(r.nextState?.fintableSyncReport?.at).toBe(NOW);
    });

    it('compte SANS rôle → compté et signalé, jamais deviné', async () => {
        const client = fakeClient([account({ id: 'acc_inconnu', name: 'Compte mystère' })]);
        const r = await runFintableBrowserSync(stateWith({ fintableRoles: {} }), 'jeton', { client, now });

        expect(r.report.error).toBeNull();
        expect(r.report.accountsWithoutRole).toBe(1);
        expect(r.report.warnings.some((w) => w.includes('sans rôle'))).toBe(true);
        // Rien n'a été rangé d'office : aucun solde courtier, aucune dette.
        expect(r.nextState?.fintableBrokerBalances).toEqual([]);
        expect(r.report.debtsUpdated).toEqual([]);
    });

    it('transaction datée dans le FUTUR → bascule plafonnée à aujourd\'hui, avec avertissement', async () => {
        const state = stateWith({
            transactions: [
                { id: 1, date: '2099-01-01', payee: 'Typo', amount: -10, category: 'Autre', status: 'processed' },
            ] as AppState['transactions'],
        });
        const r = await runFintableBrowserSync(state, 'jeton', { client: fakeClient([]), now });

        expect(r.report.cutoverDateUsed).toBe('2026-07-30');
        expect(r.report.warnings.some((w) => w.includes('FUTUR'))).toBe(true);
    });

    it('une dette au rôle sans nom est ignorée sans faire échouer la passe', async () => {
        const roles = { acc_1: { kind: 'debt', debtName: '   ' } } as unknown as Record<string, FintableAccountRoleConfig>;
        const r = await runFintableBrowserSync(stateWith({ fintableRoles: roles }), 'jeton', {
            client: fakeClient([account()]), now,
        });
        expect(r.report.error).toBeNull();          // la passe survit
        expect(r.report.accountsWithoutRole).toBe(1); // et le compte est signalé, pas avalé
    });
});

describe('garde de parité : rôle PERSISTÉ ≡ rôle du MAPPER', () => {
    it('les deux formes sont mutuellement assignables (verrou au COMPILE)', () => {
        // `FintableAccountRoleConfig` (types.ts, sans dépendance) et `FintableAccountRole`
        // (mapper pur) sont volontairement déclarés séparément. Si l'un dérive — un `kind` ajouté
        // d'un seul côté, une graphie de régime divergente — ces affectations cassent le typecheck
        // au lieu de laisser un rôle mal formé filer jusqu'au mapper à l'exécution.
        const persisted: FintableAccountRoleConfig[] = [
            { kind: 'cash' },
            { kind: 'debt', debtName: 'Visa' },
            { kind: 'investment' },
            { kind: 'investment', taxRegime: 'NON-ENREG' },
            { kind: 'ignore' },
        ];
        const asMapper: FintableAccountRole[] = persisted;
        const backAgain: FintableAccountRoleConfig[] = asMapper;
        expect(backAgain).toHaveLength(5);
    });
});
