// components/projection/StrategyComparePanel.tsx
// Consolidation de l'onglet Optimisation : un SEUL outil « Comparer les stratégies »
// avec deux modes, au lieu de deux cartes Monte Carlo quasi identiques empilées
// (Robustesse + Optimiseur) qui semaient la confusion (« laquelle utiliser ? »).
//   - Test rapide       → RobustnessPanel : 5 stratégies types classées par taux de succès, 1 clic.
//   - Recherche avancée → StrategyOptimizerPanel : compose ses leviers, classement par objectif.
// Le wrapper est purement structurel (header + sélecteur de mode) : les panels internes
// gardent leur propre carte et leur logique — aucune régression de comportement.

import React, { useState } from 'react';
import { Icon } from '../ui/Icon';
import { RobustnessPanel } from './RobustnessPanel';
import { StrategyOptimizerPanel } from './StrategyOptimizerPanel';
import type { SimulationParams } from '../../services/projection';
import type { StrategyConfig } from '../../services/projection/strategyConfig';

interface Props {
    params: SimulationParams;
    /** Applique la config gagnante de la recherche avancée aux paramètres réels du Futur. */
    onApply?: (config: StrategyConfig) => void;
}

type Mode = 'quick' | 'advanced';

const MODES: ReadonlyArray<{ id: Mode; label: string }> = [
    { id: 'quick', label: 'Test rapide' },
    { id: 'advanced', label: 'Recherche avancée' },
];

export const StrategyComparePanel: React.FC<Props> = ({ params, onApply }) => {
    const [mode, setMode] = useState<Mode>('quick');

    return (
        <section aria-label="Comparer les stratégies">
            <div className="flex items-center gap-1.5">
                <Icon name="flask" size={15} className="text-indigo-300" />
                <h3 className="text-meta font-black text-white tracking-tight">Comparer les stratégies</h3>
            </div>
            <p className="text-tiny text-ink-300 mt-1.5">
                Classe les façons de gérer ton argent par <strong className="text-white">robustesse</strong> (Monte
                Carlo). Commence par le <strong className="text-white">test rapide</strong> ; passe à la{' '}
                <strong className="text-white">recherche avancée</strong> pour composer tes propres leviers.
            </p>

            {/* Sélecteur de mode — même motif que les sous-onglets du Futur (role=tab + aria-selected). */}
            <div
                className="mt-3 flex gap-0.5 p-0.5 rounded-card bg-black/30 border border-white/5 w-fit"
                role="tablist"
                aria-label="Mode de comparaison des stratégies"
            >
                {MODES.map((m) => {
                    const active = mode === m.id;
                    return (
                        <button
                            key={m.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setMode(m.id)}
                            className={`px-3 py-1 text-tiny font-bold rounded transition-colors focus-ring ${
                                active ? 'bg-indigo-600 text-white' : 'text-ink-300 hover:text-white hover:bg-white/10'
                            }`}
                        >
                            {m.label}
                        </button>
                    );
                })}
            </div>

            {/* Rendu conditionnel (et non masquage CSS) VOULU : changer de mode démonte le panel
                inactif, ce qui annule proprement une recherche worker en cours (abortRef de
                l'optimiseur) au lieu de la laisser tourner en arrière-plan. Conséquence assumée :
                un classement déjà calculé est perdu au switch — acceptable, on choisit un seul mode. */}
            {mode === 'quick' ? (
                <RobustnessPanel params={params} />
            ) : (
                <StrategyOptimizerPanel params={params} onApply={onApply} />
            )}
        </section>
    );
};
