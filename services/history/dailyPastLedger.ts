// services/history/dailyPastLedger.ts
//
// [FUTUR-DAILY-PAST-REAL] Le PASSÉ de la courbe Futur, jour par jour, à partir de tes VRAIES données.
//
// ⚠️ POURQUOI CE MODULE EXISTE (demande Marc 2026-08-11 : « je veux aussi que ça marche pour le
// passé, en fonction de la valeur de mes comptes, de mes dépenses »).
// La ventilation au jour (`services/projection/dailyLedger.ts`) INTERPOLE entre deux points
// MENSUELS. C'est la seule chose possible pour le futur — mais pas pour le passé, où l'app connaît
// les dates EXACTES : chaque transaction porte son jour, chaque prix d'actif porte le sien. Étaler
// une moyenne mensuelle sur des journées dont on connaît la vérité, c'est remplacer une mesure par
// un lissage. Ce module remet la mesure à sa place.
//
// ⚠️ CE QUI EST RÉELLEMENT MESURÉ, ET CE QUI NE L'EST PAS.
//   ✅ Liquidités        — remontée depuis le solde actuel en défaisant les transactions datées.
//   ✅ Comptes de placement — Σ détention(t) × prix(t), converti en CAD, par régime.
//   ✅ Revenus / dépenses du jour — les VRAIES transactions de ce jour-là, avec leurs libellés.
//   ✅ Dépôts vs rendement — le dépôt du jour vient des ACHATS datés ; le reste de la variation est
//                            du mouvement de marché. Les deux sont donc de l'information, pas une clé.
//   ⚠️ Équité immobilière — connue à l'ANNÉE (amortissement), pas au jour : palier annuel.
//   ⚠️ Dettes             — chaque dette figée à son niveau ACTUEL depuis son `startDate` propre
//                            (décision Marc, Option A + gating par dette `[PASSE-REEL-DETTE-1]`,
//                            palier MENSUEL même ici — pas de fausse précision au jour) : l'app n'a
//                            pas de courbe d'amortissement (voir `DEBT-AMORTIZATION` au backlog).
//
// ⚠️ CE MODULE NE FABRIQUE JAMAIS UN JOUR. Une date hors de la période où les DEUX reconstructions
// (cash ET placements) ont de la matière ne produit AUCUNE ligne — l'appelant garde alors la valeur
// interpolée, qui est honnête pour ce qu'elle est. Un jour à moitié réel serait pire que les deux.

import { computeRawNetWorth } from '../projection/netWorth';
import { moisAbsolu, sumNotYetStartedDebtsAtAbsoluteMonth, type DebtBalance } from '../projection/debtSchedule';
import { reconstructCashHistoryDaily } from './reconstructCashHistory';
import { reconstructPortfolioHistoryDaily, MAX_DAILY_DAYS_DEFAULT, type MinimalAsset } from './reconstructPortfolioHistory';

/** Les six régimes de placement, dans l'ordre d'affichage du graphe. */
export const PAST_ACCOUNT_KEYS = ['CELI', 'CELIAPP', 'REER', 'REEE', 'NonReg', 'Crypto'] as const;
export type PastAccountKey = (typeof PAST_ACCOUNT_KEYS)[number];

export interface MinimalPastTransaction {
    date: string;
    amount: number;
    payee?: string;
    isDuplicate?: boolean;
    isTransfer?: boolean;
}

/** Résultat de la reconstruction : les journées, PLUS ce que l'ancre n'a pas su placer.
 *  ⚠️ `undatedTotal` / `flowsAfterNowDate` viennent de `reconstructCashHistoryDaily` : l'ancre
 *  (`computeStartingCash`) compte TOUTE transaction, y compris celles datées au MOIS seul ou datées
 *  APRÈS aujourd'hui — que la série quotidienne, elle, ne peut pas placer sans inventer un jour.
 *  Un montant non nul décale TOUT le niveau passé d'autant (mesuré −2 000 $ à l'audit). Le panneau
 *  qui affichait cet avertissement a été retiré (`[FUTUR-DAILY-INFOBULLE-ONLY]`) : c'est désormais
 *  au BANDEAU de la vue au jour de le dire — le taire transformerait un décalage connu et mesurable
 *  en niveau « propre » que rien ne conteste. Le correctif de FOND (retrancher ces flux de l'ancre)
 *  touche `computeStartingCash`, donc le raccord au présent : plan-first, ticket au BACKLOG. */
