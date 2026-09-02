// services/projection/debtAmortization.ts
//
// [DEBT-AMORTIZATION] — lot 1 sur 2 (découpage demandé par Marc le 2026-09-02).
//
// Marc : « chaque semaine je dois un peu moins ». Le passé affiche aujourd'hui la dette à son
// niveau ACTUEL, figé, depuis toujours — c'est `[PASSE-REEL-DETTE-1]` qui l'a rendue absente avant
// sa date de début, mais elle reste plate ensuite. Ce module calcule la vraie décroissance.
//
// ⚠️ **BRANCHÉ depuis le lot 2** (`[DEBT-AMORTIZATION-CABLAGE]`, 2026-09-02) : le supplément rendu
// par `supplementAmortiAuMois*` corrige la dette du passé dans `buildPastPrefix` (courbe mensuelle)
// ET `dailyPastLedger` (registre au jour). Découper en deux lots était le choix de Marc :
// « je te montre le résultat du lot 1 avant d'engager le lot 2 ».
//
// ⚠️ Ce module INVERSE sciemment la Décision 2 de `docs/adr/0012-quatre-decisions-de-marc-2026-08-17.md`
// (« aucun amortissement rétroactif »), après confirmation explicite de Marc en connaissance de
// cause. L'ADR porte la section « RENVERSEMENT du 2026-09-02 » qui l'acte, avec ce qui reste vrai de
// la décision d'origine (aucune saisie exigée, aucune courbe inventée).
//
// Mesure avant/après reproductible : `npx tsx scripts/mesureAmortissementPasse.ts`.
//
// ⚠️ CE QUE LE MODÈLE SAIT, ET CE QU'IL REFUSE DE DEVINER.
//   ✅ Il part EXACTEMENT du montant emprunté et arrive EXACTEMENT sur le solde actuel — les deux
//      sont des faits (un contrat, un relevé). Le seul terme ajusté est le PAIEMENT, que le modèle
//      ne connaît pas vraiment (versements anticipés, congés, renouvellement de taux).
//   ✅ Il s'arrête à la fin du TERME et laisse le résiduel au bilan, comme le moteur du futur.
//   ❌ Il refuse un prêt qui n'aurait jamais décru, un paiement résolu hors de la bande, une origine
//      incohérente, un type non amortissant — et il NOMME chaque refus.
//   ⚠️ Une donnée CORROMPUE (présente mais non finie ou hors domaine) est journalisée ; une donnée
//      simplement ABSENTE ne l'est pas — c'est le cas nominal.
//
// Fonction PURE, sans dépendance au moteur — comme `debtSchedule.ts`, dont elle réutilise
// `moisAbsolu` plutôt que de re-dériver un index de mois.

import type { DebtKind } from '../../types';
import { moisAbsolu, moisDeSimulation, type DebtBalance } from './debtSchedule';
import { logError } from '../errorLogger';

/**
 * Quels types de dette s'amortissent par la formule « solde × (1 + i) − paiement » ?
 *
 * ⚠️ Table EXHAUSTIVE (`Record<DebtKind, …>`) et non un `Set` de littéraux : ajouter un `kind` à
 * `DEBT_KINDS` casse le typecheck ICI tant que personne n'a tranché son cas. Un `Set` l'aurait
 * silencieusement rangé parmi les non-amortissants — un défaut par omission, la forme d'erreur que
 * ce dépôt paie le plus cher.
 *
 * `auto-lease` est délibérément FAUX : un bail n'amortit pas un solde, c'est un loyer sur un terme
 * fixe (c'est le cas réel de Marc, et `debtSchedule.ts` le documente déjà). `heloc`, `margin`,
 * `credit-card` sont révolvants : leur solde monte et descend au gré de l'usage, aucune courbe
 * d'amortissement ne le décrit. `other` est inconnu par construction.
 */
export const KIND_AMORTISSANT: Readonly<Record<DebtKind, boolean>> = {
    mortgage: true,
    auto: true,
    'student-federal': true,
    'student-quebec': true,
    personal: true,
    'spouse-loan': true,
    'auto-lease': false,
    heloc: false,
    margin: false,
    'credit-card': false,
    other: false,
};

