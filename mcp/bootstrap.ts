// mcp/bootstrap.ts
//
// [MCP-CLOUDRUN-HTTP] — résolution PARTAGÉE de la source d'état, extraite de
// stdio.ts pour être réutilisée par l'entrée HTTP (mcp/http.ts). Ordre inchangé :
//   1. Google Drive (auto-sync) si le connecteur a été autorisé (npm run mcp:auth),
//   2. sinon un FICHIER local : chemin explicite, sinon $FINANCEAI_STATE_FILE.
// Absente => les tools data-aware/d'écriture répondent une erreur claire.

import { resolveDefaultStateSource, type StateSource } from './state/loadAppState';
import { makeStateStore, type StateStore } from './state/stateStore';
import { DriveStateSource } from './drive/driveStateSource';
import { makeDriveTokenProvider } from './drive/tokenProvider';
import { resolveCredentialsBackend } from './auth/credentialsBackend';

export const MCP_SERVER_VERSION = '0.11.0';

/**
 * [MCP-VERSION-FIGEE] Le COMMIT réellement déployé, et la seule chose qui distingue
 * « j'ai déployé » de « c'est déployé ».
 *
 * ⚠️ POURQUOI CE CHAMP EXISTE, écrit le jour où il a coûté un après-midi (2026-09-21) :
 * `MCP_SERVER_VERSION` n'a pas bougé depuis le 2026-07-13 alors que **351 commits** ont
 * touché le serveur. `/health` publiait donc `0.11.0` quoi qu'il arrive — une version qui
 * ne varie plus ne dit pas quel code tourne, elle donne seulement l'ILLUSION de le dire.
 * Conséquence mesurée : impossible de trancher entre « le déploiement n'a pas embarqué le
 * nouveau code » et « le consommateur regarde ailleurs », et j'ai publié deux diagnostics
 * FAUX avant que Marc ne tranche en regardant son écran.
 *
 * ⚠️ `null` est une réponse À PART ENTIÈRE et ne se remplace JAMAIS par un repli crédible
 * (ni `MCP_SERVER_VERSION`, ni `'inconnu'` déguisé en SHA) : « ce serveur ne sait pas dire
 * quel code il porte » est exactement l'information utile — c'est l'état d'AVANT ce lot, et
 * il doit rester reconnaissable. `no-fake-data` appliqué à la télémétrie.
 *
 * Posé par `mcp/deploy.sh` (`--set-env-vars FINANCEAI_BUILD_SHA=$(git rev-parse HEAD)`).
 */
export const buildSha = (env: NodeJS.ProcessEnv = process.env): string | null => {
    const brut = (env.FINANCEAI_BUILD_SHA ?? '').trim();
    // Un SHA git complet : 40 hexadécimaux. Tout le reste (chaîne vide, placeholder d'un
    // déploiement manuel, valeur tronquée) est refusé plutôt que republié — un identifiant
    // de build faux est pire qu'absent, il ferait CROIRE qu'on sait.
    return /^[0-9a-f]{40}$/.test(brut) ? brut : null;
};

export interface ResolvedState {
    source: StateSource | null;
    store: StateStore;
    /** true si la source est Google Drive (connecteur autorisé). */
    isDrive: boolean;
    /** Renseigné si la source est Google Drive (compte autorisé). */
    driveEmail: string | null;
    /** Description humaine de la source (pour les logs de démarrage). */
    describe: () => string;
}

/** Résout la source d'état (Drive autorisé > fichier local) et fabrique le store.
 *  [MCP-CLOUDRUN-A] les identifiants Drive viennent d'un BACKEND : fichier local
 *  par défaut, Secret Manager si $FINANCEAI_GOOGLE_SECRET est défini (Cloud Run). */
export async function resolveState(explicitPath?: string): Promise<ResolvedState> {
    const backend = resolveCredentialsBackend();
    const driveCreds = await backend.load();
    const source: StateSource | null = driveCreds
        ? new DriveStateSource(makeDriveTokenProvider({ backend }))
        : resolveDefaultStateSource(explicitPath);
    const store = makeStateStore(source);
    const driveEmail = driveCreds?.email ?? null;
    const describe = (): string => {
        // [MCP-CLOUDRUN-DEPLOY-LOGS] jamais l'email complet dans les logs (condition pré-Cloud Run) :
        // seul le domaine est montré (assez pour reconnaître SON compte, rien d'identifiant en clair).
        const emailHint = driveEmail?.includes('@') ? ` — …@${driveEmail.split('@')[1]}` : '';
        if (driveCreds) return `Google Drive (auto-sync)${emailHint} [${backend.description}]`;
        if (source) return source.description;
        return "aucune source d'état";
    };
    return { source, store, isDrive: Boolean(driveCreds), driveEmail, describe };
}
