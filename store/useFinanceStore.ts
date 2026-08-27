import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AppState, Tab, BudgetCategory, FinancialGoal, RealEstateGoal } from '../types';
import { INITIAL_BUDGET, INITIAL_CONFIG, INITIAL_PROJECTION, INITIAL_REAL_ESTATE_GOAL, INITIAL_CHILD_GOAL, DEFAULT_FX_RATES } from '../constants';
import type { ProjectionResult } from '../services/projection/types';
import { quotaStorage } from '../services/quotaStorage';
import { logError } from '../services/errorLogger';
import { saveLockedProjection, clearLockedProjection } from '../services/lockedProjectionStore';
import { loadLegacyHealthWeights } from '../utils/healthWeights';
import { calculateGrossFromNet } from '../utils/tax';
import { sanitizePersonaArtifacts } from '../services/personaSanitizer';
import { clearAttachmentCache } from '../services/aiChat/attachments';
import { clearHistorySyncReport } from '../services/history/syncDiagnostics';
import { DEFAULT_AI_CHAT_MODEL } from '../services/aiChat/models';

// Phase B2 — Deep-link cross-tab: un onglet pose un "intent" de focus, la page
// destination le consomme au mount (scroll, highlight, focus, etc.).
export interface PendingFocus {
    tab: Tab;
    section: string | null;
    /** Timestamp d'expiration (ms). Garde-fou: si la page cible ne consomme
     *  pas dans 5s, on auto-purge pour éviter les focus fantômes. */
    expiresAt: number;
}

/** PH2-c — statut du moteur de projection app-level (ProjectionEngine). */
export type ProjectionStatus = 'idle' | 'computing' | 'error';

export interface FinanceState extends AppState {
    activeTab: Tab;
    isPrivacyMode: boolean;
    // Wiring 2026-05 (Option A): dernier résultat de calculateFutureProjection,
    // mis à jour par FutureProjection. Lu par Dashboard/Investments/Budget/etc.
    // pour afficher des projections cohérentes sans recalculer.
    lastProjection: ProjectionResult | null;
    /** PH2-a (clé de voûte) — toggle Monte-Carlo de l'onglet Futur, REMONTÉ dans le store
     *  pour survivre aux changements d'onglet (le contrôle ne se réinitialise plus au retour
     *  sur Futur) et persisté pour survivre au reload. */
    projectionRunMC: boolean;
    /** PH2-c (clé de voûte) — statut du moteur de projection app-level (ProjectionEngine).
     *  Transitoire (NON persisté) : tout onglet peut afficher « recalcul… » / erreur sans
     *  tenir l'état de calcul localement. */
    projectionStatus: ProjectionStatus;
    /** PH2-d — courbe VERROUILLÉE : snapshot complet d'un ProjectionResult choisi par l'utilisateur.
     *  TRANSITOIRE en mémoire (NON dans le persist localStorage — trop gros) ; persisté CHIFFRÉ en
     *  IndexedDB (services/lockedProjectionStore) et restauré au boot si `isProjectionLocked`. */
    lockedProjection: ProjectionResult | null;
    /** PH2-d — vrai si une courbe est verrouillée. Persisté (booléen ADDITIF, pas de bump v7) ;
     *  le gros blob `lockedProjection` vit en IndexedDB. */
    isProjectionLocked: boolean;
    /** [PROJECTION-PERSIST 2026-07-16] Signature des inputs de la DERNIÈRE projection RÉVÉLÉE par
     *  l'utilisateur (clic « Calculer »/« Appliquer »). Persistée (string ADDITIVE, pas de bump v7,
     *  synchronisée Drive → cross-PC) : au reload/changement de page/autre appareil, la courbe reste
     *  affichée au lieu de re-demander un calcul (demande Marc). null = jamais révélé.
     *  Si les inputs divergent (sig ≠ courante), l'UI FIGE l'ancienne courbe (blob IDB, cf
     *  lockedProjectionStore record `revealed`) + badge « pas à jour » (choix Marc : figer, pas recalculer). */
    revealedProjectionSig: string | null;
    pendingFocus: PendingFocus | null;
    // Mode test : true = l'app affiche des fixtures de test, banner visible
    isTestMode: boolean;
    /** Snapshot des vraies données sauvegardé AVANT activation du mode test.
     *  Restauré quand l'utilisateur sort du mode test. */
    // Omit<…,'apiKeys'> : invariant de sécurité GARANTI au compilateur — le snapshot des vraies
    // données (désormais persisté en localStorage) ne peut JAMAIS contenir les clés API.
    realDataSnapshot: Partial<Omit<AppState, 'apiKeys'>> | null;
    /** Id du persona de test actuellement chargé (null hors mode test). */
    activeTestPersonaId: string | null;
    setActiveTab: (tab: Tab) => void;
    setPrivacyMode: (v: boolean) => void;
    togglePrivacyMode: () => void;
    setAppState: (state: Partial<AppState>) => void;
    setLastProjection: (r: ProjectionResult | null) => void;
    setProjectionRunMC: (v: boolean) => void;
    setProjectionStatus: (s: ProjectionStatus) => void;
    /** PH2-d — verrouille la courbe courante (snapshot mémoire + persistance IndexedDB chiffrée). */
    lockProjection: (r: ProjectionResult) => void;
    /** PH2-d — déverrouille (efface le snapshot mémoire ET l'entrée IndexedDB). */
    unlockProjection: () => void;
    /** PH2-d — restaure la courbe verrouillée depuis IndexedDB au boot (sans ré-écrire l'IDB). */
    setLockedProjection: (r: ProjectionResult | null) => void;
    /** [PROJECTION-PERSIST] fixe/efface la signature de la projection révélée (null = re-gate). */
    setRevealedProjectionSig: (sig: string | null) => void;
    /** Navigate to a tab with an optional section to scroll/focus on arrival. */
    navigateWithFocus: (tab: Tab, section?: string) => void;
    /** Called by the destination page after it has consumed the focus intent. */
    clearPendingFocus: () => void;
    updateFxRates: (rates: { USD: number; EUR: number; CAD: number; lastFetched?: number; estimated?: boolean }) => void;
    updateApiKeys: (keys: { anthropic: string; finnhub?: string }) => void;
    updateLastUpdate: () => void;
    resetState: () => void;
    /** Active le mode test : sauvegarde l'état actuel + applique des fixtures.
     *  `personaId` (optionnel) identifie le persona chargé pour le banner. */
    enableTestMode: (fixtures: Partial<AppState>, personaId?: string | null) => void;
    /** Désactive le mode test : restaure l'état sauvegardé. */
    disableTestMode: () => void;
    /** [PERSONA-PURGE] Retire du mode RÉEL tout artefact de persona de test (ids déterministes).
     *  No-op en mode test. Rend le nombre d'items retirés (0 = déjà propre). */
    purgePersonaArtifacts: () => number;
}

