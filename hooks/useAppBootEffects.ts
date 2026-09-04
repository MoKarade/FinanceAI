// hooks/useAppBootEffects.ts
//
// [GODFILE-APP] Effets de DÉMARRAGE de l'app, extraits tels quels d'App.tsx (le composant était une
// god-function de 910 lignes). Rien ne change au comportement : mêmes effets, mêmes dépendances,
// même ORDRE relatif — et l'ordre qui compte est documenté sur place (le provider marketData se
// configure AVANT tout consommateur ; ce hook est appelé avant useAssetDataHydration dans App).
// Aucun paramètre : tout se lit du store (sélecteurs identiques à ceux qu'App employait).

import { useEffect, useRef } from 'react';
import { showToast } from '../components/ui/Toast';
import { useFinanceStore, getMigrationStatus, getHydrationStatus } from '../store/useFinanceStore';
import { loadApiKeysDetailed, saveApiKeys } from '../services/secureKeyStore';
// [PERF-MARKETDATA-DYNIMPORT-INERTE] JAMAIS d'import statique de valeurs depuis
// services/marketData ici : ce hook est tiré par le chunk d'ENTRÉE (App), et un seul import
// statique annule la frontière asynchrone du module entier (~67 Ko). Tout passe par la promesse
// mémoïsée de lazy.ts, qui préserve aussi l'ordre configure→quote (voir son en-tête).
import { loadMarketData } from '../services/marketData/lazy';
import { installGlobalErrorHandlers, logError } from '../services/errorLogger';
import { initAutoBackup, createBackupNow } from '../services/backupAuto';
import { sanitizePersonaArtifacts } from '../services/personaSanitizer';
import { loadLockedProjection } from '../services/lockedProjectionStore';
import { initSync, runBootSync, schedulePush, flushPush, startDrivePolling, markApiKeysHydrated, startInactivityWatch, handleInactivityLogout } from '../services/sync/syncOrchestrator';
import { maybeRunDailyFintableSync } from '../services/fintable/autoSync';
import { fetchFxRates } from '../services/finance';

/** Tous les effets de boot d'App : handlers d'erreur, courbe verrouillée, service worker, purge
 *  persona, init sync Drive, filets migration/hydratation, provider marché, clés API chiffrées,
 *  sync bancaire auto, taux FX. Appelé UNE fois, en tête d'App. */
