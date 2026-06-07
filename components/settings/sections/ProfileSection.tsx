// components/settings/sections/ProfileSection.tsx
// G22-N4 — extrait de Settings.tsx : profil & utilisateurs. Paramètres de
// retraite (hub central, source de vérité unique) + carte Utilisateurs
// (salaires, profil détaillé, profils enregistrés, répartition).

import React from 'react';
import { Card } from '../../ui/Card';
import { useFinanceStore } from '../../../store/useFinanceStore';
import { UsersCard } from './UsersCard';
import { startGuidedTour } from '../../tour/tourControl';
import type { AppState, RetirementGoal } from '../../../types';
import { Icon } from '../../ui/Icon';

interface ProfileSectionProps {
  config: AppState['config'];
  setConfig: (c: AppState['config']) => void;
  retirementGoal?: RetirementGoal;
}

export const ProfileSection: React.FC<ProfileSectionProps> = ({ config, setConfig, retirementGoal }) => {
  const setAppState = useFinanceStore(s => s.setAppState);

  return (
    <div className="space-y-6">
      {/* G22-F4 — relancer le tutoriel guidé (visite de tous les onglets). */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-card bg-primary/10 border border-primary/20">
        <div className="text-meta text-ink-200">
          <span aria-hidden="true" className="mr-1">🎓</span>
          Nouveau ou besoin d'un rappel ? Refais la visite guidée de l'app.
        </div>
        <button
          type="button"
          onClick={startGuidedTour}
          className="shrink-0 px-3 py-1.5 rounded-card text-meta font-bold text-white bg-primary hover:brightness-110 transition-all focus-ring"
        >
          Revoir le tutoriel
        </button>
      </div>

      {/* Phase C.1 — Hub retraite : centralise les paramètres absorbés depuis
          l'onglet Retraite (espérance de vie, âge cible, revenu cible). */}
      <Card icon={<Icon name="retirement" size={18} />} title="Paramètres de retraite (hub central)">
        <div className="space-y-4">
          <p className="text-meta text-ink-400">
            Source de vérité unique — alimente Retraite, Investissement et Futur.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div data-focus-section="profile-retirementAge">
              <label className="block text-meta text-ink-300 mb-1">Âge de retraite cible</label>
              <input
                type="number"
                min={50}
                max={75}
                value={retirementGoal?.targetAge ?? 65}
                onChange={(e) => setAppState({ retirementGoal: { ...(retirementGoal as RetirementGoal), targetAge: Number(e.target.value) || 65 } })}
                className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
              />
            </div>
            <div data-focus-section="profile-lifeExpectancy">
              <label className="block text-meta text-ink-300 mb-1">
                Espérance de vie
                <span className="ml-1 text-tiny text-ink-500">(80–100 ans)</span>
              </label>
              <input
                type="number"
                min={80}
                max={105}
                value={retirementGoal?.lifeExpectancy ?? 90}
                onChange={(e) => setAppState({ retirementGoal: { ...(retirementGoal as RetirementGoal), lifeExpectancy: Number(e.target.value) || 90 } })}
                className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
              />
            </div>
            <div data-focus-section="profile-retirementIncome">
              <label className="block text-meta text-ink-300 mb-1">Revenu mensuel cible</label>
              <input
                type="number"
                min={0}
                step={100}
                value={retirementGoal?.targetMonthlyIncome ?? 4000}
                onChange={(e) => setAppState({ retirementGoal: { ...(retirementGoal as RetirementGoal), targetMonthlyIncome: Number(e.target.value) || 0 } })}
                className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
              />
            </div>
          </div>
        </div>
      </Card>

      <UsersCard config={config} setConfig={setConfig} />
    </div>
  );
};