const safeRandomId = (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
};

interface MigrationStatus {
    failed: boolean;
    backupKey: string | null;
    error: string | null;
}
let _migrationStatus: MigrationStatus = { failed: false, backupKey: null, error: null };
export const getMigrationStatus = (): MigrationStatus => _migrationStatus;

// [STORE-REHYDRATE-SILENT, audit 2026-07-16] Statut de la RÉHYDRATATION ZUSTAND (`financeai-storage`,
// parse + migrate v1→v7) — chemin DISTINCT de la migration legacy ci-dessus (getInitialStateWithMigration),
// qui, lui, était déjà couvert. Sans `onRehydrateStorage`, zustand JETTE l'erreur (vérifié dans
// middleware.mjs) → blob corrompu = app vierge sans AUCUNE trace, indiscernable d'un 1er lancement
// (les données sont pourtant encore dans le blob + Drive + backups). Même pattern que MigrationStatus :
// statut module-level + toast critique dans App + visible SystemView.
interface HydrationStatus { failed: boolean; error: string | null }
let _hydrationStatus: HydrationStatus = { failed: false, error: null };
export const getHydrationStatus = (): HydrationStatus => _hydrationStatus;

const migrateBudgetItems = (items: BudgetCategory[]): BudgetCategory[] => {
    return items.map(item => {
        const id = item.id || `cat_${safeRandomId()}`;
        let nature = item.nature;
        if (!nature) {
            const n = (item.name || '').toLowerCase();
            nature = 'Envie';
            if (n.includes('épargne') || n.includes('finances') || n.includes('reer') || n.includes('celi')) nature = 'Epargne';
            else if (n.includes('loyer') || n.includes('hypothèque') || n.includes('hydro') || n.includes('épicerie') || n.includes('internet') || n.includes('assurance') || n.includes('essence') || n.includes('transport')) nature = 'Besoin';
        }
        return { ...item, id, nature };
    });
};

