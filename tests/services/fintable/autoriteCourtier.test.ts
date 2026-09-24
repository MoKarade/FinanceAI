// tests/services/fintable/autoriteCourtier.test.ts
//
// [FINTABLE-AUTORITE-AUJOURDHUI] Le total du courtier fait autorité sur le point de DÉPART.
//
// ⚠️ MONEY-CRITICAL : ce module réécrit les soldes qui alimentent le mois 0 du moteur. La propriété
// la plus importante n'est donc pas ce qu'il CHANGE mais ce qu'il ne change PAS — pour qui n'utilise
// pas la synchro Fintable, la sortie doit être l'entrée, à l'objet près.

import { describe, it, expect } from 'vitest';
import {
    appliquerAutoriteCourtier, mentionAutoriteCourtier, AUCUN_JUMEAU,
    type SoldesDepart, type ReconciliationLue, type JumeauxPorteurs,
} from '../../../services/fintable/autoriteCourtier';

const soldes = (p: Partial<SoldesDepart> = {}): SoldesDepart => ({
    CELI: 10_000, CELIAPP: 0, REER: 50_000, NON_ENREG: 200_000,
    CRYPTO: 1_000, REEE: 0, TOTAL: 261_000, historicalRate: 7.5,
    ...p,
});

const reco = (regimes: ReconciliationLue['regimes']): ReconciliationLue => ({ regimes });

/** [FINTABLE-AUTORITE-PARTOUT étape 3] Les jumeaux sont désormais un ARGUMENT, plus une lecture des
 *  soldes : le fait « le CELIAPP porte-t-il quelque chose ? » porte sur les AVOIRS, pas sur une base
 *  de calcul. Par défaut aucun ne porte rien — le cas de la grande majorité des états. */
const jumeaux = (p: Partial<JumeauxPorteurs> = {}): JumeauxPorteurs => ({ ...AUCUN_JUMEAU, ...p });

describe('identité — le cas de qui n\'utilise pas Fintable', () => {
    it('rend l\'OBJET D\'ENTRÉE quand il n\'y a aucun régime réconcilié', () => {
        const entree = soldes();
        const r = appliquerAutoriteCourtier(entree, reco([]), AUCUN_JUMEAU);
        // Identité de RÉFÉRENCE, pas seulement d'égalité : les consommateurs sont des `useMemo`
        // dont les dépendances comparent les références. Reconstruire un objet identique ferait
        // recalculer toute la projection à chaque rendu, sans qu'aucun chiffre ne bouge.
        expect(r.soldes).toBe(entree);
        expect(r.ecartTotal).toBe(0);
        expect(r.regimesAppliques).toEqual([]);
    });

    it('rend l\'objet d\'entrée quand la réconciliation est absente', () => {
        const entree = soldes();
        expect(appliquerAutoriteCourtier(entree, undefined, AUCUN_JUMEAU).soldes).toBe(entree);
    });
});

describe('autorité appliquée', () => {
    it('remplace le panier par le total du courtier et RECALCULE le total', () => {
        const r = appliquerAutoriteCourtier(soldes(), reco([
            { regime: 'NON-ENREG', brokerTotalCad: 237_450, holdingsValueCad: 200_000, accountLabels: ['Disnat'] },
        ]), AUCUN_JUMEAU);
        expect(r.soldes.NON_ENREG).toBe(237_450);
        expect(r.ecartTotal).toBe(37_450);
        // Le TOTAL est la somme des six paniers — jamais l'ancien total plus l'écart, qui
        // coïnciderait ici et divergerait dès qu'un autre panier serait non fini.
        expect(r.soldes.TOTAL).toBe(10_000 + 0 + 50_000 + 0 + 237_450 + 1_000);
        expect(r.regimesAppliques).toEqual(['NON-ENREG']);
    });

    it('applique PLUSIEURS paniers, et laisse intacts ceux que Fintable ne déclare pas', () => {
        const r = appliquerAutoriteCourtier(soldes(), reco([
            { regime: 'CELI', brokerTotalCad: 12_500, holdingsValueCad: 10_000, accountLabels: ['WS CELI'] },
            { regime: 'REER', brokerTotalCad: 48_000, holdingsValueCad: 50_000, accountLabels: ['WS REER'] },
        ]), AUCUN_JUMEAU);
        expect(r.soldes.CELI).toBe(12_500);
        expect(r.soldes.REER).toBe(48_000);
        // CELIAPP / REEE / CRYPTO ne sont pas réconciliables — Fintable ne déclare pas ces régimes.
        expect(r.soldes.CRYPTO).toBe(1_000);
        expect(r.soldes.NON_ENREG).toBe(200_000);
        expect(r.ecartTotal).toBe(2_500 - 2_000);
    });

    it('un écart NÉGATIF est appliqué tel quel (le courtier peut dire MOINS)', () => {
        const r = appliquerAutoriteCourtier(soldes(), reco([
            { regime: 'NON-ENREG', brokerTotalCad: 180_000, holdingsValueCad: 200_000, accountLabels: ['D'] },
        ]), AUCUN_JUMEAU);
        expect(r.soldes.NON_ENREG).toBe(180_000);
        expect(r.ecartTotal).toBe(-20_000);
    });

    it('⚠️ `historicalRate` n\'est PAS recalculé — c\'est un RENDEMENT, pas un solde', () => {
        // Le total du courtier contient aussi les liquidités du compte et les positions que Fintable
        // ne détaille pas : le mêler à une mesure de rendement remplacerait un chiffre imparfait par
        // un chiffre faux (`UN-CORRECTIF-PEUT-ETRE-PIRE-QUE-LE-DEFAUT-SUR-UNE-BRANCHE`).
        const r = appliquerAutoriteCourtier(soldes({ historicalRate: 7.5 }), reco([
            { regime: 'NON-ENREG', brokerTotalCad: 999_999, holdingsValueCad: 200_000, accountLabels: ['D'] },
        ]), AUCUN_JUMEAU);
        expect(r.soldes.historicalRate).toBe(7.5);
    });
});