export interface DailyPastLedgerResult {
    rows: DailyPastRow[];
    /** Σ des flux datés au MOIS seul (comptés par l'ancre, plaçables nulle part). */
    undatedTotal: number;
    /** Σ des flux datés APRÈS aujourd'hui (dans l'ancre, pas encore dans le solde). */
    flowsAfterNowDate: number;
    /**
     * Première date de la fenêtre demandée que le plafond a EMPÊCHÉ de reconstruire, ou `null`.
     *
     * ⚠️ [PASSE-REEL-CAP-400J 2026-08-14] Ce champ existe parce que son absence a coûté cher.
     * L'ancien code affirmait en commentaire que « l'appelant voit la troncature à la longueur » —
     * or aucun appelant ne comparait quoi que ce soit, et une coupure au milieu de la fenêtre
     * visible restait totalement muette : les jours sautés ne sont ni tracés ni cliquables.
     * Un trou silencieux dans une courbe est pire qu'une plage plus courte annoncée.
     */
    truncatedFrom: string | null;
}

/** Une journée du passé, reconstruite. Les clés reprennent EXACTEMENT celles du point de graphe :
 *  l'appelant n'a qu'à les recouvrir, et l'infobulle existante les affiche sans code spécifique. */
export interface DailyPastRow {
    /** Date ISO `YYYY-MM-DD`. */
    date: string;
    Liquidites: number;
    CELI: number; CELIAPP: number; REER: number; REEE: number; NonReg: number; Crypto: number;
    Immobilier: number;
    DettesNonImmo: number;
    NetWorth: number;
    /** Entrées d'argent du jour (transactions positives). */
    Income: number;
    /** Sorties du jour, en valeur POSITIVE (convention du moteur : `Expenses` est un coût). */
    Expenses: number;
    Savings: number;
    /** Flux net de liquidités du jour (= Income − Expenses, signé). */
    NetTransferLiquid: number;
    /** Achats de titres datés ce jour-là, par régime (CAD). */
    deposits: Record<PastAccountKey, number>;
    /** Variation de valeur non expliquée par les achats = mouvement de marché (CAD). */
    growth: Record<PastAccountKey, number>;
    /** Libellés des mouvements réels du jour (payees), pour l'infobulle. */
    labels: string[];
    /**
     * [FUTUR-INFOBULLE-MONTANTS] Les mêmes mouvements que `labels`, AVEC leur montant — demande de
     * Marc (2026-08-17), bornée au PASSÉ (le futur n'itemise pas ses dépenses).
     * ⚠️ `labels` en est DÉRIVÉ, pas accumulé en parallèle : deux listes remplies séparément
     * finissent par diverger, et l'infobulle afficherait des noms sans leurs montants.
     */
    movements: Array<{ payee: string; amount: number }>;
    /**
     * Nombre TOTAL de mouvements du jour, avant plafonnement d'affichage.
     * ⚠️ Existe parce que le plafond de 6 était SILENCIEUX : avec des montants affichés, Marc
     * lirait six dépenses en croyant les avoir toutes. Même classe que `truncatedFrom` — une
     * troncature muette est pire qu'une plage annoncée.
     */
    movementsTotal: number;
    /** Au moins un mouvement réel ce jour-là. */
    isDated: boolean;
    /** Âge du prix le plus vieux composant le point — un plateau long n'est pas une valeur stable. */
    priceAgeMaxDays: number;
    /** Au moins un titre valorisé au prix ACTUEL faute d'historique : le point est une estimation. */
    hasEstimatedPrice: boolean;
}

export interface BuildDailyPastInput {
    /** Bornes de la fenêtre regardée (ISO). Le résultat est borné à `min(to, today)`. */
    from: string;
    to: string;
    /** Aujourd'hui (ISO local) — sépare le reconstruit du projeté. */
    today: string;
    transactions: ReadonlyArray<MinimalPastTransaction>;
    /** Solde de liquidités AUJOURD'HUI — l'ancre d'où l'on remonte. */
    currentCash: number;
    assets: MinimalAsset[];
    fx: Record<string, number>;
    /** Équité immobilière par ANNÉE (déjà nette d'hypothèque). */
    equityByYear: ReadonlyMap<number, number>;
    /** Dettes hors hypothèque au niveau ACTUEL (Option A). */
    currentDebtNonImmo: number;
    /** Dettes hors hypothèque (store, tableau FRAIS) : sert UNIQUEMENT à déterminer, en palier
     *  MENSUEL, quelles dettes exclure de `currentDebtNonImmo` pour un jour où elles n'existaient
     *  pas encore (`sumNotYetStartedDebtsAtAbsoluteMonth`). */
    debts: ReadonlyArray<DebtBalance>;
    /** Garde-fou de volume : au-delà, on ne reconstruit pas (le graphe ne va pas jusque-là). */
    maxDays?: number;
}

