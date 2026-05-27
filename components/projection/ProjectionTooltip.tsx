import React from 'react';

// Normalise un label d'event : extrait l'emoji du début pour l'aligner dans
// un slot fixe, et garde le reste du texte. Si pas d'emoji détecté, retourne
// un emoji par défaut basé sur mots-clés.
// Ordre = priorité (premier match gagne). Patterns tolérants aux accents
// (imp[oô]t, int[ée]r[êe]t…) car le moteur émet parfois sans diacritiques.
const EVENT_KEYWORD_ICONS: Array<[RegExp, string]> = [
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
    { key: 'Liquidites', label: 'Cash', color: '#4b5563', gainKey: 'MarketGrowthLiquid' },
    { key: 'CELI', label: 'CELI', color: '#10b981', gainKey: 'MarketGrowthCELI' },
    { key: 'CELIAPP', label: 'CELIAPP (FHSA)', color: '#2dd4bf', gainKey: 'MarketGrowthCELIAPP' },
    { key: 'REER', label: 'REER', color: '#3b82f6', gainKey: 'MarketGrowthREER' },
    { key: 'REEE', label: 'REEE', color: '#06b6d4', gainKey: 'MarketGrowthREEE' },
    { key: 'NonReg', label: 'Non-Enreg', color: '#f59e0b', gainKey: 'MarketGrowthNonReg' },
    { key: 'Crypto', label: 'Crypto', color: '#a855f7', gainKey: 'MarketGrowthCrypto' },
    { key: 'Immobilier', label: 'Immobilier', color: '#ec4899' },
];

