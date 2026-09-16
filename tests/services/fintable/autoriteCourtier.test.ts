// tests/services/fintable/autoriteCourtier.test.ts
//
// [FINTABLE-AUTORITE-AUJOURDHUI] Le total du courtier fait autorité sur le point de DÉPART.
//
// ⚠️ MONEY-CRITICAL : ce module réécrit les soldes qui alimentent le mois 0 du moteur. La propriété
// la plus importante n'est donc pas ce qu'il CHANGE mais ce qu'il ne change PAS — pour qui n'utilise
// pas la synchro Fintable, la sortie doit être l'entrée, à l'objet près.

import { describe, it, expect } from 'vitest';
import {
    appliquerAutoriteCourtier, mentionAutoriteCourtier,
    type SoldesDepart, type ReconciliationLue,
} from '../../../services/fintable/autoriteCourtier';

const soldes = (p: Partial<SoldesDepart> = {}): SoldesDepart => ({
    CELI: 10_000, CELIAPP: 0, REER: 50_000, NON_ENREG: 200_000,
    CRYPTO: 1_000, REEE: 0, TOTAL: 261_000, historicalRate: 7.5,
    ...p,
});

const reco = (regimes: ReconciliationLue['regimes']): ReconciliationLue => ({ regimes });

describe('identité — le cas de qui n\'utilise pas Fintable', () => {
    it('rend l\'OBJET D\'ENTRÉE quand il n\'y a aucun régime réconcilié', () => {
        const entree = soldes();
        const r = appliquerAutoriteCourtier(entree, reco([]));
        // Identité de RÉFÉRENCE, pas seulement d'égalité : les consommateurs sont des `useMemo`
        // dont les dépendances comparent les références. Reconstruire un objet identique ferait
        // recalculer toute la projection à chaque rendu, sans qu'aucun chiffre ne bouge.
        expect(r.soldes).toBe(entree);
        expect(r.ecartTotal).toBe(0);
        expect(r.regimesAppliques).toEqual([]);
    });

    it('rend l\'objet d\'entrée quand la réconciliation est absente', () => {
        const entree = soldes();
        expect(appliquerAutoriteCourtier(entree, undefined).soldes).toBe(entree);
    });
});

describe('autorité appliquée', () => {
    it('remplace le panier par le total du courtier et RECALCULE le total', () => {
        const r = appliquerAutoriteCourtier(soldes(), reco([
            { regime: 'NON-ENREG', brokerTotalCad: 231_882, holdingsValueCad: 200_000, accountLabels: ['Disnat'] },
        ]));
        expect(r.soldes.NON_ENREG).toBe(231_882);
        expect(r.ecartTotal).toBe(31_882);
        // Le TOTAL est la somme des six paniers — jamais l'ancien total plus l'écart, qui
        // coïnciderait ici et divergerait dès qu'un autre panier serait non fini.
        expect(r.soldes.TOTAL).toBe(10_000 + 0 + 50_000 + 0 + 231_882 + 1_000);
        expect(r.regimesAppliques).toEqual(['NON-ENREG']);
    });

    it('applique PLUSIEURS paniers, et laisse intacts ceux que Fintable ne déclare pas', () => {
        const r = appliquerAutoriteCourtier(soldes(), reco([
            { regime: 'CELI', brokerTotalCad: 12_500, holdingsValueCad: 10_000, accountLabels: ['WS CELI'] },
            { regime: 'REER', brokerTotalCad: 48_000, holdingsValueCad: 50_000, accountLabels: ['WS REER'] },
        ]));
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
        ]));
        expect(r.soldes.NON_ENREG).toBe(180_000);
        expect(r.ecartTotal).toBe(-20_000);
    });

    it('⚠️ `historicalRate` n\'est PAS recalculé — c\'est un RENDEMENT, pas un solde', () => {
        // Le total du courtier contient aussi les liquidités du compte et les positions que Fintable
        // ne détaille pas : le mêler à une mesure de rendement remplacerait un chiffre imparfait par
        // un chiffre faux (`UN-CORRECTIF-PEUT-ETRE-PIRE-QUE-LE-DEFAUT-SUR-UNE-BRANCHE`).
        const r = appliquerAutoriteCourtier(soldes({ historicalRate: 7.5 }), reco([
            { regime: 'NON-ENREG', brokerTotalCad: 999_999, holdingsValueCad: 200_000, accountLabels: ['D'] },
        ]));
        expect(r.soldes.historicalRate).toBe(7.5);
    });
});

describe('robustesse — un total non fini ne devient JAMAIS un 0 crédible', () => {
    it('IGNORE le régime et ne le déclare pas appliqué', () => {
        for (const mauvais of [Number.NaN, Number.POSITIVE_INFINITY, undefined as unknown as number]) {
            const r = appliquerAutoriteCourtier(soldes(), reco([
                { regime: 'NON-ENREG', brokerTotalCad: mauvais, holdingsValueCad: 200_000, accountLabels: ['D'] },
            ]));
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
        ]));
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
        const haut = mentionAutoriteCourtier(31_882, ['NON-ENREG']);
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