type LegacyUser = { netSalary?: number; salary?: number; grossSalary?: number; [k: string]: unknown };
type LegacyBudgetConfig = { users: LegacyUser[]; [k: string]: unknown };
const migrateUserConfig = (config: LegacyBudgetConfig): LegacyBudgetConfig => {
    const newUsers = config.users.map((u) => {
        const net = u.netSalary || u.salary || 0;
        // [MIGRATE-GROSS-135] Le brut FABRIQUÉ ici est PERSISTÉ : une fois écrit, le moteur prend la
        // branche `users[0].grossSalary` et ne recalcule plus jamais. Un facteur plat de 1,35 y
        // gravait donc une erreur durable — MESURÉE sur le barème 2026 : +2 681 $ à 30 k$ de net
        // annuel (surestimé), mais −22 028 $ à 100 k$ et −132 196 $ à 250 k$ (sous-estimé). Le signe
        // s'inverse, donc aucun réglage du facteur ne peut marcher : c'est l'INVERSE exact qu'il
        // faut. `calculateGrossFromNet` le donne par dichotomie, à moins de 1 $ près (vérifié).
        // ⚠️ UNITÉS : `netSalary`/`grossSalary` sont MENSUELS dans le store, `calculateGrossFromNet`
        // prend et rend de l'ANNUEL — d'où le ×12 puis le /12.
        const gross = u.grossSalary || (net > 0 ? calculateGrossFromNet(net * 12, new Date().getFullYear()) / 12 : 0);
        return {
            ...u,
            netSalary: net,
            grossSalary: Math.round(gross)
        };
    });
    return { ...config, users: newUsers };
};

// Défauts purs de l'app (toutes les tranches vides/par défaut). SOURCE UNIQUE réutilisée par
// l'init ET par le chargement d'un persona de test (base propre anti-fuite — cf personaResetBase).
const DEFAULT_APP_STATE: AppState = {
    transactions: [],
    assets: [],
    investmentTransactions: [],
    investmentAccounts: [],
    budgetItems: INITIAL_BUDGET,
    config: INITIAL_CONFIG,
    projection: INITIAL_PROJECTION,
    realEstateGoals: [INITIAL_REAL_ESTATE_GOAL],
    childGoal: INITIAL_CHILD_GOAL,
    childGoals: [INITIAL_CHILD_GOAL],
    debts: [],
    travelGoals: [],
    lifeEvents: [],
    retirementGoal: { targetAge: 65, targetMonthlyIncome: 4000, governmentPension: 1200 },
    financialGoals: [],
    initialBalances: {},
    apiKeys: { anthropic: '', finnhub: '' },
    fxRates: DEFAULT_FX_RATES,
    fxRatesEstimated: true, // [FX-FALLBACK-SILENCIEUX] DEFAULT_FX_RATES est un repli en dur.
    lastUpdate: Date.now(),
    categorizationRules: [],
    aiConversation: [],
    // [B2-CHAT-HISTORY] Multi-conversations (additif, persisté via partialize allow-all — sync Drive).
    aiConversations: [],
    activeAiConversationId: null,
    // [B3+B4] Modèle par conversation + coût API cumulé à vie (additifs, persistés/synchronisés).
    aiChatModel: DEFAULT_AI_CHAT_MODEL,
    aiChatCostUsdTotal: 0,
    // W5.x — Nouveaux containers (vide par défaut)
    insurancePolicies: [],
    rentalProperties: [],
    privateBusinesses: [],
    vehicleReplacements: [],
    majorRenovations: [],
    charitableGoals: [],
    documents: [],
    // [FINTABLE-3, finding sécurité panel PR #531] Présent EXPLICITEMENT (pas omis) pour que
    // `personaResetBase()` (dérivé de ce littéral) le remette à `undefined` à CHAQUE entrée en mode
    // démo persona — sinon le rapport RÉEL (comptes/dettes/dates de Marc) traverserait le spread de
    // `enableTestMode` intact (un objet qui n'a pas une clé ne la réinitialise pas). Même classe que
    // PERSONA-PURGE : « zéro fuite inter-persona ».
    // [TX-REVIEW] Champ ADDITIF déclaré EXPLICITEMENT ici : `personaResetBase()` dérive de
    // DEFAULT_APP_STATE, et spreader un objet SANS une clé ne réinitialise pas cette clé — la vraie
    // revue de Marc traverserait alors le mode démo (extension de PERSONA-PURGE).
    categoryReview: undefined,
    fintableSyncReport: undefined,
    // [FINTABLE-6] MÊME raison que ci-dessus : soldes RÉELS des comptes de placement de Marc — la
    // donnée la plus sensible du lot. Présent explicitement pour être purgé au switch de persona.
    fintableBrokerBalances: undefined,
    // [FINTABLE-7] Rôles assignés depuis Réglages. Présent explicitement (même raison) : la liste
    // des comptes réels de Marc n'a rien à faire dans une démo persona.
    fintableRoles: undefined,
};

