import React, { useState, useMemo, useEffect, useRef } from 'react';
import { formatCAD, formatSigned } from '../../utils/format';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceDot } from 'recharts';
import { useTimeChartZoom } from '../../hooks/useTimeChartZoom';
import { splitEventIcon, ClickableEventIcon } from './ProjectionTooltip';
import { Icon, type IconName } from '../ui/Icon';
import { PrivateAmount } from '../ui/PrivateAmount';
import { PrivateText } from '../ui/PrivateText';
import { ChartDataTable, type ChartDataColumn } from '../ui/ChartDataTable';
import { MASKED_AMOUNT_LABEL } from '../../utils/privacyAria';
import { ProjectionChartPoint } from '../../services/projection/types';
import { transactionsOnDay } from '../../services/history/dayTransactions';
import { SEUIL_RESIDUEL_SIGNIFICATIF, type DayVariationResult } from '../../services/history/dayVariation';
import { monthCategories } from '../../services/history/monthCategories';
import type { Transaction } from '../../types';

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

interface AccountDef {
    key: string;
    label: string;
    color: string;
    /** Champ chartData du gain marché du mois (P2). */
    gainKey?: string;
    /** Champ chartData du flux net du mois (apport − retrait) (P2). */
    flowKey?: string;
    /** Champ chartData « espace + solde » (CELIMax/REERMax) — comptes enregistrés. */
    roomMaxKey?: string;
    /** Champ chartData des cotisations du mois (G19). */
    contribKey?: string;
}

const ACCOUNTS: AccountDef[] = [
    { key: 'Liquidites', label: 'Cash (Coussin)', color: '#5a6478', gainKey: 'MarketGrowthLiquid', flowKey: 'NetTransferLiquid' },
    { key: 'CELI', label: 'CELI', color: '#4f9d86', gainKey: 'MarketGrowthCELI', flowKey: 'NetTransferCELI', roomMaxKey: 'CELIMax', contribKey: 'ContribCELI' },
    { key: 'CELIAPP', label: 'CELIAPP (FHSA)', color: '#5cae9f', gainKey: 'MarketGrowthCELIAPP', flowKey: 'NetTransferCELIAPP', roomMaxKey: 'CELIAPPMax', contribKey: 'ContribCELIAPP' },
    { key: 'REER', label: 'REER', color: '#5b82bf', gainKey: 'MarketGrowthREER', flowKey: 'NetTransferREER', roomMaxKey: 'REERMax', contribKey: 'ContribREER' },
    { key: 'REEE', label: 'REEE (Études)', color: '#5093a8', gainKey: 'MarketGrowthREEE', flowKey: 'NetTransferREEE' },
    { key: 'NonReg', label: 'Non-Enregistré', color: '#c2974f', gainKey: 'MarketGrowthNonReg', flowKey: 'NetTransferNonReg' },
    { key: 'Crypto', label: 'Crypto', color: '#9277bd', gainKey: 'MarketGrowthCrypto', flowKey: 'NetTransferCrypto' },
    { key: 'Immobilier', label: 'Immobilier', color: '#bd7d9c' },
];

// G19 — espace de cotisation gagné par année (CELI/REER). Dérivation par
// conservation : espace_gagné(Y) = espace_dispo(fin Y) − espace_dispo(fin Y−1)
// + cotisations(Y). L'espace dispo = Max (espace + solde) − solde. Capture aussi
// le réajout d'espace CELI après retrait. Année 1 : pas de référence → gained=null.
interface RoomYear { year: number; gained: number | null; avail: number }
function computeRoomByYear(chartData: ProjectionChartPoint[], balanceKey: string, maxKey: string, contribKey: string): RoomYear[] {
    const byYear = new Map<number, { availLast: number; contribs: number }>();
    for (const d of chartData) {
        const avail = (Number(d[maxKey]) || 0) - (Number(d[balanceKey]) || 0);
        const yr = d.year ?? 0;
        const cur = byYear.get(yr) || { availLast: 0, contribs: 0 };
        cur.availLast = avail; // dernier mois vu = décembre
        cur.contribs += Number(d[contribKey]) || 0;
        byYear.set(yr, cur);
    }
    const years = [...byYear.keys()].sort((a, b) => a - b);
    return years.map((y, i) => {
        const e = byYear.get(y)!;
        const prev = i > 0 ? byYear.get(years[i - 1])!.availLast : null;
        return { year: y, gained: prev === null ? null : (e.availLast - prev + e.contribs), avail: e.availLast };
    });
}

// G13 — point enrichi du drill-down : la valeur du compte + les composantes qui
// expliquent son mouvement (toutes issues du moteur, aucune invention).
interface AccountPoint {
    monthIndex: number;
    year: number;
    dateLabel?: string;
    value: number;
    gain: number;        // MarketGrowthX — gain/perte marché du mois
    flow: number;        // NetTransferX — apport net (dépôts − retraits)
    events: string[];    // libellés exacts du moteur = la VRAIE cause d'un mouvement
    hasDecomp: boolean;  // false pour l'Immobilier (pas de gain/flow émis)
}

