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

import { JOURS_PAR_CADENCE, type DebtKind, type PaymentFrequency } from '../../types';
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
 * `auto-lease` est FAUX ICI, et ça ne veut plus dire « ne bouge pas » : depuis le 2026-09-17 il est
 * VRAI dans `KIND_VERSEMENTS_FIXES` (forme LINÉAIRE, plus bas). Un bail n'amortit pas un solde PAR
 * L'INTÉRÊT — cette table-ci ne décrit que ça. `heloc`, `margin`, `credit-card` sont révolvants :
 * leur solde monte et descend au gré de l'usage, aucune courbe d'amortissement ne le décrit.
 * `other` est inconnu par construction. ⚠️ Lire cette table SEULE fait conclure à tort qu'un bail
 * reste plat dans le passé : la question « cette dette décroît-elle ? » se pose aux DEUX tables.
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

/**
 * Quels types de dette se remboursent par des VERSEMENTS FIXES sur un solde qui contient DÉJÀ tout
 * ce qu'il y a à payer ?
 *
 * ⚠️⚠️ POURQUOI CETTE SECONDE TABLE EXISTE (demande de Marc, 2026-09-17 : « la dette ça marche pas,
 * ça devrait diminuer avec ce que je paie chaque semaine ; pour tout mon passé elle est à la même
 * valeur, elle diminue que dans mon futur »). Le constat était EXACT, et l'asymétrie est mesurable
 * dans le code : la boucle du FUTUR (`services/projection.ts`, bloc « DETTES ») amortit toute dette
 * `phase === 'active' && balance > 0` **sans jamais lire `kind`**, pendant que le PASSÉ refusait
 * `auto-lease` via `KIND_AMORTISSANT`. Passé et futur décrivaient donc deux dettes différentes —
 * exactement ce que ce module dit vouloir éviter.
 *
 * ⚠️ La justification d'origine (« un bail n'amortit pas un solde, c'est un loyer sur un terme
 * fixe ») était juste pour un bail modélisé comme un LOYER. Elle est devenue fausse pour la façon
 * dont ce bail est SAISI depuis le 2026-09-14 : son `balance` est la **somme des versements
 * restants** et son taux est **0** (cf. la leçon `UN-TAUX-SAISI-SUR-UN-SOLDE-QUI-CONTIENT-DEJA-L-INTERET`
 * — y écrire le taux du contrat comptait l'intérêt DEUX fois, +7 423 $ de versements fantômes).
 * Sur un solde tout-compris à taux nul, chaque versement retire EXACTEMENT son montant : c'est le
 * cas le plus simple et le plus EXACT à reconstruire, pas une devinette.
 *
 * ⚠️ Table EXHAUSTIVE, même raison que sa jumelle : ajouter un `kind` casse le typecheck ici tant
 * que personne n'a tranché son cas. Les deux tables sont DISJOINTES par construction (un test
 * l'exige) : un `kind` ne peut pas être à la fois « amorti par intérêt » et « à versements fixes »,
 * sinon `amortirDettePassee` aurait deux réponses pour une question.
 */
export const KIND_VERSEMENTS_FIXES: Readonly<Record<DebtKind, boolean>> = {
    'auto-lease': true,
    mortgage: false,
    auto: false,
    'student-federal': false,
    'student-quebec': false,
    personal: false,
    'spouse-loan': false,
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
    | 'jamais-decroissant'
    /** Versements fixes (bail) mais taux NON NUL : on ne sait plus ce que le solde contient. Un
     *  solde « somme des versements restants » est tout-compris — lui appliquer un taux compterait
     *  l'intérêt deux fois. Un taux non nul dit que le solde est peut-être du CAPITAL restant, et
     *  ce module refuse de choisir entre deux lectures d'un même nombre. */
    | 'taux-sur-solde-tout-compris';

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
    /** [DEBT-CADENCE-REELLE] Cadence RÉELLE des prélèvements. Absente ⇒ mensuelle. N'a d'effet que
     *  sur les dettes à VERSEMENTS FIXES : la forme par intérêt n'a pas de grille en jours ici. */
    paymentFrequency?: PaymentFrequency;
    /** [DETTE-SOLDE-INSTANTANE-FIGE] Date à laquelle `balance` était vrai. Absente ⇒ `balance` est
     *  pris pour le solde d'AUJOURD'HUI, comportement d'avant ce lot. Cf. `soldeDetteAujourdhui`. */
    balanceAsOf?: string;
    /** [DETTE-VIREMENTS-REELS] Libellé EXACT du marchand dont les VIREMENTS font baisser cette
     *  dette. Renseigné ⇒ les virements réels REMPLACENT la grille modélisée, et la dette ne
     *  descend que là où un virement existe vraiment. Absent ⇒ comportement d'avant ce lot. */
    paymentPayee?: string;
}

// ⚠️ `interestRate`/`minimumPayment` sont OPTIONNELS alors que le calcul en a absolument besoin —
// et c'est délibéré. Les registres du passé (`buildPastPrefix`, `dailyPastLedger`) manipulent des
// `DebtBalance` qui ne portent que les dates et le solde ; exiger ces champs dans le TYPE forcerait
// chaque appelant à fabriquer des valeurs pour les dettes qui ne s'amortissent pas. La contrainte
// vit donc à la FRONTIÈRE, où elle est vérifiée ET NOMMÉE (`donnees-manquantes`), plutôt que dans
// une signature que l'appelant contournerait avec des zéros — un `0 %` inventé produirait une
// courbe plate crédible, exactement ce que le no-fake-data interdit.

/** [DEBT-CADENCE-REELLE] Les prélèvements RÉELS d'une dette à versements fixes, en jours.
 *
 * `premierMs` est l'horodatage UTC du PREMIER prélèvement (le début du bail) ; les suivants tombent
 * tous les `pasJours`. `finMs` borne la grille (fin de terme échue), `null` quand rien ne la borne
 * avant aujourd'hui. `versement` est le montant d'UNE période, dérivé du paiement MENSUEL saisi.
 */
export interface GrilleVersements {
    premierMs: number;
    pasJours: number;
    versement: number;
    finMs: number | null;
}

const JOUR_MS = 86_400_000;

/**
 * Nombre de prélèvements par an, par cadence — 52 et 26, les cadences réelles d'un prêteur.
 *
 * ⚠️ MESURE, pas convention arbitraire : le bail de Marc est prélevé 234,67 $ par semaine et son
 * `minimumPayment` mensuel vaut 1 016,90 $, soit exactement `234,67 × 52 / 12`. Diviser par 52
 * rend donc le versement RÉEL au cent près — c'est la marche que Marc voit sur son compte. Prendre
 * `365,25 / 7 = 52,18` rendrait le total ANNUEL exact et chaque marche fausse ; on préfère la
 * marche, puisque c'est elle qui est observable. Écart assumé et borné : une grille de 7 jours
 * porte ~52,18 dates par année civile, donc ~0,35 %/an de versements en plus que les 52 déclarés —
 * invisible sur les quelques mois que le passé reconstruit, et la courbe reste ANCRÉE au cent près
 * sur le solde d'aujourd'hui de toute façon.
 */
const PERIODES_PAR_AN: Readonly<Record<'weekly' | 'biweekly', number>> = { weekly: 52, biweekly: 26 };

/** Horodatage UTC du jour ISO, ou `null`. Tout est en UTC ici : une grille en jours n'a pas à
 *  dépendre du fuseau de qui regarde (`UN-CONTENEUR-EN-UTC-NE-PEUT-PAS-DEPARTAGER-LOCAL-ET-UTC`). */
export function jourMs(dateIso: string | undefined | null): number | null {
    if (typeof dateIso !== 'string' || dateIso.length < 10) return null;
    const ms = Date.parse(`${dateIso.slice(0, 10)}T00:00:00Z`);
    return Number.isFinite(ms) ? ms : null;
}

/**
 * Combien de prélèvements de la grille tombent STRICTEMENT APRÈS `apresMs` et au plus tard `jusquMs`.
 *
 * C'est toute la mécanique du supplément : à une date passée, on devait `solde_actuel + versement ×
 * (nombre de prélèvements effectués depuis)`. Le prélèvement qui tombe EXACTEMENT sur la date
 * regardée n'est pas compté — à ce moment-là il n'était pas encore prélevé, et c'est la même
 * convention que la forme mensuelle (le mois de début porte encore tous ses versements).
 */