const DAY_MS = 86_400_000;

/**
 * Nombre de mouvements RETENUS pour l'affichage d'une journée (l'infobulle en liste quelques-uns,
 * pas 40). ⚠️ Ce plafond ne borne QUE `movements` : `movementsTotal` compte tout, pour que
 * l'infobulle puisse dire « +N autres » au lieu de s'arrêter en silence.
 */
const MAX_MOVEMENTS_SHOWN = 6;

const emptyByAccount = (): Record<PastAccountKey, number> => ({
    CELI: 0, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0,
});

/** Régime d'un actif, replié sur `NonReg` — MÊME table que `reconstructPortfolioHistoryDaily`
 *  (marge et « autre » y sont déjà rangés en non-enregistré). */
function accountKeyOf(a: MinimalAsset): PastAccountKey {
    switch (a.accountType) {
        case 'CELI': return 'CELI';
        case 'CELIAPP': return 'CELIAPP';
        case 'REER': return 'REER';
        case 'REEE': return 'REEE';
        case 'CRYPTO': return 'Crypto';
        default: return 'NonReg';
    }
}

function fxToCad(currency: string, fx: Record<string, number>): number {
    if (!currency || currency === 'CAD') return 1;
    const r = fx[currency];
    return typeof r === 'number' && r > 0 ? r : 1;
}

/**
 * Achats datés d'un jour donné, par régime, en CAD.
 *
 * ⚠️ On valorise l'achat à SON prix d'achat (`purchase.price`), pas au cours du jour : c'est
 * l'argent réellement SORTI du compte pour entrer dans le titre. C'est ce qui rend la ligne
 * « Dépôts » de l'infobulle exacte, et donc la ligne « Rendement » (le reste) exacte aussi.
 */
export function depositsOnDay(
    assets: ReadonlyArray<MinimalAsset>,
    fx: Record<string, number>,
    day: string,
): Record<PastAccountKey, number> {
    const out = emptyByAccount();
    for (const a of assets) {
        const rate = fxToCad(a.currency, fx);
        const key = accountKeyOf(a);
        for (const p of a.purchases ?? []) {
            if (!p?.date || p.date.slice(0, 10) !== day) continue;
            const qty = Number(p.quantity);
            const price = Number(p.price);
            if (!Number.isFinite(qty) || !Number.isFinite(price)) continue;
            out[key] += qty * price * rate;
        }
    }
    return out;
}

/**
 * Reconstruit le passé JOUR PAR JOUR sur la fenêtre demandée.
 *
 * Rend `[]` quand il n'y a pas de matière (aucune transaction, aucun actif, fenêtre entièrement
 * future) — l'appelant garde alors ce qu'il avait, plutôt qu'une ligne inventée.
 */
