// tests/services/portefeuille/passerelle.test.ts
//
// [PTF-L1E-PASSERELLE] La passerelle livre ↔ placements saisis.
//
// Ce que ces tests tiennent, et pourquoi chacun :
//   1. IDENTITÉ : sans livre, livre vide ou livre refusé, `actifsHorsLivre` rend le MÊME tableau. Un
//      écran ne doit rien changer tant que le livre ne fait pas autorité.
//   2. PARITÉ AU CENT : un livre et des placements saisis qui décrivent les MÊMES avoirs donnent la même
//      valeur, aujourd'hui ET à une date passée. L'attendu est écrit à la main depuis les constantes du
//      scénario, et comparé à `computeInvestmentsValue` — la source unique des écrans — jamais à ce que
//      la passerelle publie d'elle-même.
//   3. REFUS NOMMÉ : un compte porteur sans régime, deux régimes pour un compte, un régime illisible,
//      un compte hors contrat ; et une décision prise sur un autre livre rend la valeur indisponible.
//   4. EXACTITUDE DU RÉGIME : CELIAPP n'est pas CELI, un actif sans type est NON-ENREG, le crypto ne
//      sort jamais.
//   5. TOTAL AMPUTÉ = FAUX : magasin absent ou cours manquant → `indisponible`, jamais une somme partielle.
// Toutes les données sont SYNTHÉTIQUES (ISIN au préfixe non attribué `ZZ`).
import { describe, it, expect } from 'vitest';
import type { Asset, BrokerAccountRegime, BrokerLedgerEvent } from '../../../types';
import { magasinVide, type MagasinMarche } from '../../../services/marche/magasinMarche';
import { computeInvestmentsValue } from '../../../services/portfolio';
import { actifsHorsLivre, deciderPasserelle, valeurDuLivre } from '../../../services/portefeuille/passerelle';

const source = { kind: 'releve-courtier', date: '2026-08-31' } as const;
const A = 'ZZ0000000011'; // coté en CAD
const B = 'ZZ0000000012'; // coté en USD
const AGE = 5;
const e = (x: Omit<BrokerLedgerEvent, 'source'> & Record<string, unknown>) => ({ source, ...x }) as BrokerLedgerEvent;

// Cours et taux à deux dates : la date PASSÉE et AUJOURD'HUI. Valeurs choisies pour que la ligne USD ne
// tombe pas sur un nombre de cents entier (un arrondi caché se verrait).
const PASSE = '2026-07-15';
const AUJ = '2026-09-24';
const COURS = { A: { [PASSE]: 41.17, [AUJ]: 43.29 }, B: { [PASSE]: 187.33, [AUJ]: 201.07 } } as const;
const USD = { [PASSE]: 1.3713, [AUJ]: 1.3947 } as const;
const magasin: MagasinMarche = {
    ...magasinVide('2026-09-24T21:00:00.000Z'),
    clotures: {
        [A]: { devise: 'CAD', points: [[PASSE, COURS.A[PASSE], 'eodhd'], [AUJ, COURS.A[AUJ], 'eodhd']] },
        [B]: { devise: 'USD', points: [[PASSE, COURS.B[PASSE], 'eodhd'], [AUJ, COURS.B[AUJ], 'eodhd']] },
    },
    taux: { USD: [[PASSE, USD[PASSE]], [AUJ, USD[AUJ]]] },
};

const livre: BrokerLedgerEvent[] = [
    e({ id: 'l1', date: '2026-07-01', accountId: 'courtier-cad', kind: 'transfert-entrant', isin: A, quantity: 37 }),
    e({ id: 'l2', date: '2026-07-01', accountId: 'courtier-usd', kind: 'transfert-entrant', isin: B, quantity: 11 }),
    e({ id: 'l3', date: '2026-07-02', accountId: 'courtier-cad', kind: 'depot-especes', amount: { value: 523.19, currency: 'CAD' } }),
    e({ id: 'l4', date: '2026-07-02', accountId: 'courtier-usd', kind: 'depot-especes', amount: { value: 88.41, currency: 'USD' } }),
];
const regimesCeli: BrokerAccountRegime[] = [
    { accountId: 'courtier-cad', regime: 'CELI' },
    { accountId: 'courtier-usd', regime: 'CELI' },
];

const actif = (x: Partial<Asset> & Pick<Asset, 'symbol' | 'quantity' | 'currentPrice' | 'currency'>): Asset =>
    ({ name: x.symbol, performance: 0, dateBought: '2026-07-01', ...x }) as Asset;