export function nbVersementsApres(grille: GrilleVersements, apresMs: number, jusquMs: number): number {
    const fin = grille.finMs !== null && grille.finMs < jusquMs ? grille.finMs : jusquMs;
    if (!Number.isFinite(apresMs) || !Number.isFinite(fin) || fin <= apresMs) return 0;
    const pas = grille.pasJours * JOUR_MS;
    if (!(pas > 0)) return 0;
    // Premier indice dont la date est strictement après `apresMs` ; jamais négatif (une date
    // antérieure au début du bail voit TOUS les prélèvements, à commencer par le premier).
    const kMin = Math.max(0, Math.floor((apresMs - grille.premierMs) / pas) + 1);
    const kMax = Math.floor((fin - grille.premierMs) / pas);
    return Math.max(0, kMax - kMin + 1);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// [DETTE-VIREMENTS-REELS] LES VRAIS VIREMENTS, quand la dette en nomme la source.
//
// Marc, 2026-09-18 : « ca marfhe pas pour la dette je vais faire simple pour toi je veux que chaque
// fois que je paie toyota ca enleve ca de la dette, faut que ma dette soit lié a chaque fois que je
// fais un virement du bon montant a toyota ». Puis, sur la question du virement MANQUANT : « suivre
// les vrais virements, point » — la dette ne descend QUE sur un virement RÉELLEMENT importé, du
// montant RÉELLEMENT prélevé, et aucune marche n'est inventée là où il n'y en a pas.
//
// ⚠️ CE QUE ÇA REMPLACE. Jusqu'ici le passé d'un bail descendait par une GRILLE MODÉLISÉE
// (`startDate` + k × cadence, versement = `minimumPayment × 12 / périodes`). C'est un MODÈLE : il
// tombe juste tant que le prêteur prélève pile à l'heure et pile le même montant, et il continue de
// descendre même les semaines où rien n'a été prélevé. Les virements, eux, portent leur date ET leur
// montant. Quand la dette en nomme la source, ils GAGNENT — les deux ne coexistent jamais sur une
// même dette, sinon le même solde aurait deux histoires (l'asymétrie entre deux producteurs du même
// registre est la classe que ce module dit en toutes lettres vouloir éviter).
//
// ⚠️ CONSÉQUENCE ASSUMÉE, ET ELLE SE DIT À L'ÉCRAN. Avant le plus ancien virement importé, la dette
// reste PLATE : l'app ne sait rien de ce qui a été payé avant que ses transactions ne commencent.
// C'est le prix exact de « aucun chiffre inventé, jamais », et c'est ce que Marc a choisi.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Ce qu'il faut d'une transaction pour reconnaître un virement de remboursement. Contrat MINIMAL
 *  (même patron que `MinimalPastTransaction` de `dailyPastLedger`) : ce module ne dépend pas du type
 *  `Transaction` complet, donc un champ ajouté ailleurs ne le concerne pas. */
export interface MouvementDette {
    date: string;
    payee?: string;
    amount: number;
    isDuplicate?: boolean;
    /** ⚠️ EXCLUT, exactement comme dans le registre du CASH. Voir `paiementsReelsDette` : deux
     *  registres qui filtrent différemment la même transaction fabriquent du patrimoine net. */
    isTransfer?: boolean;
}

/** Un versement RÉEL : sa date (UTC) et son montant POSITIF (ce qui a été retiré de la dette). */
export interface PaiementReel {
    ms: number;
    montant: number;
}

/**
 * La clé d'appariement d'un marchand. **SOURCE UNIQUE, appelée aux DEUX bouts** — la liste offerte
 * au choix ET la comparaison qui apparie.
 *
 * ⚠️ Un `trim()` recopié d'un seul côté est invisible à toute fixture au libellé propre, et les
 * fixtures ont toujours des libellés propres : mesuré à l'automne sur la bascule Fintable
 * (`9/9 avec 'Carte' contre 0/9 avec ' Carte'`). Trim SEULEMENT : rabattre la casse ou les accents
 * FUSIONNERAIT deux marchands distincts, soit le défaut d'origine un cran plus bas.
 */
export function clePayee(brut: unknown): string {
    return typeof brut === 'string' ? brut.trim() : '';
}

/**
 * Les virements RÉELS qui remboursent cette dette, triés par date croissante.
 *
 * `null` ⇒ la dette ne nomme aucun marchand : il n'y a pas de virements à chercher, et l'appelant
 * garde le comportement d'avant ce lot. Un tableau VIDE, lui, est une réponse : « liée, mais aucun
 * virement connu » — et la dette ne bougera alors pas d'un cent, ce qui est la demande.
 *
 * Ce qui compte comme virement :
 *   · le marchand est EXACTEMENT celui qui est lié (après `clePayee`) — c'est ce qui écarte
 *     `Ste Foy Toyota Quebec` (le concessionnaire, −500,00 $ et −779,79 $ en juillet) des huit
 *     `Toyota Financial` à −234,67 $ : le CONTRÔLE NÉGATIF de tout ce lot, mesuré sur les vraies
 *     transactions de Marc. Un appariement lâche (« contient toyota ») aurait retiré 1 279,79 $ de
 *     sa dette pour un achat qui n'en est pas un remboursement ;
 *   · le montant est fini et NÉGATIF (un remboursement sort de l'argent) ;
 *   · la date est lisible et n'est pas dans l'AVENIR (`jusquMs`) — une transaction post-datée ne
 *     décrit pas un solde d'aujourd'hui ;
 *   · la ligne n'est pas marquée DOUBLON : un doublon est un artefact d'import, le compter
 *     retirerait deux fois le même versement — money-critical, dans le mauvais sens.
 *
 * ⚠️⚠️ **`isTransfer` EXCLUT — et cette ligne dit l'inverse de ce que j'avais écrit et testé.**
 * Mon premier jet gardait les lignes marquées « virement interne », au motif que « le registre du
 * cash et celui de la dette répondent à deux questions distinctes ». **La conservation de l'argent
 * a réfuté ce raisonnement** : le cash EXCLUT `isTransfer` partout (`startingCash`,
 * `reconstructCashHistory`, `dailyPastLedger`), donc une dette qui, elle, l'inclut fait DESCENDRE le
 * passif sans faire descendre l'actif — mesuré sur huit virements marqués, **patrimoine net
 * −25 291,31 $ au lieu de −27 168,67 $, soit 1 877,36 $ CRÉÉS**, et 234,67 $ de plus par semaine
 * (≈ 12 203 $/an sur ce bail). `isDuplicate` marqué sert de contrôle : conservé au cent près.
 * Pour un PATRIMOINE NET, les deux registres n'ont pas le droit de traiter la même transaction
 * différemment — `ΔNW == ΔΣactifs − ΔΣdettes` l'exige.
 * ⚠️ Le coût de l'alignement est VISIBLE et celui du défaut était SILENCIEUX : marquer ses paiements
 * « virement interne » fait maintenant cesser la déduction, et l'écran le NOMME
 * (`lie-sans-virement` / le compte à zéro). Un argent créé, lui, n'apparaît nulle part.
 */
export function paiementsReelsDette(
    dette: Readonly<EntreeAmortissement>,
    transactions: ReadonlyArray<MouvementDette> | null | undefined,
    /** Borne HAUTE : aujourd'hui, ou la fin du TERME quand il est échu — la plus ANCIENNE des deux.
     *  ⚠️ Sans la borne de terme, un bail ÉTEINT continuait de descendre sur des virements qui n'en
     *  remboursent plus rien : mesuré **−2 581,37 $** sur un résiduel de 5 000 $ dont le prêteur
     *  prélève encore 234,67 $/semaine (le cas n'est pas théorique — remplacer un bail chez le même
     *  prêteur garde le MÊME libellé de marchand). La branche GRILLE portait déjà cette borne
     *  (`construireGrille`/`finMs`) et restait plate à 5 000 $ : c'est l'asymétrie entre les deux
     *  sources qui a démasqué le trou (`EFFACER-SUR-UNE-DATE-FABRIQUE-DU-PATRIMOINE`). */
    jusquMs: number | null,
): PaiementReel[] | null {
    const cible = clePayee(dette.paymentPayee);
    if (cible === '') return null;
    const out: PaiementReel[] = [];
    for (const t of transactions ?? []) {
        if (!t || t.isDuplicate || t.isTransfer) continue;
        if (clePayee(t.payee) !== cible) continue;
        const montant = Number(t.amount);
        if (!fini(montant) || montant >= 0) continue;
        const ms = jourMs(t.date);
        if (ms === null) continue;
        if (jusquMs !== null && ms > jusquMs) continue;
        out.push({ ms, montant: -montant });
    }
    out.sort((a, b) => a.ms - b.ms);
    return out;
}

/**
 * D'où viennent les versements qui font baisser cette dette — et, quand il n'y en a aucune source,
 * s'il faut pour autant s'interdire la grille modélisée.
 *
 * ⚠️ `lieeAUnPayee` est le champ qui empêche le repli SILENCIEUX. Une dette liée à un marchand dont
 * on ne peut pas lire les virements (jour inconnu) ne doit PAS retomber sur la descente modélisée :
 * ce serait précisément le comportement que ce lot remplace, réintroduit par le bas et sans rien de
 * visible (`CORRECTIF-VERT-EN-TEST-INERTE-EN-PROD`).
 */
export type SourceVersements =
    | { forme: 'grille'; grille: GrilleVersements }
    | { forme: 'virements'; paiements: readonly PaiementReel[] }
    /** `incoherents` : la dette NOMME un marchand, ses virements ont été lus, et leur somme depuis
     *  l'estampille DÉPASSE le solde enregistré. Distingué de `aucune` parce que l'écran n'a pas la
     *  même chose à dire — ici il y a un geste à faire (revoir le marchand, ou ré-enregistrer le
     *  solde), là il n'y a rien à corriger. */
    | { forme: 'aucune'; lieeAUnPayee: boolean; incoherents?: { payee: string; nb: number } };

/** Σ des versements tombant STRICTEMENT après `apresMs` et au plus tard `jusquMs`.
 *  Même convention que `nbVersementsApres`, et pour la même raison : le versement qui tombe
 *  EXACTEMENT à la date regardée n'était pas encore prélevé à ce moment-là. */
export function verseEntre(source: SourceVersements, apresMs: number, jusquMs: number): number {
    if (source.forme === 'grille') return source.grille.versement * nbVersementsApres(source.grille, apresMs, jusquMs);
    if (source.forme === 'virements') {
        let somme = 0;
        for (const p of source.paiements) {
            if (p.ms > apresMs && p.ms <= jusquMs) somme += p.montant;
        }
        return somme;
    }
    return 0;
}

/**
 * Les marchands qu'on peut PROPOSER comme source de virements, avec le nombre de sorties d'argent
 * connues pour chacun — triés du plus fréquent au moins fréquent, puis par ordre alphabétique.
 *
 * ⚠️ Cette liste existe pour que le lien soit CHOISI et jamais RETAPÉ. Un champ « nom exact du
 * marchand » est un appariement déguisé en formulaire : Marc devrait deviner une égalité de chaîne,
 * accents et espaces compris, et un caractère de travers rendrait la dette muette sans rien dire.
 * Une liste ne peut émettre qu'une valeur qui existe.
 *
 * ⚠️ Elle passe par `clePayee`, la MÊME clé que l'appariement — c'est tout l'intérêt : ce qui est
 * offert est exactement ce qui sera trouvé. Normaliser d'un seul côté est le défaut mesuré cet
 * automne sur la bascule Fintable, et il est invisible à toute fixture au libellé propre.
 *
 * ⚠️ Aucun MONTANT n'est publié ici, seulement un COMPTE : la valeur voyage dans un `<option>`, que
 * `PrivateAmount` ne peut pas envelopper — un montant y serait lisible en mode discret.
 */
export function marchandsCandidats(
    transactions: ReadonlyArray<MouvementDette> | null | undefined,
): Array<{ payee: string; nb: number }> {
    const compte = new Map<string, number>();
    for (const t of transactions ?? []) {
        // Même filtre que `paiementsReelsDette`, au caractère près : un marchand offert dont les
        // lignes seraient toutes écartées à l'appariement serait une promesse vide.
        if (!t || t.isDuplicate || t.isTransfer) continue;
        const cle = clePayee(t.payee);
        if (cle === '') continue;
        const montant = Number(t.amount);
        if (!fini(montant) || montant >= 0) continue;
        compte.set(cle, (compte.get(cle) ?? 0) + 1);
    }
    return [...compte.entries()]
        .map(([payee, nb]) => ({ payee, nb }))
        .sort((a, b) => (b.nb - a.nb) || a.payee.localeCompare(b.payee, 'fr'));
}

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
        /** [DETTE-SOLDE-INSTANTANE-FIGE] Solde d'AUJOURD'HUI — le dernier point de `soldes`, et
         *  l'ANCRE contre laquelle tout supplément se mesure.
         *
         *  ⚠️ Ce n'est PAS toujours `dette.balance`. Quand le solde stocké porte une date
         *  (`balanceAsOf`) antérieure à aujourd'hui et que la dette est à versements fixes à taux
         *  nul, les prélèvements survenus depuis sont déduits : le solde stocké est un INSTANTANÉ,
         *  pas une mesure du jour. Les consommateurs doivent donc soustraire CE champ, jamais
         *  `dette.balance` — sinon le supplément est décalé de toute la dérive et le
         *  `Math.max(0, …)` la rabat silencieusement à zéro. */
        soldeAujourdhui: number;
        /** [DEBT-CADENCE-REELLE] GRILLE des prélèvements, présente UNIQUEMENT pour une dette à
         *  versements fixes dont la cadence est SOUS-MENSUELLE (hebdo, aux deux semaines).
         *
         *  ⚠️ Elle n'est pas une seconde vérité à côté de `soldes` : `soldes` en est DÉRIVÉ (voir
         *  `amortirVersementsFixes`), exactement pour que la courbe au MOIS et la courbe au JOUR ne
         *  puissent pas décrire deux dettes — l'asymétrie entre deux modules est la classe de défaut
         *  que `UN-TOTAL-AMPUTE…` et `UNE-REGLE-ECRITE-SUR-UN-OBJET-DU-MONDE-REEL…` ont déjà coûtée.
         *  Absente ⇒ la cadence est mensuelle et le jour n'apporte aucune précision : le
         *  consommateur au jour retombe sur le palier mensuel, comportement d'avant ce lot. */
        grilleVersements?: GrilleVersements;
        /** [DETTE-VIREMENTS-REELS] D'OÙ viennent les versements de cette série — la grille
         *  modélisée, les virements RÉELS, ou rien. Publié pour que la variante au JOUR
         *  (`prepareSupplementAmortiParJour`) descende à la date de chaque versement sans jamais
         *  RECONSTRUIRE la décision : deux lectures de la même règle divergent à la première
         *  retouche, et aucune des deux n'est fausse toute seule.
         *  ⚠️ `grilleVersements` reste publié À CÔTÉ (contrat antérieur, consommé par des gardes) ;
         *  il est renseigné exactement quand `versements.forme === 'grille'`. */
        versements?: SourceVersements;
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
/** Marge relative sous laquelle un paiement est tenu pour ÉGAL à l'intérêt (bruit flottant de
 *  `Math.pow`, qui varie d'une version de V8 à l'autre) — voir `[NODE24-POW-ULP]`. */
const TOLERANCE_PAIEMENT_INTERET = 1e-9;

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
    /** [DEBT-CADENCE-REELLE] Le JOUR d'aujourd'hui (ISO). REQUIS, jamais optionnel : une grille de
     *  prélèvements en jours a besoin d'un point d'arrivée au jour, et une porte optionnelle
     *  laisserait la production reprendre la version au MOIS en silence — c'est exactement comme ça
     *  que la courbe au jour et la courbe au mois se mettraient à décrire deux dettes. `null` est
     *  une réponse légitime et explicite (« je ne connais pas le jour ») : la cadence sous-mensuelle
     *  est alors ignorée et on retombe sur le palier mensuel d'avant ce lot. */
    aujourdhuiIso: string | null,
    /** [DETTE-VIREMENTS-REELS] Les transactions RÉELLES, **REQUISES**. Elles portent les virements
     *  qui font baisser une dette liée à un marchand (`Debt.paymentPayee`). Optionnel, la production
     *  serait retombée en silence sur la descente MODÉLISÉE — exactement ce que ce lot remplace, et
     *  le mode de panne `CORRECTIF-VERT-EN-TEST-INERTE-EN-PROD` dans sa forme pure. `[]` est une
     *  réponse explicite et légitime (« aucune transaction »). */
    transactions: ReadonlyArray<MouvementDette> | null | undefined,
): ResultatAmortissement {
    const kind = dette.kind;
    // ⚠️ L'AIGUILLAGE AVANT TOUT LE RESTE. Deux familles de remboursement, deux formes, une seule
    // réponse par dette (les tables sont disjointes, et un test l'exige).
    if (kind && KIND_VERSEMENTS_FIXES[kind]) return amortirVersementsFixes(dette, moisAbsoluCourant, aujourdhuiIso, transactions);
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
        return { forme: 'ok', soldes: Array(moisAbsoluCourant - debut + 1).fill(balance), premierMoisAbsolu: debut, facteurRecalage: 1, paiementResolu: minimumPayment, soldeAujourdhui: balance };
    }

    const paiementResolu = paiementQuiRelie(originalBalance, balance, i, nbPas);
    if (!fini(paiementResolu) || paiementResolu <= 0) {
        return { forme: 'inapplicable', cause: 'jamais-decroissant' };
    }
    // Une série STRICTEMENT décroissante exige que le paiement dépasse l'intérêt du plus GROS solde
    // de la série — c'est-à-dire du montant emprunté. En dessous, la dette enfle : le modèle ne
    // décrit alors pas un remboursement, et le moteur du futur, lui, force un plancher
    // (`max(minimumPayment, intérêt + solde/300)`). Refuser garde les deux bouts cohérents.
    //
    // ⚠️ [NODE24-POW-ULP] Comparaison TOLÉRANTE, pas stricte. Quand le solde n'a pas bougé depuis
    // l'origine, `paiementQuiRelie` vaut EXACTEMENT l'intérêt en arithmétique réelle ; en flottant,
    // le dernier bit dépend de `Math.pow`, donc du nombre de mois ET de la version de V8. Mesuré le
    // 23/09/2026 sur 20 000 $ à 12 %, 32 mois : Node 20 → 199,99999999999997 (refus juste), Node 24 →
    // 200,00000000000003, qui passait ce test et tombait sur « recalage-hors-bande » — la bonne
    // décision pour la mauvaise raison, cause fausse remontée à l'écran. Pas propre à Node 24 : sous
    // Node 20, 99 anciennetés sur 320 tombaient déjà du mauvais côté. 1e-9 relatif, c'est
    // 0,0000002 $ par mois sur 200 $ : aucun prêt réel ne « décroît » à ce rythme.
    if (paiementResolu <= i * originalBalance * (1 + TOLERANCE_PAIEMENT_INTERET)) {
        return { forme: 'inapplicable', cause: 'jamais-decroissant' };
    }

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

    return { forme: 'ok', soldes, premierMoisAbsolu: debut, facteurRecalage, paiementResolu, soldeAujourdhui: balance };
}