export function buildDailyPastLedger(input: BuildDailyPastInput): DailyPastLedgerResult {
    const { from, to, today, transactions, currentCash, assets, fx, equityByYear, currentDebtNonImmo, debts } = input;
    // ⚠️ [PASSE-REEL-CAP-400J] Défaut PARTAGÉ avec la reconstruction des placements. Deux `?? 400`
    // indépendants, c'était deux plafonds à faire évoluer ensemble — et donc un jour à désynchroniser.
    const maxDays = input.maxDays ?? MAX_DAILY_DAYS_DEFAULT;
    // [PASSE-REEL-DETTE-1, CRITIQUE corrigé revue #687] Référence « aujourd'hui » pour le gating :
    // une dette n'est retranchée du total que si elle est DÉJÀ active aujourd'hui (sinon elle n'a
    // jamais fait partie de `currentDebtNonImmo` — cf commentaire dédié dans `debtSchedule.ts`).
    // `?? Number.POSITIVE_INFINITY` en repli défensif (jamais atteint — `today` est une entrée ISO
    // garantie par l'appelant) neutralise seulement CE garde-fou, sans réintroduire le bug d'origine.
    const moisAujourdhui = moisAbsolu(today) ?? Number.POSITIVE_INFINITY;

    // Borne HAUTE à aujourd'hui : au-delà, ce n'est plus du reconstruit. `reconstructPortfolioHistoryDaily`
    // produirait pourtant des points (elle reconduit le dernier prix connu) — des placements PLATS
    // présentés comme mesurés, à côté d'une projection qui, elle, croît. Le même défaut avait déjà
    // été corrigé une fois dans le panneau quotidien ; on ne le réintroduit pas ici.
    const NONE: DailyPastLedgerResult = { rows: [], undatedTotal: 0, flowsAfterNowDate: 0, truncatedFrom: null };
    const end = to < today ? to : today;
    if (!from || !end || end < from) return NONE;

    const cash = reconstructCashHistoryDaily(transactions, currentCash, today);
    // ⚠️ Même quand AUCUNE ligne n'est produite, les caveats d'ancre sont rendus : un historique
    // fait UNIQUEMENT de transactions au mois seul a un `undatedTotal` non nul et zéro point.
    if (cash.points.length === 0) return { rows: [], undatedTotal: cash.undatedTotal, flowsAfterNowDate: cash.flowsAfterNowDate, truncatedFrom: null };
    const cashByDate = new Map(cash.points.map((p) => [p.date, p]));

    const invStart = from < (cash.firstDate ?? from) ? (cash.firstDate ?? from) : from;
    const inv = reconstructPortfolioHistoryDaily(assets, fx, invStart, end, { maxDays });
    const invByDate = new Map(inv.map((p) => [p.date, p]));
    if (invByDate.size === 0) return { rows: [], undatedTotal: cash.undatedTotal, flowsAfterNowDate: cash.flowsAfterNowDate, truncatedFrom: null };

    // Mouvements réels du jour : MÊME base d'exclusion que l'ancre `computeStartingCash`
    // (`isDuplicate` = artefact, `isTransfer` = neutre) — sinon les deux bouts de la même courbe
    // ne partagent pas leur base et divergent (classe PH4D).
    const incomeByDay = new Map<string, number>();
    const expenseByDay = new Map<string, number>();
    const movementsByDay = new Map<string, Array<{ payee: string; amount: number }>>();
    const movementsCount = new Map<string, number>();
    for (const t of transactions) {
        if (!t?.date || t.date.length < 10 || !Number.isFinite(t.amount)) continue;
        if (t.isDuplicate || t.isTransfer) continue;
        const d = t.date.slice(0, 10);
        if (t.amount >= 0) incomeByDay.set(d, (incomeByDay.get(d) ?? 0) + t.amount);
        else expenseByDay.set(d, (expenseByDay.get(d) ?? 0) + Math.abs(t.amount));
        // ⚠️ [finding silent-failure #644] Le TOTAL et la LISTE AFFICHÉE ne se comptent pas au même
        // endroit, et c'est le correctif. Les deux vivaient sous le même `if (t.payee)` : une
        // transaction SANS description entrait bien dans `Income`/`Expenses` du jour mais pas dans
        // `movementsCount` — donc `movementsTotal === movements.length`, donc « +N autres » ne
        // s'affichait JAMAIS, et Marc lisait la liste en croyant l'avoir toute. Exactement la
        // troncature silencieuse que ce champ existe pour supprimer, réintroduite par un autre
        // déclencheur. Cas réel : `mcp/ingest/applyDocument.ts` écrit `payee: tx.payee || ''`.
        movementsCount.set(d, (movementsCount.get(d) ?? 0) + 1);
        if (t.payee) {
            const slot = movementsByDay.get(d) ?? [];
            if (slot.length < MAX_MOVEMENTS_SHOWN) slot.push({ payee: t.payee, amount: t.amount });
            movementsByDay.set(d, slot);
        }
    }

    const out: DailyPastRow[] = [];
    const startMs = Date.parse(`${from}T00:00:00Z`);
    const endMs = Date.parse(`${end}T00:00:00Z`);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return { rows: [], undatedTotal: cash.undatedTotal, flowsAfterNowDate: cash.flowsAfterNowDate, truncatedFrom: null };

    let lastMs: number | null = null;
    for (let ms = startMs; ms <= endMs && out.length < maxDays; ms += DAY_MS) {
        lastMs = ms;
        const date = new Date(ms).toISOString().slice(0, 10);
        const c = cashByDate.get(date);
        const i = invByDate.get(date);
        // ⚠️ Les DEUX sont exigés. Un jour avec le cash mais sans les placements donnerait un
        // patrimoine amputé de tout le portefeuille — un chiffre parfaitement crédible et faux.
        if (!c || !i) continue;

        const prev = invByDate.get(new Date(ms - DAY_MS).toISOString().slice(0, 10));
        const dep = depositsOnDay(assets, fx, date);
        const growth = emptyByAccount();
        if (prev) {
            for (const k of PAST_ACCOUNT_KEYS) growth[k] = i[k] - prev[k] - dep[k];
        }

        const immo = equityByYear.get(Number(date.slice(0, 4))) ?? 0;
        const income = incomeByDay.get(date) ?? 0;
        const expenses = expenseByDay.get(date) ?? 0;
        // [PASSE-REEL-DETTE-1] Palier MENSUEL volontaire (cf en-tête) : `moisAbsolu` ne retient que
        // l'année/le mois de `date`, jamais le jour. `?? Number.POSITIVE_INFINITY` en repli défensif
        // sur LE JOUR (jamais atteint en pratique — `date` vient toujours de notre propre boucle ISO)
        // fait qu'AUCUNE dette n'est plus jamais 'a-venir' à ce point → delta nul → repli sur
        // `currentDebtNonImmo` inchangé. `Math.max(0, …)` : voir le commentaire de
        // `sumNotYetStartedDebtsAtAbsoluteMonth` (le delta utilise le solde BRUT contre un total
        // post-amortissement — borne le résidu, une dette n'étant jamais négative).
        const debtNonImmo = Math.max(0, currentDebtNonImmo
            - sumNotYetStartedDebtsAtAbsoluteMonth(debts, moisAbsolu(date) ?? Number.POSITIVE_INFINITY, moisAujourdhui));

        out.push({
            date,
            Liquidites: c.cash,
            CELI: i.CELI, CELIAPP: i.CELIAPP, REER: i.REER, REEE: i.REEE, NonReg: i.NonReg, Crypto: i.Crypto,
            Immobilier: immo,
            DettesNonImmo: debtNonImmo,
            // SOURCE UNIQUE : `computeRawNetWorth` via le helper du passé — jamais une copie locale
            // de la formule. `Immobilier` est DÉJÀ net d'hypothèque (ne jamais re-soustraire).
            NetWorth: Math.round(computeRawNetWorth({
                liquid: c.cash,
                celi: i.CELI, celiapp: i.CELIAPP, reer: i.REER, nonReg: i.NonReg,
                crypto: i.Crypto, reee: i.REEE,
                realEstateEquity: immo,
                // [ENG-W5-BUSINESS-OFFBALANCE] Le grand livre du PASSÉ ne reconstruit aucune
                // entreprise privée : il n'y a ni cours, ni relevé, ni transaction d'où la tirer.
                // 0 EXPLICITE plutôt qu'un champ oublié — le `Record` exhaustif de `NetWorthParts`
                // force ce choix à être écrit, ce qui est exactement son rôle.
                privateBusinessValue: 0,
                liquidDebt: 0, smithManoeuvreDebt: 0, activeDebtsTotal: debtNonImmo,
            })),
            Income: income,
            Expenses: expenses,
            Savings: income - expenses,
            NetTransferLiquid: income - expenses,
            deposits: dep,
            growth,
            movements: movementsByDay.get(date) ?? [],
            movementsTotal: movementsCount.get(date) ?? 0,
            // DÉRIVÉ : une seule source, donc pas de dérive possible entre noms et montants.
            labels: (movementsByDay.get(date) ?? []).map((mv) => mv.payee),
            isDated: c.isDated || income !== 0 || expenses !== 0,
            priceAgeMaxDays: i.priceAgeMaxDays,
            hasEstimatedPrice: i.hasEstimatedPrice,
        });
    }
    // ⚠️ La boucle s'arrête soit à `endMs` (fenêtre couverte), soit sur `out.length < maxDays`
    //   (plafond atteint). Dans le SECOND cas seulement, il reste de la fenêtre non reconstruite —
    //   et c'est ce jour-là que l'utilisateur voit sa courbe s'interrompre sans explication.
    //   `lastMs` est le dernier jour EXAMINÉ, pas le dernier jour ÉMIS : un jour peut être sauté
    //   faute de données (`!c || !i`) sans que le plafond y soit pour quoi que ce soit.
    const truncatedFrom = lastMs !== null && lastMs < endMs
        ? new Date(lastMs + DAY_MS).toISOString().slice(0, 10)
        : null;
    return { rows: out, undatedTotal: cash.undatedTotal, flowsAfterNowDate: cash.flowsAfterNowDate, truncatedFrom };
}
