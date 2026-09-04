// store/optionsPersistance.ts
// [GODFILE-STORE] Les trois portes de la persistance `financeai-storage` — fusion typée à la
// réhydratation (merge), filet d'échec (onRehydrateStorage) et sélection des clés persistées
// (partialize) — extraites telles quelles de useFinanceStore.ts (lot 158), avec le statut
// d'hydratation qu'elles pilotent. La CONFIG persist (name/version/storage) reste dans la façade,
// à côté du create() : c'est elle que les incidents ont appris à ne pas éparpiller.
import { logError } from '../services/errorLogger';
import { verifierTypesRestaures, resumeTechniqueDesFautifs } from '../services/verifierTypesRestaures';
import type { FinanceState } from './useFinanceStore';

// [STORE-REHYDRATE-SILENT, audit 2026-07-16] Statut de la RÉHYDRATATION ZUSTAND (`financeai-storage`,
// parse + migrate v1→v7) — chemin DISTINCT de la migration legacy ci-dessus (getInitialStateWithMigration),
// qui, lui, était déjà couvert. Sans `onRehydrateStorage`, zustand JETTE l'erreur (vérifié dans
// middleware.mjs) → blob corrompu = app vierge sans AUCUNE trace, indiscernable d'un 1er lancement
// (les données sont pourtant encore dans le blob + Drive + backups). Même pattern que MigrationStatus :
// statut module-level + toast critique dans App + visible SystemView.
interface HydrationStatus { failed: boolean; error: string | null }
let _hydrationStatus: HydrationStatus = { failed: false, error: null };
export const getHydrationStatus = (): HydrationStatus => _hydrationStatus;


// [BACKUP-SCHEMA-NON-TYPE] La garde de TYPE, posée sur `merge` et NON sur `migrate`.
//
// ⚠️ Le point de branchement se lit dans le code de zustand, pas dans l'intuition :
// `migrate` n'est appelé QUE si la version du blob DIFFÈRE de la version courante
// (`middleware.js` : `deserializedStorageValue.version !== options.version`). Un blob
// v7 — le cas NORMAL, celui de tous les jours — ne le traverse jamais. `merge`, lui,
// est appelé à CHAQUE réhydratation. Poser la garde dans `migrate` l'aurait rendue
// inopérante précisément pour l'état que Marc a réellement sur son disque.
//
// Lever ici est le comportement VOULU, pas un accident : l'exception est attrapée par
// zustand et transmise à `onRehydrateStorage(undefined, e)` — donc journal critique,
// bannière « ne rien saisir, restaurer un backup », état par défaut chargé, et le blob
// laissé INTACT dans localStorage pour diagnostic. Le filet [STORE-REHYDRATE-SILENT]
// existait déjà ; on lui donne une raison de plus de se déclencher.
export const fusionnerEtatPersiste = (persistedState: unknown, currentState: FinanceState): FinanceState => {
    const fautifs = verifierTypesRestaures(persistedState);
    if (fautifs.length > 0) {
        // Le résumé est fabriqué par le module de la garde, pas ici : un second site de
        // formatage dérive, et il porterait des littéraux (un plafond de citations) dans
        // un fichier dont l'inventaire des constantes surveille chaque nombre.
        throw new Error(`Données persistées illisibles — ${resumeTechniqueDesFautifs(fautifs)}`);
    }
    return { ...currentState, ...(persistedState as object) };
};

// [STORE-REHYDRATE-SILENT] Le FILET : sans ce callback, toute erreur de parse/migration est
// JETÉE par zustand (l'app démarre vierge, zéro trace). Ici : journal CRITIQUE + statut lu par
// App (toast « ne rien saisir, restaurer un backup ») et SystemView. On ne tente PAS de
// réparer/écraser le blob (il reste intact dans localStorage pour diagnostic/récupération).
export const surRehydratation = () => (_state: FinanceState | undefined, error?: unknown) => {
    // [STORE-HYDRATION-STATUS-MONOTONE] Une réhydratation RÉUSSIE remet le statut à sain.
    //
    // ⚠️ Sans cette ligne, le statut était MONOTONE : une fois `failed`, il le restait
    // pour la durée du module. Effet en PRODUCTION, pas théorique — `services/sync/syncPull.ts`
    // appelle `persist.rehydrate()` après un pull Drive : Marc voyait donc la bannière
    // « ne rien saisir, restaurer un backup » RESTER affichée après avoir justement
    // restauré une sauvegarde saine. Le remède affiché survivait à la guérison, et rien
    // ne lui disait que c'était réparé.
    //
    // ⚠️ Ça n'efface AUCUNE trace : l'incident est journalisé en critique par `logError`
    // ci-dessous, et le journal est ce qui garde l'historique. Ce statut-ci décrit
    // l'état COURANT du store pour l'afficher — deux registres, deux durées de vie.
    if (!error) {
        _hydrationStatus = { failed: false, error: null };
        return;
    }
    _hydrationStatus = { failed: true, error: String(error) };
    logError({
        source: 'storage', severity: 'critical',
        message: 'Réhydratation du store ÉCHOUÉE (blob financeai-storage illisible ou migration en erreur) — état par défaut chargé. Le blob est INTACT : ne rien saisir, restaurer un backup.',
        error: error instanceof Error ? error : new Error(String(error)),
    });
};

export const extrairePersistable = (state: FinanceState) => {
    // Exclut de la persistance : les clés API (chiffrées ailleurs) et les états UI
    // transitoires (onglet, mode privé, projection calculée, focus en attente).
    // Le MODE TEST (isTestMode/realDataSnapshot/activeTestPersonaId) EST désormais persisté
    // pour que la bannière + le persona survivent au reload (cohérence demandée par Marc).
    // Sûr côté Drive : `shouldPush` lit isTestMode → le push reste DÉSACTIVÉ tant qu'on est
    // en mode test, donc aucune donnée fictive ne part en ligne (le bug 2026-05-29 reste couvert).
    const {
        apiKeys: _apiKeys,
        activeTab: _activeTab,
        isPrivacyMode: _isPrivacyMode,
        lastProjection: _lastProjection,
        projectionStatus: _projectionStatus,
        projectionRefus: _projectionRefus,
        lockedProjection: _lockedProjection,
        pendingFocus: _pendingFocus,
        ...persistable
    } = state;
    return persistable;
};