/**
 * Reconstruit le solde MENSUEL d'une dette à VERSEMENTS FIXES (bail) — la forme LINÉAIRE.
 *
 * ⚠️ AUCUN `originalBalance` REQUIS, et ce n'est pas un relâchement : à taux nul sur un solde
 * tout-compris, `solde(t) = solde_actuel + paiement × (mois restants entre t et aujourd'hui)`. La
 * courbe est ancrée sur DEUX faits saisis — le solde d'aujourd'hui et le versement — plus la date
 * de début. Rien n'est deviné. Exiger en plus le montant d'origine aurait rendu la correction
 * INATTEIGNABLE : `DebtKindFields` ne montre ce champ que si `KIND_AMORTISSANT[kind]`, donc
 * personne n'a jamais pu le saisir pour un bail (`CHAMP-DANS-LE-TYPE-INATTEIGNABLE-DANS-L-UI`).
 *
 * ⚠️ LE PLANCHER DU FUTUR N'EST PAS RECOPIÉ ICI, délibérément. Le moteur force
 * `max(minimumPayment, intérêt + solde/300)` pour qu'une dette à paiement dérisoire finisse par
 * s'éteindre. À taux NUL avec un versement strictement positif, elle s'éteint toujours : le
 * plancher ne protège de rien, et l'appliquer au PASSÉ inventerait des versements que l'utilisateur
 * n'a jamais faits. Conséquence assumée et bornée : si `minimumPayment < balance/300`, le futur
 * descend plus vite que ce que le passé remonte — on décrit alors ce qui a été PAYÉ, pas ce que le
 * garde-fou du moteur imposerait.
 */