/** Pourquoi une dette ne peut pas recevoir de courbe d'amortissement. Jamais un `null` muet. */
export type CauseNonAmortissable =
    /** Type de dette qui n'amortit pas un solde (bail, révolvant, inconnu). */
    | 'kind-non-amortissant'
    /** Il manque une entrée indispensable — champ jamais saisi. Silence LÉGITIME : c'est le cas de
     *  toute dette dont personne n'a renseigné le montant emprunté (rétrocompat voulue). */
    | 'donnees-manquantes'
    /** Le champ EXISTE mais ne vaut rien d'exploitable (non fini, négatif, paiement nul). C'est une
     *  CORRUPTION, pas une absence : elle est JOURNALISÉE. Séparer les deux est la raison d'être de
     *  cette cause — `REPLI-SILENCIEUX-LEGITIME-VS-CORRUPTION`. */
    | 'donnees-invalides'
    /** `originalBalance < balance` : la dette a GROSSI — ce n'est pas un profil d'amortissement. */
    | 'origine-incoherente'
    /** Le paiement qu'il faudrait pour relier le montant emprunté au solde actuel est trop éloigné
     *  du paiement SAISI : le modèle ne décrit plus le prêt de l'utilisateur. */
    | 'recalage-hors-bande'
    /** Le prêt ne se rembourse jamais (paiement ≤ intérêt sur le principal) : aucune courbe
     *  DÉCROISSANTE ne relie les deux bouts. Le moteur, lui, force un plancher d'amortissement —
     *  le passé refuse plutôt que de décrire un autre prêt que le futur. */
    | 'jamais-decroissant';

export interface EntreeAmortissement {
    /** Solde d'ORIGINE du prêt (montant emprunté). Absent ⇒ rien à amortir. */
    originalBalance?: number;
    /** Solde ACTUEL — l'ANCRE : la courbe rendue s'y termine EXACTEMENT. */
    balance: number;
    /** Taux annuel en POURCENT (comme le store le porte : `5` = 5 %/an). */
    interestRate?: number;
    /** Paiement MENSUEL. */
    minimumPayment?: number;
    /** Début du prêt (YYYY-MM-DD). Absent ⇒ on ne sait pas d'où partir. */
    startDate?: string;
    /** Fin du TERME (YYYY-MM-DD). Passée, le paiement cesse et le solde résiduel reste au bilan —
     *  même règle que le moteur (`[DETTE-DATES]`), sinon passé et futur décrivent deux prêts. */
    termEndDate?: string;
    kind?: DebtKind;
}

// ⚠️ `interestRate`/`minimumPayment` sont OPTIONNELS alors que le calcul en a absolument besoin —
// et c'est délibéré. Les registres du passé (`buildPastPrefix`, `dailyPastLedger`) manipulent des
// `DebtBalance` qui ne portent que les dates et le solde ; exiger ces champs dans le TYPE forcerait
// chaque appelant à fabriquer des valeurs pour les dettes qui ne s'amortissent pas. La contrainte
// vit donc à la FRONTIÈRE, où elle est vérifiée ET NOMMÉE (`donnees-manquantes`), plutôt que dans
// une signature que l'appelant contournerait avec des zéros — un `0 %` inventé produirait une
// courbe plate crédible, exactement ce que le no-fake-data interdit.

export type ResultatAmortissement =
    | {
        forme: 'ok';
        /** Solde à chaque mois, de `premierMoisAbsolu` à `moisAbsoluCourant` INCLUS. */
        soldes: number[];
        /** Mois absolu (année × 12 + mois) du premier élément de `soldes`. */
        premierMoisAbsolu: number;
        /** Rapport entre le paiement RÉSOLU et le paiement SAISI. 1 = la saisie tombait déjà juste.
         *  ⚠️ Le nom est conservé (c'est bien le terme recalé), mais il porte le PAIEMENT depuis le
         *  2026-09-02, plus l'échelle de la série — cf. `RECALAGE_MIN`. */
        facteurRecalage: number;
        /** Paiement mensuel qui relie exactement le montant emprunté au solde actuel. */
        paiementResolu: number;
    }
    | { forme: 'inapplicable'; cause: CauseNonAmortissable };

