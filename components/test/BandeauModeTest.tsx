// components/test/BandeauModeTest.tsx
//
// [S5-REFONTE-PERF] Bannière « MODE TEST » et son sélecteur de persona, sortis de `Layout` pour
// être chargés À LA DEMANDE : la liste des personas (`services/testFixtures`, ~25 Ko de données
// fictives) n'a rien à faire dans le démarrage de l'app réelle, où la bannière n'existe pas.
import React from 'react';
import { Icon } from '../ui/Icon';
import { useFinanceStore } from '../../store/useFinanceStore';
import { getPersonaById, getPersonaOrDefault, TEST_PERSONAS } from '../../services/testFixtures';

export const BandeauModeTest: React.FC = () => {
  const activeTestPersonaId = useFinanceStore(s => s.activeTestPersonaId);
  const activeTestPersona = getPersonaById(activeTestPersonaId);
  const enableTestMode = useFinanceStore(s => s.enableTestMode);
  return (
    <div
      role="status"
      aria-label="Mode test activé"
      className="fixed top-0 left-0 right-0 z-150 bg-linear-to-r/srgb from-warning-600 via-orange-600 to-warning-600 text-white text-center py-2 px-4 font-bold text-body shadow-lg flex items-center justify-center gap-3"
    >
      <Icon name="flask" size={16} />
      <span className="font-bold">MODE TEST</span>
      {/* Sélecteur de persona directement dans la bannière : changer
          d'utilisateur sans passer par Réglages (demandé par Marc). */}
      <select
        aria-label="Changer de persona de test"
        value={activeTestPersona?.id ?? TEST_PERSONAS[0].id}
        onChange={(e) => {
          const persona = getPersonaOrDefault(e.target.value);
          enableTestMode(persona.build(), persona.id);
        }}
        className="bg-amber-900/70 text-white text-meta rounded-sm px-2 py-1 border border-white/40 font-normal cursor-pointer max-w-[55vw] truncate focus:outline-hidden focus:ring-2 focus:ring-white/60"
      >
        {TEST_PERSONAS.map((p) => (
          <option key={p.id} value={p.id} className="bg-dark text-white">
            {p.emoji} {p.label}
          </option>
        ))}
      </select>
      <span className="hidden md:inline font-normal text-meta opacity-90">— données fictives, vraies données sauvegardées</span>
    </div>
  );
};