function amortirVersementsFixes(
    dette: Readonly<EntreeAmortissement>,
    moisAbsoluCourant: number,
    aujourdhuiIso: string | null,
    transactions: ReadonlyArray<MouvementDette> | null | undefined,
): ResultatAmortissement {
    // ⚠️⚠️ [DETTE-VIREMENTS-REELS] `startDate` n'est REQUISE que par la grille. Une dette LIÉE sans
    // date de début fait partir la série du PREMIER VIREMENT CONNU — un FAIT, pas une devinette.
    // Sans ça, `soldeDetteAujourdhui` déduisait les virements (il ne lit pas `startDate`) pendant
    // que cette fonction refusait tout : mesuré, le passé restait PLAT à 45 291,31 $ alors que le
    // cash descendait des mêmes 1 877,36 $, donc la valeur nette du passé était **1 878 $ trop
    // haute** puis CHUTAIT vers aujourd'hui sans aucune cause — et l'écran affirmait
    // « suit-les-virements » pour une courbe qui ne suivait rien. C'est le JUMEAU exact de
    // l'asymétrie `minimumPayment` corrigée trois lignes plus bas : j'avais réparé l'une et laissé
    // l'autre (`quand on retire un terme d'une somme, réexaminer CHAQUE autre terme au même critère`).
    // `startDate` est un champ de formulaire OPTIONNEL : le cas s'atteint en un clic.
    const debutSaisi = moisAbsolu(dette.startDate);
    const premierVirement = debutSaisi !== null ? null : (() => {
        const p = paiementsReelsDette(dette, transactions, jourMs(aujourdhuiIso));
        return p && p.length > 0 ? moisAbsolu(new Date(p[0].ms).toISOString().slice(0, 10)) : null;
    })();
    const debut = debutSaisi ?? premierVirement;
    if (debut === null || !fini(moisAbsoluCourant) || moisAbsoluCourant < debut) {
        return { forme: 'inapplicable', cause: 'donnees-manquantes' };
    }
    const { balance, interestRate, minimumPayment } = dette;
    // ⚠️⚠️ [DETTE-VIREMENTS-REELS] `minimumPayment` n'est exigé que par la GRILLE. Un virement porte
    // sa DATE et son MONTANT : une dette LIÉE n'en a aucun besoin, et l'exiger quand même faisait
    // diverger deux lectures du même fait — `soldeDetteAujourdhui` (qui passe par
    // `sourceVersements`, sans cette contrainte) déduisait les virements pendant que cette
    // fonction-ci refusait TOUT, laissant la courbe du passé PLATE et le bandeau annoncer « dettes
    // au niveau actuel » pour la dette même dont le formulaire dit « déjà déduit ». Le cas est
    // atteignable : le bouton « Ajouter » ne vérifie que `balance > 0`, et `apply_debt` ne borne pas
    // `minimumPayment`. Les DEUX chemins lisent donc désormais la même règle.
    const lieAUnMarchand = clePayee(dette.paymentPayee) !== '';
    // ABSENT ≠ CORROMPU, même partage que la forme par intérêt : un champ jamais saisi est le cas
    // nominal et reste muet ; un champ présent mais hors domaine est tracé.
    if (interestRate === undefined || (!lieAUnMarchand && minimumPayment === undefined)) {
        return { forme: 'inapplicable', cause: 'donnees-manquantes' };
    }
    if (!fini(balance) || !fini(interestRate) || balance < 0
        || (!lieAUnMarchand && (!fini(minimumPayment) || minimumPayment! <= 0))) {
        tracerDetteSuspecte(dette, 'champ non fini ou hors domaine (solde, taux, versement)');
        return { forme: 'inapplicable', cause: 'donnees-invalides' };
    }
    // ⚠️ Le REFUS qui protège du double comptage. Un taux non nul sur un solde de bail signifie
    // qu'on ignore ce que ce solde contient — refuser vaut mieux qu'une courbe plausible et fausse.
    if (interestRate !== 0) {
        tracerDetteSuspecte(dette, 'versements fixes avec un taux NON NUL — solde tout-compris ou capital restant ? refus');
        return { forme: 'inapplicable', cause: 'taux-sur-solde-tout-compris' };
    }

    // [DETTE-DATES] Même borne que la forme par intérêt et que le moteur : après le terme, on cesse
    // de payer et le résiduel reste au bilan, PLAT.
    const finTerme = moisAbsolu(dette.termEndDate);
    const finPaiement = finTerme !== null && finTerme < moisAbsoluCourant ? finTerme : moisAbsoluCourant;
    if (finPaiement < debut) {
        tracerDetteSuspecte(dette, 'fin de terme ANTÉRIEURE au début du bail');
        return { forme: 'inapplicable', cause: 'donnees-invalides' };
    }

    const nbPas = finPaiement - debut;

    // ── [DEBT-CADENCE-REELLE] LA GRILLE, QUAND ELLE EXISTE ──────────────────────────────────────
    //
    // Marc paie son bail TOUTES LES SEMAINES et voyait une marche MENSUELLE : « ça devrait descendre
    // à chaque paiement à Toyota, pas une fois par mois ». À taux nul sur un solde tout-compris, la
    // date de chaque prélèvement est CONNUE (début du bail + k × pas), donc la marche mensuelle
    // n'était pas une prudence — c'était une perte de précision que la donnée avait déjà.
    //
    // ⚠️ LA SÉRIE MENSUELLE EN EST DÉRIVÉE, elle n'est pas calculée à côté. C'est le point qui
    // empêche `buildPastPrefix` (au mois) et `dailyPastLedger` (au jour) de décrire deux dettes —
    // l'asymétrie entre deux modules dont aucun n'est faux tout seul est une classe de défaut déjà
    // payée deux fois dans ce dépôt. Le point du mois `m` vaut le solde au PREMIER JOUR de ce mois
    // (ou au début du bail pour le mois de départ : avant, la dette n'existe pas).
    // [DETTE-VIREMENTS-REELS] UNE seule décision « d'où viennent les versements ? », partagée avec
    // `soldeDetteAujourdhui` et `statutSoldeDette`. Les bornes déjà calculées ici lui sont PASSÉES :
    // re-dériver `finPaiement` ferait deux grilles pour une même dette.
    const source = sourceVersements(dette, aujourdhuiIso, transactions, { finPaiement, moisCourant: moisAbsoluCourant });
    if (source.forme !== 'aucune') {
        const aujourdhuiMs = jourMs(aujourdhuiIso)!;   // non nul par construction de `sourceVersements`
        // [DETTE-SOLDE-INSTANTANE-FIGE] La série part de l'ANCRE, pas du solde STOCKÉ. Les deux
        // coïncident tant que le solde n'est pas daté ; dès qu'il l'est, l'ancre est le solde
        // d'aujourd'hui et le solde stocké n'est plus qu'un point de départ historique.
        const ancre = ancreCorrigee(dette, source, aujourdhuiMs);
        // Borne BASSE de l'échantillonnage : avant le début du prêt, la dette n'existe pas. Pour la
        // grille c'est `premierMs`, qui vaut EXACTEMENT `jourMs(startDate)` par construction — une
        // seule expression pour les deux sources, plutôt que deux qui se ressemblent.
        const debutMs = jourMs(dette.startDate) ?? Number.NEGATIVE_INFINITY;
        const soldes: number[] = [];
        for (let m = debut; m <= moisAbsoluCourant; m++) {
            const premierDuMois = Date.UTC(Math.floor(m / 12), m % 12, 1);
            const echantillon = Math.max(premierDuMois, debutMs);
            soldes.push(ancre + verseEntre(source, echantillon, aujourdhuiMs));
        }
        const grilleVersements = source.forme === 'grille' ? source.grille : undefined;
        return { forme: 'ok', soldes, premierMoisAbsolu: debut, facteurRecalage: 1, paiementResolu: minimumPayment ?? 0, grilleVersements, versements: source, soldeAujourdhui: ancre };
    }

    // ⚠️ [DETTE-VIREMENTS-REELS] Une dette LIÉE à un marchand ne retombe JAMAIS sur la descente
    // modélisée : elle reste PLATE au solde stocké. C'est la demande de Marc prise au mot — « suivre
    // les vrais virements, point » — et c'est ce qui empêche le modèle qu'on remplace de revenir par
    // le bas le jour où les virements ne sont pas lisibles.
    if (source.lieeAUnPayee) {
        return {
            forme: 'ok',
            soldes: Array(moisAbsoluCourant - debut + 1).fill(balance),
            premierMoisAbsolu: debut,
            facteurRecalage: 1,
            paiementResolu: minimumPayment ?? 0,
            versements: source,
            soldeAujourdhui: balance,
        };
    }

    // ⚠️ Ce repli MENSUEL est le chemin d'avant ce lot, et il n'est atteignable que pour une dette
    // NON liée : une dette liée est déjà repartie plus haut (branche `lieeAUnPayee`). D'où la
    // garantie que `minimumPayment` est ici défini et positif — la garde d'entrée l'exige pour ce
    // cas précis. On l'ÉCRIT plutôt que de l'affirmer : le compilateur ne peut pas la déduire, et un
    // lot futur qui déplacerait le retour d'au-dessus la casserait en silence.
    if (minimumPayment === undefined || !fini(minimumPayment) || minimumPayment <= 0) {
        return { forme: 'inapplicable', cause: 'donnees-manquantes' };
    }

    const soldes: number[] = [];
    // De `debut` à `finPaiement` : on REMONTE le temps depuis le solde d'aujourd'hui, un versement
    // par mois. Le dernier pas payé vaut `balance` EXACTEMENT (invariant de raccord).
    for (let k = 0; k < nbPas; k++) soldes.push(balance + minimumPayment * (nbPas - k));
    soldes.push(balance);
    for (let m = finPaiement + 1; m <= moisAbsoluCourant; m++) soldes.push(balance);

    // `facteurRecalage: 1` n'est pas un remplissage : rien n'est recalé ici, le versement SAISI est
    // exactement celui qui sert. C'est la différence de fond avec la forme par intérêt, où le
    // paiement est RÉSOLU pour relier deux bouts connus.
    return { forme: 'ok', soldes, premierMoisAbsolu: debut, facteurRecalage: 1, paiementResolu: minimumPayment, soldeAujourdhui: balance };
}

