// services/transactions/duplicateDetection.ts
//
// [TX-DUPLICATES] Détection de transactions en double — module PUR (aucun état, aucun effet de bord).
//
// Pourquoi ça existe (constat 2026-07-29) : le champ `Transaction.isDuplicate` était RESPECTÉ partout
// (exclu de `computeStartingCash`, du Budget, des revenus, du patrimoine) mais **rien ne le mettait
// jamais à `true`** — `parseBankCsv` l'initialise à `false` et aucun code ne le change ensuite. Le
// filtre « afficher les doublons » de l'onglet Transactions était du code mort (`_setShowDuplicates`
// jamais appelé). Autrement dit : la machinerie d'exclusion existait, sans personne pour l'alimenter.
//
// ⚠️ ON MARQUE, ON NE SUPPRIME PAS. Décision déjà prise dans l'ADR « Suppressions via MCP/IA » : le
// cash est DÉRIVÉ des transactions (`computeStartingCash`), donc une suppression déplacerait le solde
// ET le budget réel en silence. Marquer `isDuplicate` exclut la ligne de TOUS les calculs — c'est
// fonctionnellement l'effet recherché — sans détruire de donnée, et c'est réversible.
//
// ⚠️ AUCUN MARQUAGE AUTOMATIQUE. La détection PROPOSE, l'utilisateur DISPOSE. Deux cafés identiques
// le même jour sont un vrai faux positif, et marquer à tort retire de l'argent réel des calculs.

import type { Transaction } from '../../types';

export interface DuplicateMember {
    id: number;
    date: string;
    payee: string;
    amount: number;
    category: string;
    accountName?: string;
}

export interface DuplicateGroup {
    /** Clé stable du groupe (montant en cents + date de référence). */
    key: string;
    /** Montant partagé par tous les membres. */
    amount: number;
    /** Membres, triés par id croissant (donc par ordre d'import). */
    members: DuplicateMember[];
    /**
     * Celui qu'on suggère de GARDER : le plus petit id, c'est-à-dire le premier importé — celui qui
     * est dans l'app depuis le plus longtemps, donc le plus susceptible d'être déjà catégorisé et
     * vérifié. Pour un doublon né d'une nouvelle source (Fintable), c'est bien l'historique manuel
     * qui est conservé.
     */
    suggestedKeepId: number;
    /** Les autres — proposés au marquage, jamais marqués d'office. */
    suggestedMarkIds: number[];
    /**
     * `true` si les libellés diffèrent entre membres : signal fort que le doublon vient de DEUX
     * SOURCES différentes (relevé PDF vs API), le cas que la dédup par `payee` ne peut pas voir.
     */
    payeesDiffer: boolean;
    /**
     * [TX-DUPLICATES-BRUIT] Confiance du groupe. MESURÉE sur les transactions réelles de Marc
     * (01/07 → 14/09, `scripts/mesureDoublons.ts`) : le critère « montant + date » seul groupait
     * une dépense ronde chez un marchand avec un paiement de carte de crédit ET un Interac — 3 groupes sur 10 étaient
     * des COLLISIONS DE MONTANT. Le libellé reste HORS du critère de REGROUPEMENT (sinon on reperd
     * les doublons à deux sources, cf. le JSDoc de `findDuplicateGroups`), mais il CLASSE le
     * résultat, et l'UI ne pré-coche que ce qui est `haute` ou `moyenne`.
     *
     * · `haute`   — même marchand normalisé ET même jour. C'est la signature mesurée chez Marc
     *               (sept lignes identiques du même marchand le même jour, dont il a confirmé que **2 seulement**
     *               étaient de vrais achats).
     * · `moyenne` — même marchand normalisé, dates proches mais différentes (autorisation vs
     *               comptabilisation, ou deux sources d'import).
     * · `faible`  — les marchands NE correspondent PAS. Presque toujours une collision de montant ;
     *               gardé pour ne rien perdre, jamais proposé d'office.
     */
    confiance: 'haute' | 'moyenne' | 'faible';
    /** `true` si les dates ne sont pas toutes identiques (rapprochement à tolérance). */
    datesDiffer: boolean;
}

interface DetectDuplicatesOptions {
    /**
     * Tolérance en JOURS sur l'écart de date (0 = date strictement identique). Utile car une même
     * dépense peut être datée du jour d'autorisation d'un côté et du jour de comptabilisation de
     * l'autre. Au-delà de ~3 jours le bruit dépasse le signal.
     */
    dayToleranceDays?: number;
}

const DAY_MS = 86_400_000;

/** Cents entiers — comparer des flottants à l'égalité manquerait des doublons évidents. */
function cents(amount: number): number {
    return Math.round(amount * 100);
}

function dayNumber(isoDate: string): number | null {
    const t = Date.parse(`${isoDate}T00:00:00Z`);
    return Number.isFinite(t) ? Math.round(t / DAY_MS) : null;
}

function normalizePayee(payee: string): string {
    return payee.trim().toLowerCase();
}

