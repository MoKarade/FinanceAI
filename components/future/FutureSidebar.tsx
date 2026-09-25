// components/future/FutureSidebar.tsx
// [FUTUR-NAV-TIROIRS] Barre latérale persistante de l'écran Futur (desktop, ≥1024px). Regroupe ce
// qui, avant ce lot, vivait en haut du flux (titre, santé, KPI) et dans la barre d'outils de la
// courbe (période, actions) — reçu en JSX déjà calculé par `FutureProjection.tsx`, jamais recalculé
// ici : ce composant est une coquille de PRÉSENTATION, aucune nouvelle donnée dérivée.
//
// ⚠️ N'affiche PAS `<PageHeader>` (conçu pour un en-tête pleine largeur) : à 300px de large, son
// sous-titre casserait mal. En-tête propre, plus compact, mêmes informations.
import React from 'react';
import { FutureHealthSummary } from './FutureHealthSummary';

export type FutureDrawerId = 'hypotheses' | 'plan' | 'historique';

/** Source unique de l'`id` DOM du tiroir associé — consommée ICI (`aria-controls` des liens de la
 *  barre latérale) ET dans `FutureProjection.tsx` (boutons mobiles + `<Drawer id=…>`), pour que les
 *  deux ne divergent jamais. */
export function tiroirDomId(id: FutureDrawerId): string {
    return `future-drawer-${id}`;
}

interface FutureSidebarProps {
    insolvencyBadge?: React.ReactNode;
    dataModePill: React.ReactNode;
    /** `null` tant que la courbe n'est pas révélée — no-fake-data, pas de tuiles vides. */
    kpi: React.ReactNode | null;
    /** Sélecteur de période + actions (Ré-optimiser/Verrouiller/Plein écran), même JSX que la
     *  barre d'outils de la courbe — un seul calcul, rendu ici plutôt que dans la Card sur desktop.
     *  `null` tant que la courbe n'est pas révélée : ces contrôles n'existent pas avant, comme sur
     *  la mise en page empilée (voir l'appelant). */
    barreOutils: React.ReactNode | null;
    tiroirOuvert: FutureDrawerId | null;
    onOuvrirTiroir: (id: FutureDrawerId) => void;
}

const LIENS_TIROIR: ReadonlyArray<{ id: FutureDrawerId; icon: string; label: string }> = [
    { id: 'hypotheses', icon: '⚙️', label: 'Modifier les hypothèses' },
    { id: 'plan', icon: '🗂️', label: "Plan d'action" },
    { id: 'historique', icon: '📊', label: 'Historique' },
];

export const FutureSidebar: React.FC<FutureSidebarProps> = ({
    insolvencyBadge, dataModePill, kpi, barreOutils, tiroirOuvert, onOuvrirTiroir,
}) => {
    return (
        <aside className="w-[320px] shrink-0 flex flex-col gap-4" aria-label="Contrôles de la projection">
            <div className="flex items-start gap-2.5">
                <span className="text-xl leading-none" aria-hidden="true">🔮</span>
                <div className="min-w-0">
                    <h1 className="text-h2 text-ink-50 leading-tight">Projection Future</h1>
                    <p className="text-tiny text-ink-400 mt-0.5 leading-snug">
                        Loyer → Hypothèque auto, frais enfants dynamiques.
                    </p>
                </div>
            </div>

            {insolvencyBadge}
            {dataModePill}

            <FutureHealthSummary />

            {kpi}

            {barreOutils}

            <hr className="border-white/5" />

            <nav aria-label="Sections de la projection" className="flex flex-col gap-1">
                {LIENS_TIROIR.map((lien) => (
                    <button
                        key={lien.id}
                        type="button"
                        onClick={() => onOuvrirTiroir(lien.id)}
                        aria-haspopup="dialog"
                        aria-expanded={tiroirOuvert === lien.id}
                        aria-controls={tiroirDomId(lien.id)}
                        className="flex items-center justify-between gap-2 min-h-[44px] px-2 rounded-card text-meta font-semibold text-ink-200 hover:bg-white/5 transition-colors focus-ring"
                    >
                        <span className="flex items-center gap-2">
                            <span aria-hidden="true">{lien.icon}</span> {lien.label}
                        </span>
                        <span aria-hidden="true" className="text-ink-500">›</span>
                    </button>
                ))}
            </nav>
        </aside>
    );
};
