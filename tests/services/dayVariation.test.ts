/**
 * [PASSE-REEL-VARIATION-DU-JOUR] La variation du patrimoine d'une journée, ventilée par source.
 *
 * Demande de Marc : « je veux voir la variabilité d'argent pour la journée (tout compris mais
 * détaillé) ». Le panneau montrait le NET ENCAISSÉ — pas la variation du patrimoine.
 *
 * ⚠️ CE QUE CES TESTS PROTÈGENT. Une ventilation est fausse de deux façons, et les deux sont
 * silencieuses : compter un montant DEUX FOIS (le dépôt, qui sort des liquidités et entre dans un
 * régime), ou fermer le total avec un poste fourre-tout qui encaisse l'écart. La seconde est la
 * pire : elle rend la vérification CIRCULAIRE — le total colle toujours, donc ne prouve plus rien.
 * D'où le résiduel EXPOSÉ, et les tests ci-dessous qui l'exigent non nul quand il l'est vraiment.
 */
import { describe, it, expect } from 'vitest';
import { dayVariation } from '../../services/history/dayVariation';
import { buildDailyPastLedger } from '../../services/history/dailyPastLedger';
import type { DailyPastRow } from '../../services/history/dailyPastLedger';

const ZERO = { CELI: 0, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0 };

const row = (o: Partial<DailyPastRow>): DailyPastRow =>
    ({
        date: '2026-08-10', Liquidites: 0, CELI: 0, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0,
        Immobilier: 0, DettesNonImmo: 0, NetWorth: 0, Income: 0, Expenses: 0, Savings: 0,
        NetTransferLiquid: 0, deposits: { ...ZERO }, growth: { ...ZERO }, labels: [], isDated: false,
        priceAgeMaxDays: 0, hasEstimatedPrice: false,
        ...o,
    }) as DailyPastRow;

const montant = (r: ReturnType<typeof dayVariation>, cle: string): number =>
    r!.sources.find((s) => s.cle === cle)!.montant;

/**
 * ⚠️ Lignes issues du VRAI pipeline, pas fabriquées à la main. Un achat daté au 2026-08-12 produit
 * un `deposits` réel ; c'est la seule façon de tester la relation dépôts / liquidités telle qu'elle
 * existe, plutôt qu'une combinaison que le moteur ne produit jamais.
 */
const PRIX = ['2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13']
    .map((date) => ({ date, price: 10 }));

const ledger = (transactions: unknown[]) => buildDailyPastLedger({
    from: '2026-08-08', to: '2026-08-13', today: '2026-08-14', transactions,
    currentCash: 10_000, fx: {}, equityByYear: new Map<number, number>(), currentDebtNonImmo: 0, debts: [],
    assets: [{
        id: 'a1', symbol: 'ABC', currency: 'CAD', accountType: 'CELI',
        quantity: 100, currentPrice: 10, buyPrice: 10, priceHistory: PRIX,
        purchases: [
            { date: '2026-08-01', quantity: 50, price: 10 },
            { date: '2026-08-12', quantity: 50, price: 10 },
        ],
    }],
} as never);

const variationDu = (r: { rows: DailyPastRow[] }, date: string) => {
    const i = r.rows.findIndex((x) => x.date === date);
    if (i < 1) throw new Error(`jour ${date} sans veille dans la série (${r.rows.map((x) => x.date).join(',')})`);
    return dayVariation(r.rows[i], r.rows[i - 1]);
};

