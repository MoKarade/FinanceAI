// tests/services/dailyPastLedger.test.ts
//
// [FUTUR-DAILY-PAST-REAL] Ce que ces tests protègent.
//
// Le passé affiché au jour n'est plus une interpolation : c'est une MESURE. Trois fautes y seraient
// invisibles à l'œil et coûteuses au dollar :
//   1. produire une journée à moitié reconstruite (cash connu, placements inconnus) → un patrimoine
//      amputé de tout le portefeuille, parfaitement crédible et faux ;
//   2. compter dans les dépenses du jour des transactions que l'ANCRE (`computeStartingCash`) exclut
//      — deux bouts de la même courbe sur des bases différentes, la classe PH4D ;
//   3. déborder sur le futur : `reconstructPortfolioHistoryDaily` reconduit le dernier prix connu,
//      donc elle produit volontiers des jours FUTURS plats, présentés comme reconstruits.

import { describe, it, expect } from 'vitest';
import {
    buildDailyPastLedger,
    depositsOnDay,
    PAST_ACCOUNT_KEYS,
    type MinimalPastTransaction,
} from '../../services/history/dailyPastLedger';
import type { MinimalAsset } from '../../services/history/reconstructPortfolioHistory';

const FX = { USD: 1.35 };

/** Un titre CELI acheté le 2026-03-02, avec des prix quotidiens sur la fenêtre testée. */
const asset = (over: Partial<MinimalAsset> = {}): MinimalAsset => ({
    symbol: 'AAA',
    quantity: 10,
    currency: 'CAD',
    currentPrice: 100,
    accountType: 'CELI',
    purchases: [{ date: '2026-03-02', quantity: 10, price: 90 }],
    priceHistory: [
        { date: '2026-03-01', price: 88 },
        { date: '2026-03-02', price: 90 },
        { date: '2026-03-03', price: 95 },
        { date: '2026-03-04', price: 97 },
        { date: '2026-03-05', price: 97 },
    ],
    ...over,
});

const txns: MinimalPastTransaction[] = [
    { date: '2026-03-01', amount: 2000, payee: 'Paie' },
    { date: '2026-03-03', amount: -150, payee: 'Épicerie' },
    { date: '2026-03-04', amount: -50, payee: 'Essence' },
];

const base = {
    from: '2026-03-01',
    to: '2026-03-05',
    today: '2026-03-05',
    transactions: txns,
    currentCash: 5000,
    assets: [asset()],
    fx: FX,
    equityByYear: new Map([[2026, 120_000]]),
    currentDebtNonImmo: 8_000,
    debts: [{ balance: 8_000 }],
};

