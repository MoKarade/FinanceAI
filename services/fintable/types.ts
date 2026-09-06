// services/fintable/types.ts
//
// [FINTABLE Lot 1] Formes de l'API Fintable V2 (telles que DOCUMENTÉES) + type NORMALISÉ
// consommé par le reste de FinanceAI.
//
// Deux niveaux, volontairement séparés (cf ADR « Sync bancaire & investissements via Fintable ») :
//   - `FtRaw*`  = ce que l'API rend, VERBATIM (montants en CHAÎNES décimales, champs nullables).
//   - `Fintable*` / `FintableSnapshot` = notre modèle normalisé (montants en `number` finis,
//     absence explicite en `null`). Le MAPPER (Lot 2) ne connaît QUE ce niveau-là → changer de
//     source (API ↔ Google Sheet) ne touche pas le mapper.
//
// Source : https://fintable.io/api/v2 — docs officielles (base URL, auth Bearer, enveloppe `data`).
// ⚠️ Conventions de l'API qui NOUS concernent directement (documentées, pas devinées) :
//   1. « Money is a string » — montants et soldes sont des chaînes décimales EXACTES, jamais des
//      flottants. Négatif = argent SORTANT.
//   2. `cost_basis` d'un holding est le coût TOTAL de la position, PAS le prix unitaire (quirk
//      provider assumé par Fintable). Notre `Asset.buyPrice` est PAR PART → ne JAMAIS mapper l'un
//      sur l'autre directement (classe FISC-RRQ-UNIT : bug d'échelle silencieux).
//   3. `Account.type` est du texte libre « provider-flavored » (`depository / checking`,
//      `investment / brokerage`) — la doc dit explicitement « display it, don't switch on it ».
//      On ne DÉDUIT donc jamais le type de compte fiscal (CELI/REER/NON-ENREG) de ce champ.
//   4. Les suppressions sont INVISIBLES en polling incrémental, et une transaction `pending` est
//      REMPLACÉE (nouvel id, montant/date ajustés) quand elle se poste → la doc recommande
//      explicitement `pending=false` pour tout miroir. C'est non négociable ici : `applyDocument`
//      déduplique mais ne supprime JAMAIS → une pending importée puis repostée = doublon À VIE.

/** Erreur standard de l'API : `{error: {type, message}}` (une seule forme pour toute l'API). */
export interface FtErrorBody {
    error?: { type?: string; message?: string; errors?: Record<string, string[]> };
}

/** `GET /accounts` — un compte bancaire/courtage dans une connexion. */
export interface FtRawAccount {
    id: string;
    connection_id: string;
    name: string;
    display_name: string | null;
    /** Texte libre provider (`depository / checking`…) — à AFFICHER, jamais à interpréter (cf. §3). */
    type: string;
    currency: string;
    /** Chaîne décimale, ou null si la banque n'en rend pas. */
    balance: string | null;
    balance_available: string | null;
    sync_start_date: string | null;
    last_tx_date: string | null;
    enabled: boolean;
    created_at?: string;
    updated_at?: string;
}

/** `GET /accounts/{id}/holdings` — une position, snapshot QUOTIDIEN (date sur l'enveloppe). */
export interface FtRawHolding {
    id: string;
    name: string;
    symbol: string | null;
    quantity: string | null;
    price: string | null;
    value: string | null;
    /** ⚠️ Coût TOTAL de la position, pas unitaire (cf. §2). */
    cost_basis: string | null;
    currency: string;
    updated_at?: string | null;
}

/** `GET /transactions` — un mouvement d'argent. */
export interface FtRawTransaction {
    id: string;
    account_id: string;
    date: string;
    datetime?: string | null;
    auth_date?: string | null;
    /** Chaîne décimale exacte ; NÉGATIF = argent sortant. */
    amount: string;
    currency: string;
    description: string;
    merchant?: string | null;
    pending: boolean;
    category?: { id: string; name: string; header: string } | null;
    category_manual_override?: boolean;
    created_at?: string;
    updated_at?: string;
}

// ─────────────────────────── Modèle NORMALISÉ (consommé par le Lot 2) ───────────────────────────

export interface FintableAccount {
    id: string;
    connectionId: string;
    /** Nom à afficher : le nom personnalisé s'il existe, sinon celui de la banque. */
    label: string;
    /** Texte libre provider, conservé pour AFFICHAGE/diagnostic uniquement. */
    rawType: string;
    currency: string;
    /** Solde courant, ou `null` si la banque n'en rend pas (jamais 0 par défaut). */
    balance: number | null;
    balanceAvailable: number | null;
    lastTxDate: string | null;
    enabled: boolean;
}

export interface FintableHolding {
    id: string;
    accountId: string;
    name: string;
    symbol: string | null;
    quantity: number | null;
    /** Prix UNITAIRE. */
    price: number | null;
    /** Valeur de marché de la position. */
    value: number | null;
    /** Coût TOTAL de la position (pas unitaire — cf. §2 en tête de fichier). */
    costBasisTotal: number | null;
    currency: string;
    /** Jour du snapshot auquel cette ligne appartient (`null` si le compte n'a aucune position). */
    snapshotDate: string | null;
}

export interface FintableTransaction {
    id: string;
    accountId: string;
    /** `YYYY-MM-DD`. */
    date: string;
    /** Négatif = argent sortant (convention conservée telle quelle). */
    amount: number;
    currency: string;
    description: string;
    merchant: string | null;
    /** Nom de la catégorie Fintable, ou `null` si non catégorisée. Le mapper décidera quoi en faire
     *  (l'allowlist de `applyDocument` reste l'arbitre — cf. MCP-CATEGORY-ALLOWLIST). */
    categoryName: string | null;
    updatedAt: string | null;
}

