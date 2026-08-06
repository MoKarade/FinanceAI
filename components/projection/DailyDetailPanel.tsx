// components/projection/DailyDetailPanel.tsx
//
// [FUTUR-DAILY] Le détail JOUR PAR JOUR de la fenêtre regardée (demande Marc 2026-08-06 :
// « quotidien sur tout, je veux voir le détail si je zoom beaucoup »).
//
// ⚠️ POURQUOI UN PANNEAU ET PAS LA COURBE ELLE-MÊME (lot A d'un chantier en deux temps).
// L'axe X du graphe Futur est CATÉGORIEL : la ligne « Aujourd'hui », la frontière passé/futur, les
// événements de vie et les icônes-jalons sont tous ancrés sur un `monthIndex` ENTIER apparié comme
// une catégorie. Y injecter des points quotidiens exige de migrer l'axe sur `date` et de convertir
// chacun de ces ancrages — un désalignement y serait SILENCIEUX, sur un écran money-critical, et
// n'est pas vérifiable sans regarder l'écran. Ce panneau donne l'INFORMATION quotidienne tout de
// suite, sans toucher au tracé ; le rendu quotidien de la courbe est le lot B, à faire comme un
// changement dédié et couvert en e2e.
//
// ⚠️ PASSÉ ET FUTUR N'ONT PAS LE MÊME STATUT, et l'écran le DIT.
//   • Passé  : reconstruit depuis de VRAIES données (transactions datées, prix datés).
//   • Futur  : les mouvements à date connue (charges récurrentes) sont posés à leur jour ; le reste
//              est un étalement de la croissance, donc une INTERPOLATION.
// Confondre les deux ferait passer du lissage pour de la mesure — c'est la même faute que le
// « 0 $ crédible » que le dépôt s'interdit, transposée à un tableau.

import React, { useMemo } from 'react';
import { formatCAD } from '../../utils/format';
import { MASKED_AMOUNT_LABEL } from '../../utils/privacyAria';
import { reconstructCashHistoryDaily } from '../../services/history/reconstructCashHistory';
import { reconstructPortfolioHistoryDaily, type MinimalAsset } from '../../services/history/reconstructPortfolioHistory';
import { refineWindowToDaily, daySpan, type MonthlyAnchor } from '../../services/projection/dailyRefine';
import { datedDeltasForMonth, type MinimalRecurring } from '../../services/projection/datedMonthEvents';

/** Au-delà de ce nombre de jours dans la fenêtre, le tableau quotidien n'a plus de sens à lire
 *  (et le rendre coûterait pour rien) : on invite à zoomer davantage plutôt que d'afficher 3 ans
 *  de lignes. Choisi pour couvrir confortablement un trimestre de lecture fine. */
export const DAILY_DETAIL_MAX_DAYS = 120;

export interface DailyDetailPanelProps {
    /** Bornes de la fenêtre regardée, en dates ISO 'YYYY-MM-DD'. */
    from: string;
    to: string;
    /** Ancrages MENSUELS du moteur couvrant la fenêtre (le 1er sert de valeur d'entrée). */
    anchors: ReadonlyArray<MonthlyAnchor>;
    /** Aujourd'hui, 'YYYY-MM-DD' — sépare le reconstruit du projeté. */
    today: string;
    transactions: ReadonlyArray<{ date: string; amount: number; isDuplicate?: boolean; isTransfer?: boolean }>;
    currentCash: number;
    assets: MinimalAsset[];
    fx: Record<string, number>;
    recurring: ReadonlyArray<MinimalRecurring>;
    isPrivacyMode?: boolean;
}

interface Caveat { undatedTotal: number; flowsAfterNowDate: number }

interface Row {
    date: string;
    isPast: boolean;
    /** Liquidités — `null` quand la date sort de l'historique connu (jamais un 0 crédible). */
    cash: number | null;
    /** Valeur des placements, ventilée. `null` hors période reconstruite. */
    invested: number | null;
    /** Valeur projetée (futur seulement). */
    projected: number | null;
    /** Un mouvement à DATE connue tombe ce jour-là. */
    isDated: boolean;
    labels: string[];
    /** Âge du prix le plus vieux composant le point (passé) — trahit un plateau de reconstruction. */
    priceAgeMaxDays?: number;
}