// Infobulle au SURVOL — résumé clair + détail par compte (gains) + dépenses.
// G15 : libellés explicites (« Rendement » = marché, « Dépôts » = ce que tu
// ajoutes, gros chiffre = « Variation ce mois »). Le détail exhaustif + le
// « pourquoi » par compte reste au CLIC (FutureDetailModal).
export const ExpertTooltip = ({ active, payload, userName1, userName2 }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;
    const fmt = (n: number) => Math.round(n).toLocaleString('fr-CA');

    const totalFlow = (data.NetTransferCELI || 0) + (data.NetTransferREER || 0) + (data.NetTransferNonReg || 0)
        + (data.NetTransferCrypto || 0) + (data.NetTransferLiquid || 0) + (data.NetTransferCELIAPP || 0) + (data.NetTransferREEE || 0);
    const totalGain = (data.MarketGrowthCELI || 0) + (data.MarketGrowthREER || 0) + (data.MarketGrowthNonReg || 0)
        + (data.MarketGrowthCrypto || 0) + (data.MarketGrowthLiquid || 0) + (data.MarketGrowthCELIAPP || 0) + (data.MarketGrowthREEE || 0);
    const diffNW = data.diffNW || 0;
    const portfolioOutflow = (data.RetraitREER || 0) + (data.RetraitCELI || 0);
    const events: string[] = [...(data.lifeEvents || []), ...(data.flowEvents || [])];
    const accounts = TOOLTIP_ACCOUNTS
        .map((a) => ({ ...a, value: data[a.key] || 0, gain: a.gainKey ? (data[a.gainKey] || 0) : 0 }))
        .filter((a) => a.value !== 0);

    return (
        <div className="relative bg-gradient-to-b from-[#11161f]/95 to-[#0B0E14]/95 backdrop-blur-md border border-white/15 ring-1 ring-white/5 p-3.5 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] w-72 max-h-[480px] overflow-y-auto z-50 animate-fade-in">
            <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-primary via-purple-500 to-pink-500 opacity-80" />

            <div className="flex justify-between items-center gap-2 mb-2.5">
                <span className="text-sm font-extrabold text-white tracking-tight">{data.dateLabel || 'N/A'}</span>
                <span className="text-tiny font-bold text-primary bg-primary/15 border border-primary/30 px-2 py-0.5 rounded-full whitespace-nowrap">Âge {data.age || '??'}</span>
            </div>

            {/* Hero : valeur nette + variation du mois (libellé explicite) */}
            <div className="rounded-xl bg-gradient-to-r from-primary/20 to-purple-500/15 border border-white/15 p-2.5 mb-2.5">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-tiny uppercase tracking-widest text-ink-300 font-bold">Valeur nette</span>
                    <span className={`text-tiny font-mono font-bold px-1.5 py-0.5 rounded ${diffNW >= 0 ? 'text-green-300 bg-green-500/15' : 'text-red-300 bg-red-500/15'}`}>
                        Variation {diffNW > 0 ? '+' : ''}{fmt(diffNW)}$
                    </span>
                </div>
                <div className="mt-1 text-2xl font-black text-white font-mono privacy-blur leading-none">{fmt(data.NetWorth || 0)}$</div>
            </div>

            {/* Pourquoi : dépôts (ce que tu ajoutes) vs rendement (marché) */}
            {(totalFlow !== 0 || totalGain !== 0) && (
                <div className="mb-2.5">
                    <div className="flex items-center gap-2 text-tiny font-mono">
                        <span className={`flex-1 text-center px-1.5 py-1 rounded ${totalFlow >= 0 ? 'text-sky-300 bg-sky-500/10' : 'text-orange-300 bg-orange-500/10'} privacy-blur`} title="Argent que tu ajoutes toi-même (dépôts − retraits)">
                            Dépôts {totalFlow > 0 ? '+' : ''}{fmt(totalFlow)}$
                        </span>
                        <span className={`flex-1 text-center px-1.5 py-1 rounded ${totalGain >= 0 ? 'text-green-300 bg-green-500/10' : 'text-red-300 bg-red-500/10'} privacy-blur`} title="Ce que tes placements rapportent (rendement du marché)">
                            Rendement {totalGain > 0 ? '+' : ''}{fmt(totalGain)}$
                        </span>
                    </div>
                    <div className="text-[10px] text-ink-600 text-center mt-1">Dépôts = ce que tu ajoutes · Rendement = ce que le marché rapporte</div>
                </div>
            )}

            {/* Revenus / dépenses du mois */}
            <div className="space-y-1 mb-2.5 text-xs">
                {(data.IncomeMarc || 0) > 0 && <div className="flex justify-between"><span className="text-gray-400">Paye {userName1 || 'Util. 1'}</span><span className="font-mono text-green-400 privacy-blur">+{fmt(data.IncomeMarc)}$</span></div>}
                {(data.IncomeAnna || 0) > 0 && <div className="flex justify-between"><span className="text-gray-400">Paye {userName2 || 'Util. 2'}</span><span className="font-mono text-green-400 privacy-blur">+{fmt(data.IncomeAnna)}$</span></div>}
                {(data.IncomeRetirement || 0) > 0 && <div className="flex justify-between"><span className="text-gray-400">Rentes / retraite</span><span className="font-mono text-green-400 privacy-blur">+{fmt(data.IncomeRetirement)}$</span></div>}
                {portfolioOutflow > 0 && <div className="flex justify-between"><span className="text-gray-400">Décaissement portfolio</span><span className="font-mono text-amber-400 privacy-blur">+{fmt(portfolioOutflow)}$</span></div>}
                {(data.Expenses || 0) > 0 && <div className="flex justify-between"><span className="text-gray-400">Dépenses de vie</span><span className="font-mono text-red-400 privacy-blur">-{fmt(data.Expenses)}$</span></div>}
            </div>

            {/* Répartition par compte : valeur + rendement du mois (G14) */}
            {accounts.length > 0 && (
                <div className="bg-black/30 p-2.5 rounded-xl space-y-1 text-xs border border-white/10 mb-2.5">
                    <div className="text-tiny uppercase tracking-widest text-ink-400 font-bold mb-1">Par compte (valeur · rendement)</div>
                    {accounts.map((a) => (
                        <div key={a.key} className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-gray-300 min-w-0">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: a.color }} />
                                <span className="truncate">{a.label}</span>
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0 font-mono">
                                <span className="privacy-blur text-white">{fmt(a.value)}$</span>
                                {Math.abs(a.gain) > 0.5 && (
                                    <span className={`text-[10px] ${a.gain >= 0 ? 'text-green-400' : 'text-red-400'}`}>{a.gain > 0 ? '+' : ''}{fmt(a.gain)}</span>
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

            <div className="text-tiny text-ink-500 text-center pt-1.5 border-t border-white/10">
                Clique pour le détail complet
            </div>
        </div>
    );
};

// G5 — pastille d'événement individuelle et cliquable, rendue comme label SVG
// d'un ReferenceDot (recharts injecte x,y en pixels). Chaque événement a sa
// propre icône (plus de labels texte fusionnés « A | B | C »). Les événements
// d'un même mois s'empilent verticalement via `subIdx` : vie au-dessus du
// point, flux en dessous. Le clic remonte le payload via `onSelect`.
export const ClickableEventIcon = (props: any) => {
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
    const r = isLife ? 12 : 9;
    const color = isLife ? '#facc15' : '#60a5fa';
    return (
        <g
            transform={`translate(${px}, ${py})`}
            style={{ cursor: 'pointer' }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onSelect?.(payload); }}
            role="button"
            tabIndex={-1}
            aria-label={`Événement : ${payload.label}`}
        >
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
export const RefLineLabel = (props: any) => {
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