/**
 * Jetons qui n'identifient AUCUN marchand : ils décrivent le CANAL du mouvement (chèque, virement,
 * paiement de facture) et préfixent le bénéficiaire réel, exactement comme les passerelles de
 * paiement. Mesuré le 2026-09-15 sur la vraie forme des libellés bancaires québécois : sans ce
 * retrait, `Interac e-Transfer to /Alex /` et `… /Sam /` rendaient tous deux `interac e`,
 * `Bill payment - Hydro Quebec` et `… Bell Canada` tous deux `bill payment`, `Ch 4521` et
 * `Ch 9981` tous deux `ch` — donc DEUX virements distincts au même montant le même jour étaient
 * classés `haute` et PRÉ-COCHÉS. C'est la régression money-critical que ce lot corrige, une marche
 * plus bas : `isDuplicate` retire la ligne du solde, du budget ET des revenus.
 */
const JETONS_CANAL = /\b(interac|virement|transfert|transfer|cheque|chq|ch|paiement|payment|bill|facture|retrait|depot|prelevement|preauth|preautorise|to|from|au|aux|and|the)\b/g;

/**
 * [TX-DUPLICATES-BRUIT] Clé MARCHAND servant à CLASSER un groupe de doublons candidats.
 *
 * ⚠️ Homonyme volontairement écarté : `merchantProfile.merchantKey` existe et fait un AUTRE
 * travail — identifier un abonnement récurrent, en jetant tout jeton non purement alphabétique.
 * Elle ne connaît ni les passerelles de paiement (`GOOGLE *Cell to Singul` ≠ `Cell To Singul`,
 * mesuré) ni les jetons de canal ci-dessus. Les deux fonctions ne sont pas interchangeables, d'où
 * un nom distinct plutôt qu'un second `merchantKey` exporté : un même nom pour deux contrats rend
 * le code introuvable par un seul grep (`UN-ALIAS-DEPRECIE-REND-LE-CODE-INTROUVABLE-PAR-UN-SEUL-NOM`).
 *
 * Normalisation agressive, pensée pour rapprocher les DEUX sources d'import réelles — le relevé en
 * capitales avec n° de succursale (`MCDONALD'S 00000`) et le libellé nettoyé de Fintable
 * (`McDonald's`). Mesuré : les deux rendent `mcdonald`, donc la paire cross-source
 * garde une confiance haute au lieu d'être noyée.
 *
 * ⚠️ Elle ne sert qu'à CLASSER, jamais à regrouper : elle est volontairement imparfaite
 * (`UBER CANADA/UBEREATS` → `uber ubereats` ≠ `Uber Eats` → `uber eats`), et l'utiliser comme
 * critère de regroupement perdrait en silence exactement les doublons à deux sources que le
 * détecteur existe pour attraper. Un groupe qu'elle n'apparie pas descend en `faible` — il reste
 * visible, il n'est simplement plus pré-coché. Une clé VIDE (il ne restait que du canal, comme
 * `Ch 4521`) vaut « je ne sais pas » et descend donc aussi en `faible`.
 */