/**
 * La grille de prélèvements d'une dette à versements fixes — ou `null` quand il n'y a pas de quoi
 * en bâtir une, auquel cas on garde le palier MENSUEL d'avant ce lot (aucune régression possible).
 *
 * ⚠️ LE VERSEMENT DE LA PÉRIODE SE DÉRIVE du paiement MENSUEL saisi (`× 12 / périodes par an`) : une
 * seconde saisie aurait divergé de la première à la première correction, et c'est `minimumPayment`
 * qui fait autorité partout ailleurs (store, moteur du futur, cashflow). Une seule vérité.
 */
function construireGrille(
    dette: Readonly<EntreeAmortissement>,
    finPaiement: number,
    moisAbsoluCourant: number,
    minimumPayment: number,
    aujourdhuiIso: string | null,
): GrilleVersements | null {
    const cadence = dette.paymentFrequency;
    if (cadence !== 'weekly' && cadence !== 'biweekly') return null;
    const premierMs = jourMs(dette.startDate);
    const aujourdhuiMs = jourMs(aujourdhuiIso);
    if (premierMs === null || aujourdhuiMs === null || aujourdhuiMs < premierMs) return null;
    const pasJours = JOURS_PAR_CADENCE[cadence];
    const versement = minimumPayment * 12 / PERIODES_PAR_AN[cadence];
    if (!fini(versement) || versement <= 0) return null;
    // Borne de terme : le mois `finPaiement` est le DERNIER payé (`[DETTE-DATES]`, le mois de
    // `termEndDate` est INCLUS), donc la grille s'arrête à la FIN de ce mois — pas au jour de
    // `termEndDate`, qui n'a aucune raison d'être un jour de prélèvement. `null` quand rien ne borne
    // avant aujourd'hui : c'est `nbVersementsApres` qui plafonne alors à la date demandée.
    const finMs = finPaiement < moisAbsoluCourant
        ? Date.UTC(Math.floor((finPaiement + 1) / 12), (finPaiement + 1) % 12, 1) - 1
        : null;
    return { premierMs, pasJours, versement, finMs };
}

/**
 * [DETTE-SOLDE-INSTANTANE-FIGE] Le solde stocké RAMENÉ à aujourd'hui, à partir d'une grille déjà
 * construite. Formule UNIQUE du lot : `soldeDetteAujourdhui` et `amortirVersementsFixes` l'appellent
 * tous les deux plutôt que de la recopier — deux écritures d'une même correction d'argent divergent
 * à la première retouche, et aucune des deux n'est fausse toute seule.
 *
 * `balanceAsOf` ABSENT ⇒ on rend le solde stocké tel quel : c'est le comportement d'avant ce lot,
 * et c'est la seule réponse honnête. Une date de saisie inconnue ne se devine pas — la supposer
 * égale à aujourd'hui serait affirmer que l'utilisateur vient de relire son relevé.
 */
