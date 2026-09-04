import React, { useState, useMemo, useEffect, useRef } from 'react';
import { formatCAD } from '../../utils/format';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { splitEventIcon } from './ProjectionTooltip';
import { Icon } from '../ui/Icon';
import { PrivateAmount } from '../ui/PrivateAmount';
import { ProjectionChartPoint } from '../../services/projection/types';
import { transactionsOnDay } from '../../services/history/dayTransactions';
import { type DayVariationResult } from '../../services/history/dayVariation';
import { monthCategories } from '../../services/history/monthCategories';
import type { Transaction } from '../../types';
import { ACCOUNTS, type AccountDef } from './futureDetail/comptes';
import { DrillDownCompte } from './futureDetail/DrillDownCompte';
import { SectionCategoriesMois } from './futureDetail/SectionCategoriesMois';
import { SectionVariationJour } from './futureDetail/SectionVariationJour';
import { SectionTransactionsDuJour } from './futureDetail/SectionTransactionsDuJour';

/**
 * G9 P1 — fenêtre détaillée du graphique Futur (clic sur la courbe).
 *
 * Rendue via createPortal(document.body) pour échapper à l'ancêtre transformé
 * (`animate-fade-in`) qui piège position:fixed. Montre, pour le mois cliqué :
 * la valeur nette, tous les comptes (valeur + variation du mois), les flux
 * revenus/dépenses et le détail des événements. Clic sur un compte → son
 * historique (mini-graph zoomable réutilisant `useTimeChartZoom`).
 *
 * Phase 2 (à venir) : contribution-vs-gain + flèches de transfert (nécessite
 * une extension du moteur).
 */


/**
 * [PASSE-REEL-TXN-DU-JOUR] Les transactions de la journée cliquée, dans le PANNEAU EXISTANT
 * (cadrage confirmé par Marc : toutes les transactions, ici plutôt que dans une modale de plus).
 *
 * ⚠️ Ne s'affiche que pour une journée PASSÉE identifiée (`dayIso`). Un point MENSUEL ou FUTUR n'a
 * pas de transactions réelles à montrer — en inventer, même vides, serait un faux (`no-fake-data`).
 */
interface FutureDetailModalProps {
    point: ProjectionChartPoint;
    /** Liste COMPLÈTE des transactions ; filtrée au clic, jamais pré-indexée par jour. */
    transactions?: ReadonlyArray<Transaction>;
    /**
     * Journée cliquée ('YYYY-MM-DD'), ou `null` pour un point mensuel.
     * ⚠️ Passée EN PROP et surtout PAS lue sur `point` : l'appelant rebase un point quotidien sur
     * son mois hôte avant de le transmettre, ce qui efface `dayIso`. Voir le commentaire de
     * `detailDayIso` dans `FutureProjection.tsx`.
     */
    dayIso?: string | null;
    /** [PASSE-REEL-VARIATION-DU-JOUR] Ventilation de la variation du jour, calculée en amont sur les
     *  lignes reconstruites. `null` = pas de veille connue ⇒ on n'affirme rien. */
    variation?: DayVariationResult | null;
    /**
     * [FUTUR-DETAIL-STEP-DAY] Jour voisin (−1 = veille, +1 = lendemain) — demande de Marc
     * (2026-08-17) : « dans cette page là j'aimerais aussi pouvoir aller au lendemain ».
     * ⚠️ Le panneau était un CUL-DE-SAC : pour voir la journée suivante il fallait le fermer,
     * re-viser au pixel sur la courbe (un jour ≈ 6 px à ~150 jours affichés) et le rouvrir. Trois
     * gestes, dont un au pixel près, pour un déplacement d'un jour.
     * Absent ⇒ aucune flèche rendue (le panneau s'ouvre aussi sur des mois, où « lendemain » n'a
     * pas de sens).
     */
    onStepDay?: (dir: -1 | 1) => void;
    canStepPrev?: boolean;
    canStepNext?: boolean;
    /** [FUTUR-DETAIL-CATEGORIES-MOIS] Mois du point (`YYYY-MM`), UNIQUEMENT s'il est passé ou en
     *  cours. `null` sur un mois futur : le moteur n'y a pas de transactions, donc rien à
     *  catégoriser — en fabriquer une ventilation présenterait du projeté comme du constaté. */
    monthIso?: string | null;
    chartData: ProjectionChartPoint[];
    userName1?: string;
    userName2?: string;
    isPrivacyMode?: boolean;
    onClose: () => void;
}

