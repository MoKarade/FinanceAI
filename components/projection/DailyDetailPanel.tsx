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
import { PrivateAmount } from '../ui/PrivateAmount';
import { reconstructCashHistoryDaily } from '../../services/history/reconstructCashHistory';
import { reconstructPortfolioHistoryDaily, type MinimalAsset } from '../../services/history/reconstructPortfolioHistory';
import { refineWindowToDaily, daySpan, type MonthlyAnchor } from '../../services/projection/dailyRefine';
import { datedDeltasForMonth, weeklyDeltasForMonth, type MinimalRecurring } from '../../services/projection/datedMonthEvents';

/** Au-delà de ce nombre de jours dans la fenêtre, le tableau quotidien n'a plus de sens à lire
 *  (et le rendre coûterait pour rien) : on invite à zoomer davantage plutôt que d'afficher 3 ans
 *  de lignes. Choisi pour couvrir confortablement un trimestre de lecture fine. */
export const DAILY_DETAIL_MAX_DAYS = 120;

/** [Demande Marc 2026-08-09] Colonnes de ventilation par COMPTE, dans l'ordre des régimes.
 *  Les clés correspondent EXACTEMENT aux buckets de `reconstructPortfolioHistoryDaily`
 *  (dérivés d'`Asset.accountType`) : pas de mapping parallèle qui pourrait diverger. */
export const ACCOUNT_COLUMNS = [
    { key: 'CELI', label: 'CELI' },
    { key: 'CELIAPP', label: 'CELIAPP' },
    { key: 'REER', label: 'REER' },
    { key: 'REEE', label: 'REEE' },
    { key: 'NonReg', label: 'Non-enr.' },
    { key: 'Crypto', label: 'Crypto' },
] as const;

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
    /** Net MENSUEL du ménage — versé chaque semaine (réponse de Marc : « chaque semaine jeudi »). */
    monthlyNetSalary?: number;
    /** Somme des paiements minimums MENSUELS des dettes — même cadence hebdomadaire. */
    monthlyDebtPayment?: number;
    isPrivacyMode?: boolean;
}

interface Caveat { undatedTotal: number; flowsAfterNowDate: number }

interface Row {
    date: string;
    isPast: boolean;
    /** Liquidités — `null` quand la date sort de l'historique connu (jamais un 0 crédible). */
    cash: number | null;
    /** Valeur des placements, TOUS régimes confondus. `null` hors période reconstruite. */
    invested: number | null;
    /** [Demande Marc] Ventilation par COMPTE — le passé seulement. `reconstructPortfolioHistoryDaily`
     *  la calculait déjà via `Asset.accountType` ; on la JETAIT à l'affichage.
     *  `null` sur le futur : le moteur ne projette pas les comptes au jour, et inventer une
     *  ventilation quotidienne serait de la fausse précision. */
    byAccount: { CELI: number; CELIAPP: number; REER: number; REEE: number; NonReg: number; Crypto: number } | null;
    /** Valeur projetée (futur seulement). */
    projected: number | null;
    /** Un mouvement à DATE connue tombe ce jour-là. */
    isDated: boolean;
    labels: string[];
    /** Âge du prix le plus vieux composant le point (passé) — trahit un plateau de reconstruction. */
    priceAgeMaxDays?: number;
}

