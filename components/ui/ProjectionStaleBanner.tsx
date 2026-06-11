// components/ui/ProjectionStaleBanner.tsx
// [PH2-c-2] — bandeau discret affiché quand le DERNIER recalcul de projection a ÉCHOUÉ
// (store.projectionStatus === 'error'). Le moteur app-level (ProjectionEngine) ne publie jamais un
// résultat en erreur (no-fake-data) : les onglets continuent d'afficher la dernière courbe VALIDE —
// ce bandeau signale qu'elle est possiblement périmée. Avant, seul Futur montrait l'erreur.
import React from 'react';
import { useFinanceStore } from '../../store/useFinanceStore';
import { Icon } from './Icon';

export const ProjectionStaleBanner: React.FC<{ className?: string }> = ({ className = '' }) => {
    const hasError = useFinanceStore((s) => s.projectionStatus === 'error');
    if (!hasError) return null;
    return (
        <div
            role="status"
            className={`flex items-center gap-2 rounded-card border border-warning-500/25 bg-warning-500/[0.08] px-3 py-2 text-meta text-warning-300 ${className}`}
        >
            <Icon name="alert" size={14} className="shrink-0" aria-hidden="true" />
            <span>
                Le dernier recalcul de la projection a échoué — les chiffres projetés affichés datent du
                dernier calcul réussi. Vérifie tes paramètres dans l'onglet Futur.
            </span>
        </div>
    );
};
