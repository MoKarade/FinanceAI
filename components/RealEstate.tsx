import React, { useMemo } from 'react';
import { RealEstateGoal } from '../types';
import { partitionRealEstateGoals } from '../services/realEstatePartition';
import { RealEstateWorkspace } from './realestate/RealEstateWorkspace';

/**
 * [REFONTE-NAV-L3] Page « Immobilier » (destination Configurations = ce que j'AI).
 * N'affiche que les biens ACTUELS (détenus aujourd'hui — partition pure sur la même
 * tranche `realEstateGoals`, jamais migrée). Les projets d'achat FUTURS vivent dans
 * Vie → Projets immo (`components/life/RealEstateProjects.tsx`).
 */
interface RealEstateProps {
    availableCash: number;
    goals: RealEstateGoal[];
    setGoals: (g: RealEstateGoal[]) => void;
}

export const RealEstate: React.FC<RealEstateProps> = ({ availableCash, goals, setGoals }) => {
    const { actual } = useMemo(() => partitionRealEstateGoals(goals), [goals]);
    return (
        <RealEstateWorkspace
            variant="actuel"
            availableCash={availableCash}
            allGoals={goals}
            visibleGoals={actual}
            setAllGoals={setGoals}
        />
    );
};