function ancreCorrigee(
    dette: Readonly<EntreeAmortissement>,
    source: SourceVersements,
    aujourdhuiMs: number | null,
): number {
    const brut = dette.balance;
    if (source.forme === 'aucune' || aujourdhuiMs === null || !fini(brut)) return brut;
    const depuis = jourMs(dette.balanceAsOf);
    if (depuis === null || aujourdhuiMs <= depuis) return brut;
    const verses = verseEntre(source, depuis, aujourdhuiMs);
    // Plancher à 0 : un instantané très ancien pourrait « payer » plus que le solde. Ça ne
    // fabrique pas de patrimoine (une dette éteinte vaut zéro, elle ne devient pas un actif), et
    // la borne de TERME de la grille empêche déjà ce cas sur toute dette correctement datée.
    return Math.max(0, brut - verses);
}

/**
 * **D'OÙ viennent les versements d'une dette. SOURCE UNIQUE de la décision**, construite SANS passer
 * par la reconstruction du passé.
 *
 * ⚠️ Elle rejoue les mêmes conditions d'éligibilité que `amortirVersementsFixes` (versements fixes,
 * taux NUL, dates exploitables) parce qu'elles décident la même chose : ce solde est-il déductible
 * sans rien inventer ? Ce qui ne doit pas être recopié — la construction de la grille et la
 * correction du solde — ne l'est pas : `construireGrille` et `ancreCorrigee` restent uniques.
 *
 * ⚠️ ORDRE DES SOURCES, et il est le correctif : les VIREMENTS RÉELS passent AVANT la grille
 * modélisée. Une dette qui nomme son marchand n'a plus de grille du tout — pas même en repli
 * (`lieeAUnPayee`), sinon la descente modélisée que ce lot remplace reviendrait par le bas dès que
 * le jour d'aujourd'hui manque, sans que rien ne le dise.
 */
function sourceVersements(
    dette: Readonly<EntreeAmortissement>,
    aujourdhuiIso: string | null,
    transactions: ReadonlyArray<MouvementDette> | null | undefined,
    /** Bornes DÉJÀ calculées par `amortirVersementsFixes`. Passées plutôt que re-dérivées pour que
     *  la reconstruction de la série et le chiffre du jour partagent la MÊME grille au bit près ;
     *  absentes, elles se dérivent d'`aujourdhuiIso` (appel isolé : `soldeDetteAujourdhui`). */
    bornes?: { finPaiement: number; moisCourant: number },
): SourceVersements {
    const lieeAUnPayee = clePayee(dette.paymentPayee) !== '';
    const RIEN: SourceVersements = { forme: 'aucune', lieeAUnPayee };
    const kind = dette.kind;
    if (!kind || !KIND_VERSEMENTS_FIXES[kind]) return RIEN;
    const { interestRate, minimumPayment } = dette;
    // Taux NON NUL ⇒ on ignore ce que le solde contient (capital restant ? tout-compris ?), donc on
    // ne le corrige pas — même refus que `amortirVersementsFixes`, pour la même raison. Ça vaut
    // AUSSI pour les virements réels : sur un prêt qui porte de l'intérêt, une partie du versement
    // paie l'intérêt et retirer le montant entier du solde serait faux.
    if (interestRate !== 0) return RIEN;

    const aujourdhuiMs = jourMs(aujourdhuiIso);
    if (lieeAUnPayee) {
        // ⚠️ Pas de `startDate` exigée, pas de cadence, pas de `minimumPayment` : un virement porte
        // sa DATE et son MONTANT. C'est la simplification de fond du lot — là où la grille avait
        // besoin de trois paramètres pour DEVINER les marches, les virements les donnent.
        if (aujourdhuiMs === null) return RIEN;
        // [DETTE-DATES] Une dette qui n'a PAS ENCORE commencé ne peut avoir reçu aucun versement —
        // et elle ne contribue pas non plus à `currentDebtNonImmo` (cf. `sumNotYetStartedDebts…`),
        // donc la corriger ferait diverger deux registres du même solde. `startDate` ABSENTE reste
        // acceptée : elle veut dire « cette dette a toujours couru » (rétrocompat voulue).
        const debutMois = moisAbsolu(dette.startDate);
        const moisAuj = moisAbsolu(aujourdhuiIso ?? undefined);
        if (debutMois !== null && moisAuj !== null && moisAuj < debutMois) return RIEN;
        // [DETTE-DATES] Après la fin du terme, on cesse de payer et le résiduel reste au bilan —
        // même règle que la grille et que le moteur. La borne est la FIN DU MOIS de `termEndDate`
        // (ce mois est INCLUS, il porte le dernier versement), jamais le jour lui-même, qui n'a
        // aucune raison d'être une date de prélèvement.
        const finTerme = moisAbsolu(dette.termEndDate);
        const finMoisTerme = finTerme === null
            ? null
            : Date.UTC(Math.floor((finTerme + 1) / 12), (finTerme + 1) % 12, 1) - 1;
        const borne = finMoisTerme !== null && finMoisTerme < aujourdhuiMs ? finMoisTerme : aujourdhuiMs;
        const paiements = paiementsReelsDette(dette, transactions, borne);
        if (paiements === null) return RIEN;
        // ⚠️⚠️ LE REFUS QUI REMPLACE UN PLANCHER DEVENU MUET. Si les virements retenus depuis
        // l'estampille dépassent le solde enregistré, ils ne décrivent pas cette dette : le lien
        // pointe le mauvais marchand, ou le solde n'a jamais été ré-enregistré. `Math.max(0, …)`
        // rendait alors **0,00 $** — mesuré sur un lien vers une épicerie à 400 sorties : 47 168,67 $
        // effacés, sous une phrase RASSURANTE et sans alerte. Un total amputé n'est pas une autorité
        // dégradée, c'est un FAUX : on REFUSE la correction (le solde stocké reste), on le TRACE, et
        // `statutSoldeDette` le dit à l'écran.
        const depuis = jourMs(dette.balanceAsOf);
        if (depuis !== null && fini(dette.balance)) {
            let verses = 0;
            for (const pa of paiements) if (pa.ms > depuis && pa.ms <= aujourdhuiMs) verses += pa.montant;
            if (verses > dette.balance) {
                const payee = clePayee(dette.paymentPayee);
                tracerDetteSuspecte(dette, `virements de « ${payee} » supérieurs au solde enregistré — lien ou estampille à revoir`);
                const nb = paiements.filter(pa => pa.ms > depuis && pa.ms <= aujourdhuiMs).length;
                return { forme: 'aucune', lieeAUnPayee: true, incoherents: { payee, nb } };
            }
        }
        return { forme: 'virements', paiements };
    }

    if (minimumPayment === undefined || !fini(minimumPayment) || minimumPayment <= 0) return RIEN;
    let finPaiement: number;
    let moisCourant: number;
    if (bornes) {
        ({ finPaiement, moisCourant } = bornes);
    } else {
        const debut = moisAbsolu(dette.startDate);
        const moisAujourdhui = moisAbsolu(aujourdhuiIso ?? undefined);
        if (debut === null || moisAujourdhui === null || moisAujourdhui < debut) return RIEN;
        const finTerme = moisAbsolu(dette.termEndDate);
        finPaiement = finTerme !== null && finTerme < moisAujourdhui ? finTerme : moisAujourdhui;
        moisCourant = moisAujourdhui;
        if (finPaiement < debut) return RIEN;
    }
    const grille = construireGrille(dette, finPaiement, moisCourant, minimumPayment, aujourdhuiIso);
    return grille === null ? RIEN : { forme: 'grille', grille };
}

/**
 * [DETTE-SOLDE-INSTANTANE-FIGE] **LE SOLDE RÉEL D'AUJOURD'HUI d'une dette. Source unique.**
 *
 * Marc, 2026-09-17 : « ça devrait enlever de la dette le montant que je paye quand je le paye et ce
 * n'est pas le cas ». Mesuré sur son bail : le solde stocké valait après SEPT prélèvements alors
 * qu'il en avait fait HUIT — 234,67 $ de trop, et l'écart grandissait d'un versement par SEMAINE,
 * parce que `Debt.balance` est un instantané que rien n'avance.
 *
 * Cette fonction ne corrige QUE là où le solde d'aujourd'hui se DÉDUIT sans rien inventer : dette à
 * versements fixes, taux NUL (donc chaque versement retire exactement son montant), cadence connue,
 * dates exploitables, et un `balanceAsOf` ANTÉRIEUR à aujourd'hui. Dès qu'une de ces conditions
 * manque, elle rend le solde stocké **tel quel** — donc le comportement d'avant ce lot, bit-à-bit,
 * pour toute autre dette du dépôt.
 *
 * ⚠️ Elle ne remplace PAS `amortirDettePassee` : celle-ci reconstruit une SÉRIE, celle-là donne UN
 * point. Les deux partagent la même ancre (`ancreCorrigee`), ce qui est exactement ce qui interdit
 * au chiffre affiché et à la courbe de décrire deux dettes.
 */