export const DailyDetailPanel: React.FC<DailyDetailPanelProps> = ({
    from, to, anchors, today, transactions, currentCash, assets, fx, recurring, isPrivacyMode = false,
}) => {
    const span = daySpan(from, to);
    const tooWide = span > DAILY_DETAIL_MAX_DAYS;

    const { rows, caveat } = useMemo<{ rows: Row[]; caveat: Caveat }>(() => {
        const none: Caveat = { undatedTotal: 0, flowsAfterNowDate: 0 };
        if (tooWide || span <= 0) return { rows: [], caveat: none };

        // ── PASSÉ : reconstruit depuis de vraies données ────────────────────────────────────
        const cashDaily = reconstructCashHistoryDaily(transactions, currentCash, today);
        const cashByDate = new Map(cashDaily.points.map((p) => [p.date, p]));
        const invDaily = reconstructPortfolioHistoryDaily(assets, fx, from, to, { maxDays: DAILY_DETAIL_MAX_DAYS });
        const invByDate = new Map(invDaily.map((p) => [p.date, p]));

        // ── FUTUR : raffinement des ancrages mensuels du moteur ─────────────────────────────
        const refined = refineWindowToDaily(anchors, (a) => datedDeltasForMonth(recurring, a.month));
        const projByDate = new Map(refined.map((p) => [p.date, p]));

        const out: Row[] = [];
        for (let i = 0; i < span; i++) {
            const d = new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
            const isPast = d < today;
            const c = cashByDate.get(d);
            const inv = invByDate.get(d);
            const proj = projByDate.get(d);
            out.push({
                date: d,
                isPast,
                cash: c ? c.cash : null,
                invested: inv ? inv.InvestedValue : null,
                projected: proj ? proj.value : null,
                isDated: Boolean(c?.isDated) || Boolean(proj?.isDated),
                labels: proj?.labels ?? [],
                priceAgeMaxDays: inv?.priceAgeMaxDays,
            });
        }
        return {
            rows: out,
            caveat: { undatedTotal: cashDaily.undatedTotal, flowsAfterNowDate: cashDaily.flowsAfterNowDate },
        };
    }, [tooWide, span, from, to, today, transactions, currentCash, assets, fx, anchors, recurring]);

    const money = (v: number | null): string =>
        v === null ? '—' : isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(v);

    if (tooWide) {
        return (
            <div className="mt-3 rounded-card border border-white/10 bg-white/[0.02] p-3 text-tiny text-ink-300">
                Zoome davantage pour voir le détail jour par jour — la fenêtre couvre {span} jours,
                au-delà de {DAILY_DETAIL_MAX_DAYS} le tableau n’est plus lisible.
            </div>
        );
    }

    if (rows.length === 0) {
        // Absence HONNÊTE : pas de tableau vide qui laisserait croire à des zéros.
        return (
            <div className="mt-3 rounded-card border border-white/10 bg-white/[0.02] p-3 text-tiny text-ink-300">
                Aucun détail quotidien disponible sur cette fenêtre.
            </div>
        );
    }

    return (
        <div className="mt-3 rounded-card border border-white/10 bg-white/[0.02] overflow-x-auto">
            <table className="w-full text-tiny">
                <caption className="sr-only">
                    Détail jour par jour de la fenêtre affichée. Les lignes passées sont reconstruites
                    à partir de vraies transactions et de vrais prix ; les lignes futures sont projetées,
                    et seuls les mouvements récurrents y sont placés à leur date exacte.
                </caption>
                <thead>
                    <tr className="text-ink-400 border-b border-white/10">
                        <th scope="col" className="text-left px-2 py-1.5 font-semibold">Date</th>
                        <th scope="col" className="text-right px-2 py-1.5 font-semibold">Liquidités</th>
                        <th scope="col" className="text-right px-2 py-1.5 font-semibold">Placements</th>
                        <th scope="col" className="text-right px-2 py-1.5 font-semibold">Projeté</th>
                        <th scope="col" className="text-left px-2 py-1.5 font-semibold">Mouvement</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => (
                        <tr key={r.date} className={`border-b border-white/5 ${r.isDated ? 'bg-primary/5' : ''}`}>
                            <th scope="row" className="text-left px-2 py-1 font-mono font-normal text-ink-200">
                                {r.date}
                                {!r.isPast && <span className="sr-only"> (projeté)</span>}
                            </th>
                            <td className="text-right px-2 py-1 font-mono text-ink-100">{money(r.cash)}</td>
                            <td className="text-right px-2 py-1 font-mono text-ink-100">
                                {money(r.invested)}
                                {/* Un plateau de plus d'une semaine n'est plus un week-end : c'est du
                                    stockage compressé. Le dire évite de lire une valeur reconduite
                                    comme une valeur observée. */}
                                {r.priceAgeMaxDays !== undefined && r.priceAgeMaxDays > 7 && (
                                    <span className="ml-1 text-ink-400" title={`Prix reconduit depuis ${r.priceAgeMaxDays} jours`}>
                                        ~<span className="sr-only">valeur reconduite, prix vieux de {r.priceAgeMaxDays} jours</span>
                                    </span>
                                )}
                            </td>
                            <td className="text-right px-2 py-1 font-mono text-ink-100">{money(r.projected)}</td>
                            <td className="text-left px-2 py-1 text-ink-300">
                                {r.labels.length > 0 ? r.labels.join(', ') : r.isDated ? 'Mouvement' : ''}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="px-2 py-1.5 text-tiny text-ink-400">
                Les lignes surlignées portent un mouvement à date connue. Ailleurs, le futur est
                <strong className="text-ink-300"> interpolé</strong> : ta paie et ton hypothèque n’ont
                pas de jour dans le modèle, elles sont lissées sur le mois.
            </p>
            {/* [Audit 2026-08-06] Deux écarts CONNUS entre le niveau de liquidités affiché ici et
                l'ancre d'où il est reconstruit. Les taire donnerait un niveau faux sans le moindre
                signe ; les dire coûte deux lignes. */}
            {caveat.undatedTotal !== 0 && (
                <p role="note" className="px-2 py-1.5 text-tiny text-amber-300 border-t border-white/10">
                    ⚠ Des mouvements totalisant {money(caveat.undatedTotal)} n’ont qu’une date au mois,
                    sans jour : impossible de les placer. La colonne Liquidités est décalée d’autant
                    sur toute la période — le total, lui, reste juste.
                </p>
            )}
            {caveat.flowsAfterNowDate !== 0 && (
                <p role="note" className="px-2 py-1.5 text-tiny text-amber-300 border-t border-white/10">
                    ⚠ Des mouvements totalisant {money(caveat.flowsAfterNowDate)} sont datés APRÈS
                    aujourd’hui. Ils comptent déjà dans ton solde de référence sans avoir encore eu
                    lieu, donc le niveau passé en tient compte à tort.
                </p>
            )}
        </div>
    );
};
