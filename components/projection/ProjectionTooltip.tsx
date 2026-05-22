import React from 'react';

// Normalise un label d'event : extrait l'emoji du début pour l'aligner dans
// un slot fixe, et garde le reste du texte. Si pas d'emoji détecté, retourne
// un emoji par défaut basé sur mots-clés.
const EVENT_KEYWORD_ICONS: Array<[RegExp, string]> = [
    [/voyage/i, '✈️'],
    [/vente|maison|immo|hypo/i, '🏠'],
    [/krach|chute|baisse marché/i, '📉'],
    [/véhicule|voiture|auto/i, '🚗'],
    [/réno|rénovation|travaux/i, '🔨'],
    [/maladie|santé|hospital/i, '🩺'],
    [/héritage|succession/i, '🎁'],
    [/rembours.*impôt|remboursement fisc/i, '💸'],
    [/fisc|impôt|tax/i, '🏛️'],
    [/objectif|but financier/i, '🎯'],
    [/enfant|naissance|bébé|reee/i, '👶'],
    [/épargne|invest|placement/i, '💰'],
    [/survie|coussin/i, '🛟'],
];

export const splitEventIcon = (label: string): { icon: string; text: string } => {
    // Detect leading emoji (1-2 codepoints + optional VS16/skin tone)
    const m = label.match(/^([\p{Emoji_Presentation}\p{Extended_Pictographic}][️‍\p{Emoji_Modifier}\p{Emoji_Component}]*)\s+(.*)$/u);
    if (m) return { icon: m[1], text: m[2] };
    for (const [re, icon] of EVENT_KEYWORD_ICONS) {
        if (re.test(label)) return { icon, text: label };
    }
    return { icon: '•', text: label };
};

