// components/tour/tourControl.ts
// G22-F4 — Contrôle découplé du tutoriel guidé.
//
// Le bouton « relancer » (dans Configuration) et le déclenchement post-onboarding
// (dans App) n'ont pas besoin de connaître l'état interne du tour : ils émettent
// un event global que le composant GuidedTour écoute. Évite tout prop-drilling
// ou couplage au store.

export const TOUR_DONE_KEY = 'app_tour_done';
export const TOUR_EVENT = 'financeai:start-tour';

/** Déclenche (ou relance) le tutoriel guidé. */
export function startGuidedTour(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TOUR_EVENT));
}

/** Marque le tutoriel comme vu (terminé ou passé). */
export function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_DONE_KEY, 'true');
  } catch {
    /* localStorage indisponible — pas critique */
  }
}
