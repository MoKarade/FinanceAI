// components/settings/sections/PatrimoineSection.tsx
// G22-N4 — extrait de Settings.tsx : patrimoine étendu (W5.x). Assurances,
// immeubles locatifs, entreprises privées et biens cycliques (véhicules,
// rénovations, dons). Section auto-suffisante : lit/écrit directement le store.

import React from 'react';
import { useFinanceStore } from '../../../store/useFinanceStore';
import { InsurancePanel, RentalPropertyPanel, BusinessPanel, CyclicalGoalsPanel } from '../../PatrimoineExtended';
import { nomsConjoints } from '../../ui/SelectProprietaire';

export const PatrimoineSection: React.FC = () => {
  const insurancePolicies = useFinanceStore(s => s.insurancePolicies ?? []);
  const rentalProperties = useFinanceStore(s => s.rentalProperties ?? []);
  const privateBusinesses = useFinanceStore(s => s.privateBusinesses ?? []);
  const vehicleReplacements = useFinanceStore(s => s.vehicleReplacements ?? []);
  const majorRenovations = useFinanceStore(s => s.majorRenovations ?? []);
  const charitableGoals = useFinanceStore(s => s.charitableGoals ?? []);
  const setAppState = useFinanceStore(s => s.setAppState);
  // [FISC-RRSP-RENTAL-EARNED] On sélectionne la référence STABLE `users` et on dérive en dehors : un
  // sélecteur qui rendrait un tableau neuf à chaque appel ferait re-rendre en boucle.
  const users = useFinanceStore(s => s.config.users);
  const conjoints = nomsConjoints(users) ?? undefined;
  // [W5-DOUBLE-SAISIE-LOCATIF] Objectifs immobiliers réellement LOCATIFS : non-résidence principale
  // ET loyer saisi. Ce sont EXACTEMENT les deux conditions que le moteur exige pour produire un
  // revenu locatif (`realEstateMonth.ts` : `!goal.isPrimaryResidence && goal.rentalIncomeMonthly`) —
  // compter tous les objectifs immobiliers avertirait pour une résidence principale, qui ne produit
  // aucun loyer et ne peut donc pas doubler quoi que ce soit.
  const nbLocatifsImmobilier = useFinanceStore(
    s => (s.realEstateGoals ?? []).filter(g => !g.isPrimaryResidence && (g.rentalIncomeMonthly ?? 0) > 0).length,
  );

  return (
    <div className="space-y-6">
      {/* W5.4 — Assurances */}
      <InsurancePanel
        policies={insurancePolicies}
        onChange={next => setAppState({ insurancePolicies: next })}
      />

      {/* W5.6 — Immeubles locatifs */}
      <RentalPropertyPanel
        properties={rentalProperties}
        onChange={next => setAppState({ rentalProperties: next })}
        nbLocatifsImmobilier={nbLocatifsImmobilier}
        conjoints={conjoints}
      />

      {/* W5.7 — Entreprises privées */}
      <BusinessPanel
        businesses={privateBusinesses}
        onChange={next => setAppState({ privateBusinesses: next })}
      />

      {/* W5.x — Goals cycliques */}
      <CyclicalGoalsPanel
        vehicles={vehicleReplacements}
        renovations={majorRenovations}
        charity={charitableGoals}
        onVehicles={next => setAppState({ vehicleReplacements: next })}
        onRenovations={next => setAppState({ majorRenovations: next })}
        onCharity={next => setAppState({ charitableGoals: next })}
      />
    </div>
  );
};