/**
 * Bande tolérée sur le PAIEMENT résolu, rapporté au paiement SAISI.
 *
 * ⚠️ **Cette bande portait la SÉRIE jusqu'au 2026-09-02, et c'était un défaut.** Le premier jet
 * rééchelonnait toute la courbe (`soldes.map(s => s * balance / modeleAujourdhui)`) pour la faire
 * atterrir sur le solde réel. Un rééchelonnement proportionnel contredit les DEUX saisies à la fois :
 * la courbe obtenue est celle d'un prêt de `k × originalBalance` remboursé `k × minimumPayment`. Avec
 * un facteur admis jusqu'à 2, le passé pouvait afficher **59 369 $ dus sur un prêt de 30 000 $**
 * (mesuré ; 799 331 $ sur une hypothèque de 400 000 $) — arithmétiquement impossible, et contredisant
 * un montant que l'utilisateur lit sur son contrat. Toute l'erreur du modèle atterrissait sur le point
 * le plus ANCIEN, là où rien ne la signale.
 *
 * Le modèle résout donc maintenant le PAIEMENT `P*` qui relie exactement les deux bouts (forme close,
 * cf. `paiementQuiRelie`) : la courbe part EXACTEMENT du montant emprunté et arrive EXACTEMENT sur le
 * solde actuel. Ce qui reste incertain — le paiement réel, que le modèle ignore (versements anticipés,
 * congés, renouvellement de taux) — est le seul terme ajusté, et c'est LUI qu'on borne.
 *
 * ⚠️ Hors bande, on refuse : un prêt qu'il faudrait rembourser au triple du paiement saisi ne décrit
 * plus le prêt de l'utilisateur. Mieux vaut le niveau figé d'aujourd'hui, honnête, qu'une décroissance
 * inventée présentée comme un fait (no-fake-data).
 */
export const RECALAGE_MIN = 0.5;
export const RECALAGE_MAX = 2;

const fini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Throttle de la trace : une signature (id de dette) par run. Même patron, même raison que
 *  `loggedNonFiniteDebtSignatures` dans `debtSchedule.ts` — cette fonction est appelée une fois par
 *  dette et par recalcul, journaliser à chaque fois thrasherait le `localStorage` de `logError`. */
const dettesDejaTracees = new Set<string>();

function tracerDetteSuspecte(dette: Readonly<EntreeAmortissement & { id?: string; name?: string }>, quoi: string): void {
    const signature = dette.id ?? dette.name ?? 'sans-identifiant';
    if (dettesDejaTracees.has(signature)) return;
    dettesDejaTracees.add(signature);
    logError({
        source: 'projection',
        severity: 'warning',
        message: `amortirDettePassee : ${quoi} — dette laissée au niveau figé (passé reconstruit)`,
        context: { id: dette.id, name: dette.name },
    });
}

/**
 * Reconstruit le solde MENSUEL d'une dette depuis son début jusqu'à aujourd'hui.
 *
 * Récurrence standard : `solde(m+1) = solde(m) × (1 + i) − paiement`, `i = taux annuel / 12`.
 * Palier MENSUEL, même si l'appelant affiche au jour : le prêt ne bouge qu'aux dates de paiement,
 * et interpoler au jour fabriquerait une précision que la donnée n'a pas.
 *
 * @param moisAbsoluCourant mois absolu d'« aujourd'hui » — passé par l'appelant, jamais lu de
 *   l'horloge ici : une fonction de moteur qui lit l'heure n'est plus déterministe (`D2.3`).
 */