describe('dailyPastLedger — reconstruction du passé au jour', () => {
    it('produit une ligne par jour de la fenêtre où les DEUX sources ont de la matière', () => {
        const { rows } = buildDailyPastLedger(base);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => r.date >= '2026-03-01' && r.date <= '2026-03-05')).toBe(true);
        // Trié, sans trou ni doublon.
        expect(rows.map((r) => r.date)).toEqual([...rows.map((r) => r.date)].sort());
        expect(new Set(rows.map((r) => r.date)).size).toBe(rows.length);
    });

    it('ne déborde JAMAIS sur le futur, même si la fenêtre le demande', () => {
        // ⚠️ `reconstructPortfolioHistoryDaily` produirait des points au-delà d'aujourd'hui en
        // reconduisant le dernier prix : des placements PLATS présentés comme mesurés.
        const { rows } = buildDailyPastLedger({ ...base, to: '2026-06-30' });
        expect(rows.every((r) => r.date <= base.today)).toBe(true);
    });

    it('le patrimoine net du jour = Σ comptes + cash + équité immo − dette (source unique)', () => {
        const { rows } = buildDailyPastLedger(base);
        for (const r of rows) {
            const somme = PAST_ACCOUNT_KEYS.reduce((s, k) => s + r[k], 0);
            expect(r.NetWorth).toBe(Math.round(somme + r.Liquidites + r.Immobilier - r.DettesNonImmo));
        }
    });

    it('l’équité immobilière suit l’ANNÉE (elle n’est pas connue au jour) et la dette est figée', () => {
        const { rows } = buildDailyPastLedger(base);
        expect(new Set(rows.map((r) => r.Immobilier))).toEqual(new Set([120_000]));
        expect(new Set(rows.map((r) => r.DettesNonImmo))).toEqual(new Set([8_000]));
    });

    it('[PASSE-REEL-DETTE-1] le gating est en palier MENSUEL, pas au jour près : un départ en cours de mois active tout le mois', () => {
        const { rows } = buildDailyPastLedger({
            ...base,
            // startDate au 04 mars ne coupe PAS le mois en deux jours : la fenêtre entière (01-05 mars)
            // est dans le MÊME mois calendaire que startDate → active partout, y compris le 01-03.
            // (Une vraie coupure jour-par-jour exigerait une fenêtre à cheval sur deux mois — hors
            // périmètre ici, ce module ne connaît la dette qu'au mois, jamais au jour.)
            debts: [{ balance: 8_000, startDate: '2026-03-04' }],
        });
        const byDate = new Map(rows.map((r) => [r.date, r]));
        expect(byDate.get('2026-03-01')?.DettesNonImmo).toBe(8_000);
        expect(byDate.get('2026-03-04')?.DettesNonImmo).toBe(8_000);
    });

    it('[CRITIQUE, revue #687] une dette dont le mois de départ est APRÈS AUJOURD\'HUI (today) n\'est JAMAIS retranchée — elle n\'a jamais existé dans currentDebtNonImmo', () => {
        // Régression trouvée indépendamment par financial-integrity ET code-reviewer : cette dette
        // n'a pas encore commencé le 2026-03-05 (`today` de `base`) NON PLUS — le VRAI moteur
        // publierait donc `DettesNonImmo = 0` aujourd'hui (currentDebtNonImmo honnête ci-dessous),
        // PAS 8 000 $. Le 1er jet du lot retranchait quand même 8 000 $ d'un total qui ne l'a jamais
        // contenu, fabriquant −8 000 $ de dette (patrimoine gonflé de 8 000 $).
        const { rows } = buildDailyPastLedger({
            ...base,
            currentDebtNonImmo: 0, // ce que publie le moteur AUJOURD'HUI pour une dette pas-encore-commencée
            debts: [{ balance: 8_000, startDate: '2026-04-01' }], // avril, après AUJOURD'HUI (05 mars) et toute la fenêtre
        });
        expect(rows.every((r) => r.DettesNonImmo === 0)).toBe(true);
    });

    // ⚠️ [ÉLEVÉ, revue #687] Le clamp (`Math.max(0, …)`) protégeant contre un solde brut gaté >
    // `currentDebtNonImmo` est le MÊME code, sur la MÊME fonction `sumNotYetStartedDebtsAt
    // AbsoluteMonth`, que celui déjà prouvé par le test dédié de `tests/services/buildPastPrefix.
    // test.ts` — la fenêtre d'un seul mois calendaire de cette fixture (mars) ne permet pas de
    // distinguer « gatée » de « déjà active » à l'intérieur de la fenêtre reconstruite (palier
    // mensuel, cf test ci-dessus), donc reproduire ce cas ICI exigerait une fixture à cheval sur
    // deux mois — pas fait, pour ne pas fragiliser ce fichier avec un montage artificiel alors que
    // le comportement est déjà verrouillé ailleurs sur le code partagé.

    it('les revenus et dépenses du jour sont les VRAIES transactions de ce jour-là', () => {
        const { rows } = buildDailyPastLedger(base);
        const byDate = new Map(rows.map((r) => [r.date, r]));
        expect(byDate.get('2026-03-03')?.Expenses).toBe(150);
        expect(byDate.get('2026-03-03')?.Income).toBe(0);
        expect(byDate.get('2026-03-03')?.labels).toContain('Épicerie');
        // ⚠️ `Expenses` est un COÛT POSITIF (convention du moteur) — un signe inversé ferait monter
        // la courbe des dépenses le jour d'un achat, ce qu'un graphe rend invisible.
        expect(byDate.get('2026-03-04')?.Expenses).toBe(50);
        expect(byDate.get('2026-03-04')?.Savings).toBe(-50);
    });

    it('exclut doublons et virements — MÊME base que l’ancre `computeStartingCash`', () => {
        const { rows } = buildDailyPastLedger({
            ...base,
            transactions: [
                ...txns,
                { date: '2026-03-03', amount: -999, payee: 'Doublon', isDuplicate: true },
                { date: '2026-03-03', amount: -777, payee: 'Virement', isTransfer: true },
            ],
        });
        const d3 = rows.find((r) => r.date === '2026-03-03')!;
        expect(d3.Expenses).toBe(150);
        expect(d3.labels).not.toContain('Doublon');
        expect(d3.labels).not.toContain('Virement');
    });

    it('AUJOURD’HUI n’est pas reconstruit : le présent vient de la projection', () => {
        // ⚠️ `reconstructCashHistoryDaily` s'arrête à la VEILLE, par construction — c'est la même
        // convention que la version mensuelle (le mois courant vient du moteur). Une ligne « réelle »
        // pour aujourd'hui entrerait en concurrence avec l'ancre du présent : deux vérités pour la
        // même date. Le jour même reste donc ventilé depuis le moteur.
        const { rows } = buildDailyPastLedger(base);
        expect(rows.some((r) => r.date === base.today)).toBe(false);
        expect(rows.at(-1)?.date).toBe('2026-03-04');
    });

    it('un jour sans mouvement est signalé comme tel (plateau ≠ donnée manquante)', () => {
        const { rows } = buildDailyPastLedger({ ...base, transactions: [txns[0], txns[1]] });
        const quiet = rows.find((r) => r.date === '2026-03-04')!;
        expect(quiet.isDated).toBe(false);
        expect(quiet.labels).toEqual([]);
    });

    it('sépare DÉPÔT et RENDEMENT : l’achat du jour n’est pas compté comme un gain', () => {
        const { rows } = buildDailyPastLedger(base);
        const d2 = rows.find((r) => r.date === '2026-03-02')!;
        // 10 titres à 90 $ achetés ce jour-là.
        expect(d2.deposits.CELI).toBeCloseTo(900, 6);
        // Le solde passe de 0 (aucune détention la veille) à 900 : tout vient de l'achat, rien du
        // marché. Sans cette soustraction, l'infobulle annoncerait « Rendement +900 $ ».
        expect(d2.growth.CELI).toBeCloseTo(0, 6);
        // Le lendemain, aucun achat : toute la variation est du marché (10 × (95 − 90)).
        const d3 = rows.find((r) => r.date === '2026-03-03')!;
        expect(d3.deposits.CELI).toBe(0);
        expect(d3.growth.CELI).toBeCloseTo(50, 6);
    });

    it('`depositsOnDay` convertit en CAD et range l’achat dans le BON régime', () => {
        const usdReer = asset({
            symbol: 'BBB', currency: 'USD', accountType: 'REER',
            purchases: [{ date: '2026-03-02', quantity: 2, price: 100 }],
        });
        const dep = depositsOnDay([usdReer], FX, '2026-03-02');
        expect(dep.REER).toBeCloseTo(2 * 100 * 1.35, 6);
        expect(dep.CELI).toBe(0);
    });

    it('un compte inconnu (MARGE / AUTRE) tombe en Non-enregistré, comme la reconstruction', () => {
        const dep = depositsOnDay(
            [asset({ accountType: 'MARGE', purchases: [{ date: '2026-03-02', quantity: 1, price: 50 }] })],
            FX, '2026-03-02',
        );
        expect(dep.NonReg).toBe(50);
    });

    it('rend [] plutôt qu’une ligne inventée quand il n’y a pas de matière', () => {
        expect(buildDailyPastLedger({ ...base, transactions: [] }).rows).toEqual([]);
        expect(buildDailyPastLedger({ ...base, assets: [] }).rows).toEqual([]);
        // Fenêtre entièrement dans le futur.
        expect(buildDailyPastLedger({ ...base, from: '2027-01-01', to: '2027-01-10' }).rows).toEqual([]);
    });

    it('[ANCHOR-CAVEAT] les flux inplaçables sont RENDUS à l’appelant, pas avalés', () => {
        // ⚠️ L'ancre (`computeStartingCash`) compte ces flux ; la série quotidienne ne peut pas les
        // placer. Les taire transformerait un niveau passé DÉCALÉ (mesuré −2 000 $ à l'audit) en
        // niveau « propre » que rien ne conteste — c'est l'affichage de cet avertissement qui a
        // failli disparaître avec le panneau supprimé par [FUTUR-DAILY-INFOBULLE-ONLY].
        const res = buildDailyPastLedger({
            ...base,
            transactions: [...txns,
                { date: '2026-03', amount: -2000, payee: 'Au mois seul' },
                { date: '2026-03-09', amount: 500, payee: 'Après aujourd’hui' },
            ],
        });
        expect(res.undatedTotal).toBe(-2000);
        expect(res.flowsAfterNowDate).toBe(500);
    });

    it('[ANCHOR-CAVEAT] même sans AUCUNE ligne produite, les caveats d’ancre sortent', () => {
        // Un historique fait uniquement de transactions au mois seul : zéro point quotidien, mais
        // l'ancre est bel et bien décalée — l'écran doit pouvoir le dire quand même.
        const res = buildDailyPastLedger({
            ...base,
            transactions: [{ date: '2026-03', amount: -750, payee: 'Sans jour' }],
        });
        expect(res.rows).toEqual([]);
        expect(res.undatedTotal).toBe(-750);
    });

    it('une transaction datée au MOIS seul ne fabrique aucun jour', () => {
        // La reconstruction du cash exige une date COMPLÈTE : placer un montant à un jour arbitraire
        // serait pire que de l'exclure. On vérifie qu'aucune ligne ne lui est attribuée.
        const { rows } = buildDailyPastLedger({
            ...base,
            transactions: [...txns, { date: '2026-03', amount: -2000, payee: 'Sans jour' }],
        });
        expect(rows.some((r) => r.labels.includes('Sans jour'))).toBe(false);
    });
});
