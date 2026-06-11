// components/settings/sections/ProfileSection.tsx
// Profil & utilisateurs (salaires, profil détaillé, profils enregistrés, répartition).
// NB : les « Paramètres de retraite » ont été déplacés dans l'onglet Retraite
// (demande Marc : éditer chaque info dans l'onglet concerné).

import React from 'react';
import { ProfileFieldsMoved } from '../ProfileFieldsMoved';
import { TestModePanel } from '../TestModePanel';
import { startGuidedTour } from '../../tour/tourControl';
import type { AppState } from '../../../types';
import { Icon } from '../../ui/Icon';

interface ProfileSectionProps {
  config: AppState['config'];
  setConfig: (c: AppState['config']) => void;
}

// PH3 — les champs profil (UsersCard) ont migré dans l'onglet Profil unifié ; ce sous-onglet
// ne garde que la visite guidée + le mode test (config/setConfig conservés dans l'interface
// pour l'appelant, mais plus consommés ici).
export const ProfileSection: React.FC<ProfileSectionProps> = () => {
  return (
    <div className="space-y-6">
      {/* G22-F4 — relancer le tutoriel guidé (visite de tous les onglets). */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-card bg-primary/10 border border-primary/20">
        <div className="text-meta text-ink-200 flex items-center gap-2">
          <Icon name="graduation" size={15} className="text-primary shrink-0" />
          Refais la visite guidée.
        </div>
        <button
          type="button"
          onClick={startGuidedTour}
          className="shrink-0 px-3 py-1.5 rounded-card text-meta font-bold text-dark bg-primary hover:brightness-110 transition-all focus-ring"
        >
          Revoir le tutoriel
        </button>
      </div>

      <ProfileFieldsMoved what="Ton profil (personnes, naissance, salaire…)" />

      {/* Mode test (dev) — déplacé ici depuis « Système & diagnostics » (demande Marc) :
          charger un persona réaliste est une action « profil », sa place est avec les
          profils utilisateurs. Les vraies données sont sauvegardées/restaurées. */}
      <TestModePanel />
    </div>
  );
};
