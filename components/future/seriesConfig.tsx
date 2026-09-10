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

export type LegendShape = 'area' | 'line' | 'bar' | 'dashed' | 'dot';

export interface FutureLegendItem {
    key: string;
    label: string;
    color: string;
    shape: LegendShape;
    mcOnly?: boolean; // n'apparaît que si Monte Carlo est activé
}

export const FUTURE_LEGEND_ITEMS: FutureLegendItem[] = [
    { key: 'Liquidites', label: 'Cash', color: '#4b5563', shape: 'area' },
    { key: 'CELI', label: 'CELI', color: '#10b981', shape: 'area' },
    { key: 'CELIAPP', label: 'CELIAPP (FHSA)', color: '#2dd4bf', shape: 'area' },
    { key: 'REER', label: 'REER', color: '#3b82f6', shape: 'area' },
    { key: 'REEE', label: 'REEE', color: '#06b6d4', shape: 'area' },
    { key: 'NonReg', label: 'Non-Enreg', color: '#f59e0b', shape: 'area' },
    { key: 'Crypto', label: 'Crypto', color: '#a855f7', shape: 'area' },
    { key: 'Immobilier', label: 'Équité Immo', color: '#ec4899', shape: 'area' },
    { key: 'Entreprise', label: 'Entreprise privée', color: '#84cc16', shape: 'area' },
    { key: 'NetWorth', label: 'Valeur Nette', color: '#ffffff', shape: 'line' },
    { key: 'ImpotLatent', label: 'Impôt Latent', color: '#ef4444', shape: 'dashed' },
    { key: 'FluxImpots', label: 'Paiement Impôts', color: '#ef4444', shape: 'bar' },
    { key: 'montecarlo', label: 'Monte Carlo (P10–P90)', color: '#3b82f6', shape: 'dashed', mcOnly: true },
    { key: 'events', label: 'Événements / icônes', color: '#e5e7eb', shape: 'dot' },
    { key: 'fire', label: 'Objectif FIRE', color: '#f97316', shape: 'dashed' },
    { key: 'aujourdhui', label: "Aujourd'hui", color: '#ffffff', shape: 'dashed' },
];

export const LegendSwatch: React.FC<{ shape: LegendShape; color: string; dimmed?: boolean }> = ({ shape, color, dimmed }) => {
    const style = { backgroundColor: color, opacity: dimmed ? 0.4 : 1 } as React.CSSProperties;
    if (shape === 'line') return <span className="w-4 h-[3px] rounded-full shrink-0" style={style} aria-hidden="true" />;
    if (shape === 'bar') return <span className="w-1.5 h-3 rounded-sm shrink-0" style={style} aria-hidden="true" />;
    if (shape === 'dot') return <span className="w-2.5 h-2.5 rounded-full shrink-0" style={style} aria-hidden="true" />;
    if (shape === 'dashed') return <span className="w-4 h-0 shrink-0 border-t-2 border-dashed" style={{ borderColor: color, opacity: dimmed ? 0.4 : 1 }} aria-hidden="true" />;
    return <span className="w-3 h-3 rounded shrink-0" style={style} aria-hidden="true" />;
};
