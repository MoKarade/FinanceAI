// components/ui/ProjectionRequired.tsx
//
// Empty state à afficher dans tout onglet qui dépend de la projection
// Future. Convention "calculs centralisés stricts" : si la projection
// n'a pas encore été calculée (lastProjection vide), on n'invente AUCUNE
// valeur — on affiche ce message + un bouton pour naviguer vers Future.
//
// Pourquoi : la convention "valeurs réelles ou rien" interdit les fallbacks
// approximatifs (ex: 25× dépenses ad-hoc) car ils divergeraient des
// chiffres de Future. Mieux vaut un message clair qu'un nombre mensonger.

import React from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { Tab } from '../../types';
import { Icon } from './Icon';

interface ProjectionRequiredProps {
    /** Section concernée (ex: "le capital à la retraite") */
    feature?: string;
    /** Affichage en inline (petit) ou en bloc (carte pleine) */
    variant?: 'inline' | 'block';
}

export const ProjectionRequired: React.FC<ProjectionRequiredProps> = ({
    feature = 'cette donnée',
    variant = 'block',
}) => {
    const navigateWithFocus = useFinanceStore(s => s.navigateWithFocus);
    const goToFuture = () => navigateWithFocus?.(Tab.FUTURE);
    // [ENG-INFINITY-NON-GARDE-A-LA-FRONTIERE] Une ENTRÉE illisible n'est pas une projection « pas
    // encore calculée » : ouvrir Future ne la répare pas, et laisser le message habituel enverrait
    // Marc cliquer en boucle sur un bouton sans effet. Ce composant étant monté sur toutes les
    // surfaces qui dépendent de la projection, le motif publié par `ProjectionEngine` les couvre
    // toutes d'un coup — plutôt qu'un message recopié écran par écran.
    const refus = useFinanceStore(s => s.projectionRefus);

    if (refus) {
        return variant === 'inline' ? (
            <span className="text-tiny text-danger-400 italic" role="status">{refus}</span>
        ) : (
            <div
                className="rounded-xl border border-danger-500/30 bg-danger-500/5 p-6 text-center"
                role="status"
                aria-live="polite"
            >
                <Icon name="alert" size={28} className="mb-2 text-danger-400" />
                <div className="text-meta font-bold text-danger-400 mb-1">Donnée illisible</div>
                <div className="text-tiny text-ink-300 max-w-md mx-auto">{refus}</div>
            </div>
        );
    }

    if (variant === 'inline') {
        return (
            <span className="text-tiny text-warning-400 italic" role="status">
                Projection requise —{' '}
                <button
                    onClick={goToFuture}
                    className="underline hover:text-amber-300 focus:outline-none focus:ring-2 focus:ring-warning-400 rounded"
                    aria-label="Ouvrir l'onglet Future pour calculer la projection"
                >
                    ouvrir Future
                </button>
            </span>
        );
    }

    return (
        <div
            className="rounded-xl border border-warning-500/30 bg-warning-500/5 p-6 text-center"
            role="status"
            aria-live="polite"
        >
            <Icon name="chart" size={28} className="mb-2 text-ink-400" />
            <div className="text-meta font-bold text-amber-300 mb-1">
                Projection nécessaire
            </div>
            <div className="text-tiny text-ink-300 mb-4 max-w-md mx-auto">
                {feature} provient de l'onglet Future. Ouvrez Future au moins
                une fois pour calculer la projection — les valeurs s'afficheront
                ensuite automatiquement dans tous les autres onglets.
            </div>
            <button
                onClick={goToFuture}
                className="px-4 py-2 rounded-lg bg-warning-500 hover:bg-warning-600 text-dark text-meta font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-warning-400"
                aria-label="Naviguer vers l'onglet Future"
            >
                Ouvrir Future →
            </button>
        </div>
    );
};