describe('robustesse — un total non fini ne devient JAMAIS un 0 crédible', () => {
    it('IGNORE le régime et ne le déclare pas appliqué', () => {
        for (const mauvais of [Number.NaN, Number.POSITIVE_INFINITY, undefined as unknown as number]) {
            const r = appliquerAutoriteCourtier(soldes(), reco([
                { regime: 'NON-ENREG', brokerTotalCad: mauvais, holdingsValueCad: 200_000, accountLabels: ['D'] },
            ]), AUCUN_JUMEAU);
            // no-fake-data : 0 $ effacerait tout un panier du patrimoine sans un mot.
            expect(r.soldes.NON_ENREG).toBe(200_000);
            expect(r.regimesAppliques).toEqual([]);
            expect(r.ecartTotal).toBe(0);
        }
    });

    it('applique les régimes VALIDES même si un autre est illisible', () => {
        const r = appliquerAutoriteCourtier(soldes(), reco([
            { regime: 'CELI', brokerTotalCad: 12_500, holdingsValueCad: 10_000, accountLabels: ['a'] },
            { regime: 'REER', brokerTotalCad: Number.NaN, holdingsValueCad: 50_000, accountLabels: ['b'] },
        ]), AUCUN_JUMEAU);
        expect(r.soldes.CELI).toBe(12_500);
        expect(r.soldes.REER).toBe(50_000);
        expect(r.regimesAppliques).toEqual(['CELI']);
    });
});

describe('mentionAutoriteCourtier — la marche au raccord, NOMMÉE', () => {
    it('ne dit rien quand aucun panier n\'a été repris', () => {
        expect(mentionAutoriteCourtier(0, [])).toBe('');
        expect(mentionAutoriteCourtier(50_000, [])).toBe('');
    });

    it('ne dit rien quand l\'écart est nul au dollar près', () => {
        expect(mentionAutoriteCourtier(0.4, ['CELI'])).toBe('');
        expect(mentionAutoriteCourtier(Number.NaN, ['CELI'])).toBe('');
    });

    it('dit le SENS, et ne porte AUCUN montant', () => {
        // Un montant interpolé dans une chaîne n'est plus un nœud, donc plus masquable en mode
        // discret (`UN-MONTANT-INTERPOLE-DANS-UNE-CHAINE-N-EST-PLUS-UN-NOEUD`).
        const haut = mentionAutoriteCourtier(37_450, ['NON-ENREG']);
        const bas = mentionAutoriteCourtier(-20_000, ['NON-ENREG']);
        expect(haut).toContain('au-dessus');
        expect(bas).toContain('en dessous');
        for (const m of [haut, bas]) {
            expect(m).not.toMatch(/\d/);          // aucun chiffre, donc aucun montant
            expect(m).toContain('courtier');
            expect(m).toContain('raccord');
        }
    });
});