export function amortirDettePassee(
    dette: Readonly<EntreeAmortissement>,
    moisAbsoluCourant: number,
): ResultatAmortissement {
    const kind = dette.kind;
    if (!kind || !KIND_AMORTISSANT[kind]) return { forme: 'inapplicable', cause: 'kind-non-amortissant' };

    const debut = moisAbsolu(dette.startDate);
    if (debut === null || !fini(moisAbsoluCourant) || moisAbsoluCourant < debut) {
        return { forme: 'inapplicable', cause: 'donnees-manquantes' };
    }
    const { originalBalance, balance, interestRate, minimumPayment } = dette;
    // ⚠️ ABSENT et CORROMPU ne sont PAS la même chose. Un champ jamais saisi est le cas NOMINAL
    // (aujourd'hui, 100 % des dettes du dépôt) : le taire est voulu. Un champ PRÉSENT mais non fini
    // ou négatif est une corruption — la taire fabriquerait une courbe plate crédible issue d'une
    // donnée fausse. Le module voisin (`sumNotYetStartedDebtsAtAbsoluteMonth`, appelé sur la MÊME
    // ligne d'addition chez les deux appelants) journalise déjà exactement ça : ne pas le faire ici
    // serait `PATRON-APPLIQUE-A-COTE-MAIS-PAS-ICI`.
    if (originalBalance === undefined || interestRate === undefined || minimumPayment === undefined) {
        return { forme: 'inapplicable', cause: 'donnees-manquantes' };
    }
    if (!fini(originalBalance) || !fini(balance) || !fini(interestRate) || !fini(minimumPayment)
        || originalBalance <= 0 || balance < 0 || minimumPayment <= 0) {
        tracerDetteSuspecte(dette, 'champ non fini ou hors domaine (montant emprunté, solde, taux, paiement)');
        return { forme: 'inapplicable', cause: 'donnees-invalides' };
    }
    // Une dette qui a GROSSI depuis l'origine n'a pas de profil d'amortissement — c'est un
    // révolvant mal typé, ou une saisie INVERSÉE (les deux montants échangés au formulaire). Même
    // règle que la validation prévue à l'import (`[DEBT-MCP-ORIGINALBALANCE]`), énoncée ici pour que
    // le moteur ne dépende pas de l'import — et TRACÉE, parce que rien d'autre ne la signalera.
    if (originalBalance < balance) {
        tracerDetteSuspecte(dette, 'montant emprunté INFÉRIEUR au solde actuel (saisie probablement inversée)');
        return { forme: 'inapplicable', cause: 'origine-incoherente' };
    }

    const i = interestRate / 100 / 12;

    // ⚠️ [DETTE-DATES] Le moteur CESSE de payer à la fin du terme et LAISSE le solde résiduel au
    // bilan (`EFFACER-SUR-UNE-DATE-FABRIQUE-DU-PATRIMOINE`). Le passé doit décrire le MÊME prêt :
    // sans cette borne, le modèle continuait d'amortir après un terme échu, sous-estimait le solde
    // d'aujourd'hui et gonflait le paiement résolu (mesuré : 38 913 $ affichés sur 30 000 $
    // empruntés, prêt à terme échu en 01/2025 avec 9 000 $ résiduels).
    const finTerme = moisAbsolu(dette.termEndDate);
    const finPaiement = finTerme !== null && finTerme < moisAbsoluCourant ? finTerme : moisAbsoluCourant;
    if (finPaiement < debut) {
        tracerDetteSuspecte(dette, 'fin de terme ANTÉRIEURE au début du prêt');
        return { forme: 'inapplicable', cause: 'donnees-invalides' };
    }
    const nbPas = finPaiement - debut;

    // Prêt commencé ce mois-ci (ou terme d'un seul mois) : aucun pas d'amortissement à décrire.
    // La courbe est le solde réel, plate — pas un refus, il n'y a simplement rien à reconstruire.
    if (nbPas === 0) {
        return { forme: 'ok', soldes: Array(moisAbsoluCourant - debut + 1).fill(balance), premierMoisAbsolu: debut, facteurRecalage: 1, paiementResolu: minimumPayment };
    }

    const paiementResolu = paiementQuiRelie(originalBalance, balance, i, nbPas);
    if (!fini(paiementResolu) || paiementResolu <= 0) {
        return { forme: 'inapplicable', cause: 'jamais-decroissant' };
    }
    // Une série STRICTEMENT décroissante exige que le paiement dépasse l'intérêt du plus GROS solde
    // de la série — c'est-à-dire du montant emprunté. En dessous, la dette enfle : le modèle ne
    // décrit alors pas un remboursement, et le moteur du futur, lui, force un plancher
    // (`max(minimumPayment, intérêt + solde/300)`). Refuser garde les deux bouts cohérents.
    if (paiementResolu <= i * originalBalance) return { forme: 'inapplicable', cause: 'jamais-decroissant' };

    const facteurRecalage = paiementResolu / minimumPayment;
    if (facteurRecalage < RECALAGE_MIN || facteurRecalage > RECALAGE_MAX) {
        return { forme: 'inapplicable', cause: 'recalage-hors-bande' };
    }

    const soldes: number[] = [];
    let courant = originalBalance;
    for (let k = 0; k < nbPas; k++) {
        soldes.push(courant);
        courant = courant * (1 + i) - paiementResolu;
    }
    // ⚠️ Le dernier pas payé vaut `balance` PAR CONSTRUCTION de `paiementQuiRelie` ; on y écrit la
    // valeur exacte plutôt que son approximation flottante, pour que le supplément au mois
    // d'aujourd'hui soit EXACTEMENT zéro (l'invariant de raccord, pas « presque zéro »).
    soldes.push(balance);
    // Après un terme échu, le solde résiduel reste au bilan, PLAT — comme dans le moteur.
    for (let m = finPaiement + 1; m <= moisAbsoluCourant; m++) soldes.push(balance);

    return { forme: 'ok', soldes, premierMoisAbsolu: debut, facteurRecalage, paiementResolu };
}

