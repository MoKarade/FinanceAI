// components/vie/FriseProjets.tsx
//
// [S5-REFONTE-PROJETS] Frise des maquettes (« Frise 2026 → 2040 ») :
// - bureau : axe horizontal, une pastille par projet à sa date, étiquette (nom + coût) au-dessus ;
//   on GLISSE une étiquette pour changer l'année du projet (flèches ← → au clavier, même effet) ;
// - téléphone : frise verticale (aujourd'hui → fin), une ligne par projet.
// Un clic (ou Entrée) sélectionne le projet : la carte d'impact le suit.
import React, { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { PrivateAmount } from '../ui/PrivateAmount';
import { formatCAD, formatCompactCAD } from '../../utils/format';
import { changerAnnee, joursRestants, type ProjetDeVie } from './projetsDeVie';
import { dateLongue } from './dateLongue';

const DUREE_FRISE = 14;

const RISQUES = new Set(['KRACH', 'ACCIDENT', 'PERTE_EMPLOI']);
/** Couleur d'un projet (maquettes) : voyage cyan, événement ambre, aléa rouge. */
export const couleurProjet = (p: ProjetDeVie) => (p.genre === 'voyage' ? '#56b6d6' : RISQUES.has(p.type) ? '#f87171' : '#d4a24c');

interface Props {
    items: ProjetDeVie[];
    selection: string | null;
    onSelection: (cle: string) => void;
    onRedater: (cle: string, date: string) => void;
    aujourdhui: string;
    compacte: boolean;
}

export const FriseProjets: React.FC<Props> = (p) => {
    const annee0 = Number(p.aujourdhui.slice(0, 4));
    return (
        <section aria-labelledby="frise-titre" className="rounded-2xl bg-surface border border-white/6 p-4 sm:px-6 sm:py-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="frise-titre" className="text-[17px] lg:text-[18px] font-semibold text-ink-50">Frise {annee0} → {annee0 + DUREE_FRISE}</h2>
                {!p.compacte && <span className="text-[13px] text-ink-400">Glisse un projet pour changer son année</span>}
            </div>
            {p.compacte ? <FriseVerticale {...p} annee0={annee0} /> : <FriseHorizontale {...p} annee0={annee0} />}
        </section>
    );
};

/** Position d'une date sur l'axe, en fraction [0, 1] (aujourd'hui → milieu de l'année de fin). */
function position(dateIso: string, aujourdhui: string, annee0: number): number {
    const an = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return y + ((m - 1) * 30.4 + d) / 365; };
    const t0 = an(aujourdhui), t1 = annee0 + DUREE_FRISE + 0.5;
    return (an(dateIso) - t0) / (t1 - t0);
}

