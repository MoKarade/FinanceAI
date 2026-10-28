// store/actionsModeTest.ts
// [GODFILE-STORE] Les trois actions du MODE TEST (persona de démo), extraites telles quelles de
// useFinanceStore.ts (lot 158) en créateur — mêmes fermetures sur set/get, même comportement.
import type { StoreApi } from 'zustand';
import type { AppState } from '../types';
import { INITIAL_CHILD_GOAL } from '../constants';
import { logError } from '../services/errorLogger';
import { sanitizePersonaArtifacts } from '../services/personaSanitizer';
import { clearAttachmentCache } from '../services/aiChat/attachments';
import { clearHistorySyncReport } from '../services/history/syncDiagnostics';
import { personaResetBase } from './etatParDefaut';
import type { FinanceState } from './useFinanceStore';

type ActionsModeTest = Pick<FinanceState, 'enableTestMode' | 'disableTestMode' | 'purgePersonaArtifacts'>;

export const creerActionsModeTest = (
    set: StoreApi<FinanceState>['setState'],
    get: StoreApi<FinanceState>['getState'],
): ActionsModeTest => ({
    // Mode test : sauve l'état "vrai" actuel, applique les fixtures,
    // active le flag (banner visible via Layout).
    // [AITOOLS-B1, finding panel sécurité] Le cache mémoire des pièces jointes du chat porte
    // des OCTETS réels (relevés/PDF) — purgé à CHAQUE bascule de mode (hygiène inter-persona,
    // discipline PERSONA-PURGE ; le transcript, lui, est déjà couvert par personaResetBase).
    // [Finding sécurité #494] + purge du rapport de sync des historiques : il porte les
    // TICKERS RÉELS — un futur consommateur sans re-check isTestMode les afficherait en démo
    // persona (même classe PERSONA-PURGE). La purge rend vrai le contrat documenté du module.
    enableTestMode: (fixtures, personaId) => { clearAttachmentCache(); clearHistorySyncReport(); return set((prev) => {
        // Snapshot des VRAIES données SEULEMENT à la 1re activation (hors flags UI/credentials).
        // Au changement de persona (déjà en test), on CONSERVE ce snapshot initial — sinon on
        // « sauvegarderait » les données fictives par-dessus les vraies (perte définitive).
        let realDataSnapshot = prev.realDataSnapshot;
        if (!prev.isTestMode) {
            const { apiKeys: _ak, activeTab: _at, isPrivacyMode: _pm, lastProjection: _lp, pendingFocus: _pf, isTestMode: _tm, realDataSnapshot: _rds, activeTestPersonaId: _atp, ...persistable } = prev as FinanceState;
            void _ak; void _at; void _pm; void _lp; void _pf; void _tm; void _rds; void _atp;
            realDataSnapshot = persistable as Partial<Omit<AppState, 'apiKeys'>>;
        }
        return {
            ...prev,
            // Repart d'une base de données PROPRE avant d'appliquer le persona : aucune tranche
            // de l'ancien persona (ni des vraies données) ne subsiste (fix « données qui restent »).
            ...personaResetBase(),
            ...fixtures,
            // Les clés API sont des credentials, jamais des données financières : le mode test
            // ne doit JAMAIS les écraser (sinon market data tombe en panne au retour).
            apiKeys: prev.apiKeys,
            // [PROJECTION-PERSIST] champ de FinanceState (hors AppState) → personaResetBase ne le
            // couvre pas : reset explicite, sinon la sig RÉELLE traîne dans l'état persona (déjà
            // capturée dans realDataSnapshot ci-dessus, restaurée à la sortie).
            revealedProjectionSig: null,
            isTestMode: true,
            realDataSnapshot,
            activeTestPersonaId: personaId ?? null,
        };
    }); },
    // Restaure les vraies données sauvegardées + désactive le flag.
    disableTestMode: () => { clearAttachmentCache(); return set((prev) => {
        if (!prev.isTestMode) return prev;
        const snap = prev.realDataSnapshot;
        if (!snap) {
            // État corrompu : en mode test mais sans snapshot des vraies données (blob édité,
            // quota au moment du snapshot, futur bug de migration…). On ne PEUT PAS restaurer —
            // on échoue franchement (log) et on repart d'une base PROPRE plutôt que de laisser
            // les données fictives passer pour réelles (ce qui, le flag retombé, ré-ouvrirait le
            // push Drive — le bug 2026-05-29). Jamais avalé.
            logError({ source: 'storage', severity: 'warning', message: 'disableTestMode : mode test actif sans realDataSnapshot — vraies données non restaurables, retour à un état vide.' });
            // [PROJECTION-PERSIST] reset explicite (hors AppState) : une sig issue d'un persona
            // ne doit pas survivre en mode réel dans ce chemin dégradé.
            return { ...prev, ...personaResetBase(), revealedProjectionSig: null, isTestMode: false, realDataSnapshot: null, activeTestPersonaId: null };
        }
        // [PERSONA-PURGE] Le snapshot des « vraies » données peut lui-même être pollué
        // (pris à une époque où des artefacts de persona avaient déjà fui) → on le
        // désinfecte AVANT de le restaurer : la sortie du mode test rend un état réel PROPRE.
        const { state: cleanSnap, report } = sanitizePersonaArtifacts(snap);
        if (report.removedTotal > 0) {
            logError({
                source: 'storage', severity: 'warning',
                message: `disableTestMode : ${report.removedTotal} artefact(s) de persona retiré(s) du snapshot réel (${Object.entries(report.bySlice).map(([k, v]) => `${k}:${v}`).join(', ')})`,
            });
        }
        // ⚠️ Singuliers RETIRÉS du snapshot par le sanitizer (clé supprimée) : le spread
        // `{...prev, ...cleanSnap}` ne les écraserait PAS → on garderait le childGoal/
        // weddingGoal du PERSONA qu'on quitte (bug panel 2026-07-15). Reset explicite.
        const singularResets: Partial<FinanceState> = {};
        if (report.bySlice.childGoal) singularResets.childGoal = structuredClone(INITIAL_CHILD_GOAL);
        if (report.bySlice.weddingGoal) singularResets.weddingGoal = undefined;
        // [B4-CHAT-COST, finding panel #489 prouvé par sonde] Le coût API dépensé PENDANT la
        // démo persona est RÉEL (vraie clé, vrais appels) : personaResetBase l'a remis à 0 à
        // l'entrée → la valeur courante = dépense de la démo. La restauration verbatim du
        // snapshot la jetait en silence → on l'ADDITIONNE au cumul réel restauré.
        const demoSpendUsd = Number.isFinite(prev.aiChatCostUsdTotal) ? (prev.aiChatCostUsdTotal ?? 0) : 0;
        const snapTotal = Number.isFinite(cleanSnap.aiChatCostUsdTotal) ? (cleanSnap.aiChatCostUsdTotal ?? 0) : 0;
        return {
            ...prev,
            ...cleanSnap,
            ...singularResets,
            aiChatCostUsdTotal: snapTotal + demoSpendUsd,
            isTestMode: false,
            realDataSnapshot: null,
            activeTestPersonaId: null,
        };
    }); },

    // [PERSONA-PURGE] Self-heal du mode réel (appelé au boot par App.tsx) : purge par id
    // déterministe (registre artifactIds), JAMAIS en mode test (fixtures légitimes).
    // La persistance Zustand + le push Drive debouncé propagent l'état guéri partout.
    purgePersonaArtifacts: () => {
        const prev = get();
        if (prev.isTestMode) return 0;
        const { state: cleaned, report } = sanitizePersonaArtifacts(prev as unknown as Partial<AppState>);
        if (report.removedTotal === 0) return 0;
        logError({
            source: 'storage', severity: 'warning',
            message: `purgePersonaArtifacts : ${report.removedTotal} artefact(s) de persona de test retirés des données réelles (${Object.entries(report.bySlice).map(([k, v]) => `${k}:${v}`).join(', ')})`,
        });
        // Patch MINIMAL : seulement les tranches touchées (pas tout l'état). Le singulier
        // `childGoal` (retiré du patch par le sanitizer) retombe sur le défaut de l'app.
        const patch: Partial<FinanceState> = { lastUpdate: Date.now() };
        for (const slice of Object.keys(report.bySlice)) {
            if (slice === 'childGoal') {
                patch.childGoal = structuredClone(INITIAL_CHILD_GOAL);
            } else {
                (patch as Record<string, unknown>)[slice] = (cleaned as Record<string, unknown>)[slice];
            }
        }
        set(patch);
        return report.removedTotal;
    },
});