export const FutureDetailModal: React.FC<FutureDetailModalProps> = ({
    point, chartData, transactions, dayIso = null, variation = null, monthIso = null, userName1, userName2, isPrivacyMode = false,
    onStepDay, canStepPrev = false, canStepNext = false, onClose,
}) => {
    const [selected, setSelected] = useState<AccountDef | null>(null);

    // [PASSE-REEL-TXN-DU-JOUR] Filtrage À LA DEMANDE. Le registre journalier couvre jusqu'à ~4 000
    // jours : y pré-indexer les transactions les garderait toutes en mémoire en permanence pour
    // n'en montrer qu'une journée. Ici, un balayage ponctuel sur une liste déjà chargée.
    const txnsDuJour = useMemo(() => transactionsOnDay(transactions, dayIso), [transactions, dayIso]);
    const catsDuMois = useMemo(() => monthCategories(transactions, monthIso), [transactions, monthIso]);

    // [A11Y-FUTUR-MILESTONES-KEYBOARD] Une modale ouvrable au CLAVIER (pastilles focusables,
    // Entrée) doit se fermer au clavier : Échap n'était géré NULLE PART — seul le bouton
    // « Fermer » et le clic-dehors fermaient (mesuré : l'e2e croyait Échap fonctionnel parce
    // qu'une boucle avalait son échec). Listener document : ferme quel que soit l'endroit où
    // le focus se trouve.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    // [Audit a11y #599, HIGH] Focus au MONTAGE UNIQUEMENT (deps []) : le callback-ref inline
    // d'avant changeait d'identité à chaque rendu → React ré-exécutait `.focus()` à CHAQUE
    // re-render (cliquer un compte → setSelected → le dialog ARRACHAIT le focus au bouton).
    // Même effet : on capture l'élément déclencheur (la pastille du graphe) pour lui RENDRE
    // le focus à la fermeture — sans ça, Tab repartait du haut de page après Échap/Fermer
    // (même mécanique que components/ui/Modal.tsx).
    const dialogRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialogRef.current?.focus();
        return () => { trigger?.focus(); };
    }, []);

    // [A11Y-FUTUR-DETAIL-FOCUS-TRAP] La modale avait `role="dialog" aria-modal="true"`, le focus au
    // montage et Échap — mais RIEN ne retenait Tab : la tabulation sortait vers le contenu de fond,
    // que l'overlay masque à la souris et laisse atteignable au clavier. Le piège vient du hook
    // partagé plutôt que d'une troisième copie du patron : les deux copies existantes avaient déjà
    // divergé sur la liste des éléments focusables.
    useFocusTrap(dialogRef);

    const idx = useMemo(
        () => chartData.findIndex((d) => d.monthIndex === point.monthIndex),
        [chartData, point.monthIndex],
    );
    const prev = idx > 0 ? chartData[idx - 1] : null;

    const accounts = ACCOUNTS.map((a) => {
        const value = Number(point[a.key]) || 0;
        const variation = value - (prev ? (Number(prev[a.key]) || 0) : value);
        const gain: number | null = a.gainKey ? (Number(point[a.gainKey]) || 0) : null;   // croissance marché du mois
        const flow: number | null = a.flowKey ? (Number(point[a.flowKey]) || 0) : null;   // apport net (dépôt − retrait)
        return { ...a, value, variation, gain, flow };
    }).filter((a) => a.value !== 0 || a.variation !== 0);

    /**
     * [FUTUR-DETAIL-TOTAL-COMPTES] Total des comptes — demande de Marc 2026-08-17 (« j'ai la somme
     * de chaque compte, je veux le total aussi »).
     *
     * ⚠️ Somme des MÊMES champs moteur que les lignes affichées, sur la liste NON filtrée : un
     * compte à 0 ne change rien au total, mais sommer la liste filtrée ferait dépendre un TOTAL
     * d'un critère d'AFFICHAGE — deux écrans montrant des lignes différentes donneraient alors des
     * totaux différents pour la même donnée.
     * ⚠️ Ce n'est PAS la valeur nette (déjà en haut du panneau) : les dettes en sont EXCLUES, elles
     * sont rendues à part juste en dessous. Le libellé doit donc dire « comptes », jamais
     * « patrimoine » — c'est tout l'écart entre les deux, et il vaut ici des dizaines de milliers.
     */
    const totalComptes = ACCOUNTS.reduce((acc, a) => acc + (Number(point[a.key]) || 0), 0);

    const fmt = (n: number) => formatCAD(n);

    // Dette qui tire le patrimoine net SOUS la somme des actifs affichés = Σ(actifs affichés) −
    // NetWorth. C'est exactement prêts/cartes + découvert + HELOC. On N'inclut PAS l'hypothèque :
    // « Immobilier » est déjà l'équité NETTE (valeur − hypothèque), donc l'hypothèque y est déjà
    // déduite. Cette quantité est RECONSTRUCTION-FIDÈLE : NetWorth = Σ(actifs) − reducingDebt, toujours
    // (sans cette ligne, un patrimoine net NÉGATIF n'était expliqué par AUCUN élément — bug Marc 2026-06-16).
    const shownAssetsSum = ACCOUNTS.reduce((s, a) => s + (Number(point[a.key]) || 0), 0);
    const reducingDebt = Math.max(0, shownAssetsSum - (Number(point.NetWorth) || 0));
    const liquidDebt = Number(point.LiquidDebt) || 0;          // part « découvert » (liquidité à sec)
    const otherReducingDebt = Math.max(0, reducingDebt - liquidDebt); // prêts/cartes + HELOC

    const portfolioOutflow = (point.RetraitREER || 0) + (point.RetraitCELI || 0);
    // [REVENUS-NON-VENTILES-AFFICHAGE] `Income` contient AUSSI le revenu locatif, les prestations
    // pour enfants et les paiements REEE — la ventilation n'en montrait aucun. MESURÉ : 3 551 $/mois
    // de loyer invisibles (scénario locatif) et 550 $/mois d'allocations (scénario 1 enfant) ; le
    // résidu `Income − (Marc + Anna + Retraite)` valait EXACTEMENT ces champs.
    // ⚠️ On les CONSOMME (le moteur les émet déjà), on ne les recalcule pas — cf.
    // `utils/chartDataSumGuard.ts` : additionner localement recréerait une source concurrente.
    const incomes = ([
        [`Paye ${userName1 || 'Util. 1'}`, point.IncomeMarc || 0],
        [`Paye ${userName2 || 'Util. 2'}`, point.IncomeAnna || 0],
        ['Rentes / Retraite', point.IncomeRetirement || 0],
        ['Revenus locatifs', point.RentalIncome || 0],
        ['Allocations familiales', point.childBenefits || 0],
        ['Paiement REEE', point.ReeePayout || 0],
        ['Décaissement portfolio', portfolioOutflow],
    ] as Array<[string, number]>).filter((entry) => entry[1] > 0);

    return createPortal(
        <div
            className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Détail du mois"
            ref={dialogRef}
            tabIndex={-1}
        >
            <div
                className="bg-dark border border-white/15 rounded-2xl shadow-[0_20px_70px_rgba(0,0,0,0.85)] w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5"
                onClick={(e) => e.stopPropagation()}
            >
                {/* En-tête */}
                <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b border-white/15">
                    <div>
                        {/* ⚠️ [finding a11y #645] `aria-live` OBLIGATOIRE depuis les flèches
                            Veille/Lendemain : le focus reste volontairement SUR le bouton pour
                            enchaîner les pas, et l'`aria-label` du bouton est STATIQUE. Sans région
                            live, un utilisateur de lecteur d'écran cliquerait « Lendemain » cinq
                            fois sans AUCUN retour sur le jour atteint — la feature marcherait à
                            l'œil et serait muette à l'oreille. Pattern APG du sélecteur de date. */}
                        <div className="text-lg font-black text-white tracking-tight" aria-live="polite" aria-atomic="true">{point.dateLabel || point.year || '—'}</div>
                        <div className="text-tiny text-ink-400 mt-0.5">Âge {point.age ?? '—'}</div>
                        {/* ⚠️ [WCAG 2.5.3 label-in-name] L'aria-label CONTIENT le texte visible :
                            un label de REMPLACEMENT (« Jour précédent » seul) casserait la commande
                            vocale — « clique Veille » ne trouverait aucun bouton de ce nom. Même
                            convention que les flèches de l'infobulle, dont c'est le jumeau. */}
                        {onStepDay && (
                            <div className="flex items-center gap-1.5 mt-2">
                                <button
                                    type="button"
                                    onClick={() => onStepDay(-1)}
                                    disabled={!canStepPrev}
                                    aria-label="Veille (jour précédent)"
                                    className="focus-ring inline-flex items-center justify-center min-h-[44px] text-tiny font-bold text-white bg-white/10 hover:bg-white/20 disabled:opacity-35 disabled:pointer-events-none border border-white/20 rounded-lg px-2.5 py-1.5 transition-colors"
                                >
                                    ← Veille
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onStepDay(1)}
                                    disabled={!canStepNext}
                                    aria-label="Lendemain (jour suivant)"
                                    className="focus-ring inline-flex items-center justify-center min-h-[44px] text-tiny font-bold text-white bg-white/10 hover:bg-white/20 disabled:opacity-35 disabled:pointer-events-none border border-white/20 rounded-lg px-2.5 py-1.5 transition-colors"
                                >
                                    Lendemain →
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="text-right">
                        <div className="text-tiny uppercase tracking-widest text-ink-400 font-bold">Valeur nette</div>
                        <PrivateAmount as="div" className="text-2xl font-black text-white font-mono leading-none mt-0.5">{fmt(point.NetWorth || 0)}</PrivateAmount>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Fermer"
                        className="shrink-0 inline-flex text-ink-400 hover:text-white leading-none p-1 -m-1 rounded focus-ring"
                    >
                        <Icon name="close" size={18} />
                    </button>
                </div>

                {!selected ? (
                    <>
                        {/* Comptes */}
                        <div className="text-tiny uppercase tracking-widest text-ink-400 font-bold mb-2">
                            Comptes — clique pour l'historique
                        </div>
                        <div className="space-y-1.5 mb-5">
                            {accounts.map((a) => (
                                <button
                                    key={a.key}
                                    type="button"
                                    onClick={() => setSelected(a)}
                                    className="w-full p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 transition-colors text-left focus-ring"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="flex items-center gap-2 min-w-0">
                                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: a.color }} />
                                            <span className="text-body text-white truncate">{a.label}</span>
                                        </span>
                                        <span className="flex items-center gap-2 shrink-0">
                                            <PrivateAmount className="font-mono text-body text-white">{fmt(a.value)}</PrivateAmount>
                                            <span className="text-ink-500" aria-hidden="true">›</span>
                                        </span>
                                    </div>
                                    {/* P2 — apport (ce que je mets) vs gain (croissance marché) */}
                                    {(a.flow !== null || a.gain !== null) ? (
                                        <div className="flex items-center gap-2 mt-1.5 pl-[18px] text-tiny font-mono">
                                            {a.flow !== null && (
                                                <PrivateAmount className={`px-1.5 py-0.5 rounded ${a.flow >= 0 ? 'text-sky-300 bg-sky-500/10' : 'text-orange-300 bg-orange-500/10'}`}>
                                                    Apport {a.flow > 0 ? '+' : ''}{fmt(a.flow)}
                                                </PrivateAmount>
                                            )}
                                            {a.gain !== null && (
                                                <PrivateAmount className={`px-1.5 py-0.5 rounded ${a.gain >= 0 ? 'text-green-300 bg-green-500/10' : 'text-red-300 bg-danger-500/10'}`}>
                                                    Gain {a.gain > 0 ? '+' : ''}{fmt(a.gain)}
                                                </PrivateAmount>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="mt-1.5 pl-[18px] text-tiny font-mono">
                                            <PrivateAmount className={`px-1.5 py-0.5 rounded ${a.variation >= 0 ? 'text-green-300 bg-green-500/10' : 'text-red-300 bg-danger-500/10'}`}>
                                                {a.variation > 0 ? '+' : ''}{fmt(a.variation)} ce mois
                                            </PrivateAmount>
                                        </div>
                                    )}
                                </button>
                            ))}

                            {/* Total — hors dettes, rendues juste en dessous. */}
                            <div className="flex items-baseline justify-between gap-2 pt-2 mt-1 border-t border-white/10 px-3">
                                <span className="text-tiny uppercase tracking-widest text-ink-300 font-bold">
                                    Total des comptes
                                    <span className="ml-1.5 normal-case tracking-normal text-ink-400 font-normal">— hors dettes</span>
                                </span>
                                <PrivateAmount className="font-mono text-body font-black text-white">{fmt(totalComptes)}</PrivateAmount>
                            </div>
                        </div>

                        {/* Dettes — explique un patrimoine net négatif (sinon invisible) */}
                        {reducingDebt > 0.5 && (
                            <div className="mb-5">
                                <div className="text-tiny uppercase tracking-widest text-danger-400/80 font-bold mb-2">
                                    Dettes
                                </div>
                                <div className="p-2.5 rounded-xl bg-danger-500/[0.06] border border-danger-500/20">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="flex items-center gap-2 min-w-0">
                                            <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-danger-500" />
                                            <span className="text-body text-white truncate">
                                                {liquidDebt > 0.5 && otherReducingDebt <= 0.5 ? 'Découvert (liquidités à sec)' : 'Dettes (prêts, cartes, découvert)'}
                                            </span>
                                        </span>
                                        <PrivateAmount className="font-mono text-body text-danger-400">-{fmt(reducingDebt)}</PrivateAmount>
                                    </div>
                                    {liquidDebt > 0.5 && otherReducingDebt > 0.5 && (
                                        <div className="mt-1.5 pl-[18px] text-tiny font-mono text-danger-400/80">
                                            <PrivateAmount className="px-1.5 py-0.5 rounded bg-danger-500/10">dont découvert non couvert : -{fmt(liquidDebt)}</PrivateAmount>
                                        </div>
                                    )}
                                    {liquidDebt > 0.5 && (
                                        <p className="mt-1.5 pl-[18px] text-tiny text-ink-400 leading-snug">
                                            Une dépense a dépassé tes liquidités et tes comptes ce mois-ci : le manque est porté en dette (vois « Événements ce mois »).
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Flux du mois */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
                            {incomes.map(([label, v]) => (
                                <div key={label} className="flex justify-between text-meta bg-white/[0.03] rounded-lg px-2.5 py-1.5">
                                    <span className="text-ink-400">{label}</span>
                                    <PrivateAmount className="font-mono text-green-400">+{fmt(v)}</PrivateAmount>
                                </div>
                            ))}
                            {(point.Expenses || 0) > 0 && (
                                <div className="flex justify-between text-meta bg-white/[0.03] rounded-lg px-2.5 py-1.5">
                                    <span className="text-ink-400">Dépenses</span>
                                    <PrivateAmount className="font-mono text-danger-400">-{fmt(point.Expenses || 0)}</PrivateAmount>
                                </div>
                            )}
                            <div className="flex justify-between text-meta font-bold bg-white/[0.05] rounded-lg px-2.5 py-1.5">
                                <span className="text-ink-200">Variation nette (mois)</span>
                                <PrivateAmount className={`font-mono ${(point.diffNW || 0) >= 0 ? 'text-green-400' : 'text-danger-400'}`}>
                                    {(point.diffNW || 0) > 0 ? '+' : ''}{fmt(point.diffNW || 0)}
                                </PrivateAmount>
                            </div>
                        </div>

                        {/* Événements */}
                        {((point.lifeEvents?.length ?? 0) > 0 || (point.flowEvents?.length ?? 0) > 0) && (
                            <div className="border-t border-white/10 pt-3">
                                <div className="text-tiny uppercase tracking-widest text-yellow-500 font-bold mb-2">Événements ce mois</div>
                                <ul className="space-y-1.5">
                                    {[...(point.lifeEvents || []), ...(point.flowEvents || [])].map((e: string, i: number) => {
                                        const { icon, text } = splitEventIcon(e);
                                        return (
                                            <li key={i} className="flex items-start gap-2 text-body text-ink-100">
                                                <span className="shrink-0" aria-hidden="true">{icon}</span>
                                                <span className="flex-1 break-words">{text}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}

                        {/* [PASSE-REEL-TXN-DU-JOUR] Les transactions de la journée — demande de Marc.
                            ⚠️ Rendu SEULEMENT si la journée est IDENTIFIÉE (`dayIso`) : un point
                            mensuel ou futur n'a pas de mouvements réels, et une section y serait un
                            faux.
                            ⚠️ [PASSE-REEL-TXN-JOUR-VIDE 2026-08-14, signalé par Marc « marche
                            toujours pas »] Mais une fois le jour identifié, l'absence de mouvement
                            est un FAIT MESURÉ, pas une invention — il faut le DIRE. La version
                            précédente ne rendait rien du tout dans ce cas : à l'écran, « aucun
                            mouvement ce jour-là » et « la fonctionnalité est cassée » étaient
                            RIGOUREUSEMENT indistinguables, et Marc a conclu la seconde. C'est la
                            règle no-fake-data appliquée au mauvais cas : elle interdit d'INVENTER
                            une donnée absente, pas d'ÉNONCER un zéro qu'on a mesuré.
                            Le silence n'est donc admissible que là où la question n'a pas de sens
                            (point mensuel/futur) — jamais là où elle en a une. */}
                        {/* ⚠️ `transactions` DOIT être fourni pour que la section existe — pas
                            seulement `dayIso`. La prop est optionnelle par son TYPE : sans cette
                            garde, un appelant qui oublie de la passer déclenche « aucun mouvement
                            ce jour-là », c'est-à-dire une affirmation de MESURE produite par une
                            ABSENCE de données. C'est pire que le silence qu'on vient de corriger,
                            parce que le message a l'autorité d'un fait constaté (finding
                            silent-failure-hunter sur cette PR). Une liste `[]` EXPLICITE reste
                            légitime : c'est une liste fournie et vide, donc une vraie mesure. */}
                        {/* [PASSE-REEL-VARIATION-DU-JOUR] La variation COMPLÈTE du jour, ventilée.
                            Demande de Marc : « tout compris mais détaillé ». Rendue AVANT la liste
                            des transactions, parce qu'elle en est le sur-ensemble : les transactions
                            expliquent la ligne « encaissé/décaissé », pas le reste.
                            ⚠️ `variation === null` (pas de veille connue) ⇒ RIEN. Une variation est
                            une différence : sans les deux jours, on n'affirme pas. */}
                        {/* [FUTUR-DETAIL-CATEGORIES-MOIS] Où est parti l'argent CE MOIS-LÀ, par
                            catégorie — demande de Marc, périmètre resserré par lui au PASSÉ.
                            ⚠️ `monthIso` est null sur un mois FUTUR : le moteur n'y a pas de
                            transactions (il applique des postes budgétaires et répartit), donc il
                            n'y a rien à catégoriser. Fabriquer une ventilation présenterait du
                            projeté comme du constaté — c'est la frontière que ce panneau tient
                            partout ailleurs, elle vaut ici aussi. */}
                        {/* ⚠️ `|| sansCategorie > 0` : un mois dont 100 % des dépenses n'ont pas de
                            catégorie faisait disparaître TOUTE la section, avertissement compris.
                            L'alerte « à classer » s'éteignait exactement quand tout était à classer,
                            et le mois paraissait vide pendant que la courbe descendait
                            (`SILENCE-READS-AS-BROKEN`). */}
                        {monthIso && (catsDuMois.depenses.length > 0 || catsDuMois.sansCategorie > 0) && (
                            <SectionCategoriesMois catsDuMois={catsDuMois} />
                        )}

                        {dayIso && variation && (
                            <SectionVariationJour variation={variation} />
                        )}

                        {dayIso && transactions && (
                            <SectionTransactionsDuJour
                                dayIso={dayIso}
                                txnsDuJour={txnsDuJour}
                                userName1={userName1}
                                userName2={userName2}
                            />
                        )}
                    </>
                ) : (
                    <>
                        <DrillDownCompte
                            selected={selected}
                            point={point}
                            chartData={chartData}
                            isPrivacyMode={isPrivacyMode}
                            onRetour={() => setSelected(null)}
                        />
                    </>
                )}
            </div>
        </div>,
        document.body,
    );
};
