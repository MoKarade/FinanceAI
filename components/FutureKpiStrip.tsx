import React from 'react';
import { formatCAD } from '../utils/format';
import { PrivateAmount } from './ui/PrivateAmount';
import { NO_DATA_LABEL } from './ui/emptyAware';

/**
 * [REFONTE-NAV Lot 1] Bandeau KPI compact AU-DESSUS de la courbe Future (choix Marc :
 * « bandeau compact au-dessus »). Reprend les chiffres de tête de l'ex-Accueil pour que
 * son retrait ne perde rien : patrimoine net, liquidités, épargne du mois.
 *
 * Valeurs = dérivées RÉELLES du store (useDerivedFinancials via TabRouter), jamais de la
 * projection — le bandeau reste juste même quand la courbe recalcule. No-fake-data : une
 * valeur non finie s'affiche « — » (jamais un 0 $ crédible). Enrichissement (variation,
 * santé financière) : Lot 2.
 */
const KpiTile: React.FC<{ label: string; value: number; signed?: boolean }> = ({ label, value, signed = false }) => (
    <div className="flex-1 min-w-[140px] rounded-card bg-white/5 border border-white/5 px-4 py-3">
        <p className="text-tiny uppercase tracking-widest text-ink-400 font-bold">{label}</p>
        {Number.isFinite(value) ? (
            <PrivateAmount as="div" className="text-lg font-bold text-ink-50 font-mono">
                {signed && value > 0 ? '+' : ''}{formatCAD(value)}
            </PrivateAmount>
        ) : (
            <div className="text-lg font-bold text-ink-300">
                {/* [Audit a11y #600, LOW] NO_DATA_LABEL importé (source unique) — une chaîne
                    re-codée en dur dérive en silence si le libellé canonique change. */}
                <span aria-hidden="true">—</span>
                <span className="sr-only">{NO_DATA_LABEL}</span>
            </div>
        )}
    </div>
);

export const FutureKpiStrip: React.FC<{
    netWorth: number;
    liquidity: number;
    monthlySavings: number;
}> = ({ netWorth, liquidity, monthlySavings }) => (
    <section aria-label="Indicateurs clés" className="flex flex-wrap gap-2 md:gap-3 mb-4">
        <KpiTile label="Patrimoine net" value={netWorth} />
        <KpiTile label="Liquidités" value={liquidity} />
        <KpiTile label="Épargne / mois" value={monthlySavings} signed />
    </section>
);