/** Les MÊMES avoirs que `livre`, saisis à la main aux cours de `date`. L'encaisse du courtier y est
 *  une ligne à prix 1 dans sa devise, comme un utilisateur la saisirait. */
const saisisAu = (date: typeof PASSE | typeof AUJ): Asset[] => [
    actif({ symbol: 'A', quantity: 37, currentPrice: COURS.A[date], currency: 'CAD', accountType: 'CELI' }),
    actif({ symbol: 'B', quantity: 11, currentPrice: COURS.B[date], currency: 'USD', accountType: 'CELI' }),
    actif({ symbol: 'ESP-CAD', quantity: 523.19, currentPrice: 1, currency: 'CAD', accountType: 'CELI' }),
    actif({ symbol: 'ESP-USD', quantity: 88.41, currentPrice: 1, currency: 'USD', accountType: 'CELI' }),
];

describe('[PTF-L1E] décision : le livre fait-il autorité ?', () => {
    it('livre jamais importé → sans-livre, et les placements saisis passent INTACTS (même référence)', () => {
        const d = deciderPasserelle(undefined, regimesCeli);
        expect(d).toEqual({ etat: 'sans-livre' });
        const assets = saisisAu(AUJ);
        expect(actifsHorsLivre(assets, d)).toBe(assets);
        expect(valeurDuLivre(undefined, d, magasin, AUJ, AGE)).toEqual({ etat: 'sans-objet' });
    });

    it('livre importé mais VIDE → active sans régime couvert, identité stricte', () => {
        const d = deciderPasserelle([], regimesCeli);
        expect(d.etat).toBe('active');
        const assets = saisisAu(AUJ);
        expect(actifsHorsLivre(assets, d)).toBe(assets);
        expect(valeurDuLivre([], d, magasin, AUJ, AGE)).toEqual({ etat: 'sans-objet' });
    });

    it('un compte porteur SANS régime → refus nommé du livre ENTIER, placements intacts', () => {
        const d = deciderPasserelle(livre, [{ accountId: 'courtier-cad', regime: 'CELI' }]);
        expect(d).toEqual({ etat: 'refusee', causes: [{ type: 'compte-sans-regime', compte: 'courtier-usd' }] });
        const assets = saisisAu(AUJ);
        expect(actifsHorsLivre(assets, d)).toBe(assets);
        expect(valeurDuLivre(livre, d, magasin, AUJ, AGE)).toEqual({ etat: 'sans-objet' });
    });

    it('régimes jamais déclarés (undefined) → même refus, un par compte porteur', () => {
        expect(deciderPasserelle(livre, undefined)).toEqual({ etat: 'refusee', causes: [
            { type: 'compte-sans-regime', compte: 'courtier-cad' },
            { type: 'compte-sans-regime', compte: 'courtier-usd' },
        ] });
    });

    it('deux régimes DIFFÉRENTS pour un compte → ambigu ; deux fois le même → accepté', () => {
        const ambigu = deciderPasserelle(livre, [...regimesCeli, { accountId: 'courtier-usd', regime: 'REER' }]);
        expect(ambigu).toEqual({ etat: 'refusee', causes: [{ type: 'regime-ambigu', compte: 'courtier-usd' }] });
        expect(deciderPasserelle(livre, [...regimesCeli, { accountId: 'courtier-usd', regime: 'CELI' }]).etat).toBe('active');
    });

    it('un régime illisible (blob restauré) → refusé, jamais rabattu sur un défaut', () => {
        const illisible = [{ accountId: 'courtier-cad', regime: 'CRYPTO' }, { accountId: 'courtier-usd', regime: 'CELI' }] as unknown as BrokerAccountRegime[];
        expect(deciderPasserelle(livre, illisible)).toEqual({ etat: 'refusee', causes: [{ type: 'regime-inconnu', compte: 'courtier-cad' }] });
    });

    it('un compte HORS contrat (blob restauré, schéma futur) refuse le livre entier, compte nommé tel quel', () => {
        // `etatDuLivre` valorise ce compte comme les autres : le laisser passer ferait sortir sa valeur de
        // toute ventilation par régime. Un régime déclaré pour lui ne le rend pas légitime.
        const avecInconnu = [...livre, e({ id: 'x1', date: '2026-07-03', accountId: 'courtier-cad-ancien' as never, kind: 'transfert-entrant', isin: A, quantity: 3 })];
        const regimes = [...regimesCeli, { accountId: 'courtier-cad-ancien', regime: 'CELI' } as never];
        expect(deciderPasserelle(avecInconnu, regimes)).toEqual({ etat: 'refusee', causes: [{ type: 'compte-inconnu', compte: 'courtier-cad-ancien' }] });
    });

    it('un régime déclaré pour un compte ABSENT du livre ne couvre rien', () => {
        const seulCad = [e({ id: 'x', date: '2026-07-01', accountId: 'courtier-cad', kind: 'transfert-entrant', isin: A, quantity: 1 })];
        const d = deciderPasserelle(seulCad, [{ accountId: 'courtier-cad', regime: 'CELI' }, { accountId: 'courtier-usd', regime: 'REER' }]);
        expect(d.etat === 'active' && [...d.regimesCouverts]).toEqual(['CELI']);
    });

    it('la cible d\'un virement interne est un compte PRÉSENT : il lui faut un régime', () => {
        const avecVirement = [
            e({ id: 'v0', date: '2026-07-01', accountId: 'courtier-cad', kind: 'depot-especes', amount: { value: 100, currency: 'CAD' } }),
            e({ id: 'v1', date: '2026-07-02', accountId: 'courtier-cad', kind: 'virement-interne', toAccountId: 'hors-courtier', amount: { value: 40, currency: 'CAD' } }),
        ];
        expect(deciderPasserelle(avecVirement, [{ accountId: 'courtier-cad', regime: 'CELI' }]))
            .toEqual({ etat: 'refusee', causes: [{ type: 'compte-sans-regime', compte: 'hors-courtier' }] });
    });
});