// Base PROPRE pour charger un persona de test : toutes les tranches de DONNÉES remises aux défauts
// vides, SAUF apiKeys (credentials), fxRates (données de marché) et lastUpdate — gardées telles
// quelles. Garantit qu'AUCUNE donnée du persona précédent (ni des vraies données) ne subsiste quand
// le nouveau persona ne définit pas une tranche (fix « des données qui restent au switch de profil »).
export const personaResetBase = (): Partial<AppState> => {
    const { apiKeys: _ak, fxRates: _fx, lastUpdate: _lu, ...data } = DEFAULT_APP_STATE;
    void _ak; void _fx; void _lu;
    // structuredClone : copies FRAÎCHES des tranches (arrays/objets) à chaque chargement de persona.
    // Sinon le state pointerait sur les mêmes références que DEFAULT_APP_STATE/initialState, et une
    // mutation en place en aval corromprait silencieusement les défauts globaux partagés.
    return structuredClone(data);
};

export const getInitialStateWithMigration = (): AppState => {
    const defaultState: AppState = { ...DEFAULT_APP_STATE, lastUpdate: Date.now() };

    if (typeof window === 'undefined') return defaultState;

    // [ASSISTANT-HUB, finding sécurité #492 + code-reviewer 2bis] Cache de l'ancien widget
    // « Prochaine action » (conseils IA dérivés du patrimoine = PII, Loi 25) : le widget est retiré,
    // plus aucun code ne purgeait cette clé. Purge INCONDITIONNELLE — quiconque a cette clé a
    // forcément `financeai-storage` (le widget lisait le store hydraté), donc une purge placée dans
    // le bloc legacy ci-dessous (early-return si financeai-storage existe) ne s'exécuterait JAMAIS
    // pour la population concernée (code mort — 1er jet du fix, réfuté par le panel).
    try { localStorage.removeItem('nba:cache:v1'); } catch { /* localStorage indispo */ }

    // CONSOLIDATION persistance (2026-05-25) : `financeai-storage` (Zustand persist)
    // est LA source de vérité. S'il existe, persist hydrate les vraies données
    // juste après → inutile (et risqué) de relire ~25 clés legacy `app_*` à chaque
    // boot. Cette 2e source/migration parallèle était la dette #1 (corruption
    // silencieuse possible + parse synchrone bloquant au boot). La lecture legacy
    // ci-dessous ne sert donc plus qu'à l'IMPORT UNIQUE des utilisateurs d'avant
    // l'ère persist (aucune perte : financeai-storage contient toutes les données
    // persistables ; les clés API vivent dans secureKeyStore).
    try {
        if (localStorage.getItem('financeai-storage') !== null) return defaultState;
    } catch { /* localStorage inaccessible : on tente la lecture legacy quand même */ }

    try {
        const savedApiKeysStr = localStorage.getItem('app_api_keys');
        // Phase 4 A5: Gemini retiré — pas de migration depuis l'ancienne clé.
        // L'utilisateur doit fournir une clé Anthropic Claude.
        let safeApiKeys: { anthropic: string; finnhub: string } = {
            anthropic: '',
            finnhub: '',
        };
        if (savedApiKeysStr) {
            // SECURITY (audit C5 2026-05-21, révisé 2026-05-25) : la clef legacy
            // `app_api_keys` stockait les clefs API EN CLAIR (exfiltrable via XSS
            // ou extension). On la lit une dernière fois pour ne rien perdre,
            // puis on la SUPPRIME du localStorage.
            //
            // Les clefs ne sont JAMAIS persistées en clair : exclues du persist
            // Zustand via partialize. Elles sont désormais persistées CHIFFRÉES
            // (AES-256-GCM, clef non-extractible en IndexedDB) via
            // services/secureKeyStore, et ré-hydratées en async au boot par
            // App.tsx. Ici, en synchrone, elles ne sont qu'en mémoire le temps
            // que l'hydratation chiffrée prenne le relais.
            try {
                const parsed = JSON.parse(savedApiKeysStr);
                safeApiKeys = {
                    anthropic: parsed.anthropic || '',
                    finnhub: parsed.finnhub || '',
                };
            } catch { /* parse error, ignorer */ }
            try { localStorage.removeItem('app_api_keys'); } catch { /* quota / privacy */ }
        }

        const savedTransactions = localStorage.getItem('cached_transactions');
        const savedBalances = localStorage.getItem('initial_balances');
        const savedConfig = localStorage.getItem('app_config');
        const savedBudget = localStorage.getItem('app_budget');
        const savedAssets = localStorage.getItem('app_assets');
        const savedProjection = localStorage.getItem('app_projection');
        const savedInvTx = localStorage.getItem('app_investment_tx');
        const savedInvAcc = localStorage.getItem('app_investment_acc');
        const savedRealEstate = localStorage.getItem('app_real_estate_goal');
        const savedRealEstateArray = localStorage.getItem('app_real_estate_goals');
        const savedChildGoal = localStorage.getItem('app_child_goal');
        const savedDebts = localStorage.getItem('app_debts');
        const savedTravelGoals = localStorage.getItem('app_travel_goals');
        const savedLifeEvents = localStorage.getItem('app_life_events');
        const savedRetirementGoal = localStorage.getItem('app_retirement_goal');
        const savedFinancialGoals = localStorage.getItem('app_financial_goals');
        const storedFxRates = localStorage.getItem('fx_rates_cache');

        let budgetItems = savedBudget ? JSON.parse(savedBudget) : INITIAL_BUDGET;
        budgetItems = migrateBudgetItems(budgetItems);

        let config = savedConfig ? JSON.parse(savedConfig) : INITIAL_CONFIG;
        config = migrateUserConfig(config);

        let finGoals = savedFinancialGoals ? JSON.parse(savedFinancialGoals) : [];
        finGoals = finGoals.map((g: FinancialGoal) => ({ ...g, status: g.status || 'active' }));

        let realEstateGoals: RealEstateGoal[];
        if (savedRealEstateArray) {
            realEstateGoals = JSON.parse(savedRealEstateArray);
        } else if (savedRealEstate) {
            const single = JSON.parse(savedRealEstate);
            realEstateGoals = [{ ...single, id: single.id || 'main_property', isPrimaryResidence: single.isPrimaryResidence ?? true }];
        } else {
            realEstateGoals = [INITIAL_REAL_ESTATE_GOAL];
        }

        return {
            transactions: savedTransactions ? JSON.parse(savedTransactions) : [],
            assets: savedAssets ? JSON.parse(savedAssets) : [],
            investmentTransactions: savedInvTx ? JSON.parse(savedInvTx) : [],
            investmentAccounts: savedInvAcc ? JSON.parse(savedInvAcc) : [],
            budgetItems: budgetItems,
            config: config,
            projection: savedProjection ? JSON.parse(savedProjection) : INITIAL_PROJECTION,
            realEstateGoals: realEstateGoals,
            childGoal: savedChildGoal ? JSON.parse(savedChildGoal) : INITIAL_CHILD_GOAL,
            childGoals: savedChildGoal ? [JSON.parse(savedChildGoal)] : [INITIAL_CHILD_GOAL],
            // [PH4D-WEIGHTS-STORE] poids santé migrés de l'ancienne clé localStorage vers le store persisté
            // (lecture one-shot ; ensuite ils vivent dans `financeai-storage` via partialize allow-all).
            healthWeights: loadLegacyHealthWeights(),
            // [PH4-F] abonnements épinglés (additif) : défaut [] ; persistés via partialize allow-all.
            // Pas de bump v7→v8 — rien à migrer (les abos n'étaient jamais stockés, seulement détectés).
            subscriptions: [],
            debts: savedDebts ? JSON.parse(savedDebts) : [],
            travelGoals: savedTravelGoals ? JSON.parse(savedTravelGoals) : [],
            lifeEvents: savedLifeEvents ? JSON.parse(savedLifeEvents) : [],
            retirementGoal: savedRetirementGoal ? JSON.parse(savedRetirementGoal) : { targetAge: 65, targetMonthlyIncome: 4000, governmentPension: 1200 },
            financialGoals: finGoals,
            initialBalances: savedBalances ? JSON.parse(savedBalances) : {},
            apiKeys: safeApiKeys,
            fxRates: storedFxRates ? JSON.parse(storedFxRates) : DEFAULT_FX_RATES,
            // [FX-FALLBACK-SILENCIEUX] Cette migration LEGACY (pré-persist Zustand) n'a aucune
            // source pour ce nouveau champ — `true` est le même défaut neutre que DEFAULT_APP_STATE.
            fxRatesEstimated: true,
            lastUpdate: Date.now(),
            categorizationRules: (() => { try { const r = localStorage.getItem('categorization_rules'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
            aiConversation: [],
            aiConversations: [],
            activeAiConversationId: null,
            aiChatModel: DEFAULT_AI_CHAT_MODEL,
            aiChatCostUsdTotal: 0,
            // FIX agents (HIGH code-reviewer): defaults manquants dans le retour de migration
            insurancePolicies: (() => { try { const r = localStorage.getItem('app_insurance_policies'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
            rentalProperties: (() => { try { const r = localStorage.getItem('app_rental_properties'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
            privateBusinesses: (() => { try { const r = localStorage.getItem('app_private_businesses'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
            vehicleReplacements: (() => { try { const r = localStorage.getItem('app_vehicle_replacements'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
            majorRenovations: (() => { try { const r = localStorage.getItem('app_major_renovations'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
            charitableGoals: (() => { try { const r = localStorage.getItem('app_charitable_goals'); return r ? JSON.parse(r) : []; } catch (e) { logError({ source: 'storage', severity: 'warning', message: 'Migration store : parse localStorage échoué (champ ignoré, défaut appliqué)', error: e }); return []; } })(),
            // [Dérive attrapée par tests/aiTools/registryParity 2026-07-21] `documents` MANQUAIT du
            // littéral legacy (même classe que le « FIX agents : defaults manquants » ci-dessus) →
            // state.documents undefined au 1er boot sans financeai-storage. Jamais stocké en legacy → [].
            documents: [],
        };
    } catch (e) {
        const errorStr = String(e);
        logError({ source: 'storage', severity: 'critical', message: "Migration de l'état échouée — retour à un état par défaut (données possiblement non chargées)", error: e });
        let backupKey: string | null = null;
        try {
            const corruptedDump: Record<string, string | null> = {};
            const watchedPrefixes = ['app_', 'cached_', 'financeai-', 'fx_rates_', 'categorization_', 'initial_', 'lm_', 'gemini_'];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                // On exclut le blob de clés chiffrées du dump de crash (sécurité H1) :
                // pas besoin de l'élargir à une 2e clef localStorage.
                if (key && key !== 'app_api_keys_enc' && key !== 'app_api_keys' && watchedPrefixes.some(p => key.startsWith(p))) {
                    corruptedDump[key] = localStorage.getItem(key);
                }
            }
            backupKey = `__financeai_backup_${Date.now()}`;
            localStorage.setItem(backupKey, JSON.stringify({ error: errorStr, dump: corruptedDump }));
            console.warn(`[FinanceAI] Backup sauvegarde sous ${backupKey}`);
        } catch (backupErr) {
            logError({ source: 'storage', severity: 'error', message: 'Échec de la sauvegarde du dump de migration corrompu', error: backupErr });
            backupKey = null;
        }
        _migrationStatus = { failed: true, backupKey, error: errorStr };
        return defaultState;
    }
};

const initialState: AppState = getInitialStateWithMigration();

/** Type de migration : union de l'état courant + champs legacy des versions précédentes. */
type MigratingState = Partial<FinanceState> & {
    apiKeys?: { gemini?: string; anthropic?: string; finnhub?: string };
    retirementGoal?: Partial<FinanceState['retirementGoal']> & { lifeExpectancy?: number };
    assets?: unknown[];
    isTestMode?: boolean;
    realDataSnapshot?: Partial<AppState> | null;
    activeTestPersonaId?: string | null;
};

/**
 * Migrations du state persisté (`financeai-storage`). Extrait du `persist()` pour être testable
 * unitairement (cf tests/store/migratePersistedState.test.ts). Chaque palier est chaîné : un vieux
 * blob v3 traverse v3→v4→…→v7. Sans ça, toute évolution de la forme du state casse silencieusement
 * le boot des utilisateurs existants.
 */
export function migratePersistedState(persistedState: unknown, fromVersion: number): unknown {
    // [STORE-REHYDRATE-SILENT, audit 2026-07-16] Un palier qui LÈVE (blob inattendu/corrompu) doit être
    // DIAGNOSTICABLE : on trace le palier fautif puis on RELANCE — l'erreur remonte à `onRehydrateStorage`
    // (le filet, cf config persist) qui journalise en critique + lève la bannière. Ne JAMAIS avaler ici :
    // continuer sur un blob à moitié migré serait pire que l'état initial.
    let palier = 'init';
    try {
        return migratePersistedStateUnsafe(persistedState, fromVersion, (p) => { palier = p; });
    } catch (e) {
        logError({
            source: 'storage', severity: 'critical',
            message: `Migration du state persisté ÉCHOUÉE au palier « ${palier} » (v${fromVersion}→v7) — réhydratation abandonnée.`,
            error: e instanceof Error ? e : new Error(String(e)),
        });
        throw e;
    }
}

function migratePersistedStateUnsafe(
    persistedState: unknown,
    fromVersion: number,
    step: (palier: string) => void,
): unknown {
    let state = persistedState as MigratingState;
    // v0/undefined → v1 : intro versioning
    step('v0→v1');
    if (fromVersion === undefined || fromVersion < 1) {
        state = state as MigratingState;
    }
    // v1 → v2 : Phase 4 A1 — ajout apiKeys.anthropic (gemini gardé).
    // v2 → v3 : Phase 4 A5 — suppression de apiKeys.gemini (pas de copie vers anthropic, formats ≠).
    step('v2→v3 (apiKeys)');
    if (fromVersion < 3 && state?.apiKeys) {
        const apiKeys = state.apiKeys;
        state = { ...state, apiKeys: { anthropic: apiKeys.anthropic || '' } } as MigratingState;
    }
    // v3 → v4 : §7.F.5 — ajout apiKeys.finnhub pour le data sourcing marketData (default vide).
    step('v3→v4 (finnhub)');
    if (fromVersion < 4 && state?.apiKeys) {
        const apiKeys = state.apiKeys;
        state = {
            ...state,
            apiKeys: { anthropic: apiKeys.anthropic || '', finnhub: apiKeys.finnhub || '' },
        } as MigratingState;
    }
    // v4 → v5 : Phase C.3 — `lifeExpectancy` migré du state local Retirement.tsx vers
    //   retirementGoal global (default 90).
    step('v4→v5 (lifeExpectancy)');
    if (fromVersion < 5 && state?.retirementGoal) {
        const rg = state.retirementGoal;
        if (rg.lifeExpectancy === undefined) {
            state = { ...state, retirementGoal: { ...rg, lifeExpectancy: 90 } } as MigratingState;
        }
    }
    // v5 → v6 : Phase E.8 — DCA multi-achat (dateBought+buyPrice+quantity → purchases[]).
    //   Les champs legacy restent pour rétrocompat.
    step('v5→v6 (purchases DCA)');
    if (fromVersion < 6 && Array.isArray(state?.assets)) {
        type LegacyAsset = { dateBought?: string; buyPrice?: number; quantity?: number; purchases?: unknown };
        state = {
            ...state,
            assets: (state.assets as LegacyAsset[]).map((a: LegacyAsset) => {
                if (Array.isArray(a.purchases) && a.purchases.length > 0) return a;
                if (a.dateBought && typeof a.buyPrice === 'number' && a.buyPrice > 0 && a.quantity && a.quantity > 0) {
                    return { ...a, purchases: [{ date: a.dateBought, quantity: a.quantity, price: a.buyPrice }] };
                }
                return a;
            }),
        } as MigratingState;
    }
    // v6 → v7 : le MODE TEST ne doit JAMAIS être persisté (bug 2026-05-29 : l'auto-push Drive
    //   envoyait des données persona et écrasait la vraie sauvegarde). Si un blob a été figé en
    //   mode test, on restaure les vraies données depuis realDataSnapshot, puis on purge les
    //   champs de test (ils ne seront plus jamais réécrits — cf partialize).
    step('v6→v7 (purge mode test)');
    if (fromVersion < 7) {
        if (state?.isTestMode && state.realDataSnapshot) {
            state = { ...state, ...state.realDataSnapshot } as MigratingState;
        }
        const cleaned = { ...(state as Record<string, unknown>) };
        delete cleaned.isTestMode;
        delete cleaned.realDataSnapshot;
        delete cleaned.activeTestPersonaId;
        state = cleaned as MigratingState;
    }
    return state;
}

export const useFinanceStore = create<FinanceState>()(
    persist(
        (set, get) => ({
            ...initialState,
            // [REFONTE-NAV Lot 1] L'app s'ouvre sur la courbe Future (l'Accueil est retiré —
            // GO Marc 2026-08-12). activeTab n'est pas persisté : ce défaut vaut à chaque boot.
            activeTab: Tab.FUTURE,
            isPrivacyMode: false,
            lastProjection: null,
            projectionRunMC: true,
            projectionStatus: 'idle',
            lockedProjection: null,
            isProjectionLocked: false,
            revealedProjectionSig: null,
            pendingFocus: null,
            isTestMode: false,
            realDataSnapshot: null,
            activeTestPersonaId: null,

            // Navigation : on synchronise window.location.hash AVANT le set.
            // Sinon l'effet applyHash (App.tsx, deps [activeTab]) se relance au
            // changement d'activeTab, lit le hash resté périmé et revert vers
            // l'onglet courant → les boutons navigateWithFocus semblent « morts ».
            // Cf. BACKLOG G1 (2026-05-22).
            setActiveTab: (tab) => {
                if (typeof window !== 'undefined' && window.location.hash.replace('#', '') !== tab) {
                    window.location.hash = tab;
                }
                set({ activeTab: tab });
            },
            setPrivacyMode: (v) => set({ isPrivacyMode: v }),
            togglePrivacyMode: () => set((prev) => ({ isPrivacyMode: !prev.isPrivacyMode })),
            setAppState: (state) => set((prev) => ({ ...prev, ...state })),
            setLastProjection: (r) => set({ lastProjection: r }),
            setProjectionRunMC: (v) => set({ projectionRunMC: v }),
            setProjectionStatus: (s) => set({ projectionStatus: s }),
            // PH2-d — verrou : état sync (source de vérité = Zustand) + persistance IndexedDB best-effort.
            // Fire-and-forget VOULU : le set d'UI ne doit pas attendre une écriture disque, et une écriture
            // ratée n'invalide pas le verrou en mémoire (l'IDB n'est qu'un cache de RESTAURATION au reload).
            // Le module logue ses propres échecs et ne lève jamais.
            lockProjection: (r) => { set({ lockedProjection: r, isProjectionLocked: true }); void saveLockedProjection(r); },
            unlockProjection: () => { set({ lockedProjection: null, isProjectionLocked: false }); void clearLockedProjection(); },
            // Boot uniquement : pose le blob restauré depuis l'IDB (réconcilie le booléen persisté
            // avec le contenu réel — si l'IDB est vide/illisible, r=null → on retombe déverrouillé).
            setLockedProjection: (r) => set({ lockedProjection: r, isProjectionLocked: r !== null }),
            setRevealedProjectionSig: (sig) => set({ revealedProjectionSig: sig }),
            navigateWithFocus: (tab, section) => {
                if (typeof window !== 'undefined' && window.location.hash.replace('#', '') !== tab) {
                    window.location.hash = tab;
                }
                set({
                    activeTab: tab,
                    pendingFocus: { tab, section: section ?? null, expiresAt: Date.now() + 5000 },
                });
            },
            clearPendingFocus: () => set({ pendingFocus: null }),
            updateFxRates: ({ estimated, ...rates }) => set((prev) => ({
                // [FX-FALLBACK-SILENCIEUX] `estimated` vit SIBLING de fxRates (jamais dans l'objet
                // lui-même — il resterait un Record<string, number> pour ses ~13 consommateurs).
                fxRates: { ...prev.fxRates, ...rates },
                fxRatesEstimated: estimated ?? prev.fxRatesEstimated,
            })),
            updateApiKeys: (keys) => set((prev) => ({
                apiKeys: { ...prev.apiKeys, ...keys }
            })),
            updateLastUpdate: () => set({ lastUpdate: Date.now() }),
            // `set` fait un merge superficiel et `initialState` (AppState) ne contient PAS les flags
            // propres au store (isTestMode/realDataSnapshot/activeTestPersonaId) → on les remet
            // explicitement, sinon un reset déclenché EN mode test n'en sortirait jamais (bannière figée).
            resetState: () => set({ ...initialState, isTestMode: false, realDataSnapshot: null, activeTestPersonaId: null }),

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
        }),
        {
            name: 'financeai-storage',
            storage: createJSONStorage(() => quotaStorage),
            // Schema versioning: incrémenter à chaque changement non-rétrocompatible
            // de la forme du state, et ajouter une étape dans `migrate`.
            // Sans version, toute évolution casse silencieusement le boot des
            // utilisateurs existants (cf audit 2026-05 §State management).
            // NB : la persistance du MODE TEST (cf partialize : isTestMode/realDataSnapshot/
            // activeTestPersonaId) est ADDITIVE/rétrocompatible (champs en plus) → pas de bump requis.
            // Le strip <7 (cf migrate) reste pour nettoyer les blobs de l'ère buggée (≤ v6).
            version: 7,
            migrate: migratePersistedState,
            // [STORE-REHYDRATE-SILENT] Le FILET : sans ce callback, toute erreur de parse/migration est
            // JETÉE par zustand (l'app démarre vierge, zéro trace). Ici : journal CRITIQUE + statut lu par
            // App (toast « ne rien saisir, restaurer un backup ») et SystemView. On ne tente PAS de
            // réparer/écraser le blob (il reste intact dans localStorage pour diagnostic/récupération).
            onRehydrateStorage: () => (_state, error) => {
                if (!error) return;
                _hydrationStatus = { failed: true, error: String(error) };
                logError({
                    source: 'storage', severity: 'critical',
                    message: 'Réhydratation du store ÉCHOUÉE (blob financeai-storage illisible ou migration en erreur) — état par défaut chargé. Le blob est INTACT : ne rien saisir, restaurer un backup.',
                    error: error instanceof Error ? error : new Error(String(error)),
                });
            },
            partialize: (state) => {
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
                    lockedProjection: _lockedProjection,
                    pendingFocus: _pendingFocus,
                    ...persistable
                } = state;
                return persistable;
            },
        }
    )
);