// ⚠️⚠️ CE BLOC DÉFEND CONTRE LE DÉFAUT LE PLUS CHER DU LOT, trouvé par le panel APRÈS la CI verte.
//
// `reconcileBrokerBalances` ÉCARTE un compte dont le taux manque, dont le solde est illisible ou
// dont le régime n'est pas déclaré — trois listes existent pour qu'aucun ne disparaisse en silence.
// Mais `brokerTotalCad` est alors la somme des SEULS comptes retenus. Tant que ce total ne servait
// qu'à une carte d'écart, ça ne coûtait rien ; depuis que le mois 0 de la projection le consomme,
// un total AMPUTÉ écrase la valeur reconstruite COMPLÈTE.
//
// Mesuré sur la chaîne réelle : un compte CAD retenu + un compte USD écarté faute de taux —
// c'est-à-dire EXACTEMENT le cas type tant que les taux viennent du repli — donnait un mois 0
// égal au seul compte CAD au lieu de la valeur complète. Un total partiel n'est pas une autorité dégradée : c'est un faux.
describe('⚠️ un total courtier AMPUTÉ ne fait autorité sur rien', () => {
    const avecUnCompteEcarte = (over: Partial<ReconciliationLue> = {}): ReconciliationLue => ({
        regimes: [
            { regime: 'NON-ENREG', brokerTotalCad: 28_500, holdingsValueCad: 237_450, accountLabels: ['Disnat CAD'] },
        ],
        ...over,
    });

    it('REFUSE le régime dont un compte a été écarté, et DIT pourquoi', () => {
        const r = appliquerAutoriteCourtier(soldes(), avecUnCompteEcarte({ incompleteRegimes: ['NON-ENREG'] }), AUCUN_JUMEAU);
        expect(r.soldes.NON_ENREG).toBe(200_000);        // la valeur reconstruite est CONSERVÉE
        expect(r.regimesAppliques).toEqual([]);
        expect(r.regimesRefuses).toEqual([{ regime: 'NON-ENREG', raison: 'total-partiel' }]);
        expect(r.ecartTotal).toBe(0);
    });

    it('REFUSE TOUT quand un compte écarté n\'est rattachable à aucun panier', () => {
        // On ignore alors QUEL panier est amputé : le patrimoine de ce compte vit quelque part dans
        // la reconstruction, et n'importe lequel peut être celui-là.
        const r = appliquerAutoriteCourtier(soldes(), avecUnCompteEcarte({ hasUnplaceableAccount: true }), AUCUN_JUMEAU);
        expect(r.regimesAppliques).toEqual([]);
        expect(r.regimesRefuses).toEqual([{ regime: 'NON-ENREG', raison: 'compte-non-placable' }]);
    });

    it('CONTRÔLE NÉGATIF — rien d\'écarté : le régime est appliqué normalement', () => {
        // Sans lui, « on refuse les totaux amputés » serait indiscernable de « on ne fait plus rien ».
        const r = appliquerAutoriteCourtier(soldes(), avecUnCompteEcarte(), AUCUN_JUMEAU);
        expect(r.soldes.NON_ENREG).toBe(28_500);
        expect(r.regimesAppliques).toEqual(['NON-ENREG']);
        expect(r.regimesRefuses).toEqual([]);
    });

    it('un régime SAIN reste appliqué même quand un AUTRE est amputé', () => {
        const r = appliquerAutoriteCourtier(soldes(), {
            regimes: [
                { regime: 'CELI', brokerTotalCad: 12_500, holdingsValueCad: 10_000, accountLabels: ['a'] },
                { regime: 'NON-ENREG', brokerTotalCad: 28_500, holdingsValueCad: 200_000, accountLabels: ['b'] },
            ],
            incompleteRegimes: ['NON-ENREG'],
        }, AUCUN_JUMEAU);
        expect(r.soldes.CELI).toBe(12_500);
        expect(r.soldes.NON_ENREG).toBe(200_000);
        expect(r.regimesAppliques).toEqual(['CELI']);
    });
});

