// components/dashboard/HistoryCoverageNote.tsx
//
// [HIST-COVERAGE-TOTAL] Signalement HONNÊTE des approximations de couverture de la courbe de
// portefeuille — composant PARTAGÉ Dashboard + Investissements (le même bloc dupliqué dériverait,
// classe « delta appliqué à DEUX copies ») :
//  - titre sans historique : PAS de courbe mais COMPTÉ au total à sa valeur actuelle (décision Marc
//    2026-07-23, ADR docs/decisions.md — un TOTAL amputé de ~50 k$ était pire que l'approximation) ;
//  - titre sans historique NI prix connu : rien à compter (hors total, dit explicitement) ;
//  - historique borné par le provider : compte au premier cours connu avant sa date de départ.
// Le montant compté passe par <PrivateAmount> (mode discret : jamais la valeur dans le DOM).

import React from 'react';
import { PrivateAmount } from '../ui/PrivateAmount';
import { formatCAD } from '../../utils/format';

interface Props {
    noHistorySymbols: Array<{ symbol: string; valueCad: number }>;
    partialHistorySymbols: Array<{ symbol: string; historyStart: string }>;
}

export const HistoryCoverageNote: React.FC<Props> = ({ noHistorySymbols, partialHistorySymbols }) => {
    if (noHistorySymbols.length === 0 && partialHistorySymbols.length === 0) return null;
    const counted = noHistorySymbols.filter((s) => s.valueCad > 0);
    const unpriced = noHistorySymbols.filter((s) => s.valueCad <= 0);
    return (
        <p className="text-tiny text-ink-400 mt-2">
            {counted.length > 0 && (
                <>Sans courbe (aucun historique de cours) : {counted.map((s) => s.symbol).join(', ')} —
                compté{counted.length > 1 ? 's' : ''} dans le total à la valeur actuelle
                (<PrivateAmount as="span">{formatCAD(counted.reduce((acc, s) => acc + s.valueCad, 0))}</PrivateAmount>). </>
            )}
            {unpriced.length > 0 && (
                <>Aucun cours connu pour {unpriced.map((s) => s.symbol).join(', ')} —
                hors courbes ET hors total (rien à compter). </>
            )}
            {partialHistorySymbols.length > 0 && (
                <>Historique borné pour {partialHistorySymbols.map((p) => `${p.symbol} (depuis ${p.historyStart})`).join(', ')} —
                avant cette date, le titre compte à son premier cours connu (approximation).</>
            )}
        </p>
    );
};
