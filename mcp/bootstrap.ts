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

export const MCP_SERVER_VERSION = '0.7.3';

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
