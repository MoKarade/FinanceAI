// mcp/auth/credentialsBackend.ts
//
// [MCP-CLOUDRUN-A] — où vit le REFRESH TOKEN Google du connecteur (le secret
// long-terme qui donne accès au blob Drive). Deux backends :
//   - FICHIER local (~/.financeai-mcp/credentials.json, 0600) — le mode
//     historique, inchangé, pour le poste de Marc ;
//   - SECRET MANAGER (Cloud Run) — via l'API REST + le token du METADATA
//     SERVER (compte de service de l'instance) : AUCUNE dépendance npm,
//     cohérent avec le flux OAuth artisanal du repo (mcp/drive/oauth.ts).
//     Jamais de token en fichier/clair sur l'instance.
//
// Sélection : $FINANCEAI_GOOGLE_SECRET (nom complet `projects/<p>/secrets/<s>`)
// → Secret Manager ; sinon fichier local. Un `save` réécrit le secret (nouvelle
// version) — requis quand Google renvoie un refresh token régénéré.

import { credentialsPath, loadCredentials, saveCredentials, type StoredCredentials } from '../drive/tokenStore';
import type { FetchLike } from '../drive/oauth';

export interface CredentialsBackend {
    /** Description humaine (logs de démarrage). */
    description: string;
    load: () => Promise<StoredCredentials | null>;
    save: (creds: StoredCredentials) => Promise<void>;
}

export function makeFileBackend(path?: string): CredentialsBackend {
    return {
        description: `fichier local (${path ?? credentialsPath()})`,
        load: () => loadCredentials(path),
        save: (creds) => saveCredentials(creds, path),
    };
}

const METADATA_TOKEN_URL =
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

/** Jeton OAuth du COMPTE DE SERVICE de l'instance (metadata server — Cloud Run/GCE seulement). */
async function metadataAccessToken(fetchFn: FetchLike): Promise<string> {
    const res = await fetchFn(METADATA_TOKEN_URL, { headers: { 'Metadata-Flavor': 'Google' } });
    if (!res.ok) {
        throw new Error(`Metadata server injoignable (${res.status}) — Secret Manager exige Cloud Run/GCE.`);
    }
    const body = await res.json() as { access_token?: string };
    if (!body.access_token) throw new Error('Metadata server : réponse sans access_token.');
    return body.access_token;
}

export function makeSecretManagerBackend(
    secretName: string,
    fetchFn: FetchLike = fetch,
): CredentialsBackend {
    const base = `https://secretmanager.googleapis.com/v1/${secretName}`;
    return {
        description: `Secret Manager (${secretName})`,
        load: async () => {
            const token = await metadataAccessToken(fetchFn);
            const res = await fetchFn(`${base}/versions/latest:access`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            // 404 = secret sans version (pas encore provisionné) → « pas autorisé », pas une panne.
            if (res.status === 404) return null;
            if (!res.ok) {
                throw new Error(`Secret Manager : lecture impossible (${res.status} ${await res.text()}).`);
            }
            const body = await res.json() as { payload?: { data?: string } };
            if (!body.payload?.data) return null;
            try {
                const parsed = JSON.parse(Buffer.from(body.payload.data, 'base64').toString('utf8')) as Partial<StoredCredentials>;
                return (parsed && parsed.clientId && parsed.clientSecret && parsed.refreshToken)
                    ? parsed as StoredCredentials
                    : null;
            } catch {
                return null;
            }
        },
        save: async (creds) => {
            const token = await metadataAccessToken(fetchFn);
            const res = await fetchFn(`${base}:addVersion`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    payload: { data: Buffer.from(JSON.stringify(creds), 'utf8').toString('base64') },
                }),
            });
            if (!res.ok) {
                throw new Error(`Secret Manager : écriture impossible (${res.status} ${await res.text()}).`);
            }
        },
    };
}

/** Backend selon l'environnement : $FINANCEAI_GOOGLE_SECRET → Secret Manager, sinon fichier local. */
export function resolveCredentialsBackend(env: NodeJS.ProcessEnv = process.env): CredentialsBackend {
    const secretName = env.FINANCEAI_GOOGLE_SECRET;
    if (secretName) return makeSecretManagerBackend(secretName);
    return makeFileBackend();
}
