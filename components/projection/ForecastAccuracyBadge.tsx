// components/projection/ForecastAccuracyBadge.tsx
//
// [PASSE-REEL-2] « Je veux une indication de à quel point mon passé correspond au futur qui était
// estimé » (Marc, 2026-08-13).
//
// Se place sous la légende de la courbe VERROUILLÉE — c'est-à-dire au seul endroit où la référence
// est visible à l'écran. Un écart affiché loin de sa référence n'est pas interprétable.
//
// No-fake-data : `computeForecastAccuracy` rend `null` dès que la comparaison n'a aucun sens (pas de
// verrou, pas de passé mesuré, aucun mois commun). Ce composant rend alors `null` LUI AUSSI, plutôt
// qu'un « 0 % d'écart » qui se lirait « ta prévision était parfaite ».
import React from 'react';
import { formatCAD, formatPercent } from '../../utils/format';
import { PrivateAmount } from '../ui/PrivateAmount';
import type { ForecastAccuracy } from '../../services/projection/forecastAccuracy';

export const ForecastAccuracyBadge: React.FC<{ accuracy: ForecastAccuracy | null }> = ({ accuracy }) => {
    if (!accuracy) return null;
    const { latest, meanAbsGap, months, monthsAhead } = accuracy;
    const enAvance = latest.gap > 0;

    return (
        <div className="-mt-1 mb-3 text-tiny text-ink-300 flex items-center gap-1.5 flex-wrap">
            {/* Repère NON-couleur (flèche) en plus de la teinte : le sens doit rester lisible
                sans distinguer les couleurs. */}
            <span aria-hidden="true" className={enAvance ? 'text-success-400' : 'text-warning-400'}>
                {enAvance ? '▲' : '▼'}
            </span>
            <span>
                Ton réel est{' '}
                <strong className={enAvance ? 'text-success-400' : 'text-warning-400'}>
                    {enAvance ? 'en avance de' : 'en retard de'}{' '}
                    <PrivateAmount>{formatCAD(Math.abs(latest.gap))}</PrivateAmount>
                    {latest.gapPct !== null && (
                        <> (<PrivateAmount>{formatPercent(Math.abs(latest.gapPct) * 100, 1)}</PrivateAmount>)</>
                    )}
                </strong>{' '}
                sur la courbe verrouillée.
            </span>
            {/* La FIDÉLITÉ de la prévision, distincte de la POSITION actuelle : un plan qui se
                trompe de +50 k$ puis −50 k$ n'est pas « juste en moyenne ». */}
            <span className="text-ink-400">
                Écart moyen <PrivateAmount>{formatCAD(meanAbsGap)}</PrivateAmount> sur {months.length}{' '}
                {months.length > 1 ? 'mois comparés' : 'mois comparé'} — {monthsAhead} au-dessus.
            </span>
        </div>
    );
};
