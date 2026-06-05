import React from 'react';
import { Card } from '../ui/Card';
import { formatCAD } from '../../utils/format';

/**
 * Phase F.5 — extraction de la Card "Capitaux Actuels" de Retirement.tsx
 * pour réduire la taille du composant principal et améliorer la testabilité.
 */

interface CurrentCapitalCardProps {
    balances: { REER: number; CELI: number; NON_ENREG: number };
    targetAge: number;
    lifeExpectancy: number;
    retirementNetWorth: number;
    peakNetWorth: number;
    finalNetWorth: number;
}

export const CurrentCapitalCard: React.FC<CurrentCapitalCardProps> = ({
    balances,
    targetAge,
    lifeExpectancy,
    retirementNetWorth,
    peakNetWorth,
    finalNetWorth,
}) => {
    return (
        <Card title="Capitaux Actuels">
            <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center text-tiny text-ink-300 bg-white/5 p-3 rounded-xl border border-white/5">
                    <div>
                        <div className="uppercase tracking-wider">REER</div>
                        <div className="text-white font-bold privacy-blur mt-1 font-mono">{formatCAD(balances.REER)}</div>
                    </div>
                    <div>
                        <div className="uppercase tracking-wider">CELI</div>
                        <div className="text-white font-bold privacy-blur mt-1 font-mono">{formatCAD(balances.CELI)}</div>
                    </div>
                    <div>
                        <div className="uppercase tracking-wider">Non-Enr.</div>
                        <div className="text-white font-bold privacy-blur mt-1 font-mono">{formatCAD(balances.NON_ENREG)}</div>
                    </div>
                </div>

                <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                        <span className="text-ink-300">Capital à la retraite ({targetAge} ans)</span>
                        <span className="text-white font-bold privacy-blur font-mono">{formatCAD(retirementNetWorth)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className="text-ink-300">Pic du patrimoine</span>
                        <span className="text-success-400 font-bold privacy-blur font-mono">{formatCAD(peakNetWorth)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className="text-ink-300">Héritage ({lifeExpectancy} ans)</span>
                        <span className="text-info-400 font-bold privacy-blur font-mono">{formatCAD(finalNetWorth)}</span>
                    </div>
                </div>
            </div>
        </Card>
    );
};