export const ExpertTooltip = ({ active, payload, isPrivacyMode, userName1, userName2 }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;

    // Décaissement portfolio (retraits CELI + REER du mois) : affiché quand
    // l'utilisateur est en retraite. Sans ça, le tooltip ne montrait que
    // RRQ/PSV → semblait dire qu'on vivait avec ~60$/mois pendant le gap
    // entre l'âge de retraite et le démarrage des prestations publiques.
    const isRetired = (data.IncomeRetirement || 0) > 0
        || (data.RetraitREER || 0) > 0
        || (data.RetraitCELI || 0) > 0;
    const portfolioOutflow = (data.RetraitREER || 0) + (data.RetraitCELI || 0);

    return (
        <div className="relative bg-gradient-to-b from-[#11161f]/95 to-[#0B0E14]/95 backdrop-blur-md border border-white/15 ring-1 ring-white/5 p-4 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] w-80 max-h-[520px] overflow-y-auto z-50 animate-fade-in">
            <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-primary via-purple-500 to-pink-500 opacity-80" />
            <div className="mb-3 pb-2.5 border-b border-white/15 flex justify-between items-center gap-2">
                <span className="text-base font-extrabold text-white tracking-tight">{data.dateLabel || 'N/A'}</span>
                <span className="text-tiny font-bold text-primary bg-primary/15 border border-primary/30 px-2 py-0.5 rounded-full whitespace-nowrap">Âge {data.age || '??'}</span>
            </div>

            <div className="mb-3 space-y-1">
                {(data.IncomeMarc || 0) > 0 && <div className="flex justify-between text-xs"><span className="text-gray-400">Paye {userName1 || 'Utilisateur 1'}:</span> <span className="font-mono text-green-400 privacy-blur">+{(data.IncomeMarc || 0).toLocaleString()}$</span></div>}
                {(data.IncomeAnna || 0) > 0 && <div className="flex justify-between text-xs"><span className="text-gray-400">Paye {userName2 || 'Utilisateur 2'}:</span> <span className="font-mono text-green-400 privacy-blur">+{(data.IncomeAnna || 0).toLocaleString()}$</span></div>}
                {(data.IncomeRetirement || 0) > 0 && <div className="flex justify-between text-xs"><span className="text-gray-400">Rentes/Retraite:</span> <span className="font-mono text-green-400 privacy-blur">+{(data.IncomeRetirement || 0).toLocaleString()}$</span></div>}
                {portfolioOutflow > 0 && <div className="flex justify-between text-xs"><span className="text-gray-400">Décaissement portfolio:</span> <span className="font-mono text-amber-400 privacy-blur">+{portfolioOutflow.toLocaleString()}$</span></div>}

                <div className="flex justify-between text-xs"><span className="text-gray-400">Dépenses Vies:</span> <span className="font-mono text-red-400 privacy-blur">-{(data.Expenses || 0).toLocaleString()}$</span></div>

                {(data.childGross || 0) > 0 && (
                    <div className="flex justify-between text-tiny">
                        <span className="text-gray-500 pl-2">↳ dt. Enfant:</span>
                        <span className="font-mono text-red-300 privacy-blur text-right">
                            -{(data.childGross || 0).toLocaleString()}$
                            {(data.childBenefits || 0) > 0 && <span className="text-green-400 ml-1">(+{(data.childBenefits || 0)}$ alloc)</span>}
                        </span>
                    </div>
                )}
                {(data.ReeeContrib || 0) > 0 && <div className="flex justify-between text-tiny"><span className="text-gray-500 pl-2">↳ dt. Épargne REEE:</span> <span className="font-mono text-blue-300 privacy-blur">{(data.ReeeContrib || 0)}$ (+30% gouv)</span></div>}

                {(data.ImmoHypo || 0) > 0 && (
                    <div className="flex flex-col text-tiny">
                        <div className="flex justify-between">
                            <span className="text-gray-500 pl-2">↳ dt. Maison:</span>
                            <span className="font-mono text-pink-300 privacy-blur">Hypo {(data.ImmoHypo || 0).toLocaleString()}$ | Chg {(data.ImmoCharges || 0).toLocaleString()}$</span>
                        </div>
                        <div className="flex justify-end text-tiny text-gray-500 mt-0.5 font-mono">
                            (Capital: <span className="text-green-400/80 mx-1">+{(data.ImmoPrincipal || 0).toLocaleString()}$</span> Intérêts: <span className="text-red-400/80 ml-1">-{(data.ImmoInterest || 0).toLocaleString()}$</span>)
                        </div>
                    </div>
                )}
                {(data.ImmoHypo || 0) === 0 && (data.ImmoCharges || 0) > 0 && (
                    <div className="flex justify-between text-tiny">
                        <span className="text-gray-500 pl-2">↳ dt. Maison (Payée):</span>
                        <span className="font-mono text-pink-300 privacy-blur">Chg {(data.ImmoCharges || 0).toLocaleString()}$</span>
                    </div>
                )}

                <div className="flex justify-between text-xs font-bold border-t border-white/10 pt-1 mt-1">
                    <span className="text-gray-300">Var. Nette (Mois):</span>
                    <span className={`font-mono privacy-blur ${(data.diffNW || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {(data.diffNW || 0) > 0 ? '+' : ''}{(data.diffNW || 0).toLocaleString()}$
                    </span>
                </div>

                <div className="grid grid-cols-3 gap-1 mt-1 text-tiny text-gray-400 border-b border-white/5 pb-2 mb-2">
                    <div className="text-center bg-white/5 rounded py-0.5">Cash: <br/><span className={(data.diffLiquid || 0) >= 0 ? 'text-green-300' : 'text-red-300'}>{(data.diffLiquid || 0) > 0 ? '+' : ''}{(data.diffLiquid || 0)}$</span></div>
                    <div className="text-center bg-white/5 rounded py-0.5">CELI: <br/><span className={(data.diffCELI || 0) >= 0 ? 'text-green-300' : 'text-red-300'}>{(data.diffCELI || 0) > 0 ? '+' : ''}{(data.diffCELI || 0)}$</span></div>
                    <div className="text-center bg-white/5 rounded py-0.5">REER: <br/><span className={(data.diffREER || 0) >= 0 ? 'text-green-300' : 'text-red-300'}>{(data.diffREER || 0) > 0 ? '+' : ''}{(data.diffREER || 0)}$</span></div>
                </div>
            </div>

            <div className="bg-black/30 p-2.5 rounded-xl space-y-1.5 text-xs text-white border border-white/10 mb-3">
                <div className="text-tiny uppercase tracking-widest text-ink-400 font-bold mb-1.5">Répartition du patrimoine</div>
                <div className="flex justify-between items-center"><span className="flex items-center gap-1.5 text-gray-300"><span className="w-2 h-2 rounded-full shrink-0 bg-[#4b5563]" />Cash (Coussin)</span> <span className="font-mono privacy-blur">{(data.Liquidites || 0).toLocaleString()}$</span></div>
                <div className="flex justify-between items-center"><span className="flex items-center gap-1.5 text-gray-300"><span className="w-2 h-2 rounded-full shrink-0 bg-[#10b981]" />CELI</span> <span className="font-mono privacy-blur">{(data.CELI || 0).toLocaleString()}$</span></div>
                <div className="flex justify-between items-center"><span className="flex items-center gap-1.5 text-gray-300"><span className="w-2 h-2 rounded-full shrink-0 bg-[#3b82f6]" />REER</span> <span className="font-mono privacy-blur">{(data.REER || 0).toLocaleString()}$</span></div>
                {(data.REEE || 0) > 0 && <div className="flex justify-between items-center"><span className="flex items-center gap-1.5 text-gray-300"><span className="w-2 h-2 rounded-full shrink-0 bg-[#06b6d4]" />REEE (Études)</span> <span className="font-mono privacy-blur">{(data.REEE || 0).toLocaleString()}$</span></div>}
                <div className="flex justify-between items-center"><span className="flex items-center gap-1.5 text-gray-300"><span className="w-2 h-2 rounded-full shrink-0 bg-[#f59e0b]" />Non-Enreg</span> <span className="font-mono privacy-blur">{(data.NonReg || 0).toLocaleString()}$</span></div>
                {(data.Crypto || 0) > 0 && <div className="flex justify-between items-center"><span className="flex items-center gap-1.5 text-gray-300"><span className="w-2 h-2 rounded-full shrink-0 bg-[#a855f7]" />Crypto</span> <span className="font-mono privacy-blur">{(data.Crypto || 0).toLocaleString()}$</span></div>}
                <div className="flex justify-between items-center"><span className="flex items-center gap-1.5 text-gray-300"><span className="w-2 h-2 rounded-full shrink-0 bg-[#ec4899]" />Immobilier</span> <span className="font-mono privacy-blur">{(data.Immobilier || 0).toLocaleString()}$</span></div>
            </div>

            <div className="rounded-xl bg-gradient-to-r from-primary/20 to-purple-500/15 border border-white/15 p-3">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-tiny uppercase tracking-widest text-ink-300 font-bold">Valeur nette</span>
                    <span className={`text-tiny font-mono font-bold px-1.5 py-0.5 rounded ${(data.diffNW || 0) >= 0 ? 'text-green-300 bg-green-500/15' : 'text-red-300 bg-red-500/15'}`}>
                        {(data.diffNW || 0) > 0 ? '+' : ''}{(data.diffNW || 0).toLocaleString()}$ /mois
                    </span>
                </div>
                <div className="mt-1 text-2xl font-black text-white font-mono privacy-blur leading-none">{(data.NetWorth || 0).toLocaleString()}$</div>
            </div>

            {((data.ImpotLatent || 0) < 0 || (data.FluxImpots || 0) < 0) && (
                <div className="mt-2 space-y-1">
                    {(data.ImpotLatent || 0) < 0 && <div className="flex justify-between text-xs"><span className="text-red-500 font-bold">Impôt Latent (Dette):</span> <span className="font-mono text-red-400 privacy-blur">{(data.ImpotLatent || 0).toLocaleString()}$</span></div>}
                    {(data.FluxImpots || 0) < 0 && <div className="flex justify-between text-xs"><span className="text-red-500 font-bold">Impôt Payé (Avril):</span> <span className="font-mono text-red-400 privacy-blur">{(data.FluxImpots || 0).toLocaleString()}$</span></div>}
                </div>
            )}

            {(data.lifeEvents?.length > 0 || data.flowEvents?.length > 0) && (
                <div className="mt-3 pt-2 border-t border-white/20">
                    {data.lifeEvents?.length > 0 && (
                        <div className="mb-2">
                            <span className="text-tiny uppercase text-yellow-500 font-bold tracking-widest">Événements</span>
                            <ul className="text-xs text-yellow-300 mt-1 font-bold space-y-1">
                                {data.lifeEvents?.map((e: string, i: number) => {
                                    const { icon, text } = splitEventIcon(e);
                                    return (
                                        <li key={i} className="flex items-start gap-2">
                                            <span className="inline-block w-5 text-center shrink-0" aria-hidden="true">{icon}</span>
                                            <span className="flex-1 break-words">{text}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                    {data.flowEvents?.length > 0 && (
                        <div>
                            <span className="text-tiny uppercase text-gray-500 font-bold tracking-widest">Flux d'Épargne</span>
                            <ul className="text-tiny mt-1 space-y-1 font-mono">
                                {data.flowEvents?.map((e: string, i: number) => {
                                    const { icon, text } = splitEventIcon(e);
                                    const color = e.includes('Survie') ? 'text-red-300' : 'text-blue-300';
                                    return (
                                        <li key={i} className={`flex items-start gap-2 ${color}`}>
                                            <span className="inline-block w-5 text-center shrink-0" aria-hidden="true">{icon}</span>
                                            <span className="flex-1 break-words">{text}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
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
            <text y={dy} textAnchor="middle" dominantBaseline="central" fontSize={isLife ? 13 : 10} style={{ pointerEvents: 'none' }}>{icon}</text>
        </g>
    );
};
