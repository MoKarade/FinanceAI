// services/history/portfolioSessionMetrics.ts
//
// [HUB-PLACEMENTS-SEANCE] Variation des PLACEMENTS sur la dernière séance et sur 7 jours, en
// DOLLARS et en pourcentage — pour la carte FinanceAI du hub (demande Marc 2026-08-19).
//
// ⚠️ RIEN N'EST RECALCULÉ ICI. `buildMarketData` produit déjà la série DATÉE de la valeur du
// portefeuille en CAD (`row.TOTAL`, détention DCA × clôtures natives × FX), et
// `seriesReturnEndpoints` sait déjà choisir les deux bornes d'une période AVEC ses règles de refus.
// Ce module ne fait que les COMBINER et exposer un objet qui se refuse au lieu de mentir.
//
// ═══ POURQUOI « SÉANCE » ET PAS « AUJOURD'HUI » ═══
//
// `Asset.priceHistory` n'avance QUE quand l'app navigateur s'ouvre : `hydrateAssetHistories` est
// appelé depuis `App.tsx` au boot, pour les titres dont `lastHistorySync > 24 h`. Le cron serveur
// (`mcp/refreshPrices.ts`, HUB-REFRESH-CRON) ne rafraîchit QUE `currentPrice` — jamais l'historique
// daté. Et les marchés ferment les week-ends et jours fériés. La date de référence est donc, en
// pratique, presque toujours une séance PASSÉE.
//
// Appeler ça « aujourd'hui » serait faux dans le cas GÉNÉRAL, pas dans un cas limite. On expose
// `refDate` et l'appelant construit un libellé qui porte la date. Le hub affiche ce qu'on lui donne :
// c'est ici que se joue l'honnêteté, pas à l'écran.
//
// ═══ LES TROIS REFUS (chacun a son test) ═══
//
//  1. **Série absente ou trop courte** (< 2 points datés) → `null`. Aucun titre avec historique,
//     ou un seul point : il n'y a pas de variation, il y a une valeur.
//  2. **Référence PÉRIMÉE** — `refDate` plus vieille que `maxStaleDays` (défaut 3 jours civils) →
//     `null`. Un prix de la semaine dernière ne fait pas un rendement de séance. Le seuil couvre le
//     week-end long (vendredi → mardi = 4 jours civils… d'où 3 jours OUVRÉS ? non : on compte en
//     JOURS CIVILS depuis la clôture, et 3 jours laisse passer un samedi/dimanche normal —
//     vendredi close + samedi + dimanche = lundi à J+3. Un lundi férié pousse à J+4 → refus, et
//     c'est le comportement voulu : mieux vaut une carte muette qu'un « rendement du jour » de
//     vendredi dernier).
//  3. **Bornes SYNTHÉTIQUES** — quand les chandelles d'un titre s'arrêtent mais que sa quote live
//     est fraîche, `buildMarketData` raccorde ses derniers jours au `currentPrice` et TRACE le
//     raccord dans `syntheticTailKeys`. Deux bornes ainsi figées donnent un 0,00 % techniquement
//     exact mais TROMPEUR : donnée figée ≠ marché plat.
//     ⚠️ Deux pièges se sont succédé ici, et le second est le vrai.
//     (a) `syntheticTailKeys` est indexé PAR SYMBOLE (`[date, symbole]`) — jamais par `TOTAL`, qui
//         mêle réel et synthétique. Passer naïvement `isSynthetic` à `seriesReturnEndpoints` pour la
//         clé `TOTAL` donne une garde qui NE PEUT JAMAIS SE DÉCLENCHER. Mon premier jet le faisait ;
//         le test l'a attrapé.
//     (b) Même relevée au niveau de l'agrégat, une règle bâtie sur `syntheticTailKeys` rate le cas
//         le plus COURANT : `priceAt` REPORTE le dernier close jusqu'à 7 jours (`STALE_PRICE_DAYS`)
//         SANS rien marquer. Deux jours consécutifs de report donnent le même 0,00 % trompeur, et
//         aucune clé synthétique n'existe pour le dire.
//     D'où la règle retenue, qui ne dépend d'aucun détail interne de `buildMarketData` : une date
//     est « entièrement figée » si AUCUN titre portant une colonne ce jour-là n'avait de VRAIE
//     clôture à cette date (on le lit dans `priceHistory`, la source). Si un seul titre en avait
//     une, le mouvement est réel et on garde le chiffre — même arbitrage que `seriesReturnPct` au
//     niveau du titre. Sur une série quotidienne normale, la règle ne se déclenche jamais.
//
// ⚠️ Et un quatrième refus IMPLICITE, qui est un piège de couplage : `buildMarketData` DÉCIME sa
// sortie à 500 points par défaut (pour Recharts). La décimation préserve délibérément les DEUX
// derniers points — donc « 24H » survit — mais PAS la densité au-delà : la baseline « 7 jours »
// serait alors choisie parmi des points espacés de `step` jours, et « 7 jours » vaudrait en réalité
// 7 + step jours, EN SILENCE. Ici il n'y a pas de graphe à ménager : on demande la série ENTIÈRE
// (`maxPoints: Number.POSITIVE_INFINITY`). Un test verrouille ce point précis.

import type { Asset } from '../../types';
import { buildMarketData } from './buildMarketData';
import { seriesReturnEndpoints } from './periodReturn';

/** Clé de la série TOTALE (valeur du portefeuille en CAD) dans les lignes de `buildMarketData`. */
const TOTAL_KEY = 'TOTAL';

/** Au-delà de ce retard (jours CIVILS) entre la séance de référence et aujourd'hui, on ne publie rien. */
export const MAX_STALE_DAYS = 3;

const DAY_MS = 86_400_000;