export const DailyDetailPanel: React.FC<DailyDetailPanelProps> = ({
    from, to, anchors, today, transactions, currentCash, assets, fx, recurring,
    monthlyNetSalary = 0, monthlyDebtPayment = 0, isPrivacyMode = false,
}) => {
    const span = daySpan(from, to);
    const tooWide = span > DAILY_DETAIL_MAX_DAYS;

    // ⚠️ MEMO SÉPARÉ (finding ÉLEVÉ de la revue) : `reconstructCashHistoryDaily` n'est PAS bornée par
    // la fenêtre — elle remonte jusqu'à la toute PREMIÈRE transaction de l'historique. Son coût est
    // donc indépendant du zoom. Laissée dans le memo principal, elle se rejouait ENTIÈREMENT à chaque
    // frame de zoom/pan (les `anchors` sont recréés à chaque `requestAnimationFrame`), alors que ses
    // seules vraies dépendances — transactions, solde, aujourd'hui — ne bougent pas pendant un geste.
    const cashDaily = useMemo(
        () => reconstructCashHistoryDaily(transactions, currentCash, today),
        [transactions, currentCash, today],
    );

    const { rows, caveat } = useMemo<{ rows: Row[]; caveat: Caveat }>(() => {
        const none: Caveat = { undatedTotal: 0, flowsAfterNowDate: 0 };
        if (tooWide || span <= 0) return { rows: [], caveat: none };

        // ── PASSÉ : reconstruit depuis de vraies données ────────────────────────────────────
        const cashByDate = new Map(cashDaily.points.map((p) => [p.date, p]));
        // ⚠️ BORNÉE À AUJOURD'HUI, et pas à `to` (défaut trouvé en écrivant le test des colonnes par
        // compte) : `reconstructPortfolioHistoryDaily` produit un point pour CHAQUE jour demandé, y
        // compris après aujourd'hui, en reconduisant le dernier prix connu. Sur une fenêtre à cheval,
        // les lignes futures affichaient donc des placements PLATS présentés comme reconstruits — le
        // « chiffre crédible » que le dépôt s'interdit, juste à côté d'une colonne « Projeté » qui,
        // elle, croît. Le futur n'a pas de ventilation par compte : le moteur ne la projette pas au jour.
        const invTo = to < today ? to : today;
        const invDaily = invTo < from
            ? []
            : reconstructPortfolioHistoryDaily(assets, fx, from, invTo, { maxDays: DAILY_DETAIL_MAX_DAYS });
        const invByDate = new Map(invDaily.map((p) => [p.date, p]));

        // ── FUTUR : raffinement des ancrages mensuels du moteur ─────────────────────────────
        // Mouvements à DATE connue du mois : charges récurrentes (leur `dayOfMonth`) + paie et
        // dettes, hebdomadaires depuis la réponse de Marc à la question A13.
        const refined = refineWindowToDaily(anchors, (a) => [
            ...datedDeltasForMonth(recurring, a.month),
            ...weeklyDeltasForMonth(a.year, a.month, monthlyNetSalary, 'Paie', 1),
            ...weeklyDeltasForMonth(a.year, a.month, monthlyDebtPayment, 'Paiement de dette', -1),
        ]);
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
                byAccount: inv
                    ? { CELI: inv.CELI, CELIAPP: inv.CELIAPP, REER: inv.REER, REEE: inv.REEE, NonReg: inv.NonReg, Crypto: inv.Crypto }
                    : null,
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
    }, [tooWide, span, from, to, today, cashDaily, assets, fx, anchors, recurring,
        monthlyNetSalary, monthlyDebtPayment]);

    // ⚠️ `PrivateAmount` et NON `MASKED_AMOUNT_LABEL` en texte (finding a11y ÉLEVÉ) : le libellé
    // littéral est la convention des tableaux `sr-only` (INVISIBLES), où du texte en clair ne gêne
    // personne. Ici les cellules sont VISIBLES : l'écrire aurait affiché « Montant masqué » jusqu'à
    // 120 fois dans des colonnes numériques alignées à droite, au lieu des puces compactes que
    // `PrivateAmount` rend partout ailleurs (cf. `FutureDetailModal`, le sibling le plus proche).
    const money = (v: number | null): React.ReactNode =>
        v === null ? '—' : <PrivateAmount>{formatCAD(v)}</PrivateAmount>;
    /** Version TEXTE, pour les avertissements en prose (où une puce n'aurait aucun sens). */
    const moneyText = (v: number): string => (isPrivacyMode ? '•••' : formatCAD(v));

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
            {/* [a11y] Un TITRE, parce que le panneau APPARAÎT au zoom — y compris au clavier, via les
                boutons de période. Sans heading, un utilisateur qui navigue par titres (touche H) ne
                tomberait JAMAIS sur cette section : la `<caption>` sr-only n'est atteignable qu'en
                entrant dans le tableau. */}
            <h3 className="px-2 pt-2 pb-1 text-tiny font-semibold text-ink-200">
                Détail jour par jour
            </h3>
            {/* Annonce BRÈVE de l'apparition. ⚠️ Volontairement HORS du tableau : mettre `aria-live`
                sur 120 lignes × 5 colonnes ferait relire l'intégralité du tableau à chaque zoom —
                l'anti-pattern que les WAI-ARIA Authoring Practices déconseillent. `role="status"`
                est la convention déjà utilisée partout dans le dépôt. */}
            <p role="status" aria-live="polite" className="sr-only">
                Détail quotidien affiché : {span} jours, du {from} au {to}.
            </p>
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
                        {/* [Demande Marc] Ventilation par COMPTE. Passé seulement — voir le `—` du corps. */}
                        {ACCOUNT_COLUMNS.map((c) => (
                            <th key={c.key} scope="col" className="text-right px-2 py-1.5 font-semibold whitespace-nowrap">{c.label}</th>
                        ))}
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
                            <td className="text-right px-2 py-1 font-mono text-ink-100 font-semibold">
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
                            {/* Ventilation par COMPTE. `—` sur le futur : le moteur ne projette pas les
                                comptes au jour, et fabriquer une répartition quotidienne serait de la
                                fausse précision — un « — » honnête vaut mieux qu'un chiffre crédible. */}
                            {ACCOUNT_COLUMNS.map((c) => (
                                <td key={c.key} className="text-right px-2 py-1 font-mono text-ink-300">
                                    {r.byAccount ? money(r.byAccount[c.key]) : '—'}
                                </td>
                            ))}
                            <td className="text-right px-2 py-1 font-mono text-ink-100">{money(r.projected)}</td>
                            <td className="text-left px-2 py-1 text-ink-300">
                                {r.labels.length > 0 ? r.labels.join(', ') : r.isDated ? 'Mouvement' : ''}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="px-2 py-1.5 text-tiny text-ink-400">
                Les lignes surlignées portent un mouvement à date connue : paie et paiements de dette
                chaque <strong className="text-ink-300">jeudi</strong>, charges récurrentes à leur jour.
                Ailleurs, le futur est <strong className="text-ink-300">interpolé</strong> — la croissance
                d’un portefeuille n’a pas de date. Un mois à 5 jeudis reçoit bien 5 paies (c’est la
                réalité) ; le total du mois, lui, reste celui du moteur, qui raisonne au mois.
            </p>
            {/* [Audit 2026-08-06] Deux écarts CONNUS entre le niveau de liquidités affiché ici et
                l'ancre d'où il est reconstruit. Les taire donnerait un niveau faux sans le moindre
                signe ; les dire coûte deux lignes. */}
            {caveat.undatedTotal !== 0 && (
                <p role="note" className="px-2 py-1.5 text-tiny text-amber-300 border-t border-white/10">
                    ⚠ Des mouvements totalisant {moneyText(caveat.undatedTotal)} n’ont qu’une date au mois,
                    sans jour : impossible de les placer. La colonne Liquidités est décalée d’autant
                    sur toute la période — le total, lui, reste juste.
                </p>
            )}
            {caveat.flowsAfterNowDate !== 0 && (
                <p role="note" className="px-2 py-1.5 text-tiny text-amber-300 border-t border-white/10">
                    ⚠ Des mouvements totalisant {moneyText(caveat.flowsAfterNowDate)} sont datés APRÈS
                    aujourd’hui. Ils comptent déjà dans ton solde de référence sans avoir encore eu
                    lieu, donc le niveau passé en tient compte à tort.
                </p>
            )}
        </div>
    );
};