/**
 * Paiement mensuel `P` tel que `solde(N) = balance` en partant de `origine`, au taux mensuel `i`.
 *
 * Forme CLOSE, pas de dichotomie : `solde(N) = origine × g − P × (g − 1) / i` avec `g = (1+i)^N`,
 * d'où `P = (origine × g − balance) × i / (g − 1)`. À taux nul, la récurrence est affine et le
 * paiement vaut simplement l'écart réparti sur les `N` pas.
 */
function paiementQuiRelie(origine: number, balance: number, i: number, nbPas: number): number {
    if (i === 0) return (origine - balance) / nbPas;
    const g = Math.pow(1 + i, nbPas);
    return (origine * g - balance) * i / (g - 1);
}

/** Ce qu'il faut connaître d'une dette pour lui reconstruire un passé amorti : le contrat des
 *  registres de patrimoine (`DebtBalance` — dates + solde actuel) enrichi de ce que la formule
 *  d'amortissement consomme. Tout ce qui est en plus est OPTIONNEL : une dette qui ne les porte pas
 *  ne s'amortit simplement pas, et le service le dit au lieu de le deviner. */
export interface DebtAmortissable extends DebtBalance, EntreeAmortissement {}

/**
 * SUPPLÉMENT de dette au mois absolu `courant` : ce qu'on devait EN PLUS à ce moment-là, par rapport
 * au solde d'aujourd'hui.
 *
 * ⚠️ **DELTA ADDITIF, jamais une resommation.** L'appelant possède déjà le total des dettes
 * d'aujourd'hui (`currentDebtNonImmo`) ; on lui rend de quoi le CORRIGER, exactement comme
 * `sumNotYetStartedDebtsAtAbsoluteMonth` lui rend de quoi le RÉDUIRE. Recomposer le total ici
 * dupliquerait la formule du patrimoine — le piège que `[PASSE-REEL-DETTE-1]` a déjà rencontré, et
 * que le commentaire de `debtSchedule.ts` raconte.
 *
 * Retourne toujours ≥ 0 : une dette s'amortit, donc le passé en doit PLUS, jamais moins. Une dette
 * `inapplicable` (bail, révolvant, données manquantes, recalage hors bande) contribue **0** — elle
 * reste au niveau figé d'aujourd'hui, comportement d'avant ce lot.
 *
 * ⚠️ Aucune interaction avec `sumNotYetStartedDebtsAtAbsoluteMonth` : avant son `startDate`, une
 * dette n'a pas de solde amorti (le service refuse), donc elle ne contribue qu'à l'autre delta.
 * Les deux corrections sont disjointes par construction, et un test le vérifie au mois de bascule.
 */
export function prepareSupplementAmortiAbsolu(
    dettes: ReadonlyArray<DebtAmortissable> | null | undefined,
    moisAujourdhui: number,
): (courant: number) => number {
    // ⚠️ `amortirDettePassee` reconstruit la série ENTIÈRE (du début du prêt à aujourd'hui) et ne
    // dépend PAS du mois interrogé. L'appeler dans la boucle des mois — pire, dans celle des JOURS,
    // plafonnée à 4 000 — donnait O(jours × mois de prêt) par dette : plusieurs MILLIONS d'itérations
    // synchrones pour un prêt de 25 ans, recalculées à chaque invalidation du `useMemo` du graphe
    // (donc à chaque ajout de transaction). On paie la série UNE fois, la boucle ne fait plus
    // qu'indexer. Aucun cache, aucune identité de tableau à surveiller : c'est l'APPELANT qui hisse
    // la préparation hors de sa boucle, et le typecheck l'y oblige.
    const prepares = (dettes ?? []).filter(d => !!d).map(dette => ({ dette, r: amortirDettePassee(dette, moisAujourdhui) }));
    return (courant: number): number => prepares.reduce((somme, { dette, r }) => {
        if (r.forme !== 'ok') return somme;
        const index = courant - r.premierMoisAbsolu;
        if (index < 0 || index >= r.soldes.length) return somme;
        return somme + Math.max(0, r.soldes[index] - dette.balance);
    }, 0);
}

