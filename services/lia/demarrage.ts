// services/lia/demarrage.ts — monte LIA HORS du rendu de React (#1267, lia-ui ≥ v0.16.0).
//
// Marc (23/10/2026) : LIA est présente tout le temps, même si quelque chose charge ou si une page plante. Montée
// par `demarrerLia`, elle vit dans `document.body`, hors de #root : ni le Suspense, ni l'ErrorBoundary, ni le
// LoginGate ne la retirent. Une seule voie (jamais aussi le composant React du paquet) ; son état reste unique chez MemoryAI.
// Appelé UNE fois depuis index.tsx, au chargement du module (pas dans un effet ni un composant).
import { demarrerLia, type DemarrageLia } from '@mokarade/lia-ui/boot';
import { demanderLia } from './client';

export function demarrerLiaApp(): DemarrageLia {
    return demarrerLia({
        ask: (question, signal) => demanderLia(question, signal, { page: `${window.location.pathname}${window.location.hash}`.slice(0, 200) }),
    });
}
