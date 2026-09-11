import React from 'react';
import { ProjectionConfig } from '../../../types';
import { maskedSliderAria } from '../../../utils/privacyAria';
import { PrivateAmount } from '../../ui/PrivateAmount';

/**
 * [FUTUR-MOBILE-PR4] Extraction VERBATIM du bloc « Flux Mensuels » de `ProjectionControls.tsx`
 * (JSX inchangé) — seul le mode sandbox/réel change : au lieu de lire `projection.useTheoretical`
 * dans la closure du composant parent, il voyage désormais en PROP EXPLICITE (risque ÉLEVÉ #5 de
 * l'architecte : une extraction qui garderait la lecture directe du champ casserait le jour où ce
 * composant serait monté ailleurs sans `projection` complet à portée). Utilisé tel quel sur desktop
 * (position inchangée) ET dans la composition mobile (`ProjectionControlsMobile`).
 */
interface FluxMensuelsFieldsProps {
    projection: Pick<ProjectionConfig, 'theoreticalIncome' | 'theoreticalExpenses'>;
    updateProj: (key: keyof ProjectionConfig, val: unknown) => void;
    useTheoretical: boolean;
    isPrivacyMode: boolean;
}

export const FluxMensuelsFields: React.FC<FluxMensuelsFieldsProps> = ({
    projection, updateProj, useTheoretical, isPrivacyMode,
}) => (
    <div className="space-y-4">
        <h4 className={`text-tiny uppercase border-b pb-1 ${useTheoretical ? 'text-secondary border-secondary/30' : 'text-success-400 border-success-border'}`}>Flux Mensuels</h4>
        <div className={!useTheoretical ? 'opacity-50 pointer-events-none' : ''}>
            <label className="flex justify-between text-meta text-ink-300 mb-1">
                <span>Revenus (Net)</span>
                <PrivateAmount className="text-success-400 font-bold">{projection.theoreticalIncome || 8000}$</PrivateAmount>
            </label>
            <input type="range" aria-label="Revenus (Net)" min="2000" max="20000" step="100" value={projection.theoreticalIncome || 8000} {...maskedSliderAria(isPrivacyMode)} onChange={e => updateProj('theoreticalIncome', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-success-500" />
        </div>
        <div className={!useTheoretical ? 'opacity-50 pointer-events-none' : ''}>
            <label className="flex justify-between text-meta text-ink-300 mb-1">
                <span>Dépenses</span>
                <PrivateAmount className="text-danger-400 font-bold">{projection.theoreticalExpenses || 4000}$</PrivateAmount>
            </label>
            <input type="range" aria-label="Dépenses" min="1000" max="15000" step="100" value={projection.theoreticalExpenses || 4000} {...maskedSliderAria(isPrivacyMode)} onChange={e => updateProj('theoreticalExpenses', Number(e.target.value))} className="w-full h-1 bg-dark rounded-lg appearance-none cursor-pointer accent-danger-500" />
        </div>
    </div>
);