/** Variante à un coup, pour un appel ISOLÉ (tests, diagnostic). ⚠️ Elle reconstruit la série à
 *  chaque appel : dans une boucle, utiliser `prepareSupplementAmortiAbsolu`. */
export function supplementAmortiAuMoisAbsolu(
    dettes: ReadonlyArray<DebtAmortissable> | null | undefined,
    courant: number,
    moisAujourdhui: number,
): number {
    return prepareSupplementAmortiAbsolu(dettes, moisAujourdhui)(courant);
}

/** Comme `supplementAmortiAuMoisAbsolu`, mais au mois `m` de la simulation — même paire de variantes
 *  que `sumNotYetStartedDebtsAtMonth` / `...AtAbsoluteMonth`, et pour la même raison : `buildPastPrefix`
 *  raisonne en mois de simulation, `dailyPastLedger` en mois absolus. « Aujourd'hui » == le mois 0. */
export function prepareSupplementAmortiAuMois(
    dettes: ReadonlyArray<DebtAmortissable> | null | undefined,
    startYear: number,
    startMonth: number,
): (m: number) => number {
    const auMoisAbsolu = prepareSupplementAmortiAbsolu(dettes, startYear * 12 + startMonth);
    return (m: number): number => {
        const { annee, mois } = moisDeSimulation(startYear, startMonth, m);
        return auMoisAbsolu(annee * 12 + mois);
    };
}

/** Variante à un coup — même avertissement de coût que `supplementAmortiAuMoisAbsolu`. */
export function supplementAmortiAuMois(
    dettes: ReadonlyArray<DebtAmortissable> | null | undefined,
    startYear: number,
    startMonth: number,
    m: number,
): number {
    return prepareSupplementAmortiAuMois(dettes, startYear, startMonth)(m);
}

/** Combien de dettes reçoivent RÉELLEMENT une courbe d'amortissement, sur combien de dettes en tout.
 *
 * ⚠️ Existe pour que l'ÉCRAN puisse dire la vérité sur ce qu'il montre. Le bandeau du graphe Futur
 * affirmait « dettes au niveau actuel » — vrai avant ce lot, faux dès qu'une dette s'amortit. Le fait
 * est dérivé de la MÊME décision que le calcul (`amortirDettePassee`), jamais d'une heuristique de
 * texte ni d'une relecture des champs : un libellé est un consommateur de la même vérité qu'un
 * chiffre, sinon les deux divergent en silence.
 *
 * `total` compte les dettes REÇUES, pas seulement les amortissables : c'est ce qui permet de
 * distinguer « aucune » de « toutes » de « certaines ».
 */
export function compterDettesAmorties(
    dettes: ReadonlyArray<DebtAmortissable> | null | undefined,
    moisAujourdhui: number,
): { amorties: number; total: number } {
    const liste = (dettes ?? []).filter(d => !!d);
    let amorties = 0;
    for (const d of liste) {
        const r = amortirDettePassee(d, moisAujourdhui);
        // ⚠️ « Le modèle est CONSTRUCTIBLE » n'est pas « la courbe BOUGE ». Un prêt commencé ce
        // mois-ci rend une série plate sur le solde réel : `forme === 'ok'` et pourtant zéro
        // supplément partout — annoncer « dettes amorties » y serait faux. On exige donc que le
        // premier point dépasse le solde d'aujourd'hui, c'est-à-dire la condition MÊME qui rend le
        // supplément non nul (`Math.max(0, soldes[i] − balance)`), pas un proxy.
        if (r.forme === 'ok' && r.soldes[0] > d.balance) amorties++;
    }
    return { amorties, total: liste.length };
}
