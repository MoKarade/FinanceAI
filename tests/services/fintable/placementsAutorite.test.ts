// tests/services/fintable/placementsAutorite.test.ts
//
// [FINTABLE-AUTORITE-PARTOUT étape 3] Ce que valent les placements côté ÉCRAN quand le courtier fait
// autorité, et surtout : que l'écran et le moteur ne peuvent plus répondre deux choses.
//
// ⚠️ MONEY-CRITICAL. La propriété la plus importante reste ce que ce module NE change PAS : sans
// synchro Fintable, l'écart vaut 0 et la valeur est la somme des titres, au cent près.

import { describe, it, expect } from 'vitest';
import { placementsFaisantAutorite } from '../../../services/fintable/placementsAutorite';
import { appliquerAutoriteCourtier } from '../../../services/fintable/autoriteCourtier';
import { jumeauxPorteursDepuisActifs, holdingsCadByRegime } from '../../../services/fintable/holdingsByRegime';
import { computeInvestmentsValue } from '../../../services/portfolio';
import { buildFinancialOverview } from '../../../services/financialSnapshot';
import type { Asset, AppState, FintableBrokerBalance } from '../../../types';

const FX = { CAD: 1, USD: 1.4 };

const titre = (o: Partial<Asset> = {}): Asset => ({
    symbol: 'AAA', name: 'AAA', quantity: 100, currentPrice: 200, buyPrice: 100,
    currency: 'CAD', accountType: 'NON-ENREG', type: 'Stock',
    ...o,
} as unknown as Asset);

const compte = (o: Partial<FintableBrokerBalance> = {}): FintableBrokerBalance => ({
    accountId: 'acc1', label: 'Disnat', balanceCad: 30_000, taxRegime: 'NON-ENREG', at: Date.now(), ...o,
});

const etat = (o: Partial<AppState> = {}): AppState => ({
    assets: [titre()], fxRates: FX,
    // `buildFinancialOverview` traverse le budget : une config absente lève avant d'atteindre
    // ce qu'on mesure (`UNE-FIXTURE-AUX-MAUVAIS-NOMS-DE-CHAMPS-EST-UNE-FIXTURE-VIDE`, variante).
    config: { users: [] }, budgetItems: [], transactions: [], debts: [], initialBalances: {},
    ...o,
} as unknown as AppState);

describe('identité — le cas de qui n\'utilise pas Fintable', () => {
    it('sans aucun solde courtier : écart NUL et valeur = somme des titres', () => {
        const r = placementsFaisantAutorite(etat());
        expect(r.base).toBe(20_000);            // 100 × 200 $
        expect(r.ecart).toBe(0);
        expect(r.valeur).toBe(r.base);
        expect(r.regimesAppliques).toEqual([]);
    });

    it('état vide : aucune exception, aucun chiffre inventé', () => {
        const r = placementsFaisantAutorite(undefined);
        expect(r).toEqual({ base: 0, ecart: 0, valeur: 0, regimesAppliques: [], regimesRefuses: [] });
    });
});

describe('⚠️ LA GARDE DU LOT — écran et moteur ne peuvent plus diverger sur un panier REPRIS', () => {
    /**
     * Deux bases DIFFÉRENTES par construction : le moteur part de la reconstruction datée, l'écran
     * de `quantity × currentPrice`. C'est justement là que la première conception se cassait — elle
     * ajoutait l'écart du MOTEUR au total de l'ÉCRAN, ce qui n'est une identité que si les deux
     * bases coïncident. Ici on les fait volontairement diverger.
     */
    const soldesMoteur = { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 12_345, CRYPTO: 0, REEE: 0, TOTAL: 12_345 };

    it('le panier repris vaut EXACTEMENT le total du courtier des deux côtés', () => {
        const e = etat({ fintableBrokerBalances: [compte({ balanceCad: 31_000 })] });
        const assets = e.assets ?? [];
        const reconciliation = {
            regimes: [{ regime: 'NON-ENREG' as const, brokerTotalCad: 31_000, holdingsValueCad: 20_000, accountLabels: ['Disnat'] }],
        };
        const moteur = appliquerAutoriteCourtier(soldesMoteur, reconciliation, jumeauxPorteursDepuisActifs(assets, FX));
        const ecran = placementsFaisantAutorite(e);

        // Anti-vacuité : les deux BASES diffèrent vraiment (12 345 contre 20 000), sinon l'égalité
        // ci-dessous serait vraie par accident et ne prouverait rien.
        expect(soldesMoteur.NON_ENREG).not.toBe(holdingsCadByRegime(assets, FX)['NON-ENREG']);

        expect(moteur.soldes.NON_ENREG).toBe(31_000);
        expect(ecran.valeur).toBe(31_000);
        expect(ecran.regimesAppliques).toEqual(['NON-ENREG']);
        // ⚠️ Et l'écart de l'écran n'est PAS celui du moteur : c'est la raison d'être du module.
        expect(ecran.ecart).toBe(11_000);        // 31 000 − 20 000 (base ÉCRAN)
        expect(moteur.ecartTotal).toBe(18_655);  // 31 000 − 12 345 (base MOTEUR)
    });

    it('un panier NON repris garde de chaque côté sa propre base', () => {
        // Total amputé ⇒ refus partagé. L'écran garde la somme de ses titres, le moteur sa
        // reconstruction : chacun affiche ce qu'il affichait, et personne ne prétend au courtier.
        const e = etat({ fintableBrokerBalances: [compte()] });
        const reconciliation = {
            regimes: [{ regime: 'NON-ENREG' as const, brokerTotalCad: 31_000, holdingsValueCad: 20_000, accountLabels: ['Disnat'] }],
            incompleteRegimes: ['NON-ENREG' as const],
        };
        const moteur = appliquerAutoriteCourtier(soldesMoteur, reconciliation, jumeauxPorteursDepuisActifs(e.assets ?? [], FX));
        expect(moteur.soldes.NON_ENREG).toBe(12_345);
        expect(moteur.regimesRefuses).toEqual([{ regime: 'NON-ENREG', raison: 'total-partiel' }]);
    });
});

