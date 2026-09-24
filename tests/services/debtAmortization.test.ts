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
    amortirDettePassee, supplementAmortiAuMoisAbsolu, prepareSupplementAmortiParJour,
    KIND_AMORTISSANT, KIND_VERSEMENTS_FIXES, RECALAGE_MIN, RECALAGE_MAX,
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
/** [DEBT-CADENCE-REELLE] Le JOUR d'aujourd'hui, désormais 3ᵉ argument REQUIS. Il doit tomber dans
 *  `AUJOURDHUI` : une fixture dont le jour contredit le mois ferait mesurer autre chose. */
const AUJ_ISO = '2026-09-15';

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

    it('les RÉVOLVANTS ne s\'amortissent pas — et le BAIL a changé de famille, pas disparu', () => {
        // ⚠️ TEST DE LIMITE INVERSÉ (2026-09-17, `UN-TEST-DE-LIMITE-S-INVERSE-IL-NE-SE-SUPPRIME-PAS`).
        // Il s'intitulait « un BAIL et les révolvants ne s'amortissent pas — c'est le cas réel de
        // Marc » et exigeait `kind-non-amortissant` pour `auto-lease`. Marc : « la dette ça marche
        // pas, ça devrait diminuer avec ce que je paie chaque semaine ; pour tout mon passé elle
        // est à la même valeur, elle diminue que dans mon futur ». Le constat était exact et
        // l'asymétrie mesurable : le FUTUR amortit sans lire `kind`. Le bail n'a pas cessé d'être
        // un bail — il est passé à la forme LINÉAIRE (`KIND_VERSEMENTS_FIXES`), qui décrit ce que
        // son solde est vraiment devenu : une somme de versements restants, à taux nul.
        // Ce qui reste vrai des révolvants n'a pas bougé d'un iota, et c'est tout l'objet de garder
        // l'assertion ICI plutôt que de la supprimer.
        for (const k of ['heloc', 'margin', 'credit-card', 'other'] as const) {
            expect(KIND_AMORTISSANT[k], k).toBe(false);
            expect(KIND_VERSEMENTS_FIXES[k], k).toBe(false);
            refus(amortirDettePassee(pret({ kind: k }), AUJOURDHUI, AUJ_ISO, []), 'kind-non-amortissant');
        }
        // Le bail : hors de la famille « amorti par intérêt », DANS la famille « versements fixes ».
        expect(KIND_AMORTISSANT['auto-lease']).toBe(false);
        expect(KIND_VERSEMENTS_FIXES['auto-lease']).toBe(true);
        // Contre-témoin : sans lui, une table entièrement à `false` passerait ce test.
        for (const k of ['mortgage', 'auto', 'student-federal', 'student-quebec', 'personal', 'spouse-loan'] as const) {
            expect(KIND_AMORTISSANT[k], k).toBe(true);
        }
    });
});

