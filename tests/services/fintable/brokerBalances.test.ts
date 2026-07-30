/**
 * [FINTABLE-6] Le montant du courtier fait autorité — réconciliation par panier fiscal.
 *
 * Ce module est money-critical : il décide du TOTAL affiché pour les placements. Les tests
 * verrouillent surtout ce qui pourrait fabriquer une fausse donnée en silence (solde illisible
 * rabattu sur 0, régime deviné, graphie de régime divergente).
 */
import { describe, it, expect } from 'vitest';
import {
    reconcileBrokerBalances,
    toPersistableBrokerBalances,
    type ReconcilableRegime,
} from '../../../services/fintable/brokerBalances';
import type { FintableBrokerBalance, RegisteredAccountType } from '../../../types';

const AT = 1_770_000_000_000;

function bal(over: Partial<FintableBrokerBalance> = {}): FintableBrokerBalance {
    return { accountId: 'acc-1', label: 'Disnat L7B1', balanceCad: 100_000, taxRegime: 'NON-ENREG', at: AT, ...over };
}

describe('reconcileBrokerBalances — autorité + écart', () => {
    it('l\'écart matérialise la différence : Σ titres + écart == total courtier (reconstructible)', () => {
        const r = reconcileBrokerBalances([bal({ balanceCad: 152_340 })], { 'NON-ENREG': 148_900 });
        expect(r.regimes).toHaveLength(1);
        const [reg] = r.regimes;
        expect(reg.brokerTotalCad).toBe(152_340);
        expect(reg.holdingsValueCad).toBe(148_900);
        expect(reg.gapCad).toBeCloseTo(3_440, 6);
        // L'invariant qui justifie tout le design : rien d'inexpliqué à l'écran.
        expect(reg.holdingsValueCad + reg.gapCad).toBeCloseTo(reg.brokerTotalCad, 6);
        expect(r.brokerTotalCad).toBe(152_340);
    });

    it('agrège PLUSIEURS comptes du même régime (les titres ne portent pas d\'id de compte)', () => {
        const r = reconcileBrokerBalances(
            [
                bal({ accountId: 'a', label: 'Disnat L7B1', balanceCad: 100_000 }),
                bal({ accountId: 'b', label: 'Disnat L7A3', balanceCad: 50_000 }),
            ],
            { 'NON-ENREG': 140_000 },
        );
        expect(r.regimes).toHaveLength(1);
        expect(r.regimes[0].brokerTotalCad).toBe(150_000);
        expect(r.regimes[0].gapCad).toBe(10_000);
        expect(r.regimes[0].accountLabels).toEqual(['Disnat L7B1', 'Disnat L7A3']);
    });

    it('sépare les régimes et ne mélange JAMAIS les paniers fiscaux', () => {
        const r = reconcileBrokerBalances(
            [
                bal({ accountId: 'a', taxRegime: 'CELI', balanceCad: 40_000 }),
                bal({ accountId: 'b', taxRegime: 'REER', balanceCad: 90_000 }),
            ],
            { CELI: 39_000, REER: 91_000 },
        );
        expect(r.regimes.map((x) => x.regime)).toEqual(['CELI', 'REER']); // ordre FIXE, déterministe
        expect(r.regimes.find((x) => x.regime === 'CELI')?.gapCad).toBe(1_000);
        expect(r.regimes.find((x) => x.regime === 'REER')?.gapCad).toBe(-1_000);
        expect(r.totalGapCad).toBe(0);
    });

    it('un compte SANS régime déclaré est signalé, jamais rangé d\'office dans un panier', () => {
        const r = reconcileBrokerBalances(
            [bal({ taxRegime: undefined, label: 'Compte mystère' })],
            { 'NON-ENREG': 0 },
        );
        expect(r.regimes).toHaveLength(0); // ← surtout PAS rangé au hasard
        expect(r.unassignedAccountLabels).toEqual(['Compte mystère']);
        expect(r.brokerTotalCad).toBe(0);
    });

    it('un solde NON FINI est ignoré, jamais rabattu sur 0 (un 0 crédible effacerait le compte)', () => {
        const nan = bal({ balanceCad: Number.NaN });
        const inf = bal({ accountId: 'b', balanceCad: Number.POSITIVE_INFINITY });
        const r = reconcileBrokerBalances([nan, inf], { 'NON-ENREG': 10_000 });
        expect(r.regimes).toHaveLength(0);
        expect(r.brokerTotalCad).toBe(0);
        // Discriminant : si on rabattait sur 0, on aurait un régime avec un écart de −10 000 $
        // (« le courtier dit 0 »), c'est-à-dire un compte effacé du patrimoine sans un mot.
        expect(r.totalGapCad).not.toBe(-10_000);
    });

    it('aucun solde courtier → réconciliation vide (l\'app garde son calcul d\'avant)', () => {
        expect(reconcileBrokerBalances(undefined, { CELI: 5 }).regimes).toHaveLength(0);
        expect(reconcileBrokerBalances([], { CELI: 5 }).brokerTotalCad).toBe(0);
    });

    it('titres non finis ou absents en face → écart == total courtier (honnête, pas NaN)', () => {
        const r = reconcileBrokerBalances([bal({ balanceCad: 1_000 })], { 'NON-ENREG': Number.NaN });
        expect(r.regimes[0].holdingsValueCad).toBe(0);
        expect(r.regimes[0].gapCad).toBe(1_000);
        expect(Number.isFinite(r.totalGapCad)).toBe(true);
    });

    it('la fraîcheur d\'un panier est celle du compte le PLUS ANCIEN (pas la plus flatteuse)', () => {
        const vieux = AT - 14 * 86_400_000;
        const r = reconcileBrokerBalances(
            [bal({ accountId: 'a', at: AT }), bal({ accountId: 'b', at: vieux })],
            { 'NON-ENREG': 0 },
        );
        expect(r.regimes[0].observedAt).toBe(vieux);
    });
});

