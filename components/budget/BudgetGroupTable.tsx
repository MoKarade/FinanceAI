import React from 'react';
import { CHART_TOOLTIP_STYLE } from '../../utils/chartTooltip';
import { BudgetCategory } from '../../types';
import { PrivateAmount } from '../ui/PrivateAmount';
import { PrivateNumberInput } from '../ui/PrivateNumberInput';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';
import { LineChart, Line, YAxis as LYAxis } from 'recharts';
import { formatCAD, formatSigned, formatPercent, formatNumber } from '../../utils/format';
import { MASKED_AMOUNT_LABEL } from '../../utils/privacyAria';
import { maskedTick } from '../../utils/chartPrivacy';
import { ChartDataTable } from '../ui/ChartDataTable';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useViewportBelowLg } from '../../hooks/useViewportBelowLg';
import type { TimeView } from './pilotage';


/**
 * [A11Y-BUDGETGROUP-CHART-NOALT] Alternative TEXTUELLE d'un sparkline (WCAG 1.1.1).
 *
 * ⚠️ Pas de `ChartDataTable` ici, et c'est un choix : il y a UN sparkline PAR LIGNE de budget.
 * Annoncer six mois chiffrés pour chacun noierait le lecteur d'écran sous des dizaines de tableaux
 * pour une information de FORME. Un sparkline se résume : sens et ampleur.
 *
 * ⚠️ Et il se résume SANS montant — donc sans rien à masquer. Le pourcentage de variation reste
 * lisible en mode discret (précédent du dépôt : un ratio n'est pas un montant), là où « de 820 $ à
 * 910 $ » aurait dû passer par `MASKED_AMOUNT_LABEL` et n'aurait plus rien dit.
 *
 * Rend `null` quand la série ne permet AUCUNE description honnête (moins de deux points finis) :
 * l'appelant marque alors le graphe `aria-hidden`, plutôt que d'annoncer une tendance inventée.
 */
export function tendanceSparkline(data: readonly number[]): string | null {
    const finis = data.filter((v) => Number.isFinite(v));
    if (finis.length < 2) return null;
    const debut = finis[0];
    const fin = finis[finis.length - 1];
    const ecart = fin - debut;
    // Seuil au cent près : deux mois qui ne diffèrent que d'arrondis sont « stables », pas « en hausse ».
    if (Math.abs(ecart) < 0.01) return `${finis.length} mois, stable`;
    const sens = ecart > 0 ? 'en hausse' : 'en baisse';
    // Un point de départ nul rend la variation relative infinie : on annonce le SENS seul plutôt
    // qu'un pourcentage fabriqué (no-fake-data vaut aussi pour un nom accessible).
    if (debut === 0) return `${finis.length} mois, ${sens}`;
    return `${finis.length} mois, ${sens} de ${formatPercent(Math.abs(ecart / debut) * 100, 0)}`;
}

const Sparkline = ({ data, color, poste }: { data: number[]; color: string; poste: string }) => {
    const chartData = data.map((val, i) => ({ i, val }));
    const tendance = tendanceSparkline(data);
    const alternative = tendance
        ? { role: 'img' as const, 'aria-label': `Tendance de ${poste} sur ${tendance}` }
        : { 'aria-hidden': true };
    return (
        <div style={{ width: '80px', height: '32px' }} {...alternative}>
            <LineChart width={80} height={32} data={chartData}>
                <Line type="monotone" dataKey="val" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
                <LYAxis domain={['dataMin', 'dataMax']} hide />
            </LineChart>
        </div>
    );
};

/** [S5-REFONTE-BUDGET] Titres des groupes (maquettes E/M-budget). */
const TITRES: Record<'Besoin' | 'Envie' | 'Epargne', string> = { Besoin: 'Besoins', Envie: 'Envies', Epargne: 'Épargne' };

const LIBELLES_PERIODE: Record<TimeView, { cible: string; reel: string }> = {
    MONTH: { cible: 'Cible / mois', reel: 'Réel ce mois' },
    QUARTER: { cible: 'Cible / trim.', reel: 'Réel ce trim.' },
    YEAR: { cible: 'Cible / an', reel: 'Réel cette année' },
    CUSTOM: { cible: 'Cible / période', reel: 'Réel (période)' },
};

