/**
 * [FUTUR-MOBILE-PR1] Extraction PURE de `FUTURE_LEGEND_ITEMS`/`LegendSwatch` hors de
 * `components/FutureProjection.tsx` — aucun changement de comportement ni de rendu (une référence de
 * ligne se périme au premier refactor, on nomme la construction : `UNE-REFERENCE-DE-LIGNE-DANS-UNE-DOC-EST-UNE-DETTE`). Module autonome (pas d'état, pas de dépendance au composant) pour que
 * la légende mobile (`[FUTUR-MOBILE-PR3]`) puisse la réutiliser sans importer tout le god-file.
 *
 * G10 — Légende interactive : une seule source de vérité pour les chips ET les gardes de visibilité
 * dans le graphique. `key` correspond au dataKey recharts (ou à un groupe logique : 'montecarlo',
 * 'events', 'fire', 'aujourdhui').
 */
import React from 'react';
import { COULEUR_DETTE, COULEUR_LEVIER, LIBELLE_LEVIER } from './detteSerie';

export type LegendShape = 'area' | 'line' | 'bar' | 'dashed' | 'dot';

export interface FutureLegendItem {
    key: string;
    label: string;
    color: string;
    shape: LegendShape;
    mcOnly?: boolean; // n'apparaît que si Monte Carlo est activé
}

export const FUTURE_LEGEND_ITEMS: FutureLegendItem[] = [
    // [S5-REFONTE-FUTUR] Libellés et couleurs des maquettes F-bureau / F-mobile.
    { key: 'Liquidites', label: 'Cash', color: '#64748b', shape: 'area' },
    { key: 'CELI', label: 'CELI', color: '#34b39a', shape: 'area' },
    { key: 'CELIAPP', label: 'CELIAPP', color: '#7dd3c0', shape: 'area' },
    { key: 'REER', label: 'REER', color: '#7c93f2', shape: 'area' },
    { key: 'REEE', label: 'REEE', color: '#56b6d6', shape: 'area' },
    { key: 'NonReg', label: 'Non-enregistré', color: '#d4a24c', shape: 'area' },
    { key: 'Crypto', label: 'Crypto', color: '#a98bea', shape: 'area' },
    { key: 'Immobilier', label: 'Équité immo', color: '#d08a9e', shape: 'area' },
    { key: 'Entreprise', label: 'Entreprise', color: '#9ab86a', shape: 'area' },
    // [FUTUR-COURBE-DETTE] Aire PLEINE sous zéro, ORANGE — à ne pas confondre avec l'impôt latent
    // juste en dessous, rouge POINTILLÉ. Marc lisait ce dernier comme sa dette ; deux couleurs et
    // deux formes séparent désormais un dû RÉEL d'un impôt HYPOTHÉTIQUE. Détail : `detteSerie.ts`.
    { key: 'DettesNonImmo', label: 'Dettes', color: COULEUR_DETTE, shape: 'area' },
    { key: 'ImpotLatent', label: 'Impôt latent', color: '#ef4444', shape: 'dashed' },
    // [DETTE-LEVIER-EXPLICITE] La PART de la dette ci-dessus qui est un levier voulu (marge Smith
    // Manoeuvre). Couleur ET forme distinctes — INDIGO POINTILLÉ, la couleur du bouton qui
    // l’active — parce que les deux dettes ont des trajectoires normales OPPOSÉES : l’une descend
    // vers zéro, l’autre grossit par construction. Le libellé dit « dont » : c’est un sous-
    // ensemble tracé PAR-DESSUS, jamais un terme de plus. Détail : `detteSerie.ts`.
    { key: 'DetteLevierSmith', label: LIBELLE_LEVIER, color: COULEUR_LEVIER, shape: 'dashed' },
    { key: 'montecarlo', label: 'Monte-Carlo P10–P90', color: '#c4b5fd', shape: 'dashed', mcOnly: true },
    { key: 'NetWorth', label: 'Valeur nette', color: '#f8fafc', shape: 'line' },
    { key: 'fire', label: 'Objectif FIRE', color: '#fbbf24', shape: 'dashed' },
    { key: 'FluxImpots', label: 'Paiement impôts', color: '#f87171', shape: 'bar' },
    { key: 'events', label: 'Événements', color: '#e5e7eb', shape: 'dot' },
    { key: 'aujourdhui', label: "Aujourd'hui", color: '#ffffff', shape: 'dashed' },
];

/** [S5-REFONTE-FUTUR] Couleur d'une série, lue dans la légende — source unique pour le tracé. */
export const couleurSerie = (cle: string): string =>
    FUTURE_LEGEND_ITEMS.find((i) => i.key === cle)?.color ?? '#94a3b8';


export const LegendSwatch: React.FC<{ shape: LegendShape; color: string; dimmed?: boolean }> = ({ shape, color, dimmed }) => {
    const style = { backgroundColor: color, opacity: dimmed ? 0.4 : 1 } as React.CSSProperties;
    if (shape === 'line') return <span className="w-4 h-[3px] rounded-full shrink-0" style={style} aria-hidden="true" />;
    if (shape === 'bar') return <span className="w-1.5 h-3 rounded-xs shrink-0" style={style} aria-hidden="true" />;
    if (shape === 'dot') return <span className="w-2.5 h-2.5 rounded-full shrink-0" style={style} aria-hidden="true" />;
    if (shape === 'dashed') return <span className="w-4 h-0 shrink-0 border-t-2 border-dashed" style={{ borderColor: color, opacity: dimmed ? 0.4 : 1 }} aria-hidden="true" />;
    return <span className="w-3 h-3 rounded-sm shrink-0" style={style} aria-hidden="true" />;
};
