// services/fintable/readDiagnostics.ts
//
// [FINTABLE Lot 1b] Docteur : POURQUOI la donnée n'arrive-t-elle pas ?
//
// Motivation (incident réel 2026-07-29) : le dry-run a rendu 3 comptes de placement et **zéro
// position**, sans la moindre erreur — les appels `/accounts/{id}/holdings` ont réussi et rendu des
// listes vides. Un agrégat vide sans explication est la classe « staleness silencieuse » : la cause
// n'est pas dans les données mais dans l'ÉTAT DU COMPTE Fintable. Ce module lit les endpoints qui
// répondent à « pourquoi » — droits du plan (`/me`), santé des connexions (`/connections`),
// destinations tableur (`/integrations`) — pour éviter d'avoir à ouvrir le dashboard.
//
// Lecture seule, et TOLÉRANT AUX PANNES PARTIELLES : une section illisible est enregistrée dans
// `failures` plutôt que de faire échouer tout le diagnostic (un docteur qui refuse de parler quand
// une pièce manque est inutile pile quand on en a besoin). Seule exception : `AUTH`, qui invalide
// tout le reste.

import {
    FintableError,
    type FintableConnection,
    type FintableDiagnostics,
    type FintableIntegrations,
    type FintableProfile,
    type FintableSyncStatus,
} from './types';
import type { FintableClient } from './client';

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
    return typeof v === 'string' && v !== '' ? v : null;
}

