import React from 'react';
import type { ProjectionChartPoint } from '../../services/projection/types';
import { PrivateAmount } from '../ui/PrivateAmount';

// Normalise un label d'event : extrait l'emoji du début pour l'aligner dans
// un slot fixe, et garde le reste du texte. Si pas d'emoji détecté, retourne
// un emoji par défaut basé sur mots-clés.
// Ordre = priorité (premier match gagne). Patterns tolérants aux accents
// (imp[oô]t, int[ée]r[êe]t…) car le moteur émet parfois sans diacritiques.
const EVENT_KEYWORD_ICONS: Array<[RegExp, string]> = [
    [/\bfire\b/i, '🔥'], // [R2] FIRE atteint : 🔥 (sinon « Objectif… » matcherait 🎯 plus bas)
    [/voyage|vacances/i, '✈️'],
    [/krach|chute|baisse|correction march/i, '📉'],
    [/v[ée]hicule|voiture/i, '🚗'],
    [/r[ée]no|r[ée]novation|travaux/i, '🔨'],
    [/maladie|sant[ée]|hospital/i, '🩺'],
    [/h[ée]ritage|succession|legs/i, '🎁'],
    [/retrait|d[ée]caiss|withdraw|sortie/i, '🏧'],
    [/dividende|drip/i, '💵'],
    [/gain|rendement|int[ée]r[êe]t|croissance|cumul|plus-value/i, '📈'],
    [/cotisation|contribution|d[ée]p[oô]t|versement|apport/i, '💰'],
    [/rrq|psv|rente|pension|prestation/i, '👴'],
    [/rembours/i, '💸'],
    [/fisc|imp[oô]t|\btax/i, '🏛️'],
    [/loyer|achat.*r[ée]sidence/i, '🏠'],
    [/vente|maison|immo|hypo|propri[ée]t/i, '🏠'],
    [/assurance|insurance/i, '🛡️'],
    [/objectif|but financier|cible/i, '🎯'],
    [/enfant|naissance|b[ée]b[ée]|reee|[ée]tudes/i, '👶'],
    [/[ée]pargne|invest|placement|celi|reer|fhsa/i, '💰'],
    [/survie|coussin|urgence/i, '🛟'],
];

export const splitEventIcon = (label: string): { icon: string; text: string } => {
    // Detect leading emoji (1-2 codepoints + optional VS16/skin tone)
    const m = label.match(/^([\p{Emoji_Presentation}\p{Extended_Pictographic}][️‍\p{Emoji_Modifier}\p{Emoji_Component}]*)\s+(.*)$/u);
    if (m) return { icon: m[1], text: m[2] };
    for (const [re, icon] of EVENT_KEYWORD_ICONS) {
        if (re.test(label)) return { icon, text: label };
    }
    return { icon: '📌', text: label };
};

// Comptes affichés dans la répartition de l'infobulle (valeur + rendement du mois).
const TOOLTIP_ACCOUNTS: Array<{ key: string; label: string; color: string; gainKey?: string }> = [
    { key: 'Liquidites', label: 'Cash', color: '#5a6478', gainKey: 'MarketGrowthLiquid' },
    { key: 'CELI', label: 'CELI', color: '#4f9d86', gainKey: 'MarketGrowthCELI' },
    { key: 'CELIAPP', label: 'CELIAPP (FHSA)', color: '#5cae9f', gainKey: 'MarketGrowthCELIAPP' },
    { key: 'REER', label: 'REER', color: '#5b82bf', gainKey: 'MarketGrowthREER' },
    { key: 'REEE', label: 'REEE', color: '#5093a8', gainKey: 'MarketGrowthREEE' },
    { key: 'NonReg', label: 'Non-Enreg', color: '#c2974f', gainKey: 'MarketGrowthNonReg' },
    { key: 'Crypto', label: 'Crypto', color: '#9277bd', gainKey: 'MarketGrowthCrypto' },
    { key: 'Immobilier', label: 'Immobilier', color: '#bd7d9c' },
];