/** Ce que le LECTEUR produit et que le MAPPER (Lot 2) consomme — source-agnostique. */
export interface FintableSnapshot {
    /** Epoch ms de la lecture (traçabilité/fraîcheur). */
    readAt: number;
    accounts: FintableAccount[];
    holdings: FintableHolding[];
    transactions: FintableTransaction[];
    /** Comptes dont la lecture des positions a échoué — jamais silencieux (cf. HIST-MULTI-PROVIDER). */
    holdingsSkipped: Array<{ accountId: string; reason: string }>;
}

/** Code d'erreur typé — distingue le TRANSITOIRE du CONFIRMÉ (classe QUOTE-ERRKIND). */
export type FintableErrorCode =
    | 'AUTH'          // 401 — jeton absent/expiré/révoqué
    | 'FORBIDDEN'     // 403 — jeton valide, action interdite (ex. sync sur compte gratuit)
    | 'NOT_FOUND'     // 404 — objet inexistant (ou appartenant à un autre compte)
    | 'VALIDATION'    // 422 — champ invalide
    | 'CONFLICT'      // 409
    | 'RATE_LIMIT'    // 429 — respecter Retry-After
    | 'SERVER'        // 5xx — transitoire
    | 'NETWORK'       // panne réseau / timeout
    | 'MALFORMED'     // réponse 2xx dont la FORME ne correspond pas au contrat documenté
    | 'UNKNOWN';

export class FintableError extends Error {
    constructor(
        message: string,
        public readonly code: FintableErrorCode,
        /** Secondes à attendre (429 seulement), si l'en-tête Retry-After est présent. */
        public readonly retryAfterSec?: number,
    ) {
        super(message);
        this.name = 'FintableError';
    }

    /** Vaut-il la peine de re-tenter plus tard ? (le reste = problème de configuration/données) */
    get isTransient(): boolean {
        return this.code === 'RATE_LIMIT' || this.code === 'SERVER' || this.code === 'NETWORK';
    }
}

// ─────────────────── Diagnostic (Lot 1b) — pourquoi la donnée n'arrive-t-elle pas ? ───────────────────
//
// Ces formes servent au « docteur » (`npm run fintable:doctor`) : quand une lecture rend VIDE sans
// erreur — le cas rencontré le 2026-07-29, 3 comptes de placement et zéro position — la cause n'est
// pas dans les données mais dans l'ÉTAT DU COMPTE Fintable (droits du plan, santé de la connexion,
// sync jamais exécutée). Un agrégat vide sans explication est la classe « staleness silencieuse » :
// il faut pouvoir répondre « pourquoi » sans ouvrir le dashboard.

/** `GET /me` — profil et droits. `canSync: false` sur un compte gratuit = aucune sync ne tourne. */
export interface FintableProfile {
    name: string | null;
    /** `free`, `trial`, `personal`, `office`, `enterprise`. */
    tier: string;
    planPeriod: string | null;
    connectionLimit: number | null;
    connectionsUsed: number | null;
    /** ⚠️ `false` sur un compte gratuit → les syncs ne s'exécutent pas (suspect n°1 d'un vide). */
    canSync: boolean;
    expiresAt: string | null;
}

/** État d'une passe de sync (présent sur chaque connexion et dans `GET /sync`). */
export interface FintableSyncStatus {
    /** `queued`, `executing`, `finished`, `failed`, `retrying`. */
    state: string | null;
    stage: string | null;
    startedAt: string | null;
    finishedAt: string | null;
}

/** `GET /connections` — une banque liée (un login chez une institution). */
export interface FintableConnection {
    id: string;
    /** `PLAID`, `NORDIGEN`, `AKOYA`, `FINICITY`, `MERCURY`, `SNAPTRADE`… */
    provider: string;
    institutionName: string;
    /** `false` = la connexion demande de l'attention (le `statusText` dit quoi). */
    healthy: boolean;
    statusText: string;
    /** `true` = la banque exige une ré-authentification → plus rien ne se synchronise. */
    needsReconnect: boolean;
    lastSuccessfulUpdate: string | null;
    accountsCount: number | null;
    syncStatus: FintableSyncStatus | null;
}

/** Onglet d'une feuille Google configuré côté Fintable (`null` = non configuré). */
export interface FintableSheetTabs {
    accounts: string | null;
    transactions: string | null;
    /** ⚠️ `null` = l'onglet Positions n'est pas configuré côté Fintable. */
    holdings: string | null;
}

/** `GET /integrations` — destinations tableur, utile pour repérer une intégration en panne. */
export interface FintableIntegrations {
    airtable: { healthy: boolean; error: string | null; holdingsTableName: string | null } | null;
    googleSheets: Array<{
        title: string;
        healthy: boolean;
        error: string | null;
        tabs: FintableSheetTabs;
    }>;
}

/** Ce que le docteur rassemble en une passe. */
export interface FintableDiagnostics {
    readAt: number;
    profile: FintableProfile;
    connections: FintableConnection[];
    integrations: FintableIntegrations | null;
    /** Sections dont la lecture a échoué — tracées, jamais avalées (le docteur reste utile partiel). */
    failures: Array<{ section: string; reason: string }>;
}