function num(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function decodeSyncStatus(v: unknown): FintableSyncStatus | null {
    if (!isRecord(v)) return null;
    return {
        state: str(v.state),
        stage: str(v.stage),
        startedAt: str(v.started_at),
        finishedAt: str(v.finished_at),
    };
}

export function decodeProfile(raw: unknown): FintableProfile {
    if (!isRecord(raw)) {
        throw new FintableError('GET /me : objet attendu.', 'MALFORMED');
    }
    return {
        name: str(raw.name),
        tier: str(raw.tier) ?? 'inconnu',
        planPeriod: str(raw.plan_period),
        connectionLimit: num(raw.connection_limit),
        connectionsUsed: num(raw.connections_used),
        // Défaut PRUDENT : en l'absence du champ on ne prétend pas que la sync fonctionne.
        canSync: raw.can_sync === true,
        expiresAt: str(raw.expires_at),
    };
}

export function decodeConnection(raw: unknown, index: number): FintableConnection {
    if (!isRecord(raw)) {
        throw new FintableError(`connections[${index}] : objet attendu.`, 'MALFORMED');
    }
    return {
        id: str(raw.id) ?? `(sans id, index ${index})`,
        provider: str(raw.provider) ?? 'inconnu',
        institutionName: str(raw.institution_name) ?? '(sans nom)',
        // Défauts PRUDENTS : une santé absente ne doit pas se lire « tout va bien ».
        healthy: raw.healthy === true,
        statusText: str(raw.status_text) ?? '(pas de statut)',
        needsReconnect: raw.needs_reconnect === true,
        lastSuccessfulUpdate: str(raw.last_successful_update),
        accountsCount: num(raw.accounts_count),
        syncStatus: decodeSyncStatus(raw.sync_status),
    };
}

export function decodeIntegrations(raw: unknown): FintableIntegrations {
    if (!isRecord(raw)) {
        throw new FintableError('GET /integrations : objet attendu.', 'MALFORMED');
    }
    const at = isRecord(raw.airtable) ? raw.airtable : null;
    const sheets = Array.isArray(raw.google_sheets) ? raw.google_sheets : [];
    return {
        airtable: at
            ? {
                healthy: at.healthy === true,
                error: str(at.error),
                holdingsTableName: str(at.holdings_table_name),
            }
            : null,
        googleSheets: sheets.filter(isRecord).map((s) => {
            const tabs = isRecord(s.tabs) ? s.tabs : {};
            const tabSheet = (k: string): string | null => {
                const t = (tabs as Record<string, unknown>)[k];
                return isRecord(t) ? str(t.sheet) : null;
            };
            return {
                title: str(s.title) ?? '(sans titre)',
                healthy: s.healthy === true,
                error: str(s.error),
                tabs: {
                    accounts: tabSheet('accounts'),
                    transactions: tabSheet('transactions'),
                    holdings: tabSheet('holdings'),
                },
            };
        }),
    };
}

/**
 * Lit l'état du compte Fintable. Chaque section est indépendante : `/me` est la seule obligatoire
 * (sans profil, aucun diagnostic n'a de sens) ; les autres dégradent proprement dans `failures`.
 */
export async function readFintableDiagnostics(client: FintableClient): Promise<FintableDiagnostics> {
    const readAt = Date.now();
    const failures: FintableDiagnostics['failures'] = [];

    const profile = decodeProfile((await client.get<unknown>('/me')).data);

    let connections: FintableConnection[] = [];
    try {
        const res = await client.get<unknown[]>('/connections');
        if (!Array.isArray(res.data)) throw new FintableError('liste attendue dans « data »', 'MALFORMED');
        connections = res.data.map((r, i) => decodeConnection(r, i));
    } catch (err) {
        if (err instanceof FintableError && err.code === 'AUTH') throw err;
        failures.push({ section: '/connections', reason: describeError(err) });
    }

    let integrations: FintableIntegrations | null = null;
    try {
        integrations = decodeIntegrations((await client.get<unknown>('/integrations')).data);
    } catch (err) {
        if (err instanceof FintableError && err.code === 'AUTH') throw err;
        failures.push({ section: '/integrations', reason: describeError(err) });
    }

    return { readAt, profile, connections, integrations, failures };
}

function describeError(err: unknown): string {
    return err instanceof FintableError ? `${err.code} — ${err.message}` : 'erreur inattendue';
}

/**
 * Traduit l'état lu en causes PROBABLES d'une absence de données, de la plus décisive à la plus
 * anodine. Fonction PURE (testable sans réseau) : c'est elle qui porte le raisonnement, pas le CLI.
 */
export function explainMissingData(diag: FintableDiagnostics): string[] {
    const out: string[] = [];

    if (!diag.profile.canSync) {
        out.push(
            `Le plan « ${diag.profile.tier} » n'autorise PAS les synchronisations (can_sync=false) — `
            + 'aucune passe ne tourne, donc positions et transactions restent figées. Cause la plus probable.',
        );
    }
    for (const c of diag.connections) {
        if (c.needsReconnect) {
            out.push(`« ${c.institutionName} » (${c.provider}) exige une RÉ-AUTHENTIFICATION — plus rien ne s'y synchronise.`);
        } else if (!c.healthy) {
            out.push(`« ${c.institutionName} » (${c.provider}) est en mauvaise santé : ${c.statusText}`);
        }
        if (c.lastSuccessfulUpdate === null) {
            out.push(`« ${c.institutionName} » n'a JAMAIS eu de sync réussie — la connexion existe mais n'a jamais rapatrié de données.`);
        }
        if (c.syncStatus?.state === 'failed') {
            out.push(`Dernière sync de « ${c.institutionName} » en ÉCHEC (étape : ${c.syncStatus.stage ?? 'inconnue'}).`);
        }
    }
    // Un compte de placement chez un provider BANCAIRE n'expose pas forcément de positions : chez
    // Fintable, le courtage/crypto passe par SnapTrade. C'est une piste, pas une certitude — d'où
    // la formulation prudente (on n'a pas le mapping compte→connexion sous la main ici).
    const providers = new Set(diag.connections.map((c) => c.provider.toUpperCase()));
    if (providers.size > 0 && !providers.has('SNAPTRADE')) {
        out.push(
            'Aucune connexion SNAPTRADE : chez Fintable, les comptes de COURTAGE et de crypto passent par '
            + `SnapTrade. Tes connexions actuelles (${[...providers].join(', ')}) sont des liens bancaires — `
            + 'un compte de placement lié ainsi peut exposer son solde sans jamais exposer ses positions.',
        );
    }
    for (const s of diag.integrations?.googleSheets ?? []) {
        if (s.tabs.holdings === null) {
            out.push(`Feuille « ${s.title} » : l'onglet Positions n'est pas configuré côté Fintable (sans effet sur l'API, mais révélateur si tu ne vois pas non plus de positions dans ta feuille).`);
        }
        if (!s.healthy) {
            out.push(`Feuille « ${s.title} » en erreur : ${s.error ?? '(raison non fournie)'}`);
        }
    }

    return out;
}
