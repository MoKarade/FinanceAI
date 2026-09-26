// ⚠️ Plus aucun import de rendu monétaire ici : les montants, leur masquage en mode discret
// (`PrivateAmount`/`PrivateText`) et la dérivation de la dette ont suivi le contenu vers
// `panneauJour/sections.tsx`. Ce fichier ne rend plus que du SVG de graphe.

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

// ⚠️ [FUTUR-PANNEAU-FIXE 2026-09-18] `ExpertTooltip` A ÉTÉ RETIRÉE D'ICI, et ce n'est pas un
// déménagement de confort. L'infobulle FLOTTANTE du graphe Futur n'existe plus : son contenu est
// rendu par le PANNEAU FIXE sous le graphe (`components/projection/PanneauJour.tsx`, sections dans
// `panneauJour/sections.tsx`). Demande de Marc, en texte libre puis en clic : « un panneau fixe en
// dessous du graphe et pareil sur le téléphone », l'infobulle qui suit le curseur disparaissant.
//
// Ce qui RESTE dans ce fichier est ce que le GRAPHE lui-même rend en SVG — les pastilles
// d'événement et les étiquettes de lignes de référence —, plus `splitEventIcon`, consommé par
// trois surfaces (le panneau, la modale de détail, le drill-down par compte).
//
// ⚠️ Le nom du fichier reste `ProjectionTooltip.tsx` : le renommer casserait les imports de trois
// consommateurs pour un gain nul, et ce lot est déjà large. Noté plutôt que fait.

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

// [FUTUR-AXE-Y-MINIMAL, revue panel] Pastille de graphe PARTAGÉE (rect arrondi + texte centré) —
// extraite de `RefLineLabel`/`TodayValueBadge` pour que le prochain correctif de contraste/police
// ne se fasse pas sur l'un et s'oublie sur l'autre (les deux étaient identiques à quelques
// constantes près, dupliquées). `aria-hidden` explicite en DÉFENSE EN PROFONDEUR : ce `<g>` est
// déjà présentationnel par héritage (descendant sans rôle propre d'un ancêtre `role="img"`), mais
// ne pas en dépendre implicitement — audit a11y du panel, 2026-09-21.
const Pill = (props: { x: number; y: number; text: string; color: string; fontSize: number; height: number; widthPad: number; fillOpacity: number; rx: number }) => {
    const { x, y, text, color, fontSize, height, widthPad, fillOpacity, rx } = props;
    const w = Math.round(text.length * fontSize * 0.58 + widthPad);
    return (
        <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
            <rect x={x} y={y} width={w} height={height} rx={rx} fill="#0B0E14" fillOpacity={fillOpacity} stroke={color} strokeOpacity={0.55} />
            <text x={x + w / 2} y={y + height / 2 + 0.5} textAnchor="middle" dominantBaseline="central" fill={color} fontSize={fontSize} fontWeight="bold">{text}</text>
        </g>
    );
};

// [FUTUR-AXE-Y-MINIMAL] Badge flottant ancré sur le POINT « aujourd'hui » de la courbe (pas sur la
// ligne verticale de référence, déjà étiquetée par `RefLineLabel` plus haut dans le graphe) —
// rendu comme `shape` d'un `ReferenceDot`, recharts y injecte `cx`/`cy` en pixels. Remplace
// l'ancien axe Y numérique (retiré, `[FUTUR-AXE-Y-MINIMAL]`) pour LA seule valeur qui compte au
// premier regard : la valeur nette d'aujourd'hui, déjà calculée ailleurs (`pointAncre.NetWorth`,
// même source que le panneau du jour) — jamais recalculée ici. L'appelant masque `value` en mode
// discret AVANT de l'y passer (`maskedTick`, `utils/chartPrivacy.ts` — source unique du « *** »,
// jamais un littéral recopié ici).
export const TodayValueBadge = (props: { cx?: number; cy?: number; value?: string }) => {
    const { cx, cy, value } = props;
    // `Number.isFinite`, pas `typeof === 'number'` : ce dernier laisse passer `NaN` (même patron
    // que `ClickableEventIcon` ci-dessus, mais un garde de SORTIE ne doit pas hériter d'un défaut
    // d'entrée qu'il peut éviter — revue panel silent-failure-hunter, 2026-09-21).
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !value) return null;
    const h = 22;
    // Tige verticale (patron `ClickableEventIcon`) : lève le badge AU-DESSUS de la zone où les
    // pastilles d'événement s'empilent (elles montent par paliers de 24px depuis le point, jusqu'à
    // 2-3 crans si plusieurs événements tombent le même jour) — sans elle, mesuré à l'écran, le
    // badge se peignait dans le même espace que la 1re pastille. -60 (et non -46) : marge mesurée
    // pour rester au-dessus d'une 2e pastille empilée (subIdx=1, centrée à -44) — revue panel.
    const dy = -60;
    const rectX = (cx as number) + 6;
    const rectY = (cy as number) + dy - h / 2;
    return (
        <g style={{ pointerEvents: 'none' }} aria-hidden="true">
            <line x1={cx} y1={cy} x2={cx} y2={(cy as number) + dy} stroke="#ffffff" strokeOpacity={0.45} strokeWidth={1} />
            <circle cx={cx} cy={cy} r={4} fill="#ffffff" stroke="#0B0E14" strokeWidth={1.5} />
            <Pill x={rectX} y={rectY} text={value} color="#ffffff" fontSize={12} height={h} widthPad={20} fillOpacity={0.92} rx={11} />
        </g>
    );
};

// G2 — label de ReferenceLine en pastille ancrée au bord (au lieu d'un texte
// centré qui passe par-dessus les aires et devient illisible). Ligne horizontale
// (Objectif FIRE) → pill en haut à droite ; ligne verticale (Aujourd'hui) → pill
// en haut, décalée à droite du trait pour ne pas chevaucher l'axe Y.
export const RefLineLabel = (props: { viewBox?: { x?: number; y?: number; width?: number; height?: number }; value?: string | number; color?: string; jalon?: boolean }) => {
    const { viewBox, value, color = '#ffffff', jalon = false } = props;
    if (!viewBox) return null;
    const { x = 0, y = 0, width = 0, height = 0 } = viewBox;
    const h = 18;
    const text = String(value);
    const isHorizontal = width >= height; // FIRE (horizontale) vs Aujourd'hui (verticale)
    // `w` recalculé ici (dupliqué de `Pill`, même formule) uniquement pour positionner rectX/rectY
    // AVANT le rendu — `Pill` la recalcule à l'identique, aucune divergence possible (même formule,
    // mêmes paramètres).
    const w = Math.round(text.length * 11 * 0.58 + 16);
    // [S5-REFONTE-FUTUR] Jalon (FIRE, retraite — maquette F-bureau) : pastille CENTRÉE sur le trait,
    // posée au-dessus du tracé (la marge haute du graphe lui réserve la place).
    if (jalon && !isHorizontal) {
        return <Pill x={x - w / 2} y={y - h - 8} text={text} color={color} fontSize={11} height={h + 4} widthPad={18} fillOpacity={0.95} rx={11} />;
    }
    const rectX = isHorizontal ? x + width - w - 6 : x + 6;
    const rectY = isHorizontal ? y - h - 3 : y + 3;
    return <Pill x={rectX} y={rectY} text={text} color={color} fontSize={11} height={h} widthPad={16} fillOpacity={0.88} rx={9} />;
};
