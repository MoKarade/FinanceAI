// services/fintable/decode.ts
//
// [FINTABLE Lot 1] Décodage STRICT des réponses de l'API Fintable vers notre modèle normalisé.
//
// Pourquoi des décodeurs écrits à la main plutôt qu'un schéma Zod : ce chemin est money-critical et
// l'erreur doit NOMMER le champ fautif (`transactions[12].amount`) pour être diagnosticable depuis
// un cron serveur. Un `.parse()` qui jette « invalid input » sur un payload de 500 transactions
// n'aide personne à 3 h du matin.
//
// Règle non négociable (classe NAN-INPUT-HARDENING) : une valeur monétaire NON FINIE ne devient
// JAMAIS 0 en silence. Soit elle est ABSENTE et vaut `null` (absence honnête), soit elle est
// présente-mais-illisible et c'est une `FintableError('MALFORMED')` — pas un chiffre fabriqué.

import {
    FintableError,
    type FintableAccount,
    type FintableHolding,
    type FintableTransaction,
    type FtRawAccount,
    type FtRawHolding,
    type FtRawTransaction,
} from './types';

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Montant OBLIGATOIRE (« Money is a string » — chaîne décimale exacte).
 * ⚠️ `Number('')` vaut 0 et `Number(null)` vaut 0 : on refuse donc explicitement tout ce qui n'est
 * pas une chaîne non vide AVANT la conversion, sinon un champ vide deviendrait un montant de 0 $.
 */
export function parseMoneyRequired(value: unknown, field: string): number {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new FintableError(
            `Champ « ${field} » : montant attendu sous forme de chaîne décimale, reçu ${describe(value)}.`,
            'MALFORMED',
        );
    }
    const n = Number(value);
    if (!Number.isFinite(n)) {
        throw new FintableError(
            `Champ « ${field} » : montant illisible (non fini) — la valeur brute n'est pas un décimal.`,
            'MALFORMED',
        );
    }
    return n;
}

/** Montant OPTIONNEL : `null`/`undefined` → `null` (absence honnête, jamais 0). */
export function parseMoneyOptional(value: unknown, field: string): number | null {
    if (value === null || value === undefined) return null;
    return parseMoneyRequired(value, field);
}

function requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value === '') {
        throw new FintableError(
            `Champ « ${field} » : chaîne non vide attendue, reçu ${describe(value)}.`,
            'MALFORMED',
        );
    }
    return value;
}

function optionalString(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

/** Ne révèle JAMAIS la valeur elle-même (un montant/description est une donnée privée). */
function describe(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'un tableau';
    return `un ${typeof value}`;
}

/** `YYYY-MM-DD` strict — un format inattendu fausserait tout le rapprochement par date. */
function requireDate(value: unknown, field: string): string {
    const s = requireString(value, field);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        throw new FintableError(
            `Champ « ${field} » : date au format YYYY-MM-DD attendue.`,
            'MALFORMED',
        );
    }
    return s;
}

export function decodeAccount(raw: unknown, index: number): FintableAccount {
    if (!isRecord(raw)) {
        throw new FintableError(`accounts[${index}] : objet attendu, reçu ${describe(raw)}.`, 'MALFORMED');
    }
    const a = raw as unknown as FtRawAccount;
    const display = optionalString(a.display_name);
    return {
        id: requireString(a.id, `accounts[${index}].id`),
        connectionId: requireString(a.connection_id, `accounts[${index}].connection_id`),
        // Le nom personnalisé prime — c'est celui que Marc voit dans ses feuilles.
        label: display ?? requireString(a.name, `accounts[${index}].name`),
        rawType: typeof a.type === 'string' ? a.type : '',
        currency: requireString(a.currency, `accounts[${index}].currency`),
        balance: parseMoneyOptional(a.balance, `accounts[${index}].balance`),
        balanceAvailable: parseMoneyOptional(a.balance_available, `accounts[${index}].balance_available`),
        lastTxDate: optionalString(a.last_tx_date),
        // `enabled` absent → on considère le compte ACTIF (défaut sûr : on préfère lire un compte
        // de trop que d'en manquer un en silence ; le filtrage explicite se fait chez l'appelant).
        enabled: a.enabled !== false,
    };
}

export function decodeHolding(
    raw: unknown,
    index: number,
    accountId: string,
    snapshotDate: string | null,
): FintableHolding {
    if (!isRecord(raw)) {
        throw new FintableError(`holdings[${index}] : objet attendu, reçu ${describe(raw)}.`, 'MALFORMED');
    }
    const h = raw as unknown as FtRawHolding;
    return {
        id: requireString(h.id, `holdings[${index}].id`),
        accountId,
        name: requireString(h.name, `holdings[${index}].name`),
        symbol: optionalString(h.symbol),
        quantity: parseMoneyOptional(h.quantity, `holdings[${index}].quantity`),
        price: parseMoneyOptional(h.price, `holdings[${index}].price`),
        value: parseMoneyOptional(h.value, `holdings[${index}].value`),
        // ⚠️ TOTAL, pas unitaire — le nom du champ le dit pour empêcher la confusion en aval.
        costBasisTotal: parseMoneyOptional(h.cost_basis, `holdings[${index}].cost_basis`),
        currency: requireString(h.currency, `holdings[${index}].currency`),
        snapshotDate,
    };
}

export function decodeTransaction(raw: unknown, index: number): FintableTransaction {
    if (!isRecord(raw)) {
        throw new FintableError(`transactions[${index}] : objet attendu, reçu ${describe(raw)}.`, 'MALFORMED');
    }
    const t = raw as unknown as FtRawTransaction;
    const category = isRecord(t.category) ? optionalString((t.category as { name?: unknown }).name) : null;
    return {
        id: requireString(t.id, `transactions[${index}].id`),
        accountId: requireString(t.account_id, `transactions[${index}].account_id`),
        date: requireDate(t.date, `transactions[${index}].date`),
        // Obligatoire par contrat : une transaction sans montant lisible est une donnée cassée,
        // pas une transaction à 0 $ (elle fausserait le solde dérivé).
        amount: parseMoneyRequired(t.amount, `transactions[${index}].amount`),
        currency: requireString(t.currency, `transactions[${index}].currency`),
        // `description` peut légitimement être vide chez certaines banques → on tolère la chaîne vide.
        description: typeof t.description === 'string' ? t.description : '',
        merchant: optionalString(t.merchant),
        categoryName: category,
        updatedAt: optionalString(t.updated_at),
    };
}