interface BudgetGroupTableProps {
    nature: 'Besoin' | 'Envie' | 'Epargne';
    items: BudgetCategory[];
    allItems: BudgetCategory[];
    actualsMap: Record<string, number>;
    trendMap: Record<string, number[]>;
    monthlyDataMap: Record<string, { name: string; value: number }[]>;
    totalBudgetDisplay: number;
    monthProgress: number;
    expandedId: string | null;
    onExpandToggle: (id: string | null) => void;
    getDisplayTarget: (item: BudgetCategory) => number;
    /**
     * [BUDGET-3-VUES] Moyenne mensuelle des 12 derniers mois (mois courant partiel exclu — donc
     * au plus 11 mois pleins), ramenée à la période affichée (même normalisation que la cible).
     * `null` = aucun historique révolu → « — » honnête.
     */
    getDisplayAvg: (item: BudgetCategory) => number | null;
    isSolo: boolean;
    splitRatio1: number;
    userNames: [string, string];
    timeView: TimeView;
    onUpdateItem: (index: number, field: keyof BudgetCategory, value: unknown) => void;
    onDeleteItem: (id: string | undefined) => void;
    onAddItem: (nature: 'Besoin' | 'Envie' | 'Epargne') => void;
    /** [REFONTE-NAV-L5] Cross-link « Voir les transactions » d'un poste (catégorie du même nom). */
    onViewTransactions?: (categoryName: string) => void;
}


/** Moyenne indisponible : « — » honnête, jamais un faux 0 (no-fake-data). */
const MoyenneIndisponible: React.FC<{ texte: string }> = ({ texte }) => (
    <span className="text-ink-400 font-mono" title="Aucun mois plein d'historique — moyenne indisponible">
        <span aria-hidden="true">—</span>
        <span className="sr-only">{texte}</span>
    </span>
);

