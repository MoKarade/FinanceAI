// mcp/bootstrap.ts
//
// [MCP-CLOUDRUN-HTTP] — résolution PARTAGÉE de la source d'état, extraite de
// stdio.ts pour être réutilisée par l'entrée HTTP (mcp/http.ts). Ordre inchangé :
//   1. Google Drive (auto-sync) si le connecteur a été autorisé (npm run mcp:auth),
//   2. sinon un FICHIER local : chemin explicite, sinon $FINANCEAI_STATE_FILE.
// Absente => les tools data-aware/d'écriture répondent une erreur claire.

import { resolveDefaultStateSource, type StateSource } from './state/loadAppState';
import { makeStateStore, type StateStore } from './state/stateStore';
import { loadCredentials } from './drive/tokenStore';
import { DriveStateSource } from './drive/driveStateSource';
import { makeDriveTokenProvider } from './drive/tokenProvider';

export const MCP_SERVER_VERSION = '0.5.0';

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

/** Résout la source d'état (Drive autorisé > fichier local) et fabrique le store. */
export async function resolveState(explicitPath?: string): Promise<ResolvedState> {
    const driveCreds = await loadCredentials();
    const source: StateSource | null = driveCreds
        ? new DriveStateSource(makeDriveTokenProvider())
        : resolveDefaultStateSource(explicitPath);
    const store = makeStateStore(source);
    const driveEmail = driveCreds?.email ?? null;
    const describe = (): string => {
        if (driveCreds) return `Google Drive (auto-sync)${driveEmail ? ` — ${driveEmail}` : ''}`;
        if (source) return source.description;
        return "aucune source d'état";
    };
    return { source, store, isDrive: Boolean(driveCreds), driveEmail, describe };
}