describe('[DEBT-AMORTIZATION] le service REFUSE plutôt que d\'inventer, et nomme sa cause', () => {
    it('sans date de début, on ne sait pas d\'où partir', () => {
        refus(amortirDettePassee(pret({ startDate: undefined }), AUJOURDHUI, AUJ_ISO, []), 'donnees-manquantes');
    });

    it('sans solde d\'origine, il n\'y a rien à amortir', () => {
        refus(amortirDettePassee(pret({ originalBalance: undefined }), AUJOURDHUI, AUJ_ISO, []), 'donnees-manquantes');
    });

    it('une entrée NON FINIE ne produit jamais un nombre plausible', () => {
        // `NaN × k = NaN` : sans cette garde, un champ corrompu ressortirait en courbe.
        // ⚠️ La cause attendue était `donnees-manquantes` jusqu'au 2026-09-02 : elle fusionnait
        // « champ jamais saisi » (le cas NOMINAL, silence voulu) et « champ présent mais corrompu »
        // (à TRACER). Les deux sont désormais distinctes, et seule la seconde est journalisée.
        for (const champ of ['originalBalance', 'balance', 'interestRate', 'minimumPayment'] as const) {
            for (const valeur of [Number.NaN, Number.POSITIVE_INFINITY]) {
                refus(amortirDettePassee(pret({ [champ]: valeur }), AUJOURDHUI, AUJ_ISO, []), 'donnees-invalides');
            }
        }
    });

    it('un champ ABSENT reste « donnees-manquantes » — l\'absence n\'est pas une corruption', () => {
        for (const champ of ['originalBalance', 'interestRate', 'minimumPayment'] as const) {
            refus(amortirDettePassee(pret({ [champ]: undefined }), AUJOURDHUI, AUJ_ISO, []), 'donnees-manquantes');
        }
    });

    it('une dette qui a GROSSI depuis l\'origine n\'est pas un amortissement', () => {
        refus(amortirDettePassee(pret({ originalBalance: 10000, balance: 18000 }), AUJOURDHUI, AUJ_ISO, []), 'origine-incoherente');
    });

    it('un paiement qui ne couvre même pas l\'intérêt ne rembourse rien → hors bande', () => {
        // Solde qui enfle : le modèle n'atterrit pas près du solde réel, et aucun facteur de la
        // bande ne l'y ramène. Refus, pas une courbe croissante appelée « remboursement ».
        refus(amortirDettePassee(pret({ interestRate: 24, minimumPayment: 10 }), AUJOURDHUI, AUJ_ISO, []), 'recalage-hors-bande');
    });

    it('un mois courant ANTÉRIEUR au début est un refus, pas un tableau vide', () => {
        // Avant le début, la dette n'existe pas — c'est `[PASSE-REEL-DETTE-1]` qui le dit, et ce
        // service ne doit surtout pas répondre « 0 $ » (qui se lirait comme « dette remboursée »).
        refus(amortirDettePassee(pret(), mois(2023, 0), '2023-01-15', []), 'donnees-manquantes');
    });
});

