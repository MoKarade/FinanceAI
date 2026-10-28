// services/history/diagnosticCourbeConsole.ts
//
// [COURBE-DIAGNOSTIC-CONSOLE] Rend le diagnostic de la courbe (`diagnostiquerCourbe`) appelable depuis
// la console du navigateur de l'app EN PRODUCTION : `await financeaiDiagnosticCourbe()`.
//
// Pourquoi : l'état réel contient des données perso, il ne doit être copié dans aucun fichier. Ici le
// diagnostic tourne là où l'état est déjà chargé, avec le VRAI `buildMarketData` (pas un recalcul à
// côté, comme le faisait le snippet de console, qui ne prouvait rien sur le code déployé).
//
// Garanties : lecture seule (l'état est lu, jamais écrit ni envoyé), aucun réseau, sortie = celle de
// `diagnostiquerCourbe` (symboles, dates, POURCENTAGES, jamais un montant ni une quantité). Le module de
// diagnostic est chargé à l'appel, hors du chunk d'entrée.
import type { Asset } from '../../types';
import type { DiagnosticCourbe } from './diagnosticCourbe';

/** Nom de la commande dans la console. */
const NOM_COMMANDE = 'financeaiDiagnosticCourbe';

interface EtatLu {
    assets: Asset[];
    fxRates: Record<string, number> | undefined;
}

/** Installe la commande sur `cible` (`window`). `lireEtat` est appelé À CHAQUE invocation : l'état du moment, pas celui du démarrage. */
export function installerDiagnosticConsole(cible: object, lireEtat: () => EtatLu): void {
    const commande = async (): Promise<DiagnosticCourbe> => {
        const { diagnostiquerCourbe } = await import('./diagnosticCourbe');
        const { assets, fxRates } = lireEtat();
        return diagnostiquerCourbe(assets, fxRates);
    };
    Object.defineProperty(cible, NOM_COMMANDE, { value: commande, configurable: true, writable: false, enumerable: false });
}
