// utils/storageKeys.ts
//
// [STORAGE-KEYS-NO-REGISTRY] Les clés de stockage écrites à PLUSIEURS endroits, en un seul.
//
// ⚠️ POURQUOI CE MODULE, et pourquoi CES clés-là. Une clé de stockage n'est dangereuse que si son
// nom est écrit deux fois : c'est la seule situation où une correction peut n'être appliquée qu'à
// moitié, et le résultat est SILENCIEUX — l'app lit une clé qui n'existe pas et se comporte comme
// un premier lancement. Les clés écrites à un seul endroit n'ont pas ce problème et ne sont pas
// déplacées ici : les regrouper toutes ferait un tableau plus gros sans rien rendre plus sûr, et
// ajouterait un import à des fichiers qui n'en ont pas besoin.
//
// ⚠️ LA PLUS EXPOSÉE ÉTAIT AUSSI LA PLUS CRITIQUE. `financeai-storage` porte TOUTES les données de
// l'utilisateur (le blob du store persistant). Elle était écrite en QUATRE endroits — deux
// littéraux dans le store, plus une constante dans `backupAuto` et une dans `syncSnapshot`, cette
// dernière accompagnée d'un commentaire « doit correspondre au `name` du persist Zustand et à
// backupAuto ». Un commentaire qui demande de la vigilance est l'aveu qu'il manque une source
// unique : la vigilance ne survit pas à un renommage fait un soir de correctif urgent.
//
// ⚠️ Module PUR, ZÉRO import — il est consommé par `store/useFinanceStore.ts`, donc il part dans le
// bundle de BOOT. Y importer quoi que ce soit tirerait ses dépendances avec.
//
// ⚠️ Le ticket demandait aussi de « centraliser les 3 `DISMISS_KEY` dupliqués ». Mesuré, ils ne sont
// PAS dupliqués : trois composants déclarent une constante du même NOM portant trois valeurs
// DIFFÉRENTES (`statementReminderDismissedMonth`, `celiNudgeDismissedAt`,
// `backupReminderDismissedAt`). Les « centraliser » les ferait entrer en collision, c'est-à-dire
// créerait exactement le défaut que ce module existe pour empêcher. Ce sont des homonymes, pas des
// doublons, et ils restent chacun chez eux.

/**
 * Clés `localStorage` partagées par plusieurs modules.
 *
 * La valeur est le contrat avec les navigateurs DÉJÀ installés : la changer efface les données de
 * tout le monde. Aucune de ces chaînes ne se renomme sans une migration écrite.
 */
export const STORAGE_KEYS = {
    /**
     * Le blob du store persistant (Zustand `persist`) — TOUTES les données de l'utilisateur.
     * Propriétaire : `store/useFinanceStore.ts` (c'est son `name`).
     * Lecteurs : `services/backupAuto.ts` (snapshot des sauvegardes automatiques),
     * `services/sync/syncSnapshot.ts` (charge utile poussée vers Drive), et le store lui-même
     * (détection « déjà migré » au boot legacy).
     */
    persistStore: 'financeai-storage',

    /**
     * Coffre CHIFFRÉ des clés API (AES-GCM, base64). Propriétaire : `services/secureKeyStore.ts`.
     * Lecteur : le store, qui l'EXCLUT explicitement de la purge des clés héritées — d'où la
     * nécessité que les deux fichiers désignent la même chaîne.
     */
    apiKeysEncrypted: 'app_api_keys_enc',

    /**
     * Ancien emplacement des clés API, EN CLAIR. N'est plus écrit : lu une fois au boot pour
     * migrer vers le coffre chiffré, puis supprimé. Propriétaire : `store/useFinanceStore.ts`.
     * ⚠️ À conserver tant qu'un navigateur peut encore la porter — la retirer laisserait une clé
     * API en clair dans `localStorage` pour toujours.
     */
    apiKeysLegacy: 'app_api_keys',

    /**
     * L'écran de bienvenue a été passé. Propriétaire : `App.tsx`.
     * Écrit aussi par `services/sync/syncPull.ts` (un pull Drive qui ramène des données signifie
     * que l'utilisateur n'est pas nouveau) et par le harnais E2E, qui l'injecte avant le
     * chargement de la page.
     */
    onboardingDone: 'app_onboarding_done',

    /**
     * Choix de consentement analytique (Loi 25) : `'granted'` | `'denied'`.
     * Propriétaire : `services/consent.ts`. Le harnais E2E le pré-règle à `'denied'` pour que la
     * bannière n'intercepte pas les clics.
     *
     * ⚠️ UNE COPIE SURVIT HORS DU BUNDLE, et elle est irréductible : `public/ga-init.js` est un
     * fichier statique vanilla, chargé AVANT l'app pour rétablir le consentement d'une session
     * précédente. Il ne peut rien importer. La copie est donc assumée — mais elle est VÉRIFIÉE par
     * `tests/guards/storageKeysRegistreGuard.test.ts`, ce qui n'était pas le cas avant : jusqu'ici
     * un commentaire demandait de la synchroniser à la main.
     */
    analyticsConsent: 'financeai:analyticsConsent:v1',
} as const;
