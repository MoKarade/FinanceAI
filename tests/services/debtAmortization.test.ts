// tests/services/debtAmortization.test.ts
//
// [DEBT-AMORTIZATION] lot 1 — le service PUR qui reconstruit la décroissance d'une dette dans le
// passé. Marc : « chaque semaine je dois un peu moins ». Rien n'est encore BRANCHÉ : la courbe
// affichée ne bouge pas de ce lot (découpage demandé par Marc).
//
// Ce que ces gardes défendent, dans l'ordre d'importance :
//   1. le service REFUSE plutôt que d'inventer — chaque refus nomme sa cause ;
//   2. la courbe rendue atterrit EXACTEMENT sur le solde réel d'aujourd'hui (c'est l'ancre) ;
//   3. elle décroît, et le recalage reste dans une bande plausible.
import { describe, it, expect } from 'vitest';
import {
    amortirDettePassee, KIND_AMORTISSANT, RECALAGE_MIN, RECALAGE_MAX,
    type EntreeAmortissement, type ResultatAmortissement, type CauseNonAmortissable,
} from '../../services/projection/debtAmortization';
import { DEBT_KINDS } from '../../types';

/** Un refus, et SA cause — le service n'a pas le droit de rendre un `null` muet. */
const refus = (r: ResultatAmortissement, cause: CauseNonAmortissable): void => {
    expect(r).toEqual({ forme: 'inapplicable', cause });
};

/** Mois absolu (année × 12 + mois) — même convention que `debtSchedule.moisAbsolu`. */
const mois = (annee: number, moisIndex: number): number => annee * 12 + moisIndex;
const AUJOURDHUI = mois(2026, 8); // septembre 2026

/** Prêt auto ordinaire : 30 k$ empruntés début 2024, 5 %/an, 560 $/mois. */
const pret = (o: Partial<EntreeAmortissement> = {}): EntreeAmortissement => ({
    originalBalance: 30000,
    balance: 18000,
    interestRate: 5,
    minimumPayment: 560,
    startDate: '2024-01-15',
    kind: 'auto',
    ...o,
});

describe('[DEBT-AMORTIZATION] la table des types amortissants force une décision', () => {
    it('chaque `DebtKind` est tranché — aucun ne tombe dans un défaut silencieux', () => {
        // C'est l'intérêt d'un `Record` exhaustif plutôt qu'un `Set` : ce test échoue le jour où
        // quelqu'un ajoute un type de dette sans dire s'il s'amortit.
        for (const k of DEBT_KINDS) {
            expect(typeof KIND_AMORTISSANT[k], `type non tranché : ${k}`).toBe('boolean');
        }
    });

    it('un BAIL et les révolvants ne s\'amortissent pas — c\'est le cas réel de Marc', () => {
        // `auto-lease` : un bail est un loyer sur un terme, pas un solde qui fond. `heloc`,
        // `margin`, `credit-card` : le solde monte et descend au gré de l'usage.
        for (const k of ['auto-lease', 'heloc', 'margin', 'credit-card', 'other'] as const) {
            expect(KIND_AMORTISSANT[k], k).toBe(false);
            refus(amortirDettePassee(pret({ kind: k }), AUJOURDHUI), 'kind-non-amortissant');
        }
        // Contre-témoin : sans lui, une table entièrement à `false` passerait ce test.
        for (const k of ['mortgage', 'auto', 'student-federal', 'student-quebec', 'personal', 'spouse-loan'] as const) {
            expect(KIND_AMORTISSANT[k], k).toBe(true);
        }
    });
});