type ReasonTone = 'pos' | 'neg' | 'in' | 'out';
/**
 * [A11Y-PRIVACY-CHAINES-RESTANTES] `text` était une CHAÎNE qui portait le montant à l'intérieur
 * (« Rendement placements +1 200 $ »). Les deux surfaces qui l'affichent enveloppaient donc la
 * phrase ENTIÈRE dans `PrivateAmount` : en mode discret, la ligne devenait « ••• » — l'icône
 * comprise — et le FAIT disparaissait avec le chiffre. C'est l'autre moitié de la leçon du lot 56 :
 * garder le FAIT, taire le DÉTAIL. Le libellé et le montant sont donc séparés.
 */
interface MovementReason { icon: IconName; libelle: string; montant: number; tone: ReasonTone; }

const fmtMoney = (n: number) => formatCAD(n);

// G13 — décompose le mouvement d'un compte en composantes EXACTES : gain marché
// (MarketGrowthX) vs apport/retrait net (NetTransferX). On ne devine PAS la cause
// d'un retrait (un retrait CELI peut être un achat immo via RAP, pas forcément la
// retraite) : la cause précise vient des événements du mois, affichés à part.
function explainMovement(d: AccountPoint): MovementReason[] {
    if (!d.hasDecomp) return [];
    const out: MovementReason[] = [];
    if (d.gain > 0.5) out.push({ icon: 'investments', libelle: 'Rendement placements', montant: d.gain, tone: 'pos' });
    else if (d.gain < -0.5) out.push({ icon: 'debt', libelle: 'Perte de marché', montant: d.gain, tone: 'neg' });
    if (d.flow > 0.5) out.push({ icon: 'cash', libelle: 'Dépôt (argent ajouté)', montant: d.flow, tone: 'in' });
    else if (d.flow < -0.5) out.push({ icon: 'bank', libelle: 'Retrait (argent sorti)', montant: d.flow, tone: 'out' });
    return out;
}

const REASON_TONE_CLASS: Record<ReasonTone, string> = {
    pos: 'text-green-300 bg-green-500/10',
    neg: 'text-red-300 bg-danger-500/10',
    in: 'text-sky-300 bg-sky-500/10',
    out: 'text-orange-300 bg-orange-500/10',
};

interface AccountDrillTooltipProps {
    active?: boolean;
    payload?: Array<{ payload: AccountPoint }>;
    accountLabel: string;
}