describe('[PTF-L1E] exclusion par régime EXACT', () => {
    const d = deciderPasserelle(livre, regimesCeli);
    const autres: Asset[] = [
        actif({ symbol: 'CELIAPP', quantity: 1, currentPrice: 100, currency: 'CAD', accountType: 'CELIAPP' }),
        actif({ symbol: 'REER', quantity: 1, currentPrice: 100, currency: 'CAD', accountType: 'REER' }),
        actif({ symbol: 'SANS-TYPE', quantity: 1, currentPrice: 100, currency: 'CAD' }),
        actif({ symbol: 'BTC', quantity: 1, currentPrice: 100, currency: 'CAD', accountType: 'CRYPTO' }),
    ];

    it('seuls les CELI sortent : CELIAPP, REER, sans type et crypto restent', () => {
        const restants = actifsHorsLivre([...saisisAu(AUJ), ...autres], d);
        expect(restants.map((a) => a.symbol)).toEqual(['CELIAPP', 'REER', 'SANS-TYPE', 'BTC']);
    });

    it('un livre NON-ENREG retire aussi les actifs SANS type (absent = NON-ENREG)', () => {
        const dNe = deciderPasserelle(livre, [{ accountId: 'courtier-cad', regime: 'NON-ENREG' }, { accountId: 'courtier-usd', regime: 'NON-ENREG' }]);
        expect(actifsHorsLivre(autres, dNe).map((a) => a.symbol)).toEqual(['CELIAPP', 'REER', 'BTC']);
    });
});