export const BudgetGroupTable: React.FC<BudgetGroupTableProps> = ({
    nature, items, allItems, actualsMap, trendMap, monthlyDataMap,
    totalBudgetDisplay, monthProgress, expandedId, onExpandToggle,
    getDisplayTarget, getDisplayAvg, isSolo, splitRatio1, userNames, timeView,
    onUpdateItem, onDeleteItem, onAddItem, onViewTransactions,
}) => {
    // NB : on ne masque PLUS les groupes vides. Sinon le bouton « + Ajouter »
    // (ci-dessous) disparaissait avec eux → impossible de créer la 1re catégorie
    // d'un groupe (bloquant total pour un nouvel utilisateur, INITIAL_BUDGET=[]).
    const isEmpty = items.length === 0;
    const etroit = useViewportBelowLg();
    const titre = TITRES[nature];
    const idTitre = `groupe-budget-${nature}`;
    const libelles = LIBELLES_PERIODE[timeView];

    // [AUDIT-SAFETY] Mode discret : le composant masquait ses cellules $ (`PrivateAmount`) mais pas
    // l'axe Y ni l'infobulle du mini-graphique par poste — les $ dépensés y restaient lisibles.
    const isPrivacyMode = useFinanceStore(s => s.isPrivacyMode);

    const groupTotalTarget = items.reduce((sum, i) => sum + getDisplayTarget(i), 0);
    const groupTotalSpent = items.reduce((sum, i) => sum + (actualsMap[i.name] || 0), 0);
    // [BUDGET-3-VUES] Total moyenne du groupe = Σ des moyennes ; null (« — ») quand aucun
    // historique révolu (jamais un faux 0 — no-fake-data). TOUT-OU-RIEN par construction :
    // la disponibilité vient de `coveredFullMonths`, GLOBAL au ledger → tous les postes sont
    // `null` ou aucun (prouvé par le panel financial-integrity, PR #500) — jamais de somme
    // PARTIELLE silencieuse. Le `.filter` ne sert que de ceinture si un futur refactor
    // désalignait les listes poste/ledger.
    const groupAvgs = items.map(i => getDisplayAvg(i)).filter((v): v is number => v !== null);
    const groupTotalAvg = groupAvgs.length > 0 ? groupAvgs.reduce((s, v) => s + v, 0) : null;

    const boutonAjouter = (
        <button
            type="button"
            onClick={() => onAddItem(nature)}
            aria-label={`Ajouter un poste dans ${titre}`}
            className="self-start min-h-11 px-5 lg:px-5 text-[13px] text-ink-200 hover:text-ink-50 focus-ring rounded-sm"
        >
            + Ajouter un poste
        </button>
    );

    // [S5-REFONTE-BUDGET] Épargne sans poste : la carte en pointillés des maquettes, qui invite à
    // créer le premier (au lieu d'un tableau vide).
    if (isEmpty && nature === 'Epargne') {
        return (
            <section aria-labelledby={idTitre} className="rounded-2xl border border-dashed border-white/15 px-4 py-4 lg:px-5 flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1 min-w-0">
                    <h2 id={idTitre} className="text-body font-semibold text-ink-50">{titre} · aucun poste</h2>
                    <p className="text-meta lg:text-[13px] text-ink-400">Crée un poste d'épargne pour suivre ce que tu mets de côté chaque mois.</p>
                </div>
                <button
                    type="button"
                    onClick={() => onAddItem(nature)}
                    aria-label="Créer un poste d'épargne"
                    className="shrink-0 h-10 px-4 rounded-lg border border-white/40 text-body text-ink-100 hover:bg-white/5 focus-ring"
                >
                    Créer<span className="hidden lg:inline"> un poste</span>
                </button>
            </section>
        );
    }

    const lignes = items.map((item) => {
        const idx = allItems.findIndex(i => i.id === item.id);
        const displayTarget = getDisplayTarget(item);
        const displayAvg = getDisplayAvg(item);
        const spent = actualsMap[item.name] || 0;
        const remaining = displayTarget - spent;
        const isOver = spent > displayTarget;
        const percentSpent = displayTarget > 0 ? (spent / displayTarget) * 100 : 0;
        // Barre du poste : rouge si dépassé, ambre si en avance sur le mois (vue Mois), clair sinon.
        const couleurBarre = isOver ? 'bg-danger-400' : (timeView === 'MONTH' && percentSpent > monthProgress ? 'bg-warning-400' : 'bg-ink-100');
        return { item, idx, displayTarget, displayAvg, spent, remaining, isOver, percentSpent, couleurBarre, isExpanded: expandedId === item.id };
    });
    const basculer = (id: string | undefined, ouvert: boolean) => onExpandToggle(ouvert ? null : (id ?? null));
    const barre = (l: typeof lignes[number], classe: string) => (
        <span className={`block h-1 rounded-full bg-white/8 overflow-hidden ${classe}`} aria-hidden="true">
            <span className={`block h-full rounded-full ${l.couleurBarre}`} style={{ width: `${Math.min(100, l.percentSpent)}%` }} />
        </span>
    );
    const reste = (l: typeof lignes[number]) => (
        <PrivateAmount className={`font-mono ${l.remaining < 0 ? 'text-danger-400' : 'text-success-400'}`}>
            {formatSigned(l.remaining, { withCurrency: true })}
        </PrivateAmount>
    );
    const editeur = (l: typeof lignes[number]) => (
        <EditeurPoste
            l={l} nature={nature} totalBudgetDisplay={totalBudgetDisplay} trend={trendMap[l.item.name] || []}
            mensuel={monthlyDataMap[l.item.name] || []} isSolo={isSolo} splitRatio1={splitRatio1} userNames={userNames}
            isPrivacyMode={isPrivacyMode} onUpdateItem={onUpdateItem} onDeleteItem={onDeleteItem} onViewTransactions={onViewTransactions}
        />
    );

    return (
        <section aria-labelledby={idTitre} className="rounded-2xl bg-surface border border-white/6 overflow-hidden flex flex-col">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-0.5 lg:gap-3 px-4 pt-4 pb-2 lg:px-5 lg:py-3.5">
                <h2 id={idTitre} className="text-[17px] lg:text-[16px] font-semibold text-ink-50">
                    {titre}<span className="text-meta lg:text-[13px] font-normal text-ink-400"> · {items.length} poste{items.length > 1 ? 's' : ''}</span>
                </h2>
                <div className="text-meta lg:font-mono text-ink-400 lg:text-ink-200" title="Réel · moyenne 12 mois · cible">
                    <PrivateAmount className={groupTotalSpent > groupTotalTarget ? 'text-danger-400' : ''}>
                        {formatCAD(groupTotalSpent)}
                    </PrivateAmount>
                    <span className="text-ink-400"> · moy. </span>
                    {groupTotalAvg === null
                        ? <MoyenneIndisponible texte="Moyenne du groupe indisponible (aucun mois plein d'historique)" />
                        : <PrivateAmount>{formatCAD(groupTotalAvg)}</PrivateAmount>}
                    <span className="text-ink-400"> / </span>
                    <PrivateAmount>{formatCAD(groupTotalTarget)}</PrivateAmount>
                </div>
            </div>

            {isEmpty && (
                <p className="px-4 lg:px-5 py-5 border-t border-white/5 text-meta text-ink-400">
                    Aucune catégorie dans « {titre} » pour l'instant. Ajoute un premier poste ci-dessous.
                </p>
            )}

            {!isEmpty && etroit && (
                <ul className="px-4">
                    {lignes.map((l) => (
                        <li key={l.item.id} data-focus-section={`poste:${l.item.name}`} className="border-t border-white/5">
                            <button
                                type="button"
                                aria-expanded={l.isExpanded}
                                onClick={() => basculer(l.item.id, l.isExpanded)}
                                className="w-full py-3 flex flex-col gap-2 text-left focus-ring rounded-sm"
                            >
                                <span className="w-full flex items-center justify-between gap-3">
                                    <span className="text-body font-semibold text-ink-50 truncate">{l.item.name}</span>
                                    <span className="font-mono text-meta text-ink-100 shrink-0">
                                        <PrivateAmount className={l.isOver ? 'text-danger-400' : ''}>{formatCAD(l.spent)}</PrivateAmount>
                                        {' / '}
                                        <PrivateAmount>{formatCAD(l.displayTarget)}</PrivateAmount>
                                    </span>
                                </span>
                                {barre(l, 'w-full')}
                                <span className="w-full flex items-center justify-between gap-3 text-meta">
                                    <span className="text-ink-400">
                                        Moy. 12 mois{' '}
                                        {l.displayAvg === null
                                            ? <MoyenneIndisponible texte="Moyenne indisponible (aucun mois plein d'historique)" />
                                            : <PrivateAmount>{formatCAD(l.displayAvg)}</PrivateAmount>}
                                    </span>
                                    <span className="font-mono"><span className={l.remaining < 0 ? 'text-danger-400' : 'text-success-400'}>Reste </span>{reste(l)}</span>
                                </span>
                            </button>
                            {l.isExpanded && <div className="pb-4">{editeur(l)}</div>}
                        </li>
                    ))}
                </ul>
            )}

            {!isEmpty && !etroit && (
                <table className="w-full text-left border-collapse text-body">
                    <thead>
                        <tr className="text-[11px] font-semibold tracking-[0.06em] uppercase text-ink-400 border-t border-white/5">
                            <th scope="col" className="px-5 h-10 font-semibold">Poste</th>
                            <th scope="col" className="px-3 font-semibold text-right">{libelles.cible}</th>
                            <th scope="col" className="px-3 font-semibold text-right" title="Moyenne mensuelle des 12 derniers mois (mois courant, partiel, exclu), ramenée à la période affichée">Moy. 12 mois</th>
                            <th scope="col" className="px-3 font-semibold text-right">{libelles.reel}</th>
                            <th scope="col" className="px-5 font-semibold text-right">Reste</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lignes.map((l) => (
                            <React.Fragment key={l.item.id}>
                                <tr
                                    // [REFONTE-NAV-L5] Ancre du deep-link Transactions → Budget (« Voir au budget »
                                    // sur une catégorie) : usePendingFocus scrolle vers `poste:<nom>`.
                                    data-focus-section={`poste:${l.item.name}`}
                                    className={`border-t border-white/5 ${l.isExpanded ? 'bg-white/3' : ''}`}
                                >
                                    <th scope="row" className="px-5 py-3 font-normal w-[42%]">
                                        {/* Le nom est le bouton qui déplie l'édition du poste (cible, fréquence,
                                            attribution, historique) — absente des maquettes, gardée repliée. */}
                                        <button
                                            type="button"
                                            aria-expanded={l.isExpanded}
                                            onClick={() => basculer(l.item.id, l.isExpanded)}
                                            className="text-ink-50 font-medium hover:underline underline-offset-2 focus-ring rounded-sm text-left"
                                        >
                                            {l.item.name || 'Sans nom'}
                                        </button>
                                        {barre(l, 'mt-2 max-w-[285px]')}
                                    </th>
                                    <td className="px-3 text-right"><PrivateAmount className="font-mono text-ink-50">{formatCAD(l.displayTarget)}</PrivateAmount></td>
                                    <td className="px-3 text-right">
                                        {l.displayAvg === null
                                            ? <MoyenneIndisponible texte="Moyenne indisponible (aucun mois plein d'historique)" />
                                            : <PrivateAmount className="font-mono text-ink-300">{formatCAD(l.displayAvg)}</PrivateAmount>}
                                    </td>
                                    <td className="px-3 text-right"><PrivateAmount className={`font-mono ${l.isOver ? 'text-danger-400' : 'text-ink-50'}`}>{formatCAD(l.spent)}</PrivateAmount></td>
                                    <td className="px-5 text-right">{reste(l)}</td>
                                </tr>
                                {l.isExpanded && (
                                    <tr className="bg-white/3">
                                        <td colSpan={5} className="px-5 pb-5 pt-1">{editeur(l)}</td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            )}
            <div className="border-t border-white/5 flex">{boutonAjouter}</div>
        </section>
    );
};

interface EditeurPosteProps {
    l: { item: BudgetCategory; idx: number; displayTarget: number; isOver: boolean };
    nature: 'Besoin' | 'Envie' | 'Epargne';
    totalBudgetDisplay: number;
    trend: number[];
    mensuel: { name: string; value: number }[];
    isSolo: boolean;
    splitRatio1: number;
    userNames: [string, string];
    isPrivacyMode: boolean;
    onUpdateItem: BudgetGroupTableProps['onUpdateItem'];
    onDeleteItem: BudgetGroupTableProps['onDeleteItem'];
    onViewTransactions?: BudgetGroupTableProps['onViewTransactions'];
}

/** Édition d'un poste (déplié) : nom, montant de base, fréquence, attribution, répartition, historique. */
const EditeurPoste: React.FC<EditeurPosteProps> = ({
    l, totalBudgetDisplay, trend, mensuel, isSolo, splitRatio1, userNames, isPrivacyMode, onUpdateItem, onDeleteItem, onViewTransactions,
}) => {
    const { item, idx, displayTarget, isOver } = l;
    const percentageOfBudget = totalBudgetDisplay > 0 ? (displayTarget / totalBudgetDisplay) * 100 : 0;
    // [A11Y-PRIVACY-CHAINES-RESTANTES] La répartition était UNE CHAÎNE qui mêlait les prénoms et les
    // montants — donc plus aucun nœud à masquer. Elle est maintenant une LISTE de parts : le nom reste
    // lisible, le montant redevient un nœud. Deux raisons de ne pas simplement envelopper la phrase
    // entière : « ••• » seul ne dirait plus QUI paie quoi, et la répartition ENTRE CONJOINTS est une
    // information relationnelle (`UNE-REGLE-GENERALE-A-UN-DOMAINE-DE-VALIDITE`).
    const parts: Array<{ nom: string; montant: number }> = isSolo
        ? [{ nom: userNames[0], montant: displayTarget }]
        : item.type === 'Commun'
            ? [
                { nom: userNames[0].substring(0, 3), montant: displayTarget * splitRatio1 },
                { nom: userNames[1].substring(0, 3), montant: displayTarget * (1 - splitRatio1) },
            ]
            : item.type === 'Perso 1'
                ? [{ nom: userNames[0], montant: displayTarget }]
                : [{ nom: userNames[1], montant: displayTarget }];
    const champ = 'h-10 px-3 text-body text-ink-50';
    const etiquette = 'text-meta text-ink-400';

    return (
        <div className="flex flex-col gap-4 rounded-xl border border-white/8 bg-dark/40 p-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <label className="flex flex-col gap-1 col-span-2 lg:col-span-1">
                    <span className={etiquette}>Nom du poste</span>
                    <input aria-label="Nom du poste" type="text" value={item.name} onChange={(e) => onUpdateItem(idx, 'name', e.target.value)} className={champ} />
                </label>
                <div className="flex flex-col gap-1">
                    <span className={etiquette} aria-hidden="true">Montant de base</span>
                    <div className="flex items-center gap-1.5">
                        {/* [A11Y-PRIVACY-SALAIRE] Le nom porte le POSTE (déjà visible, aucune fuite de
                            montant) : distinguable d'une ligne à l'autre, en mode normal comme discret. */}
                        <PrivateNumberInput
                            type="number"
                            value={item.target}
                            onChange={(e) => onUpdateItem(idx, 'target', parseFloat(e.target.value) || 0)}
                            className={`${champ} w-full font-mono text-right`}
                            aria-label={`Montant de base — ${item.name}`}
                            title="Modifier le montant de base"
                        />
                        <span className="text-meta text-ink-400 shrink-0">{item.frequency === 'Monthly' ? '/m' : item.frequency === 'Yearly' ? '/an' : ''}</span>
                    </div>
                </div>
                <label className="flex flex-col gap-1">
                    <span className={etiquette}>Fréquence</span>
                    <select aria-label={`Fréquence — ${item.name || `poste ${idx + 1}`}`} value={item.frequency} onChange={(e) => onUpdateItem(idx, 'frequency', e.target.value)} className={champ}>
                        <option value="Weekly">Hebdo</option>
                        <option value="Monthly">Mensuel</option>
                        <option value="Quarterly">Trimestre</option>
                        <option value="Yearly">Annuel</option>
                    </select>
                </label>
                <label className="flex flex-col gap-1">
                    <span className={etiquette}>Attribution</span>
                    <select aria-label={`Attribution — ${item.name || `poste ${idx + 1}`}`} value={item.type} onChange={(e) => onUpdateItem(idx, 'type', e.target.value)} className={champ}>
                        <option value="Commun">Commun</option>
                        <option value="Perso 1">Perso 1</option>
                        <option value="Perso 2">Perso 2</option>
                    </select>
                </label>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-meta text-ink-300">
                <span>Part du budget <span className="font-mono text-ink-100">{formatNumber(percentageOfBudget, { decimals: 1 })} %</span></span>
                <span className="font-mono">
                    {parts.map((p, i) => (
                        <React.Fragment key={p.nom}>
                            {i > 0 && ' / '}
                            {p.nom}: <PrivateAmount>{formatCAD(p.montant)}</PrivateAmount>
                        </React.Fragment>
                    ))}
                </span>
                <span className="flex items-center gap-2">Tendance (6 mois) <Sparkline data={trend} color={isOver ? '#f87171' : '#34b39a'} poste={item.name} /></span>
            </div>

            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold tracking-[0.06em] uppercase text-ink-400">Historique (6 derniers mois)</div>
                    {/* [REFONTE-NAV-L5] Cross-link sobre vers les transactions de la catégorie. */}
                    {onViewTransactions && (
                        <button
                            type="button"
                            onClick={() => onViewTransactions(item.name)}
                            className="touch-target inline-flex items-center text-meta text-ink-100 underline underline-offset-2 focus-ring rounded-sm px-1 -my-3 whitespace-nowrap"
                            aria-label={`Voir les transactions de la catégorie ${item.name}`}
                        >
                            Voir les transactions →
                        </button>
                    )}
                </div>
                {/* [A11Y-BUDGETGROUP-CHART-NOALT] `role="img"` + `aria-label` pour le nommer, et
                    `ChartDataTable` pour en LIRE les données. */}
                <div style={{ width: '100%', height: '150px' }} role="img" aria-label={`Dépenses mensuelles de ${item.name} sur les six derniers mois, comparées à la cible du poste.`}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={mensuel}>
                            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="name" stroke="#8896a8" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                            <YAxis stroke="#8896a8" tick={{ fontSize: 10 }} width={36} tickLine={false} axisLine={false} tickFormatter={maskedTick(isPrivacyMode, (v: number) => String(v))} />
                            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={CHART_TOOLTIP_STYLE} formatter={(val: number) => isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(val)} />
                            <ReferenceLine y={displayTarget} stroke="#8896a8" strokeDasharray="3 3" label={{ position: 'right', value: 'Cible', fill: '#8896a8', fontSize: 10 }} />
                            <Bar dataKey="value" fill={isOver ? '#f87171' : '#34b39a'} radius={[4, 4, 0, 0]} maxBarSize={40} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                {/* Les MÊMES données, en table `sr-only` : le formateur gère le mode discret — l'alternative
                    textuelle n'est pas une porte dérobée sur les montants (`DECISION-PRIVACY-UNE-SEULE-SORTIE`). */}
                <ChartDataTable
                    caption={`Dépenses mensuelles de ${item.name} sur les six derniers mois (cible : ${isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(displayTarget)})`}
                    columns={[
                        { key: 'name', label: 'Mois' },
                        { key: 'value', label: 'Dépense réelle', format: (v) => (isPrivacyMode ? MASKED_AMOUNT_LABEL : formatCAD(Number(v))) },
                    ]}
                    rows={mensuel}
                />
            </div>

            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={() => onDeleteItem(item.id)}
                    className="min-h-11 px-2 text-meta text-danger-400 underline underline-offset-2 focus-ring rounded-sm"
                >
                    Supprimer le poste
                </button>
            </div>
        </div>
    );
};