export function useAppBootEffects(): void {
    // P1 — installation des handlers d'erreur globaux au boot (une seule fois)
    const errorHandlersInstalled = useRef(false);
    useEffect(() => {
        if (errorHandlersInstalled.current) return;
        errorHandlersInstalled.current = true;
        installGlobalErrorHandlers();
        // PH2-d — restaure la courbe VERROUILLÉE depuis IndexedDB si un verrou était actif au dernier
        // reload (le booléen isProjectionLocked est persisté, le gros blob non → relu de l'IDB ici).
        // PH2-d-1 — 'empty' (rien/erreur d'accès) → silence ; 'unreadable' (entrée présente mais clé
        // disparue) → on AVERTIT l'utilisateur (jumeau de decrypt_failed des clés API).
        if (useFinanceStore.getState().isProjectionLocked) {
            // [PERF-BUNDLE] import STATIQUE : lockedProjectionStore est déjà dans le chunk de BOOT (importé
            // statiquement par le store) → le dynamic import ne créait aucun chunk séparé (INEFFECTIVE_DYNAMIC_IMPORT).
            loadLockedProjection()
                .then((res) => {
                    if (res.status === 'ok') {
                        useFinanceStore.getState().setLockedProjection(res.result);
                    } else {
                        useFinanceStore.getState().setLockedProjection(null);
                        if (res.status === 'unreadable') {
                            showToast('Ta courbe verrouillée n\'a pas pu être restaurée (clé de chiffrement introuvable) et a été retirée.', 'info');
                        }
                    }
                })
                .catch(() => { /* module/IDB HS : on reste déverrouillé en mémoire */ });
        }
        // PH1-a (revue) : le clear du flag « chunk reload attempted » au mount a été RETIRÉ —
        // il tournait AVANT la résolution des chunks lazy du boot et neutralisait la garde
        // anti-boucle (échec persistant ⇒ reload infini). La garde est désormais un timestamp
        // auto-expirant dans utils/lazyWithRetry (au plus 1 reload auto/min, aucun clear requis).
        // P1.3 — auto-backup quotidien dans IndexedDB (silent fail si indispo).
        // Léger debounce (2s) pour ne pas bloquer le 1er paint.
        const timer = setTimeout(() => { initAutoBackup(); }, 2000);

        // P2.9 — service worker en PROD seulement (Vite HMR en dev s'auto-gère).
        // Bug fix 2026-05-21 : ce useEffect tourne souvent APRÈS window.load
        // (mount React arrive après l'event), donc addEventListener('load') ne
        // déclenchait jamais le callback → SW jamais registered, cache vide.
        // Fix : register direct si le DOM est déjà loaded, sinon on attend l'event.
        if (import.meta.env.PROD && 'serviceWorker' in navigator) {
            const registerSW = () => {
                navigator.serviceWorker.register('/sw.js').catch((err) => {
                    // log explicite plutôt qu'un silent catch — utile en cas
                    // de régression future (anti-pattern silent-failure-hunter).
                    console.error('[SW] registration failed:', err);
                });
            };
            if (document.readyState === 'complete') {
                registerSW();
            } else {
                window.addEventListener('load', registerSW, { once: true });
            }
        }

        // [PERSONA-PURGE] Self-heal AVANT l'init sync : si des artefacts de persona de test ont
        // fui dans les données réelles (incident 2026-07-15 : ~600 transactions « Karim » chez
        // Marc), on les retire par id déterministe — l'état guéri est ensuite persisté et poussé
        // vers Drive par le cycle normal. No-op en mode test et sur état propre.
        // Détection À SEC d'abord ; pollution détectée → backup IndexedDB de l'état PRÉ-purge
        // (finding panel sécurité : symétrie avec applyPulledPayload — toute mutation automatique
        // des vraies données a son filet), PUIS purge. Best-effort : backup HS ≠ rester pollué.
        void (async () => {
            const st = useFinanceStore.getState();
            if (st.isTestMode) return;
            const { report } = sanitizePersonaArtifacts(st as unknown as Parameters<typeof sanitizePersonaArtifacts>[0]);
            if (report.removedTotal === 0) return;
            try {
                // Depuis [BACKUP-PROMISE-CATCH], createBackupNow journalise EN INTERNE ses échecs
                // IndexedDB (rejet async tx.onerror → null) ; ici on trace juste que le filet est absent.
                const backup = await createBackupNow('auto');
                if (!backup) {
                    logError({ source: 'storage', severity: 'warning', message: 'purgePersonaArtifacts : backup pré-purge indisponible (null) — purge SANS filet' });
                }
            } catch (e) {
                // Erreur SYNCHRONE en amont du backup (payload/crypto de chiffrement) — la purge procède
                // quand même (chirurgicale, ids déterministes), mais « filet absent » doit être visible.
                logError({ source: 'storage', severity: 'warning', message: 'purgePersonaArtifacts : backup pré-purge échoué (amont) — purge SANS filet', error: e instanceof Error ? e : new Error(String(e)) });
            }
            const purged = useFinanceStore.getState().purgePersonaArtifacts();
            if (purged > 0) {
                showToast(`${purged} donnée(s) de test (persona) retirée(s) de tes vraies données (backup pris avant).`, 'info');
            }
        })();

        // Sync Google Drive — inerte si VITE_GOOGLE_CLIENT_ID absent. Init + sync silencieuse au
        // boot (uniquement si déjà connecté), puis push debouncé sur chaque changement du store.
        initSync(import.meta.env.VITE_GOOGLE_CLIENT_ID);
        const syncTimer = setTimeout(() => { void runBootSync(); }, 2500);
        const unsubSync = useFinanceStore.subscribe(() => schedulePush());
        // [AUTH-DRIVE-INACTIVITY] Déconnexion auto après 8h d'inactivité (demande Marc 2026-07-22) :
        // le minuteur suit l'activité (clic/clavier/retour d'onglet) et, au bout de 8h sans interaction,
        // révoque le jeton Drive + prévient. La reprise silencieuse au boot s'appuie sur le même seuil
        // (< 8h → reconnexion sans clic ; ≥ 8h → login requis). Données locales jamais touchées.
        const stopInactivity = startInactivityWatch(() => {
            handleInactivityLogout();
            showToast('Déconnecté de Google Drive après 8 h d\'inactivité (sécurité). Reconnecte-toi pour reprendre la sauvegarde.', 'info');
        });
        // Rafraîchissement « fluide » : reflète SEUL les changements de Drive (ex. doc rangé par le
        // connecteur MCP) sur intervalle + au retour sur l'onglet (garde anti-perte réutilisée).
        const stopPolling = startDrivePolling();
        // Flush du push en attente quand l'onglet se masque/ferme : garantit que le DERNIER changement
        // atteint Drive avant que Marc parte parler à Claude (sinon le debounce 8s pourrait ne jamais
        // partir → le connecteur MCP lirait une copie périmée). No-op si non connecté / rien de neuf.
        const onHide = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') flushPush();
        };
        const onPageHide = () => flushPush();
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onHide);
        if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide);

        return () => {
            clearTimeout(timer);
            clearTimeout(syncTimer);
            unsubSync();
            stopPolling();
            stopInactivity();
            if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHide);
            if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide);
        };
    }, []);

    // Deux refs SÉPARÉS (finding panel silent-failure, lot audit 2026-07-17) : un ref partagé
    // ferait avaler le toast d'hydratation quand migration legacy ET réhydratation échouent
    // ENSEMBLE (localStorage inaccessible : les deux chemins tombent en même temps) — le pire
    // scénario perdrait précisément son avertissement « NE RIEN SAISIR ».
    const migrationWarningShown = useRef(false);
    const hydrationWarningShown = useRef(false);
    useEffect(() => {
        const status = getMigrationStatus();
        if (status.failed && !migrationWarningShown.current) {
            migrationWarningShown.current = true;
            const backupHint = status.backupKey
                ? `Backup sauvegarde sous la cle ${status.backupKey} (F12 -> Application -> Local Storage).`
                : 'Aucun backup recuperable.';
            showToast(
                `[CRITIQUE] Etat corrompu detecte au demarrage. ${backupHint} Vos donnees actuelles sont vides ou par defaut.`,
                'error'
            );
            console.error('[FinanceAI] Migration failure:', status);
        }
        // [STORE-REHYDRATE-SILENT, audit 2026-07-16] Chemin DISTINCT : la réhydratation ZUSTAND
        // (financeai-storage) a échoué → l'app affiche l'état par défaut alors que les données existent
        // encore (blob intact + Drive + backups). Avant ce filet : app vierge SANS AUCUN message →
        // risque de sur-réaction destructrice (re-onboarding par-dessus, pull écrasant).
        const hydration = getHydrationStatus();
        if (hydration.failed && !hydrationWarningShown.current) {
            hydrationWarningShown.current = true;
            showToast(
                '[CRITIQUE] Tes données n\'ont PAS pu être chargées (sauvegarde locale illisible). NE RIEN SAISIR : tes données existent encore — restaure un backup (Réglages → Sauvegarde) ou reconnecte Drive.',
                'error'
            );
            console.error('[FinanceAI] Hydration failure:', hydration);
        }
    }, []);

    // §7.F.5 — Configure le provider marketData (Finnhub) quand la clé change.
    // Async depuis le lot 133 (module paresseux) : l'ordre avec les cotations est préservé par la
    // promesse PARTAGÉE de loadMarketData — cet effet l'attend en premier (ce hook est appelé avant
    // tout consommateur dans App), ses continuations passent donc avant celles des quotes (FIFO).
    const finnhubKey = useFinanceStore((s) => s.apiKeys.finnhub);
    useEffect(() => {
        void loadMarketData().then((md) => md.configureMarketDataProvider({ finnhubKey }));
    }, [finnhubKey]);

    // Hydratation des clés API depuis le coffre chiffré (au boot, une fois).
    // C5 les avait rendues mémoire-seulement → elles disparaissaient à chaque
    // rechargement. Désormais : on les recharge tout seul au démarrage (donc
    // dès que le gate Google in-app t'a laissé charger l'app). Quand la clé est
    // posée dans le store, les effets réactifs (Finnhub, ci-dessus) partent
    // automatiquement. Best-effort : si le coffre est indisponible (vieux
    // navigateur, pas de Web Crypto), on ne casse pas le boot.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const result = await loadApiKeysDetailed();
                if (cancelled) return;
                // D5 (anti-race sync) : le vault a répondu « ok » → l'état des clés est CONNU (même
                // vide). À partir d'ici, un push avec clés vides reflète l'intention (et n'est plus
                // bloqué/préservé). NB : on NE marque PAS sur decrypt_failed (clés présentes mais
                // illisibles ici → mieux vaut préserver celles du Drive).
                if (result.status === 'ok') markApiKeysHydrated();
                if (result.status === 'decrypt_failed') {
                    // Blob chiffré présent mais clé IDB absente (ex: navigation privée
                    // entre sessions, IndexedDB vidé) → on prévient l'utilisateur.
                    showToast(
                        'Clés API non restaurées — la clé de chiffrement est introuvable. Re-saisissez vos clés dans Paramètres.',
                        'error'
                    );
                    return;
                }
                // ⚠️ [Finding silent-failure #545, ÉLEVÉ] `fintable` DOIT compter dans la garde :
                // un coffre qui ne contient QUE le jeton Fintable (ni Anthropic ni Finnhub) n'était
                // JAMAIS restauré dans le store → jeton perdu à chaque reload, sync auto neutralisée
                // en silence (reason 'no-token' en boucle, zéro trace).
                if (result.status === 'ok' && (result.keys.anthropic || result.keys.finnhub || result.keys.fintable)) {
                    useFinanceStore.getState().updateApiKeys(result.keys);
                    return;
                }
                // Migration : clés legacy encore lues en clair au boot (avant C5)
                // mais pas encore dans le coffre → on les chiffre maintenant.
                const current = useFinanceStore.getState().apiKeys;
                if (current.anthropic || current.finnhub) {
                    await saveApiKeys(current);
                }
            } catch (e) {
                // Règle « ne jamais avaler les erreurs » : un échec d'hydratation des clés (l'IA et
                // les cours d'actions ne fonctionneront pas) doit être visible dans les diagnostics.
                logError({ source: 'storage', severity: 'error', message: 'Hydratation des clés API chiffrées impossible', error: e });
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // [FINTABLE-7 Lot 3] Sync bancaire AUTOMATIQUE à l'ouverture, throttlée 1×/jour (demande Marc).
    // Effet RÉACTIF au jeton (hydraté ASYNC depuis le coffre par l'effet ci-dessus) — un timer au
    // boot lirait un store encore vide et ne partirait jamais. Toutes les gardes (mode test, passe
    // réussie < 24 h, cooldown de tentative 1 h, mutex) vivent dans le service ; ici on ne fait que
    // déclencher et montrer un signal DISCRET (compte de transactions, jamais de montant).
    const fintableToken = useFinanceStore((s) => s.apiKeys?.fintable ?? '');
    useEffect(() => {
        if (!fintableToken) return;
        let cancelled = false;
        // [Finding code-reviewer #545 §3] Debounce 3 s : `saveToken` persiste le jeton à CHAQUE
        // frappe → sans délai, taper le jeton à la main déclencherait une passe réseau avec un jeton
        // incomplet (faux « jeton refusé » dans Diagnostics). Une frappe suivante annule et re-arme.
        const timer = setTimeout(() => {
            void (async () => {
                // `autoSync` est LÉGER (store + gardes) — import statique, pas de chunk à risque ; le
                // LOURD (browserSync → client HTTP + mapper) est chargé DANS le service via importWithRetry.
                const outcome = await maybeRunDailyFintableSync();
                if (cancelled || !outcome.ran) return;
                if (outcome.report.error === null && outcome.report.transactionsAdded > 0) {
                    showToast(`Sync bancaire : ${outcome.report.transactionsAdded} transaction(s) importée(s).`, 'success');
                }
                // Échec : PAS de toast d'erreur à chaque boot (le rapport est visible dans Réglages →
                // Sync Fintable / Diagnostics, et logError a tracé) — un échec récurrent de sync AUTO ne
                // doit pas devenir une bannière quotidienne anxiogène ; le manuel reste disponible.
            })();
        }, 3000);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [fintableToken]);

    // Taux FX au boot (une fois). Le sélecteur capture les valeurs du PREMIER rendu — même
    // sémantique que dans App (effet à deps vides sur la closure du montage).
    const fxRates = useFinanceStore((s) => s.fxRates);
    const updateFxRates = useFinanceStore((s) => s.updateFxRates);
    useEffect(() => {
        const doUpdateFxRates = async () => {
            try {
                const rates = await fetchFxRates();
                if (fxRates.USD !== rates.USD || fxRates.EUR !== rates.EUR) {
                    updateFxRates(rates);
                }
            } catch (e) {
                logError({ source: 'network', severity: 'warning', message: 'Mise à jour des taux FX impossible (taux de repli utilisés)', error: e });
            }
        };
        doUpdateFxRates();
    // Effet run-once au boot : fetch FX rates une seule fois, sans re-run réactif sur state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}
