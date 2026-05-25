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

// G11 v2 — infobulle au SURVOL = résumé concis (glance). Le détail complet
// (chaque compte, flux, impôts, drill-down + le « pourquoi » détaillé) est
// réservé au CLIC → FutureDetailModal. Décision UX validée par Marc :
// survol lisible en < 1 s, deep-dive au clic. Fini le tooltip trop long.
export const ExpertTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;
    const fmt = (n: number) => Math.round(n).toLocaleString('fr-CA');

    // Résumé du « pourquoi » du mois : apport net (dépôts − retraits) vs gain marché.
    const totalFlow = (data.NetTransferCELI || 0) + (data.NetTransferREER || 0) + (data.NetTransferNonReg || 0)
        + (data.NetTransferCrypto || 0) + (data.NetTransferLiquid || 0) + (data.NetTransferCELIAPP || 0) + (data.NetTransferREEE || 0);
    const totalGain = (data.MarketGrowthCELI || 0) + (data.MarketGrowthREER || 0) + (data.MarketGrowthNonReg || 0)
        + (data.MarketGrowthCrypto || 0) + (data.MarketGrowthLiquid || 0) + (data.MarketGrowthCELIAPP || 0) + (data.MarketGrowthREEE || 0);
    const diffNW = data.diffNW || 0;
    const events: string[] = [...(data.lifeEvents || []), ...(data.flowEvents || [])];

    return (
        <div className="relative bg-gradient-to-b from-[#11161f]/95 to-[#0B0E14]/95 backdrop-blur-md border border-white/15 ring-1 ring-white/5 p-3.5 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] w-64 z-50 animate-fade-in">
            <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-primary via-purple-500 to-pink-500 opacity-80" />

            <div className="flex justify-between items-center gap-2 mb-2.5">
                <span className="text-sm font-extrabold text-white tracking-tight">{data.dateLabel || 'N/A'}</span>
                <span className="text-tiny font-bold text-primary bg-primary/15 border border-primary/30 px-2 py-0.5 rounded-full whitespace-nowrap">Âge {data.age || '??'}</span>
            </div>

            {/* Hero : valeur nette + variation du mois */}
            <div className="rounded-xl bg-gradient-to-r from-primary/20 to-purple-500/15 border border-white/15 p-2.5 mb-2.5">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-tiny uppercase tracking-widest text-ink-300 font-bold">Valeur nette</span>
                    <span className={`text-tiny font-mono font-bold px-1.5 py-0.5 rounded ${diffNW >= 0 ? 'text-green-300 bg-green-500/15' : 'text-red-300 bg-red-500/15'}`}>
                        {diffNW > 0 ? '+' : ''}{fmt(diffNW)}$ /mois
                    </span>
                </div>
                <div className="mt-1 text-2xl font-black text-white font-mono privacy-blur leading-none">{fmt(data.NetWorth || 0)}$</div>
            </div>

            {/* Résumé du pourquoi : apport (ce que je mets) vs gain (marché) */}
            {(totalFlow !== 0 || totalGain !== 0) && (
                <div className="flex items-center gap-2 mb-2.5 text-tiny font-mono">
                    <span className={`flex-1 text-center px-1.5 py-1 rounded ${totalFlow >= 0 ? 'text-sky-300 bg-sky-500/10' : 'text-orange-300 bg-orange-500/10'} privacy-blur`} title="Ce que tu déposes / retires (apport net)">
                        Apport {totalFlow > 0 ? '+' : ''}{fmt(totalFlow)}$
                    </span>
                    <span className={`flex-1 text-center px-1.5 py-1 rounded ${totalGain >= 0 ? 'text-green-300 bg-green-500/10' : 'text-red-300 bg-red-500/10'} privacy-blur`} title="Ce que le marché te rapporte (gain)">
                        Gain {totalGain > 0 ? '+' : ''}{fmt(totalGain)}$
                    </span>
                </div>
            )}

            {/* Présence d'événement(s) — aperçu compact, détail au clic */}
            {events.length > 0 && (
                <div className="flex items-center gap-1.5 mb-2 text-tiny text-yellow-200 bg-yellow-500/5 rounded-lg px-2 py-1.5 border border-yellow-500/15">
                    <span className="shrink-0" aria-hidden="true">{splitEventIcon(events[0]).icon}</span>
                    <span className="flex-1 truncate font-semibold">{splitEventIcon(events[0]).text}</span>
                    {events.length > 1 && <span className="text-ink-400 shrink-0 font-mono">+{events.length - 1}</span>}
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
