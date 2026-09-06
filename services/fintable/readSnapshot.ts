// services/fintable/readSnapshot.ts
//
// [FINTABLE Lot 1] Orchestration de LECTURE : API Fintable → `FintableSnapshot` normalisé.
// Aucune écriture, aucun effet de bord sur l'état FinanceAI — c'est le Lot 2 (mapper) qui
// transformera ce snapshot en `DocumentPayload[]` pour `applyDocument`.
//
// ⚠️ `pending: false` est FORCÉ, pas configurable (décision, pas paresse) : la doc Fintable dit
// que les suppressions sont invisibles au polling incrémental et qu'une transaction `pending` est
// REMPLACÉE (nouvel id, montant/date ajustés) quand elle se poste. Or `applyDocument` déduplique
// mais ne SUPPRIME jamais → importer une pending puis sa version postée créerait un doublon
// permanent qui fausserait le cash dérivé (`computeStartingCash`). La doc recommande explicitement
// `pending=false` pour tout miroir : on suit.

import {
    FintableError,
    type FintableAccount,
    type FintableHolding,
    type FintableSnapshot,
    type FintableTransaction,
} from './types';
import { decodeAccount, decodeHolding, decodeTransaction } from './decode';
import type { FintableClient } from './client';

/** Taille de page — le maximum documenté (500) minimise les allers-retours sur un gros historique. */
const PAGE_LIMIT = 500;

interface ReadSnapshotOptions {
    /** `YYYY-MM-DD` inclusif — borne basse des transactions. */
    dateFrom?: string;
    /** `YYYY-MM-DD` inclusif — borne haute des transactions. */
    dateTo?: string;
    /**
     * Sync INCRÉMENTALE : ne rend que ce qui a changé depuis cet instant ISO-8601, trié par
     * `updated_at` croissant. Mutuellement exclusif avec `dateFrom`/`dateTo` côté tri (le curseur
     * est lié à son ordre) → quand il est fourni, il pilote seul la requête.
     */
    updatedSince?: string;
    /** Inclure les comptes désactivés (défaut : non — ils ne synchronisent plus chez Fintable). */
    includeDisabled?: boolean;
    /** Ne pas lire les positions (dry-run rapide). */
    skipHoldings?: boolean;
    /**
     * [FINTABLE-7] Ne pas lire les transactions. Sert l'écran de CONFIGURATION (« Tester la
     * connexion » → lister les comptes pour leur assigner un rôle) : y pager tout l'historique
     * serait lent, inutile et coûteux en quota alors qu'on n'affiche que des comptes.
     */
    skipTransactions?: boolean;
}

/**
 * Lit l'état courant chez Fintable. Une panne PARTIELLE (positions d'un compte illisibles) ne fait
 * pas échouer toute la passe : elle est enregistrée dans `holdingsSkipped` avec sa raison — un skip
 * sans signal est la classe « staleness silencieuse » (cf. HIST-MULTI-PROVIDER). En revanche une
 * erreur d'AUTHENTIFICATION interrompt tout : elle vaudra pour chaque appel suivant, insister ne
 * ferait que brûler du quota.
 */
export async function readFintableSnapshot(
    client: FintableClient,
    opts: ReadSnapshotOptions = {},
): Promise<FintableSnapshot> {
    const readAt = Date.now();

    const rawAccounts = await client.get<unknown[]>('/accounts');
    if (!Array.isArray(rawAccounts.data)) {
        throw new FintableError('GET /accounts : liste attendue dans « data ».', 'MALFORMED');
    }
    const allAccounts: FintableAccount[] = rawAccounts.data.map((r, i) => decodeAccount(r, i));
    const accounts = opts.includeDisabled ? allAccounts : allAccounts.filter((a) => a.enabled);

    const holdings: FintableHolding[] = [];
    const holdingsSkipped: FintableSnapshot['holdingsSkipped'] = [];

    if (!opts.skipHoldings) {
        for (const account of accounts) {
            try {
                // La doc dit que `type` est du texte libre « à afficher, pas à interpréter » → on
                // n'essaie PAS de deviner quels comptes sont des comptes de placement : on demande
                // pour tous, et un compte sans position rend simplement une liste vide.
                const res = await client.get<unknown[]>(`/accounts/${encodeURIComponent(account.id)}/holdings`);
                if (!Array.isArray(res.data)) {
                    holdingsSkipped.push({ accountId: account.id, reason: 'réponse inattendue (liste attendue)' });
                    continue;
                }
                for (let i = 0; i < res.data.length; i++) {
                    holdings.push(decodeHolding(res.data[i], i, account.id, res.snapshotDate));
                }
            } catch (err) {
                if (err instanceof FintableError && err.code === 'AUTH') throw err;
                // 404 = ce compte n'expose pas de positions : cas NOMINAL, pas une panne.
                const reason = err instanceof FintableError
                    ? (err.code === 'NOT_FOUND' ? 'aucune position exposée par ce compte' : `${err.code} — ${err.message}`)
                    : 'erreur inattendue';
                holdingsSkipped.push({ accountId: account.id, reason });
            }
        }
    }

    if (opts.skipTransactions) {
        // Sortie ANTICIPÉE explicite : rendre un tableau vide sans appeler l'API. Ne jamais laisser
        // croire « aucune transaction chez Fintable » — c'est l'appelant qui a demandé à ne pas lire.
        return { readAt, accounts, holdings, transactions: [], holdingsSkipped };
    }

    const txQuery: Record<string, string | number | boolean | undefined> = {
        pending: false, // FORCÉ — cf. en-tête de fichier.
        limit: PAGE_LIMIT,
    };
    if (opts.updatedSince) {
        txQuery.order = 'updated';
        txQuery.updated_since = opts.updatedSince;
    } else {
        txQuery.date_from = opts.dateFrom;
        txQuery.date_to = opts.dateTo;
    }
    const rawTx = await client.getAllPages<unknown>('/transactions', txQuery);
    const transactions: FintableTransaction[] = rawTx.map((r, i) => decodeTransaction(r, i));

    return { readAt, accounts, holdings, transactions, holdingsSkipped };
}