describe('[DEBT-AMORTIZATION] la courbe rendue', () => {
    it('ATTERRIT EXACTEMENT sur le solde réel — c\'est l\'ancre de tout le lot', () => {
        const r = amortirDettePassee(pret(), AUJOURDHUI, AUJ_ISO, []);
        expect(r.forme).toBe('ok');
        if (r.forme !== 'ok') return;
        expect(r.soldes[r.soldes.length - 1]).toBeCloseTo(18000, 6);
    });

    it('part EXACTEMENT du montant emprunté, un mois par pas, du début à aujourd\'hui inclus', () => {
        // ⚠️ Ce test disait « part du solde d'origine RECALÉ » jusqu'au 2026-09-02 : la série
        // entière était rééchelonnée, donc le premier point valait `30 000 × facteur` — jusqu'à
        // 59 369 $ affichés sur un prêt de 30 000 $ (mesuré). Le montant emprunté est un FAIT lu sur
        // un contrat : la courbe en part maintenant au dollar près. Le test s'inverse au même
        // endroit plutôt que de disparaître, pour que la limite d'hier reste lisible.
        const r = amortirDettePassee(pret(), AUJOURDHUI, AUJ_ISO, []);
        if (r.forme !== 'ok') throw new Error('cas de référence devenu inapplicable');
        expect(r.premierMoisAbsolu).toBe(mois(2024, 0));
        // Janvier 2024 → septembre 2026 inclus = 33 mois.
        expect(r.soldes.length).toBe(AUJOURDHUI - mois(2024, 0) + 1);
        expect(r.soldes[0]).toBe(30000);
        // ... et jamais AU-DESSUS de l'emprunt, nulle part : c'est l'affirmation impossible d'avant.
        for (const s of r.soldes) expect(s).toBeLessThanOrEqual(30000);
    });

    it('DÉCROÎT à chaque mois — un remboursement ne remonte pas', () => {
        const r = amortirDettePassee(pret(), AUJOURDHUI, AUJ_ISO, []);
        if (r.forme !== 'ok') throw new Error('cas de référence devenu inapplicable');
        for (let i = 1; i < r.soldes.length; i++) {
            expect(r.soldes[i], `mois ${i}`).toBeLessThan(r.soldes[i - 1]);
        }
    });

    it('le facteur reste DANS la bande, et vaut 1 quand le paiement saisi tombe déjà juste', () => {
        // ⚠️ La bande portait la SÉRIE ; depuis le 2026-09-02 elle porte le PAIEMENT résolu, rapporté
        // au paiement saisi. Même bande, même intention (« au-delà, le modèle ne décrit plus TON
        // prêt »), mais appliquée au seul terme réellement incertain.
        const r = amortirDettePassee(pret(), AUJOURDHUI, AUJ_ISO, []);
        if (r.forme !== 'ok') throw new Error('cas de référence devenu inapplicable');
        expect(r.facteurRecalage).toBeGreaterThanOrEqual(RECALAGE_MIN);
        expect(r.facteurRecalage).toBeLessThanOrEqual(RECALAGE_MAX);
        expect(r.facteurRecalage).toBeCloseTo(r.paiementResolu / 560, 9);

        // Anti-vacuité : on rejoue le MÊME prêt en prenant pour solde actuel ce que le paiement
        // SAISI produit lui-même. Le facteur doit alors valoir exactement 1 — sinon on déforme un
        // prêt qui n'en avait pas besoin.
        let modele = 30000;
        for (let k = 0; k < AUJOURDHUI - mois(2024, 0); k++) modele = modele * (1 + 0.05 / 12) - 560;
        const sansRecalage = amortirDettePassee(pret({ balance: modele }), AUJOURDHUI, AUJ_ISO, []);
        if (sansRecalage.forme !== 'ok') throw new Error('témoin inapplicable');
        expect(sansRecalage.facteurRecalage).toBeCloseTo(1, 9);
    });

    it('la courbe est ancrée aux DEUX bouts — plus homothétique, et c\'est le correctif', () => {
        // ⚠️ Ce test affirmait l'inverse (« le recalage est PROPORTIONNEL ») : deux soldes actuels
        // différents donnaient deux courbes homothétiques, donc DEUX premiers points différents pour
        // un même montant emprunté. C'était précisément le défaut. Le test s'inverse ici plutôt que
        // d'être supprimé — sans lui, rien ne dirait que l'homothétie a été un choix, puis un bug.
        const a = amortirDettePassee(pret({ balance: 18000 }), AUJOURDHUI, AUJ_ISO, []);
        const b = amortirDettePassee(pret({ balance: 16000 }), AUJOURDHUI, AUJ_ISO, []);
        if (a.forme !== 'ok' || b.forme !== 'ok') throw new Error('cas de référence inapplicable');
        // Même origine, à l'octet près : c'est le montant emprunté, il ne dépend pas du solde actuel.
        expect(a.soldes[0]).toBe(30000);
        expect(b.soldes[0]).toBe(30000);
        // Et chaque courbe atterrit EXACTEMENT sur SON solde.
        expect(a.soldes[a.soldes.length - 1]).toBe(18000);
        expect(b.soldes[b.soldes.length - 1]).toBe(16000);
        // Le rapport n'est donc PAS constant — l'homothétie est morte, et on l'asserte.
        const rapportDebut = b.soldes[0] / a.soldes[0];
        const rapportFin = b.soldes[b.soldes.length - 1] / a.soldes[a.soldes.length - 1];
        expect(rapportFin).not.toBeCloseTo(rapportDebut, 3);
    });

    it('un TERME ÉCHU gèle le solde résiduel au lieu de continuer à payer', () => {
        // Le moteur cesse les paiements après le terme et LAISSE le résiduel au bilan. Sans cette
        // borne, le modèle du passé amortissait jusqu'à aujourd'hui : il sous-estimait le solde
        // d'aujourd'hui, gonflait le paiement résolu, et le passé décrivait un autre prêt que le futur.
        const r = amortirDettePassee(pret({ balance: 24000, termEndDate: '2025-01-15' }), AUJOURDHUI, AUJ_ISO, []);
        if (r.forme !== 'ok') throw new Error('cas à terme échu devenu inapplicable');
        const finTerme = mois(2025, 0) - r.premierMoisAbsolu;
        expect(r.soldes[finTerme]).toBe(24000);
        // Tous les mois APRÈS le terme sont plats sur le résiduel — aucun paiement fantôme.
        for (let k = finTerme; k < r.soldes.length; k++) expect(r.soldes[k]).toBe(24000);
        // Anti-vacuité : il reste bien des mois APRÈS le terme dans la série mesurée.
        expect(r.soldes.length - 1 - finTerme).toBeGreaterThan(12);
    });

    it('un prêt qui ne se rembourserait JAMAIS est refusé, pas décrit', () => {
        // Paiement inférieur à l'intérêt du principal ⇒ la dette enfle. Le moteur, lui, force un
        // plancher d'amortissement : décrire ici une courbe croissante ferait diverger les deux bouts.
        const r = amortirDettePassee(pret({ originalBalance: 20000, balance: 20000, interestRate: 12, minimumPayment: 100 }), AUJOURDHUI, AUJ_ISO, []);
        expect(r.forme).toBe('inapplicable');
        if (r.forme === 'inapplicable') expect(r.cause).toBe('jamais-decroissant');
    });

    it('[NODE24-POW-ULP] paiement = intérêt au bit près : refusé pour la BONNE cause, quel que soit l\'âge du prêt', () => {
        // Solde inchangé depuis l'origine → paiement résolu = intérêt EXACTEMENT, en réel. En flottant,
        // le dernier bit dépend de `Math.pow(1+i, N)`, donc de N ET de la version de V8 (mesuré : Node 24
        // ne rend pas le même bit que Node 20/22 pour plusieurs N). Le cas unique ci-dessus ne teste
        // qu'UN N ; ici on balaie 26 ans d'anciennetés, où les deux côtés de 200 $ apparaissent sur
        // n'importe quel moteur. Sans tolérance, une partie tombe sur « recalage-hors-bande ».
        const causes = new Set<string>();
        for (let annee = 2000; annee <= 2026; annee++) {
            for (let m = 1; m <= 12; m++) {
                if (annee === 2026 && m >= 9) break;
                const startDate = `${annee}-${String(m).padStart(2, '0')}-15`;
                const r = amortirDettePassee(pret({ originalBalance: 20000, balance: 20000, interestRate: 12, minimumPayment: 100, startDate }), AUJOURDHUI, AUJ_ISO, []);
                causes.add(r.forme === 'inapplicable' ? r.cause : `ok (${startDate})`);
            }
        }
        expect([...causes]).toEqual(['jamais-decroissant']);
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// [DEBT-BAIL-PASSE-PLAT] Le bail à VERSEMENTS FIXES — demande de Marc du 2026-09-17.
//
// Le défaut, mesuré dans le code des deux côtés : la boucle du FUTUR (`services/projection.ts`,
// bloc « DETTES ») amortit toute dette active SANS lire `kind` ; le PASSÉ refusait `auto-lease`.
// Le cas type est un bail à taux **0 %**, donc on voyait une dette parfaitement plate derrière
// soi et décroissante devant.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Bail auto type (valeurs SYNTHÉTIQUES) : solde = somme des versements RESTANTS, taux 0, versement mensuel. */
const bail = (o: Partial<EntreeAmortissement> = {}): EntreeAmortissement => ({
    balance: 30000,
    interestRate: 0,
    minimumPayment: 700,
    startDate: '2026-07-16',
    kind: 'auto-lease',
    ...o,
});

describe('[DEBT-BAIL-PASSE-PLAT] un bail à versements fixes décroît AUSSI dans le passé', () => {
    it('les deux familles sont DISJOINTES — une dette ne peut pas avoir deux réponses', () => {
        // Sans ça, `amortirDettePassee` aurait deux formes possibles pour le même `kind` et
        // l'aiguillage deviendrait un ordre de lignes, pas une décision.
        for (const k of DEBT_KINDS) {
            expect(typeof KIND_VERSEMENTS_FIXES[k], `type non tranché : ${k}`).toBe('boolean');
            expect(KIND_AMORTISSANT[k] && KIND_VERSEMENTS_FIXES[k], `${k} dans les DEUX familles`).toBe(false);
        }
        // Anti-vacuité : la disjonction serait trivialement vraie d'une table entièrement à `false`.
        expect(DEBT_KINDS.filter(k => KIND_VERSEMENTS_FIXES[k]).length).toBeGreaterThan(0);
    });

    it('la série remonte d\'EXACTEMENT un versement par mois et atterrit sur le solde réel', () => {
        // ⚠️ DISCRIMINANT : sur le code d'avant, ce cas rendait `kind-non-amortissant`.
        const r = amortirDettePassee(bail(), AUJOURDHUI, AUJ_ISO, []);
        if (r.forme !== 'ok') throw new Error(`bail refusé : ${r.cause}`);
        // Début en juillet 2026, « aujourd'hui » en septembre 2026 ⇒ 3 points (juillet, août, sept.).
        expect(r.premierMoisAbsolu).toBe(mois(2026, 6));
        expect(r.soldes).toHaveLength(3);
        // L'ANCRE : le dernier point vaut le solde saisi, au centime.
        expect(r.soldes[r.soldes.length - 1]).toBe(30000);
        // La PENTE : un versement par mois, ni plus ni moins. C'est la relation, pas une valeur de
        // fixture — elle survit à tout changement de solde ou de date.
        for (let k = 1; k < r.soldes.length; k++) {
            expect(r.soldes[k - 1] - r.soldes[k]).toBeCloseTo(700, 6);
        }
        // Rien n'est RECALÉ : le versement saisi est exactement celui qui sert.
        expect(r.facteurRecalage).toBe(1);
        expect(r.paiementResolu).toBe(700);
    });

    it('le PASSÉ et le FUTUR décrivent le même bail — même pas, en sens inverse', () => {
        // Le moteur fait `balance + intérêt − paiement` avec intérêt = 0, donc −paiement par mois.
        // Le passé doit remonter du MÊME pas : sinon la courbe fait une marche au raccord.
        const r = amortirDettePassee(bail(), AUJOURDHUI, AUJ_ISO, []);
        if (r.forme !== 'ok') throw new Error('bail refusé');
        const pasPasse = r.soldes[r.soldes.length - 2] - r.soldes[r.soldes.length - 1];
        const pasFutur = Math.max(700, 0 + 30000 / 300); // `effectiveMinimum` du moteur, taux nul
        expect(pasPasse).toBeCloseTo(pasFutur, 6);
    });

    it('un taux NON NUL est REFUSÉ — on ne sait plus ce que le solde contient', () => {
        // Contrôle NÉGATIF, et c'est la garde qui compte le plus : écrire le taux du contrat sur un
        // solde tout-compris comptait l'intérêt DEUX fois (mesuré le 2026-09-14). Une
        // courbe plausible et fausse est pire que pas de courbe.
        refus(amortirDettePassee(bail({ interestRate: 5.25 }), AUJOURDHUI, AUJ_ISO, []), 'taux-sur-solde-tout-compris');
    });

    it('sans date de début ou sans versement, on REFUSE au lieu de deviner', () => {
        refus(amortirDettePassee(bail({ startDate: undefined }), AUJOURDHUI, AUJ_ISO, []), 'donnees-manquantes');
        refus(amortirDettePassee(bail({ minimumPayment: undefined }), AUJOURDHUI, AUJ_ISO, []), 'donnees-manquantes');
        refus(amortirDettePassee(bail({ interestRate: undefined }), AUJOURDHUI, AUJ_ISO, []), 'donnees-manquantes');
        // Un versement PRÉSENT mais hors domaine est une corruption, pas une absence.
        refus(amortirDettePassee(bail({ minimumPayment: 0 }), AUJOURDHUI, AUJ_ISO, []), 'donnees-invalides');
    });

    it('après la fin du terme, le résiduel reste PLAT — aucun versement fantôme', () => {
        // Même règle que la forme par intérêt et que le moteur : on cesse de payer, on n'efface pas.
        const r = amortirDettePassee(bail({ startDate: '2022-01-15', termEndDate: '2025-01-15' }), AUJOURDHUI, AUJ_ISO, []);
        if (r.forme !== 'ok') throw new Error(`bail à terme échu refusé : ${r.cause}`);
        const finTerme = mois(2025, 0) - r.premierMoisAbsolu;
        for (let k = finTerme; k < r.soldes.length; k++) expect(r.soldes[k]).toBe(30000);
        // Anti-vacuité : il reste bien des mois après le terme, et la partie AVANT décroît vraiment.
        expect(r.soldes.length - 1 - finTerme).toBeGreaterThan(12);
        expect(r.soldes[0]).toBeGreaterThan(30000);
    });

    it('le SUPPLÉMENT rendu aux registres du passé vaut un versement au mois précédent', () => {
        // La garde qui TRAVERSE : ce que les deux registres du passé consomment réellement, pas la
        // série interne. Un supplément nul ici voudrait dire « la correction n'atteint pas l'écran ».
        const supp = supplementAmortiAuMoisAbsolu([{ ...bail(), id: 'bail', name: 'bZ' } as never], AUJOURDHUI - 1, AUJOURDHUI, AUJ_ISO, []);
        expect(supp).toBeCloseTo(700, 6);
        // Et au mois d'aujourd'hui, EXACTEMENT zéro — l'invariant de raccord.
        expect(supplementAmortiAuMoisAbsolu([{ ...bail(), id: 'bail', name: 'bZ' } as never], AUJOURDHUI, AUJOURDHUI, AUJ_ISO, [])).toBe(0);
    });
});


/* ─────────────────────────────────────────────────────────────────────────────────────────────────
   [DEBT-CADENCE-REELLE] LA CADENCE RÉELLE DES PRÉLÈVEMENTS

   Marc, 2026-09-17 : « la dette descend, mais elle devrait descendre à chaque paiement du bail,
   pas une fois par mois ». Son bail est prélevé toutes les SEMAINES ; le passé reconstruit ne
   produisait qu'un point par mois, donc une marche mensuelle.

   Ce que ces gardes défendent :
     1. la marche tombe aux VRAIES dates de prélèvement, et vaut le versement réel ;
     2. la courbe au MOIS et la courbe au JOUR ne peuvent pas diverger (la première est DÉRIVÉE de
        la grille de la seconde) — c'est le point qui compte le plus, parce qu'une asymétrie entre
        deux modules dont aucun n'est faux tout seul ne rougit nulle part ;
     3. sans cadence déclarée, RIEN ne change (non-régression stricte).
   ──────────────────────────────────────────────────────────────────────────────────────────────── */

describe('[DEBT-CADENCE-REELLE] la dette descend à chaque prélèvement', () => {
    /** Un bail type : 700 $/mois, soit ≈ 161,54 $/semaine. Le jour d'aujourd'hui est
     *  cohérent avec `AUJOURDHUI` (septembre 2026) et tombe 61 jours après le début — donc 8
     *  prélèvements écoulés, un compte qu'on peut refaire à la main. */
    const bailHebdo = (o: Partial<EntreeAmortissement> = {}): EntreeAmortissement =>
        bail({ paymentFrequency: 'weekly', ...o });
    const VERSEMENT = 700 * 12 / 52;   // ≈ 161,54 $ — le prélèvement hebdomadaire, au cent près
    const JOUR = '2026-09-15';

    const parJour = (d: EntreeAmortissement, jour: string): number =>
        prepareSupplementAmortiParJour([{ ...d, id: 'bail', name: 'bZ' } as never], AUJOURDHUI, JOUR, [])(jour);

    it('le versement DÉRIVÉ vaut le prélèvement hebdomadaire du cas type, au cent près', () => {
        // Anti-vacuité de tout ce qui suit : si la dérivation était fausse, chaque marche le serait,
        // et les tests de pente passeraient quand même (ils comparent des marches entre elles).
        expect(VERSEMENT).toBeCloseTo(161.54, 2);
    });

    it('la marche tombe aux dates de PRÉLÈVEMENT, pas au changement de mois', () => {
        const d = bailHebdo();
        // Début 2026-07-16 ⇒ prélèvements les 16/07, 23/07, 30/07… Entre deux prélèvements, le
        // supplément est CONSTANT ; il augmente d'exactement un versement quand on recule d'un cran.
        const veille = parJour(d, '2026-09-09');
        const jourDePrelevement = parJour(d, '2026-09-10'); // jeudi, 8 × 7 j après le 16/07
        expect(veille - jourDePrelevement).toBeCloseTo(VERSEMENT, 6);
        // ... et à l'intérieur d'une semaine, rien ne bouge (ce n'est pas une interpolation).
        expect(parJour(d, '2026-09-05')).toBeCloseTo(veille, 6);
        expect(parJour(d, '2026-09-06')).toBeCloseTo(veille, 6);
    });

    it('AUJOURD\'HUI le supplément est EXACTEMENT nul — l\'ancre tient avec la grille', () => {
        expect(parJour(bailHebdo(), JOUR)).toBe(0);
    });

    it('au début du bail, on devait 8 versements de plus — le compte se refait à la main', () => {
        // Du 2026-07-16 au 2026-09-15 : 61 jours, soit 8 prélèvements (le 16/07 lui-même exclu,
        // même convention que la forme mensuelle).
        expect(parJour(bailHebdo(), '2026-07-16')).toBeCloseTo(VERSEMENT * 8, 6);
    });

    it('⚠️ LA GARDE DU LOT : la courbe au MOIS et la courbe au JOUR disent la MÊME chose', () => {
        // Le point du mois `m` vaut le solde au 1er de ce mois (ou au début du bail pour le mois de
        // départ). Si les deux registres calculaient chacun de leur côté, ils divergeraient de
        // jusqu'à un mois de versements SANS que rien ne rougisse.
        const d = bailHebdo();
        const r = amortirDettePassee(d, AUJOURDHUI, JOUR, []);
        if (r.forme !== 'ok') throw new Error(`bail hebdo refusé : ${r.cause}`);
        expect(r.grilleVersements?.pasJours).toBe(7);
        const echantillon: Record<number, string> = {
            [mois(2026, 6)]: '2026-07-16',   // mois de DÉBUT : la dette n'existe pas avant le 16
            [mois(2026, 7)]: '2026-08-01',
            [mois(2026, 8)]: '2026-09-01',
        };
        for (const [moisAbs, jour] of Object.entries(echantillon)) {
            const index = Number(moisAbs) - r.premierMoisAbsolu;
            expect(r.soldes[index] - d.balance, `mois ${moisAbs}`).toBeCloseTo(parJour(d, jour), 6);
        }
        // Anti-vacuité : les trois points sont DISTINCTS (sinon l'égalité serait triviale).
        expect(new Set(r.soldes.map(v => Math.round(v * 100))).size).toBe(3);
    });

    it('SANS cadence déclarée, RIEN ne change — non-régression stricte, et c\'est le contrôle négatif', () => {
        const mensuel = bail();                       // aucune `paymentFrequency`
        const r = amortirDettePassee(mensuel, AUJOURDHUI, JOUR, []);
        if (r.forme !== 'ok') throw new Error('bail mensuel refusé');
        expect(r.grilleVersements).toBeUndefined();
        // Le supplément au JOUR retombe sur le palier MENSUEL : deux jours du même mois, même valeur.
        expect(parJour(mensuel, '2026-08-01')).toBeCloseTo(parJour(mensuel, '2026-08-28'), 6);
        // Et il vaut un versement MENSUEL par mois écoulé, comme avant ce lot.
        expect(parJour(mensuel, '2026-08-15')).toBeCloseTo(700, 6);
        // ⚠️ Le contraste EST la mesure : à cadence hebdo, les deux mêmes jours DIFFÈRENT.
        expect(parJour(bailHebdo(), '2026-08-01')).not.toBeCloseTo(parJour(bailHebdo(), '2026-08-28'), 2);
    });

    it('la cadence est IGNORÉE par la forme à intérêt — le champ ne promet rien qu\'il ne tienne', () => {
        // `DebtKindFields` ne montre le menu que si `KIND_VERSEMENTS_FIXES[kind]`. Si le moteur
        // consommait quand même le champ ailleurs, un réglage invisible changerait un calcul.
        const sans = amortirDettePassee(pret(), AUJOURDHUI, JOUR, []);
        const avec = amortirDettePassee(pret({ paymentFrequency: 'weekly' }), AUJOURDHUI, JOUR, []);
        expect(avec).toEqual(sans);
    });

    it('cadence AUX DEUX SEMAINES : 14 jours de pas, et le versement suit', () => {
        const d = bailHebdo({ paymentFrequency: 'biweekly' });
        const r = amortirDettePassee(d, AUJOURDHUI, JOUR, []);
        if (r.forme !== 'ok') throw new Error('bail bimensuel refusé');
        expect(r.grilleVersements?.pasJours).toBe(14);
        expect(r.grilleVersements?.versement).toBeCloseTo(700 * 12 / 26, 6);
    });
});
