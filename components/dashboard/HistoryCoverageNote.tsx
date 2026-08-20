// components/dashboard/HistoryCoverageNote.tsx
//
// [HIST-COVERAGE-TOTAL] Signalement HONNÊTE des approximations de couverture de la courbe de
// portefeuille — composant PARTAGÉ Dashboard + Investissements (le même bloc dupliqué dériverait,
// classe « delta appliqué à DEUX copies ») :
//  - titre sans historique : PAS de courbe mais COMPTÉ au total à sa valeur actuelle (décision Marc
//    2026-07-23, ADR docs/adr/0007-couverture-du-total-de-la-courbe.md — un TOTAL amputé de ~50 k$ était pire que l'approximation) ;
//  - titre sans historique NI prix connu : rien à compter (hors total, dit explicitement) ;
//  - historique borné par le provider : compte au premier cours connu avant sa date de départ.
// Le montant compté passe par <PrivateAmount> (mode discret : jamais la valeur dans le DOM).

import React from 'react';
import { PrivateAmount } from '../ui/PrivateAmount';
import { formatCAD } from '../../utils/format';

interface Props {
    noHistorySymbols: Array<{ symbol: string; valueCad: number }>;
    partialHistorySymbols: Array<{ symbol: string; historyStart: string }>;
    /** [Finding silent-failure #493] Titres dont la queue d'historique est périmée sans quote
     *  fraîche : ABSENTS du total des derniers jours — doit être dit, sinon on reproduit en
     *  silence le trou que [HIST-COVERAGE-TOTAL] corrige. */
    staleTailSymbols: Array<{ symbol: string; lastKnownDate: string }>;
    /** [Finding code-reviewer #493] Y a-t-il une courbe affichée à côté de cette note ? Quand
     *  AUCUN titre n'a d'historique (rows vides), « compté dans le total » mentirait — aucun
     *  total n'est tracé nulle part sur la vue. */
    hasChart: boolean;
}

export const HistoryCoverageNote: React.FC<Props> = ({
    noHistorySymbols, partialHistorySymbols, staleTailSymbols, hasChart,
}) => {
    if (noHistorySymbols.length === 0 && partialHistorySymbols.length === 0 && staleTailSymbols.length === 0) return null;
    const counted = noHistorySymbols.filter((s) => s.valueCad > 0);
    const unpriced = noHistorySymbols.filter((s) => s.valueCad <= 0);
    // [INVEST-CHART-CLEAN] Demande Marc « ya du texte sur le graph enleve » : REPLIÉ par défaut —
    // une ligne discrète, le détail honnête au clic (le garde-fou reste accessible, il n'écrase
    // plus le graphe). <details> natif = focusable/annonçable sans JS.
    const totalNotes = noHistorySymbols.length + partialHistorySymbols.length + staleTailSymbols.length;
    return (
        <details className="mt-2">
            {/* [Finding a11y #495] py-1.5 = boîte ≥ 24 px (WCAG 2.5.8 — le padding doit être sur le
                summary LUI-MÊME : seule sa boîte propre déclenche le disclosure). */}
            <summary className="text-tiny text-ink-400 cursor-pointer select-none hover:text-ink-200 focus-ring rounded py-1.5">
                Couverture des courbes : {totalNotes} note{totalNotes > 1 ? 's' : ''} (approximations signalées) — détails
            </summary>
            <p className="text-tiny text-ink-400 mt-1">
            {counted.length > 0 && (hasChart ? (
                <>Sans courbe (aucun historique de cours) : {counted.map((s) => s.symbol).join(', ')} —
                compté{counted.length > 1 ? 's' : ''} dans le total à la valeur actuelle
                (<PrivateAmount as="span">{formatCAD(counted.reduce((acc, s) => acc + s.valueCad, 0))}</PrivateAmount>). </>
            ) : (
                <>Aucun historique de cours pour {counted.map((s) => s.symbol).join(', ')} —
                pas de courbe à tracer ; valeur actuelle de ces titres :
                <PrivateAmount as="span"> {formatCAD(counted.reduce((acc, s) => acc + s.valueCad, 0))}</PrivateAmount>. </>
            ))}
            {unpriced.length > 0 && (
                <>Aucun cours connu pour {unpriced.map((s) => s.symbol).join(', ')} —
                hors courbes ET hors total (rien à compter). </>
            )}
            {staleTailSymbols.length > 0 && (
                <>Historique arrêté pour {staleTailSymbols.map((s) => `${s.symbol} (dernier cours le ${s.lastKnownDate})`).join(', ')} —
                absent{staleTailSymbols.length > 1 ? 's' : ''} du total des derniers jours tant que son cours n'est pas rafraîchi. </>
            )}
            {partialHistorySymbols.length > 0 && (
                <>Historique borné pour {partialHistorySymbols.map((p) => `${p.symbol} (depuis ${p.historyStart})`).join(', ')} —
                avant cette date, le titre compte à son premier cours connu (approximation).</>
            )}
            </p>
        </details>
    );
};
