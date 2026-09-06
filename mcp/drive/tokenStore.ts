// mcp/drive/tokenStore.ts
//
// Lot 3 — stockage LOCAL des identifiants OAuth du connecteur (refresh token + client id/secret).
// Le refresh token est un secret long terme : il reste sur la machine de Marc, dans un fichier à
// permissions restreintes (0600). Emplacement par défaut : ~/.financeai-mcp/credentials.json
// (surcharge via $FINANCEAI_MCP_CREDENTIALS). On ne le met JAMAIS dans le repo ni dans Drive.

import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { promises as fs } from 'node:fs';

export interface StoredCredentials {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    scope?: string;
    email?: string;
    obtainedAt?: number;
}

/** Chemin du fichier d'identifiants (surcharge par $FINANCEAI_MCP_CREDENTIALS). */
export function credentialsPath(): string {
    return process.env.FINANCEAI_MCP_CREDENTIALS || join(homedir(), '.financeai-mcp', 'credentials.json');
}

export async function saveCredentials(creds: StoredCredentials, path: string = credentialsPath()): Promise<void> {
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, `${JSON.stringify(creds, null, 2)}\n`, { mode: 0o600 });
    // mode à la création ne suffit pas si le fichier existait déjà → chmod explicite (best-effort).
    try { await fs.chmod(path, 0o600); } catch { /* FS sans permissions POSIX (Windows) → ignoré */ }
}

export async function loadCredentials(path: string = credentialsPath()): Promise<StoredCredentials | null> {
    let raw: string;
    try {
        raw = await fs.readFile(path, 'utf8');
    } catch {
        return null; // pas encore autorisé
    }
    try {
        const c = JSON.parse(raw) as Partial<StoredCredentials>;
        if (c && c.clientId && c.clientSecret && c.refreshToken) {
            return c as StoredCredentials;
        }
        return null;
    } catch {
        return null;
    }
}

