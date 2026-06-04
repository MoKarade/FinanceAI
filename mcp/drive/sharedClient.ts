// mcp/drive/sharedClient.ts
//
// Lot 3 — client OAuth « Desktop » FinanceAI PARTAGÉ : les utilisateurs ne créent RIEN dans Google
// Cloud. Ils consentent juste avec leur propre Google (→ leur propre Drive, isolé). Le secret d'un
// client « Desktop » est non-confidentiel par design (Google le destine à être embarqué dans des apps
// installées). On ne met PAS le secret dans le repo public : il est résolu depuis l'environnement
// d'abord, sinon depuis un fichier `connector-client.json` (gitignoré, embarqué au build .mcpb).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface OAuthClient {
    clientId: string;
    clientSecret: string;
}

/**
 * Résout le client OAuth partagé. Ordre :
 *   1. variables d'env GOOGLE_DESKTOP_CLIENT_ID / GOOGLE_DESKTOP_CLIENT_SECRET ;
 *   2. fichier `mcp/drive/connector-client.json` (gitignoré ; rempli pour la distribution) ;
 *   3. null (aucun client partagé → l'utilisateur doit fournir le sien en arguments).
 */
export function resolveSharedClient(): OAuthClient | null {
    const envId = process.env.GOOGLE_DESKTOP_CLIENT_ID;
    const envSecret = process.env.GOOGLE_DESKTOP_CLIENT_SECRET;
    if (envId && envSecret) return { clientId: envId, clientSecret: envSecret };

    try {
        const here = dirname(fileURLToPath(import.meta.url));
        const raw = readFileSync(join(here, 'connector-client.json'), 'utf8');
        const c = JSON.parse(raw) as Partial<OAuthClient>;
        if (c.clientId && c.clientSecret) return { clientId: c.clientId, clientSecret: c.clientSecret };
    } catch {
        /* fichier absent → on tombera sur null (cas dev / pas encore de client partagé) */
    }
    return null;
}
