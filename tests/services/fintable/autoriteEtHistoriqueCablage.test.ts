/**
 * [FX-TAUX-JAMAIS-ARRIVES] + [FINTABLE-HISTORIQUE-COURTIER] — la CHAÎNE, pas les moitiés.
 *
 * ⚠️ POURQUOI CE FICHIER EXISTE. Les deux moitiés étaient déjà testées chacune chez elle
 * (`brokerBalances.test.ts` couvre le drapeau de la fonction de persistance, `provenance.test.ts`
 * couvre la lecture de la provenance) — et le CHAÎNON, lui, n'était le sujet d'aucun fichier.
 * `UN-TROU-ENTRE-DEUX-MOITIES-TESTEES-N-APPARTIENT-A-PERSONNE` : un lot peut être vert de bout en
 * bout et ne rien changer à l'écran.
 *
 * ⚠️ LA PAIRE QUI DISCRIMINE. Les deux cas portent le MÊME `fxRates.USD` — seule la PROVENANCE
 * diffère. Un câblage qui lirait la valeur (« le taux est là, donc je convertis »), ou l'ancien
 * `fxRatesEstimated` seul, rendrait les deux cas identiques : c'est exactement le défaut mesuré
 * chez Marc, dont l'état porte 1,4000 en dur et convertissait quand même tous ses placements.
 */
import { describe, it, expect, vi } from 'vitest';
import { runFintableBrowserSync } from '../../../services/fintable/browserSync';
import { FintableClient } from '../../../services/fintable/client';
import { buildDefaultAppState } from '../../../mcp/state/appStateDefaults';
import type { AppState, FintableAccountRoleConfig, FintableBrokerBalance } from '../../../types';

vi.mock('../../../services/errorLogger', () => ({ logError: vi.fn(), logErrorThrottled: vi.fn() }));

const NOW = Date.parse('2026-09-16T12:00:00Z');
const HIER = Date.parse('2026-09-15T12:00:00Z');
const now = () => NOW;

const ROLES: Record<string, FintableAccountRoleConfig> = {
    acc_usd: { kind: 'investment', taxRegime: 'NON-ENREG' },
};

function fakeClient(accounts: unknown[]): FintableClient {
    return {
        get: vi.fn(async (path: string) => (path.startsWith('/accounts') ? { data: accounts } : { data: [] })),
        getAllPages: vi.fn(async () => []),
    } as unknown as FintableClient;
}

/** Un compte courtier en USD — la seule branche où la provenance change quoi que ce soit. */
const compteUsd = () => ([{
    id: 'acc_usd', connection_id: 'c', name: 'Disnat (L7B1)', type: 'brokerage',
    currency: 'USD', balance: '72040.00', cash_balance: null, debt: null,
}]);

function etat(over: Partial<AppState> = {}): AppState {
    return {
        ...buildDefaultAppState(),
        transactions: [],
        fintableRoles: ROLES,
        // Le MÊME taux dans les deux cas. C'est le point.
        fxRates: { USD: 1.33, EUR: 1.45, CAD: 1, lastFetched: NOW },
        ...over,
    } as AppState;
}

async function passe(over: Partial<AppState> = {}) {
    return runFintableBrowserSync(etat(over), 'jeton', { client: fakeClient(compteUsd()), now });
}

describe('la PROVENANCE décide de convertir, jamais la présence du taux', () => {
    it('provenance « manuel » → le solde USD est CONVERTI', async () => {
        const r = await passe({ fxRatesSource: 'manuel', fxRatesEstimated: true });
        const [b] = (r.statePatch?.fintableBrokerBalances ?? []) as FintableBrokerBalance[];
        expect(b).toBeDefined();
        expect(b.balanceCad).toBeCloseTo(72_040 * 1.33, 6);
        expect(b.missingRate).toBeUndefined();
    });

    it('⚠️ provenance « repli » AVEC LE MÊME TAUX → refus de convertir, et le compte est NOMMÉ', async () => {
        const r = await passe({ fxRatesSource: 'repli', fxRatesEstimated: true });
        const [b] = (r.statePatch?.fintableBrokerBalances ?? []) as FintableBrokerBalance[];
        expect(b).toBeDefined();
        // `balanceCad: 0` ne signifie RIEN ici et n'est jamais lu — `missingRate` est testé avant
        // toute somme. L'entrée existe pour que le compte ne disparaisse pas en silence.
        expect(b.missingRate).toBe('USD');
        expect(b.balanceCad).toBe(0);
    });

    it('provenance « api » → converti (le cas nominal, pour que le contraste soit lisible)', async () => {
        const r = await passe({ fxRatesSource: 'api', fxRatesEstimated: false });
        const [b] = (r.statePatch?.fintableBrokerBalances ?? []) as FintableBrokerBalance[];
        expect(b.balanceCad).toBeCloseTo(72_040 * 1.33, 6);
    });

    it('un état d\'AVANT ce lot (sans provenance) garde le comportement d\'avant, à l\'octet près', async () => {
        // Rétrocompatibilité : `fxRatesEstimated` seul décidait ; il décide encore, via la dérivation.
        const estime = await passe({ fxRatesSource: undefined, fxRatesEstimated: true });
        const reel = await passe({ fxRatesSource: undefined, fxRatesEstimated: false });
        expect((estime.statePatch?.fintableBrokerBalances as FintableBrokerBalance[])[0].missingRate).toBe('USD');
        expect((reel.statePatch?.fintableBrokerBalances as FintableBrokerBalance[])[0].missingRate).toBeUndefined();
    });
});

describe('l\'historique du courtier s\'ACCUMULE au lieu d\'être écrasé', () => {
    it('la lecture du jour REJOINT celle d\'hier', async () => {
        const hier: FintableBrokerBalance[] = [
            { accountId: 'acc_usd', label: 'Disnat (L7B1)', balanceCad: 95_000, taxRegime: 'NON-ENREG', at: HIER },
        ];
        const r = await passe({ fxRatesSource: 'api', fxRatesEstimated: false, fintableBrokerHistory: hier });
        const hist = r.statePatch?.fintableBrokerHistory as FintableBrokerBalance[];
        expect(hist).toHaveLength(2);
        expect(hist.map((e) => e.at)).toEqual([HIER, NOW]);
        // ⚠️ L'instantané, lui, reste l'instantané : l'historique ne le remplace pas.
        expect((r.statePatch?.fintableBrokerBalances as FintableBrokerBalance[])[0].at).toBe(NOW);
    });

    it('sur un état VIERGE, l\'historique naît avec la première lecture', async () => {
        const r = await passe({ fxRatesSource: 'api', fxRatesEstimated: false });
        expect(r.statePatch?.fintableBrokerHistory).toHaveLength(1);
    });

    it('l\'historique porte la MÊME lecture que l\'instantané — jamais deux appels', async () => {
        // Les dériver de deux appels laisserait l'un des deux en retard d'une passe, sans signal.
        const r = await passe({ fxRatesSource: 'api', fxRatesEstimated: false });
        expect(r.statePatch?.fintableBrokerHistory).toEqual(r.statePatch?.fintableBrokerBalances);
    });
});