describe('le refus famille-mixte peut enfin TIRER côté écran', () => {
    it('un CELIAPP qui porte de la valeur fait refuser le total « CELI »', () => {
        // ⚠️ C'est LE cas que l'ancienne forme ne pouvait pas voir : la base de l'écran replie
        // CELIAPP sur CELI (`BUCKET_OF`), donc `sortie['CELIAPP']` y était toujours absent et le
        // refus était structurellement inatteignable — une garde qui ne peut pas tirer.
        const assets = [titre({ accountType: 'CELI', quantity: 100, currentPrice: 200 }),
                        titre({ symbol: 'BBB', accountType: 'CELIAPP', quantity: 100, currentPrice: 100 })];
        const j = jumeauxPorteursDepuisActifs(assets, FX);
        expect(j).toEqual({ CELIAPP: true, REEE: false });

        const e = etat({ assets, fintableBrokerBalances: [compte({ balanceCad: 40_000, taxRegime: 'CELI' })] });
        const r = placementsFaisantAutorite(e);
        expect(r.regimesRefuses).toEqual([{ regime: 'CELI', raison: 'famille-mixte' }]);
        expect(r.ecart).toBe(0);
        expect(r.valeur).toBe(r.base);   // 30 000 $ de titres, intacts

        // CONTRÔLE NÉGATIF : sans le CELIAPP, le même total est appliqué.
        const sansJumeau = placementsFaisantAutorite(etat({
            assets: [assets[0]], fintableBrokerBalances: e.fintableBrokerBalances,
        }));
        expect(sansJumeau.regimesAppliques).toEqual(['CELI']);
        expect(sansJumeau.valeur).toBe(40_000);
    });

    it('un titre CELIAPP SOLDÉ ne rend pas le panier mixte', () => {
        // « Il existe un actif de ce type » ferait refuser un total parfaitement applicable.
        expect(jumeauxPorteursDepuisActifs([titre({ accountType: 'CELIAPP', quantity: 0 })], FX))
            .toEqual({ CELIAPP: false, REEE: false });
    });
});

describe('la vue d\'ensemble se RECOMPOSE — ce que Marc a vu échouer sur la carte du hub', () => {
    it('valeur nette = liquidités + placements − dettes, autorité comprise', () => {
        const e = etat({
            assets: [titre()],
            initialBalances: { Compte: 5_000 },
            transactions: [],
            debts: [{ id: 'd1', name: 'x', balance: 2_000, interestRate: 5, minimumPayment: 100, category: 'Other' }],
            fintableBrokerBalances: [compte({ balanceCad: 31_000 })],
        });
        const o = buildFinancialOverview(e);
        // Anti-vacuité : l'autorité DÉPLACE bien le chiffre (sinon l'identité serait celle d'avant).
        expect(o.investments).toBe(31_000);
        expect(o.investments).not.toBe(computeInvestmentsValue(e.assets ?? [], FX, 0));
        expect(o.netWorth).toBe(o.liquidity + o.investments - o.totalDebt);
    });

    it('CONTRÔLE NÉGATIF — sans synchro, la vue d\'ensemble est INCHANGÉE', () => {
        const e = etat({ initialBalances: { Compte: 5_000 }, transactions: [], debts: [] });
        const o = buildFinancialOverview(e);
        expect(o.investments).toBe(20_000);
        expect(o.netWorth).toBe(25_000);
    });
});