const FriseHorizontale: React.FC<Props & { annee0: number }> = ({ items, selection, onSelection, onRedater, aujourdhui, annee0 }) => {
    const boite = useRef<HTMLDivElement>(null);
    const [largeur, setLargeur] = useState(1000);
    const [glisse, setGlisse] = useState<{ cle: string; x0: number; dx: number } | null>(null);
    const [annonce, setAnnonce] = useState('');
    useLayoutEffect(() => {
        const el = boite.current;
        if (!el) return;
        const mesurer = () => setLargeur(el.clientWidth || 1000);
        mesurer();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(mesurer);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const visibles = items
        .map((it) => ({ it, f: position(it.date, aujourdhui, annee0) }))
        .filter(({ f }) => f >= 0 && f <= 1);
    // Étiquettes sur deux rangées : la seconde quand la première est occupée (largeur estimée).
    const finRangee = [-Infinity, -Infinity];
    const places = visibles.map(({ it, f }) => {
        const x = f * largeur;
        const demi = ((it.nom.length + 7) * 7.2 + 28) / 2;
        const r = x - demi > finRangee[0] + 8 ? 0 : 1;
        finRangee[r] = Math.max(finRangee[r], x + demi);
        return { it, f, rangee: r };
    });

    const deplacer = (it: ProjetDeVie, annee: number) => {
        const a = Math.min(annee0 + DUREE_FRISE, Math.max(annee0, annee));
        if (a === Number(it.date.slice(0, 4))) return;
        onRedater(it.cle, changerAnnee(it.date, a));
        setAnnonce(`${it.nom} déplacé en ${a}.`);
    };
    const anneeAuPoint = (f: number) => {
        const [y, m, d] = aujourdhui.split('-').map(Number);
        const t0 = y + ((m - 1) * 30.4 + d) / 365;
        return Math.floor(t0 + f * (annee0 + DUREE_FRISE + 0.5 - t0));
    };

    const annees: number[] = [];
    for (let a = annee0 + 2; a <= annee0 + DUREE_FRISE; a += 2) annees.push(a);

    return (
        <div ref={boite} className="relative h-[150px] select-none">
            <div className="absolute inset-x-0 top-[100px] h-0.5 bg-white/10" aria-hidden="true" />
            <div className="absolute left-0 top-[92px] w-[18px] h-[18px] rounded-full bg-ink-50" aria-hidden="true" />
            <div className="absolute left-0 top-[120px] font-mono text-[11px] text-ink-200">aujourd'hui</div>
            {annees.map((a) => {
                const f = position(`${a}-01-01`, aujourdhui, annee0);
                return <div key={a} className="absolute top-[120px] -translate-x-1/2 font-mono text-[11px] text-ink-400" style={{ left: `${f * 100}%` }} aria-hidden="true">{a}</div>;
            })}
            {places.map(({ it, f, rangee }) => {
                const couleur = couleurProjet(it);
                const enGlisse = glisse?.cle === it.cle;
                const gauche = f * largeur + (enGlisse ? glisse.dx : 0);
                const choisi = selection === it.cle;
                return (
                    <div key={it.cle} className="absolute flex flex-col items-center gap-1.5 -translate-x-1/2" style={{ left: `${gauche}px`, top: rangee === 0 ? 0 : 40 }}>
                        <button
                            type="button"
                            aria-pressed={choisi}
                            aria-describedby="frise-aide"
                            onClick={() => onSelection(it.cle)}
                            onKeyDown={(e) => {
                                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                                e.preventDefault();
                                deplacer(it, Number(it.date.slice(0, 4)) + (e.key === 'ArrowRight' ? 1 : -1));
                            }}
                            onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); setGlisse({ cle: it.cle, x0: e.clientX, dx: 0 }); }}
                            onPointerMove={(e) => { if (glisse?.cle === it.cle) setGlisse({ ...glisse, dx: e.clientX - glisse.x0 }); }}
                            onPointerUp={() => {
                                if (glisse?.cle === it.cle && Math.abs(glisse.dx) > 4) deplacer(it, anneeAuPoint((f * largeur + glisse.dx) / largeur));
                                setGlisse(null);
                            }}
                            onPointerCancel={() => setGlisse(null)}
                            className={`px-3 py-1.5 rounded-[10px] bg-surface border text-[13px] text-ink-50 whitespace-nowrap cursor-grab active:cursor-grabbing touch-none focus-ring ${choisi ? 'ring-1 ring-ink-50/60' : ''}`}
                            style={{ borderColor: `${couleur}80` }}
                        >
                            {it.nom} <span className="font-mono" style={{ color: couleur }}><PrivateAmount>{formatCompactCAD(it.cout, { precis: true })}</PrivateAmount></span>
                        </button>
                        <div className="w-0.5" style={{ height: rangee === 0 ? 52 : 12, background: `${couleur}80` }} aria-hidden="true" />
                        <div className="w-3.5 h-3.5 rounded-full" style={{ background: couleur }} aria-hidden="true" />
                    </div>
                );
            })}
            <p id="frise-aide" className="sr-only">Flèches gauche et droite : déplacer le projet d'un an.</p>
            <p className="sr-only" role="status">{annonce}</p>
        </div>
    );
};

const FriseVerticale: React.FC<Props & { annee0: number }> = ({ items, selection, onSelection, aujourdhui, annee0 }) => (
    <ol className="relative flex flex-col gap-3 pl-1">
        <span className="absolute left-[21px] top-2 bottom-2 w-px bg-white/10" aria-hidden="true" />
        <li className="relative flex items-center gap-4 pl-[15px]">
            <span className="w-3 h-3 rounded-full bg-ink-50" aria-hidden="true" />
            <span className="text-meta font-semibold text-ink-100">aujourd'hui</span>
        </li>
        {items.map((it) => {
            const couleur = couleurProjet(it);
            const j = joursRestants(it.date, aujourdhui);
            return (
                <li key={it.cle} className="relative">
                    <button
                        type="button"
                        aria-pressed={selection === it.cle}
                        onClick={() => onSelection(it.cle)}
                        className={`w-full flex items-center gap-3 text-left rounded-xl py-1.5 pr-1 focus-ring ${selection === it.cle ? 'bg-white/4' : ''}`}
                    >
                        <span className="relative w-10 h-10 shrink-0 rounded-xl bg-dark border flex items-center justify-center" style={{ borderColor: `${couleur}66`, color: couleur }} aria-hidden="true">
                            <Icon name={it.icone} size={18} />
                        </span>
                        <span className="flex-1 min-w-0 flex flex-col">
                            <span className="font-semibold text-ink-50 truncate">{it.nom}</span>
                            <span className="font-mono text-meta text-ink-400">{dateLongue(it.date)}</span>
                        </span>
                        <span className="flex flex-col items-end shrink-0">
                            <PrivateAmount className="font-mono font-bold text-ink-50">{formatCAD(it.cout)}</PrivateAmount>
                            <span className="font-mono text-meta text-ink-400">{it.genre === 'voyage' ? (j >= 0 ? `dans ${j} j` : 'passé') : 'événement'}</span>
                        </span>
                    </button>
                </li>
            );
        })}
        <li className="relative flex items-center gap-4 pl-[15px]">
            <span className="w-3 h-3 rounded-full border border-ink-400 bg-dark" aria-hidden="true" />
            <span className="font-mono text-meta text-ink-400">{annee0 + DUREE_FRISE}</span>
        </li>
    </ol>
);
