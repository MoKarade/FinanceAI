import React, { useMemo } from 'react';
import { RealEstateGoal } from '../../types';
import { partitionRealEstateGoals } from '../../services/realEstatePartition';
import { RealEstateWorkspace } from '../realestate/RealEstateWorkspace';

/**
 * [REFONTE-NAV-L3] Page « Projets immo » (destination Vie = ce que je PRÉVOIS).
 * N'affiche que les projets d'achat FUTURS (partition pure sur la même tranche
 * `realEstateGoals` — aucune migration de store, le moteur de projection consomme
 * la tranche complète à l'identique). Les biens DÉTENUS vivent dans
 * Configurations → Immobilier (`components/RealEstate.tsx`).
 */
interface RealEstateProjectsProps {
    availableCash: number;
    goals: RealEstateGoal[];
    setGoals: (g: RealEstateGoal[]) => void;
}

export const RealEstateProjects: React.FC<RealEstateProjectsProps> = ({ availableCash, goals, setGoals }) => {
    const { future } = useMemo(() => partitionRealEstateGoals(goals), [goals]);
    return (
        <RealEstateWorkspace
            variant="projet"
            availableCash={availableCash}
            allGoals={goals}
            visibleGoals={future}
            setAllGoals={setGoals}
        />
    );
};