// ⚠️⚠️ ET LE PLUS DISCRET : une asymétrie entre DEUX modules, invisible à la lecture de l'un seul.
//
// La base de comparaison (`holdingsCadByRegime` → `BUCKET_OF`) REPLIE CELIAPP sur CELI et REEE sur
// REER (« même famille fiscale », décision écrite), pendant que `deriveStartingBalancesFromHistory`
// les garde SÉPARÉS. Écrire le total courtier « CELI » — comparé à CELI + CELIAPP — dans le seul
// panier `CELI` pendant que `CELIAPP` conserve sa valeur compte le CELIAPP DEUX FOIS.
// Mesuré : CELI 41 000 + CELIAPP 25 500 déclarés `CELI` chez le courtier rendaient 91 500 $ pour
// 66 500 $ réels.
//
// ⚠️⚠️ CE QUI A CHANGÉ LE 2026-09-17 (`[FINTABLE-AUTORITE-PARTOUT]` étape 3), et pourquoi ces tests
// sont INVERSÉS au même endroit plutôt que réécrits ailleurs : le fait « le jumeau porte-t-il une
// valeur ? » se lisait dans les SOLDES passés en entrée. Il est devenu un ARGUMENT. Ce n'est pas
// cosmétique — lu dans une base de calcul, ce refus répondait sur la base du MOTEUR, et l'écran
// (dont la base replie CELIAPP sur CELI par construction) n'aurait JAMAIS pu le faire tirer : une
// garde structurellement inatteignable n'est pas une protection. Il est en prime plus sûr : un
// CELIAPP dont tous les titres sont écartés de la reconstruction valait `0` dans les soldes.
describe('⚠️ base de FAMILLE écrite dans un panier ÉTROIT', () => {
    it('REFUSE CELI tant que CELIAPP porte une valeur', () => {
        const r = appliquerAutoriteCourtier(
            soldes({ CELI: 41_000, CELIAPP: 25_500 }),
            { regimes: [{ regime: 'CELI', brokerTotalCad: 66_500, holdingsValueCad: 66_500, accountLabels: ['a'] }] },
            jumeaux({ CELIAPP: true }),
        );
        expect(r.soldes.CELI).toBe(41_000);
        expect(r.soldes.CELIAPP).toBe(25_500);
        expect(r.regimesRefuses).toEqual([{ regime: 'CELI', raison: 'famille-mixte' }]);
    });

    it('REFUSE REER tant que REEE porte une valeur', () => {
        const r = appliquerAutoriteCourtier(
            soldes({ REER: 101_000, REEE: 30_500 }),
            { regimes: [{ regime: 'REER', brokerTotalCad: 131_500, holdingsValueCad: 131_500, accountLabels: ['a'] }] },
            jumeaux({ REEE: true }),
        );
        expect(r.soldes.REER).toBe(101_000);
        expect(r.regimesRefuses).toEqual([{ regime: 'REER', raison: 'famille-mixte' }]);
    });

    it('⚠️ LE CAS QUE L\'ANCIENNE FORME NE POUVAIT PAS VOIR : jumeau à ZÉRO dans les soldes, mais RÉEL', () => {
        // Un CELIAPP dont tous les titres sont écartés de la reconstruction (queue de chandelles
        // périmée) vaut `0` dans `soldes` — l'ancien test `sortie['CELIAPP'] !== 0` était donc FAUX
        // et le total courtier « CELI » s'écrivait par-dessus un CELIAPP bien réel. C'est le fait,
        // pas la base, qui tranche maintenant.
        const r = appliquerAutoriteCourtier(
            soldes({ CELI: 41_000, CELIAPP: 0 }),
            { regimes: [{ regime: 'CELI', brokerTotalCad: 66_500, holdingsValueCad: 66_500, accountLabels: ['a'] }] },
            jumeaux({ CELIAPP: true }),
        );
        expect(r.soldes.CELI).toBe(41_000);
        expect(r.regimesRefuses).toEqual([{ regime: 'CELI', raison: 'famille-mixte' }]);
    });

    it('CONTRÔLE NÉGATIF — aucun jumeau ne porte rien : CELI est appliqué', () => {
        const r = appliquerAutoriteCourtier(
            soldes({ CELI: 41_000, CELIAPP: 0 }),
            { regimes: [{ regime: 'CELI', brokerTotalCad: 66_500, holdingsValueCad: 41_000, accountLabels: ['a'] }] },
            AUCUN_JUMEAU,
        );
        expect(r.soldes.CELI).toBe(66_500);
        expect(r.regimesAppliques).toEqual(['CELI']);
    });

    it('CONTRÔLE NÉGATIF — NON-ENREG n\'a pas de jumeau : jamais refusé pour cette raison', () => {
        // `NonReg` est large des DEUX côtés (MARGE et AUTRE y tombent aussi), donc cohérent.
        const r = appliquerAutoriteCourtier(
            soldes({ CELIAPP: 25_500, REEE: 30_500 }),
            { regimes: [{ regime: 'NON-ENREG', brokerTotalCad: 237_450, holdingsValueCad: 200_000, accountLabels: ['a'] }] },
            jumeaux({ CELIAPP: true, REEE: true }),
        );
        expect(r.soldes.NON_ENREG).toBe(237_450);
        expect(r.regimesAppliques).toEqual(['NON-ENREG']);
    });
});
