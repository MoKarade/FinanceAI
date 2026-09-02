// services/projection/debtAmortization.ts
//
// [DEBT-AMORTIZATION] — lot 1 sur 2 (découpage demandé par Marc le 2026-09-02).
//
// Marc : « chaque semaine je dois un peu moins ». Le passé affiche aujourd'hui la dette à son
// niveau ACTUEL, figé, depuis toujours — c'est `[PASSE-REEL-DETTE-1]` qui l'a rendue absente avant
// sa date de début, mais elle reste plate ensuite. Ce module calcule la vraie décroissance.
//
// ⚠️ **Ce lot ne BRANCHE rien** : le service est pur et testé, la courbe du passé n'est pas encore
// modifiée. Le câblage (delta additif dans `buildPastPrefix`/`dailyPastLedger`, avec la mesure
// avant/après) est le lot 2, `[DEBT-AMORTIZATION-CABLAGE]`. Découper ainsi était le choix de Marc :
// « je te montre le résultat du lot 1 avant d'engager le lot 2 ».
//
// ⚠️ Ce module INVERSE sciemment la Décision 2 de `docs/adr/0012-quatre-decisions-de-marc-2026-08-17.md`
// (« aucun amortissement rétroactif »), après confirmation explicite de Marc en connaissance de
// cause. L'ADR est à annoter au lot 2, quand la courbe changera réellement d'aspect.
//
// Fonction PURE, sans dépendance au moteur — comme `debtSchedule.ts`, dont elle réutilise
// `moisAbsolu` plutôt que de re-dériver un index de mois.

import type { DebtKind } from '../../types';
import { moisAbsolu } from './debtSchedule';

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
    /** Il manque une entrée indispensable, ou l'une d'elles n'est pas un nombre fini. */
    | 'donnees-manquantes'
    /** `originalBalance < balance` : la dette a GROSSI — ce n'est pas un profil d'amortissement. */
    | 'origine-incoherente'
    /** Le modèle n'atterrit pas assez près du solde réel pour qu'un recalage soit honnête. */
    | 'recalage-hors-bande';

export interface EntreeAmortissement {
    /** Solde d'ORIGINE du prêt (montant emprunté). Absent ⇒ rien à amortir. */
    originalBalance?: number;
    /** Solde ACTUEL — l'ANCRE : la courbe rendue s'y termine EXACTEMENT. */
    balance: number;
    /** Taux annuel en POURCENT (comme le store le porte : `5` = 5 %/an). */
    interestRate: number;
    /** Paiement MENSUEL. */
    minimumPayment: number;
    /** Début du prêt (YYYY-MM-DD). Absent ⇒ on ne sait pas d'où partir. */
    startDate?: string;
    kind?: DebtKind;
}

export type ResultatAmortissement =
    | {
        forme: 'ok';
        /** Solde à chaque mois, de `premierMoisAbsolu` à `moisAbsoluCourant` INCLUS. */
        soldes: number[];
        /** Mois absolu (année × 12 + mois) du premier élément de `soldes`. */
        premierMoisAbsolu: number;
        /** Facteur appliqué pour recoller au solde réel. 1 = le modèle tombait déjà juste. */
        facteurRecalage: number;
    }
    | { forme: 'inapplicable'; cause: CauseNonAmortissable };

/**
 * Bande de recalage tolérée. Le modèle d'amortissement ne connaît ni les paiements anticipés, ni
 * les congés de paiement, ni les renouvellements de taux : il ne tombera presque jamais pile sur le
 * solde d'aujourd'hui. On le rééchelonne donc pour qu'il y atterrisse EXACTEMENT — mais seulement
 * si l'écart reste plausible.
 *
 * ⚠️ Hors bande, on refuse : une courbe qu'il faut tordre d'un facteur 3 ne décrit plus le prêt de
 * l'utilisateur, elle décrit le modèle. Mieux vaut le niveau figé d'aujourd'hui, honnête, qu'une
 * décroissance inventée présentée comme un fait (no-fake-data).
 */
export const RECALAGE_MIN = 0.5;
export const RECALAGE_MAX = 2;

const fini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

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
    if (!fini(originalBalance) || !fini(balance) || !fini(interestRate) || !fini(minimumPayment)) {
        return { forme: 'inapplicable', cause: 'donnees-manquantes' };
    }
    if (originalBalance <= 0 || balance < 0 || minimumPayment <= 0) {
        return { forme: 'inapplicable', cause: 'donnees-manquantes' };
    }
    // Une dette qui a GROSSI depuis l'origine n'a pas de profil d'amortissement — c'est un
    // révolvant mal typé, ou une saisie inversée. Même règle que la validation prévue à l'import
    // (`[DEBT-MCP-ORIGINALBALANCE]`), énoncée ici pour que le moteur ne dépende pas de l'import.
    if (originalBalance < balance) return { forme: 'inapplicable', cause: 'origine-incoherente' };

    const i = interestRate / 100 / 12;
    const soldes: number[] = [];
    let courant = originalBalance;
    for (let m = debut; m <= moisAbsoluCourant; m++) {
        soldes.push(courant);
        courant = Math.max(0, courant * (1 + i) - minimumPayment);
    }

    const modeleAujourdhui = soldes[soldes.length - 1];
    // Le modèle a éteint la dette avant aujourd'hui alors qu'il en reste : aucun recalage
    // proportionnel ne peut rattraper un zéro (0 × k = 0).
    if (modeleAujourdhui <= 0) {
        return { forme: 'inapplicable', cause: balance > 0 ? 'recalage-hors-bande' : 'donnees-manquantes' };
    }
    const facteurRecalage = balance / modeleAujourdhui;
    if (facteurRecalage < RECALAGE_MIN || facteurRecalage > RECALAGE_MAX) {
        return { forme: 'inapplicable', cause: 'recalage-hors-bande' };
    }

    return {
        forme: 'ok',
        soldes: soldes.map(s => s * facteurRecalage),
        premierMoisAbsolu: debut,
        facteurRecalage,
    };
}