// G13 — infobulle du drill-down : valeur du mois + le « pourquoi » (gain marché,
// apport/retrait + origine) + événements. Niveau module → recharts y injecte
// `active`/`payload`, on lui passe `accountLabel` en prop. Le masquage des montants
// (mode discret) est géré par `<PrivateAmount>` (lit le store directement).
const AccountDrillTooltip: React.FC<AccountDrillTooltipProps> = ({ active, payload, accountLabel }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as AccountPoint;
    const reasons = explainMovement(d);
    return (
        <div className="bg-[#11161f] border border-white/15 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] p-3 w-56 text-meta">
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="font-bold text-white">{d.dateLabel || d.year}</span>
                <span className="text-tiny text-ink-400">{accountLabel}</span>
            </div>
            <PrivateAmount as="div" className="font-mono text-base font-black text-white mb-2">{fmtMoney(d.value)}</PrivateAmount>
            {reasons.length > 0 ? (
                <div className="space-y-1">
                    <div className="text-tiny uppercase tracking-wide text-ink-400 font-bold">Ce mois</div>
                    {reasons.map((r, i) => (
                        <div key={i} className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded font-mono ${REASON_TONE_CLASS[r.tone]}`}>
                            <Icon name={r.icon} size={12} />{r.libelle}{' '}
                            <PrivateAmount>{formatSigned(r.montant, { withCurrency: true })}</PrivateAmount>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-tiny text-ink-400">Équité = capital d’hypothèque remboursé + valorisation</div>
            )}
            {d.events.length > 0 && (
                <div className="mt-2 pt-1.5 border-t border-white/10 space-y-1">
                    {d.events.map((e, i) => {
                        const { icon, text } = splitEventIcon(e);
                        return (
                            <div key={i} className="flex items-start gap-1.5 text-tiny text-yellow-200">
                                <span aria-hidden="true">{icon}</span><span className="flex-1">{text}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

/**
 * [PASSE-REEL-TXN-DU-JOUR] Détail d'une transaction, au-delà du montant — demande de Marc
 * (« je veux voir les transactions et leur montant et plus de détail »).
 *
 * ⚠️ UNIQUEMENT des faits présents sur la donnée. Rien n'est déduit, rien n'est comblé : un champ
 * absent ne produit AUCUNE pastille plutôt qu'un « inconnu » qui aurait l'air d'une information.
 * Le statut « traité » n'est pas affiché non plus — c'est le cas NORMAL, et une pastille sur chaque
 * ligne ne dirait rien tout en noyant celles qui, elles, méritent l'œil.
 */
/** En dessous, la catégorie proposée par l'IA mérite un coup d'œil. Échelle 0-100. */
const SEUIL_CONFIANCE_FAIBLE = 70;

const detailsTransaction = (
    t: Transaction,
    userName1?: string,
    userName2?: string,
): Array<{ texte: string; ton: 'neutre' | 'attention' }> => {
    const out: Array<{ texte: string; ton: 'neutre' | 'attention' }> = [];

    // Statut : seuls les cas ANORMAUX parlent.
    if (t.status === 'pending') out.push({ texte: 'en attente', ton: 'attention' });
    else if (t.status === 'error') out.push({ texte: 'erreur d\u2019import', ton: 'attention' });
    else if (t.status === 'manual') out.push({ texte: 'saisie manuelle', ton: 'neutre' });

    // Conjoint : seulement s'il y a une ATTRIBUTION EXPLICITE et un nom à afficher.
    // ⚠️ DIVERGENCE ASSUMÉE avec `resolveTransactionOwner` (`utils/budget.ts`), qui sert la
    // ventilation budgétaire : lui RÉSOUT un propriétaire quand `ownerId` est absent, en déduisant
    // du type de poste (`Perso 1`->0, `Perso 2`->1). Ici on ne montre que le fait EXPLICITE — une
    // déduction affichée comme un nom se lirait comme une certitude. Conséquence à connaître : une
    // transaction imputée à un conjoint dans la vue Budget peut n'avoir AUCUNE pastille ici.
    if (t.ownerId === 0 && userName1) out.push({ texte: userName1, ton: 'neutre' });
    if (t.ownerId === 1 && userName2) out.push({ texte: userName2, ton: 'neutre' });

    // Origine de la catégorie : ce qui dit s'il faut lui faire confiance.
    if (t.isVerified) out.push({ texte: 'v\u00e9rifi\u00e9e', ton: 'neutre' });
    else if (t.isAiProcessed) {
        // ⚠️ `confidence` est en 0-100, PAS une fraction 0-1. Mesuré chez TOUS ses producteurs
        // (`claude.ts` : 100 ; `applyTransferDetection` : 100 ; personas : 95) et confirmé par le
        // consommateur existant `Transactions.tsx`, qui affiche `${t.confidence}%` SANS multiplier.
        // Mon `* 100` initial affichait « 9 500 % » — et surtout le seuil d'alerte devenait
        // INATTEIGNABLE : une vraie confiance de 42 devenait 4 200, donc « >= 70 », donc jamais en
        // ambre. La pastille aurait perdu sa seule raison d'être sur TOUTE donnée réelle.
        const pct = Number.isFinite(t.confidence) ? Math.round(t.confidence as number) : null;
        out.push({ texte: pct === null ? 'class\u00e9e par IA' : `class\u00e9e par IA \u00b7 ${pct}\u202f%`, ton: pct !== null && pct < SEUIL_CONFIANCE_FAIBLE ? 'attention' : 'neutre' });
    }

    // Catégorie d'origine, seulement si elle DIFFÈRE — sinon c'est du bruit.
    if (t.originalCategory && t.originalCategory !== t.category) {
        out.push({ texte: `avant : ${t.originalCategory}`, ton: 'neutre' });
    }
    return out;
};

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

    /**
     * [PASSE-REEL-VARIATION-DU-JOUR] Section REPLIABLE, FERMÉE par défaut — choix de Marc
     * (`docs/adr/`), pour garder le panneau court.
     *
     * ⚠️ Je lui ai signalé le risque au moment de la question : une feature gatée par une
     * interaction se fait oublier (`UX-UNREACHABLE-FEATURE`). Il assume, ET les deux contraintes qui
     * en découlent sont donc obligatoires :
     *   • l'état ouvert/fermé est PERSISTÉ — sinon son choix serait à refaire à chaque ouverture,
     *     ce qui transformerait « repliable » en « toujours fermée » ;
     *   • le titre replié dit ce qu'il contient de façon AUTONOME (montant de la variation compris),
     *     pour que la valeur soit lisible SANS déplier.
     */
    const [variationOuverte, setVariationOuverte] = useState<boolean>(() => {
        try { return localStorage.getItem('future:variationJour:open') === '1'; } catch { return false; }
    });
    const basculerVariation = () => {
        setVariationOuverte((v) => {
            const suivant = !v;
            // Persistance DANS le setter — même convention que `future:hiddenSeries:v1`.
            try { localStorage.setItem('future:variationJour:open', suivant ? '1' : '0'); } catch { /* stockage indisponible : le pli reste juste non mémorisé */ }
            return suivant;
        });
    };

    const LIBELLE_SOURCE: Record<string, string> = {
        tresorerie: 'Encaissé / décaissé',
        // ⚠️ Le côté PLACEMENT d'un achat de titre. Il s'annule avec « Encaissé / décaissé » — mais
        // seulement parce que les DEUX sont là : sans cette ligne, le résiduel valait les dépôts.
        depots: 'Placé (achat de titres)',
        rendement: 'Rendement des placements',
        immobilier: 'Équité immobilière',
        dettes: 'Dettes',
    };

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

    // Série temporelle du compte sélectionné (drill-down), enrichie des
    // composantes qui expliquent chaque mouvement (G13).
    const accountSeries = useMemo<AccountPoint[]>(() => {
        if (!selected) return [];
        const hasDecomp = !!(selected.gainKey || selected.flowKey);
        return chartData.map((d) => ({
            monthIndex: d.monthIndex,
            year: d.year ?? 0,
            dateLabel: d.dateLabel,
            value: Number(d[selected.key]) || 0,
            gain: selected.gainKey ? (Number(d[selected.gainKey]) || 0) : 0,
            flow: selected.flowKey ? (Number(d[selected.flowKey]) || 0) : 0,
            events: [...(d.lifeEvents || []), ...(d.flowEvents || [])],
            hasDecomp,
        }));
    }, [chartData, selected]);
    const zoom = useTimeChartZoom<AccountPoint>(accountSeries);

    // G13 — « moments clés » : les plus gros mouvements mois-à-mois du compte,
    // avec leur explication. Triés par ampleur puis réordonnés chronologiquement.
    const keyMoments = useMemo(() => {
        if (!selected || accountSeries.length < 2) return [];
        const withDelta = accountSeries.map((d, i) => ({
            ...d,
            delta: i > 0 ? d.value - accountSeries[i - 1].value : 0,
        }));
        return withDelta
            .filter((d) => Math.abs(d.delta) > 1)
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
            .slice(0, 5)
            .sort((a, b) => a.monthIndex - b.monthIndex);
    }, [accountSeries, selected]);
    const lastMonth = accountSeries.length ? accountSeries[accountSeries.length - 1].monthIndex : 0;
    const idxForYears = (yrs: number) => {
        const i = accountSeries.findIndex((d) => d.monthIndex >= yrs * 12);
        return i === -1 ? accountSeries.length - 1 : i;
    };

    // G16 — marqueurs d'événements sur le mini-graph (retraits, dépôts, achats…).
    // On exclut le bruit récurrent (« régénération de l'espace ») et on plafonne
    // la densité pour ne pas surcharger le petit graphique.
    const eventMarkers = selected ? (() => {
        const NOISE = /r[ée]g[ée]n[ée]ration|espace de cotis/i;
        const all = zoom.visibleData
            .filter((d) => d.events.some((e) => !NOISE.test(e)))
            .map((d) => ({ monthIndex: d.monthIndex, value: d.value, label: d.events.find((e) => !NOISE.test(e)) || d.events[0] }));
        const step = Math.max(1, Math.ceil(all.length / 12));
        return all.filter((_, i) => i % step === 0);
    })() : [];

    // G19 — espace de cotisation gagné par année (CELI/REER uniquement).
    const roomByYear = selected?.roomMaxKey && selected.contribKey
        ? computeRoomByYear(chartData, selected.key, selected.roomMaxKey, selected.contribKey)
        : [];

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

    // [A11Y-CHARTS] (LOT 3) — colonnes de la table sr-only du mini-graphe de drill-down d'un compte
    // (série temporelle de sa valeur, opaque aux lecteurs d'écran). Année (axe X via monthIndex,
    // visible) + valeur du compte ($, masquée en mode privé — `isPrivacyMode` arrive en prop ici,
    // pas du store). N'affichée que lorsqu'un compte est sélectionné (drill-down ouvert).
    const accountSeriesColumns: ChartDataColumn[] = [
        { key: 'year', label: 'Année', format: (v) => v != null ? String(v) : '' },
        { key: 'value', label: selected ? selected.label : 'Valeur', format: (v) => isPrivacyMode ? MASKED_AMOUNT_LABEL : fmt(Number(v) || 0) },
    ];

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
                            <div className="border-t border-white/10 pt-3">
                                <div className="flex items-baseline justify-between gap-2 mb-2">
                                    <div className="text-tiny uppercase tracking-widest text-ink-400 font-bold">
                                        Dépenses du mois par catégorie
                                    </div>
                                    <PrivateAmount className="font-mono text-meta text-ink-200">{fmt(-catsDuMois.totalDepenses)}</PrivateAmount>
                                </div>
                                <div className="space-y-1">
                                    {catsDuMois.depenses.map((c) => (
                                        <div key={c.categorie} className="flex items-baseline justify-between gap-2 text-meta">
                                            <span className="text-ink-200">
                                                <PrivateText quoi="categorie">{c.categorie}</PrivateText>
                                                <span className="ml-1.5 text-tiny text-ink-400">
                                                    {c.nombre} {c.nombre > 1 ? 'transactions' : 'transaction'}
                                                </span>
                                            </span>
                                            <PrivateAmount className="font-mono text-ink-200">{fmt(-c.montant)}</PrivateAmount>
                                        </div>
                                    ))}
                                </div>
                                {/* ⚠️ Dit, jamais fondu dans un « Autre » inventé : une dépense sans
                                    catégorie est un import à classer, pas une catégorie. La ranger
                                    sous un nom fabriqué la rendrait invisible EN TANT QUE problème. */}
                                {catsDuMois.sansCategorie > 0 && (
                                    <>
                                        {/* ⚠️ Une LIGNE avec son MONTANT, pas seulement un compte : sans
                                            elle, l'en-tête affiche un total supérieur à la somme des
                                            lignes et l'écart est laissé à la soustraction mentale. Le
                                            même panneau expose son résiduel en $ trois blocs plus haut ;
                                            la même exigence vaut ici.
                                            ⚠️ Ce n'est PAS une catégorie « Autre » inventée : le libellé
                                            nomme le problème (à classer), pas une nature de dépense. */}
                                        <div className="flex items-baseline justify-between gap-2 text-meta border-t border-white/5 mt-1 pt-1">
                                            <span className="text-amber-300/90">
                                                Sans catégorie
                                                <span className="ml-1.5 text-tiny text-amber-300/70">
                                                    {catsDuMois.sansCategorie} {catsDuMois.sansCategorie > 1 ? 'transactions' : 'transaction'}
                                                </span>
                                            </span>
                                            <PrivateAmount className="font-mono text-amber-300/90">{fmt(-catsDuMois.montantSansCategorie)}</PrivateAmount>
                                        </div>
                                        <p className="text-tiny text-amber-300/90 mt-1.5 leading-snug">
                                            {catsDuMois.sansCategorie > 1 ? 'Ces dépenses sont comptées' : 'Cette dépense est comptée'} dans
                                            le total mais {catsDuMois.sansCategorie > 1 ? 'n\u2019ont' : 'n\u2019a'} pas de catégorie — à classer dans Transactions.
                                        </p>
                                    </>
                                )}
                            </div>
                        )}

                        {dayIso && variation && (
                            <div className="border-t border-white/10 pt-3">
                                <button
                                    type="button"
                                    onClick={basculerVariation}
                                    aria-expanded={variationOuverte}
                                    className="w-full flex items-baseline justify-between gap-2 text-left focus-ring rounded"
                                >
                                    {/* Titre AUTONOME : le montant est lisible sans déplier. */}
                                    <span className="text-tiny uppercase tracking-widest text-ink-400 font-bold">
                                        <span aria-hidden="true" className="mr-1 inline-block">{variationOuverte ? '▾' : '▸'}</span>
                                        Variation du patrimoine ce jour-là
                                    </span>
                                    <PrivateAmount className={`font-mono text-meta ${variation.deltaNetWorth >= 0 ? 'text-green-400' : 'text-danger-400'}`}>
                                        {variation.deltaNetWorth > 0 ? '+' : ''}{fmt(variation.deltaNetWorth)}
                                    </PrivateAmount>
                                </button>

                                {variationOuverte && (
                                    <div className="mt-2 space-y-1">
                                        {variation.sources.filter((src) => Math.abs(src.montant) > 0.005).map((src) => (
                                            <div key={src.cle} className="flex items-baseline justify-between gap-2 text-meta">
                                                <span className="text-ink-300">{LIBELLE_SOURCE[src.cle] ?? src.cle}</span>
                                                <PrivateAmount className={`font-mono ${src.montant >= 0 ? 'text-green-300' : 'text-ink-200'}`}>
                                                    {src.montant > 0 ? '+' : ''}{fmt(src.montant)}
                                                </PrivateAmount>
                                            </div>
                                        ))}

                                        {/* ⚠️ Le RÉSIDUEL est AFFICHÉ, jamais absorbé par un poste
                                            « autre » : un fourre-tout fermerait le total par
                                            construction et la vérification deviendrait circulaire. */}
                                        {Math.abs(variation.residuel) >= SEUIL_RESIDUEL_SIGNIFICATIF && (
                                            <div className="flex items-baseline justify-between gap-2 text-meta border-t border-white/5 pt-1">
                                                <span className="text-amber-300">Non expliqué</span>
                                                <PrivateAmount className="font-mono text-amber-300">
                                                    {variation.residuel > 0 ? '+' : ''}{fmt(variation.residuel)}
                                                </PrivateAmount>
                                            </div>
                                        )}

                                        {/* ⚠️ Ce n'est PLUS le résiduel qui détecte ce cas : depuis que
                                            les dépôts sont une source, il se ferme même quand l'argent
                                            n'a jamais quitté le compte. Ce drapeau prend le relais —
                                            sinon le correctif du résiduel MASQUERAIT le défaut qu'il
                                            rendait visible par accident. */}
                                        {variation.depotsNonFinances > 0.005 && (
                                            <p className="text-tiny text-amber-300/90 leading-snug pt-1">
                                                ⚠ <PrivateAmount as="span" className="font-mono">{fmt(variation.depotsNonFinances)}</PrivateAmount> de titres
                                                sont entrés sans qu'aucune sortie d'argent ne les finance ce jour-là. Ton patrimoine
                                                paraît donc monter d'autant, alors que tu as seulement déplacé de l'argent : l'achat
                                                est probablement marqué « virement interne » dans tes transactions, ce qui l'exclut du
                                                calcul de tes liquidités.
                                            </p>
                                        )}

                                        {/* Mouvement INTERNE : montré parce qu'il est utile, et à somme
                                            nulle sur le patrimoine — les deux lignes ci-dessus
                                            (« Encaissé / décaissé » et « Placé ») s'annulent. */}
                                        {Math.abs(variation.depotsInternes) > 0.005 && (
                                            <p className="text-tiny text-ink-400 leading-snug pt-1">
                                                Dont <PrivateAmount as="span" className="font-mono">{fmt(variation.depotsInternes)}</PrivateAmount> déplacés
                                                de tes liquidités vers tes placements — ça ne change pas ton patrimoine, seulement où il se trouve.
                                            </p>
                                        )}

                                        {variation.immobilierEstPalier && (
                                            <p className="text-tiny text-ink-400 leading-snug pt-1">
                                                L'équité immobilière est connue à l'<strong className="text-ink-200">année</strong>, pas au jour :
                                                elle bouge par palier. Ce n'est pas un gain réalisé ce jour-là.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {dayIso && transactions && (
                            <div className="border-t border-white/10 pt-3">
                        {(txnsDuJour.counted.length > 0 || txnsDuJour.excluded.length > 0) ? (
                            <>
                                <div className="flex items-baseline justify-between gap-2 mb-2">
                                    <div className="text-tiny uppercase tracking-widest text-ink-400 font-bold">
                                        Transactions du {dayIso}
                                        <span className="ml-1.5 normal-case tracking-normal text-ink-400/80 font-normal">
                                            — net encaissé/décaissé
                                        </span>
                                    </div>
                                    <PrivateAmount className={`font-mono text-meta ${txnsDuJour.netCounted >= 0 ? 'text-green-400' : 'text-danger-400'}`}>
                                        {txnsDuJour.netCounted > 0 ? '+' : ''}{fmt(txnsDuJour.netCounted)}
                                    </PrivateAmount>
                                </div>
                                <div className="max-h-64 overflow-y-auto rounded-lg border border-white/10">
                                    <table className="w-full text-meta">
                                        <caption className="sr-only">
                                            Transactions du {dayIso}. Les lignes marquées sont exclues du calcul de la courbe.
                                        </caption>
                                        <thead className="sticky top-0 bg-dark">
                                            <tr className="text-tiny uppercase tracking-wide text-ink-400">
                                                <th scope="col" className="text-left font-bold px-2.5 py-1.5">Marchand</th>
                                                <th scope="col" className="text-left font-bold px-2.5 py-1.5">Catégorie</th>
                                                <th scope="col" className="text-right font-bold px-2.5 py-1.5">Montant</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {txnsDuJour.counted.map((t) => (
                                                <tr key={`c-${t.id}`} className="border-t border-white/5">
                                                    <td className="px-2.5 py-1.5 text-ink-100 align-top">
                                                        <PrivateText>{t.payee}</PrivateText>
                                                        {t.accountName && <span className="text-tiny text-ink-400"> · {t.accountName}</span>}
                                                        {(() => {
                                                            const d = detailsTransaction(t, userName1, userName2);
                                                            if (d.length === 0) return null;
                                                            return (
                                                                <div className="flex flex-wrap gap-1 mt-0.5">
                                                                    {d.map((x, i) => (
                                                                        <span
                                                                            key={i}
                                                                            className={`text-tiny px-1.5 py-px rounded border ${x.ton === 'attention'
                                                                                ? 'text-amber-300 border-amber-400/30 bg-amber-400/10'
                                                                                : 'text-ink-300 border-white/10 bg-white/5'}`}
                                                                        >
                                                                            {x.texte}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>
                                                    <td className="px-2.5 py-1.5 text-ink-400"><PrivateText quoi="categorie">{t.category}</PrivateText></td>
                                                    <td className={`px-2.5 py-1.5 text-right font-mono ${t.amount >= 0 ? 'text-green-300' : 'text-ink-200'}`}>
                                                        <PrivateAmount>{fmt(t.amount)}</PrivateAmount>
                                                    </td>
                                                </tr>
                                            ))}
                                            {/* Montrées mais BARRÉES : la liste doit correspondre au relevé bancaire,
                                                pendant que le total reste celui des seules transactions comptées.
                                                Masquer ces lignes trahirait la première promesse, les compter la seconde.
                                                ⚠️ PAS d'`opacity-60` sur ces lignes : `text-ink-300`/`text-ink-400` sont
                                                DÉJÀ des shades atténués, tout juste AA à pleine opacité — les composer
                                                avec une opacité tombait sous le seuil (~3,0-3,4:1, mesuré par la revue),
                                                précisément sur la ligne qui EXPLIQUE pourquoi elle ne compte pas.
                                                ⚠️ `npm run check-contrast` ne l'aurait PAS vu : scan statique
                                                token-vs-token, aveugle aux classes `opacity-*`. Le `line-through` suffit
                                                à dire « exclu » ; l'atténuation porte sur le FOND, qui n'a pas de texte. */}
                                            {txnsDuJour.excluded.map(({ txn, reason }) => (
                                                <tr key={`e-${txn.id}`} className="border-t border-white/5 bg-white/[0.02]">
                                                    <td className="px-2.5 py-1.5 text-ink-300 align-top">
                                                        <span className="line-through"><PrivateText>{txn.payee}</PrivateText></span>
                                                        {txn.accountName && <span className="text-tiny text-ink-400"> · {txn.accountName}</span>}
                                                        <span className="text-tiny text-amber-300"> · {reason}</span>
                                                        {(() => {
                                                            const d = detailsTransaction(txn, userName1, userName2);
                                                            if (d.length === 0) return null;
                                                            return (
                                                                <div className="flex flex-wrap gap-1 mt-0.5">
                                                                    {d.map((x, i) => (
                                                                        <span
                                                                            key={i}
                                                                            className={`text-tiny px-1.5 py-px rounded border ${x.ton === 'attention'
                                                                                ? 'text-amber-300 border-amber-400/30 bg-amber-400/10'
                                                                                : 'text-ink-300 border-white/10 bg-white/5'}`}
                                                                        >
                                                                            {x.texte}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>
                                                    <td className="px-2.5 py-1.5 text-ink-400"><PrivateText quoi="categorie">{txn.category}</PrivateText></td>
                                                    <td className="px-2.5 py-1.5 text-right font-mono text-ink-400 line-through">
                                                        <PrivateAmount>{fmt(txn.amount)}</PrivateAmount>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {txnsDuJour.excluded.length > 0 && (
                                    <p className="text-tiny text-ink-400 mt-1.5 leading-snug">
                                        Les lignes barrées apparaissent sur ton relevé mais ne bougent pas la courbe :
                                        un doublon est un artefact d'import, un virement interne déplace l'argent sans
                                        le faire entrer ni sortir de ton patrimoine.
                                    </p>
                                )}
                            </>
                        ) : (
                            /* Le jour est identifié et RIEN n'y a bougé : on le DIT. Sans cette
                               branche, l'écran était muet — et un écran muet se lit « c'est
                               cassé », pas « il n'y a rien ». */
                            <p className="text-tiny text-ink-400 leading-snug">
                                <span className="uppercase tracking-widest text-ink-400 font-bold">
                                    Transactions du {dayIso}
                                </span>
                                {' — '}aucun mouvement ce jour-là. La courbe peut malgré tout bouger : le rendement
                                de tes placements et l'équité immobilière n'ont pas de transaction associée.
                            </p>
                        )}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        {/* Drill-down compte */}
                        <button
                            type="button"
                            onClick={() => setSelected(null)}
                            className="text-tiny font-bold text-ink-300 hover:text-white mb-3 focus-ring rounded"
                        >
                            ‹ Retour aux comptes
                        </button>
                        <div className="flex items-center gap-2 mb-3">
                            <span className="w-3 h-3 rounded-full" style={{ background: selected.color }} />
                            <span className="font-bold text-white">{selected.label}</span>
                            <PrivateAmount className="ml-auto font-mono text-body text-white">{fmt(Number(point[selected.key]) || 0)}</PrivateAmount>
                        </div>

                        {/* Sélecteur de période */}
                        <div className="flex gap-0.5 p-0.5 rounded-card bg-black/30 border border-white/5 w-fit mb-2">
                            {[5, 10, 20, 30].filter((y) => y * 12 < lastMonth).map((y) => {
                                const active = !!zoom.range && zoom.range[0] === 0 && zoom.range[1] === idxForYears(y);
                                return (
                                    <button
                                        key={y}
                                        type="button"
                                        onClick={() => zoom.showRange(0, idxForYears(y))}
                                        className={`px-2 py-0.5 text-tiny font-bold rounded transition-colors focus-ring ${active ? 'bg-primary text-dark' : 'text-ink-300 hover:text-dark hover:bg-white/10'}`}
                                    >
                                        {y} ans
                                    </button>
                                );
                            })}
                            <button
                                type="button"
                                onClick={zoom.reset}
                                className={`px-2 py-0.5 text-tiny font-bold rounded transition-colors focus-ring ${!zoom.isZoomed ? 'bg-primary text-dark' : 'text-ink-300 hover:text-dark hover:bg-white/10'}`}
                            >
                                Tout
                            </button>
                        </div>

                        <div
                            ref={zoom.containerRef}
                            {...zoom.handlers}
                            role="img"
                            aria-label={`Historique de la valeur du compte ${selected.label} dans le temps, année par année.`}
                            className={`relative w-full h-[300px] select-none ${zoom.isZoomed && zoom.isPanning ? 'cursor-grabbing' : zoom.isZoomed ? 'cursor-grab' : 'cursor-default'}`}
                        >
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={zoom.visibleData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="acct-grad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={selected.color} stopOpacity={0.6} />
                                            <stop offset="95%" stopColor={selected.color} stopOpacity={0.03} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                                    <XAxis
                                        dataKey="monthIndex"
                                        stroke="#666"
                                        tick={{ fontSize: 10 }}
                                        minTickGap={40}
                                        tickFormatter={(v) => { const m = accountSeries.find((d) => d.monthIndex === v); return m ? `${m.year}` : `${v}`; }}
                                    />
                                    <YAxis stroke="#666" tick={{ fontSize: 10 }} width={50} tickFormatter={(v) => isPrivacyMode ? '***' : `${(v / 1000).toFixed(0)}k`} />
                                    <Tooltip
                                        cursor={{ stroke: selected.color, strokeOpacity: 0.4 }}
                                        content={<AccountDrillTooltip accountLabel={selected.label} />}
                                    />
                                    <Area type="monotone" dataKey="value" stroke={selected.color} strokeWidth={2} fill="url(#acct-grad)" isAnimationActive={false} name={selected.label} />
                                    {eventMarkers.map((mk, i) => (
                                        <ReferenceDot
                                            key={`evt-${mk.monthIndex}-${i}`}
                                            x={mk.monthIndex}
                                            y={mk.value}
                                            r={2}
                                            shape={<ClickableEventIcon kind="flow" payload={{ label: mk.label }} />}
                                        />
                                    ))}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="text-tiny text-ink-400 mt-2 text-center">Molette = zoom · glisser = défiler · double-clic = reset</p>
                        {/* [A11Y-CHARTS] (LOT 3) — alternative TEXTUELLE (sr-only) au mini-graphe de
                            drill-down : valeur du compte par année en table accessible (donnée complète
                            `accountSeries`, pas la vue zoomée). */}
                        <ChartDataTable
                            caption={`Historique de la valeur du compte ${selected.label} par année`}
                            columns={accountSeriesColumns}
                            rows={accountSeries as unknown as ReadonlyArray<Record<string, unknown>>}
                        />

                        {/* G13 — pourquoi la valeur bouge : plus gros mouvements + raison */}
                        {keyMoments.length > 0 && (
                            <div className="mt-4 border-t border-white/10 pt-3">
                                <div className="text-tiny uppercase tracking-widest text-ink-400 font-bold mb-1">
                                    Pourquoi ça bouge — moments clés
                                </div>
                                <p className="text-tiny text-ink-400 mb-2 leading-snug">
                                    La <span className="text-ink-300 font-semibold">variation</span> d'un mois = rendement de tes placements (marché)
                                    + tes dépôts − tes retraits. Détail ci-dessous.
                                </p>
                                <ul className="space-y-2">
                                    {keyMoments.map((d) => {
                                        const reasons = explainMovement(d);
                                        return (
                                            <li key={d.monthIndex} className="bg-white/[0.03] rounded-lg p-2.5">
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <span className="text-meta font-bold text-white">{d.dateLabel || d.year}</span>
                                                    <PrivateAmount className={`font-mono text-meta font-bold ${d.delta >= 0 ? 'text-green-400' : 'text-danger-400'}`}>
                                                        {d.delta > 0 ? '+' : ''}{fmtMoney(d.delta)}
                                                    </PrivateAmount>
                                                </div>
                                                {reasons.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {reasons.map((r, i) => (
                                                            <span key={i} className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-tiny font-mono ${REASON_TONE_CLASS[r.tone]}`}>
                                                                <Icon name={r.icon} size={11} />{r.libelle}{' '}
                                                                <PrivateAmount>{formatSigned(r.montant, { withCurrency: true })}</PrivateAmount>
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-tiny text-ink-400">Équité immobilière (capital remboursé + valorisation)</div>
                                                )}
                                                {d.events.length > 0 && (
                                                    <div className="mt-1.5 space-y-0.5">
                                                        {d.events.map((e, i) => {
                                                            const { icon, text } = splitEventIcon(e);
                                                            return (
                                                                <div key={i} className="flex items-start gap-1.5 text-tiny text-yellow-200/90">
                                                                    <span aria-hidden="true">{icon}</span><span className="flex-1">{text}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}

                        {/* G19 — espace de cotisation gagné par année (CELI/REER) */}
                        {roomByYear.length > 0 && (
                            <div className="mt-4 border-t border-white/10 pt-3">
                                <div className="text-tiny uppercase tracking-widest text-ink-400 font-bold mb-1">
                                    Espace de cotisation gagné par année
                                </div>
                                <p className="text-tiny text-ink-400 mb-2 leading-snug">
                                    Droits {selected.label} qui s'ajoutent chaque année (et ré-ajout de l'espace après un retrait, pour le CELI).
                                </p>
                                <div className="max-h-52 overflow-y-auto rounded-lg border border-white/10">
                                    <table className="w-full text-meta">
                                        <thead className="sticky top-0 bg-dark">
                                            <tr className="text-tiny uppercase tracking-wide text-ink-400">
                                                <th className="text-left font-bold px-2.5 py-1.5">Année</th>
                                                <th className="text-right font-bold px-2.5 py-1.5">Espace gagné</th>
                                                <th className="text-right font-bold px-2.5 py-1.5">Espace dispo.</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {roomByYear.map((r) => (
                                                <tr key={r.year} className="border-t border-white/5">
                                                    <td className="px-2.5 py-1.5 text-ink-200 font-semibold">{r.year}</td>
                                                    <td className={`px-2.5 py-1.5 text-right font-mono ${r.gained === null ? 'text-ink-400' : r.gained > 0 ? 'text-green-300' : 'text-ink-400'}`}>
                                                        <PrivateAmount>{r.gained === null ? '—' : `+${fmtMoney(r.gained)}`}</PrivateAmount>
                                                    </td>
                                                    <td className="px-2.5 py-1.5 text-right font-mono text-ink-300"><PrivateAmount>{fmtMoney(r.avail)}</PrivateAmount></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>,
        document.body,
    );
};
