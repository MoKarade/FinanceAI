// store/modeTestActif.ts
//
// SOURCE UNIQUE du prédicat « l'app tourne-t-elle sur des données FICTIVES en ce moment ? ».
//
// ⚠️ POURQUOI un module à lui tout seul pour deux lignes. Le prédicat existait en DEUX copies
// non exportées, au corps identique et au nom différent — `isTestModeNow()`
// (`services/fintable/autoSync.ts`) et `isTestModeActive()` (`services/sync/syncPush.ts`) —, et
// un troisième site allait naître avec le lot d'étanchéité (backup / PDF / prompts). C'est la
// classe `UN-COMMENTAIRE-QUI-RECLAME-DE-LA-VIGILANCE-EST-UNE-SOURCE-UNIQUE-MANQUANTE` : tant
// que la règle « ne publie jamais des données fictives » est recopiée chez chaque publieur,
// elle tient par la mémoire de celui qui écrit le prochain publieur. Elle tient désormais par
// un import.
//
// ⚠️ Ce module lit le store, donc tout fichier qui l'importe traîne `useFinanceStore` dans son
// graphe. C'est pour ça que les modules PURS du dépôt ne l'importent pas et reçoivent le
// booléen en ARGUMENT (`shouldPush(localIsEmpty, isTestMode)`,
// `services/backupReminder.ts`) : ils restent testables sans store et le compilateur énumère
// leurs appelants. Le choix se fait par module, pas par confort
// (`UN-IMPORT-DANS-LA-COUCHE-SERVICES-ELARGIT-LE-CONTRAT-DE-MOCK-DE-TOUS-LES-MONTAGES`).

import { useFinanceStore } from './useFinanceStore';

/**
 * Vrai si l'état courant est FICTIF : mode test (persona de démo) ou bac à sable.
 *
 * Lecture FRAÎCHE du store à chaque appel — jamais une valeur capturée au montage : le mode
 * peut être activé ou quitté entre deux appels, et une valeur figée ferait publier du fictif
 * (ou refuserait du réel) après la bascule.
 *
 * ⚠️ Le `try` n'est pas décoratif : ce prédicat est appelé depuis des chemins qui tournent
 * AVANT que le store soit initialisé (boot, workers, tests qui montent un module isolé). Une
 * levée y remplacerait une publication par un plantage. En cas de doute, on rend `false`
 * — « je ne sais pas » vaut « pas de données fictives à protéger », ce qui est l'état par
 * défaut de l'app et le seul repli qui ne bloque rien.
 */
export function modeDonneesFictives(): boolean {
    try {
        return useFinanceStore.getState().isTestMode === true;
    } catch {
        return false;
    }
}