export function soldeDetteAujourdhui(
    dette: Readonly<EntreeAmortissement>,
    /** Le JOUR d'aujourd'hui (ISO), REQUIS. `null` = « je ne connais pas le jour » ⇒ aucune
     *  correction, jamais une lecture de l'horloge ici (la fonction doit rester déterministe). */
    aujourdhuiIso: string | null,
    /** [DETTE-VIREMENTS-REELS] Les transactions RÉELLES, **REQUISES**. Elles portent les virements
     *  qui font baisser une dette liée à un marchand (`Debt.paymentPayee`). Optionnel, la production
     *  serait retombée en silence sur la descente MODÉLISÉE — exactement ce que ce lot remplace, et
     *  le mode de panne `CORRECTIF-VERT-EN-TEST-INERTE-EN-PROD` dans sa forme pure. `[]` est une
     *  réponse explicite et légitime (« aucune transaction »). */
    transactions: ReadonlyArray<MouvementDette> | null | undefined,
): number {
    return ancreCorrigee(dette, sourceVersements(dette, aujourdhuiIso, transactions), jourMs(aujourdhuiIso));
}

/**
 * [DETTE-BALANCEASOF-INVISIBLE] **Ce qu'un écran a le DROIT d'affirmer sur le solde d'une dette.**
 *
 * Marc, 2026-09-18, après avoir fait le geste que je lui avais demandé : « vérifie que la date est
 * posée ». Personne ne pouvait : `balanceAsOf` avait DEUX écritures et ZÉRO lecture dans tout
 * `components/`. Un champ qu'on demande à l'utilisateur de poser et qu'aucun écran ne rend est
 * indiscernable d'un champ qui n'existe pas.
 *
 * ⚠️ Le statut se DÉRIVE ICI, dans le module qui DÉCIDE — jamais d'une seconde lecture des champs
 * côté rendu. `grillePourDette` porte déjà les quatre conditions (versements fixes, taux NUL,
 * cadence connue, dates exploitables) ; les recopier dans le JSX ferait diverger ce que l'écran
 * AFFIRME de ce que le calcul FAIT, exactement la classe que ce chantier répare
 * (`UN-LOT-QUI-CHANGE-CE-QU-UN-ECRAN-MONTRE-PERIME-CE-QU-IL-AFFIRME`). Une garde de scan interdit
 * cette recopie.
 *
 * Les formes sont EXCLUSIVES et se lisent comme des promesses distinctes :
 * · `suit-les-virements` — [DETTE-VIREMENTS-REELS] daté ET lié à un marchand : les virements RÉELS
 *   tombés depuis `dateIso` sont déduits, et rien d'autre ;
 * · `lie-sans-virement` — lié à un marchand qui ne verse rien : le lien ne peut rien produire ;
 * · `suit-les-versements` — daté ET auto-avançant par la grille MODÉLISÉE : les prélèvements
 *   supposés depuis `dateIso` sont déduits ;
 * · `date-figee` — daté, mais rien ne le fait bouger (mauvais `kind`, taux non nul, cadence absente,
 *   dette pas encore commencée). La date reste un FAIT utile (« saisi ce jour-là »), pas une promesse ;
 * · `jamais-date` — aucune date : le solde est l'instantané figé du défaut d'origine.
 *
 * ⚠️ `aujourdhuiIso` est REQUIS et NON annulable, contrairement à `soldeDetteAujourdhui` : il n'y a
 * pas de quatrième forme « je ne sais pas quel jour on est » à inventer pour un écran, et un
 * paramètre annulable aurait forcé le rendu à choisir un repli — donc à affirmer quelque chose.
 */
export type StatutSoldeDette =
    | { forme: 'suit-les-versements'; dateIso: string }
    /** [DETTE-VIREMENTS-REELS] Daté ET lié à un marchand dont des virements existent. `nbDeduits`
     *  compte ceux tombés APRÈS `dateIso` (donc déjà retirés du solde affiché) ; `dernierIso` est le
     *  jour du plus récent d'entre eux, `null` quand il n'y en a aucun depuis l'estampille. */
    | { forme: 'suit-les-virements'; dateIso: string; payee: string; nbDeduits: number; dernierIso: string | null }
    /** [DETTE-VIREMENTS-REELS] Lié à un marchand dont AUCUN virement n'existe dans les transactions.
     *  C'est le seul état qui appelle un geste : la dette ne bougera jamais tant que le lien pointe
     *  un marchand qui ne verse rien. Distinct de « lié, mais rien depuis l'estampille », qui est le
     *  cas NORMAL le lendemain d'un enregistrement. */
    | { forme: 'lie-sans-virement'; payee: string }
    /** [DETTE-VIREMENTS-REELS] Lié, des virements existent, et leur somme depuis l'estampille
     *  DÉPASSE le solde enregistré : ils ne décrivent pas cette dette. La correction est REFUSÉE
     *  (le solde stocké reste) plutôt que rabattue à zéro — un total amputé n'est pas une autorité
     *  dégradée, c'est un FAUX. C'est le seul autre état qui appelle un geste. */
    | { forme: 'virements-incoherents'; payee: string; nbDeduits: number }
    | { forme: 'date-figee'; dateIso: string }
    | { forme: 'jamais-date' };

export function statutSoldeDette(
    dette: Readonly<EntreeAmortissement>,
    aujourdhuiIso: string,
    /** [DETTE-VIREMENTS-REELS] Les transactions réelles, REQUISES — même raison que partout
     *  ailleurs : sans elles, l'écran affirmerait « suit les versements » sur une dette dont plus
     *  rien ne bouge. */
    transactions: ReadonlyArray<MouvementDette> | null | undefined,
): StatutSoldeDette {
    const source = sourceVersements(dette, aujourdhuiIso, transactions);
    const payee = clePayee(dette.paymentPayee);
    // ⚠️ Un lien vers un marchand SANS virement se dit AVANT toute question de date : c'est un lien
    // qui ne peut rien produire, et aucune date ne le sauverait.
    if (source.forme === 'virements' && source.paiements.length === 0) return { forme: 'lie-sans-virement', payee };
    if (source.forme === 'aucune' && source.incoherents) {
        return { forme: 'virements-incoherents', payee: source.incoherents.payee, nbDeduits: source.incoherents.nb };
    }
    const dateIso = dette.balanceAsOf;
    // `jourMs` rejette aussi bien l'absence que l'illisible : une date qu'on ne sait pas lire ne
    // vaut pas mieux qu'une date absente, et prétendre le contraire daterait un solde au hasard.
    const depuis = typeof dateIso === 'string' ? jourMs(dateIso) : null;
    if (typeof dateIso !== 'string' || depuis === null) return { forme: 'jamais-date' };
    if (source.forme === 'virements') {
        const jusquMs = jourMs(aujourdhuiIso);
        const deduits = jusquMs === null ? [] : source.paiements.filter(p => p.ms > depuis && p.ms <= jusquMs);
        const dernier = deduits.length > 0 ? deduits[deduits.length - 1] : null;
        return {
            forme: 'suit-les-virements',
            dateIso,
            payee,
            nbDeduits: deduits.length,
            // ⚠️ La date se re-rend au format ISO du JOUR, jamais reconstruite d'un `Date` local :
            // un horodatage UTC relu en heure locale recule d'une journée dans un fuseau négatif
            // (`UN-CONTENEUR-EN-UTC-NE-PEUT-PAS-DEPARTAGER-LOCAL-ET-UTC`, payée la veille sur cet
            // écran même).
            dernierIso: dernier === null ? null : new Date(dernier.ms).toISOString().slice(0, 10),
        };
    }
    return source.forme === 'grille'
        ? { forme: 'suit-les-versements', dateIso }
        : { forme: 'date-figee', dateIso };
}

/**
 * [DETTE-SOLDE-INSTANTANE-FIGE] La liste des dettes RAMENÉE au solde d'aujourd'hui.
 *
 * C'est la porte du MOTEUR : `buildSimulationParams` l'applique une fois, au point de passage
 * UNIQUE vers la projection. Le moteur n'a donc rien à savoir de `balanceAsOf` — il reçoit des
 * soldes du jour, comme il l'a toujours cru.
 *
 * ⚠️ **IDEMPOTENTE, et c'est une garantie, pas une coïncidence.** Une dette corrigée ressort avec
 * `balanceAsOf` posé à AUJOURD'HUI : une seconde application ne trouve plus aucun prélèvement
 * postérieur et rend la même liste. Sans ça, un lot futur qui rappellerait cette fonction — ou
 * passerait la liste corrigée à `amortirDettePassee` — déduirait les versements DEUX fois, et la
 * dette serait fausse dans l'autre sens sans que rien ne rougisse.
 *
 * ⚠️ L'IDENTITÉ des objets non corrigés est PRÉSERVÉE (`d` rendu tel quel, pas une copie) : cette
 * liste traverse des `useMemo` et des sélecteurs Zustand, et recopier chaque dette ferait re-rendre
 * tout ce qui en dépend à chaque appel.
 */