describe('toPersistableBrokerBalances — n\'émet que ce qui peut faire autorité', () => {
    const raw = (o: Partial<{ accountId: string; label: string; currency: string; balance: number | null; taxRegime: ReconcilableRegime }> = {}) => ({
        accountId: 'acc-1', label: 'Disnat', currency: 'CAD', balance: 1_000, ...o,
    });

    it('garde un solde CAD lisible, avec son horodatage et son régime', () => {
        const out = toPersistableBrokerBalances([raw({ taxRegime: 'CELI' })], AT);
        expect(out).toEqual([{ accountId: 'acc-1', label: 'Disnat', balanceCad: 1_000, taxRegime: 'CELI', at: AT }]);
    });

    it('ÉCARTE un solde absent (null) — jamais converti en 0', () => {
        expect(toPersistableBrokerBalances([raw({ balance: null })], AT)).toEqual([]);
    });

    it('ÉCARTE une devise ≠ CAD (additionner sans conversion donnerait un total FAUX)', () => {
        expect(toPersistableBrokerBalances([raw({ currency: 'USD' })], AT)).toEqual([]);
    });

    it('garde le compte sans régime (affichable) mais SANS inventer de taxRegime', () => {
        const [out] = toPersistableBrokerBalances([raw()], AT);
        expect(out.balanceCad).toBe(1_000);
        expect('taxRegime' in out).toBe(false);
    });
});

describe('garde de parité : la graphie du régime ne doit JAMAIS diverger de l\'app', () => {
    it('ReconcilableRegime est un sous-ensemble EXACT de RegisteredAccountType', () => {
        // Verrou au COMPILE : si quelqu'un écrit 'NON_ENREGISTRE' (graphie parallèle) d'un côté,
        // cette affectation casse le typecheck — c'est le piège [[INVEST-ALLOC-GEO-SECTOR]] d'une
        // table de lookup dont la clé a dérivé, qui meurt en silence sans ce genre de garde.
        const regimes: ReconcilableRegime[] = ['CELI', 'REER', 'NON-ENREG'];
        const asAppTypes: RegisteredAccountType[] = regimes;
        expect(asAppTypes).toHaveLength(3);
        // Et le sens inverse : ces littéraux sont bien ceux que porte `Asset.accountType`.
        const fromApp: ReconcilableRegime[] = (['CELI', 'REER', 'NON-ENREG'] as RegisteredAccountType[])
            .filter((t): t is ReconcilableRegime => t === 'CELI' || t === 'REER' || t === 'NON-ENREG');
        expect(fromApp).toEqual(regimes);
    });
});
