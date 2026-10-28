import React from 'react';
import { RealEstateGoal } from '../../../types';
import { maskedSliderAria } from '../../../utils/privacyAria';
import { PrivateAmount } from '../../ui/PrivateAmount';
import { formatCompactCAD } from '../../../utils/format';

/**
 * [FUTUR-MOBILE-PR4] Extraction VERBATIM (`PrivateAmount` + `formatCompactCAD` inchangés) du champ
 * « Valeur Max Maison » de `ProjectionControls.tsx:256` — se DÉPLACE tel quel dans la réorganisation
 * mobile (BACKLOG). Réutilisé sur desktop (position inchangée) ET dans la composition mobile.
 */
interface ValeurMaxMaisonFieldProps {
    realEstateGoals: RealEstateGoal[];
    setRealEstateGoals?: (g: RealEstateGoal[]) => void;
    isPrivacyMode: boolean;
}

export const ValeurMaxMaisonField: React.FC<ValeurMaxMaisonFieldProps> = ({
    realEstateGoals, setRealEstateGoals, isPrivacyMode,
}) => (
    <div>
        <label className="flex justify-between text-meta text-ink-300 mb-1">
            <span>Valeur Max Maison</span>
            <PrivateAmount className="text-pink-400 font-bold">{formatCompactCAD(realEstateGoals[0]?.maxValue || 1000000)}</PrivateAmount>
        </label>
        <input type="range" aria-label="Valeur Max Maison" min="300000" max="3000000" step="50000" value={realEstateGoals[0]?.maxValue || 1000000} {...maskedSliderAria(isPrivacyMode)} onChange={e => {
            const updated = [...realEstateGoals];
            if (updated[0]) {
                updated[0] = { ...updated[0], maxValue: Number(e.target.value) };
                setRealEstateGoals?.(updated);
            }
        }} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-pink-500" />
        <p className="text-tiny text-ink-400 mt-1">Plafond de croissance immo.</p>
    </div>
);