export function dettesAuSoldeDuJour<T extends EntreeAmortissement>(
    dettes: ReadonlyArray<T> | null | undefined,
    aujourdhuiIso: string | null,
    /** [DETTE-VIREMENTS-REELS] Les transactions RÉELLES, **REQUISES** (cf. `soldeDetteAujourdhui`). */
    transactions: ReadonlyArray<MouvementDette> | null | undefined,
): T[] {
    return (dettes ?? []).filter(d => !!d).map((d) => {
        const solde = soldeDetteAujourdhui(d, aujourdhuiIso, transactions);
        if (solde === d.balance) return d;
        return { ...d, balance: solde, balanceAsOf: aujourdhuiIso ?? undefined };
    });
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
    aujourdhuiIso: string | null,
    /** [DETTE-VIREMENTS-REELS] Les transactions RÉELLES, **REQUISES** (cf. `soldeDetteAujourdhui`). */
    transactions: ReadonlyArray<MouvementDette> | null | undefined,
): (courant: number) => number {
    // ⚠️ `amortirDettePassee` reconstruit la série ENTIÈRE (du début du prêt à aujourd'hui) et ne
    // dépend PAS du mois interrogé. L'appeler dans la boucle des mois — pire, dans celle des JOURS,
    // plafonnée à 4 000 — donnait O(jours × mois de prêt) par dette : plusieurs MILLIONS d'itérations
    // synchrones pour un prêt de 25 ans, recalculées à chaque invalidation du `useMemo` du graphe
    // (donc à chaque ajout de transaction). On paie la série UNE fois, la boucle ne fait plus
    // qu'indexer. Aucun cache, aucune identité de tableau à surveiller : c'est l'APPELANT qui hisse
    // la préparation hors de sa boucle, et le typecheck l'y oblige.
    const prepares = (dettes ?? []).filter(d => !!d).map(dette => ({ dette, r: amortirDettePassee(dette, moisAujourdhui, aujourdhuiIso, transactions) }));
    return (courant: number): number => prepares.reduce((somme, { dette, r }) => {
        if (r.forme !== 'ok') return somme;
        const index = courant - r.premierMoisAbsolu;
        if (index < 0 || index >= r.soldes.length) return somme;
        return somme + Math.max(0, r.soldes[index] - r.soldeAujourdhui);
    }, 0);
}

/** Variante à un coup, pour un appel ISOLÉ (tests, diagnostic). ⚠️ Elle reconstruit la série à
 *  chaque appel : dans une boucle, utiliser `prepareSupplementAmortiAbsolu`. */
export function supplementAmortiAuMoisAbsolu(
    dettes: ReadonlyArray<DebtAmortissable> | null | undefined,
    courant: number,
    moisAujourdhui: number,
    aujourdhuiIso: string | null,
    /** [DETTE-VIREMENTS-REELS] Les transactions RÉELLES, **REQUISES** (cf. `soldeDetteAujourdhui`). */
    transactions: ReadonlyArray<MouvementDette> | null | undefined,
): number {
    return prepareSupplementAmortiAbsolu(dettes, moisAujourdhui, aujourdhuiIso, transactions)(courant);
}

/**
 * [DEBT-CADENCE-REELLE] Supplément de dette au JOUR — la variante du registre quotidien.
 *
 * ⚠️ Elle ne double PAS la variante mensuelle : pour toute dette sans grille (c'est-à-dire tout ce
 * qui existait avant ce lot), elle rend EXACTEMENT le palier mensuel, en indexant la même série.
 * Seule une dette à versements fixes et à cadence sous-mensuelle descend au jour de son
 * prélèvement — et sa série mensuelle est dérivée de la MÊME grille, donc les deux registres ne
 * peuvent pas diverger.
 */
export function prepareSupplementAmortiParJour(
    dettes: ReadonlyArray<DebtAmortissable> | null | undefined,
    moisAujourdhui: number,
    aujourdhuiIso: string | null,
    /** [DETTE-VIREMENTS-REELS] Les transactions RÉELLES, **REQUISES** (cf. `soldeDetteAujourdhui`). */
    transactions: ReadonlyArray<MouvementDette> | null | undefined,
): (jourIso: string) => number {
    const aujourdhuiMs = jourMs(aujourdhuiIso);
    const prepares = (dettes ?? []).filter(d => !!d).map(dette => ({ dette, r: amortirDettePassee(dette, moisAujourdhui, aujourdhuiIso, transactions) }));
    return (jourIso: string): number => prepares.reduce((somme, { dette, r }) => {
        if (r.forme !== 'ok') return somme;
        // [DETTE-VIREMENTS-REELS] On lit la SOURCE publiée par la série, jamais une seconde
        // décision : grille modélisée ou virements réels, `verseEntre` répond pour les deux.
        const source = r.versements;
        if (source && source.forme !== 'aucune' && aujourdhuiMs !== null) {
            const ms = jourMs(jourIso);
            if (ms === null) return somme;
            return somme + Math.max(0, verseEntre(source, ms, aujourdhuiMs));
        }
        const mois = moisAbsolu(jourIso);
        if (mois === null) return somme;
        const index = mois - r.premierMoisAbsolu;
        if (index < 0 || index >= r.soldes.length) return somme;
        return somme + Math.max(0, r.soldes[index] - r.soldeAujourdhui);
    }, 0);
}

/** Comme `supplementAmortiAuMoisAbsolu`, mais au mois `m` de la simulation — même paire de variantes
 *  que `sumNotYetStartedDebtsAtMonth` / `...AtAbsoluteMonth`, et pour la même raison : `buildPastPrefix`
 *  raisonne en mois de simulation, `dailyPastLedger` en mois absolus. « Aujourd'hui » == le mois 0. */
export function prepareSupplementAmortiAuMois(
    dettes: ReadonlyArray<DebtAmortissable> | null | undefined,
    startYear: number,
    startMonth: number,
    aujourdhuiIso: string | null,
    /** [DETTE-VIREMENTS-REELS] Les transactions RÉELLES, **REQUISES** (cf. `soldeDetteAujourdhui`). */
    transactions: ReadonlyArray<MouvementDette> | null | undefined,
): (m: number) => number {
    const auMoisAbsolu = prepareSupplementAmortiAbsolu(dettes, startYear * 12 + startMonth, aujourdhuiIso, transactions);
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
    aujourdhuiIso: string | null,
    /** [DETTE-VIREMENTS-REELS] Les transactions RÉELLES, **REQUISES** (cf. `soldeDetteAujourdhui`). */
    transactions: ReadonlyArray<MouvementDette> | null | undefined,
): number {
    return prepareSupplementAmortiAuMois(dettes, startYear, startMonth, aujourdhuiIso, transactions)(m);
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
    aujourdhuiIso: string | null,
    /** [DETTE-VIREMENTS-REELS] Les transactions RÉELLES, **REQUISES** (cf. `soldeDetteAujourdhui`). */
    transactions: ReadonlyArray<MouvementDette> | null | undefined,
): { amorties: number; total: number } {
    const liste = (dettes ?? []).filter(d => !!d);
    let amorties = 0;
    for (const d of liste) {
        const r = amortirDettePassee(d, moisAujourdhui, aujourdhuiIso, transactions);
        // ⚠️ « Le modèle est CONSTRUCTIBLE » n'est pas « la courbe BOUGE ». Un prêt commencé ce
        // mois-ci rend une série plate sur le solde réel : `forme === 'ok'` et pourtant zéro
        // supplément partout — annoncer « dettes amorties » y serait faux. On exige donc que le
        // premier point dépasse le solde d'aujourd'hui, c'est-à-dire la condition MÊME qui rend le
        // supplément non nul (`Math.max(0, soldes[i] − soldeAujourdhui)`), pas un proxy.
        // ⚠️ [DETTE-SOLDE-INSTANTANE-FIGE] `r.soldeAujourdhui`, jamais `d.balance` : sur un solde
        // DATÉ les deux diffèrent, et comparer au stocké ferait compter « amortie » une dette dont
        // la seule décroissance est la dérive de l'instantané.
        if (r.forme === 'ok' && r.soldes[0] > r.soldeAujourdhui) amorties++;
    }
    return { amorties, total: liste.length };
}