export function cleMarchandPourConfiance(payee: string): string {
    return payee
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[*#]/g, ' ')
        // Passerelles de paiement : elles préfixent le VRAI marchand et ne l'identifient pas.
        .replace(/\b(google|sq|sp|paypal|pp)\b/g, ' ')
        // Canal du mouvement (chèque, Interac, paiement de facture) : même raison, cf. JETONS_CANAL.
        .replace(JETONS_CANAL, ' ')
        // N° de succursale / de terminal : `MCDONALD'S 00001` et `MCDONALD'S 00002` sont la même
        // enseigne pour ce classement.
        .replace(/\b\d{3,}\b/g, ' ')
        .replace(/\b(inc|ltd|llc|co|canada|quebec|qc|ns|halifax|montreal|rio|de|du|la|le|les)\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        // Un jeton d'UN caractère ne nomme aucun marchand (l'apostrophe de `McDonald's`, le `e` de
        // `e-Transfer`) et occuperait une des deux places retenues.
        .split(' ').filter((t) => t.length > 1).slice(0, 2).join(' ');
}

/**
 * Regroupe les transactions qui sont probablement la MÊME dépense réelle.
 *
 * Critère : **même montant exact** (au cent) et dates séparées d'au plus `dayToleranceDays`.
 * Le libellé n'entre PAS dans le critère — c'est délibéré : c'est précisément quand les libellés
 * diffèrent (deux sources d'import) que la déduplication existante (`txnKey`, qui inclut le payee)
 * laisse passer le doublon. Le libellé est en revanche RENDU, pour que l'humain juge.
 *
 * Sont ignorées : les transactions déjà marquées en doublon (rien à re-proposer) et celles dont le
 * montant ou la date sont inexploitables (on ne devine pas sur une donnée cassée).
 */
export function findDuplicateGroups(
    transactions: readonly Transaction[],
    options: DetectDuplicatesOptions = {},
): DuplicateGroup[] {
    const tolerance = Math.max(0, Math.floor(options.dayToleranceDays ?? 0));

    // Regroupement par montant exact : deux transactions de montants différents ne peuvent pas être
    // la même dépense, et ce partitionnement garde le coût linéaire sur ~2000 transactions.
    const byAmount = new Map<number, Array<{ tx: Transaction; day: number }>>();
    for (const tx of transactions) {
        if (!tx || tx.isDuplicate) continue;
        if (typeof tx.amount !== 'number' || !Number.isFinite(tx.amount)) continue;
        const day = dayNumber(tx.date);
        if (day === null) continue;
        const bucket = byAmount.get(cents(tx.amount));
        if (bucket) bucket.push({ tx, day });
        else byAmount.set(cents(tx.amount), [{ tx, day }]);
    }

    const groups: DuplicateGroup[] = [];
    for (const [amountCents, bucket] of byAmount) {
        if (bucket.length < 2) continue;
        // Tri par date puis id : le regroupement glouton ci-dessous suppose un ordre chronologique.
        bucket.sort((a, b) => (a.day - b.day) || (a.tx.id - b.tx.id));

        let current: Array<{ tx: Transaction; day: number }> = [];
        let anchorDay = -Infinity;
        const flush = (): void => {
            if (current.length >= 2) groups.push(buildGroup(amountCents, current));
            current = [];
        };
        for (const entry of bucket) {
            if (current.length === 0 || entry.day - anchorDay <= tolerance) {
                if (current.length === 0) anchorDay = entry.day;
                current.push(entry);
            } else {
                flush();
                anchorDay = entry.day;
                current.push(entry);
            }
        }
        flush();
    }

    // [TX-DUPLICATES-BRUIT] La CONFIANCE d'abord, le montant ensuite. Trier sur le seul montant
    // plaçait une collision à 100 $ au-dessus d'un vrai doublon de quelques dollars — et c'est la première
    // ligne d'un panneau qui décide s'il est cru ou ignoré.
    const rang = { haute: 0, moyenne: 1, faible: 2 } as const;
    return groups.sort(
        (a, b) => rang[a.confiance] - rang[b.confiance] || Math.abs(b.amount) - Math.abs(a.amount),
    );
}

function buildGroup(amountCents: number, entries: Array<{ tx: Transaction; day: number }>): DuplicateGroup {
    const sorted = [...entries].sort((a, b) => a.tx.id - b.tx.id);
    const members: DuplicateMember[] = sorted.map(({ tx }) => ({
        id: tx.id,
        date: tx.date,
        payee: tx.payee ?? '',
        amount: tx.amount,
        category: tx.category ?? '',
        ...(tx.accountName ? { accountName: tx.accountName } : {}),
    }));
    const keepId = members[0].id;
    const payees = new Set(members.map((m) => normalizePayee(m.payee)));
    const dates = new Set(members.map((m) => m.date));
    const marchands = new Set(members.map((m) => cleMarchandPourConfiance(m.payee)));
    const memeMarchand = marchands.size === 1 && [...marchands][0] !== '';
    const confiance: DuplicateGroup['confiance'] = !memeMarchand
        ? 'faible'
        : dates.size === 1 ? 'haute' : 'moyenne';
    return {
        key: `${amountCents}|${members[0].date}|${keepId}`,
        amount: sorted[0].tx.amount,
        members,
        suggestedKeepId: keepId,
        suggestedMarkIds: members.slice(1).map((m) => m.id),
        payeesDiffer: payees.size > 1,
        datesDiffer: dates.size > 1,
        confiance,
    };
}

/**
 * Marque les ids donnés comme doublons. PUR : rend un nouveau tableau, ne mute rien.
 * Un id inconnu est simplement sans effet (pas d'erreur : l'UI peut envoyer une sélection périmée).
 */
export function markTransactionsAsDuplicate(
    transactions: readonly Transaction[],
    idsToMark: readonly number[],
): Transaction[] {
    if (idsToMark.length === 0) return [...transactions];
    const targets = new Set(idsToMark);
    return transactions.map((tx) => (targets.has(tx.id) && !tx.isDuplicate ? { ...tx, isDuplicate: true } : tx));
}

/** Retire la marque de doublon (annulation d'un marquage à tort). PUR. */
export function unmarkTransactionsAsDuplicate(
    transactions: readonly Transaction[],
    idsToUnmark: readonly number[],
): Transaction[] {
    if (idsToUnmark.length === 0) return [...transactions];
    const targets = new Set(idsToUnmark);
    return transactions.map((tx) => (targets.has(tx.id) && tx.isDuplicate ? { ...tx, isDuplicate: false } : tx));
}

/** Résumé chiffré pour l'UI : combien de groupes, de lignes concernées, et quel montant en jeu. */
export function summarizeDuplicates(groups: readonly DuplicateGroup[]): {
    groupCount: number;
    redundantCount: number;
    redundantAmount: number;
} {
    let redundantCount = 0;
    let redundantAmount = 0;
    for (const g of groups) {
        redundantCount += g.suggestedMarkIds.length;
        redundantAmount += g.amount * g.suggestedMarkIds.length;
    }
    return { groupCount: groups.length, redundantCount, redundantAmount };
}