// Infobulle du graphe Futur — résumé clair + détail par compte (gains) + dépenses.
// G15 : libellés explicites (« Rendement » = marché, « Dépôts » = ce que tu
// ajoutes, gros chiffre = « Variation ce mois »). Le détail exhaustif + le
// « pourquoi » par compte reste à la modale (FutureDetailModal).
//
// [R3] Découplé de Recharts : prend `data` en prop DIRECTE (testable sans le
// wrapper Recharts) et est rendu via un PORTAIL positionné par
// `useChartTooltipPosition`. `frozen` = figé (devient interactif/scrollable et
// montre le bouton « Détail complet ») ; `onOpenDetail` ouvre la modale exhaustive.
export const ExpertTooltip = ({ data, userName1, userName2, frozen = false, onOpenDetail, onStepDay, canStepPrev = false, canStepNext = false, sheet = false, onClose }: {
    data: ProjectionChartPoint;
    userName1?: string;
    userName2?: string;
    frozen?: boolean;
    onOpenDetail?: () => void;
    /** Point QUOTIDIEN figé : sélectionner le jour voisin (−1 = veille, +1 = lendemain) sans
     *  re-viser au pixel — à ~150 jours affichés, un jour fait ~6 px (mesuré). */
    onStepDay?: (dir: -1 | 1) => void;
    canStepPrev?: boolean;
    canStepNext?: boolean;
    /** [FUTUR-MOBILE-LAYOUT] Rendu BOTTOM SHEET (téléphone, figé) : pleine largeur, coins hauts
     *  arrondis seulement, bouton Fermer VISIBLE — « Échap pour fermer » n'existe pas au doigt. */
    sheet?: boolean;
    onClose?: () => void;
}) => {
    // [FUTUR-DAILY lot B étape 2] Champs portés par les points QUOTIDIENS de la courbe. Ils sont
    // absents des points mensuels du moteur, d'où la lecture défensive plutôt qu'un élargissement
    // de `ProjectionChartPoint` (qui est le contrat du MOTEUR, pas celui de l'affichage).
    const daily = data as ProjectionChartPoint & {
        isDailyPoint?: boolean; dayLabels?: string[]; dayIsDated?: boolean;
        dayIsReal?: boolean; priceAgeMaxDays?: number; hasEstimatedPrice?: boolean;
        daySyncUnconfirmed?: boolean;
    };
    const isDailyPoint = daily.isDailyPoint === true;
    // [FUTUR-DAILY-PAST-REAL] Un jour du PASSÉ est RECONSTRUIT depuis de vraies données (transactions
    // datées, prix datés) ; un jour du FUTUR est ventilé depuis le mois du moteur. Les présenter à
    // l'identique reviendrait à faire passer une projection pour une mesure — et l'inverse.
    const isRealDay = daily.dayIsReal === true;
    const priceAge = Number(daily.priceAgeMaxDays);
    const stalePrice = Number.isFinite(priceAge) && priceAge > 7;
    const dayLabels = daily.dayLabels;
    // ⚠️ `dayIsDated` ET les libellés (finding revue) : un `DatedDelta` sans `label` produit un jour
    // réellement DATÉ mais sans libellé — n'écouter que `labels.length` aurait alors annoncé
    // « aucun mouvement à date connue » un jour où un mouvement a bel et bien eu lieu.
    const dayHasMovement = daily.dayIsDated === true || (dayLabels?.length ?? 0) > 0;
    const fmt = (n: number) => Math.round(n).toLocaleString('fr-CA');

    const totalFlow = (data.NetTransferCELI || 0) + (data.NetTransferREER || 0) + (data.NetTransferNonReg || 0)
        + (data.NetTransferCrypto || 0) + (data.NetTransferLiquid || 0) + (data.NetTransferCELIAPP || 0) + (data.NetTransferREEE || 0);
    const totalGain = (data.MarketGrowthCELI || 0) + (data.MarketGrowthREER || 0) + (data.MarketGrowthNonReg || 0)
        + (data.MarketGrowthCrypto || 0) + (data.MarketGrowthLiquid || 0) + (data.MarketGrowthCELIAPP || 0) + (data.MarketGrowthREEE || 0);
    // ⚠️ `undefined` ≠ 0 (finding CRITIQUE de la revue). Un point QUOTIDIEN sans veille connue (le
    // 1er de la fenêtre) n'a pas de variation : afficher « +0 $ » en vert serait un faux chiffre
    // crédible sur la donnée la plus regardée de l'infobulle. On masque le badge à la place.
    const hasDiffNW = Number.isFinite(data.diffNW);
    const diffNW = Number(data.diffNW) || 0;
    const portfolioOutflow = (data.RetraitREER || 0) + (data.RetraitCELI || 0);
    const events: string[] = [...(data.lifeEvents || []), ...(data.flowEvents || [])];
    const accounts = TOOLTIP_ACCOUNTS
        .map((a) => ({ ...a, value: (data[a.key] as number | undefined) || 0, gain: a.gainKey ? ((data[a.gainKey] as number | undefined) || 0) : 0 }))
        .filter((a) => a.value !== 0);

    return (
        <div className={`relative bg-gradient-to-b from-[#11161f]/95 to-dark/95 backdrop-blur-md border border-white/15 ring-1 ring-white/5 p-3.5 shadow-[0_20px_60px_rgba(0,0,0,0.85)] overflow-y-auto z-50 animate-fade-in ${
            sheet
                ? 'w-full max-h-[70dvh] rounded-t-2xl rounded-b-none border-b-0 pb-[max(0.875rem,env(safe-area-inset-bottom))]'
                : 'w-72 max-h-[480px] rounded-2xl'
        }`}>
            <div className="absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

            <div className="flex justify-between items-center gap-2 mb-2.5">
                <span className="text-body font-extrabold text-white tracking-tight">{data.dateLabel || 'N/A'}</span>
                <span className="text-tiny font-bold text-primary bg-primary/15 border border-primary/30 px-2 py-0.5 rounded-full whitespace-nowrap">Âge {data.age || '??'}</span>
            </div>

            {/* Hero : valeur nette + variation du mois (libellé explicite) */}
            <div className="rounded-xl bg-white/[0.05] border border-white/15 p-2.5 mb-2.5">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-tiny uppercase tracking-widest text-ink-300 font-bold">Valeur nette</span>
                    {hasDiffNW && (
                        <span className={`text-tiny font-mono font-bold px-1.5 py-0.5 rounded ${diffNW >= 0 ? 'text-green-300 bg-green-500/15' : 'text-red-300 bg-danger-500/15'}`}>
                            Variation {isDailyPoint ? 'du jour ' : ''}{diffNW > 0 ? '+' : ''}{fmt(diffNW)}$
                        </span>
                    )}
                </div>
                <PrivateAmount as="div" className="mt-1 text-2xl font-black text-white font-mono leading-none">{fmt(data.NetWorth || 0)}$</PrivateAmount>
            </div>

            {/* [PH2-d-2] — référence VERROUILLÉE au survol (présente seulement sous verrou, via
                displayData.lockedNetWorth) : valeur figée + écart vs l'aperçu live. */}
            {(() => {
                // Revue #245 — bind unique (documente la forme réelle de displayData, zéro re-cast).
                const locked = (data as ProjectionChartPoint & { lockedNetWorth?: number }).lockedNetWorth;
                if (typeof locked !== 'number') return null;
                const delta = (data.NetWorth || 0) - locked;
                return (
                    <div className="rounded-xl bg-amber-500/[0.08] border border-amber-500/25 p-2.5 mb-2.5">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-tiny uppercase tracking-widest text-amber-300 font-bold">🔒 Verrouillée</span>
                            <PrivateAmount className={`text-tiny font-mono font-bold px-1.5 py-0.5 rounded ${delta >= 0 ? 'text-green-300 bg-green-500/15' : 'text-red-300 bg-danger-500/15'}`} title="Écart entre l'aperçu live et la référence verrouillée">
                                Live {delta >= 0 ? '+' : ''}{fmt(delta)}$
                            </PrivateAmount>
                        </div>
                        <PrivateAmount as="div" className="mt-1 text-body font-black text-amber-200 font-mono leading-none">{fmt(locked)}$</PrivateAmount>
                    </div>
                );
            })()}

            {/* Pourquoi : dépôts (ce que tu ajoutes) vs rendement (marché) */}
            {(totalFlow !== 0 || totalGain !== 0) && (
                <div className="mb-2.5">
                    <div className="flex items-center gap-2 text-tiny font-mono">
                        <PrivateAmount className={`flex-1 text-center px-1.5 py-1 rounded ${totalFlow >= 0 ? 'text-sky-300 bg-sky-500/10' : 'text-orange-300 bg-orange-500/10'}`} title="Argent que tu ajoutes toi-même (dépôts − retraits)">
                            Dépôts {totalFlow > 0 ? '+' : ''}{fmt(totalFlow)}$
                        </PrivateAmount>
                        <PrivateAmount className={`flex-1 text-center px-1.5 py-1 rounded ${totalGain >= 0 ? 'text-green-300 bg-green-500/10' : 'text-red-300 bg-danger-500/10'}`} title="Ce que tes placements rapportent (rendement du marché)">
                            Rendement {totalGain > 0 ? '+' : ''}{fmt(totalGain)}$
                        </PrivateAmount>
                    </div>
                    <div className="text-[10px] text-ink-400 text-center mt-1">Dépôts = ce que tu ajoutes · Rendement = ce que le marché rapporte</div>
                </div>
            )}

            {/* Revenus / dépenses — du MOIS sur un point mensuel, du JOUR sur un point quotidien.
                [FUTUR-DAILY-FULL] `dailyLedger` ventile ces mêmes champs au jour : rien à changer ici
                hormis les libellés, ce qui élimine tout risque de divergence entre les deux vues. */}
            <div className="space-y-1 mb-2.5 text-meta">
                {(data.IncomeMarc || 0) > 0 && <div className="flex justify-between"><span className="text-ink-300">Paye {userName1 || 'Util. 1'}</span><PrivateAmount className="font-mono text-green-400">+{fmt(data.IncomeMarc || 0)}$</PrivateAmount></div>}
                {(data.IncomeAnna || 0) > 0 && <div className="flex justify-between"><span className="text-ink-300">Paye {userName2 || 'Util. 2'}</span><PrivateAmount className="font-mono text-green-400">+{fmt(data.IncomeAnna || 0)}$</PrivateAmount></div>}
                {(data.IncomeRetirement || 0) > 0 && <div className="flex justify-between"><span className="text-ink-300">Rentes / retraite</span><PrivateAmount className="font-mono text-green-400">+{fmt(data.IncomeRetirement || 0)}$</PrivateAmount></div>}
                {portfolioOutflow > 0 && <div className="flex justify-between"><span className="text-ink-300">Décaissement portfolio</span><PrivateAmount className="font-mono text-warning-400">+{fmt(portfolioOutflow)}$</PrivateAmount></div>}
                {(data.Expenses || 0) > 0 && <div className="flex justify-between"><span className="text-ink-300">Dépenses de vie</span><PrivateAmount className="font-mono text-danger-400">-{fmt(data.Expenses || 0)}$</PrivateAmount></div>}
            </div>

            {/* Impôts du point (demande Marc) : (1) régularisation réglée en avril
                (FluxImpots = impôt réel de l'année − retenues déjà prélevées ; + = à payer,
                − = remboursement) et (2) impôt DORMANT (ImpotLatent, latent/négatif dans le
                moteur → on affiche la valeur absolue). On n'affiche PAS un « impôt total
                annuel » : la retenue mensuelle est déjà implicite dans le net ci-dessus. */}
            {(Math.abs(data.FluxImpots || 0) > 0.5 || Math.abs(data.ImpotLatent || 0) > 0.5) && (
                <div className="bg-black/30 p-2.5 rounded-xl space-y-1 text-meta border border-white/10 mb-2.5">
                    <div className="text-tiny uppercase tracking-widest text-ink-400 font-bold mb-1">Impôts</div>
                    {Math.abs(data.FluxImpots || 0) > 0.5 && (
                        <div className="flex justify-between" title="Solde réglé en avril : impôt réel de l'année moins les retenues déjà prélevées (positif = reste à payer, négatif = remboursement).">
                            <span className="text-ink-300">{(data.FluxImpots || 0) > 0 ? "Solde d'impôt (avril)" : "Remboursement d'impôt"}</span>
                            <PrivateAmount className={`font-mono ${(data.FluxImpots || 0) > 0 ? 'text-danger-400' : 'text-green-400'}`}>
                                {(data.FluxImpots || 0) > 0 ? '-' : '+'}{fmt(Math.abs(data.FluxImpots || 0))}$
                            </PrivateAmount>
                        </div>
                    )}
                    {Math.abs(data.ImpotLatent || 0) > 0.5 && (
                        <div className="flex justify-between" title="Impôt « dormant » : ce que tu devrais plus tard sur ton REER et tes gains non réalisés si tu liquidais tout aujourd'hui. Ce n'est PAS un décaissement de ce mois.">
                            <span className="text-ink-300">Impôt dormant</span>
                            <PrivateAmount className="font-mono text-amber-300/90">{fmt(Math.abs(data.ImpotLatent || 0))}$</PrivateAmount>
                        </div>
                    )}
                </div>
            )}

            {/* Répartition par compte : valeur + rendement du mois (G14) */}
            {accounts.length > 0 && (
                <div className="bg-black/30 p-2.5 rounded-xl space-y-1 text-meta border border-white/10 mb-2.5">
                    <div className="text-tiny uppercase tracking-widest text-ink-400 font-bold mb-1">Par compte (valeur · rendement {isDailyPoint ? 'du jour' : 'du mois'})</div>
                    {accounts.map((a) => (
                        <div key={a.key} className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-ink-200 min-w-0">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: a.color }} />
                                <span className="truncate">{a.label}</span>
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0 font-mono">
                                <PrivateAmount className="text-white">{fmt(a.value)}$</PrivateAmount>
                                {Math.abs(a.gain) > 0.5 && (
                                    <span className={`text-[10px] ${a.gain >= 0 ? 'text-green-400' : 'text-danger-400'}`}>{a.gain > 0 ? '+' : ''}{fmt(a.gain)}</span>
                                )}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* U4 — Tous les événements du mois, pas juste le premier.
                Avant : seul events[0] affiché + « +N ». Maintenant : liste
                complète (le tooltip est déjà scrollable max-h-[480px]).
                Chaque ligne a son icône dédié via splitEventIcon. */}
            {events.length > 0 && (
                <div className="mb-2.5 space-y-1">
                    <div className="text-tiny uppercase tracking-widest text-ink-400 font-bold mb-1">
                        {events.length === 1 ? 'Événement' : `Événements (${events.length})`}
                    </div>
                    {events.map((ev, i) => {
                        const { icon, text } = splitEventIcon(ev);
                        return (
                            <div
                                key={i}
                                className="flex items-center gap-1.5 text-tiny text-yellow-200 bg-yellow-500/5 rounded-lg px-2 py-1.5 border border-yellow-500/15"
                            >
                                <span className="shrink-0" aria-hidden="true">{icon}</span>
                                <span className="flex-1 font-semibold leading-tight">{text}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* [FUTUR-DAILY lot B étape 2] Quand le point survolé est un JOUR (et non un mois), on
                dit ce qui s'y passe. ⚠️ CORRECTION DE CAP (Marc, 2026-08-11) : l'infobulle listait
                auparavant tous les jours du mois — c'était donner à LIRE une liste, alors que la
                demande est de SÉLECTIONNER un jour sur la courbe. C'est désormais le graphe qui
                porte les jours ; l'infobulle ne décrit que celui qu'on vise.
                Un jour à mouvement daté est de l'INFORMATION (paie, dette, charge récurrente) ; un
                jour sans date ne bouge que par l'étalement de la croissance, et le dire évite de
                faire passer du lissage pour de la mesure. */}
            {isDailyPoint && (
                <div className="mt-2 pt-2 border-t border-white/10">
                    <div className={`mb-1.5 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${isRealDay ? 'border-green-500/30 bg-green-500/10 text-green-300' : 'border-white/15 bg-white/5 text-ink-300'}`}>
                        {isRealDay ? 'Réel' : 'Projeté'}
                    </div>
                    {isRealDay && (
                        <p className="mb-1.5 text-[10px] text-ink-400">
                            Reconstruit depuis tes transactions datées et le prix de tes titres ce jour-là
                            — pas une moyenne du mois.
                            {daily.hasEstimatedPrice === true && ' Au moins un titre est valorisé à son prix actuel, faute d’historique.'}
                            {stalePrice && ` Le prix le plus ancien composant ce point a ${Math.round(priceAge)} jours : c’est un plateau de reconstruction, pas une valeur observée ce jour-là.`}
                        </p>
                    )}
                    {/* [FUTUR-DAILY-ROLLOVER, finding silent-failure #593] Jour réel POSTÉRIEUR à la
                        dernière sync bancaire : ses « 0 $ » peuvent n'être qu'une sync pas encore
                        passée — le dire, sinon un plat crédible passe pour une journée mesurée. */}
                    {isRealDay && daily.daySyncUnconfirmed === true && (
                        <p className="mb-1.5 text-[10px] leading-snug text-amber-300/90">
                            ⚠ Jour pas encore couvert par la sync bancaire — des transactions de ce
                            jour peuvent manquer.
                        </p>
                    )}
                    {dayHasMovement ? (
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-tiny uppercase tracking-widest text-primary font-bold shrink-0">Ce jour</span>
                            <span className="text-tiny text-ink-100">{dayLabels && dayLabels.length > 0 ? dayLabels.join(', ') : 'Mouvement à date connue'}</span>
                        </div>
                    ) : (
                        <div className="text-[10px] text-ink-400">
                            {isRealDay
                                ? 'Aucun mouvement sur tes comptes ce jour-là — la variation ne vient que du marché.'
                                : 'Aucun mouvement à date connue ce jour-là — la variation vient de la croissance, répartie sur le mois.'}
                        </div>
                    )}
                </div>
            )}

            {/* [R3] Pied de page selon l'état : survol = invite à figer ; figé = bouton
                « Détail complet » (ouvre la modale) + rappel Échap. Le bouton n'est
                cliquable que figé (le tooltip de survol est `pointer-events:none`). */}
            {frozen ? (
                /* ⚠️ [FUTUR-TOOLTIP-STICKY-ACTIONS 2026-08-12] Pied COLLANT, et ce n'est pas du
                   style : l'infobulle défile en interne (`max-h-[480px] overflow-y-auto`) et avec
                   des données réelles (bloc impôts + par-compte + événements) le pied dépassait le
                   pli — Marc ne VOYAIT pas « Voir ce mois jour par jour » alors qu'il était rendu
                   (capture 2026-08-12, infobulle coupée). L'e2e ne l'a jamais attrapé : Playwright
                   SCROLLE l'élément en vue avant de cliquer — le robot paie le chemin que l'humain
                   ne voit pas. Marges négatives = bleed sur le padding p-3.5 du parent ; fond
                   opaque pour que le contenu scrollé ne transparaisse pas sous les boutons. */
                <div className={`sticky bottom-0 -mx-3.5 -mb-3.5 px-3.5 pb-3.5 pt-2 mt-0.5 border-t border-white/10 space-y-2 bg-[#0d1118]/95 backdrop-blur-sm ${sheet ? 'rounded-b-none' : 'rounded-b-2xl'}`}>
                    {/* [FUTUR-DAILY-NATIVE] Le bouton « Voir ce mois jour par jour » a disparu : la
                        courbe est au jour PARTOUT, le clic sélectionne directement le jour — il n'y a
                        plus de chemin à offrir. */}
                    {/* Jour figé → sélection FINE au jour près, sans re-viser au pixel (un jour ≈ 6 px
                        à ~150 jours affichés, mesuré) — et utilisable au DOIGT, où le zoom molette
                        n'existe pas. */}
                    {isDailyPoint && onStepDay && (
                        <div className="flex items-center gap-2">
                            {/* ⚠️ [a11y, WCAG 2.5.3 label-in-name — finding panel #589] L'aria-label
                                CONTIENT le texte visible (« Veille », « Lendemain ») : un aria-label
                                de remplacement (« Jour précédent » seul) casserait la commande vocale
                                — « clique Veille » ne trouverait aucun bouton de ce nom. */}
                            <button
                                type="button"
                                onClick={() => onStepDay(-1)}
                                disabled={!canStepPrev}
                                aria-label="Veille (jour précédent)"
                                className="focus-ring flex-1 inline-flex items-center justify-center min-h-[44px] text-tiny font-bold text-white bg-white/10 hover:bg-white/20 disabled:opacity-35 disabled:pointer-events-none border border-white/20 rounded-lg px-2 py-2.5 transition-colors"
                            >
                                ← Veille
                            </button>
                            <button
                                type="button"
                                onClick={() => onStepDay(1)}
                                disabled={!canStepNext}
                                aria-label="Lendemain (jour suivant)"
                                className="focus-ring flex-1 inline-flex items-center justify-center min-h-[44px] text-tiny font-bold text-white bg-white/10 hover:bg-white/20 disabled:opacity-35 disabled:pointer-events-none border border-white/20 rounded-lg px-2 py-2.5 transition-colors"
                            >
                                Lendemain →
                            </button>
                        </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={onOpenDetail}
                            className="focus-ring flex-1 inline-flex items-center justify-center min-h-[44px] text-tiny font-bold text-primary bg-primary/15 hover:bg-primary/25 border border-primary/30 rounded-lg px-2 py-2.5 transition-colors"
                        >
                            Détail complet →
                        </button>
                        {/* Au doigt, « Échap » n'existe pas : le sheet a un vrai bouton Fermer. */}
                        {sheet && onClose ? (
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Fermer l'infobulle"
                                className="focus-ring inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-tiny font-bold text-ink-200 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-3 py-2.5 transition-colors"
                            >
                                Fermer <span aria-hidden="true">✕</span>
                            </button>
                        ) : (
                            /* ink-400 (#8896a8, AA normal) — ink-600 n'existe pas dans la palette (héritait la couleur parente). */
                            <span className="text-[10px] text-ink-400 whitespace-nowrap">Échap pour fermer</span>
                        )}
                    </div>
                </div>
            ) : (
                <div className="text-tiny text-ink-400 text-center pt-1.5 border-t border-white/10">
                    Clique pour figer · puis détail complet
                </div>
            )}
        </div>
    );
};

// G5 — pastille d'événement individuelle et cliquable, rendue comme label SVG
// d'un ReferenceDot (recharts injecte x,y en pixels). Chaque événement a sa
// propre icône (plus de labels texte fusionnés « A | B | C »). Les événements
// d'un même mois s'empilent verticalement via `subIdx` : vie au-dessus du
// point, flux en dessous. Le clic remonte le payload via `onSelect`.
export const ClickableEventIcon = (props: { payload?: { label?: string; subIdx?: number; color?: string; dateLabel?: string }; onSelect?: (p: { label?: string; subIdx?: number; color?: string }) => void; kind?: string; selected?: boolean; cx?: number; cy?: number; x?: number; y?: number; viewBox?: { x?: number; y?: number } }) => {
    const { payload, onSelect, kind = 'life', selected = false } = props;
    // Recharts v3 : utilisé via le prop `shape` du ReferenceDot → coords en cx/cy.
    // Fallbacks (x/y, viewBox) au cas où l'API change.
    const px = props.cx ?? props.x ?? props.viewBox?.x;
    const py = props.cy ?? props.y ?? props.viewBox?.y;
    if (typeof px !== 'number' || typeof py !== 'number' || !payload) return null;
    const { icon } = splitEventIcon(payload.label || '');
    const isLife = kind === 'life';
    const sub = payload.subIdx || 0;
    const dy = isLife ? -(20 + sub * 24) : (20 + sub * 20);
    // [FUTUR-ICONS-RICH, a11y] cible flux montée 9→12 (diamètre 24 = plancher WCAG 2.5.8 AA ; avant 18 px sous
    // le seuil, heurté bien plus souvent avec ~29 pastilles). Zone de clic transparente élargie ci-dessous (≈44 px AAA).
    const r = isLife ? 12 : 12;
    // [R2] Couleur PAR ÉVÉNEMENT si fournie (ex. FIRE atteint = orange #f97316), sinon défaut du kind.
    const color = payload.color ?? (isLife ? '#d8c06a' : '#7ba0cf');
    return (
        <g
            transform={`translate(${px}, ${py})`}
            style={{ cursor: 'pointer' }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onSelect?.(payload); }}
            // [A11Y-FUTUR-MILESTONES-KEYBOARD] Décision Marc : les pastilles sont FOCUSABLES
            // (WCAG 2.1.1 — tabIndex -1 les rendait inatteignables au clavier). Entrée/Espace =
            // même action que le clic (modale de détail). Label DATÉ : sans lui, un lecteur
            // d'écran entendait 29 « Événement : … » sans aucun repère temporel. Anneau de
            // focus dessiné en SVG (classe .chart-event-icon, index.css) — l'outline CSS sur
            // un <g> est invisible dans certains moteurs.
            role="button"
            tabIndex={0}
            className="chart-event-icon"
            onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                e.stopPropagation();
                onSelect?.(payload);
            }}
            // [Audit a11y #599, LOW] Suffixe positionnel quand plusieurs événements partagent le
            // même jour : deux libellés identiques empilés restaient indistinguables à l'oreille.
            aria-label={`Événement : ${payload.label}${payload.dateLabel ? ` — ${payload.dateLabel}` : ''}${sub > 0 ? ` (${sub + 1})` : ''}`}
        >
            {/* [a11y] cible de clic transparente élargie (≈44 px, WCAG 2.5.5 AAA) sans changer le rendu visuel. */}
            <circle cy={dy} r={22} fill="transparent" />
            {/* Anneau de focus clavier (opacité pilotée par .chart-event-icon:focus-visible, index.css).
                [Audit a11y #599, MED] fill OPAQUE (fond du graphe) : avec fill="none", l'anneau se
                peignait directement sur les aires colorées (bande REER bleue ≈ teinte de l'ancien
                anneau → contraste < 3:1 possible, WCAG 1.4.11). Couleur = primary (#e6eaf2,
                tailwind.config.js) — même repère visuel que tous les focus-ring de l'app. */}
            <circle className="event-focus-ring" cy={dy} r={r + 7} fill="#0B0E14" stroke="#e6eaf2" strokeWidth={2} opacity={0} />
            {/* ancre sur la courbe + tige vers la pastille */}
            <circle r={3} fill={color} stroke="#0B0E14" strokeWidth={1} />
            <line x1={0} y1={0} x2={0} y2={dy} stroke={color} strokeWidth={1} strokeOpacity={0.45} />
            {selected && <circle cy={dy} r={r + 5} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.55} />}
            <circle cy={dy} r={r} fill="#0B0E14" stroke={color} strokeWidth={selected ? 3 : 1.75} />
            <text y={dy} textAnchor="middle" dominantBaseline="central" fontSize={isLife ? 13 : 10} fill="#e5e7eb" style={{ pointerEvents: 'none' }}>{icon}</text>
        </g>
    );
};

// G2 — label de ReferenceLine en pastille ancrée au bord (au lieu d'un texte
// centré qui passe par-dessus les aires et devient illisible). Ligne horizontale
// (Objectif FIRE) → pill en haut à droite ; ligne verticale (Aujourd'hui) → pill
// en haut, décalée à droite du trait pour ne pas chevaucher l'axe Y.
export const RefLineLabel = (props: { viewBox?: { x?: number; y?: number; width?: number; height?: number }; value?: string | number; color?: string }) => {
    const { viewBox, value, color = '#ffffff' } = props;
    if (!viewBox) return null;
    const { x = 0, y = 0, width = 0, height = 0 } = viewBox;
    const fontSize = 11;
    const text = String(value);
    const w = Math.round(text.length * fontSize * 0.58 + 16);
    const h = 18;
    const isHorizontal = width >= height; // FIRE (horizontale) vs Aujourd'hui (verticale)
    const rectX = isHorizontal ? x + width - w - 6 : x + 6;
    const rectY = isHorizontal ? y - h - 3 : y + 3;
    return (
        <g style={{ pointerEvents: 'none' }}>
            <rect x={rectX} y={rectY} width={w} height={h} rx={9} fill="#0B0E14" fillOpacity={0.88} stroke={color} strokeOpacity={0.55} />
            <text x={rectX + w / 2} y={rectY + h / 2 + 0.5} textAnchor="middle" dominantBaseline="central" fill={color} fontSize={fontSize} fontWeight="bold">{text}</text>
        </g>
    );
};