describe('[DEBT-AMORTIZATION] le service REFUSE plutôt que d\'inventer, et nomme sa cause', () => {
    it('sans date de début, on ne sait pas d\'où partir', () => {
        refus(amortirDettePassee(pret({ startDate: undefined }), AUJOURDHUI), 'donnees-manquantes');
    });

    it('sans solde d\'origine, il n\'y a rien à amortir', () => {
        refus(amortirDettePassee(pret({ originalBalance: undefined }), AUJOURDHUI), 'donnees-manquantes');
    });

    it('une entrée NON FINIE ne produit jamais un nombre plausible', () => {
        // `NaN × k = NaN` : sans cette garde, un champ corrompu ressortirait en courbe.
        for (const champ of ['originalBalance', 'balance', 'interestRate', 'minimumPayment'] as const) {
            for (const valeur of [Number.NaN, Number.POSITIVE_INFINITY]) {
                refus(amortirDettePassee(pret({ [champ]: valeur }), AUJOURDHUI), 'donnees-manquantes');
            }
        }
    });

    it('une dette qui a GROSSI depuis l\'origine n\'est pas un amortissement', () => {
        refus(amortirDettePassee(pret({ originalBalance: 10000, balance: 18000 }), AUJOURDHUI), 'origine-incoherente');
    });

    it('un paiement qui ne couvre même pas l\'intérêt ne rembourse rien → hors bande', () => {
        // Solde qui enfle : le modèle n'atterrit pas près du solde réel, et aucun facteur de la
        // bande ne l'y ramène. Refus, pas une courbe croissante appelée « remboursement ».
        refus(amortirDettePassee(pret({ interestRate: 24, minimumPayment: 10 }), AUJOURDHUI), 'recalage-hors-bande');
    });

    it('un mois courant ANTÉRIEUR au début est un refus, pas un tableau vide', () => {
        // Avant le début, la dette n'existe pas — c'est `[PASSE-REEL-DETTE-1]` qui le dit, et ce
        // service ne doit surtout pas répondre « 0 $ » (qui se lirait comme « dette remboursée »).
        refus(amortirDettePassee(pret(), mois(2023, 0)), 'donnees-manquantes');
    });
});

describe('[DEBT-AMORTIZATION] la courbe rendue', () => {
    it('ATTERRIT EXACTEMENT sur le solde réel — c\'est l\'ancre de tout le lot', () => {
        const r = amortirDettePassee(pret(), AUJOURDHUI);
        expect(r.forme).toBe('ok');
        if (r.forme !== 'ok') return;
        expect(r.soldes[r.soldes.length - 1]).toBeCloseTo(18000, 6);
    });

    it('part du solde d\'origine RECALÉ, un mois par pas, du début à aujourd\'hui inclus', () => {
        const r = amortirDettePassee(pret(), AUJOURDHUI);
        if (r.forme !== 'ok') throw new Error('cas de référence devenu inapplicable');
        expect(r.premierMoisAbsolu).toBe(mois(2024, 0));
        // Janvier 2024 → septembre 2026 inclus = 33 mois.
        expect(r.soldes.length).toBe(AUJOURDHUI - mois(2024, 0) + 1);
        expect(r.soldes[0]).toBeCloseTo(30000 * r.facteurRecalage, 6);
    });

    it('DÉCROÎT à chaque mois — un remboursement ne remonte pas', () => {
        const r = amortirDettePassee(pret(), AUJOURDHUI);
        if (r.forme !== 'ok') throw new Error('cas de référence devenu inapplicable');
        for (let i = 1; i < r.soldes.length; i++) {
            expect(r.soldes[i], `mois ${i}`).toBeLessThan(r.soldes[i - 1]);
        }
    });

    it('le facteur de recalage reste DANS la bande, et vaut 1 quand le modèle tombe déjà juste', () => {
        const r = amortirDettePassee(pret(), AUJOURDHUI);
        if (r.forme !== 'ok') throw new Error('cas de référence devenu inapplicable');
        expect(r.facteurRecalage).toBeGreaterThanOrEqual(RECALAGE_MIN);
        expect(r.facteurRecalage).toBeLessThanOrEqual(RECALAGE_MAX);

        // Anti-vacuité du recalage : on rejoue le MÊME prêt en prenant pour solde actuel ce que le
        // modèle produit lui-même. Le facteur doit alors valoir exactement 1 — sinon le recalage
        // déforme une courbe qui n'en avait pas besoin.
        const sansRecalage = amortirDettePassee(pret({ balance: r.soldes[r.soldes.length - 1] / r.facteurRecalage }), AUJOURDHUI);
        if (sansRecalage.forme !== 'ok') throw new Error('témoin inapplicable');
        expect(sansRecalage.facteurRecalage).toBeCloseTo(1, 9);
    });

    it('le recalage est PROPORTIONNEL : il ne déplace pas la forme, seulement l\'échelle', () => {
        // Deux soldes actuels différents sur le même prêt ⇒ deux courbes homothétiques.
        const a = amortirDettePassee(pret({ balance: 18000 }), AUJOURDHUI);
        const b = amortirDettePassee(pret({ balance: 16000 }), AUJOURDHUI);
        if (a.forme !== 'ok' || b.forme !== 'ok') throw new Error('cas de référence inapplicable');
        const rapport = b.soldes[0] / a.soldes[0];
        for (let i = 0; i < a.soldes.length; i++) {
            expect(b.soldes[i] / a.soldes[i], `mois ${i}`).toBeCloseTo(rapport, 9);
        }
    });
});