interface VariationPlacements {
    /** Variation en DOLLARS canadiens (signée). */
    montantCad: number;
    /** Variation RELATIVE en pourcentage (signée), sur les MÊMES deux bornes que le montant. */
    pct: number;
    /** Date de la borne PASSÉE (YYYY-MM-DD) — ce à quoi on compare. */
    depuis: string;
}

interface PortfolioSessionMetrics {
    /** Date (YYYY-MM-DD) de la séance de RÉFÉRENCE = dernier point daté de la série. */
    dateSeance: string;
    /** Valeur du portefeuille à `dateSeance`, en CAD. */
    valeurCad: number;
    /** Variation depuis la séance précédente. `null` = non calculable → NE PAS publier. */
    seance: VariationPlacements | null;
    /** Variation sur 7 jours. `null` = non calculable → NE PAS publier. */
    semaine: VariationPlacements | null;
}

/**
 * Variation des placements sur la dernière séance et sur 7 jours, ou `null` si la donnée ne permet
 * pas de l'affirmer. **`null` n'est pas un échec : c'est le comportement correct** — le hub
 * n'affiche que ce qu'il reçoit, donc omettre la métrique est la seule façon honnête de dire
 * « je ne sais pas ». Publier `0` fabriquerait « journée stable ».
 */
export function computePortfolioSessionMetrics(
    assets: Asset[] | undefined,
    fxRates: Record<string, number> | undefined,
    opts?: { nowMs?: number; maxStaleDays?: number },
): PortfolioSessionMetrics | null {
    const nowMs = opts?.nowMs ?? Date.now();
    const maxStaleDays = opts?.maxStaleDays ?? MAX_STALE_DAYS;

    // ⚠️ Série ENTIÈRE : voir la note de couplage en tête de fichier (la décimation fausserait 7 j).
    // ⚠️ On n'utilise PAS `syntheticTailKeys` : voir le point (b) de l'en-tête — il rate le report
    // de prix, qui est le cas courant. La règle de refus n°3 se lit dans `priceHistory`.
    const { rows } = buildMarketData(assets ?? [], fxRates, {
        maxPoints: Number.POSITIVE_INFINITY,
        nowMs,
    });

    // Refus 1 — pas de quoi parler de variation.
    if (rows.length < 2) return null;

    const derniere = rows[rows.length - 1];
    const dateSeance = String(derniere.date ?? '');
    const valeurCad = Number(derniere[TOTAL_KEY]);
    if (!dateSeance || !Number.isFinite(valeurCad) || valeurCad <= 0) return null;

    // Refus 2 — référence périmée. On compare des DATES civiles (minuit UTC), pas des instants :
    // « 3 jours » doit vouloir dire 3 changements de date, pas 72 h glissantes.
    const tSeance = Date.parse(`${dateSeance}T00:00:00Z`);
    if (!Number.isFinite(tSeance)) return null;
    const aujourdhui = Date.parse(`${new Date(nowMs).toISOString().slice(0, 10)}T00:00:00Z`);
    if ((aujourdhui - tSeance) / DAY_MS > maxStaleDays) return null;

    // Refus 3 — dates auxquelles chaque titre porteur de colonne avait une VRAIE clôture.
    // Lu dans `priceHistory` (la source), pas dans un sous-produit de `buildMarketData` : c'est ce
    // qui rend la règle insensible au report de prix comme au raccord de queue (cf. en-tête).
    const closesReels = new Map<string, Set<string>>();
    for (const a of assets ?? []) {
        if (!a.symbol) continue;
        let dates = closesReels.get(a.symbol);
        if (!dates) { dates = new Set<string>(); closesReels.set(a.symbol, dates); }
        for (const p of a.priceHistory ?? []) {
            if (p?.date && Number.isFinite(p.price) && p.price > 0) dates.add(p.date);
        }
    }

    const dateEntierementFigee = (date: string): boolean => {
        const ligne = rows.find((r) => String(r.date) === date);
        if (!ligne) return false;
        const symboles = Object.keys(ligne).filter((k) => k !== 'date' && !k.startsWith('TOTAL'));
        // Aucune colonne : le total ne vient que de titres SANS historique, comptés à leur valeur
        // ACTUELLE — figés par nature, et une « variation » entre deux telles dates ne refléterait
        // que des achats.
        if (symboles.length === 0) return true;
        return symboles.every((sym) => !closesReels.get(sym)?.has(date));
    };

    const variation = (periode: '24H' | '7D'): VariationPlacements | null => {
        const b = seriesReturnEndpoints(rows, TOTAL_KEY, periode);
        if (b === null) return null;
        if (dateEntierementFigee(b.fromDate) && dateEntierementFigee(b.toDate)) return null;
        // ⚠️ `seriesReturnEndpoints` garantit déjà `from > 0` ; on garde la lecture stricte pour que
        // le montant et le % viennent LITTÉRALEMENT des mêmes deux nombres.
        if (!Number.isFinite(b.from) || !Number.isFinite(b.to) || b.from <= 0) return null;
        return {
            montantCad: Number((b.to - b.from).toFixed(2)),
            pct: Number((((b.to - b.from) / b.from) * 100).toFixed(2)),
            depuis: b.fromDate,
        };
    };

    return {
        dateSeance,
        valeurCad: Number(valeurCad.toFixed(2)),
        seance: variation('24H'),
        semaine: variation('7D'),
    };
}

/** Libellé FR de la séance : « séance du 18 août ». Jamais « aujourd'hui » (cf. en-tête). */
export function libelleSeance(dateIso: string): string {
    const t = Date.parse(`${dateIso}T00:00:00Z`);
    if (!Number.isFinite(t)) return 'dernière séance';
    const d = new Date(t);
    const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
        'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    return `séance du ${d.getUTCDate()} ${mois[d.getUTCMonth()]}`;
}