describe('[PASSE-REEL-VARIATION-DU-JOUR] la ventilation explique la variation', () => {
    it('une journée de pur RENDEMENT : la courbe monte sans aucune transaction', () => {
        // Le cas qui motive le ticket : le net encaissé vaut 0 pendant que le patrimoine grimpe.
        const v = dayVariation(
            row({ NetWorth: 1_500, growth: { ...ZERO, CELI: 1_500 } }),
            row({ NetWorth: 0 }),
        )!;
        expect(v.deltaNetWorth).toBe(1_500);
        expect(montant(v, 'rendement')).toBe(1_500);
        expect(montant(v, 'tresorerie')).toBe(0);
        expect(v.residuel).toBe(0);
    });

    /**
     * ⚠️ CE TEST A ÉTÉ RÉÉCRIT, et c'est une leçon en soi. Sa première version fabriquait à la main
     * une ligne `{ deposits: 5 000, NetTransferLiquid: 0, NetWorth inchangé }` — une combinaison que
     * le pipeline NE PRODUIT JAMAIS. Il verrouillait donc une donnée impossible, restait vert, et
     * laissait passer le vrai défaut : dans les lignes RÉELLES, le résiduel valait exactement les
     * dépôts du jour. Classe « garde auto-satisfaite ». La version ci-dessous part de
     * `buildDailyPastLedger` — c'est-à-dire de ce que le moteur produit vraiment.
     */
    it('un achat de titre DÉBITÉ : le patrimoine ne bouge pas, et rien n’est « inexpliqué »', () => {
        const r = ledger([
            { date: '2026-08-09', amount: -30, payee: 'Café' },
            // Achat de 500 $ correctement débité du compte (transaction ordinaire).
            { date: '2026-08-12', amount: -500, payee: 'Achat titres' },
        ]);
        const v = variationDu(r, '2026-08-12')!;
        // Les liquidités baissent de 500, le CELI monte de 500 : net = 0.
        expect(v.deltaNetWorth).toBeCloseTo(0, 2);
        expect(v.depotsInternes, 'le déplacement doit rester VISIBLE').toBeCloseTo(500, 2);
        // ⚠️ L'assertion qui échoue sur le code d'avant : le résiduel y valait +500 $, donc l'écran
        // affichait « Non expliqué +500 $ » sur une journée parfaitement explicable.
        expect(v.residuel, 'sans les dépôts en SOURCE, le résiduel vaut les dépôts du jour').toBeCloseTo(0, 2);
        expect(v.depotsNonFinances, 'cet achat EST financé — aucune alerte à lever').toBe(0);
    });

    /**
     * ⚠️ L'anti-absorption. Mettre les dépôts en source ferme aussi le résiduel du cas où l'argent
     * n'a JAMAIS quitté le compte — un achat marqué « virement interne » est exclu de la
     * reconstruction du cash, donc le titre entre sans débit et le patrimoine SAUTE réellement.
     * Sans ce drapeau, le correctif du résiduel MASQUERAIT le défaut qu'il révélait par accident.
     */
    it('un achat marqué VIREMENT INTERNE : le patrimoine saute, et c’est SIGNALÉ', () => {
        const r = ledger([
            { date: '2026-08-09', amount: -30, payee: 'Café' },
            { date: '2026-08-12', amount: -500, payee: 'Achat titres', isTransfer: true },
        ]);
        const v = variationDu(r, '2026-08-12')!;
        // Mesuré : le patrimoine monte VRAIMENT de 500 $ sur un simple déplacement.
        expect(v.deltaNetWorth).toBeCloseTo(500, 2);
        expect(v.depotsNonFinances, 'un dépôt que rien ne finance doit être dit').toBeCloseTo(500, 2);
    });

    it('une journée ORDINAIRE ne lève aucune alerte de dépôt non financé', () => {
        // Anti-sur-correctif : un drapeau permanent ne se lit plus comme un drapeau.
        const r = ledger([{ date: '2026-08-09', amount: -30, payee: 'Café' }]);
        const v = variationDu(r, '2026-08-13')!;
        expect(v.depotsNonFinances).toBe(0);
    });

    it('une DETTE qui baisse fait MONTER le patrimoine (contribution opposée au delta)', () => {
        const v = dayVariation(
            row({ NetWorth: 300, DettesNonImmo: 700 }),
            row({ NetWorth: 0, DettesNonImmo: 1_000 }),
        )!;
        expect(montant(v, 'dettes')).toBe(+300);
        expect(v.residuel).toBe(0);
    });

    it('un palier IMMOBILIER est signalé comme tel (annuel, pas journalier)', () => {
        const v = dayVariation(
            row({ NetWorth: 12_000, Immobilier: 12_000 }),
            row({ NetWorth: 0, Immobilier: 0 }),
        )!;
        expect(montant(v, 'immobilier')).toBe(12_000);
        expect(v.immobilierEstPalier, 'sinon Marc croit à un gain immobilier du jour').toBe(true);
    });

    it('plusieurs sources se COMBINENT sans résiduel', () => {
        const v = dayVariation(
            row({ NetWorth: 900, NetTransferLiquid: -100, growth: { ...ZERO, NonReg: 1_000 } }),
            row({ NetWorth: 0 }),
        )!;
        expect(v.deltaNetWorth).toBe(900);
        expect(v.residuel).toBe(0);
    });
});

describe('[PASSE-REEL-VARIATION-DU-JOUR] le résiduel est AFFICHÉ, jamais absorbé', () => {
    // ⚠️ LE test du lot. Si un jour une source manque à l'appel, le résiduel doit le RÉVÉLER.
    // Un poste « autre » qui encaisserait l'écart fermerait le total par construction : la garde
    // deviendrait circulaire et ne pourrait plus jamais détecter une source oubliée.
    it('une variation INEXPLIQUÉE ressort en résiduel, elle n’est pas noyée', () => {
        const v = dayVariation(row({ NetWorth: 4_200 }), row({ NetWorth: 0 }))!;
        expect(v.sources.every((s) => s.montant === 0), 'aucune source ne la justifie').toBe(true);
        expect(v.residuel).toBe(4_200);
    });

    it('le résiduel vaut EXACTEMENT delta − Σ(sources)', () => {
        const v = dayVariation(
            row({ NetWorth: 1_000, NetTransferLiquid: 400, growth: { ...ZERO, REER: 100 } }),
            row({ NetWorth: 0 }),
        )!;
        expect(v.residuel).toBe(1_000 - (400 + 100));
    });
});

describe('[PASSE-REEL-VARIATION-DU-JOUR] refus d’affirmer sans mesure', () => {
    // Une variation est une DIFFÉRENCE : sans la veille, il n'y a rien à dire. Rendre 0 serait un
    // chiffre crédible et faux — exactement ce que no-fake-data interdit.
    it.each([
        ['sans veille', row({ NetWorth: 10 }), null],
        ['sans jour', null, row({ NetWorth: 10 })],
    ])('%s → null, jamais un zéro crédible', (_nom, jour, veille) => {
        expect(dayVariation(jour as DailyPastRow | null, veille as DailyPastRow | null)).toBeNull();
    });

    it('un patrimoine NON FINI ne produit pas une ventilation bidon', () => {
        expect(dayVariation(row({ NetWorth: Number.NaN }), row({ NetWorth: 0 }))).toBeNull();
    });

    it('un champ de source non fini est ÉCARTÉ et se voit dans le résiduel', () => {
        // Il ne devient PAS 0 en silence : le total ne colle plus, et ça se voit.
        const v = dayVariation(
            row({ NetWorth: 1_000, growth: { ...ZERO, CELI: Number.NaN } }),
            row({ NetWorth: 0 }),
        )!;
        expect(v.residuel).toBe(1_000);
    });
});
