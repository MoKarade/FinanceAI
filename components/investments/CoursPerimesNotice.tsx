// components/investments/CoursPerimesNotice.tsx
//
// [COURS-AU-TROMPEUR] Dit, avec sa DATE, quel titre a un cours périmé. Remplace l'ancien
// « Cours au <heure du dernier rafraîchissement> », qui laissait croire que tous les cours dataient
// du moment où on les avait demandés. Rien à afficher quand tous les cours connus sont récents.

import React from 'react';
import { formatIsoDay } from '../../utils/format';
import type { TitreAuCoursPerime } from '../../services/history/fraicheurCours';

interface Props {
    titres: TitreAuCoursPerime[];
}

export const CoursPerimesNotice: React.FC<Props> = ({ titres }) => {
    if (titres.length === 0) return null;
    return (
        <p role="status" className="text-tiny text-warning-400 w-full">
            {titres.length === 1 ? 'Cours périmé' : 'Cours périmés'} :{' '}
            {titres.map((t, i) => (
                <React.Fragment key={t.symbol}>
                    {i > 0 && ', '}
                    {t.symbol} (cours du {formatIsoDay(t.date)})
                </React.Fragment>
            ))}
            . La variation sur 24 h n’est pas affichée pour ces titres.
        </p>
    );
};