describe('[PTF-L1E] PARITÉ AU CENT avec les placements saisis', () => {
    const d = deciderPasserelle(livre, regimesCeli);
    const fx = (date: typeof PASSE | typeof AUJ) => ({ CAD: 1, USD: USD[date] });
    // Oracle écrit à la main depuis les constantes, jamais depuis le module testé.
    const oracle = (date: typeof PASSE | typeof AUJ) =>
        37 * COURS.A[date] + 11 * COURS.B[date] * USD[date] + 523.19 + 88.41 * USD[date];

    for (const date of [AUJ, PASSE] as const) {
        it(`${date === AUJ ? 'aujourd\'hui' : 'date passée'} : livre = saisie = oracle, au cent`, () => {
            const v = valeurDuLivre(livre, d, magasin, date, AGE);
            if (v.etat !== 'disponible') throw new Error(`attendu disponible, reçu ${v.etat}`);
            const saisie = computeInvestmentsValue(saisisAu(date), fx(date), 0);
            expect(v.totalCad).toBeCloseTo(oracle(date), 2);
            expect(saisie).toBeCloseTo(oracle(date), 2);
            expect(v.totalCad).toBeCloseTo(saisie, 2);
            expect(v.parRegime).toEqual({ CELI: v.totalCad });
        });
    }

    it('substitution complète : saisie hors livre + livre = saisie seule (rien compté deux fois, rien perdu)', () => {
        const autres = [actif({ symbol: 'R', quantity: 3, currentPrice: 77.7, currency: 'CAD', accountType: 'REER' })];
        const saisis = [...saisisAu(AUJ), ...autres];
        const v = valeurDuLivre(livre, d, magasin, AUJ, AGE);
        if (v.etat !== 'disponible') throw new Error(v.etat);
        const avecLivre = computeInvestmentsValue([...actifsHorsLivre(saisis, d)], fx(AUJ), 0) + v.totalCad;
        expect(avecLivre).toBeCloseTo(computeInvestmentsValue(saisis, fx(AUJ), 0), 2);
    });

    it('deux régimes : la ventilation se recompose en total et chaque part suit SON compte', () => {
        const dMixte = deciderPasserelle(livre, [{ accountId: 'courtier-cad', regime: 'CELI' }, { accountId: 'courtier-usd', regime: 'REER' }]);
        const v = valeurDuLivre(livre, dMixte, magasin, AUJ, AGE);
        if (v.etat !== 'disponible') throw new Error(v.etat);
        expect(v.parRegime.CELI).toBeCloseTo(37 * COURS.A[AUJ] + 523.19, 9);
        expect(v.parRegime.REER).toBeCloseTo((11 * COURS.B[AUJ] + 88.41) * USD[AUJ], 9);
        expect((v.parRegime.CELI ?? 0) + (v.parRegime.REER ?? 0)).toBeCloseTo(v.totalCad, 9);
    });
});

describe('[PTF-L1E] DÉCISION B (Marc, 2026-09-25) : la décision ne dépend pas de la date', () => {
    it('avant le premier événement du livre, le régime couvert vaut 0 $ (saisis exclus, livre vide à cette date)', () => {
        // Ce test était une LIMITE « à trancher avant e3 » ; Marc a choisi B : le livre remonte à
        // l'ouverture du compte (tous les relevés seront importés), donc 0 $ avant son premier
        // événement est la VÉRITÉ, pas un trou. L'option A écartée (placements saisis jusqu'au
        // premier relevé) rendrait ce test rouge. La contrepartie vit dans l'import (1g) : il doit
        // vérifier que le premier relevé d'un compte part de positions nulles.
        const d = deciderPasserelle(livre, regimesCeli);
        const avant = '2026-06-15';
        expect(actifsHorsLivre(saisisAu(PASSE), d)).toEqual([]);
        const v = valeurDuLivre(livre, d, magasin, avant, AGE);
        expect(v.etat === 'disponible' && v.totalCad).toBe(0);
    });
});

describe('[PTF-L1E] TOTAL AMPUTÉ = FAUX', () => {
    const d = deciderPasserelle(livre, regimesCeli);

    it('magasin jamais lu (null) → indisponible, cause nommée — pas un magasin vide', () => {
        expect(valeurDuLivre(livre, d, null, AUJ, AGE)).toEqual({ etat: 'indisponible', cause: 'magasin-absent' });
    });

    it('un cours manquant → indisponible avec la valorisation qui dit pourquoi, jamais la somme du reste', () => {
        const sansB: MagasinMarche = { ...magasin, clotures: { [A]: magasin.clotures[A] } };
        const v = valeurDuLivre(livre, d, sansB, AUJ, AGE);
        expect(v.etat === 'indisponible' && v.cause).toBe('valorisation-incomplete');
        expect(v.etat === 'indisponible' && v.cause === 'valorisation-incomplete' && v.valorisation.manquants)
            .toEqual([{ type: 'cours', compte: 'courtier-usd', isin: B, statut: 'absente' }]);
    });

    it('une décision prise sur un AUTRE livre → indisponible, jamais une ligne perdue ni une clé fantôme', () => {
        // Décision calculée sur le seul compte CAD, livre qui porte aussi le compte USD.
        const dCad = deciderPasserelle(livre.filter((x) => x.accountId === 'courtier-cad'), regimesCeli);
        expect(dCad.etat).toBe('active');
        expect(valeurDuLivre(livre, dCad, magasin, AUJ, AGE)).toEqual({ etat: 'indisponible', cause: 'decision-desynchronisee' });
    });

    it('les placements saisis du régime couvert restent EXCLUS même quand la valeur est indisponible', () => {
        // Les réintégrer ferait une seconde source pour le même chiffre : l'écran dira « indisponible ».
        expect(actifsHorsLivre(saisisAu(AUJ), d)).toEqual([]);
    });
});
